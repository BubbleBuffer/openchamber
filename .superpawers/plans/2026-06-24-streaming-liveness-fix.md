# Streaming Liveness Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the frozen-chat bug by detecting upstream data-flow stalls end-to-end and triggering automatic browser reconnect with `lastEventId` for replay.

**Architecture:** Server emits explicit `data_stalled`/`data_resumed` WS frames when the upstream reader detects/recovers from a stall. Browser gains a dual-timer liveness monitor that distinguishes "data flowing" (real OpenCode events) from "socket alive" (any WS frame). When data flow stalls, the monitor triggers the existing reconnect path. The masking `openchamber:heartbeat` data frames are removed; `socket.ping()` remains for NAT keepalive.

**Tech Stack:** TypeScript, Vitest (server tests), bun:test (browser tests), Zustand not involved, XState not involved.

**Spec:** `.superpawers/specs/2026-06-24-streaming-liveness-fix-design.md`

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `packages/ui/src/sync/liveness.ts` | Pure dual-timer liveness monitor (`createLivenessMonitor` factory). Browser side. |
| `packages/ui/src/sync/liveness.test.ts` | bun:test unit tests for the monitor. |
| `packages/web/server/src/domains/event-stream/global-hub.test.ts` | vitest tests for the new hub stall/resume wiring. |
| `packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts` | vitest tests for frame dispatch on stall/resume. |

### Modified files
| File | Change |
|---|---|
| `packages/web/server/src/domains/event-stream/types.ts` | Extend `HubStatus` union with `data_stalled` and `data_resumed` variants |
| `packages/web/server/src/domains/event-stream/global-hub.ts` | Pass `onStall`/`onResume` callbacks into `createUpstreamSseReader`; convert into `HubStatus` notifications |
| `packages/web/server/src/domains/event-stream/global-ws-bridge.ts` | Subscribe to hub status → emit `data_stalled`/`data_resumed` frames; remove `openchamber:heartbeat` data frame interval |
| `packages/web/server/src/domains/event-stream/directory-ws-bridge.ts` | Remove `openchamber:heartbeat` data frame interval |
| `packages/ui/src/sync/event-pipeline.ts` | Parse `data_stalled`/`data_resumed` frames; integrate `liveness.ts` monitor; remove all `openchamber:heartbeat` handling |
| `packages/ui/src/sync/__tests__/event-pipeline.test.js` | Update existing heartbeat-timeout test to reflect new behavior; add coverage for `data_stalled`/`data_resumed` parsing |

---

## Task 1: Port browser liveness module + tests

**Files:**
- Create: `packages/ui/src/sync/liveness.ts` — pure dual-timer monitor
- Create: `packages/ui/src/sync/liveness.test.ts` — bun:test tests

- [ ] **Step 1: Create `packages/ui/src/sync/liveness.ts`**

Port the branch's `liveness.ts` verbatim into `packages/ui/src/sync/liveness.ts`. The branch file is exactly:

