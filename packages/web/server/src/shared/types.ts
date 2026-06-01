import type { Express } from "express";
import type { Server as HttpServer } from "http";
import type { LifecycleRegistry } from "./lifecycle.js";

export interface ServerConfig {
  port: number;
  host: string;
  uiPassword: string | null;
  attachSignals: boolean;
  exitOnShutdown: boolean;
  openchamberDataDir: string;
  settingsFilePath: string;
  pushSubscriptionsFilePath: string;
  tunnelConfigPath: string | null;
  runtimeManagedRemoteTunnelHostname: string | null;
  runtimeManagedRemoteTunnelToken: string | null;
  tryCfTunnel: boolean;
  tunnelMode: string | null;
  tunnelProvider: string | null;
  tunnelToken: string | null;
  tunnelHostname: string | null;
  onTunnelReady: ((url: string, connectUrl: string) => void) | null;
  onDesktopNotification: ((payload: unknown) => void) | null;
  openchamberVersion: string;
  isDesktopNotifyEnabled: boolean;
}

export interface WebUiServerController {
  expressApp: Express;
  httpServer: HttpServer;
  getPort: () => number | null;
  getOpenCodePort: () => number | null;
  getTunnelUrl: () => string | null;
  isReady: () => boolean;
  restartOpenCode: () => Promise<void>;
  stop: (options?: { exitProcess?: boolean }) => Promise<void>;
}

export interface ServerRuntime {
  app: Express;
  httpServer: HttpServer;
  config: ServerConfig;
  lifecycle: LifecycleRegistry;
  domains: {
    terminal?: any;
    eventStream?: any;
    sessions?: any;
    opencode?: any;
  };
}

export interface StartWebUiServerOptions {
  port?: number;
  host?: string;
  attachSignals?: boolean;
  exitOnShutdown?: boolean;
  uiPassword?: string | null;
  tryCfTunnel?: boolean;
  tunnelMode?: string;
  tunnelProvider?: string;
  tunnelConfigPath?: string | null;
  tunnelToken?: string;
  tunnelHostname?: string;
  onTunnelReady?: (url: string, connectUrl: string) => void;
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