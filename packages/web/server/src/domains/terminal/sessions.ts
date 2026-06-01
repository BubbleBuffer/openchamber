import type {
  PtyProcess,
  TerminalSession,
} from "./types.js";
import {
  TERMINAL_IDLE_TIMEOUT,
  TERMINAL_WS_PATH,
} from "./types.js";
import {
  createTerminalOutputReplayBuffer,
} from "./replay-buffer.js";
import type { TerminalCapabilities } from "./types.js";

const terminalSessions = new Map<string, TerminalSession>();
let idleSweepInterval: ReturnType<typeof setInterval> | null = null;

const terminalCapabilities: TerminalCapabilities = {
  input: {
    preferred: "ws",
    transports: ["http", "ws"],
    ws: {
      path: TERMINAL_WS_PATH,
      v: 2,
      enc: "text+json-bin-control",
    },
  },
  stream: {
    preferred: "ws",
    transports: ["sse", "ws"],
    ws: {
      path: TERMINAL_WS_PATH,
      v: 2,
      enc: "text+json-bin-control",
    },
  },
};

export const getTerminalSessions = () => terminalSessions;
export const getTerminalCapabilities = () => terminalCapabilities;

export const createSession = (
  ptyProcess: PtyProcess,
  ptyBackend: string,
  cwd: string,
): { sessionId: string; session: TerminalSession } => {
  const sessionId =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);

  const session: TerminalSession = {
    ptyProcess,
    ptyBackend,
    cwd,
    lastActivity: Date.now(),
    clients: new Set(),
    outputReplayBuffer: createTerminalOutputReplayBuffer(),
  };

  terminalSessions.set(sessionId, session);
  return { sessionId, session };
};

export const getSessionCount = (): number => terminalSessions.size;

export const startIdleSweep = (): void => {
  if (idleSweepInterval) return;

  idleSweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (now - session.lastActivity > TERMINAL_IDLE_TIMEOUT) {
        console.log(`Cleaning up idle terminal session: ${sessionId}`);
        try {
          session.ptyProcess.kill();
        } catch {
          // ignore
        }
        terminalSessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000);
};

export const stopIdleSweep = (): void => {
  if (idleSweepInterval) {
    clearInterval(idleSweepInterval);
    idleSweepInterval = null;
  }
};

export const killAllSessions = (): void => {
  for (const [sessionId, session] of terminalSessions.entries()) {
    try {
      session.ptyProcess.kill();
    } catch {
      // ignore
    }
    terminalSessions.delete(sessionId);
  }
};