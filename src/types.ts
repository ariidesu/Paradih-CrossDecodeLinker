export type BaseMessage = {
    action: string;
    nonce?: string;
}

export type UpdateScoreData = {
    score: number;
    totalNote: number;
    near: number;
    received: number;
    lost: number;
    hasMiss: boolean;
};

export interface PlayResultData {
    roomId: string;
    roundStartedAt: string;
    chartId: string;
    createdAt: string;
    score: number;
    grade: number;
    combo: number;
    maxCombo: number;
    stats: {
        decrypted_plus: number;
        decrypted: number;
        received: number;
        lost: number;
    };
}

export interface PlayerInfo {
    id: string;
    connectionId: string;
    username: string;
    usernameMask: string;
    level: number;
    rating: number;
    battleRating: number;
    isPrdOnline: boolean;
    style: { skin: string; bg: string; title: string };
}

export type ServerForwardMessage = {
    linker: true;
    message: ClientMessage;
    playerInfo: PlayerInfo;
    playResult?: PlayResultData;
};

export type ClientBaseMessage = BaseMessage & { timestamp: number }

export type ClientHeartbeatMessage = ClientBaseMessage & {
    action: "heartbeat";
    data: {}
}

export type ClientStartMatchMessage = ClientBaseMessage & {
    action: "startMatch";
    data: {
        isHiddenInfo: boolean;
        isHiddenRating: boolean;
        playerLevel: number;
    }
}

export type ClientCancelGameMessage = ClientBaseMessage & {
    action: "cancelGame";
    data: {}
}

export type ClientBanChartMessage = ClientBaseMessage & {
    action: "banChart";
    data: {
        chartIndex: number;
    }
}

export type ClientReadyMessage = ClientBaseMessage & {
    action: "playerReady";
    data: {}
}

export type ClientUpdateScoreMessage = ClientBaseMessage & {
    action: "updateScore";
    data: UpdateScoreData;
}

export type ClientDonePlayingMessage = ClientBaseMessage & {
    action: "donePlaying";
    data: {
        resultId: string;
        judgeDetails: [number, number, number, number];
    }
}

export type ClientGameOverMessage = ClientBaseMessage & {
    action: "gameIsOver";
    data: {}
}

export type ClientMessage = ClientHeartbeatMessage | ClientStartMatchMessage | ClientCancelGameMessage | ClientBanChartMessage | ClientReadyMessage | ClientUpdateScoreMessage | ClientDonePlayingMessage | ClientGameOverMessage;

export function isClientMessage(value: unknown): value is ClientMessage {
    if (typeof value !== "object" || value === null) return false;
    const message = value as Record<string, unknown>;
    if (!Number.isSafeInteger(message.timestamp) ||
        (message.nonce !== undefined && (typeof message.nonce !== "string" || message.nonce.length === 0)) ||
        typeof message.data !== "object" || message.data === null || Array.isArray(message.data)) return false;
    const data = message.data as Record<string, unknown>;
    const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x7fffffff;
    switch (message.action) {
        case "heartbeat":
        case "cancelGame":
        case "gameIsOver":
        case "playerReady":
            return true;
        case "startMatch":
            return count(data.playerLevel) && typeof data.isHiddenInfo === "boolean" && typeof data.isHiddenRating === "boolean";
        case "banChart":
            return typeof data.chartIndex === "number" && Number.isInteger(data.chartIndex) && data.chartIndex >= -1;
        case "updateScore":
            return ["score", "totalNote", "near", "received", "lost"].every(key => count(data[key])) && typeof data.hasMiss === "boolean";
        case "donePlaying":
            return typeof data.resultId === "string" && data.resultId.length > 0 &&
                Array.isArray(data.judgeDetails) && data.judgeDetails.length === 4 && data.judgeDetails.every(count);
        default:
            return false;
    }
}

