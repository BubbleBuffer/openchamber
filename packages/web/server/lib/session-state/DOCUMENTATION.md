# Session State Server Module

## Overview

This module owns server-side session machine actors and bridges the OpenCode event stream to the shared `@openchamber/session-state` machine. It normalizes OpenCode SSE payloads into `SessionDomainEvent` values, routes them to per-session actors, executes emitted effects, and publishes validated snapshots.

## Public Exports

### `server-session-actor-registry.js`

Manages the lifecycle of XState v5 session machine actors.

**Public API:**
- `createSessionActorRegistry(config)` → `SessionActorRegistry`
- `registry.getOrCreate(directory, sessionId)` → `SessionActor`
- `registry.send(key, event)` → `void`
- `registry.getSnapshot(key)` → `SessionSnapshotV1 | null`
- `registry.evict(key)` → `void`
- `registry.dispose()` → `void`

**Actor identity:** `directory::sessionId`

**Behavior:**
- Creates actors lazily on first `getOrCreate` call.
- Uses `createSessionMachine` from `@openchamber/session-state` with a placeholder initial context.
- Actors are stored outside the machine context (snapshot-publishable state lives in the actor, not closure).
- Idle actors (no state transitions within30 minutes) are evicted automatically.
- `dispose()` stops all actors and clears timers.

### `server-session-event-normalizer.js`

Pure functions that convert OpenCode SSE payloads into `SessionDomainEvent` values or return validation errors.

**Public API:**
- `normalizeOpenCodePayload(payload, directory?)` → `Array<{ event: SessionDomainEvent, sourceEventId: string } | { error: Error }>`
- `normalizeSessionStatus(payload, directory, timestamp, sourceEventId)` → `SessionDomainEvent | null`
- `normalizeMessageUpdated(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventMessageUpdated | null`
- `normalizeMessagePartUpdated(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventMessagePartUpdated | null`
- `normalizeMessagePartDelta(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventMessagePartDelta | null`
- `normalizePermissionAsked(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventPermissionRequested | null`
- `normalizeQuestionAsked(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventQuestionRequested | null`
- `normalizeStreamFailure(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventStreamFailed | null`
- `normalizeLoadFailure(payload, directory, timestamp, sourceEventId)` → `SessionDomainEventSessionLoadFailed | null`

**Canonical table coverage:**
- `session.status` busy/retry/idle → `STREAM_STARTED`, `STREAM_COMPLETED`, activity phase transitions
- `message.updated` → `MESSAGE_UPDATED`
- `message.part.updated` → `MESSAGE_PART_UPDATED`
- `message.part.delta` → `MESSAGE_PART_DELTA`
- permission asked/replied → `PERMISSION_REQUESTED`, `PERMISSION_RESOLVED`
- question asked/answered/rejected → `QUESTION_REQUESTED`, `QUESTION_ANSWERED`, `QUESTION_REJECTED`
- load failures → `SESSION_LOAD_FAILED`
- stream failures → `STREAM_FAILED`
- Malformed payloads → error objects (not dropped silently)

**Metadata preservation:** Every normalized event includes `directory`, `sessionId`, `timestamp`, and `sourceEventId`.

### `server-session-effect-executor.js`

Executes `SessionMachineEffect` values produced by the machine through injected server runtime callbacks.

**Public API:**
- `createEffectExecutor(config)` → `EffectExecutor`
- `executor.execute(effect)` → `Promise<void>`
- `executor.executeAll(effects)` → `Promise<void>`
- `executor.clearForActor(key)` → `void`

**Effect handlers:**
- `sendPrompt` → `callbacks.sendPrompt(directory, sessionId, prompt, provider, model, agent)`
- `abort` → `callbacks.abort(directory, sessionId)`
- `retry` → `callbacks.retry(directory, sessionId, retryCount, retryMessage)`
- `loadOlder` → `callbacks.loadOlder(directory, sessionId)`
- `scheduleRetryCooldown` → sets a timer; stores handle in executor-owned map
- `cancelRetryCooldown` → clears timer for actor
- `publishSnapshot` → stored for bridge to publish; not executed inline
- `reportFatalInvariant` → `callbacks.reportFatalInvariant(directory, sessionId, invariantName, actorKey, revision, eventType)`

**Resource management:** Timers and abort handles are stored in executor-owned `Map<SessionActorKey, Timer | AbortController>`. Cleared on `clearForActor` and `dispose`.

