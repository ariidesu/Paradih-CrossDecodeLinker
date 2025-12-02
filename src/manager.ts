import { randomUUID } from "crypto";
import WebSocket from "ws";
import {
    ClientBanChartMessage,
    ClientDonePlayingMessage,
    ClientUpdateScoreMessage,
    LinkerToServerMessage,
    PlayResultData,
    PlayerInfo,
    ServerMessage,
    SongData,
    UpdateScoreData
} from "./types";
import * as fs from "fs";
import * as path from "path";

const songsPath = path.join(__dirname, "..", "data", "songs.json");
const songs: SongData[] = JSON.parse(fs.readFileSync(songsPath, "utf-8"));

export class ServerPlayer {
    public readonly id: string;
    public readonly serverSocket: WebSocket;
    public readonly info: PlayerInfo;
    public level: number;
    public lastScoreData?: UpdateScoreData;

    constructor(serverSocket: WebSocket, info: PlayerInfo) {
        this.serverSocket = serverSocket;
        this.id = info.id;
        this.info = info;
        this.level = info.level;
    }

    sendMessage(message: ServerMessage) {
        if (this.serverSocket.readyState === WebSocket.OPEN) {
            const linkerMessage: LinkerToServerMessage = {
                message,
                linker: true,
                targetPlayerId: this.id
            };
            this.serverSocket.send(JSON.stringify(linkerMessage));
        }
    }

    disconnect() {
        // We don't close the server socket, just stop sending messages to this player
        // The server will handle the player's actual disconnection
    }
}

export class Room {
    public readonly id: string;
    public players: [ServerPlayer, ServerPlayer];

    private state: "waiting" | "banning" | "ingame" | "finished" = "waiting";
    private roster: {
        trackList: string[];
        diffList: number[];
    } = {
        trackList: [],
        diffList: []
    };
    private playersBanned: [boolean, boolean] = [false, false];
    private playersReady: [boolean, boolean] = [false, false];
    private playersDisconnected: [boolean, boolean] = [false, false];
    private playersFinished: [boolean, boolean] = [false, false];
    private playersResults: [PlayResultData | undefined, PlayResultData | undefined] = [undefined, undefined];
    private playersJudgeDetails: [[number, number, number, number], [number, number, number, number]] = [[0, 0, 0, 0], [0, 0, 0, 0]];
    private bannedTrackIndexes: [number, number] = [-1, -1];

    private onDestroy: () => void;

    constructor(players: [ServerPlayer, ServerPlayer], onDestroy: () => void) {
        this.id = randomUUID();
        this.players = players;
        this.onDestroy = onDestroy;

        this.broadcast({
            status: "ok",
            action: "matchConfirm",
            data: {}
        });

        this.makeRoster();

        console.log(`Room ${this.id} created for ${players[0].info.username} (server) and ${players[1].info.username} (server)`);
        this.begin();
    }

    public getPlayerIndex(player: ServerPlayer) {
        return this.players.indexOf(player);
    }

    public getPlayerById(playerId: string): ServerPlayer | undefined {
        return this.players.find(p => p.id === playerId);
    }

    public onPlayerSetBan(playerId: string, message: ClientBanChartMessage) {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        const playerIndex = this.getPlayerIndex(player);
        if (playerIndex === -1) return;

        this.playersBanned[playerIndex] = true;
        this.bannedTrackIndexes[playerIndex] = message.data.chartIndex;
    }

    public onPlayerReady(playerId: string) {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        const playerIndex = this.getPlayerIndex(player);
        if (playerIndex === -1) return;

        this.playersReady[playerIndex] = true;
    }

    public onPlayerUpdateScore(playerId: string, message: ClientUpdateScoreMessage) {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        const playerIndex = this.getPlayerIndex(player);
        if (playerIndex === -1) return;

        player.lastScoreData = message.data;

        const oppositeIndex = 1 - playerIndex;
        this.players[oppositeIndex].sendMessage({
            status: "ok",
            action: "opponentScoreUpdate",
            data: message.data
        });
    }

    public onPlayerDonePlaying(playerId: string, message: ClientDonePlayingMessage, playResult?: PlayResultData) {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        const playerIndex = this.getPlayerIndex(player);
        if (playerIndex === -1) return;

        this.playersResults[playerIndex] = playResult;
        this.playersJudgeDetails[playerIndex] = message.data.judgeDetails;
        this.playersFinished[playerIndex] = true;
    }