```typescript
export type LivenessCallbacks = {
  onDataStall?: (info: { duration: number }) => void
  onDataResumed?: (info: { lastEventId?: string }) => void
  onSocketTimeout?: () => void
}

export type LivenessMonitor = {
  markDataEvent: () => void
  markSocketActivity: () => void
  handleStallSignal: (info: { duration: number }) => void
  handleResumedSignal: (info?: { lastEventId?: string }) => void
  resetDataTimer: () => void
  resetSocketTimer: () => void
  getDataSilenceElapsed: () => number
  destroy: () => void
  isDataFlowing: () => boolean
  isSocketAlive: () => boolean
}

export function createLivenessMonitor(options: {
  dataSilenceMs?: number
  socketTimeoutMs?: number
  onDataStall?: (info: { duration: number }) => void
  onDataResumed?: (info: { lastEventId?: string }) => void
  onSocketTimeout?: () => void
}): LivenessMonitor {
  const {
    dataSilenceMs = 15_000,
    socketTimeoutMs = 30_000,
    onDataStall = () => {},
    onDataResumed = () => {},
    onSocketTimeout = () => {},
  } = options

  let lastDataEventAt = Date.now()
  let lastSocketActivityAt = Date.now()
  let dataTimer: ReturnType<typeof setTimeout> | undefined
  let socketTimer: ReturnType<typeof setTimeout> | undefined
  let stalled = false
  let hasReceivedData = false
  let destroyed = false

  const clearTimers = () => {
    if (dataTimer) clearTimeout(dataTimer)
    if (socketTimer) clearTimeout(socketTimer)
    dataTimer = undefined
    socketTimer = undefined
  }

  const scheduleDataCheck = () => {
    if (dataTimer) clearTimeout(dataTimer)
    dataTimer = setTimeout(() => {
      if (destroyed) return
      const elapsed = Date.now() - lastDataEventAt
      if (elapsed >= dataSilenceMs && !stalled) {
        stalled = true
        onDataStall({ duration: elapsed })
      }
    }, dataSilenceMs + 10)
  }

  const scheduleSocketCheck = () => {
    if (socketTimer) clearTimeout(socketTimer)
    socketTimer = setTimeout(() => {
      if (destroyed) return
      const elapsed = Date.now() - lastSocketActivityAt
      if (elapsed >= socketTimeoutMs) {
        onSocketTimeout()
      }
    }, socketTimeoutMs + 10)
  }

  scheduleDataCheck()
  scheduleSocketCheck()

  const markDataEvent = () => {
    hasReceivedData = true
    const wasStalled = stalled
    stalled = false
    lastDataEventAt = Date.now()
    if (wasStalled) {
      onDataResumed({})
    }
    scheduleDataCheck()
  }

  const markSocketActivity = () => {
    lastSocketActivityAt = Date.now()
    scheduleSocketCheck()
  }

  const handleStallSignal = (_info: { duration: number }) => {
    if (!stalled) {
      stalled = true
      onDataStall(_info)
    }
  }

  const handleResumedSignal = (info?: { lastEventId?: string }) => {
    stalled = false
    lastDataEventAt = Date.now()
    scheduleDataCheck()
    onDataResumed(info ?? {})
  }

  const resetDataTimer = () => {
    lastDataEventAt = Date.now()
    if (stalled) {
      stalled = false
      onDataResumed({})
    }
    scheduleDataCheck()
  }

  const resetSocketTimer = () => {
    lastSocketActivityAt = Date.now()
    scheduleSocketCheck()
  }

  const getDataSilenceElapsed = () => Date.now() - lastDataEventAt

  const destroy = () => {
    destroyed = true
    clearTimers()
  }

  const isDataFlowing = () => hasReceivedData && !stalled
  const isSocketAlive = () => Date.now() - lastSocketActivityAt < socketTimeoutMs

  return {
    markDataEvent,
    markSocketActivity,
    handleStallSignal,
    handleResumedSignal,
    resetDataTimer,
    resetSocketTimer,
    getDataSilenceElapsed,
    destroy,
    isDataFlowing,
    isSocketAlive,
  }
}
```

- [ ] **Step 2: Create `packages/ui/src/sync/liveness.test.ts`**

Port the branch's test file verbatim:

```typescript
import { describe, expect, test } from "bun:test"
import { createLivenessMonitor } from "./liveness"

describe("createLivenessMonitor", () => {
  test("fires onDataStall after dataSilenceMs without data events", async () => {
    const stall = new Promise<number>((resolve) => {
      const monitor = createLivenessMonitor({
        dataSilenceMs: 50,
        socketTimeoutMs: 5000,
        onDataStall: ({ duration }) => resolve(duration),
      })
      monitor.markDataEvent()
    })
    const duration = await stall
    expect(duration).toBeGreaterThan(47)
  })

  test("does NOT reset data timer on markSocketActivity", async () => {
    let stalled = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => { stalled = true },
    })
    monitor.markSocketActivity()
    await new Promise((r) => setTimeout(r, 80))
    expect(stalled).toBe(true)
  })

  test("fires onSocketTimeout if no socket activity for socketTimeoutMs", async () => {
    const timeout = new Promise<void>((resolve) => {
      const monitor = createLivenessMonitor({
        dataSilenceMs: 5000,
        socketTimeoutMs: 50,
        onSocketTimeout: () => resolve(),
      })
      monitor.markSocketActivity()
    })
    await timeout
  })

  test("data events reset the data stall timer", async () => {
    let stalled = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => { stalled = true },
    })
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 30))
    expect(stalled).toBe(false)
    await new Promise((r) => setTimeout(r, 60))
    expect(stalled).toBe(true)
  })

  test("handles data_resumed signal and clears stall state", async () => {
    let resumed = false
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
      onDataStall: () => {},
      onDataResumed: () => { resumed = true },
    })
    monitor.markDataEvent()
    await new Promise((r) => setTimeout(r, 80))
    monitor.handleResumedSignal()
    expect(resumed).toBe(true)
  })

  test("resetDataTimer extends the data window", () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 1000,
      socketTimeoutMs: 5000,
    })
    monitor.markDataEvent()
    monitor.resetDataTimer()
    expect(monitor.getDataSilenceElapsed()).toBeLessThan(50)
  })

  test("isDataFlowing returns true after data event, false after stall", async () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 50,
      socketTimeoutMs: 5000,
    })
    expect(monitor.isDataFlowing()).toBe(false)
    monitor.markDataEvent()
    expect(monitor.isDataFlowing()).toBe(true)
    await new Promise((r) => setTimeout(r, 80))
    expect(monitor.isDataFlowing()).toBe(false)
  })

  test("isSocketAlive returns true within timeout", () => {
    const monitor = createLivenessMonitor({
      dataSilenceMs: 5000,
      socketTimeoutMs: 5000,
    })
    monitor.markSocketActivity()
    expect(monitor.isSocketAlive()).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun test packages/ui/src/sync/liveness.test.ts`
Expected: All 8 tests pass.

- [ ] **Step 4: Verify type-check**

Run: `bun run type-check:ui`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/sync/liveness.ts packages/ui/src/sync/liveness.test.ts
git commit -m "feat(ui): add dual-timer liveness monitor"
```

---

## Task 2: Extend HubStatus + wire global-hub stall/resume notifications

**Files:**
- Modify: `packages/web/server/src/domains/event-stream/types.ts` — extend `HubStatus`
- Modify: `packages/web/server/src/domains/event-stream/global-hub.ts` — pass `onStall`/`onResume` callbacks; convert to status notifications
- Create: `packages/web/server/src/domains/event-stream/global-hub.test.ts` — vitest tests

- [ ] **Step 1: Extend `HubStatus` in `types.ts`**

Anchor: line 27-34 of `types.ts`. Replace:

```typescript
export interface HubStatus {
  type: "connect" | "disconnect" | "error" | "initial-error";
  wasReady?: boolean;
  reason?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  buildUrlFailed?: boolean;
}
```

With:

```typescript
export interface HubStatus {
  type: "connect" | "disconnect" | "error" | "initial-error" | "data_stalled" | "data_resumed";
  wasReady?: boolean;
  reason?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error?: any;
  buildUrlFailed?: boolean;
  duration?: number;
  lastEventId?: string;
}
```

- [ ] **Step 2: Wire `onStall`/`onResume` in `global-hub.ts`**

Anchor: `start()` function inside `createGlobalMessageStreamHub` (lines 48-106), specifically the `createUpstreamSseReader({...})` call at line 54. Add two new callback keys to the deps object, alongside `onConnect`/`onDisconnect`/`onEvent`/`onError`:

```typescript
      onStall({ duration }) {
        notifyStatus({ type: "data_stalled", duration });
      },
      onResume({ lastEventId }) {
        notifyStatus({ type: "data_resumed", lastEventId });
      },