export function isServerForwardMessage(value: unknown): value is ServerForwardMessage {
    if (typeof value !== "object" || value === null) return false;
    const envelope = value as Record<string, unknown>;
    if (envelope.linker !== true || !isClientMessage(envelope.message) ||
        typeof envelope.playerInfo !== "object" || envelope.playerInfo === null) return false;
    const player = envelope.playerInfo as Record<string, unknown>;
    if (!["id", "connectionId", "username", "usernameMask"].every(key => typeof player[key] === "string") ||
        !player.id || !player.connectionId ||
        !["level", "rating", "battleRating"].every(key => typeof player[key] === "number" && Number.isFinite(player[key])) ||
        typeof player.isPrdOnline !== "boolean" || typeof player.style !== "object" || player.style === null) return false;
    const style = player.style as Record<string, unknown>;
    if (!["skin", "bg", "title"].every(key => typeof style[key] === "string")) return false;
    if (envelope.playResult === undefined) return true;
    if (typeof envelope.playResult !== "object" || envelope.playResult === null) return false;
    const result = envelope.playResult as Record<string, unknown>;
    const count = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x7fffffff;
    if (!["roomId", "chartId", "createdAt", "roundStartedAt"].every(key => typeof result[key] === "string") ||
        !["score", "grade", "combo", "maxCombo"].every(key => count(result[key])) ||
        typeof result.stats !== "object" || result.stats === null) return false;
    const stats = result.stats as Record<string, unknown>;
    return ["decrypted_plus", "decrypted", "received", "lost"].every(key => count(stats[key]));
}

export type LinkerToServerMessage = {
    linker: true;
    targetPlayerId: string;
    targetConnectionId: string;
    message: ServerMessage;
}

export type ServerBaseMessage = BaseMessage & { status: "ok" | "fail" }

export type ServerMatchConfirmMessage = ServerBaseMessage & {
    status: "ok";
    action: "matchConfirm";
    data: {}
}

export type ServerMatchSuccessMessage = ServerBaseMessage & {
    status: "ok";
    action: "matchSuccess";
    data: {
        roomId: string;
        chartInfo: {
            trackList: string[];
            diffList: number[];
            chartSpeacialEffectList: (number | null)[];
        };

        opponentId: string;
        opponentRating: number;
        opponentBattleRating: number;
        opponentStyle: {
            skin: string;
            bg: string;
            title: string;
        };
        opponentUsername: string;
        opponentUsernameMask: string;
        opponentLevel: number;
        opponentIsPrdOnline: boolean;
    };
}

export type ServerAnnounceFinalMessage = ServerBaseMessage & {
    status: "ok";
    action: "annoFinnalChart";
    data: {
        banChartIndex: number[];
        trackId: string;
        chartDiff: number;
        chartSpeacialEffect: number | null;
    };
}

export type ServerAllPlayerReadyMessage = ServerBaseMessage & {
    status: "ok";
    action: "allPlayerReady";
    data: {}
}

export type ServerOpponentScoreUpdateMessage = ServerBaseMessage & {
    status: "ok";
    action: "opponentScoreUpdate";
    data: UpdateScoreData;
}

export type ServerGameOverMessage = ServerBaseMessage & {
    status: "ok";
    action: "gameOver";
    data: {
        isWin: boolean | null;
        beforeRating: number;
        ratingChanges: number;
        afterRating: number;

        opponentRating: number;
        opponentScore: {
            score: number;
            decryptedPlus: number;
            decrypted: number;
            received: number;
            lost: number;
            grade: "INF+" | "INF" | "AAA+" | "AAA" | "AA+" | "AA" | "A+" | "A" | "B" | "C" | "D";
        };
        opponentJudgeDetails: [number, number, number, number];
    };
}

export type ServerAcknowledgementMessage = {
    action?: never;
    status: "ok";
    code: "OK";
    nonce: string;
};

export type ServerQueueErrorMessage = {
    action?: never;
    status: "failed";
    code: "IN_BATTLE_ALREADY" | "NOT_IN_QUEUE";
    nonce: string;
};

export type ServerCancelMatchMessage = ServerBaseMessage & {
    status: "ok";
    action: "cancelMatch";
    data: { reason: "OPPONENT_CANCEL" | "SONG_NOT_ENOUGH" };
};

export type ServerOpponentOfflineMessage = ServerBaseMessage & {
    status: "ok";
    action: "opponentOffline";
    data: { reason: string };
};

export type ServerMessage = ServerMatchConfirmMessage | ServerMatchSuccessMessage | ServerAnnounceFinalMessage | ServerAllPlayerReadyMessage | ServerOpponentScoreUpdateMessage | ServerGameOverMessage | ServerAcknowledgementMessage | ServerQueueErrorMessage | ServerCancelMatchMessage | ServerOpponentOfflineMessage;

export interface SongData {
    songId: string;
    title: string;
    bpm: string;
    genre: string;
    composer: string;
    illustrator: string;
    version: {
        x: number;
        y: number;
        z: number;
    };
    charts: {
        detected?: number;
        invaded?: number;
        massive?: number;
        reboot?: number;
    };
}