    public onPlayerDisconnect(playerId: string) {
        const player = this.getPlayerById(playerId);
        if (!player) return;

        console.log(`Room ${this.id}: Player ${player.info.username} disconnected`);
        const playerIndex = this.getPlayerIndex(player);
        if (playerIndex === -1) return;

        this.playersDisconnected[playerIndex] = true;

        const oppositeIndex = 1 - playerIndex;
        if (this.state !== "finished") {
            if (!this.playersDisconnected[oppositeIndex] && (this.state === "banning" || this.state === "ingame")) {
                // Remaining player wins by forfeit
                const remainingPlayer = this.players[oppositeIndex];
                const disconnectedPlayer = this.players[playerIndex];

                remainingPlayer.sendMessage({
                    status: "ok",
                    action: "gameOver",
                    data: {
                        isWin: true,
                        beforeRating: remainingPlayer.info.battleRating,
                        ratingChanges: 0,
                        afterRating: remainingPlayer.info.battleRating,
                        opponentRating: disconnectedPlayer.info.battleRating,
                        opponentScore: {
                            score: disconnectedPlayer.lastScoreData?.score ?? 0,
                            decryptedPlus: 0,
                            decrypted: 0,
                            received: disconnectedPlayer.lastScoreData?.received ?? 0,
                            lost: disconnectedPlayer.lastScoreData?.lost ?? 0,
                            grade: "D"
                        },
                        opponentJudgeDetails: [0, 0, 0, 0]
                    }
                });
            }

            this.state = "finished";
            this.destroy();
        }
    }

    public destroy() {
        this.onDestroy();
    }

    private broadcast(message: ServerMessage) {
        this.players.forEach(p => p.sendMessage(message));
    }

    private makeRoster() {
        const availableTracks = songs.map(s => s.songId);
        const trackList = availableTracks.sort(() => 0.5 - Math.random()).slice(0, 5);

        // NOTE: Not how official did it.
        const diffList = [
            2,
            2,
            Math.random() > 0.8 ? 1 : 2,
            Math.random() > 0.6 ? 1 : 2,
            Math.random() > 0.3 ? 1 : 2,
        ];

        this.roster = { trackList, diffList };
    }

    private getGradeFromScore(score: number): "INF+" | "INF" | "AAA+" | "AAA" | "AA+" | "AA" | "A+" | "A" | "B" | "C" | "D" {
        if (score >= 1010000) return "INF+";
        if (score >= 1000000) return "INF";
        if (score >= 990000) return "AAA+";
        if (score >= 980000) return "AAA";
        if (score >= 970000) return "AA+";
        if (score >= 950000) return "AA";
        if (score >= 930000) return "A+";
        if (score >= 900000) return "A";
        if (score >= 850000) return "B";
        if (score >= 800000) return "C";
        return "D";
    }

    private begin() {
        if (this.state !== "waiting") return;

        const [player1, player2] = this.players;
        player1.sendMessage({
            status: "ok",
            action: "matchSuccess",
            data: {
                roomId: this.id,
                chartInfo: { ...this.roster, chartSpeacialEffectList: Array(this.roster.trackList.length).fill(null) },
                opponentId: player2.id,
                opponentRating: player2.info.rating,
                opponentBattleRating: player2.info.battleRating,
                opponentStyle: player2.info.style,
                opponentUsername: player2.info.username,
                opponentUsernameMask: player2.info.usernameMask,
                opponentLevel: player2.level
            }
        });
        player2.sendMessage({
            status: "ok",
            action: "matchSuccess",
            data: {
                roomId: this.id,
                chartInfo: { ...this.roster, chartSpeacialEffectList: Array(this.roster.trackList.length).fill(null) },
                opponentId: player1.id,
                opponentRating: player1.info.rating,
                opponentBattleRating: player1.info.battleRating,
                opponentStyle: player1.info.style,
                opponentUsername: player1.info.username,
                opponentUsernameMask: player1.info.usernameMask,
                opponentLevel: player1.level
            }
        });

        this.banPhase();
    }

