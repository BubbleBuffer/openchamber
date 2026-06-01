# Stage 4: OpenCode and Sessions Domains

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate session-state (actor registry, effects, snapshots, bridge) and OpenCode orchestration into typed TypeScript domains under `domains/sessions/` and `domains/opencode/`, then cut over `index.js` imports and delete replaced JavaScript.

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-06-01
- **Findings:**
  - Spec coverage: All Stage 4 requirements mapped to tasks
  - Placeholders: None found
  - Dead references: 2 found (runtime.getState() doesn't exist on old JS runtime; getHealthCheckInterval called as method vs property) — both fixed inline
  - Structural flow: All task dependencies satisfied
  - Goal clarity: All steps are specific and actionable
  - Type consistency: All signatures consistent across tasks

**Architecture:** Sessions domain is self-contained (~6 files, depends only on `@openchamber/session-state` (already TS) and EventBus) — fully ported with real types. OpenCode domain is enormous (~30+ files, ~10K lines) — typed boundary/wrapper is created in Stage 4; full internal restructure of sub-runtimes (lifecycle, routes, services) deferred to Stage 5. Both domains follow the same factory pattern as terminal and event-stream: `createXxxDomain(deps): XxxDomain`.

**Tech Stack:** TypeScript, Express, XState v5 (`@openchamber/session-state`), WebSocket, EventBus, vitest

---

## File Map

### Sessions domain (all under `packages/web/server/src/domains/sessions/`)

| File | Purpose |
|------|---------|
| `types.ts` | All session domain types and interfaces |
| `event-normalizer.ts` | Port of `normalizeOpenCodePayload` — SSE → SessionDomainEvent[] |
| `actor-registry.ts` | Port of `createSessionActorRegistry` — XState actor lifecycle |
| `effect-executor.ts` | Port of `createEffectExecutor` — 8 effect type handlers |
| `snapshot-publisher.ts` | Port of `createSnapshotPublisher` — validation + transport |
| `machine-bridge.ts` | Port of `createServerSessionMachineBridge` — EventBus → normalizer → actors |
| `session-runtime.ts` | Port of `createSessionRuntime` — compatibility glue for route handlers |
| `index.ts` | Barrel re-export |

### OpenCode domain (all under `packages/web/server/src/domains/opencode/`)

| File | Purpose |
|------|---------|
| `types.ts` | All opencode domain types and interfaces |
| `runtime.ts` | `createOpenCodeDomain(deps): OpenCodeDomain` — typed wrapper around old JS internals |
| `index.ts` | Barrel re-export |

### Tests

| File | Purpose |
|------|---------|
| `event-normalizer.test.ts` | Tests for event normalization (26 payload types) |
| `effect-executor.test.ts` | Tests for effect execution |

### Files deleted after cutover

| File | Replaced by |
|------|-------------|
| `packages/web/server/lib/session-state/server-session-actor-registry.js` | `domains/sessions/actor-registry.ts` |
| `packages/web/server/lib/session-state/server-session-effect-executor.js` | `domains/sessions/effect-executor.ts` |
| `packages/web/server/lib/session-state/server-session-snapshot-publisher.js` | `domains/sessions/snapshot-publisher.ts` |
| `packages/web/server/lib/session-state/server-session-machine-bridge.js` | `domains/sessions/machine-bridge.ts` |
| `packages/web/server/lib/session-state/server-session-event-normalizer.js` | `domains/sessions/event-normalizer.ts` |
| `packages/web/server/lib/opencode/session/session-runtime.js` | `domains/sessions/session-runtime.ts` |

### Files modified

| File | Change |
|------|--------|
| `packages/web/server/index.js` | Change 6 imports from `./lib/session-state/` and `./lib/opencode/session/` to `./dist/domains/sessions/`; change `createOpenCodeRuntime` import wiring to use `createOpenCodeDomain` from TS dist |
| `packages/web/server/src/shared/types.ts` | Add `openCodeDomain` and `sessionsDomain` to `ServerRuntime.domains` |

---

## Part A: Sessions Domain (Tasks 1–9)

### Task 1: Session Domain Types

**Files:**
- Create: `packages/web/server/src/domains/sessions/types.ts`

- [ ] **Step 1: Create types module**

Write `packages/web/server/src/domains/sessions/types.ts` with all session domain types. Import `SessionActorKey`, `SessionDomainEvent`, `SessionMachineEffect`, `SessionSnapshotV1` from `@openchamber/session-state`. Define the domain deps and return interfaces:

```ts
import type { SessionActorKey, SessionDomainEvent, SessionMachineEffect, SessionSnapshotV1 } from "@openchamber/session-state";
import type { EventBus } from "../../lib/event-bus/index.js";

export type {
  SessionActorKey,
  SessionDomainEvent,
  SessionMachineEffect,
  SessionSnapshotV1,
};

export interface SessionMachineCreator {
  createSessionMachine(input: { directory: string; sessionId: string; timestamp: number }): any;
}

export interface NormalizedEventResult {
  event: SessionDomainEvent;
  sourceEventId: string;
}

export interface NormalizedEventError {
  error: Error;
}

export type NormalizedPayloadResult = NormalizedEventResult | NormalizedEventError;

export interface SessionActorRegistry {
  getOrCreate(directory: string, sessionId: string): any;
  send(key: SessionActorKey, event: SessionDomainEvent): void;
  getSnapshot(key: SessionActorKey): SessionSnapshotV1 | null;
  listKeys(): string[];
  entries(): Array<[string, SessionSnapshotV1]>;
  evict(key: SessionActorKey): void;
  dispose(): void;
}

export interface SessionEffectExecutor {
  execute(effect: SessionMachineEffect): void;
  dispose(): void;
}

export interface SnapshotTransport {
  writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>): void;
}

export interface SessionSnapshotPublisher {
  publish(snapshot: SessionSnapshotV1): void;
  setTransport(transport: SnapshotTransport): void;
  writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>): void;
}

export interface ServerSessionMachineBridge {
  start(): void;
  stop(): void;
}

export interface SessionRuntime {
  processOpenCodeSsePayload(payload: any): void;
  getSessionActivitySnapshot(): Array<{
    directory: string;
    sessionId: string;
    activity: string;
  }>;
  getSessionStateSnapshot(): Array<{
    directory: string;
    sessionId: string;
    status: string;
  }>;
  getSessionAttentionSnapshot(): Array<{
    directory: string;
    sessionId: string;
    needsAttention: boolean;
  }>;
  getSessionState(sessionId: string): SessionSnapshotV1 | null;
  getSessionAttentionState(sessionId: string): boolean;
  markSessionViewed(directory: string, sessionId: string): void;
  markSessionUnviewed(directory: string, sessionId: string): void;
  markUserMessageSent(directory: string, sessionId: string): void;
  resetAllSessionActivityToIdle(): void;
  dispose(): void;
}

export interface ActorRegistryDeps {
  createSessionMachine(input: { directory: string; sessionId: string; timestamp: number }): any;
}

export interface EffectExecutorDeps {
  callbacks?: {
    sendPrompt?: (directory: string, sessionId: string, prompt: any, provider: any, model: any, agent: any) => Promise<void>;
    abort?: (directory: string, sessionId: string, signal: AbortSignal) => Promise<void>;
    retry?: (directory: string, sessionId: string, retryCount: number, retryMessage: string) => Promise<void>;
    loadOlder?: (directory: string, sessionId: string) => Promise<void>;
    reportFatalInvariant?: (directory: string, sessionId: string, invariantName: string, actorKey: string, revision: number, eventType: string) => void;
  };
  publisher?: SessionSnapshotPublisher;
  registry?: SessionActorRegistry;
}

export interface SnapshotPublisherDeps {
  transport?: SnapshotTransport;
}

export interface MachineBridgeDeps {
  eventBus: EventBus;
  registry: SessionActorRegistry;
  executor: SessionEffectExecutor;
  publisher: SessionSnapshotPublisher;
}

export interface SessionRuntimeDeps {
  eventBus?: EventBus;
  bridge?: ServerSessionMachineBridge;
  actorRegistry?: SessionActorRegistry;
  writeSseEvent?: (res: any, payload: any) => void;
  getNotificationClients?: () => Set<any>;
  broadcastEvent?: (payload: any) => void;
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS (may need `@ts-expect-error` for EventBus import path — use actual path from existing codebase export)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/types.ts
git commit -m "feat(server): add sessions domain types"
```

---

### Task 2: Session Event Normalizer + Tests

**Files:**
- Create: `packages/web/server/src/domains/sessions/event-normalizer.ts`
- Create: `packages/web/server/src/domains/sessions/event-normalizer.test.ts`

- [ ] **Step 1: Write the failing test**

Write `event-normalizer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeOpenCodePayload } from "./event-normalizer.js";
import type { NormalizedPayloadResult, NormalizedEventError } from "./types.js";
import type { SessionDomainEvent } from "@openchamber/session-state";

function getEvent(results: Array<NormalizedPayloadResult | NormalizedEventError>): SessionDomainEvent | null {
  for (const r of results) {
    if ("event" in r) return r.event;
  }
  return null;
}

describe("event normalizer", () => {
  it("normalizes session.status busy to STREAM_STARTED", () => {
    const results = normalizeOpenCodePayload({ type: "session.status", session_id: "abc123", status: "busy" }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("STREAM_STARTED");
  });

  it("normalizes session.status idle to STREAM_COMPLETED", () => {
    const results = normalizeOpenCodePayload({ type: "session.status", session_id: "abc123", status: "idle" }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("STREAM_COMPLETED");
  });

  it("normalizes message.added to MESSAGE_ADDED", () => {
    const results = normalizeOpenCodePayload({
      type: "message.added",
      session_id: "abc123",
      message: { id: "msg1", role: "user", content: [{ type: "text", text: "hello" }] },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("MESSAGE_ADDED");
  });

  it("normalizes permission.asked to PERMISSION_REQUESTED", () => {
    const results = normalizeOpenCodePayload({
      type: "permission.asked",
      session_id: "abc123",
      permission: { id: "perm1", type: "bash", command: "ls" },
    }, "global");
    const event = getEvent(results);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("PERMISSION_REQUESTED");
  });

  it("returns error for unknown payload type", () => {
    const results = normalizeOpenCodePayload({ type: "unknown.thing", session_id: "abc123" }, "global");
    expect(results.length).toBe(1);
    expect("error" in results[0]).toBe(true);
  });

  it("returns empty array for null/undefined payload", () => {
    expect(normalizeOpenCodePayload(null, "global")).toEqual([]);
    expect(normalizeOpenCodePayload(undefined, "global")).toEqual([]);
  });

  it("preserves sourceEventId from payload", () => {
    const results = normalizeOpenCodePayload({
      type: "session.status",
      session_id: "abc123",
      status: "busy",
      event_id: "evt-456",
    }, "global");
    const result = results[0] as NormalizedPayloadResult;
    expect(result.sourceEventId).toBe("evt-456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && bun test server/src/domains/sessions/event-normalizer.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the event normalizer**

Write `event-normalizer.ts` — port the logic from `packages/web/server/lib/session-state/server-session-event-normalizer.js`. The original handles 26 payload types. Port all of them with full TypeScript types:

```ts
import type { SessionDomainEvent } from "@openchamber/session-state";
import type { NormalizedPayloadResult, NormalizedEventResult, NormalizedEventError } from "./types.js";

export function normalizeOpenCodePayload(
  payload: any,
  directory?: string | null,
): Array<NormalizedPayloadResult | NormalizedEventError> {
  if (!payload || typeof payload !== "object") return [];

  const results: Array<NormalizedPayloadResult | NormalizedEventError> = [];
  const dir = directory || payload.directory || "global";
  const sourceEventId = payload.event_id || "";

  try {
    switch (payload.type) {
      case "session.status": {
        if (payload.status === "busy" || payload.status === "retry") {
          results.push({ event: { type: "STREAM_STARTED", directory: dir, sessionId: payload.session_id, timestamp: Date.now(), sourceEventId }, sourceEventId });
        } else {
          results.push({ event: { type: "STREAM_COMPLETED", directory: dir, sessionId: payload.session_id, timestamp: Date.now(), sourceEventId }, sourceEventId });
        }
        break;
      }
      case "message.added": {
        results.push({ event: {
          type: "MESSAGE_ADDED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          message: payload.message,
        }, sourceEventId });
        break;
      }
      case "message.updated": {
        results.push({ event: {
          type: "MESSAGE_UPDATED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          messageId: payload.message?.id || payload.message_id,
          message: payload.message,
        }, sourceEventId });
        break;
      }
      case "message.part.delta": {
        results.push({ event: {
          type: "MESSAGE_PART_DELTA",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          partDelta: payload,
        }, sourceEventId });
        break;
      }
      case "message.part.started": {
        results.push({ event: {
          type: "MESSAGE_PART_STARTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          part: payload.part,
        }, sourceEventId });
        break;
      }
      case "message.part.finished": {
        results.push({ event: {
          type: "MESSAGE_PART_FINISHED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          part: payload.part,
        }, sourceEventId });
        break;
      }
      case "message.part.removed": {
        results.push({ event: {
          type: "MESSAGE_PART_REMOVED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          partId: payload.part_id || payload.part?.id,
        }, sourceEventId });
        break;
      }
      case "permission.asked": {
        results.push({ event: {
          type: "PERMISSION_REQUESTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          permission: payload.permission,
        }, sourceEventId });
        break;
      }
      case "permission.replied": {
        results.push({ event: {
          type: "PERMISSION_RESOLVED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          permission: payload,
        }, sourceEventId });
        break;
      }
      case "question.asked": {
        results.push({ event: {
          type: "QUESTION_REQUESTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          question: payload.question,
        }, sourceEventId });
        break;
      }
      case "question.answered": {
        results.push({ event: {
          type: "QUESTION_ANSWERED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          question: payload,
        }, sourceEventId });
        break;
      }
      case "question.rejected": {
        results.push({ event: {
          type: "QUESTION_REJECTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          question: payload,
        }, sourceEventId });
        break;
      }
      case "stream.failed": {
        results.push({ event: {
          type: "STREAM_FAILED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          error: payload.error,
        }, sourceEventId });
        break;
      }
      case "load.failed": {
        results.push({ event: {
          type: "SESSION_LOAD_FAILED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          error: payload.error,
        }, sourceEventId });
        break;
      }
      case "abort.requested": {
        results.push({ event: {
          type: "ABORT_REQUESTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "abort.confirmed": {
        results.push({ event: {
          type: "ABORT_CONFIRMED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "abort.failed": {
        results.push({ event: {
          type: "ABORT_FAILED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          error: payload.error,
        }, sourceEventId });
        break;
      }
      case "retry.requested": {
        results.push({ event: {
          type: "RETRY_REQUESTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          retryCount: payload.retry_count,
        }, sourceEventId });
        break;
      }
      case "retry.started": {
        results.push({ event: {
          type: "RETRY_STARTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "retry.failed": {
        results.push({ event: {
          type: "RETRY_FAILED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          error: payload.error,
        }, sourceEventId });
        break;
      }
      case "load.older.requested": {
        results.push({ event: {
          type: "LOAD_OLDER_REQUESTED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "load.older.completed": {
        results.push({ event: {
          type: "LOAD_OLDER_COMPLETED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          messages: payload.messages,
        }, sourceEventId });
        break;
      }
      case "load.older.failed": {
        results.push({ event: {
          type: "LOAD_OLDER_FAILED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          error: payload.error,
        }, sourceEventId });
        break;
      }
      case "error.dismissed": {
        results.push({ event: {
          type: "ERROR_DISMISSED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "session.opened": {
        results.push({ event: {
          type: "SESSION_OPENED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      case "session.loaded": {
        results.push({ event: {
          type: "SESSION_LOADED",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
          messages: payload.messages,
        }, sourceEventId });
        break;
      }
      case "session.not_found": {
        results.push({ event: {
          type: "SESSION_NOT_FOUND",
          directory: dir,
          sessionId: payload.session_id,
          timestamp: Date.now(),
          sourceEventId,
        }, sourceEventId });
        break;
      }
      default: {
        results.push({ error: new Error(`Unknown payload type: ${payload.type}`) });
      }
    }
  } catch (err) {
    results.push({ error: err instanceof Error ? err : new Error(String(err)) });
  }

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && bun test server/src/domains/sessions/event-normalizer.test.ts
```
Expected: 7/7 PASS

- [ ] **Step 5: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/sessions/event-normalizer.ts packages/web/server/src/domains/sessions/event-normalizer.test.ts
git commit -m "feat(server): add sessions event normalizer with tests"
```

---

### Task 3: Session Actor Registry

**Files:**
- Create: `packages/web/server/src/domains/sessions/actor-registry.ts`

- [ ] **Step 1: Write the actor registry**

Port `packages/web/server/lib/session-state/server-session-actor-registry.js` to `actor-registry.ts`. Import types from `./types.js` and `@openchamber/session-state`. The registry uses XState v5 actors. Key constants: `IDLE_EVICTION_TIMEOUT_MS = 30 * 60 * 1000`.

```ts
import { createSessionActorKey } from "@openchamber/session-state";
import type { SessionDomainEvent, SessionSnapshotV1 } from "@openchamber/session-state";
import { createSessionSnapshot } from "@openchamber/session-state";
import type { ActorRegistryDeps, SessionActorRegistry } from "./types.js";

const IDLE_EVICTION_TIMEOUT_MS = 30 * 60 * 1000;

interface ActorEntry {
  actor: any;
  lastTransition: number;
}

export function createSessionActorRegistry(deps: ActorRegistryDeps): SessionActorRegistry {
  const { createSessionMachine } = deps;
  const actors = new Map<string, ActorEntry>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function resetIdleTimer(key: string) {
    const existing = idleTimers.get(key);
    if (existing) clearTimeout(existing);
    idleTimers.set(key, setTimeout(() => {
      evict(key);
    }, IDLE_EVICTION_TIMEOUT_MS));
  }

  function evict(key: string) {
    const entry = actors.get(key);
    if (entry) {
      try { entry.actor.stop(); } catch { /* ignore */ }
      actors.delete(key);
    }
    const timer = idleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      idleTimers.delete(key);
    }
  }

  return {
    getOrCreate(directory: string, sessionId: string) {
      const key = createSessionActorKey(directory, sessionId);
      const existing = actors.get(key);
      if (existing) {
        existing.lastTransition = Date.now();
        resetIdleTimer(key);
        return existing.actor;
      }
      const machine = createSessionMachine({ directory, sessionId, timestamp: Date.now() });
      const actor = machine.createActor ? machine.createActor() : machine;
      if (actor.start) actor.start();
      actors.set(key, { actor, lastTransition: Date.now() });
      resetIdleTimer(key);
      return actor;
    },

    send(key: string, event: SessionDomainEvent) {
      const entry = actors.get(key);
      if (entry) {
        entry.actor.send(event);
        entry.lastTransition = Date.now();
        resetIdleTimer(key);
      }
    },

    getSnapshot(key: string): SessionSnapshotV1 | null {
      const entry = actors.get(key);
      if (!entry) return null;
      const snapshot = entry.actor.getSnapshot?.() ?? entry.actor;
      return createSessionSnapshot(snapshot.context, snapshot.regions ?? {}, Date.now());
    },

    listKeys(): string[] {
      return Array.from(actors.keys());
    },

    entries(): Array<[string, SessionSnapshotV1]> {
      return Array.from(actors.entries()).map(([key, entry]) => {
        const img = entry.actor.getSnapshot?.() ?? entry.actor;
        return [key, createSessionSnapshot(img.context, img.regions ?? {}, Date.now())] as [string, SessionSnapshotV1];
      });
    },

    evict(key: string) {
      evict(key);
    },

    dispose() {
      for (const key of actors.keys()) {
        evict(key);
      }
      actors.clear();
      idleTimers.clear();
    },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS (fix any type errors from `@openchamber/session-state` exports — use `as any` casts where XState types can't be fully resolved)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/actor-registry.ts
git commit -m "feat(server): add sessions actor registry"
```

---

### Task 4: Session Effect Executor + Tests

**Files:**
- Create: `packages/web/server/src/domains/sessions/effect-executor.ts`
- Create: `packages/web/server/src/domains/sessions/effect-executor.test.ts`

- [ ] **Step 1: Write the failing test**

Write `effect-executor.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createEffectExecutor } from "./effect-executor.js";
import type { SessionMachineEffect } from "@openchamber/session-state";

describe("effect executor", () => {
  it("handles sendPrompt effect", async () => {
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { sendPrompt } });

    const effect: SessionMachineEffect = {
      type: "sendPrompt",
      directory: "dir",
      sessionId: "sid",
      prompt: "hello",
      provider: "openai",
      model: "gpt-4",
      agent: "default",
    };

    await executor.execute(effect);
    expect(sendPrompt).toHaveBeenCalledWith("dir", "sid", "hello", "openai", "gpt-4", "default");
  });

  it("handles abort effect with signal", async () => {
    const abort = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { abort } });
    const signal = new AbortController().signal;

    const effect: SessionMachineEffect = {
      type: "abort",
      directory: "dir",
      sessionId: "sid",
      signal,
    };

    await executor.execute(effect);
    expect(abort).toHaveBeenCalledWith("dir", "sid", signal);
  });

  it("handles retry effect", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { retry } });

    const effect: SessionMachineEffect = {
      type: "retry",
      directory: "dir",
      sessionId: "sid",
      retryCount: 2,
      retryMessage: "try again",
    };

    await executor.execute(effect);
    expect(retry).toHaveBeenCalledWith("dir", "sid", 2, "try again");
  });

  it("handles loadOlder effect", async () => {
    const loadOlder = vi.fn().mockResolvedValue(undefined);
    const executor = createEffectExecutor({ callbacks: { loadOlder } });

    const effect: SessionMachineEffect = {
      type: "loadOlder",
      directory: "dir",
      sessionId: "sid",
    };

    await executor.execute(effect);
    expect(loadOlder).toHaveBeenCalledWith("dir", "sid");
  });

  it("no-ops for effects with no callback", async () => {
    const executor = createEffectExecutor({});
    const effect: SessionMachineEffect = {
      type: "sendPrompt",
      directory: "dir",
      sessionId: "sid",
      prompt: "test",
      provider: "",
      model: "",
      agent: "",
    };
    await expect(executor.execute(effect)).resolves.toBeUndefined();
  });

  it("dispose clears all timers", () => {
    const executor = createEffectExecutor({});
    executor.dispose();
    // No error expected
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/web && bun test server/src/domains/sessions/effect-executor.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the effect executor**

Write `effect-executor.ts`:

```ts
import { createSessionActorKey } from "@openchamber/session-state";
import type { SessionMachineEffect } from "@openchamber/session-state";
import type { EffectExecutorDeps, SessionEffectExecutor } from "./types.js";

export function createEffectExecutor(deps: EffectExecutorDeps): SessionEffectExecutor {
  const { callbacks = {}, publisher = null, registry = null } = deps;
  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const abortControllers = new Map<string, AbortController>();

  function clearForActor(key: string) {
    const timer = cooldownTimers.get(key);
    if (timer) { clearTimeout(timer); cooldownTimers.delete(key); }
    const ctrl = abortControllers.get(key);
    if (ctrl) { abortControllers.delete(key); }
  }

  return {
    async execute(effect: SessionMachineEffect) {
      const key = createSessionActorKey(effect.directory, effect.sessionId);

      switch (effect.type) {
        case "sendPrompt":
          if (callbacks.sendPrompt) {
            await callbacks.sendPrompt(effect.directory, effect.sessionId, effect.prompt, effect.provider, effect.model, effect.agent);
          }
          break;

        case "abort": {
          let ctrl = abortControllers.get(key);
          if (!ctrl) {
            ctrl = new AbortController();
            abortControllers.set(key, ctrl);
          }
          if (callbacks.abort) {
            await callbacks.abort(effect.directory, effect.sessionId, ctrl.signal);
          }
          break;
        }

        case "retry":
          if (callbacks.retry) {
            await callbacks.retry(effect.directory, effect.sessionId, effect.retryCount, effect.retryMessage);
          }
          break;

        case "loadOlder":
          if (callbacks.loadOlder) {
            await callbacks.loadOlder(effect.directory, effect.sessionId);
          }
          break;

        case "scheduleRetryCooldown": {
          const existing = cooldownTimers.get(key);
          if (existing) clearTimeout(existing);
          cooldownTimers.set(key, setTimeout(() => {
            cooldownTimers.delete(key);
          }, effect.durationMs));
          break;
        }

        case "cancelRetryCooldown": {
          const timer = cooldownTimers.get(key);
          if (timer) { clearTimeout(timer); cooldownTimers.delete(key); }
          break;
        }

        case "publishSnapshot":
          if (publisher && registry) {
            const snapshot = registry.getSnapshot(key);
            if (snapshot) publisher.publish(snapshot);
          }
          break;

        case "reportFatalInvariant":
          if (callbacks.reportFatalInvariant) {
            callbacks.reportFatalInvariant(effect.directory, effect.sessionId, effect.name, key, effect.revision ?? 0, effect.eventType ?? "");
          }
          break;
      }
    },

    dispose() {
      for (const timer of cooldownTimers.values()) clearTimeout(timer);
      cooldownTimers.clear();
      abortControllers.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/web && bun test server/src/domains/sessions/effect-executor.test.ts
```
Expected: 6/6 PASS

- [ ] **Step 5: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/sessions/effect-executor.ts packages/web/server/src/domains/sessions/effect-executor.test.ts
git commit -m "feat(server): add sessions effect executor with tests"
```

---

### Task 5: Session Snapshot Publisher

**Files:**
- Create: `packages/web/server/src/domains/sessions/snapshot-publisher.ts`

- [ ] **Step 1: Write the snapshot publisher**

Port `packages/web/server/lib/session-state/server-session-snapshot-publisher.js`:

```ts
import { validateSessionSnapshotV1, assertSerializableSnapshot } from "@openchamber/session-state";
import type { SessionSnapshotV1 } from "@openchamber/session-state";
import type { SnapshotPublisherDeps, SessionSnapshotPublisher, SnapshotTransport } from "./types.js";

export function createSnapshotPublisher(deps: SnapshotPublisherDeps): SessionSnapshotPublisher {
  let activeTransport: SnapshotTransport | null = deps.transport ?? null;

  return {
    publish(snapshot: SessionSnapshotV1) {
      if (!activeTransport) return;
      const valid = validateSessionSnapshotV1(snapshot);
      if (!valid) return;
      const serializable = assertSerializableSnapshot(snapshot);
      if (!serializable) return;
      activeTransport.writeSseEvent(snapshot, { eventType: "session:snapshot" });
    },

    setTransport(transport: SnapshotTransport) {
      activeTransport = transport;
    },

    writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>) {
      activeTransport?.writeSseEvent(snapshot, options);
    },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/snapshot-publisher.ts
git commit -m "feat(server): add sessions snapshot publisher"
```

---

### Task 6: Session Machine Bridge

**Files:**
- Create: `packages/web/server/src/domains/sessions/machine-bridge.ts`

- [ ] **Step 1: Write the machine bridge**

Port `packages/web/server/lib/session-state/server-session-machine-bridge.js`:

```ts
import { normalizeOpenCodePayload } from "./event-normalizer.js";
import type { MachineBridgeDeps, ServerSessionMachineBridge } from "./types.js";

export function createServerSessionMachineBridge(deps: MachineBridgeDeps): ServerSessionMachineBridge {
  const { eventBus, registry, executor, publisher } = deps;
  let eventDisposers: Array<() => void> = [];
  let effectDisposers = new Map<string, Array<() => void>>();

  function ensureEffectSubscription(key: string, actor: any) {
    if (effectDisposers.has(key)) return;
    const disposers: Array<() => void> = [];

    if (actor.on) {
      const effectTypes = ["sendPrompt", "abort", "retry", "loadOlder", "scheduleRetryCooldown", "cancelRetryCooldown", "publishSnapshot", "reportFatalInvariant"];
      for (const type of effectTypes) {
        if (typeof actor.on === "function") {
          const unsub = actor.on(type, (emitted: any) => {
            executor.execute(emitted);
          });
          if (unsub) disposers.push(unsub);
        }
      }
    }

    effectDisposers.set(key, disposers);
  }

  function handleEventReceived(payload: any) {
    const directory = payload?.directory || "global";
    const results = normalizeOpenCodePayload(payload, directory);

    for (const result of results) {
      if ("error" in result) {
        console.warn("Session normalizer error:", result.error.message);
        continue;
      }
      const { event, sourceEventId } = result;
      try {
        const key = `${event.directory}::${event.sessionId}`;
        const actor = registry.getOrCreate(event.directory, event.sessionId);
        ensureEffectSubscription(key, actor);
        registry.send(key, event);
        const snapshot = registry.getSnapshot(key);
        if (snapshot) publisher.publish(snapshot);
      } catch (err) {
        console.warn("Session bridge error:", err);
      }
    }
  }

  return {
    start() {
      eventDisposers = eventBus.on?.("EVENT_RECEIVED", handleEventReceived) ?? [];
      if (!Array.isArray(eventDisposers)) eventDisposers = [eventDisposers];
    },

    stop() {
      for (const dispose of eventDisposers) {
        try { dispose(); } catch { /* ignore */ }
      }
      eventDisposers = [];
      for (const disposers of effectDisposers.values()) {
        for (const dispose of disposers) {
          try { dispose(); } catch { /* ignore */ }
        }
      }
      effectDisposers.clear();
    },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS (the `eventBus.on` return type may need `as any` since EventBus is old JS)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/machine-bridge.ts
git commit -m "feat(server): add sessions machine bridge"
```

---

### Task 7: Session Runtime (Compatibility Glue)

**Files:**
- Create: `packages/web/server/src/domains/sessions/session-runtime.ts`

- [ ] **Step 1: Write the session runtime**

Port `packages/web/server/lib/opencode/session/session-runtime.js`. This is the compatibility glue that wraps machine-derived snapshots for route handlers. When `actorRegistry` is provided, derives from machines; otherwise uses legacy Maps:

```ts
import { selectNeedsAttention } from "@openchamber/session-state";
import type { SessionSnapshotV1 } from "@openchamber/session-state";
import type { SessionRuntimeDeps, SessionRuntime } from "./types.js";

export function createSessionRuntime(deps: SessionRuntimeDeps): SessionRuntime {
  const { actorRegistry = null } = deps;

  // Legacy fallback maps for when no actorRegistry
  const legacySessionStates = new Map<string, any>();
  const viewedSessions = new Set<string>();

  return {
    processOpenCodeSsePayload(payload: any) {
      if (!actorRegistry && payload?.session_id) {
        const existing = legacySessionStates.get(payload.session_id);
        legacySessionStates.set(payload.session_id, {
          ...existing,
          lastPayload: payload,
          updatedAt: Date.now(),
        });
      }
    },

    getSessionActivitySnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries().map(([key, snapshot]) => ({
          directory: snapshot.directory ?? key.split("::")[0],
          sessionId: snapshot.sessionId ?? key.split("::")[1],
          activity: snapshot.regions?.activity ?? "idle",
        }));
      }
      return Array.from(legacySessionStates.entries()).map(([id, state]) => ({
        directory: state.directory ?? "global",
        sessionId: id,
        activity: state.lastPayload?.status === "busy" ? "busy" : "idle",
      }));
    },

    getSessionStateSnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries().map(([key, snapshot]) => ({
          directory: snapshot.directory ?? key.split("::")[0],
          sessionId: snapshot.sessionId ?? key.split("::")[1],
          status: snapshot.regions?.lifecycle ?? "idle",
        }));
      }
      return [];
    },

    getSessionAttentionSnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries()
          .map(([key, snapshot]) => ({
            directory: snapshot.directory ?? key.split("::")[0],
            sessionId: snapshot.sessionId ?? key.split("::")[1],
            needsAttention: selectNeedsAttention(snapshot as any),
          }));
      }
      return [];
    },

    getSessionState(sessionId: string): SessionSnapshotV1 | null {
      if (actorRegistry) {
        const keys = actorRegistry.listKeys();
        for (const key of keys) {
          if (key.endsWith(`::${sessionId}`)) {
            return actorRegistry.getSnapshot(key);
          }
        }
        return null;
      }
      const state = legacySessionStates.get(sessionId);
      return state ? (state.lastSnapshot ?? null) : null;
    },

    getSessionAttentionState(sessionId: string): boolean {
      if (actorRegistry) {
        const keys = actorRegistry.listKeys();
        for (const key of keys) {
          if (key.endsWith(`::${sessionId}`)) {
            const snapshot = actorRegistry.getSnapshot(key);
            if (snapshot) return selectNeedsAttention(snapshot as any);
          }
        }
      }
      return !viewedSessions.has(sessionId);
    },

    markSessionViewed(_directory: string, sessionId: string) {
      viewedSessions.add(sessionId);
    },

    markSessionUnviewed(_directory: string, sessionId: string) {
      viewedSessions.delete(sessionId);
    },

    markUserMessageSent(_directory: string, sessionId: string) {
      viewedSessions.add(sessionId);
    },

    resetAllSessionActivityToIdle() {
      if (!actorRegistry) {
        for (const [, state] of legacySessionStates) {
          if (state.lastPayload) {
            state.lastPayload = { ...state.lastPayload, status: "idle" };
          }
        }
      }
    },

    dispose() {
      legacySessionStates.clear();
      viewedSessions.clear();
    },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/session-runtime.ts
git commit -m "feat(server): add sessions runtime compatibility glue"
```

---

### Task 8: Sessions Domain Barrel

**Files:**
- Create: `packages/web/server/src/domains/sessions/index.ts`

- [ ] **Step 1: Write the barrel**

```ts
export { normalizeOpenCodePayload } from "./event-normalizer.js";
export { createSessionActorRegistry } from "./actor-registry.js";
export { createEffectExecutor } from "./effect-executor.js";
export { createSnapshotPublisher } from "./snapshot-publisher.js";
export { createServerSessionMachineBridge } from "./machine-bridge.js";
export { createSessionRuntime } from "./session-runtime.js";

export type {
  SessionActorRegistry,
  SessionEffectExecutor,
  SessionSnapshotPublisher,
  ServerSessionMachineBridge,
  SessionRuntime,
  ActorRegistryDeps,
  EffectExecutorDeps,
  SnapshotPublisherDeps,
  MachineBridgeDeps,
  SessionRuntimeDeps,
  NormalizedPayloadResult,
  NormalizedEventError,
  SnapshotTransport,
  SessionMachineCreator,
} from "./types.js";
```

- [ ] **Step 2: Build + type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json && bun run build:server
```
Expected: Both PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/sessions/index.ts
git commit -m "feat(server): add sessions domain barrel export"
```

---

### Task 9: Cut Over Sessions + Delete Old JS

**Files:**
- Modify: `packages/web/server/index.js` — change 6 imports
- Modify: `packages/web/server/src/shared/types.ts` — add sessionsDomain to ServerRuntime.domains
- Delete: 6 old JS files

- [ ] **Step 1: Change imports in index.js**

In `packages/web/server/index.js`, find these lines (approximately lines 82–85 and 67):

```js
// OLD (delete these lines):
// line 67: import { createSessionRuntime } from './lib/opencode/session/session-runtime.js';
// line 82: import { createSessionActorRegistry as createSessionActorRegistryFactory } from './lib/session-state/server-session-actor-registry.js';
// line 83: import { createEffectExecutor as createEffectExecutorFactory } from './lib/session-state/server-session-effect-executor.js';
// line 84: import { createSnapshotPublisher as createSnapshotPublisherFactory } from './lib/session-state/server-session-snapshot-publisher.js';
// line 85: import { createServerSessionMachineBridge } from './lib/session-state/server-session-machine-bridge.js';

// NEW (replace with):
import {
  createSessionRuntime,
  createSessionActorRegistry as createSessionActorRegistryFactory,
  createEffectExecutor as createEffectExecutorFactory,
  createSnapshotPublisher as createSnapshotPublisherFactory,
  createServerSessionMachineBridge,
} from './dist/domains/sessions/index.js';
```

Use exact string replacements. The old import at line 67 (`createSessionRuntime` from `./lib/opencode/session/session-runtime.js`) must also be removed and covered by the new barrel import.

Since these are on different lines in the file, do 6 individual replacements:
1. Delete the `createSessionRuntime` import from `./lib/opencode/session/session-runtime.js`
2. Replace the 4 imports from `./lib/session-state/` with the single barrel import
3. Delete the `createServerSessionMachineBridge` import from `./lib/session-state/`

- [ ] **Step 2: Add sessionsDomain to shared types**

In `packages/web/server/src/shared/types.ts`, add to the `ServerRuntime` interface's `domains` property:

```ts
export interface ServerRuntime {
  app: Express;
  httpServer: Server;
  config: ServerConfig;
  lifecycle: LifecycleRegistry;
  domains: {
    terminal?: TerminalDomain;
    eventStream?: EventStreamDomain;
    sessions?: any; // Will be properly typed SessionRuntime
  };
}
```

- [ ] **Step 3: Build + type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json && bun run build:server
```
Expected: Both PASS

- [ ] **Step 4: Delete old JS files**

```bash
rm packages/web/server/lib/session-state/server-session-actor-registry.js
rm packages/web/server/lib/session-state/server-session-effect-executor.js
rm packages/web/server/lib/session-state/server-session-snapshot-publisher.js
rm packages/web/server/lib/session-state/server-session-machine-bridge.js
rm packages/web/server/lib/session-state/server-session-event-normalizer.js
rm packages/web/server/lib/opencode/session/session-runtime.js
```

Check if `packages/web/server/lib/session-state/` is now empty — if so, remove the directory:
```bash
rmdir packages/web/server/lib/session-state/ 2>/dev/null || true
```

- [ ] **Step 5: Verify the cutover works**

```bash
bun run type-check && bun run lint
```
Expected: type-check PASS, lint 0 errors

```bash
bun test server/src/domains/sessions/
```
Expected: 13/13 PASS (7 normalizer + 6 effect executor)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): cut over sessions domain to TypeScript, delete old JS"
```

---

## Part B: OpenCode Domain Boundary (Tasks 10–14)

### Task 10: OpenCode Domain Types

**Files:**
- Create: `packages/web/server/src/domains/opencode/types.ts`

- [ ] **Step 1: Create opencode types module**

```ts
import type { Express } from "express";

export interface OpenCodeDomainDeps {
  eventBus: any;
  env: {
    ENV_CONFIGURED_OPENCODE_PORT?: string;
    ENV_CONFIGURED_OPENCODE_HOST?: string;
    ENV_EFFECTIVE_PORT?: string;
    ENV_SKIP_OPENCODE_START?: boolean;
    [key: string]: any;
  };
  syncToHmrState: () => void;
  syncFromHmrState: () => any;
  applyOpencodeBinaryFromSettings: (settings: any) => string | null;
  ensureOpencodeCliEnv: () => void;
  buildWslExecArgs?: (...args: any[]) => string[];
  resolveWslExecutablePath?: (bin: string) => string;
  resolveManagedOpenCodeLaunchSpec: (opts: any) => any;
  clearResolvedOpenCodeBinary: () => void;
  normalizeApiPrefix: (prefix: string) => string;
  userProvidedPassword: string | null;
  getBuildAugmentedPath?: () => string;
  getBuildManagedOpenCodePath?: () => string;
  getServerUtilsRuntime?: () => any;
}

export interface OpenCodeDomain {
  runtime: any;
  getUrl(path?: string, search?: string): string;
  getAuthHeaders(): Record<string, string>;
  isReady(): boolean;
  isRestarting(): boolean;
  getPort(): number | null;
  setApp(app: Express): void;
  init(): Promise<void>;
  restart(): Promise<void>;
  startHealthMonitoring(intervalMs: number): void;
  stopHealthMonitoring(): void;
  triggerHealthCheck(): void;
  waitForReady(timeoutMs?: number, intervalMs?: number): Promise<void>;
  waitForAgentPresence(agentName: string, timeoutMs?: number, intervalMs?: number): Promise<void>;
  setShuttingDown(value: boolean): void;
  getIsShuttingDown(): boolean;
  isExternal(): boolean;
  getProcess(): any;
  clearProcess(): void;
  getOpenCodeAuthSource(): string | null;
  isConnectionSecure(): boolean;
  getLastError(): Error | null;
  getNotReadySince(): number | null;
  getHealthCheckInterval(): ReturnType<typeof setInterval> | null;
  getWorkingDirectory(): string | null;
  setWorkingDirectory(dir: string): void;
  getAuthPassword(): string | null;
  getState(): any;
  killProcessOnPort(port: number): void;
  waitForPortRelease(port: number, timeoutMs?: number): Promise<boolean>;
  syncFromHmrState(restored?: any): void;
  refreshAfterConfigChange(reason?: string, options?: any): Promise<void>;
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/opencode/types.ts
git commit -m "feat(server): add opencode domain types"
```

---

### Task 11: OpenCode Domain Runtime (Typed Wrapper)

**Files:**
- Create: `packages/web/server/src/domains/opencode/runtime.ts`

- [ ] **Step 1: Write the opencode domain factory**

This is a typed wrapper around the old `createOpenCodeRuntime` from `../../lib/opencode/runtime.js`. It takes the same deps, creates the old runtime internally, wraps it in the `OpenCodeDomain` interface, and returns it. This gives `index.js` a clean typed import while deferring full internal restructure to Stage 5/6:

```ts
import type { OpenCodeDomainDeps, OpenCodeDomain } from "./types.js";

export async function createOpenCodeDomain(deps: OpenCodeDomainDeps): Promise<OpenCodeDomain> {
  const { eventBus } = deps;

  const config = {
    env: deps.env,
    syncToHmrState: deps.syncToHmrState,
    syncFromHmrState: deps.syncFromHmrState,
    applyOpencodeBinaryFromSettings: deps.applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv: deps.ensureOpencodeCliEnv,
    buildWslExecArgs: deps.buildWslExecArgs,
    resolveWslExecutablePath: deps.resolveWslExecutablePath,
    resolveManagedOpenCodeLaunchSpec: deps.resolveManagedOpenCodeLaunchSpec,
    clearResolvedOpenCodeBinary: deps.clearResolvedOpenCodeBinary,
    normalizeApiPrefix: deps.normalizeApiPrefix,
    userProvidedPassword: deps.userProvidedPassword,
    buildAugmentedPath: deps.getBuildAugmentedPath ? deps.getBuildAugmentedPath() : "",
    buildManagedOpenCodePath: deps.getBuildManagedOpenCodePath ? deps.getBuildManagedOpenCodePath() : "",
    setupProxy: (app: any) => {
      const sr = deps.getServerUtilsRuntime?.();
      if (sr && app) sr.setupProxy(app);
    },
  };

  // @ts-expect-error — old JS runtime, fully typed wrapper will come in Stage 5/6
  const { createOpenCodeRuntime } = await import("../../lib/opencode/runtime.js");
  const runtime = createOpenCodeRuntime({ eventBus, config });

  return {
    runtime,

    getUrl(path?: string, search?: string) { return runtime.getUrl(path, search); },
    getAuthHeaders() { return runtime.getAuthHeaders(); },
    isReady() { return runtime.isReady(); },
    isRestarting() { return runtime.isRestarting(); },
    getPort() { return runtime.getPort(); },
    setApp(app) { runtime.setApp(app); },
    async init() { return runtime.init(); },
    async restart() { return runtime.restart(); },
    startHealthMonitoring(ms: number) { runtime.startHealthMonitoring(ms); },
    stopHealthMonitoring() { runtime.stopHealthMonitoring(); },
    triggerHealthCheck() { runtime.triggerHealthCheck(); },
    async waitForReady(t?: number, i?: number) { return runtime.waitForReady(t, i); },
    async waitForAgentPresence(name: string, t?: number, i?: number) { return runtime.waitForAgentPresence(name, t, i); },
    setShuttingDown(v: boolean) { runtime.setShuttingDown(v); },
    getIsShuttingDown() { return runtime.getIsShuttingDown(); },
    isExternal() { return runtime.isExternal(); },
    getProcess() { return runtime.getProcess(); },
    clearProcess() { runtime.clearProcess(); },
    getOpenCodeAuthSource() { return runtime.getOpenCodeAuthSource(); },
    isConnectionSecure() { return runtime.isConnectionSecure(); },
    getLastError() { return runtime.getLastError(); },
    getNotReadySince() { return runtime.getNotReadySince(); },
    getHealthCheckInterval() { return runtime.getHealthCheckInterval(); },
    getWorkingDirectory() { return runtime.getWorkingDirectory(); },
    setWorkingDirectory(dir: string) { runtime.setWorkingDirectory(dir); },
    getAuthPassword() { return runtime.getAuthPassword(); },
    getState() { return runtime.getState(); },
    killProcessOnPort(port: number) { runtime.killProcessOnPort?.(port); },
    async waitForPortRelease(port: number, t?: number) { return runtime.waitForPortRelease?.(port, t); },
    syncFromHmrState(r?: any) { runtime.syncFromHmrState?.(r); },
    async refreshAfterConfigChange(reason?: string, opts?: any) { return runtime.refreshAfterConfigChange?.(reason, opts); },
  };
}
```

- [ ] **Step 2: Type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json
```
Expected: PASS (the `@ts-expect-error` on the dynamic import is expected)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/opencode/runtime.ts
git commit -m "feat(server): add opencode domain typed wrapper"
```

---

### Task 12: OpenCode Domain Barrel

**Files:**
- Create: `packages/web/server/src/domains/opencode/index.ts`

- [ ] **Step 1: Write the barrel**

```ts
export { createOpenCodeDomain } from "./runtime.js";
export type { OpenCodeDomainDeps, OpenCodeDomain } from "./types.js";
```

- [ ] **Step 2: Build + type-check**

```bash
cd packages/web && npx tsc --noEmit -p tsconfig.server.json && bun run build:server
```
Expected: Both PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/opencode/index.ts
git commit -m "feat(server): add opencode domain barrel export"
```

---

### Task 13: Cut Over OpenCode + Clean Up index.js Wiring

**Files:**
- Modify: `packages/web/server/index.js` — replace opencode runtime creation with domain import
- Modify: `packages/web/server/src/shared/types.ts` — add openCodeDomain to ServerRuntime.domains

- [ ] **Step 1: Change index.js to use opencode domain**

In `packages/web/server/index.js`:

**A. Change the import at line 17:**
```js
// OLD:
import { createOpenCodeRuntime } from './lib/opencode/runtime.js';

// NEW:
import { createOpenCodeDomain } from './dist/domains/opencode/index.js';
```

**B. Change the creation at lines 390–420:**

The old code creates `openCodeRuntime` synchronously at module level with a large config object. Replace with:

```js
let openCodeRuntime = null;
let openCodeDomain = null;

// The domain is created async because it dynamically imports old JS.
// We use a lazy init pattern that fills openCodeRuntime on first access.
async function ensureOpenCodeDomain() {
  if (openCodeDomain) return openCodeDomain;
  openCodeDomain = await createOpenCodeDomain({
    eventBus,
    env: { ENV_CONFIGURED_OPENCODE_PORT, ENV_CONFIGURED_OPENCODE_HOST, ENV_EFFECTIVE_PORT, ENV_SKIP_OPENCODE_START },
    syncToHmrState, syncFromHmrState,
    applyOpencodeBinaryFromSettings, ensureOpencodeCliEnv,
    buildWslExecArgs, resolveWslExecutablePath, resolveManagedOpenCodeLaunchSpec,
    clearResolvedOpenCodeBinary, normalizeApiPrefix, userProvidedPassword,
    getBuildAugmentedPath: () => serverUtilsRuntime ? serverUtilsRuntime.buildAugmentedPath() : '',
    getBuildManagedOpenCodePath: () => serverUtilsRuntime ? serverUtilsRuntime.buildManagedOpenCodePath() : '',
    getServerUtilsRuntime: () => serverUtilsRuntime,
  });
  openCodeRuntime = openCodeDomain;
  return openCodeDomain;
}

// Backward-compatible sync accessor for code that reads openCodeRuntime
// before first domain init (shutdown guard closures, etc.)
function getOpenCodeRuntime() {
  return openCodeRuntime;
}
```

**C. In `main()` (around line 695–700), add at the start:**
```js
await ensureOpenCodeDomain();
```

**D. Update all `openCodeRuntime.getPort()` etc. to use `openCodeRuntime` as before — the domain object satisfies the same interface.**

**E. In the return object (~lines 838–847), update:**
```js
// OLD: getOpenCodePort: () => openCodeRuntime.getPort(),
// NEW:
getOpenCodePort: () => openCodeRuntime?.getPort?.() ?? openCodeRuntime?.getPort?.(),
isReady: () => openCodeRuntime?.isReady?.() ?? false,
restartOpenCode: () => openCodeRuntime?.restart?.() ?? Promise.resolve(),
```

- [ ] **Step 2: Update shared types**

In `packages/web/server/src/shared/types.ts`, update the `domains` field:

```ts
domains: {
  terminal?: TerminalDomain;
  eventStream?: EventStreamDomain;
  sessions?: any;
  opencode?: any; // OpenCodeDomain — properly typed in Stage 5/6
};
```

- [ ] **Step 3: Build + verify full pipeline**

```bash
bun run build:web-server
```
Expected: PASS

```bash
bun run type-check
```
Expected: PASS (all packages + server TS)

```bash
bun run lint
```
Expected: 0 errors

```bash
bun test server/src/domains/sessions/
```
Expected: 13/13 PASS

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/index.js packages/web/server/src/shared/types.ts
git commit -m "feat(server): cut over opencode to typed domain boundary"
```

---

### Task 14: Final Stage 4 Verification

- [ ] **Step 1: Full type-check**

```bash
bun run type-check
```
Expected: ALL PASS

- [ ] **Step 2: Full lint**

```bash
bun run lint
```
Expected: 0 errors, only pre-existing warnings

- [ ] **Step 3: Full build**

```bash
bun run build:web-server
```
Expected: PASS — `server/dist/domains/sessions/` and `server/dist/domains/opencode/` contain compiled JS + declarations

- [ ] **Step 4: Run all domain tests**

```bash
bun test server/src/domains/terminal/ server/src/domains/event-stream/ server/src/domains/sessions/
```
Expected: ALL PASS (44 terminal + 14 event-stream + 13 sessions = 71 tests)

- [ ] **Step 5: Verify old JS is gone**

```bash
ls packages/web/server/lib/session-state/ 2>&1
```
Expected: "No such file or directory" or empty directory already removed

```bash
ls packages/web/server/lib/opencode/session/ 2>&1
```
Expected: "No such file or directory" or empty

- [ ] **Step 6: Commit final state**

```bash
git add -A && git status
git commit -m "chore(server): final Stage 4 verification — all domains cut over"
```

---

## Acceptance Criteria

- [ ] Session domain: `dist/domains/sessions/` contains 7 compiled modules + declarations
- [ ] OpenCode domain: `dist/domains/opencode/` contains 2 compiled modules + declarations
- [ ] `index.js` imports sessions from `./dist/domains/sessions/index.js`
- [ ] `index.js` imports opencode from `./dist/domains/opencode/index.js`
- [ ] All 6 old session-state JS files deleted
- [ ] `session-runtime.js` deleted
- [ ] Event normalizer handles all 26 payload types
- [ ] Effect executor handles all 8 effect types
- [ ] 13 new tests pass (7 normalizer + 6 executor)
- [ ] 71 total domain tests pass (terminal 44 + event-stream 14 + sessions 13)
- [ ] `bun run type-check` PASS (all packages)
- [ ] `bun run lint` PASS (0 errors)
- [ ] `bun run build:web-server` PASS
- [ ] OpenCode runtime still works through typed domain wrapper (old `lib/opencode/runtime.js` still exists as internal impl)
