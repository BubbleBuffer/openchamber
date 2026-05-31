import type { Express } from "express";
import type { Server as HttpServer } from "node:http";
import type { ServerConfig, ServerRuntime } from "../shared/types.js";
import type { LifecycleRegistry } from "../shared/lifecycle.js";
import { createLifecycleRegistry } from "../shared/lifecycle.js";
import { createExpressApp } from "../app/create-app.js";
import { createHttpServer } from "./server.js";

export interface RuntimeDependencies {
  config: ServerConfig;
  lifecycle: LifecycleRegistry;
}

export function createRuntimeDependencies(config: ServerConfig): RuntimeDependencies {
  const lifecycle = createLifecycleRegistry();
  return { config, lifecycle };
}

export function createServerRuntime(
  config: ServerConfig,
  lifecycle: LifecycleRegistry,
): { app: Express; httpServer: HttpServer; runtime: Omit<ServerRuntime, "domains"> } {
  const app = createExpressApp();
  const httpServer = createHttpServer(app);
  return { app, httpServer, runtime: { app, httpServer, config, lifecycle } };
}