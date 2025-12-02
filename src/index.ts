import WebSocket, { RawData } from "ws";
import fastify from "fastify";
import websocket from "@fastify/websocket";
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

const connectedClients = new Set<WebSocket>();
const clientPlayers = new Map<WebSocket, Set<string>>();

app.register(websocket);

app.register(async function (fastify) {
    fastify.get("/", { websocket: true }, (socket, req) => {
        const authToken = req.headers["auth-token"];

        if (!authToken || authToken != config.LINKER_TOKEN) {
            socket.close(1008);
            return;
        }

        console.log("New client connected");
        connectedClients.add(socket);
        clientPlayers.set(socket, new Set());

        socket.on("message", (data: RawData) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.linker) {
                    handleClientMessage(socket, message as ServerForwardMessage);
                }
            } catch (error) {
                console.error("Error parsing message:", error);
            }
        });

        socket.on("close", () => {
            console.log("Client disconnected");
            manager.onServerDisconnect(socket);
            connectedClients.delete(socket);
            clientPlayers.delete(socket);
        });

        socket.on("error", (error: Error) => {
            console.error("WebSocket error:", error.message);
        });
    });
});

function handleClientMessage(clientSocket: WebSocket, clientMessage: ServerForwardMessage) {
    const { playerInfo, playResult, message } = clientMessage;
    const players = clientPlayers.get(clientSocket);
    if (players) {
        players.add(playerInfo.id);
    }
    const room = manager.getRoomByPlayerId(playerInfo.id, clientSocket);
    if (!room && !["startMatch", "cancelGame"].includes(message.action)) {
        clientSocket.send(JSON.stringify({ type: "linkerError", error: "Player is not in a room" }));
        return;
    }
    if (!playerInfo) {
        clientSocket.send(JSON.stringify({ type: "linkerError", error: "Missing playerInfo" }));
        return;
    }

    switch (message.action) {
        case "startMatch": {
            const player = new ServerPlayer(clientSocket, playerInfo);
            player.level = message.data.playerLevel;
            manager.addPlayer(player);
            break;
        }
        case "cancelGame": {
            manager.removePlayer(playerInfo.id, clientSocket);
            players?.delete(playerInfo.id);
            break;
        }
        case "banChart": {
            room!.onPlayerSetBan(playerInfo.id, message);
            break;
        }
        case "playerReady": {
            room!.onPlayerReady(playerInfo.id);
            break;
        }

        case "updateScore": {
            room!.onPlayerUpdateScore(playerInfo.id, message);
            break;
        }

        case "donePlaying": {
            room!.onPlayerDonePlaying(playerInfo.id, message, playResult);
            break;
        }

        case "gameIsOver": {
            manager.removePlayer(playerInfo.id, clientSocket);
            players?.delete(playerInfo.id);
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