```

The `UpstreamSseReaderDeps` type already declares these (lines 58-59 of `types.ts`), so no type changes needed here.

- [ ] **Step 3: Create `global-hub.test.ts`**

Create `packages/web/server/src/domains/event-stream/global-hub.test.ts` with vitest. The test mocks `createUpstreamSseReader` (already a dependency-free factory — the hub imports it directly). To test wiring without real network:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock createUpstreamSseReader to capture callbacks without network
const capturedCallbacks: { stall?: (info: { duration: number }) => void; resume?: (info: { lastEventId: string }) => void } = {}

vi.mock("./upstream-reader.js", () => ({
  createUpstreamSseReader: (deps: { onStall?: (i: { duration: number }) => void; onResume?: (i: { lastEventId: string }) => void }) => {
    capturedCallbacks.stall = deps.onStall
    capturedCallbacks.resume = deps.onResume
    return {
      start: async () => {},
      stop: () => {},
      getLastEventId: () => "test-event-id",
    }
  },
}))

import { createGlobalMessageStreamHub } from "./global-hub.js"

describe("createGlobalMessageStreamHub — stall/resume wiring", () => {
  beforeEach(() => {
    capturedCallbacks.stall = undefined
    capturedCallbacks.resume = undefined
  })

  it("emits data_stalled status when upstream fires onStall", () => {
    const statuses: { type: string; duration?: number }[] = []
    const hub = createGlobalMessageStreamHub({
      getOpenCodeRuntime: () => ({ getUrl: () => new URL("http://localhost/global/event"), getAuthHeaders: () => ({}) }),
      upstreamStallTimeoutMs: 100,
    })
    hub.subscribeStatus((s) => statuses.push(s))
    hub.start()

    capturedCallbacks.stall?.({ duration: 250 })

    expect(statuses).toContainEqual({ type: "data_stalled", duration: 250 })
  })

  it("emits data_resumed status with lastEventId when upstream fires onResume", () => {
    const statuses: { type: string; lastEventId?: string }[] = []
    const hub = createGlobalMessageStreamHub({
      getOpenCodeRuntime: () => ({ getUrl: () => new URL("http://localhost/global/event"), getAuthHeaders: () => ({}) }),
    })
    hub.subscribeStatus((s) => statuses.push(s))
    hub.start()

    capturedCallbacks.resume?.({ lastEventId: "evt-42" })

    expect(statuses).toContainEqual({ type: "data_resumed", lastEventId: "evt-42" })
  })
})
```

Note: vitest config in this project uses ESM. Adjust import paths if `vi.mock` requires `.js` extensions on the mocked module path.

- [ ] **Step 4: Run tests**

