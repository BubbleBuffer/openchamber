# Stage 2: Terminal Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the terminal WebSocket runtime from JavaScript (`lib/terminal/`) into typed TypeScript domain modules at `server/src/domains/terminal/`, cut over the old `index.js` import, and delete replaced JS files.

**Architecture:** Strangler port — build TS domain alongside existing JS, then swap the import in the old `index.js` to point at the compiled TS. The terminal domain remains runtime-agnostic: `bun-pty` and `node-pty` are loaded dynamically based on `typeof globalThis.Bun`, exactly as before.

**Tech Stack:** TypeScript, Vitest, ws, bun-pty (Bun runtime), node-pty (Node runtime)

---

## File Map

```
packages/web/server/src/domains/terminal/
  types.ts              — All terminal domain types
  protocol.ts           — WS protocol utilities (ported from terminal-ws-protocol.js)
  protocol.test.ts      — Protocol unit tests
  replay-buffer.ts      — Output replay buffer (ported from output-replay-buffer.js)
  replay-buffer.test.ts — Replay buffer unit tests
  pty.ts                — PTY provider selection, shell resolution, spawning
  sessions.ts           — Session CRUD, idle sweep, lifecycle
  ws-server.ts          — WebSocket server, connection handling, protocol dispatch
  routes.ts             — Express route registration
  runtime.ts            — createTerminalDomain() factory (replaces createTerminalRuntime)
  index.ts              — Barrel export
```

**Modify:** `packages/web/server/index.js` (change import line), `packages/web/server/src/shared/types.ts` (terminal constants)

**Delete:** All files under `packages/web/server/lib/terminal/`

---

### Task 1: Terminal Domain Types

**Files:**
- Create: `packages/web/server/src/domains/terminal/types.ts`

Define all types that the terminal domain owns. This is the contract that every other file must satisfy.

- [ ] **Step 1: Write the types file**

```ts
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
```

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS (types-only file, no implementation yet)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/terminal/types.ts
git commit -m "feat(server): add terminal domain types"
```

---

### Task 2: Terminal WS Protocol Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/protocol.ts`
- Create: `packages/web/server/src/domains/terminal/protocol.test.ts`

Port `terminal-ws-protocol.js` to TypeScript. Exact behavior preservation — same inputs produce same outputs. No changes to logic.

- [ ] **Step 1: Write the protocol module**

```ts
import { Buffer } from "node:buffer";
import { TERMINAL_WS_CONTROL_TAG_JSON, TERMINAL_WS_PATH } from "./types.js";
import type { TerminalControlFrame } from "./types.js";

export const parseRequestPathname = (requestUrl: unknown): string => {
  if (typeof requestUrl !== "string" || requestUrl.length === 0) {
    return "";
  }

  try {
    return new URL(requestUrl, "http://localhost").pathname;
  } catch {
    return "";
  }
};

export const isTerminalWsPathname = (pathname: string): boolean =>
  pathname === TERMINAL_WS_PATH;

export const normalizeTerminalWsMessageToBuffer = (rawData: unknown): Buffer => {
  if (Buffer.isBuffer(rawData)) {
    return rawData;
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(
      rawData.map((chunk: unknown) =>
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer),
      ),
    );
  }

  return Buffer.from(rawData as ArrayBuffer);
};

export const normalizeTerminalWsMessageToText = (rawData: unknown): string => {
  if (typeof rawData === "string") {
    return rawData;
  }

  return normalizeTerminalWsMessageToBuffer(rawData).toString("utf8");
};

export const readTerminalWsControlFrame = (
  rawData: unknown,
): TerminalControlFrame | null => {
  if (!rawData) {
    return null;
  }

  const buffer = normalizeTerminalWsMessageToBuffer(rawData);
  if (buffer.length < 2 || buffer[0] !== TERMINAL_WS_CONTROL_TAG_JSON) {
    return null;
  }

  try {
    const parsed = JSON.parse(buffer.subarray(1).toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as TerminalControlFrame;
  } catch {
    return null;
  }
};

export const createTerminalWsControlFrame = (
  payload: TerminalControlFrame,
): Buffer => {
  const jsonBytes = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]), jsonBytes]);
};

export const pruneRebindTimestamps = (
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] => timestamps.filter((timestamp) => now - timestamp < windowMs);

export const isRebindRateLimited = (
  timestamps: number[],
  maxPerWindow: number,
): boolean => timestamps.length >= maxPerWindow;
```

- [ ] **Step 2: Write the protocol tests (port existing tests to TS)**

