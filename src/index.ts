import WebSocket, { RawData } from "ws";
import fastify from "fastify";
import config from "./config";
import { RoomsManager, ServerPlayer } from "./manager";
import {
    ClientBanChartMessage,
    ClientDonePlayingMessage,
    ClientUpdateScoreMessage,
    PlayResultData,
    ServerForwardMessage
} from "./types";

const app = fastify({ logger: true });
const manager = new RoomsManager();

const connectedServers = new Map<string, WebSocket>();
const socketToUrl = new Map<WebSocket, string>();
const serverPlayers = new Map<WebSocket, Set<string>>();

app.post("/", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return reply.status(401).send({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7);
    if (token !== config.LINKER_TOKEN) {
        return reply.status(401).send({ error: "Invalid token" });
    }

    const { battleSocketUrl } = request.body as { battleSocketUrl?: string };
    if (!battleSocketUrl) {
        return reply.status(400).send({ error: "Missing battleSocketUrl" });
    }

    if (connectedServers.has(battleSocketUrl)) {
        return reply.status(200).send({ status: "ok" });
    }

    connectToServer(battleSocketUrl);
    return reply.status(200).send({ status: "ok" });
});

function connectToServer(battleSocketUrl: string) {
    console.log(`Connecting to ${battleSocketUrl}`);

    const socket = new WebSocket(battleSocketUrl);

    socket.on("open", () => {
        console.log(`Connected to ${battleSocketUrl}`);
        socket.send(JSON.stringify({
            linker: true,
            action: "identify",
            token: config.LINKER_TOKEN
        }));
    });

    socket.on("message", (data: RawData) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.status === "ok" && message.action === "identified") {
                connectedServers.set(battleSocketUrl, socket);
                socketToUrl.set(socket, battleSocketUrl);
                serverPlayers.set(socket, new Set());
                console.log(`Authenticated with ${battleSocketUrl}`);
                return;
            }
            if (message.linker && message.playerId) {
                handleServerMessage(socket, message as ServerForwardMessage);
            }
        } catch (error) {
            console.error("Error parsing message:", error);
        }
    });

    socket.on("close", () => {
        console.log(`Disconnected from ${battleSocketUrl}`);
        manager.onServerDisconnect(socket);
        
        connectedServers.delete(battleSocketUrl);
        serverPlayers.delete(socket);

        // Reconnect after 1 second
        setTimeout(() => {
            if (!connectedServers.has(battleSocketUrl)) {
                connectToServer(battleSocketUrl);
            }
        }, 1000);
    });

    socket.on("error", (error: Error) => {
        console.error(`WebSocket error for ${battleSocketUrl}:`, error.message);
    });

    socket.on("ping", () => {
        socket.pong();
    });
}

function handleServerMessage(serverSocket: WebSocket, message: ServerForwardMessage) {
    const { playerId, action, playerInfo, playResult, data } = message;
    const players = serverPlayers.get(serverSocket);
    if (players) {
        players.add(playerId);
    }
    const room = manager.getRoomByPlayerId(playerId);
    if (!room && !["startMatch", "cancelGame"].includes(action)) {
        return;
    }

    switch (action) {
        case "startMatch": {
            if (!playerInfo) {
                console.error(`startMatch without playerInfo for ${playerId}`);
                return;
            }
            const player = new ServerPlayer(serverSocket, playerInfo);
            player.level = data.playerLevel;
            manager.addPlayer(player);
            break;
        }
        case "cancelGame": {
            manager.removePlayer(playerId);
            players?.delete(playerId);
            break;
        }
        case "banChart": {
            room!.onPlayerSetBan(playerId, { action: "banChart", data, timestamp: message.timestamp } as ClientBanChartMessage);
            break;
        }
        case "playerReady": {
            room!.onPlayerReady(playerId);
            break;
        }

        case "updateScore": {
            room!.onPlayerUpdateScore(playerId, { action: "updateScore", data, timestamp: message.timestamp } as ClientUpdateScoreMessage);
            break;
        }

        case "donePlaying": {
            room!.onPlayerDonePlaying(
                playerId,
                { action: "donePlaying", data, timestamp: message.timestamp } as ClientDonePlayingMessage,
                playResult as PlayResultData | undefined
            );
            break;
        }

        case "gameIsOver": {
            manager.removePlayer(playerId);
            players?.delete(playerId);
            break;
        }
    }
}

app.listen({ port: config.PORT, host: "0.0.0.0" })
    .then(() => { })
    .catch((err) => {
        console.error("Error starting server:", err);
        process.exit(1);
    });