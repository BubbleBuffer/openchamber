import http from "node:http";
import type { Server as HttpServer } from "node:http";
import type { Express } from "express";
import type { ServerConfig } from "../shared/types.js";

export interface ServerInstance {
  httpServer: HttpServer;
  activePort: number;
}

export function createHttpServer(app: Express): HttpServer {
  return http.createServer(app);
}

export function startListening(
  httpServer: HttpServer,
  config: ServerConfig,
): Promise<ServerInstance> {
  return new Promise((resolve, reject) => {
    const { port, host } = config;
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
    httpServer.listen(port, host, () => {
      const address = httpServer.address();
      const activePort = typeof address === "object" && address ? address.port : port;
      console.log(`[server] listening on http://${host}:${activePort}`);
      console.log(`[server] health check: http://${host}:${activePort}/health`);
      resolve({ httpServer, activePort });
    });
  });
}

export function stopServer(httpServer: HttpServer, timeoutMs: number = 10000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn("[server] force-closing HTTP server after timeout");
      resolve();
    }, timeoutMs);
    httpServer.close(() => { clearTimeout(timer); resolve(); });
  });
}