```ts
import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import {
  TERMINAL_WS_PATH,
  TERMINAL_WS_CONTROL_TAG_JSON,
  createTerminalWsControlFrame,
  isTerminalWsPathname,
  isRebindRateLimited,
  normalizeTerminalWsMessageToBuffer,
  normalizeTerminalWsMessageToText,
  parseRequestPathname,
  pruneRebindTimestamps,
  readTerminalWsControlFrame,
} from "./protocol.js";

describe("terminal websocket protocol", () => {
  it("uses fixed websocket paths", () => {
    expect(TERMINAL_WS_PATH).toBe("/api/terminal/ws");
  });

  it("matches supported websocket pathnames", () => {
    expect(isTerminalWsPathname("/api/terminal/ws")).toBe(true);
    expect(isTerminalWsPathname("/api/terminal/input-ws")).toBe(false);
    expect(isTerminalWsPathname("/api/terminal/other")).toBe(false);
  });

  it("encodes control frames with control tag prefix", () => {
    const frame = createTerminalWsControlFrame({ t: "ok", v: 1 });
    expect(frame[0]).toBe(TERMINAL_WS_CONTROL_TAG_JSON);
  });

  it("roundtrips control frame payload", () => {
    const payload = { t: "b", s: "abc123", v: 1 };
    const frame = createTerminalWsControlFrame(payload);
    expect(readTerminalWsControlFrame(frame)).toEqual(payload);
  });

  it("rejects control frame without protocol tag", () => {
    const frame = Buffer.from(JSON.stringify({ t: "b", s: "abc123" }), "utf8");
    expect(readTerminalWsControlFrame(frame)).toBeNull();
  });

  it("rejects malformed control json", () => {
    const frame = Buffer.concat([
      Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]),
      Buffer.from("{not json", "utf8"),
    ]);
    expect(readTerminalWsControlFrame(frame)).toBeNull();
  });

  it("rejects empty control payloads", () => {
    expect(readTerminalWsControlFrame(null)).toBeNull();
    expect(readTerminalWsControlFrame(undefined)).toBeNull();
    expect(readTerminalWsControlFrame(Buffer.alloc(0))).toBeNull();
  });

  it("rejects control json that is not object", () => {
    const frame = Buffer.concat([
      Buffer.from([TERMINAL_WS_CONTROL_TAG_JSON]),
      Buffer.from('"str"', "utf8"),
    ]);
    expect(readTerminalWsControlFrame(frame)).toBeNull();
  });

  it("parses control frame from chunk arrays", () => {
    const frame = createTerminalWsControlFrame({ t: "bok", v: 1 });
    const chunks = [frame.subarray(0, 2), frame.subarray(2)];
    expect(readTerminalWsControlFrame(chunks)).toEqual({ t: "bok", v: 1 });
  });

  it("normalizes buffer passthrough", () => {
    const raw = Buffer.from("abc", "utf8");
    const normalized = normalizeTerminalWsMessageToBuffer(raw);
    expect(normalized).toBe(raw);
    expect(normalized.toString("utf8")).toBe("abc");
  });

  it("normalizes uint8 arrays", () => {
    const normalized = normalizeTerminalWsMessageToBuffer(
      new Uint8Array([97, 98, 99]),
    );
    expect(normalized.toString("utf8")).toBe("abc");
  });

  it("normalizes array buffer payloads", () => {
    const source = new Uint8Array([97, 98, 99]).buffer;
    const normalized = normalizeTerminalWsMessageToBuffer(source);
    expect(normalized.toString("utf8")).toBe("abc");
  });

  it("normalizes chunk array payloads", () => {
    const normalized = normalizeTerminalWsMessageToBuffer([
      Buffer.from("ab", "utf8"),
      Buffer.from("c", "utf8"),
    ]);
    expect(normalized.toString("utf8")).toBe("abc");
  });

  it("normalizes text payload from string", () => {
    expect(normalizeTerminalWsMessageToText("\u001b[A")).toBe("\u001b[A");
  });

  it("normalizes text payload from binary data", () => {
    expect(normalizeTerminalWsMessageToText(Buffer.from("\r", "utf8"))).toBe(
      "\r",
    );
  });

  it("parses relative request pathname", () => {
    expect(parseRequestPathname("/api/terminal/ws?x=1")).toBe(
      "/api/terminal/ws",
    );
  });

  it("parses absolute request pathname", () => {
    expect(parseRequestPathname("http://localhost:3000/api/terminal/ws")).toBe(
      "/api/terminal/ws",
    );
  });

  it("returns empty pathname for non-string request url", () => {
    expect(parseRequestPathname(null)).toBe("");
  });

  it("returns empty pathname for invalid request url", () => {
    expect(parseRequestPathname("http://")).toBe("");
    expect(parseRequestPathname("")).toBe("");
  });

  it("prunes stale rebind timestamps", () => {
    const now = 1_000;
    const pruned = pruneRebindTimestamps([100, 200, 950, 999], now, 100);
    expect(pruned).toEqual([950, 999]);
  });

  it("keeps rebind timestamps within active window", () => {
    const now = 1_000;
    const pruned = pruneRebindTimestamps([920, 950, 999], now, 100);
    expect(pruned).toEqual([920, 950, 999]);
  });

  it("does not rate limit below threshold", () => {
    expect(isRebindRateLimited([1, 2, 3], 4)).toBe(false);
  });

  it("does not rate limit empty window", () => {
    expect(isRebindRateLimited([], 1)).toBe(false);
  });

  it("rate limits at threshold", () => {
    expect(isRebindRateLimited([1, 2, 3, 4], 4)).toBe(true);
  });
});
```

- [ ] **Step 3: Run protocol tests**

Run: `cd packages/web && npx vitest run server/src/domains/terminal/protocol.test.ts`
Expected: 22/22 PASS

- [ ] **Step 4: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/terminal/protocol.ts packages/web/server/src/domains/terminal/protocol.test.ts
git commit -m "feat(server): add terminal WS protocol module with tests"
```

---

### Task 3: Replay Buffer Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/replay-buffer.ts`
- Create: `packages/web/server/src/domains/terminal/replay-buffer.test.ts`

Port `output-replay-buffer.js` to TypeScript. Exact behavior preservation. No logic changes.

- [ ] **Step 1: Write the replay buffer module**

```ts
import { Buffer } from "node:buffer";
import { TERMINAL_OUTPUT_REPLAY_MAX_BYTES } from "./types.js";
import type { ReplayBufferState, ReplayChunk } from "./types.js";

const trimTerminalOutputChunkToMaxBytes = (
  data: string,
  maxBytes: number,
): string => {
  if (typeof data !== "string" || data.length === 0) {
    return "";
  }

  const bytes = Buffer.byteLength(data, "utf8");
  if (bytes <= maxBytes) {
    return data;
  }

  const trimmedBuffer = Buffer.from(data, "utf8").subarray(-maxBytes);
  return trimmedBuffer.toString("utf8");
};

export const createTerminalOutputReplayBuffer = (): ReplayBufferState => ({
  chunks: [],
  totalBytes: 0,
  nextId: 1,
});

export const appendTerminalOutputReplayChunk = (
  bufferState: ReplayBufferState,
  data: string,
  maxBytes: number = TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
): ReplayChunk | null => {
  const normalizedData = trimTerminalOutputChunkToMaxBytes(data, maxBytes);
  if (!normalizedData) {
    return null;
  }

  const bytes = Buffer.byteLength(normalizedData, "utf8");
  const chunk: ReplayChunk = {
    id: bufferState.nextId,
    data: normalizedData,
    bytes,
  };

  bufferState.nextId += 1;
  bufferState.chunks.push(chunk);
  bufferState.totalBytes += bytes;

  while (
    bufferState.totalBytes > maxBytes &&
    bufferState.chunks.length > 1
  ) {
    const removedChunk = bufferState.chunks.shift();
    bufferState.totalBytes -= removedChunk?.bytes ?? 0;
  }

  return chunk;
};

export const listTerminalOutputReplayChunksSince = (
  bufferState: ReplayBufferState,
  lastSeenId: number = 0,
): ReplayChunk[] =>
  bufferState.chunks.filter((chunk) => chunk.id > lastSeenId);

export const getLatestTerminalOutputReplayChunkId = (
  bufferState: ReplayBufferState,
): number => {
  if (bufferState.chunks.length === 0) {
    return 0;
  }

  return bufferState.chunks[bufferState.chunks.length - 1]?.id ?? 0;
};
```

