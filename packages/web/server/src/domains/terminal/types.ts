import type { Express } from "express";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { WebSocket } from "ws";

export const TERMINAL_WS_PATH = "/api/terminal/ws" as const;
export const TERMINAL_WS_CONTROL_TAG_JSON = 0x01;
export const TERMINAL_WS_MAX_PAYLOAD_BYTES = 64 * 1024;
export const TERMINAL_OUTPUT_REPLAY_MAX_BYTES = 64 * 1024;

export const TERMINAL_HEARTBEAT_INTERVAL_MS = 15_000;
export const TERMINAL_REBIND_WINDOW_MS = 60_000;
export const TERMINAL_MAX_REBINDS_PER_WINDOW = 128;
export const MAX_TERMINAL_SESSIONS = 20;
export const TERMINAL_IDLE_TIMEOUT = 30 * 60 * 1000;

export interface TerminalControlFrame {
  t: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ReplayBufferState {
  chunks: ReplayChunk[];
  totalBytes: number;
  nextId: number;
}

export interface ReplayChunk {
  id: number;
  data: string;
  bytes: number;
}

export interface PtySpawnOptions {
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string | undefined>;
}

export interface PtyProvider {
  spawn: (command: string, args: string[], options: PtySpawnOptions & { name: string }) => PtyProcess;
  backend: string;
}

export interface PtyProcess {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(callback: (data: string) => void): { dispose: () => void };
  onExit(callback: (params: { exitCode: number; signal: number }) => void): { dispose: () => void };
  pause?: () => void;
  resume?: () => void;
}

export interface TerminalSession {
  ptyProcess: PtyProcess;
  ptyBackend: string;
  cwd: string;
  lastActivity: number;
  clients: Set<string>;
  outputReplayBuffer: ReplayBufferState;
}

export interface TerminalWsConnection {
  socket: WebSocket;
  boundSessionId: string | null;
  invalidFrames: number;
  rebindTimestamps: number[];
  replayCursorBySession: Map<string, number>;
  lastActivityAt: number;
}

export interface TerminalCapabilities {
  input: TransportCapability;
  stream: TransportCapability;
}

export interface TransportCapability {
  preferred: string;
  transports: string[];
  ws?: WsTransportInfo;
}

export interface WsTransportInfo {
  path: string;
  v: number;
  enc: string;
}

export interface TerminalDomainDependencies {
  app: Express;
  server: HttpServer;
  express: typeof import("express");
  fs: typeof import("fs");
  path: typeof import("path");
  uiAuthController: {
    enabled?: boolean;
    ensureSessionToken?: (req: IncomingMessage, _res: unknown) => Promise<string | null>;
  };
  buildAugmentedPath: () => string;
  searchPathFor: (name: string) => string | null;
  isExecutable: (path: string) => boolean;
  isRequestOriginAllowed: (req: IncomingMessage) => Promise<boolean>;
  rejectWebSocketUpgrade: (socket: import("net").Socket, code: number, message: string) => void;
  heartbeatIntervalMs?: number;
  rebindWindowMs?: number;
  maxRebindsPerWindow?: number;
}

export interface TerminalDomain {
  shutdown(): Promise<void>;
}