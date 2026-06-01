# Stage 3: Event-Stream Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Port the event-stream runtime from JavaScript (`lib/event-stream/`) into typed TypeScript domain modules at `server/src/domains/event-stream/`, cut over old `index.js` imports, and delete replaced JS files.

**Architecture:** Same strangler pattern as Stage 2. Port all 8 JS modules to typed TS, swap imports in old `index.js` from `./lib/event-stream/` to `./dist/domains/event-stream/`, delete old JS. The `createEventStreamRuntime` keeps its internal (old JS) imports for notifications/watcher/core — those domains will be cleaned when we reach their stages.

**Tech Stack:** TypeScript, Vitest, ws

---

## File Map

```
packages/web/server/src/domains/event-stream/
  types.ts                   — All event stream domain types
  protocol.ts                — SSE envelope parsing + WS frame helpers
  protocol.test.ts           — Protocol tests (port existing)
  upstream-reader.ts         — Reusable upstream SSE reader
  upstream-reader.test.ts    — Upstream reader tests (port existing)
  global-hub.ts              — Global message stream hub
  global-ws-bridge.ts        — Global WS bridge
  directory-ws-bridge.ts     — Per-directory WS bridge
  ui-event-broadcaster.ts    — Global UI event broadcaster
  error-broadcast.ts         — Error broadcast pure function
  error-broadcast.test.ts    — Error broadcast tests (port existing)
  runtime.ts                 — createMessageStreamWsRuntime + createEventStreamRuntime
  index.ts                   — Barrel export
```

**Modify:** `packages/web/server/index.js` (import lines)

**Delete:** All files under `packages/web/server/lib/event-stream/` + `event-stream-runtime.test.js`, `liveness-integration.test.js`

---

### Task 1: Event-Stream Domain Types

**Files:**
- Create: `packages/web/server/src/domains/event-stream/types.ts`

```ts
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
  };
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
```

- [ ] Verify: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json` → PASS
- [ ] Commit: `git add ... && git commit -m "feat(server): add event-stream domain types"`

---

### Task 2: Protocol Module + Tests

**Files:**
- Create: `packages/web/server/src/domains/event-stream/protocol.ts`
- Create: `packages/web/server/src/domains/event-stream/protocol.test.ts`

Port `lib/event-stream/protocol.js`. Exact behavior, typed signatures. Keep `parseSseEventEnvelope`, `sendMessageStreamWsFrame`, `sendMessageStreamWsEvent`, and all constants. Tests port from existing `protocol.test.js`.

**protocol.ts:**
```ts
import type { WebSocket } from "ws";
import type { SseEventEnvelope } from "./types.js";
import { MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES } from "./types.js";

export const parseSseEventEnvelope = (block: unknown): SseEventEnvelope | null => {
  if (!block || typeof block !== "string") {
    return null;
  }

  const lines = block.split("\n");
  const eventId =
    lines
      .find((line) => line.startsWith("id:"))
      ?.slice(3)
      .trim() || null;

  const dataLines = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^\s/, ""));

  if (dataLines.length === 0) {
    return null;
  }

  const payloadText = dataLines.join("\n").trim();
  if (!payloadText) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadText);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.payload === "object" &&
      parsed.payload !== null
    ) {
      return {
        eventId,
        directory:
          typeof parsed.directory === "string" && parsed.directory.length > 0
            ? parsed.directory
            : null,
        payload: parsed.payload,
      };
    }

    const directory =
      typeof parsed?.directory === "string" && parsed.directory.length > 0
        ? parsed.directory
        : typeof parsed?.properties?.directory === "string" &&
            parsed.properties.directory.length > 0
          ? parsed.properties.directory
          : null;

    return { eventId, directory, payload: parsed };
  } catch {
    return null;
  }
};