- [ ] **Step 2: Write the replay buffer tests (port existing tests to TS)**

```ts
import { describe, expect, it } from "vitest";

import {
  TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
  appendTerminalOutputReplayChunk,
  createTerminalOutputReplayBuffer,
  getLatestTerminalOutputReplayChunkId,
  listTerminalOutputReplayChunksSince,
} from "./replay-buffer.js";

describe("terminal output replay buffer", () => {
  it("starts empty", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    expect(bufferState).toEqual({ chunks: [], totalBytes: 0, nextId: 1 });
    expect(getLatestTerminalOutputReplayChunkId(bufferState)).toBe(0);
  });

  it("appends chunks with incrementing ids", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    const first = appendTerminalOutputReplayChunk(bufferState, "prompt> ");
    const second = appendTerminalOutputReplayChunk(bufferState, "ls\r\n");

    expect(first).toEqual({ id: 1, data: "prompt> ", bytes: 8 });
    expect(second).toEqual({ id: 2, data: "ls\r\n", bytes: 4 });
    expect(getLatestTerminalOutputReplayChunkId(bufferState)).toBe(2);
  });

  it("lists chunks after a replay cursor", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    appendTerminalOutputReplayChunk(bufferState, "prompt> ");
    appendTerminalOutputReplayChunk(bufferState, "ls\r\n");
    appendTerminalOutputReplayChunk(bufferState, "file.txt\r\n");

    expect(
      listTerminalOutputReplayChunksSince(bufferState, 1).map(
        (chunk) => chunk.data,
      ),
    ).toEqual(["ls\r\n", "file.txt\r\n"]);
  });

  it("trims old chunks beyond max bytes", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    appendTerminalOutputReplayChunk(bufferState, "1234", 8);
    appendTerminalOutputReplayChunk(bufferState, "5678", 8);
    appendTerminalOutputReplayChunk(bufferState, "90", 8);

    expect(bufferState.chunks.map((chunk) => chunk.data)).toEqual([
      "5678",
      "90",
    ]);
    expect(bufferState.totalBytes).toBe(6);
  });

  it("trims oversized single chunks to the configured max bytes", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    const chunk = appendTerminalOutputReplayChunk(
      bufferState,
      "abcdefghij",
      4,
    );

    expect(chunk?.data).toBe("ghij");
    expect(chunk?.bytes).toBe(4);
    expect(bufferState.totalBytes).toBe(4);
  });

  it("uses the default max bytes when not provided", () => {
    const bufferState = createTerminalOutputReplayBuffer();
    const chunk = appendTerminalOutputReplayChunk(bufferState, "ok");

    expect(chunk?.bytes).toBe(2);
    expect(TERMINAL_OUTPUT_REPLAY_MAX_BYTES).toBe(64 * 1024);
  });
});
```

- [ ] **Step 3: Run replay buffer tests**

Run: `cd packages/web && npx vitest run server/src/domains/terminal/replay-buffer.test.ts`
Expected: 6/6 PASS

- [ ] **Step 4: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/terminal/replay-buffer.ts packages/web/server/src/domains/terminal/replay-buffer.test.ts
git commit -m "feat(server): add terminal replay buffer module with tests"
```

---

### Task 4: PTY Provider Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/pty.ts`

Extract PTY provider selection, shell resolution, and spawning from `runtime.js` (lines 33-160). The `typeof globalThis.Bun` guard is preserved exactly.

- [ ] **Step 1: Write the PTY provider module**

```ts
import type { PtyProvider, PtySpawnOptions } from "./types.js";

interface PtyModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawn: (...args: any[]) => any;
}

let ptyProviderPromise: Promise<PtyProvider> | null = null;

export const getPtyProvider = async (
  isBunRuntime: boolean,
): Promise<PtyProvider> => {
  if (ptyProviderPromise) {
    return ptyProviderPromise;
  }

  ptyProviderPromise = (async () => {
    if (isBunRuntime) {
      try {
        const bunPty = (await import("bun-pty")) as PtyModule;
        console.log("Using bun-pty for terminal sessions");
        return {
          spawn: bunPty.spawn as PtyProvider["spawn"],
          backend: "bun-pty",
        };
      } catch (error) {
        console.warn("bun-pty unavailable, falling back to node-pty");
      }
    }

    try {
      const nodePty = (await import("node-pty")) as PtyModule;
      console.log("Using node-pty for terminal sessions");
      return {
        spawn: nodePty.spawn as PtyProvider["spawn"],
        backend: "node-pty",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to load node-pty:", message);
      if (isBunRuntime) {
        throw new Error(
          "No PTY backend available. Install bun-pty or node-pty.",
        );
      }
      throw new Error(
        "node-pty is not available. Run: npm rebuild node-pty (or install Bun for bun-pty)",
      );
    }
  })();

  return ptyProviderPromise;
};

export const getTerminalShellCandidates = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  searchPathFor: (name: string) => string | null,
  isExecutable: (path: string) => boolean,
): string[] => {
  if (platform === "win32") {
    const windowsCandidates = [
      env.OPENCHAMBER_TERMINAL_SHELL,
      env.SHELL,
      env.ComSpec,
      `${env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      "pwsh.exe",
      "powershell.exe",
      "cmd.exe",
    ].filter(Boolean) as string[];

    return deduplicateShells(windowsCandidates, searchPathFor, isExecutable);
  }

  const unixCandidates = [
    env.OPENCHAMBER_TERMINAL_SHELL,
    env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
    "zsh",
    "bash",
    "sh",
  ].filter(Boolean) as string[];

  return deduplicateShells(unixCandidates, searchPathFor, isExecutable);
};