### `server-session-snapshot-publisher.js`

Publishes validated `SessionSnapshotV1` payloads to the active transport integration.

**Public API:**
- `createSnapshotPublisher(config)` → `SnapshotPublisher`
- `publisher.publish(snapshot)` → `void`
- `publisher.setTransport(transport)` → `void`

**Behavior:**
- Validates snapshot with `validateSessionSnapshotV1` before publishing.
- Publishes via `transport.writeSseEvent(res, snapshot)` to connected clients.
- Does NOT emit old global `session.status` / `session.activity` events.
- Snapshot transport is injected at construction or via `setTransport`.

### `server-session-machine-bridge.js`

Wires the EventBus → normalizer → registry → executor → publisher chain.

**Public API:**
- `createServerSessionMachineBridge(config)` → `ServerSessionMachineBridge`
- `bridge.start()` → `void`
- `bridge.stop()` → `void`

**Behavior:**
- Subscribes to `EVENT_RECEIVED` on the EventBus.
- Normalizes incoming payloads using `server-session-event-normalizer.js`.
- Sends normalized events to actors via `registry.send()`.
- Executes emitted effects via `effectExecutor.executeAll()`.
- Publishes snapshots via `snapshotPublisher.publish()`.
- Reports fatal invariants via `callbacks.reportFatalInvariant()`.
- Handles `OPENCODE_READY` to reset actor activity on server restart.
- Startup works when OpenCode is not ready yet (bridge subscribes but gracefully skips if runtime not initialized).

## Failure Handling

- Normalizer errors are logged and skipped (one bad event doesn't stop the bridge).
- Effect execution errors are caught and logged; they do not crash the actor.
- Actor fatal containment: actors that hit `FATAL_INVARIANT_FAILED` remain in the `fatal` lifecycle state; `dispose()` still stops them cleanly.
- Snapshot validation errors are logged; invalid snapshots are not published.

## Shutdown

- `dispose()` is called by the shutdown runtime before runtime disposal.
- Clears all cooldown timers, stops all actor subscriptions, and disposes the registry.
- The bridge `stop()` method removes EventBus subscriptions.

## Compatibility Ownership

### SessionRuntime — Compatibility Glue (NOT Independent Authority)

`SessionRuntime` in `session-runtime.js` is **compatibility glue**, not an independent
lifecycle/activity/retry authority. It exists to support code that still reads from
the legacy route payload shapes during the Phase 3 migration window.

**What SessionRuntime IS:**
- A compatibility wrapper that derives session activity, state, and attention
  snapshots from machine actors via `actorRegistry.entries()`.
- A bridge for route handlers that expect the legacy `getSessionActivitySnapshot()`,
  `getSessionStateSnapshot()`, `getSessionAttentionSnapshot()` API.
- A transitional layer that fails parity if legacy caches diverge from machine state.

**What SessionRuntime IS NOT:**
- An independent source of truth for session lifecycle, activity, or retry state.
- The authoritative authority for `streamingMessageId`, `isWorking`, `retryMessage`,
  `permissions`, `questions`, or history loading.
- A machine actor substitute — it reads from machine snapshots, it does not drive them.

**Machine is the authority.** All session state authority (lifecycle, streaming,
retry, blocking interruptions, history) lives in the session machine actors managed
by `server-session-actor-registry.js`. `SessionRuntime` caches are derived from
those actors and will be removed once all callers migrate to the snapshot API.

### Route Payloads

Route payload shapes (`getSessionActivitySnapshot`, `getSessionStateSnapshot`,
`getSessionAttentionSnapshot`) remain in their legacy form during the migration
window. These are derived from machine state by `SessionRuntime`, not the machine
itself.

### Deprecated Server Global Transports (Phase 3.4)

The following server global transports have been **removed** and must not be
used or reintroduced:

| Transport | Removed | Replacement |
|-----------|---------|-------------|
| `openchamber:session-status` (global) | Phase 3.4 | `openchamber:session-snapshot` via canonical transport |
| `openchamber:session-activity` (global) | Phase 3.4 | `openchamber:session-snapshot` via canonical transport |

**Exception:** VS Code's local `sessionActivityWatcher.ts` self-generates
`openchamber:session-activity` for VS Code webview communication only — this
is a local signal, not the removed server global transport. See Phase 3 allowlist.
