import type { Express } from "express";
import type { Server as HttpServer } from "http";
import type { LifecycleRegistry } from "./lifecycle.js";
import type { EventBus } from "../domains/core/event-bus.js";

export interface ServerConfig {
  port: number;
  host: string;
  uiPassword: string | null;
  attachSignals: boolean;
  exitOnShutdown: boolean;
  openchamberDataDir: string;
  settingsFilePath: string;
  pushSubscriptionsFilePath: string;
  onDesktopNotification: ((payload: unknown) => void) | null;
  openchamberVersion: string;
  isDesktopNotifyEnabled: boolean;
}

export interface WebUiServerController {
  expressApp: Express;
  httpServer: HttpServer;
  getPort: () => number | null;
  getOpenCodePort: () => number | null;
  isReady: () => boolean;
  restartOpenCode: () => Promise<void>;
  stop: (options?: { exitProcess?: boolean }) => Promise<void>;
}

export interface ServerRuntime {
  app: Express;
  httpServer: HttpServer;
  config: ServerConfig;
  lifecycle: LifecycleRegistry;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  domains: {
    terminal?: any;
    eventStream?: any;
    sessions?: any;
    opencode?: any;
    core?: { eventBus?: any };
    settings?: any;
    serverUtils?: any;
    bootstrap?: any;
    routes?: any;
    opencodeSupport?: any;
    auth?: any;
    notifications?: any;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface StartWebUiServerOptions {
  port?: number;
  host?: string;
  attachSignals?: boolean;
  exitOnShutdown?: boolean;
  uiPassword?: string | null;
  onDesktopNotification?: (payload: unknown) => void;
}

export interface HealthSnapshot {
  openCodePort: number | null;
  openCodeRunning: boolean;
  openCodeSecureConnection: boolean;
  openCodeAuthSource: string | null;
  isOpenCodeReady: boolean;
  lastOpenCodeError: string | null;
  desktopNotifyEnabled: boolean;
}

export const DEFAULT_PORT = 3000;
export const HEALTH_CHECK_INTERVAL_MS = 15000;
export const SHUTDOWN_TIMEOUT_MS = 10000;
export const OPEN_CODE_READY_GRACE_MS = 12000;

export const SSE_PATH_PREFIXES = [
  "/api/event",
  "/api/global/event",
  "/api/notifications/stream",
  "/api/openchamber/events",
] as const;

export const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15_000;
export const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 60_000;
export const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 128;