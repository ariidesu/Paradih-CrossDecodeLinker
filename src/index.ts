import WebSocket, { RawData } from "ws";
import fastify from "fastify";
import websocket from "@fastify/websocket";
import config from "./config";
import { randomUUID } from "crypto";
import { RoomsManager, ServerPlayer } from "./manager";
import { isClientMessage, isServerForwardMessage, ServerForwardMessage } from "./types";

const app = fastify({ logger: true });
const manager = new RoomsManager();

const connectedClients = new Set<WebSocket>();
const clientPlayers = new Map<WebSocket, Set<string>>();

app.register(websocket);
app.addHook("onClose", async () => manager.close());

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
                const message: unknown = JSON.parse(data.toString());
                if (isServerForwardMessage(message)) {
                    handleClientMessage(socket, message);
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
    if (!isClientMessage(message)) return;
    if (!playerInfo) {
        console.error("Missing playerInfo in message, client message:", JSON.stringify(clientMessage));
        clientSocket.send(JSON.stringify({ type: "linkerError", error: "Missing playerInfo" }));
        return;
    }
    const players = clientPlayers.get(clientSocket);
    const acknowledge = () => {
        if (message.nonce) {
            new ServerPlayer(clientSocket, playerInfo).sendMessage({ status: "ok", code: "OK", nonce: message.nonce });
        }
    };
    if (message.action === "heartbeat") {
        acknowledge();
        return;
    }
    const activePlayer = manager.getPlayerByIdAndSocket(playerInfo.id, clientSocket);
    if (message.action !== "startMatch" && activePlayer && activePlayer.info.connectionId !== playerInfo.connectionId) return;
    if (players) {
        players.add(playerInfo.id);
    }
    const room = manager.getRoomByPlayerId(playerInfo.id, clientSocket);
    if (!room && !["startMatch", "cancelGame", "gameIsOver"].includes(message.action)) {
        new ServerPlayer(clientSocket, playerInfo).sendMessage({ status: "failed", code: "NOT_IN_QUEUE", nonce: message.nonce ?? randomUUID() });
        return;
    }

    switch (message.action) {
        case "startMatch": {
            const player = new ServerPlayer(clientSocket, playerInfo);
            player.level = message.data.playerLevel;
            player.isHiddenInfo = message.data.isHiddenInfo;
            player.isHiddenRating = message.data.isHiddenRating;
            if (!manager.addPlayer(player)) {
                player.sendMessage({ status: "failed", code: "IN_BATTLE_ALREADY", nonce: message.nonce ?? randomUUID() });
                return;
            }
            break;
        }
        case "cancelGame": {
            manager.removePlayer(playerInfo.id, clientSocket);
            players?.delete(playerInfo.id);
            break;
        }
        case "banChart": {
            if (!room!.onPlayerSetBan(playerInfo.id, clientSocket, message)) return;
            break;
        }
        case "playerReady": {
            if (!room!.onPlayerReady(playerInfo.id, clientSocket)) return;
            break;
        }

        case "updateScore": {
            if (!room!.onPlayerUpdateScore(playerInfo.id, clientSocket, message)) return;
            break;
        }

        case "donePlaying": {
            if (!room!.onPlayerDonePlaying(playerInfo.id, clientSocket, message, playResult)) return;
            break;
        }

        case "gameIsOver": {
            manager.removePlayer(playerInfo.id, clientSocket);
            players?.delete(playerInfo.id);
            break;
        }
    }
    acknowledge();
}

app.listen({ port: config.PORT, host: config.HOST })
    .then(() => { })
    .catch((err) => {
        console.error("Error starting server:", err);
        process.exit(1);
    });
