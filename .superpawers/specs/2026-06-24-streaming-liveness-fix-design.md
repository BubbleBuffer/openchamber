# Streaming Liveness Fix — Design

**Date:** 2026-06-24
**Branch:** `feature/streaming-liveness-fix`
**Status:** Draft for review

## Problem

Chat streams can appear frozen without the user or browser detecting a problem.

**Root cause:** The server sends `openchamber:heartbeat` WS data frames every 15 seconds to keep the browser's connection alive. The browser's only stall detector is a single 30-second timeout that resets on **any** WS frame, including heartbeats. When the server's upstream connection to OpenCode stalls (no real events for >20 seconds), the upstream reader reconnects silently while heartbeats keep flowing. The browser never detects the data gap. Result: a streaming chat shows the cursor blink over frozen content for minutes at a time with no error, no reconnect, and no user feedback.

The browser can distinguish "WS connected" from "WS receiving events," but the current code never does. The server already has stall detection — it just doesn't tell the client.

## Goal

Ship a focused fix that lets the browser detect "WS is up but upstream data has stopped" and respond by reconnecting with `lastEventId` for replay.

## Non-Goals

- UI feedback (status chip, toast, etc.) — pure logic change. Future work.
- Decomposition of `sync/event-pipeline.ts` into submodules.
- Decomposition of `sync-context.tsx`.
- Server-side stream infrastructure refactor beyond what's needed to wire the signal.

## Approach

Two changes, one on each side of the wire:

### Server: emit explicit stall/resume signals

1. **`global-hub.ts`** wires the existing `onStall` and `onResume` callbacks from `upstream-reader.ts` (already plumbed but unused at the hub layer). On `onStall`, the hub marks itself stalled. On `onResume`, it clears the flag and captures the upstream's `lastEventId`.
2. **`global-ws-bridge.ts`** subscribes to the hub's stall/resume signal. On stall, it sends `{type: "data_stalled"}` to all ready clients. On resume, it sends `{type: "data_resumed", lastEventId}`. The existing `socket.ping()` stays for NAT keepalive.
3. **Remove** the `openchamber:heartbeat` WS data frame from `global-ws-bridge.ts` and `directory-ws-bridge.ts`. The bug exists because of these frames, and the only other place heartbeats appear (`openchamberEvents.ts:85-87`) is a separate SSE channel for scheduled tasks that is unaffected.
4. **`types.ts`** extends `MessageStreamWsFrame` to include `data_stalled` and `data_resumed` variants.

### Browser: separate data-flow from socket liveness

1. **New module** `packages/ui/src/sync/liveness.ts` (~142 lines, ported from the stale branch). Pure, dual-timer monitor:
   - **Data timer** (default 15s) — reset only by `markDataEvent()` calls. Fires `onDataStall` if it expires.
   - **Socket timer** (default 30s) — reset only by `markSocketActivity()` calls. Fires `onSocketTimeout` if it expires.
   - Also responds to explicit `data_stalled`/`data_resumed` server signals: clears timers on resume, sets an "armed" state on stalled.
2. **`event-pipeline.ts`** integrates the liveness monitor:
   - On every real OpenCode event frame → `markDataEvent()`.
   - On every WS frame (including any future heartbeat-style control frame) → `markSocketActivity()`.
   - On `data_stalled` server frame → notify liveness monitor.
   - On `data_resumed` server frame with `lastEventId` → notify liveness monitor, then reconnect with that `lastEventId`.
   - On `onDataStall` from the monitor → trigger existing reconnect path with current `lastEventId` for replay.
   - On `onSocketTimeout` → same as current heartbeat-timeout behavior.
   - Remove all references to `openchamber:heartbeat`.

## Why this design

