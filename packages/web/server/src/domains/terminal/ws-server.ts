import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import type {
  TerminalWsConnection,
  TerminalSession,
  TerminalDomainDependencies,
} from "./types.js";
import {
  TERMINAL_WS_MAX_PAYLOAD_BYTES,
  TERMINAL_WS_PATH as WS_PATH,
  TERMINAL_HEARTBEAT_INTERVAL_MS,
  TERMINAL_REBIND_WINDOW_MS,
  TERMINAL_MAX_REBINDS_PER_WINDOW,
} from "./types.js";
import {
  parseRequestPathname,
  readTerminalWsControlFrame,
  createTerminalWsControlFrame,
  normalizeTerminalWsMessageToText,
  pruneRebindTimestamps,
  isRebindRateLimited,
} from "./protocol.js";
import {
  getTerminalSessions,
} from "./sessions.js";
import {
  listTerminalOutputReplayChunksSince,
  appendTerminalOutputReplayChunk,
} from "./replay-buffer.js";

export const createTerminalWsServer = (
  httpServer: HttpServer,
  deps: TerminalDomainDependencies,
) => {
  const {
    uiAuthController,
    isRequestOriginAllowed,
    rejectWebSocketUpgrade,
  } = deps;

  const heartbeatIntervalMs =
    deps.heartbeatIntervalMs ?? TERMINAL_HEARTBEAT_INTERVAL_MS;
  const rebindWindowMs =
    deps.rebindWindowMs ?? TERMINAL_REBIND_WINDOW_MS;
  const maxRebindsPerWindow =
    deps.maxRebindsPerWindow ?? TERMINAL_MAX_REBINDS_PER_WINDOW;

  const terminalWsConnections = new Set<TerminalWsConnection>();
  let terminalInputWsServer: WebSocketServer | null = new WebSocketServer({
    noServer: true,
    maxPayload: TERMINAL_WS_MAX_PAYLOAD_BYTES,
  });

  const sendControl = (socket: WebSocket, payload: Record<string, unknown>): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(createTerminalWsControlFrame(payload as Parameters<typeof createTerminalWsControlFrame>[0]), { binary: true });
    } catch {
      // ignore
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isBunRuntime = typeof (globalThis as any).Bun !== "undefined";
  const terminalRuntimeName = isBunRuntime ? "bun" : "node";

  terminalInputWsServer.on("connection", (socket: WebSocket) => {
    const connectionState: TerminalWsConnection = {
      socket,
      boundSessionId: null,
      invalidFrames: 0,
      rebindTimestamps: [],
      replayCursorBySession: new Map(),
      lastActivityAt: Date.now(),
    };

    terminalWsConnections.add(connectionState);

    sendControl(socket, { t: "ok", v: 2 });

    const heartbeatInterval = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        socket.ping();
      } catch {
        // ignore
      }
    }, heartbeatIntervalMs);

    socket.on("pong", () => {
      connectionState.lastActivityAt = Date.now();
    });

    socket.on("message", (message: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      connectionState.lastActivityAt = Date.now();

      if (isBinary) {
        const controlMessage = readTerminalWsControlFrame(message);
        if (!controlMessage || typeof controlMessage.t !== "string") {
          connectionState.invalidFrames += 1;
          sendControl(socket, {
            t: "e",
            c: "BAD_FRAME",
            f: connectionState.invalidFrames >= 10,
          });
          if (connectionState.invalidFrames >= 10) {
            socket.close(1008, "protocol violation");
          }
          return;
        }

        if (controlMessage.t === "p") {
          sendControl(socket, { t: "po", v: 2 });
          return;
        }

        if (controlMessage.t !== "b" || typeof controlMessage.s !== "string") {
          connectionState.invalidFrames += 1;
          sendControl(socket, {
            t: "e",
            c: "BAD_FRAME",
            f: connectionState.invalidFrames >= 10,
          });
          if (connectionState.invalidFrames >= 10) {
            socket.close(1008, "protocol violation");
          }
          return;
        }

        const now = Date.now();
        connectionState.rebindTimestamps = pruneRebindTimestamps(
          connectionState.rebindTimestamps,
          now,
          rebindWindowMs,
        );

        if (
          isRebindRateLimited(
            connectionState.rebindTimestamps,
            maxRebindsPerWindow,
          )
        ) {
          sendControl(socket, { t: "e", c: "RATE_LIMIT", f: false });
          return;
        }

        const nextSessionId = controlMessage.s.trim() as string;
        const sessions = getTerminalSessions();
        const targetSession = sessions.get(nextSessionId);
        if (!targetSession) {
          connectionState.boundSessionId = null;
          sendControl(socket, {
            t: "e",
            c: "SESSION_NOT_FOUND",
            f: false,
          });
          return;
        }

        const replaySinceRaw =
          typeof controlMessage.r === "number" &&
          Number.isFinite(controlMessage.r)
            ? Math.max(0, Math.trunc(controlMessage.r))
            : 0;
        const rememberedReplayCursor =
          connectionState.replayCursorBySession.get(nextSessionId) ?? 0;
        const replaySince = Math.max(replaySinceRaw, rememberedReplayCursor);

        connectionState.rebindTimestamps.push(now);
        connectionState.boundSessionId = nextSessionId;
        sendControl(socket, {
          t: "bok",
          v: 2,
          s: nextSessionId,
          runtime: terminalRuntimeName,
          ptyBackend: targetSession.ptyBackend || "unknown",
        });

        const replayChunks = listTerminalOutputReplayChunksSince(
          targetSession.outputReplayBuffer,
          replaySince,
        );
        for (const replayChunk of replayChunks) {
          try {
            socket.send(replayChunk.data);
            connectionState.replayCursorBySession.set(
              nextSessionId,
              replayChunk.id,
            );
          } catch {
            break;
          }
        }
        return;
      }

      const payload = normalizeTerminalWsMessageToText(message);
      if (payload.length === 0) {
        return;
      }

      if (!connectionState.boundSessionId) {
        sendControl(socket, { t: "e", c: "NOT_BOUND", f: false });
        return;
      }

      const sessions = getTerminalSessions();
      const session = sessions.get(connectionState.boundSessionId);
      if (!session) {
        connectionState.boundSessionId = null;
        sendControl(socket, {
          t: "e",
          c: "SESSION_NOT_FOUND",
          f: false,
        });
        return;
      }

      try {
        session.ptyProcess.write(payload);
        session.lastActivity = Date.now();
      } catch {
        sendControl(socket, { t: "e", c: "WRITE_FAIL", f: false });
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeatInterval);
      connectionState.boundSessionId = null;
      terminalWsConnections.delete(connectionState);
    });

    socket.on("error", () => {
      // noop — log-level noise, socket.close handles cleanup
    });
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: import("net").Socket, head: Buffer) => {
    const pathname = parseRequestPathname(req.url);
    if (pathname !== WS_PATH) {
      return;
    }

    const handleUpgrade = async () => {
      try {
        if (uiAuthController?.enabled) {
          const sessionToken =
            await uiAuthController?.ensureSessionToken?.(req, null);
          if (!sessionToken) {
            rejectWebSocketUpgrade(socket, 401, "UI authentication required");
            return;
          }

          const originAllowed = await isRequestOriginAllowed(req);
          if (!originAllowed) {
            rejectWebSocketUpgrade(socket, 403, "Invalid origin");
            return;
          }
        }

        if (!terminalInputWsServer) {
          rejectWebSocketUpgrade(socket, 500, "Terminal WebSocket unavailable");
          return;
        }

        terminalInputWsServer.handleUpgrade(req, socket, head, (ws) => {
          terminalInputWsServer?.emit("connection", ws, req);
        });
      } catch {
        rejectWebSocketUpgrade(socket, 500, "Upgrade failed");
      }
    };

    void handleUpgrade();
  });

  return {
    wsServer: terminalInputWsServer,

    broadcastOutput: (sessionId: string, session: TerminalSession, data: string): void => {
      session.lastActivity = Date.now();
      const replayChunk = appendTerminalOutputReplayChunk(
        session.outputReplayBuffer,
        data,
        64 * 1024,
      );

      for (const wsConnection of terminalWsConnections) {
        if (wsConnection.boundSessionId !== sessionId) {
          continue;
        }
        if (
          !wsConnection.socket ||
          wsConnection.socket.readyState !== WebSocket.OPEN
        ) {
          continue;
        }
        try {
          wsConnection.socket.send(data);
          if (replayChunk) {
            wsConnection.replayCursorBySession.set(
              sessionId,
              replayChunk.id,
            );
          }
        } catch {
          // ignore
        }
      }
    },

    broadcastExit: (
      sessionId: string,
      exitCode: number,
      signal: number,
    ): void => {
      const sessions = getTerminalSessions();
      for (const wsConnection of terminalWsConnections) {
        if (wsConnection.boundSessionId !== sessionId) {
          continue;
        }
        wsConnection.boundSessionId = null;
        wsConnection.replayCursorBySession.delete(sessionId);
        sendControl(wsConnection.socket, {
          t: "x",
          v: 2,
          s: sessionId,
          exitCode,
          signal,
        });
      }
      sessions.delete(sessionId);
    },

    async shutdown(): Promise<void> {
      if (!terminalInputWsServer) {
        return;
      }

      try {
        for (const client of terminalInputWsServer.clients) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
        }

        await new Promise<void>((resolve) => {
          terminalInputWsServer?.close(() => resolve());
        });
      } catch {
        // ignore
      } finally {
        terminalWsConnections.clear();
        terminalInputWsServer = null;
      }
    },
  };
};