export const sendMessageStreamWsFrame = (
  socket: WebSocket,
  payload: unknown,
): boolean => {
  const ready = "readyState" in socket ? (socket as WebSocket).readyState : -1;
  if (ready !== 1) return false;

  if (
    typeof (socket as { bufferedAmount?: number }).bufferedAmount === "number" &&
    (socket as { bufferedAmount: number }).bufferedAmount > MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES
  ) {
    try { socket.close(1013, "Message stream client is too slow"); } catch {}
    return false;
  }

  try {
    socket.send(JSON.stringify(payload));
    if (
      typeof (socket as { bufferedAmount?: number }).bufferedAmount === "number" &&
      (socket as { bufferedAmount: number }).bufferedAmount > MESSAGE_STREAM_WS_MAX_BUFFERED_BYTES
    ) {
      try { socket.close(1013, "Message stream client is too slow"); } catch {}
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const sendMessageStreamWsEvent = (
  socket: WebSocket,
  payload: unknown,
  options: { eventId?: string; directory?: string } = {},
): boolean => {
  const frame: Record<string, unknown> = { type: "event", payload };

  if (options.eventId && options.eventId.length > 0) {
    frame.eventId = options.eventId;
  }
  if (options.directory && options.directory.length > 0) {
    frame.directory = options.directory;
  }

  return sendMessageStreamWsFrame(socket, frame);
};
```

**protocol.test.ts** — port tests from `lib/event-stream/protocol.test.js` (read the existing test file and port to TS with same assertions).

- [ ] Verify: `bun test packages/web/server/src/domains/event-stream/protocol.test.ts` → PASS (all ported tests)
- [ ] Type-check: PASS
- [ ] Commit

---

### Task 3: Upstream SSE Reader + Tests

**Files:**
- Create: `packages/web/server/src/domains/event-stream/upstream-reader.ts`
- Create: `packages/web/server/src/domains/event-stream/upstream-reader.test.ts`

Port `lib/event-stream/upstream-reader.js`. Exact behavior. `createUpstreamSseReader(deps)` returns `{ start, stop, getLastEventId }`. The internal stall timer, reconnect delay, and `fetch` loop are all preserved verbatim.

**upstream-reader.ts:**
```ts
import { parseSseEventEnvelope } from "./protocol.js";
import type { UpstreamSseReaderDeps, UpstreamSseReader, SseEventEnvelope } from "./types.js";
import { DEFAULT_UPSTREAM_STALL_TIMEOUT_MS, DEFAULT_UPSTREAM_RECONNECT_DELAY_MS } from "./types.js";

function waitForReconnectDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener("abort", () => { clearTimeout(timeout); resolve(); }, { once: true });
  });
}