Run: `bun run test:server -- packages/web/server/src/domains/event-stream/global-hub.test.ts` (use the project's actual vitest invocation; check `package.json` scripts first)
Expected: 2 tests pass.

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check:server && bun run lint:server`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/event-stream/types.ts \
        packages/web/server/src/domains/event-stream/global-hub.ts \
        packages/web/server/src/domains/event-stream/global-hub.test.ts
git commit -m "feat(server): emit data_stalled/data_resumed status from hub"
```

---

## Task 3: Wire global-ws-bridge to dispatch stall/resume frames + remove heartbeat data frame

**Files:**
- Modify: `packages/web/server/src/domains/event-stream/global-ws-bridge.ts` — subscribe to status, dispatch frames, remove heartbeat
- Modify: `packages/web/server/src/domains/event-stream/directory-ws-bridge.ts` — remove heartbeat (consistency)
- Create: `packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts` — vitest tests

- [ ] **Step 1: Read `global-ws-bridge.ts` to identify anchors**

Anchor the edits to:
- Line 3: existing `sendMessageStreamWsEvent, sendMessageStreamWsFrame` import from `./protocol.js`
- Line 30-32: existing `clients`, `clientLastEventIds`, `readyClients` sets
- Lines 164-182: existing heartbeat interval (ping + `openchamber:heartbeat` data frame)
- Lines 176-182: the `openchamber:heartbeat` data frame interval specifically
- The `accept()` method body

- [ ] **Step 2: Subscribe to hub stall/resume in `accept()`**

In the `accept()` method body (after the existing hub event/status subscriptions, before the heartbeat interval setup), add:

```typescript
    const unsubscribeStatus = globalHub.subscribeStatus((status) => {
      if (status.type === "data_stalled") {
        for (const client of readyClients) {
          sendMessageStreamWsFrame(client, { type: "data_stalled", duration: status.duration });
        }
      } else if (status.type === "data_resumed") {
        for (const client of readyClients) {
          sendMessageStreamWsFrame(client, { type: "data_resumed", lastEventId: status.lastEventId });
        }
      }
    });
```

Anchor by finding the existing `subscribeStatus` calls in the file (search for `globalHub.subscribeStatus`).

When the socket closes, also call `unsubscribeStatus()` — anchor on the existing cleanup code (`socket.on("close", ...)` handler).

- [ ] **Step 3: Remove the `openchamber:heartbeat` data frame interval**

Anchor: lines 176-182 of `global-ws-bridge.ts`. Delete this code block:

```typescript
      const heartbeatDataInterval = setInterval(() => {
        if (!globalHub.isConnected()) return;
        const event = { type: "openchamber:heartbeat", timestamp: Date.now() };
        for (const client of readyClients) {
          sendMessageStreamWsEvent(client, event);
        }
      }, heartbeatIntervalMs);
```

Keep the `socket.ping()` interval (lines 164-174) intact — that's the NAT keepalive and the socket-timer signal.

When the socket closes, also clear any heartbeat data interval if not removed — but in this edit the entire block is being deleted, so no extra cleanup needed.

- [ ] **Step 4: Remove heartbeat data frame from `directory-ws-bridge.ts`**

Anchor: lines 62-68 of `directory-ws-bridge.ts`. Delete the same heartbeat-data-frame `setInterval` block (mirror of global). Keep the `socket.ping()` interval.

- [ ] **Step 5: Create `global-ws-bridge.test.ts`**

Create `packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts` with vitest. The test injects a stub `globalHub` that exposes `subscribeStatus` returning an unsubscribe function and tracks dispatched frames on a stub WebSocket.

```typescript
import { describe, it, expect, vi } from "vitest"

const capturedStatusCallbacks: ((s: { type: string; duration?: number; lastEventId?: string }) => void)[] = []
const stubWebSocket = (): any => ({
  readyState: 1,
  send: vi.fn(),
  ping: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  close: vi.fn(),
})

const stubHub = () => ({
  isConnected: () => true,
  hasConnected: () => true,
  subscribeEvent: (_cb: unknown) => () => {},
  subscribeStatus: (cb: (s: unknown) => void) => {
    capturedStatusCallbacks.push(cb as (s: { type: string; duration?: number; lastEventId?: string }) => void)
    return () => {}
  },
  replayAfter: () => [],
  emitSynthetic: () => {},
  start: () => {},
  stop: () => {},
})

describe("createGlobalMessageStreamWsBridge — stall/resume dispatch", () => {
  it("sends data_stalled frame to ready clients when hub emits data_stalled", () => {
    capturedStatusCallbacks.length = 0
    const hub = stubHub()
    const readyClients = new Set<any>([stubWebSocket()])
    // Build bridge deps with stub hub + the readyClients set
    // ... adapt to actual createGlobalMessageStreamWsBridge signature in types.ts
  })

  it("sends data_resumed frame with lastEventId when hub emits data_resumed", () => {
    capturedStatusCallbacks.length = 0
    // mirror of above, push status with lastEventId
  })

  it("does NOT send openchamber:heartbeat data frames to clients", () => {
    // accept a socket, observe all send() calls, assert no payload has type === "openchamber:heartbeat"
  })
})
```

Anchor the exact deps shape to `GlobalWsBridgeDeps` (types.ts lines 90-98). The `readyClients` set lives inside the bridge; tests need to capture frames by either (a) intercepting `sendMessageStreamWsFrame` via `vi.mock("./protocol.js")`, or (b) verifying frame content via the WebSocket stub's `send` mock after the bridge calls it through `sendMessageStreamWsFrame`.

Recommended approach (b): mock `./protocol.js` so `sendMessageStreamWsFrame` records the frame payload, then assert on the records.

- [ ] **Step 6: Run server tests**

Run: vitest invocation (verify against `package.json` scripts)
Expected: existing `protocol.test.ts`, `upstream-reader.test.ts`, `error-broadcast.test.ts` still pass; new `global-ws-bridge.test.ts` and `global-hub.test.ts` pass.

- [ ] **Step 7: Type-check + lint**

Run: `bun run type-check:server && bun run lint:server`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/web/server/src/domains/event-stream/global-ws-bridge.ts \
        packages/web/server/src/domains/event-stream/directory-ws-bridge.ts \
        packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts
git commit -m "feat(server): dispatch stall/resume frames, drop heartbeat data frames"
```

---

## Task 4: Wire browser event-pipeline to liveness monitor + parse new frames + remove heartbeat handling

**Files:**
- Modify: `packages/ui/src/sync/event-pipeline.ts` — parse frames, integrate monitor, drop heartbeat

This is the largest single edit. Read the file fully first to understand the structure before applying changes.

- [ ] **Step 1: Read `event-pipeline.ts` and locate anchors**

Expected anchors (from research):
- Line 22-28: constants block (add `DEFAULT_DATA_SILENCE_MS = 15_000` here)
- Line 172: module-level `lastEventId` (already exists — reuse)
- Line 192-322: event coalescer block
- Line 265: `lastEventAt` (becomes part of liveness monitor)
- Line 324-331: existing `resetHeartbeat()` and heartbeat timeout
- Line 438-514: WS frame parser (`socket.onmessage`)
- Line 477: silent ignore for unknown frame types
- Line 487: `lastEventId` update on `event` frames
- Line 530: `consecutiveFailures` counter
- Line 594-598: `onDisconnect` notification on heartbeat timeout

- [ ] **Step 2: Import liveness monitor**

Add to imports at top of file:

```typescript
import { createLivenessMonitor, type LivenessMonitor } from "./liveness"
```

- [ ] **Step 3: Add `DEFAULT_DATA_SILENCE_MS` constant**

Anchor: constants block at top (line 22). Add:

```typescript
const DEFAULT_DATA_SILENCE_MS = 15_000
```

- [ ] **Step 4: Instantiate liveness monitor inside the pipeline factory**

Anchor: inside the `createEventPipeline({ input })` closure, near where `lastEventAt` is currently declared (line 265). Add:

```typescript
const liveness = createLivenessMonitor({
  dataSilenceMs: input.dataSilenceMs ?? DEFAULT_DATA_SILENCE_MS,
  socketTimeoutMs: input.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
  onDataStall: () => {
    // Trigger reconnect with current lastEventId for replay
    attemptAbortReason = "data_stalled";
    currentAttempt?.abort();
  },
  onDataResumed: ({ lastEventId }) => {
    // If we have a lastEventId, it implies a replay opportunity — handled by data_resumed frame handler
  },
  onSocketTimeout: () => {
    attemptAbortReason = "socket_timeout";
    currentAttempt?.abort();
  },
})
```

Note: `currentAttempt` and `attemptAbortReason` need to exist in scope. If they don't already, the implementer should wire them to the existing abort pipeline by following the same pattern used for the existing heartbeat timeout (lines 324-331).

- [ ] **Step 5: Replace `resetHeartbeat()` body with `liveness.markDataEvent()`**

Anchor: line 324-331. Replace the body of `resetHeartbeat()` to call `liveness.markDataEvent()` and `liveness.markSocketActivity()` instead of managing timers directly. Keep the function name as an alias if callers reference it; otherwise rename to `markDataEvent`.

- [ ] **Step 6: Update WS frame parser to handle new types**

Anchor: lines 477-494 (the `socket.onmessage` handler). Modify the `if (frame.type === "event")` branch:

```typescript
      if (frame.type === "data_stalled") {
        const info = (frame as { type: "data_stalled"; duration?: number }).duration !== undefined
          ? { duration: (frame as { duration?: number }).duration! }
          : { duration: 0 }
        liveness.handleStallSignal(info)
        continue
      }
      if (frame.type === "data_resumed") {
        const payload = frame as { type: "data_resumed"; lastEventId?: string }
        liveness.handleResumedSignal({ lastEventId: payload.lastEventId })
        continue
      }
      if (frame.type === "event") {
        // existing event handling
      }
```

Anchor: existing `if (frame.type === "event")` (line 477 area). Replace the unknown-frame no-op with explicit dispatch on new types.

- [ ] **Step 7: Remove all `openchamber:heartbeat` handling**

Search the file for `openchamber:heartbeat`. Likely locations: in `resolveEventPayload` (line 481) or in the `default` branch of a switch. Remove any special-case handling — heartbeats are no longer sent, so any remaining code is dead.

If `resetHeartbeat()` was being called on heartbeat frames, that call is now redundant and should be removed (the function is replaced in Step 5).

- [ ] **Step 8: Wire liveness cleanup into the pipeline's `cleanup()` function**

Anchor: the `cleanup()` returned object (line 634). Add `liveness.destroy()` to the cleanup logic.

- [ ] **Step 9: Verify type-check + run existing event-pipeline tests**

Run: `bun run type-check:ui && bun test packages/ui/src/sync/__tests__/event-pipeline.test.js`
Expected: type-check clean. Existing tests in `__tests__/event-pipeline.test.js` may have failures around the heartbeat test (line 749) — that's expected, the next task updates those tests.

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/sync/event-pipeline.ts
git commit -m "feat(ui): integrate liveness monitor, parse stall/resume frames"
```

---

## Task 5: Update browser event-pipeline tests for new behavior

**Files:**
- Modify: `packages/ui/src/sync/__tests__/event-pipeline.test.js` — update heartbeat test, add new coverage

- [ ] **Step 1: Update existing heartbeat-timeout test (line 749-803)**

The existing test expects:
- `disconnectReasons` to equal `['ws_heartbeat_timeout']`
- `reconnectCount` to be 2

With new behavior:
- A stalled data flow triggers `data_stalled` (from server frame OR from monitor timer)
- Disconnect reason becomes `data_stalled`
- After server emits `data_resumed`, the monitor clears stalled state

Replace the test with one that:
1. Uses `transport: 'ws'`
2. Sends `{ type: 'data_stalled', duration: 200 }` from the FakeWebSocket
3. Verifies the pipeline triggers reconnect (existing behavior path)
4. After reconnect, sends `{ type: 'data_resumed', lastEventId: 'evt-1' }` 
5. Verifies no further disconnects

Target sketch:

```javascript
  it('reconnects when server sends data_stalled frame', async () => {
    installDomStubs();
    globalThis.WebSocket = FakeWebSocket;

    const disconnectReasons = [];
    let reconnectCount = 0;

    const sdk = { global: { event: async () => { throw new Error('SSE should not be used'); } } };

    const recovered = new Promise((resolve) => {
      const { cleanup } = createEventPipeline({
        sdk,
        transport: 'ws',
        heartbeatTimeoutMs: 5000,
        dataSilenceMs: 5000,
        reconnectDelayMs: 0,
        wsReadyTimeoutMs: 20,
        onEvent: () => {},
        onDisconnect: (reason) => { disconnectReasons.push(reason); },
        onReconnect: () => {
          reconnectCount += 1;
          if (reconnectCount === 2) {
            cleanup();
            resolve();
          }
        },
      });
    });

    await Promise.resolve();

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.emitOpen();
    firstSocket.emitMessage({ type: 'ready', scope: 'global' });
    firstSocket.emitMessage({ type: 'data_stalled', duration: 200 });

    await new Promise((r) => setTimeout(r, 35));

    const secondSocket = FakeWebSocket.instances[1];
    expect(secondSocket).toBeDefined();

    secondSocket.emitOpen();
    secondSocket.emitMessage({ type: 'ready', scope: 'global' });
    secondSocket.emitMessage({ type: 'data_resumed', lastEventId: 'evt-1' });

    await recovered;

    expect(reconnectCount).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 2: Add test for socket-only frames not resetting data timer**

Add a new test in the same suite:

```javascript
  it('does not reset data stall timer on socket-only frames', async () => {
    installDomStubs();
    globalThis.WebSocket = FakeWebSocket;

    let dataStalled = false;

    const { cleanup } = createEventPipeline({
      sdk: { global: { event: async () => ({ data: null }) } },
      transport: 'ws',
      heartbeatTimeoutMs: 30,    // socket timeout short
      dataSilenceMs: 30,         // data timeout short
      reconnectDelayMs: 0,
      wsReadyTimeoutMs: 20,
      onEvent: () => {},
      onDisconnect: () => {},
      onLivenessStall: () => { dataStalled = true; },  // ensure pipeline exposes this; if not, observe reconnectCount instead
    });

    await Promise.resolve();
    const socket = FakeWebSocket.instances[0];
    socket.emitOpen();
    socket.emitMessage({ type: 'ready', scope: 'global' });

    // Send only socket-level activity (a non-event, non-stall frame if supported; otherwise rely on the data timer)
    await new Promise((r) => setTimeout(r, 50));

    expect(dataStalled).toBe(true);

    cleanup();
  });
```

Note: this test depends on how `createEventPipeline` exposes the liveness stall signal. The implementer should expose it via a new optional `onLivenessStall` callback in `EventPipelineInput`, or observe reconnect count + absence of event frames.

- [ ] **Step 3: Run all event-pipeline tests**

Run: `bun test packages/ui/src/sync/__tests__/event-pipeline.test.js`
Expected: all tests pass, including updated heartbeat test.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/sync/__tests__/event-pipeline.test.js
git commit -m "test(ui): update event-pipeline tests for liveness fix"
```

---

## Task 6: Final verification

- [ ] **Step 1: Type-check all packages**

Run: `bun run type-check`
Expected: clean.

- [ ] **Step 2: Lint all packages**

Run: `bun run lint`
Expected: 0 new errors (pre-existing warnings OK).

- [ ] **Step 3: Build all packages**

Run: `bun run build`
Expected: succeeds.

- [ ] **Step 4: Run full test suite**

Run: `bun run test`
Expected: all tests pass (existing baseline failures in `draftStorage`, `getBootInjectionStatus`, `getMutationBlockingReasons`, `resolveDesktopBootView`, bootstrap web tests are pre-existing — should not regress).

- [ ] **Step 5: Manual smoke**

In a dev environment:
1. Start the server with a stalled upstream (mock OpenCode to never send events after initial connect).
2. Open the web UI in a browser.
3. Observe that within 15-20 seconds, a `data_stalled` frame is received, browser logs a stall, attempts reconnect.
4. Unblock upstream.
5. Observe `data_resumed` frame, browser recovers, chat resumes.

If the manual smoke is impractical in the current environment, document the steps and rely on automated test coverage.

- [ ] **Step 6: Update `.superpawers/OVERVIEW.md`**

In the housekeeping section, add an entry under "Streaming-refactor" noting the liveness fix is complete and `feature/streaming-refactor` should be deleted.

- [ ] **Step 7: Commit + merge**

```bash
git add .superpawers/OVERVIEW.md
git commit -m "docs(overview): note streaming liveness fix complete"
```

Then merge `feature/streaming-liveness-fix` to main:

```bash
git checkout main
git merge --no-ff feature/streaming-liveness-fix -m "Merge branch 'feature/streaming-liveness-fix'"
git branch -d feature/streaming-refactor
```

- [ ] **Step 8: Verify on main**

Run: `git log --oneline -10` and `bun run type-check`
Expected: merge commit visible, type-check clean.

---

## Notes for Implementers

- **Server tests use vitest, browser tests use bun:test.** Don't mix.
- **The existing `event-pipeline.ts` is a 635-line monolith.** Apply targeted edits at the anchored line ranges, don't rewrite the whole file.
- **`error-broadcast.ts:hubStatusToClientError`** only handles `initial-error`. New `data_stalled`/`data_resumed` statuses are not errors and should be ignored there — no change needed.
- **`openchamberEvents.ts:85-87`** handles heartbeats on a separate SSE channel for scheduled tasks. Not affected by this work.
- **Don't introduce new dependencies.** All changes use existing types.
- **Don't break the `UpstreamSseReader` public API.** The `onStall`/`onResume` callbacks are already declared; only the hub's wiring changes.
- **If the integration in Task 4 reveals that `currentAttempt` and `attemptAbortReason` don't already exist as accessible closures**, follow the existing heartbeat-timeout pattern (line 324-331) to wire them. Don't redesign the abort flow.
- **If a test fails in unexpected ways**, do not modify the test to match implementation. Investigate whether the implementation has a bug.