- **Wiring the existing 20s server callback is simpler than adding a parallel 5s monitor.** The upstream reader already detects stalls and calls `onStall`. Adding `createDataFlowLiveness` (the branch's separate 5s timer) would be a second source of truth. The branch needed it because its `upstream-reader` didn't have the callbacks; on main they're already there and just need to be connected.
- **Removing `openchamber:heartbeat` entirely is required, not optional.** The bug exists because these frames reset the browser's stall timer. The dual-timer design without removing them would be a half-fix — socket-only events would still mask upstream stalls.
- **The dual-timer split (data 15s, socket 30s) lets future UI work surface stall state without re-architecting.** A status chip could subscribe to `isDataFlowing`; a reconnect indicator could subscribe to `isSocketAlive`. This PR doesn't add those, but the API is shaped to support them.
- **`lastEventId` is the clean replay primitive.** The upstream reader already tracks it. Reusing it on the resume frame and on browser-initiated reconnects means no missed events.

## File-by-file change list

### New files

| File | Lines | Purpose |
|---|---|---|
| `packages/ui/src/sync/liveness.ts` | ~142 | Dual-timer liveness monitor (ported from branch `feature/streaming-refactor`) |
| `packages/ui/src/sync/liveness.test.ts` | ~104 | Unit tests for the monitor (ported from branch) |

### Modified files

| File | Change |
|---|---|
| `packages/web/server/src/domains/event-stream/types.ts` | Add `data_stalled` and `data_resumed` variants to `MessageStreamWsFrame` union |
| `packages/web/server/src/domains/event-stream/global-hub.ts` | Wire `onStall`/`onResume` callbacks from `createUpstreamSseReader` into hub state |
| `packages/web/server/src/domains/event-stream/global-ws-bridge.ts` | Subscribe to hub stall/resume signal → emit `data_stalled`/`data_resumed` frames. Remove `openchamber:heartbeat` data frame interval. |
| `packages/web/server/src/domains/event-stream/directory-ws-bridge.ts` | Remove `openchamber:heartbeat` data frame interval (consistency) |
| `packages/ui/src/sync/event-pipeline.ts` | Parse `data_stalled`/`data_resumed` frames. Integrate `liveness.ts` monitor with `markDataEvent()`/`markSocketActivity()`. Remove all `openchamber:heartbeat` handling. Reconnect on `onDataStall` with `lastEventId`. |
| `packages/ui/src/sync/__tests__/event-pipeline.test.js` (1040-line JS suite — primary coverage) and `packages/ui/src/sync/event-pipeline.test.ts` (59-line TS suite) | Update heartbeat-timeout tests to reflect new behavior. Add tests for `data_stalled`/`data_resumed` parsing. JS suite retains `bun:test` framework. TS suite stays as-is. |

## Data Flow

### Stall (upstream stops sending for >20s)

```
OpenCode → SSE stalls
   ↓
upstream-reader.ts: stall timer fires at 20s
   ↓
onStall({duration}) → global-hub.ts: hub.stalled = true
   ↓
global-hub.ts: notify hub stall subscribers
   ↓
global-ws-bridge.ts: send {type:"data_stalled"} to all readyClients
   ↓
event-pipeline.ts: receives frame → liveness.markDataStalled()
   ↓
liveness.ts: armed; if no data event within 15s, fires onDataStall
   ↓
event-pipeline.ts: onDataStall → reconnect path with lastEventId
```

### Resume (upstream reconnects)

```
OpenCode → SSE resumes (after reconnect with Last-Event-ID)
   ↓
upstream-reader.ts: wasStalled was true → fires onResume({lastEventId})
   ↓
global-hub.ts: hub.stalled = false, captures lastEventId
   ↓
global-ws-bridge.ts: send {type:"data_resumed", lastEventId}
   ↓
event-pipeline.ts: receives frame → liveness.markDataResumed(lastEventId)
   ↓
liveness.ts: clears stalled state, resets data timer
   ↓
event-pipeline.ts: normal operation continues; any reconnect during the stall already used lastEventId for replay
```

### Pure socket failure (no upstream stall, just network)

```
WS drops (no stall signal from server)
   ↓
socket timer fires at 30s (or socket close itself)
   ↓
liveness.ts: onSocketTimeout → existing reconnect path
   ↓
event-pipeline.ts: reconnect with backoff (unchanged)
```

## Edge Cases

| Case | Behavior |
|---|---|
| `data_stalled` arrives, then socket drops before resume | Reconnect path runs on socket close. On reconnect, browser sends `lastEventId` from before the stall. Server replays. |
| `data_resumed` arrives mid-reconnect | Browser ignores it (already reconnecting); reconnect's own replay handles missed events. |
| Server stall then upstream comes back, but no `lastEventId` advanced | `data_resumed` is sent with empty `lastEventId`. Browser treats as "no replay needed," just clears stalled state. |
| Browser receives `data_stalled` twice in a row | Idempotent — monitor stays armed. |
| Socket-only events (control frames, future keepalives) | Reset socket timer only, not data timer. |

## Testing

### Server (vitest)

- **`global-hub.test.ts` (new):** Mock `createUpstreamSseReader` to fire `onStall`/`onResume`. Verify hub state transitions and subscriber notifications.
- **`global-ws-bridge.test.ts` (new):** Mock hub. Verify `data_stalled`/`data_resumed` frames are sent to ready clients and only ready clients. Verify heartbeat data frame is no longer sent.
- **Extend `protocol.test.ts`:** Frame serialization for new variants.
- **Extend `upstream-reader.test.ts`:** Already covers `onStall`/`onResume` firing — no change needed there.

### Browser (bun:test)

- **Port `liveness.test.ts`:** All 7 behaviors from branch: stall-after-silence, socket-vs-data separation, timeout fires, reset, resumed signal clears state, `isDataFlowing`/`isSocketAlive` predicates.
- **Extend `event-pipeline.test.ts`:** Replace the existing `openchamber:heartbeat` timeout test with a `data_stalled`/`data_resumed` flow test. Verify socket-only frames no longer reset the data timer.
- **Manual:** Browser dev tools → throttle SSE upstream to 5s intervals, observe `data_stalled` frame, observe reconnect with `lastEventId`.

## Verification

- `bun run type-check` clean
- `bun run lint` clean
- All new and existing tests pass
- `bun run build` succeeds

## Out of Scope (Future Work)

- UI feedback for stalled state (status chip, toast)
- Decomposition of `sync/event-pipeline.ts` into `event-pipeline/{connection,coalescer,backoff,liveness,index}.ts`
- Decomposition of `sync-context.tsx` (separate spec)
- Server-side `global-ws-bridge.ts` decomposition beyond what this fix requires

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Stall wiring regression breaks global stream entirely | Medium | Existing `upstream-reader.test.ts` covers `onStall`/`onResume` firing. New `global-hub.test.ts` covers state propagation. Existing tests of `event-pipeline` continue to pass (heartbeat removal is additive). |
| Reconnect loop on every minor stall | Low | Data timer (15s) is shorter than server stall timeout (20s). Server only signals stall after sustained silence; minor jitters don't trigger. |
| Last-event-id replay semantics off-by-one | Medium | Reuse existing `lastEventId` plumbing from `upstream-reader.ts:127` — already proven in production. Browser reuses the same field. |
| `openchamberEvents.ts` SSE channel also uses heartbeat | Low | Verified during research — it has its own early-return on `openchamber:heartbeat` and is a separate SSE connection (scheduled tasks), not the main event stream. No change needed. |
| Removing `openchamber:heartbeat` breaks some unknown client | Low | Browser code path was a no-op for state updates (`default: break` in `handleEvent`). Removing it changes only the heartbeat-reset behavior, which is the bug. |

## Rollback Plan

If this ships and causes regressions:
1. Revert the merge commit.
2. The fix is fully additive on the wire side (new frame types); old browser versions simply ignore unknown frames (`default: break`). Removing heartbeat is the only breaking server-side change; reverting restores old behavior.