export function createUpstreamSseReader(deps: UpstreamSseReaderDeps): UpstreamSseReader {
  // ... (exact port of the full upstream-reader.js source, typed)
  // Preserve all behavior: stall timer, reconnect loop, lastEventId tracking,
  // buffer splitting, parseBlock, onEvent/onConnect/onDisconnect/onError/onStall/onResume
}
```

**upstream-reader.test.ts** — port tests from `lib/event-stream/upstream-reader.test.js`.

- [ ] Verify: `bun test` upstream-reader → PASS
- [ ] Type-check: PASS
- [ ] Commit

---

### Task 4: Pure Modules — GlobalHub + Broadcaster + ErrorBroadcast

**Files:**
- Create: `packages/web/server/src/domains/event-stream/global-hub.ts`
- Create: `packages/web/server/src/domains/event-stream/ui-event-broadcaster.ts`
- Create: `packages/web/server/src/domains/event-stream/error-broadcast.ts`
- Create: `packages/web/server/src/domains/event-stream/error-broadcast.test.ts`

Port three pure modules. Each is under 170 lines. Exact behavior.

**global-hub.ts** — `createGlobalMessageStreamHub(deps)` returns `{ start, stop, isConnected, hasConnected, subscribeEvent, subscribeStatus, replayAfter, emitSynthetic }`.

**ui-event-broadcaster.ts** — `createGlobalUiEventBroadcaster({ sseClients, wsClients, writeSseEvent })` returns a broadcaster function.

**error-broadcast.ts** — `hubStatusToClientError(status: HubStatus): ClientError | null`

**error-broadcast.test.ts** — port tests from `lib/event-stream/ws-bridge/error-broadcast.test.js`.

- [ ] Verify: type-check PASS, tests PASS
- [ ] Commit

---

### Task 5: WS Bridge Modules

**Files:**
- Create: `packages/web/server/src/domains/event-stream/global-ws-bridge.ts`
- Create: `packages/web/server/src/domains/event-stream/directory-ws-bridge.ts`

Port `global-ws-bridge.js` (200 lines) and `directory-ws-bridge.js` (184 lines). Exact behavior.

**global-ws-bridge.ts** — `createGlobalMessageStreamWsBridge(deps)` returns `{ accept, close }`. Handles global WS client lifecycle, ping/heartbeat intervals, replay, ready signaling, and initial-error cleanup.

**directory-ws-bridge.ts** — `acceptDirectoryMessageStreamWsConnection(deps)`. Per-directory upstream SSE reader, own ping/heartbeat intervals, error handling, cleanup.

- [ ] Verify: type-check PASS
- [ ] Commit

---

### Task 6: Runtime Module

**Files:**
- Create: `packages/web/server/src/domains/event-stream/runtime.ts`

Port `lib/event-stream/runtime.js` (324 lines). Two factories: `createMessageStreamWsRuntime` and `createEventStreamRuntime`.

Important: `createEventStreamRuntime` imports from old JS modules (`../notifications/`, `../opencode/services/watcher.js`, `../core/`). These imports remain as-is (they're still JS, will be ported in later stages). Use `any` types for these boundaries.

**runtime.ts** — exact port with typed factory signatures:
```ts
export function createMessageStreamWsRuntime(deps: MessageStreamWsRuntimeDeps): MessageStreamWsRuntime { ... }
export function createEventStreamRuntime(deps: { ... }): { ... } { ... }
export function createGlobalUiEventBroadcaster(deps: GlobalUiBroadcasterDeps): (payload: unknown, options?: { directory?: string; eventId?: string }) => void { ... }
```

Also import `parseRequestPathname` from `../../domains/terminal/index.js` (the TS terminal domain from Stage 2).

- [ ] Verify: type-check PASS
- [ ] Commit

---

### Task 7: Barrel Export

**Files:**
- Create: `packages/web/server/src/domains/event-stream/index.ts`

```ts
export {
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
} from "./types.js";
export { parseSseEventEnvelope, sendMessageStreamWsFrame, sendMessageStreamWsEvent } from "./protocol.js";
export { createGlobalMessageStreamHub, MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT } from "./global-hub.js";
export { createGlobalUiEventBroadcaster } from "./ui-event-broadcaster.js";
export { createMessageStreamWsRuntime, createEventStreamRuntime } from "./runtime.js";
export { DEFAULT_UPSTREAM_RECONNECT_DELAY_MS, DEFAULT_UPSTREAM_STALL_TIMEOUT_MS, createUpstreamSseReader } from "./upstream-reader.js";
export type { GlobalHub, NormalizedEvent, HubStatus, SseEventEnvelope } from "./types.js";
```

- [ ] Verify: type-check PASS
- [ ] Commit

---

### Task 8: Cut Over — Wire old index.js + Delete old JS

**Files:**
- Modify: `packages/web/server/index.js` (3 import lines)
- Delete: All files under `packages/web/server/lib/event-stream/`

**Step 1: Build**
```bash
bun run build:web-server
```

**Step 2: Change imports in old index.js**

Replace lines 42-45:
```js
import {
  createGlobalUiEventBroadcaster,
  createGlobalMessageStreamHub,
  createMessageStreamWsRuntime,
} from './lib/event-stream/index.js';
```
with:
```js
import {
  createGlobalUiEventBroadcaster,
  createGlobalMessageStreamHub,
  createMessageStreamWsRuntime,
} from './dist/domains/event-stream/index.js';
```

**Step 3: Delete old JS**
```bash
rm -r packages/web/server/lib/event-stream/
```

**Step 4: Verify**
```bash
bun run build:web-server
bun run type-check
bun run lint
bun test packages/web/server/src/domains/event-stream/
```

- [ ] Commit

---

### Task 9: Final Verification

- [ ] `bun run type-check` → ALL PASS
- [ ] `bun run lint` → 0 errors
- [ ] `bun run build:web-server` → PASS
- [ ] `bun test packages/web/server/src/domains/event-stream/` → all tests PASS
- [ ] `git status` → clean
