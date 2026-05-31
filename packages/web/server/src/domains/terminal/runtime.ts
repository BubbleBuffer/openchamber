import type { TerminalDomain, TerminalDomainDependencies } from "./types.js";
import { createTerminalWsServer } from "./ws-server.js";
import { registerTerminalRoutes } from "./routes.js";
import { getTerminalSessions, startIdleSweep, stopIdleSweep } from "./sessions.js";

export const createTerminalRuntime = (
  deps: TerminalDomainDependencies,
): TerminalDomain => {
  const { app, server: httpServer, express } = deps;

  const wsServer = createTerminalWsServer(httpServer, deps);
  registerTerminalRoutes(app, express, deps, wsServer);
  startIdleSweep();

  return {
    async shutdown() {
      stopIdleSweep();

      const sessions = getTerminalSessions();
      for (const [sessionId, session] of sessions.entries()) {
        try {
          session.ptyProcess.kill();
        } catch {
          // ignore
        }
        sessions.delete(sessionId);
      }

      await wsServer.shutdown();
    },
  };
};
