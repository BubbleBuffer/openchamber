import type { LifecycleRegistry } from "../shared/lifecycle.js";
import type { ServerConfig } from "../shared/types.js";
import { stopServer } from "./server.js";
import type http from "node:http";

export interface ShutdownDependencies {
  lifecycle: LifecycleRegistry;
  config: ServerConfig;
  httpServer: http.Server;
}

export function createShutdownHandler(deps: ShutdownDependencies) {
  let isShuttingDown = false;

  return {
    async gracefulShutdown(options?: { exitProcess?: boolean }): Promise<void> {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log("[server] starting graceful shutdown...");
      try { await deps.lifecycle.runShutdown(); }
      catch (err) { console.error("[server] lifecycle shutdown error:", err); }
      try { await stopServer(deps.httpServer, 10000); }
      catch (err) { console.error("[server] HTTP server close error:", err); }
      console.log("[server] shutdown complete");
      if (options?.exitProcess ?? deps.config.exitOnShutdown) { process.exit(0); }
    },

    isShuttingDown(): boolean { return isShuttingDown; },
  };
}