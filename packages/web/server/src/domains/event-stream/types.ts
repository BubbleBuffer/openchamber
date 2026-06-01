import type { WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";

export const MESSAGE_STREAM_GLOBAL_WS_PATH = "/api/global/event/ws" as const;
export const MESSAGE_STREAM_DIRECTORY_WS_PATH = "/api/event/ws" as const;
export const MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS = 15_000;
export const MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
export const MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT = 512;
export const DEFAULT_UPSTREAM_STALL_TIMEOUT_MS = 20_000;
export const DEFAULT_UPSTREAM_RECONNECT_DELAY_MS = 250;

export interface SseEventEnvelope {
  eventId: string | null;
  directory: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

export interface NormalizedEvent {
  envelope: SseEventEnvelope;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  directory: string;
  eventId?: string;
}

export interface HubStatus {
  type: "connect" | "disconnect" | "error" | "initial-error";
  wasReady?: boolean;
  reason?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  buildUrlFailed?: boolean;
}

export interface UpstreamSseReaderDeps {
  buildUrl: () => URL;
  getHeaders?: () => Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchImpl?: any;
  parseBlock?: (block: string) => SseEventEnvelope | null;
  initialLastEventId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signal?: any;
  stallTimeoutMs?: number;
  reconnectDelayMs?: number;
  onEvent?: (event: {
    block: string;
    envelope: SseEventEnvelope;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
    eventId: string | null;
    directory: string | null;
  }) => void;
  onConnect?: (info: { response: Response; lastEventId: string }) => void;
  onDisconnect?: (info: { reason: string }) => void;
  onError?: (info: { type: string; status?: number; response?: Response; error?: unknown }) => void;
  onStall?: (info: { duration: number }) => void;
  onResume?: (info: { lastEventId: string }) => void;
}

export interface UpstreamSseReader {
  start(): Promise<void>;
  stop(): void;
  getLastEventId(): string;
}

export interface GlobalHubDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openCodeRuntime: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchImpl?: any;
  upstreamStallTimeoutMs?: number;
  upstreamReconnectDelayMs?: number;
  replayLimit?: number;
}

export interface GlobalHub {
  start(): void;
  stop(): void;
  isConnected(): boolean;
  hasConnected(): boolean;
  subscribeEvent(subscriber: (event: NormalizedEvent) => void): () => void;
  subscribeStatus(subscriber: (status: HubStatus) => void): () => void;
  replayAfter(eventId?: string): NormalizedEvent[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emitSynthetic(syntheticPayload: any, options?: { eventId?: string; directory?: string }): void;
}

export interface GlobalWsBridgeDeps {
  globalHub: GlobalHub;
  ownsGlobalHub: boolean;
  wsClients: Set<WebSocket>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processForwardedEventPayload: any;
  triggerHealthCheck?: () => void;
  heartbeatIntervalMs: number;
}

export interface GlobalWsBridge {
  accept(socket: WebSocket, options?: { requestedLastEventId?: string }): void;
  close(): void;
}

export interface DirectoryWsConnectionDeps {
  socket: WebSocket;
  requestedLastEventId: string;
  requestedDirectory: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openCodeRuntime: any;
  processForwardedEventPayload: any;
  wsClients: Set<WebSocket>;
  triggerHealthCheck?: () => void;
  heartbeatIntervalMs: number;
  upstreamStallTimeoutMs: number;
  upstreamReconnectDelayMs: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchImpl: any;
}

export interface ClientError {
  message: string;
  closeReason: string;
  triggerHealthCheck: boolean;
}

export interface MessageStreamWsRuntimeDeps {
  server: HttpServer;
  uiAuthController: {
    enabled?: boolean;
    ensureSessionToken?: (req: IncomingMessage, _res: unknown) => Promise<string | null>;
  } | null;
  isRequestOriginAllowed: (req: IncomingMessage) => Promise<boolean>;
  rejectWebSocketUpgrade: (socket: import("node:net").Socket, code: number, message: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openCodeRuntime: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processForwardedEventPayload: any;
  wsClients?: Set<WebSocket>;
  triggerHealthCheck?: () => void;
  heartbeatIntervalMs?: number;
  upstreamStallTimeoutMs?: number;
  upstreamReconnectDelayMs?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetchImpl?: any;
  globalEventHub?: GlobalHub | null;
}

export interface MessageStreamWsRuntime {
  wsServer: import("ws").WebSocketServer;
  close(): Promise<void>;
}

export interface GlobalUiBroadcasterDeps {
  sseClients: Set<import("http").ServerResponse>;
  wsClients: Set<WebSocket>;
  writeSseEvent: (res: import("http").ServerResponse, payload: unknown) => void;
}