const deduplicateShells = (
  candidates: string[],
  searchPathFor: (name: string) => string | null,
  isExecutable: (path: string) => boolean,
): string[] => {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const candidateRaw of candidates) {
    const candidate = String(candidateRaw).trim();
    if (!candidate) continue;

    const lookedUp =
      candidate.includes("\\") || candidate.includes("/")
        ? candidate
        : searchPathFor(candidate);
    const executable =
      lookedUp && isExecutable(lookedUp)
        ? lookedUp
        : isExecutable(candidate)
          ? candidate
          : null;
    if (!executable || seen.has(executable)) continue;
    seen.add(executable);
    resolved.push(executable);
  }

  return resolved;
};

export const spawnTerminalPtyWithFallback = (
  pty: PtyProvider,
  options: PtySpawnOptions,
  shellCandidates: string[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): { ptyProcess: any; shell: string } => {
  if (shellCandidates.length === 0) {
    throw new Error("No executable shell found for terminal session");
  }

  let lastError: Error | null = null;
  for (const shell of shellCandidates) {
    try {
      const ptyOptions = {
        name: "xterm-256color",
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: options.cwd,
        env: {
          ...options.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (process.platform === "win32") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ptyOptions as any).useConpty = true;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ptyProcess = pty.spawn(shell, [], ptyOptions as any);

      return { ptyProcess, shell };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Failed to spawn PTY using shell ${shell}:`,
        lastError.message,
      );
    }
  }

  const baseMessage =
    lastError?.message ?? "PTY spawn failed";
  throw new Error(
    `Failed to spawn terminal PTY with available shells (${shellCandidates.join(", ")}): ${baseMessage}`,
  );
};

export const sanitizeTerminalEnv = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  const next = { ...env };
  delete next.BASH_XTRACEFD;
  delete next.BASH_ENV;
  delete next.ENV;
  return next;
};
```

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/terminal/pty.ts
git commit -m "feat(server): add terminal PTY provider module"
```

---

### Task 5: Terminal Sessions Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/sessions.ts`

Extract session management from `runtime.js` (maps, create, wire, kill, restart, idle sweep). Depends on protocol, replay-buffer, pty, and types.

- [ ] **Step 1: Write the sessions module**

```ts
import type {
  PtyProcess,
  TerminalSession,
  ReplayBufferState,
  TerminalCapabilities,
} from "./types.js";
import {
  MAX_TERMINAL_SESSIONS,
  TERMINAL_IDLE_TIMEOUT,
  TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
  TERMINAL_WS_PATH,
} from "./types.js";
import {
  createTerminalOutputReplayBuffer,
  appendTerminalOutputReplayChunk,
} from "./replay-buffer.js";

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

export const appendOutputToSession = (
  session: TerminalSession,
  data: string,
): ReplayBufferState => {
  appendTerminalOutputReplayChunk(
    session.outputReplayBuffer,
    data,
    TERMINAL_OUTPUT_REPLAY_MAX_BYTES,
  );
  return session.outputReplayBuffer;
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
```

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/terminal/sessions.ts
git commit -m "feat(server): add terminal sessions module"
```

---

### Task 6: WebSocket Server Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/ws-server.ts`

Extract WebSocket server setup and connection handling from `runtime.js` (lines 195-398). Depends on protocol, sessions, and types.

- [ ] **Step 1: Write the WebSocket server module**

```ts
import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { Buffer } from "node:buffer";
import type {
  TerminalWsConnection,
  TerminalSession,
  TerminalDomainDependencies,
} from "./types.js";
import {
  TERMINAL_WS_MAX_PAYLOAD_BYTES,
  TERMINAL_WS_PATH as WS_PATH,
  TERMINAL_HEARTBEAT_INTERVAL_MS,
  TERMINAL_REBIND_WINDOW_MS,
  TERMINAL_MAX_REBINDS_PER_WINDOW,
} from "./types.js";
import {
  parseRequestPathname,
  readTerminalWsControlFrame,
  createTerminalWsControlFrame,
  normalizeTerminalWsMessageToText,
  pruneRebindTimestamps,
  isRebindRateLimited,
} from "./protocol.js";
import {
  getTerminalSessions,
} from "./sessions.js";
import {
  listTerminalOutputReplayChunksSince,
  appendTerminalOutputReplayChunk,
} from "./replay-buffer.js";

export const createTerminalWsServer = (
  httpServer: HttpServer,
  deps: TerminalDomainDependencies,
): { wsServer: WebSocketServer } => {
  const {
    uiAuthController,
    isRequestOriginAllowed,
    rejectWebSocketUpgrade,
  } = deps;

  const heartbeatIntervalMs =
    deps.heartbeatIntervalMs ?? TERMINAL_HEARTBEAT_INTERVAL_MS;
  const rebindWindowMs =
    deps.rebindWindowMs ?? TERMINAL_REBIND_WINDOW_MS;
  const maxRebindsPerWindow =
    deps.maxRebindsPerWindow ?? TERMINAL_MAX_REBINDS_PER_WINDOW;

  const terminalWsConnections = new Set<TerminalWsConnection>();
  let terminalInputWsServer: WebSocketServer | null = new WebSocketServer({
    noServer: true,
    maxPayload: TERMINAL_WS_MAX_PAYLOAD_BYTES,
  });

  const sendControl = (socket: WebSocket, payload: Record<string, unknown>): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      socket.send(createTerminalWsControlFrame(payload), { binary: true });
    } catch {
      // ignore
    }
  };

  const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  const terminalRuntimeName = isBunRuntime ? "bun" : "node";

  terminalInputWsServer.on("connection", (socket: WebSocket) => {
    const connectionState: TerminalWsConnection = {
      socket,
      boundSessionId: null,
      invalidFrames: 0,
      rebindTimestamps: [],
      replayCursorBySession: new Map(),
      lastActivityAt: Date.now(),
    };

    terminalWsConnections.add(connectionState);

    sendControl(socket, { t: "ok", v: 2 });

    const heartbeatInterval = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        socket.ping();
      } catch {
        // ignore
      }
    }, heartbeatIntervalMs);

    socket.on("pong", () => {
      connectionState.lastActivityAt = Date.now();
    });

    socket.on("message", (message: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      connectionState.lastActivityAt = Date.now();

      if (isBinary) {
        const controlMessage = readTerminalWsControlFrame(message);
        if (!controlMessage || typeof controlMessage.t !== "string") {
          connectionState.invalidFrames += 1;
          sendControl(socket, {
            t: "e",
            c: "BAD_FRAME",
            f: connectionState.invalidFrames >= 10,
          });
          if (connectionState.invalidFrames >= 10) {
            socket.close(1008, "protocol violation");
          }
          return;
        }

        if (controlMessage.t === "p") {
          sendControl(socket, { t: "po", v: 2 });
          return;
        }

        if (controlMessage.t !== "b" || typeof controlMessage.s !== "string") {
          connectionState.invalidFrames += 1;
          sendControl(socket, {
            t: "e",
            c: "BAD_FRAME",
            f: connectionState.invalidFrames >= 10,
          });
          if (connectionState.invalidFrames >= 10) {
            socket.close(1008, "protocol violation");
          }
          return;
        }

        const now = Date.now();
        connectionState.rebindTimestamps = pruneRebindTimestamps(
          connectionState.rebindTimestamps,
          now,
          rebindWindowMs,
        );

        if (
          isRebindRateLimited(
            connectionState.rebindTimestamps,
            maxRebindsPerWindow,
          )
        ) {
          sendControl(socket, { t: "e", c: "RATE_LIMIT", f: false });
          return;
        }

        const nextSessionId = controlMessage.s.trim() as string;
        const targetSession = terminalSessions.get(nextSessionId);
        if (!targetSession) {
          connectionState.boundSessionId = null;
          sendControl(socket, {
            t: "e",
            c: "SESSION_NOT_FOUND",
            f: false,
          });
          return;
        }

        const replaySinceRaw =
          typeof controlMessage.r === "number" &&
          Number.isFinite(controlMessage.r)
            ? Math.max(0, Math.trunc(controlMessage.r))
            : 0;
        const rememberedReplayCursor =
          connectionState.replayCursorBySession.get(nextSessionId) ?? 0;
        const replaySince = Math.max(replaySinceRaw, rememberedReplayCursor);

        connectionState.rebindTimestamps.push(now);
        connectionState.boundSessionId = nextSessionId;
        sendControl(socket, {
          t: "bok",
          v: 2,
          s: nextSessionId,
          runtime: terminalRuntimeName,
          ptyBackend: targetSession.ptyBackend || "unknown",
        });

        const replayChunks = listTerminalOutputReplayChunksSince(
          targetSession.outputReplayBuffer,
          replaySince,
        );
        for (const replayChunk of replayChunks) {
          try {
            socket.send(replayChunk.data);
            connectionState.replayCursorBySession.set(
              nextSessionId,
              replayChunk.id,
            );
          } catch {
            break;
          }
        }
        return;
      }

      const payload = normalizeTerminalWsMessageToText(message);
      if (payload.length === 0) {
        return;
      }

      if (!connectionState.boundSessionId) {
        sendControl(socket, { t: "e", c: "NOT_BOUND", f: false });
        return;
      }

      const session = terminalSessions.get(connectionState.boundSessionId);
      if (!session) {
        connectionState.boundSessionId = null;
        sendControl(socket, {
          t: "e",
          c: "SESSION_NOT_FOUND",
          f: false,
        });
        return;
      }

      try {
        session.ptyProcess.write(payload);
        session.lastActivity = Date.now();
      } catch {
        sendControl(socket, { t: "e", c: "WRITE_FAIL", f: false });
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeatInterval);
      connectionState.boundSessionId = null;
      terminalWsConnections.delete(connectionState);
    });

    socket.on("error", () => {
      // noop — log-level noise, socket.close handles cleanup
    });
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket: import("net").Socket, head: Buffer) => {
    const pathname = parseRequestPathname(req.url);
    if (pathname !== WS_PATH) {
      return;
    }

    const handleUpgrade = async () => {
      try {
        if (uiAuthController?.enabled) {
          const sessionToken =
            await uiAuthController?.ensureSessionToken?.(req, null);
          if (!sessionToken) {
            rejectWebSocketUpgrade(socket, 401, "UI authentication required");
            return;
          }

          const originAllowed = await isRequestOriginAllowed(req);
          if (!originAllowed) {
            rejectWebSocketUpgrade(socket, 403, "Invalid origin");
            return;
          }
        }

        if (!terminalInputWsServer) {
          rejectWebSocketUpgrade(socket, 500, "Terminal WebSocket unavailable");
          return;
        }

        terminalInputWsServer.handleUpgrade(req, socket, head, (ws) => {
          terminalInputWsServer?.emit("connection", ws, req);
        });
      } catch {
        rejectWebSocketUpgrade(socket, 500, "Upgrade failed");
      }
    };

    void handleUpgrade();
  });

  return {
    wsServer: terminalInputWsServer,
    get terminalWss() { return terminalInputWsServer; },

    getWsConnections: () => terminalWsConnections,
    get terminalConnections() { return terminalWsConnections; },

    sendControl,
    broadcastOutput: (sessionId: string, session: TerminalSession, data: string): void => {
      session.lastActivity = Date.now();
      const replayChunk = appendTerminalOutputReplayChunk(
        session.outputReplayBuffer,
        data,
        64 * 1024,
      );

      for (const wsConnection of terminalWsConnections) {
        if (wsConnection.boundSessionId !== sessionId) {
          continue;
        }
        if (
          !wsConnection.socket ||
          wsConnection.socket.readyState !== WebSocket.OPEN
        ) {
          continue;
        }
        try {
          wsConnection.socket.send(data);
          if (replayChunk) {
            wsConnection.replayCursorBySession.set(
              sessionId,
              replayChunk.id,
            );
          }
        } catch {
          // ignore
        }
      }
    },

    broadcastExit: (
      sessionId: string,
      exitCode: number,
      signal: number,
    ): void => {
      for (const wsConnection of terminalWsConnections) {
        if (wsConnection.boundSessionId !== sessionId) {
          continue;
        }
        wsConnection.boundSessionId = null;
        wsConnection.replayCursorBySession.delete(sessionId);
        sendControl(wsConnection.socket, {
          t: "x",
          v: 2,
          s: sessionId,
          exitCode,
          signal,
        });
      }
      terminalSessions.delete(sessionId);
    },

    async shutdown(): Promise<void> {
      if (!terminalInputWsServer) {
        return;
      }

      try {
        for (const client of terminalInputWsServer.clients) {
          try {
            client.terminate();
          } catch {
            // ignore
          }
        }

        await new Promise<void>((resolve) => {
          terminalInputWsServer?.close(() => resolve());
        });
      } catch {
        // ignore
      } finally {
        terminalWsConnections.clear();
        terminalInputWsServer = null;
      }
    },
  };
};
```

The `ws-server.ts` return type is a plain object, so no explicit interface is needed — the callers in `runtime.ts` destructure it.

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/terminal/ws-server.ts
git commit -m "feat(server): add terminal WS server module"
```

---

### Task 7: Express Routes Module

**Files:**
- Create: `packages/web/server/src/domains/terminal/routes.ts`

Extract Express route registration from `runtime.js` (lines 465-764): `/api/terminal/create`, `/:sessionId/stream`, `/:sessionId/input`, `/:sessionId/resize`, DELETE, POST restart, POST force-kill. Uses sessions, pty, and ws-server modules.

- [ ] **Step 1: Write the routes module**

```ts
import type { Express, Request, Response } from "express";
import type { IncomingMessage } from "node:http";
import type { TerminalDomainDependencies, PtyProcess } from "./types.js";
import { MAX_TERMINAL_SESSIONS } from "./types.js";
import { getPtyProvider, getTerminalShellCandidates, spawnTerminalPtyWithFallback, sanitizeTerminalEnv } from "./pty.js";
import { getTerminalSessions, createSession, getSessionCount, getTerminalCapabilities } from "./sessions.js";
import { createTerminalOutputReplayBuffer, appendTerminalOutputReplayChunk } from "./replay-buffer.js";

type WsServerHandle = ReturnType<typeof import("./ws-server.js").createTerminalWsServer>;

const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun === "undefined" ? false : true;
const terminalRuntimeName = isBunRuntime ? "bun" : "node";

export const registerTerminalRoutes = (
  app: Express,
  express: typeof import("express"),
  deps: TerminalDomainDependencies,
  wsServer: WsServerHandle,
): void => {
  const { fs, path: pathModule, buildAugmentedPath, searchPathFor, isExecutable } = deps;
  const terminalSessions = getTerminalSessions();

  app.post("/api/terminal/create", async (req: Request, res: Response) => {
    try {
      if (getSessionCount() >= MAX_TERMINAL_SESSIONS) {
        res.status(429).json({ error: "Maximum terminal sessions reached" });
        return;
      }

      const { cwd, cols, rows } = req.body as {
        cwd?: string;
        cols?: number;
        rows?: number;
      };
      if (!cwd) {
        res.status(400).json({ error: "cwd is required" });
        return;
      }

      try {
        await fs.promises.access(cwd);
      } catch {
        res.status(400).json({ error: "Invalid working directory" });
        return;
      }

      const envPath = buildAugmentedPath();
      const resolvedEnv = sanitizeTerminalEnv({
        ...process.env,
        PATH: envPath,
      });

      const shellCandidates = getTerminalShellCandidates(
        process.platform,
        process.env,
        searchPathFor,
        isExecutable,
      );

      const pty = await getPtyProvider(isBunRuntime);
      const { ptyProcess, shell } = spawnTerminalPtyWithFallback(
        pty,
        {
          cols: cols ?? 80,
          rows: rows ?? 24,
          cwd,
          env: resolvedEnv,
        },
        shellCandidates,
      );

      const { sessionId, session: createdSession } = createSession(
        ptyProcess as unknown as PtyProcess,
        pty.backend,
        cwd,
      );

      ptyProcess.onData((data: string) => {
        wsServer.broadcastOutput(sessionId, createdSession, data);
      });

      ptyProcess.onExit(
        ({ exitCode, signal }: { exitCode: number; signal: number }) => {
          console.log(
            `Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`,
          );
          wsServer.broadcastExit(sessionId, exitCode, signal);
        },
      );

      console.log(
        `Created terminal session: ${sessionId} in ${cwd} using shell ${shell}`,
      );
      res.json({
        sessionId,
        cols: cols || 80,
        rows: rows || 24,
        capabilities: getTerminalCapabilities(),
      });
    } catch (error) {
      console.error("Failed to create terminal session:", error);
      const message = error instanceof Error ? error.message : "Failed to create terminal session";
      res.status(500).json({ error: message });
    }
  });

  app.get(
    "/api/terminal/:sessionId/stream",
    (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      const clientId = Math.random().toString(36).substring(7);
      session.clients.add(clientId);
      session.lastActivity = Date.now();

      const ptyBackend = session.ptyBackend || "unknown";
      res.write(
        `data: ${JSON.stringify({ type: "connected", runtime: terminalRuntimeName, ptyBackend })}\n\n`,
      );

      const heartbeatInterval = setInterval(() => {
        try {
          res.write(": heartbeat\n\n");
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      const dataHandler = (data: string) => {
        try {
          session.lastActivity = Date.now();
          const ok = res.write(
            `data: ${JSON.stringify({ type: "data", data })}\n\n`,
          );
          if (
            !ok &&
            session.ptyProcess &&
            typeof (session.ptyProcess as { pause?: () => void }).pause ===
              "function"
          ) {
            (session.ptyProcess as { pause: () => void }).pause();
            res.once("drain", () => {
              if (
                session.ptyProcess &&
                typeof (session.ptyProcess as { resume?: () => void }).resume ===
                  "function"
              ) {
                (session.ptyProcess as { resume: () => void }).resume();
              }
            });
          }
        } catch {
          cleanup();
        }
      };

      const exitHandler = ({
        exitCode,
        signal,
      }: {
        exitCode: number;
        signal: number;
      }) => {
        try {
          res.write(
            `data: ${JSON.stringify({ type: "exit", exitCode, signal })}\n\n`,
          );
          res.end();
        } catch {
          // ignore
        }
        cleanup();
      };

      const dataDisposable = session.ptyProcess.onData(dataHandler);
      const exitDisposable = session.ptyProcess.onExit(exitHandler);

      const cleanup = () => {
        clearInterval(heartbeatInterval);
        session.clients.delete(clientId);

        if (dataDisposable && typeof dataDisposable.dispose === "function") {
          dataDisposable.dispose();
        }
        if (exitDisposable && typeof exitDisposable.dispose === "function") {
          exitDisposable.dispose();
        }

        try {
          res.end();
        } catch {
          // ignore
        }

        console.log(
          `Client ${clientId} disconnected from terminal session ${sessionId}`,
        );
      };

      (req as IncomingMessage).on("close", cleanup);
      (req as IncomingMessage).on("error", cleanup);

      console.log(
        `Terminal connected: session=${sessionId} client=${clientId} runtime=${terminalRuntimeName} pty=${ptyBackend}`,
      );
    },
  );

  app.post(
    "/api/terminal/:sessionId/input",
    express.text({ type: "*/*" }),
    (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      const data = typeof req.body === "string" ? req.body : "";

      try {
        session.ptyProcess.write(data);
        session.lastActivity = Date.now();
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to write to terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to write to terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/resize",
    (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      const { cols, rows } = req.body as { cols?: number; rows?: number };
      if (!cols || !rows) {
        res.status(400).json({ error: "cols and rows are required" });
        return;
      }

      try {
        session.ptyProcess.resize(cols, rows);
        session.lastActivity = Date.now();
        res.json({ success: true, cols, rows });
      } catch (error) {
        console.error("Failed to resize terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to resize terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.delete(
    "/api/terminal/:sessionId",
    (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const session = terminalSessions.get(sessionId);

      if (!session) {
        res.status(404).json({ error: "Terminal session not found" });
        return;
      }

      try {
        session.ptyProcess.kill();
        terminalSessions.delete(sessionId);
        console.log(`Closed terminal session: ${sessionId}`);
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to close terminal:", error);
        const message = error instanceof Error ? error.message : "Failed to close terminal";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/:sessionId/restart",
    async (req: Request, res: Response) => {
      const { sessionId } = req.params;
      const { cwd, cols, rows } = req.body as {
        cwd?: string;
        cols?: number;
        rows?: number;
      };

      if (!cwd) {
        res.status(400).json({ error: "cwd is required" });
        return;
      }

      const existingSession = terminalSessions.get(sessionId);
      if (existingSession) {
        try {
          existingSession.ptyProcess.kill();
        } catch {
          // ignore
        }
        terminalSessions.delete(sessionId);
      }

      try {
        try {
          const stats = await fs.promises.stat(cwd);
          if (!stats.isDirectory()) {
            res.status(400).json({ error: "Invalid working directory: not a directory" });
            return;
          }
        } catch {
          res.status(400).json({ error: "Invalid working directory: not accessible" });
          return;
        }

        const envPath = buildAugmentedPath();
        const resolvedEnv = sanitizeTerminalEnv({
          ...process.env,
          PATH: envPath,
        });

        const shellCandidates = getTerminalShellCandidates(
          process.platform,
          process.env,
          searchPathFor,
          isExecutable,
        );

        const pty = await getPtyProvider(isBunRuntime);
        const { ptyProcess, shell } = spawnTerminalPtyWithFallback(
          pty,
          {
            cols: cols ?? 80,
            rows: rows ?? 24,
            cwd,
            env: resolvedEnv,
          },
          shellCandidates,
        );

        const { sessionId: newSessionId, session: newSession } =
          createSession(ptyProcess as unknown as PtyProcess, pty.backend, cwd);

        ptyProcess.onData((data: string) => {
          wsServer.broadcastOutput(newSessionId, newSession, data);
        });

        ptyProcess.onExit(
          ({
            exitCode,
            signal,
          }: {
            exitCode: number;
            signal: number;
          }) => {
            console.log(
              `Terminal session ${newSessionId} exited with code ${exitCode}, signal ${signal}`,
            );
            wsServer.broadcastExit(newSessionId, exitCode, signal);
          },
        );

        console.log(
          `Restarted terminal session: ${sessionId} -> ${newSessionId} in ${cwd} using shell ${shell}`,
        );
        res.json({
          sessionId: newSessionId,
          cols: cols || 80,
          rows: rows || 24,
          capabilities: getTerminalCapabilities(),
        });
      } catch (error) {
        console.error("Failed to restart terminal session:", error);
        const message = error instanceof Error ? error.message : "Failed to restart terminal session";
        res.status(500).json({ error: message });
      }
    },
  );

  app.post(
    "/api/terminal/force-kill",
    (req: Request, res: Response) => {
      const { sessionId, cwd } = req.body as {
        sessionId?: string;
        cwd?: string;
      };
      let killedCount = 0;

      if (sessionId) {
        const session = terminalSessions.get(sessionId);
        if (session) {
          try {
            session.ptyProcess.kill();
          } catch {
            // ignore
          }
          terminalSessions.delete(sessionId);
          killedCount++;
        }
      } else if (cwd) {
        for (const [id, session] of terminalSessions) {
          if (session.cwd === cwd) {
            try {
              session.ptyProcess.kill();
            } catch {
              // ignore
            }
            terminalSessions.delete(id);
            killedCount++;
          }
        }
      } else {
        for (const [id, session] of terminalSessions) {
          try {
            session.ptyProcess.kill();
          } catch {
            // ignore
          }
          terminalSessions.delete(id);
          killedCount++;
        }
      }

      console.log(`Force killed ${killedCount} terminal session(s)`);
      res.json({ success: true, killedCount });
    },
  );
};
```

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/terminal/routes.ts
git commit -m "feat(server): add terminal Express routes module"
```

---

### Task 8: Terminal Domain Factory (runtime.ts + index.ts)

**Files:**
- Create: `packages/web/server/src/domains/terminal/runtime.ts`
- Create: `packages/web/server/src/domains/terminal/index.ts`

The `createTerminalDomain` factory matches the original `createTerminalRuntime` API exactly — same parameter destructure, same return shape `{ shutdown }` — so the old `index.js` call site works unchanged.

- [ ] **Step 1: Write runtime.ts (factory)**

```ts
import type { TerminalDomain, TerminalDomainDependencies } from "./types.js";
import { createTerminalWsServer } from "./ws-server.js";
import { registerTerminalRoutes } from "./routes.js";
import { getTerminalSessions, startIdleSweep, stopIdleSweep, killAllSessions } from "./sessions.js";

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
```

- [ ] **Step 2: Write index.ts (barrel export)**

```ts
export { createTerminalRuntime } from "./runtime.js";
export type { TerminalDomain, TerminalDomainDependencies } from "./types.js";
export {
  TERMINAL_WS_PATH,
  TERMINAL_HEARTBEAT_INTERVAL_MS,
  TERMINAL_REBIND_WINDOW_MS,
  TERMINAL_MAX_REBINDS_PER_WINDOW,
} from "./types.js";
export { parseRequestPathname, isTerminalWsPathname } from "./protocol.js";
export {
  normalizeTerminalWsMessageToBuffer,
  normalizeTerminalWsMessageToText,
} from "./protocol.js";
export { readTerminalWsControlFrame, createTerminalWsControlFrame } from "./protocol.js";
export { pruneRebindTimestamps, isRebindRateLimited } from "./protocol.js";
export {
  createTerminalOutputReplayBuffer,
  appendTerminalOutputReplayChunk,
  listTerminalOutputReplayChunksSince,
  getLatestTerminalOutputReplayChunkId,
} from "./replay-buffer.js";
export type {
  TerminalControlFrame,
  ReplayBufferState,
  PtyProcess,
  TerminalSession,
} from "./types.js";
```

- [ ] **Step 3: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/terminal/runtime.ts packages/web/server/src/domains/terminal/index.ts
git commit -m "feat(server): add terminal domain factory and barrel export"
```

---

### Task 9: Cut Over — Wire old index.js to TS terminal, delete old JS

**Files:**
- Modify: `packages/web/server/index.js` (import line)
- Delete: All files under `packages/web/server/lib/terminal/`

The cutover: change one import in `index.js` from the old JS path to the compiled TS path. The old `createTerminalRuntime` from TS has the exact same call signature and return shape, so the factory injection at lines 54-69 of `startup-pipeline-runtime.js` and the shutdown at line 64-71 of `shutdown-runtime.js` both work unchanged.

- [ ] **Step 1: Build the TS terminal domain**

Run: `bun run build:web-server`
Expected: PASS — `server/dist/domains/terminal/` created with compiled JS

- [ ] **Step 2: Change the import in old index.js**

Replace line 40:
```js
import { createTerminalRuntime } from './lib/terminal/runtime.js';
```
with:
```js
import { createTerminalRuntime } from './dist/domains/terminal/runtime.js';
```

- [ ] **Step 3: Delete old JS terminal files**

```bash
rm packages/web/server/lib/terminal/index.js
rm packages/web/server/lib/terminal/runtime.js
rm packages/web/server/lib/terminal/terminal-ws-protocol.js
rm packages/web/server/lib/terminal/terminal-ws-protocol.test.js
rm packages/web/server/lib/terminal/output-replay-buffer.js
rm packages/web/server/lib/terminal/output-replay-buffer.test.js
rm packages/web/server/lib/terminal/DOCUMENTATION.md
rmdir packages/web/server/lib/terminal 2>/dev/null || true
```

- [ ] **Step 4: Verify type-check, lint, and build still pass**

```bash
bun run build:web-server
bun run type-check
bun run lint
```
Expected: ALL PASS (type-check, lint 0 errors, build creates dist)

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/index.js
git add -u packages/web/server/lib/terminal/
git commit -m "feat(server): cut over to TS terminal domain, delete old JS terminal module"
```

---

### Task 10: Update shared types with terminal constants

**Files:**
- Modify: `packages/web/server/src/shared/types.ts`

Add terminal-specific constants that were previously in the old `index.js` (lines 260-262) so they are accessible from typed code.

- [ ] **Step 1: Add terminal constants to shared types**

Append after line 82:

```ts
export const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15_000;
export const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 60_000;
export const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 128;
```

- [ ] **Step 2: Verify type-check**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/shared/types.ts
git commit -m "feat(server): add terminal constants to shared types"
```

---

### Task 11: Run the terminal test suite end-to-end

**Files:**
- None (verification only)

- [ ] **Step 1: Build the server**

Run: `bun run build:web-server`
Expected: PASS

- [ ] **Step 2: Run terminal protocol tests**

Run: `cd packages/web && npx vitest run server/src/domains/terminal/protocol.test.ts`
Expected: 22/22 PASS

- [ ] **Step 3: Run terminal replay buffer tests**

Run: `cd packages/web && npx vitest run server/src/domains/terminal/replay-buffer.test.ts`
Expected: 6/6 PASS

- [ ] **Step 4: Full type-check + lint**

```bash
bun run type-check
bun run lint
```
Expected: PASS (type-check clean, lint 0 errors)

- [ ] **Step 5: Commit if anything changed**

```bash
git status
# If dirty, commit fixups; if clean, verification is complete
```

---

## Review

- **Status:** PENDING
- **Reviewer:** (to be dispatched)
- **Date:** 2026-06-01
- **Findings:** (to be populated by reviewer)