    private async banPhase() {
        if (this.state !== "waiting") return;
        this.state = "banning";

        while (!this.playersBanned[0] || !this.playersBanned[1]) {
            if (this.playersDisconnected[0] || this.playersDisconnected[1]) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Just in case........ can be removed though?
        await new Promise(resolve => setTimeout(resolve, 300));

        const canChooseTrackIndexes = this.roster.trackList.map((_, index) => index).filter((i) => !this.bannedTrackIndexes.includes(i));
        const chosenTrackIndex = canChooseTrackIndexes[Math.floor(Math.random() * canChooseTrackIndexes.length)];
        this.broadcast({
            status: "ok",
            action: "annoFinnalChart",
            data: {
                banChartIndex: this.bannedTrackIndexes,
                trackId: this.roster.trackList[chosenTrackIndex],
                chartDiff: this.roster.diffList[chosenTrackIndex],
                chartSpeacialEffect: null
            }
        });

        while (!this.playersReady[0] || !this.playersReady[1]) {
            if (this.playersDisconnected[0] || this.playersDisconnected[1]) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.ingamePhase();
    }

    private async ingamePhase() {
        if (this.state !== "banning") return;

        this.state = "ingame";
        this.broadcast({
            status: "ok",
            action: "allPlayerReady",
            data: {}
        });

        while (!this.playersFinished[0] || !this.playersFinished[1]) {
            if (this.playersDisconnected[0] || this.playersDisconnected[1]) return;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.state = "finished";

        const [player1, player2] = this.players;
        const player1Result = this.playersResults[0];
        const player2Result = this.playersResults[1];

        const player1Score = {
            score: player1Result?.score ?? 0,
            decryptedPlus: player1Result?.stats.decrypted_plus ?? 0,
            decrypted: player1Result?.stats.decrypted ?? 0,
            received: player1Result?.stats.received ?? 0,
            lost: player1Result?.stats.lost ?? 0,
            grade: this.getGradeFromScore(player1Result?.score ?? 0),
        };
        const player2Score = {
            score: player2Result?.score ?? 0,
            decryptedPlus: player2Result?.stats.decrypted_plus ?? 0,
            decrypted: player2Result?.stats.decrypted ?? 0,
            received: player2Result?.stats.received ?? 0,
            lost: player2Result?.stats.lost ?? 0,
            grade: this.getGradeFromScore(player2Result?.score ?? 0),
        };

        let player1Win = false;
        if (player1Result && player2Result) {
            player1Win = player1Result.score > player2Result.score;
        } else {
            player1Win = player1Result != null;
        }

        // TODO: Battle rating calculation

        player1.sendMessage({
            status: "ok",
            action: "gameOver",
            data: {
                isWin: player1Win,
                beforeRating: player1.info.battleRating,
                ratingChanges: 0,
                afterRating: player1.info.battleRating,
                opponentRating: player2.info.battleRating,
                opponentScore: player2Score,
                opponentJudgeDetails: this.playersJudgeDetails[1]
            }
        });
        player2.sendMessage({
            status: "ok",
            action: "gameOver",
            data: {
                isWin: !player1Win,
                beforeRating: player2.info.battleRating,
                ratingChanges: 0,
                afterRating: player2.info.battleRating,
                opponentRating: player1.info.battleRating,
                opponentScore: player1Score,
                opponentJudgeDetails: this.playersJudgeDetails[0]
            }
        });

        this.destroy();
    }
}

export class RoomsManager {
    private waitingQueue: ServerPlayer[] = [];
    private rooms = new Map<string, Room>();
    private playerToRoomMap = new Map<ServerPlayer, string>();

    public addPlayer(player: ServerPlayer) {
        if (this.getPlayerByIdAndSocket(player.id, player.serverSocket) || this.waitingQueue.some(p => p.id === player.id && p.serverSocket === player.serverSocket)) {
            return;
        }

        console.log(`${player.info.username} added to queue`);
        this.waitingQueue.push(player);
        this.createRoom();
    }

    private getPlayerByIdAndSocket(playerId: string, serverSocket: WebSocket): ServerPlayer | undefined {
        for (const [player, _] of this.playerToRoomMap) {
            if (player.id === playerId && player.serverSocket === serverSocket) {
                return player;
            }
        }
        return undefined;
    }

    private createRoom() {
        if (this.waitingQueue.length >= 2) {
            const [player1, player2] = this.waitingQueue.splice(0, 2);
            const room = new Room([player1, player2], () => {
                // Cleanup callback
                room.players.forEach(p => this.playerToRoomMap.delete(p));
                this.rooms.delete(room.id);
            });

            this.rooms.set(room.id, room);
            this.playerToRoomMap.set(player1, room.id);
            this.playerToRoomMap.set(player2, room.id);
        }
    }

    public getRoomByPlayerId(playerId: string, serverSocket: WebSocket): Room | undefined {
        const player = this.getPlayerByIdAndSocket(playerId, serverSocket);
        if (!player) return undefined;
        const roomId = this.playerToRoomMap.get(player);
        return roomId ? this.rooms.get(roomId) : undefined;
    }

    public removeFromQueue(playerId: string, serverSocket: WebSocket) {
        const queueIndex = this.waitingQueue.findIndex(p => p.id === playerId && p.serverSocket === serverSocket);
        if (queueIndex !== -1) {
            const player = this.waitingQueue[queueIndex];
            this.waitingQueue.splice(queueIndex, 1);
            console.log(`${player.info.username} removed from queue`);
        }
    }

    public removePlayer(playerId: string, serverSocket: WebSocket) {
        this.removeFromQueue(playerId, serverSocket);

        const room = this.getRoomByPlayerId(playerId, serverSocket);
        if (room) {
            room.onPlayerDisconnect(playerId);
        }
    }

    public onServerDisconnect(serverSocket: WebSocket) {
        console.log("Server disconnected, forfeiting all players from that server");

        const playersToRemove = this.waitingQueue.filter(p => p.serverSocket === serverSocket);
        playersToRemove.forEach(p => this.removeFromQueue(p.id, serverSocket));

        for (const room of this.rooms.values()) {
            for (const player of room.players) {
                if (player.serverSocket === serverSocket) {
                    room.onPlayerDisconnect(player.id);
                }
            }
        }
    }
}
