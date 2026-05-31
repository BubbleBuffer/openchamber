# Phase 3.4 Server Bridge And SessionRuntime Delegation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side session machine actors and convert `SessionRuntime` from independent lifecycle/activity authority into compatibility glue over machine snapshots/selectors.

**Architecture:** The server bridge owns EventBus/OpenCode input normalization, actor lifecycle, effect execution, and shutdown. The shared machine owns lifecycle, activity, retry, interruptions, history, messages, errors, and fatal containment semantics.

**Tech Stack:** JavaScript server modules, Express runtime wiring, EventBus, `@openchamber/session-state`, Bun/Vitest server tests.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Server registry, normalization, effect execution, snapshot publishing, shutdown, and `SessionRuntime` delegation are ordered and testable.

## Files

- Create: `packages/web/server/lib/session-state/DOCUMENTATION.md`
- Create: `packages/web/server/lib/session-state/server-session-actor-registry.js`
- Create: `packages/web/server/lib/session-state/server-session-event-normalizer.js`
- Create: `packages/web/server/lib/session-state/server-session-effect-executor.js`
- Create: `packages/web/server/lib/session-state/server-session-snapshot-publisher.js`
- Create: `packages/web/server/lib/session-state/server-session-machine-bridge.js`
- Create: `packages/web/server/lib/session-state/server-session-machine-bridge.test.js`
- Modify: `packages/web/server/lib/opencode/session/session-runtime.js`
- Modify: `packages/web/server/lib/opencode/session/session-runtime.test.js`
- Modify: `packages/web/server/lib/opencode/bootstrap/bootstrap-runtime.js`
- Modify: `packages/web/server/lib/opencode/bootstrap/shutdown-runtime.js`

## Task 1: Server Module Documentation And Registry

- [ ] **Step 1: Create server module docs**

Document purpose, public exports, EventBus inputs, effect execution, snapshot publishing, failure handling, shutdown, and compatibility ownership in `packages/web/server/lib/session-state/DOCUMENTATION.md`.

- [ ] **Step 2: Write registry tests**

Test actor creation by `directory::sessionId`, duplicate-key rejection for explicit registration, identity mismatch rejection, actor fatal containment, idle eviction, and `dispose()` stopping all actors.

- [ ] **Step 3: Implement `server-session-actor-registry.js`**

Use the shared package to create actors. Keep resources outside actor context. Expose `getOrCreate`, `send`, `getSnapshot`, `evict`, and `dispose`.

## Task 2: Server Event Normalization

- [ ] **Step 1: Write normalizer tests from the canonical table**

Cover OpenCode `session.status` busy/retry/idle, `message.updated`, `message.part.updated`, `message.part.delta`, permission asked/replied, question asked/answered/rejected, load failures, stream failures, and malformed payload rejection.

- [ ] **Step 2: Implement `server-session-event-normalizer.js`**

Move session-domain normalization out of `SessionRuntime` and duplicated event-stream helpers into focused pure functions that return `SessionDomainEvent` values or validation errors.

- [ ] **Step 3: Preserve source metadata**

Every normalized event must include `directory`, `sessionId`, `timestamp`, and `sourceEventId` when available.

## Task 3: Effect Executor And Snapshot Publisher

- [ ] **Step 1: Implement `server-session-effect-executor.js`**

Execute `effect.sendPrompt`, `effect.abort`, `effect.retry`, `effect.loadOlder`, `effect.scheduleRetryCooldown`, `effect.cancelRetryCooldown`, `effect.publishSnapshot`, and `effect.reportFatalInvariant` through injected server runtime callbacks.

- [ ] **Step 2: Keep timers and abort handles outside context**

Store cooldown timers and request handles in executor-owned maps keyed by `SessionActorKey`. Clear them on actor eviction and shutdown.

- [ ] **Step 3: Implement `server-session-snapshot-publisher.js`**

Publish validated `SessionSnapshotV1` payloads to the active transport integration. Do not emit old global session status/activity events from this publisher.

## Task 4: Bridge Wiring

- [ ] **Step 1: Implement `server-session-machine-bridge.js`**

Subscribe to Phase 1 EventBus/OpenCode payload events, normalize them, send events to actors, execute emitted effects, publish snapshots, and report fatal invariant diagnostics.

- [ ] **Step 2: Wire bridge into bootstrap runtime**

Create the bridge beside `SessionRuntime` and inject it into runtimes that need compatibility snapshots. Ensure startup works when the OpenCode server is not ready yet.

- [ ] **Step 3: Stop actors during shutdown**

Modify shutdown runtime so the server session machine bridge disposes actors before runtime disposal.

## Task 5: Convert `SessionRuntime` To Compatibility Glue

- [ ] **Step 1: Replace authoritative maps**

Change `getSessionActivitySnapshot()`, `getSessionStateSnapshot()`, and `getSessionAttentionSnapshot()` to derive from machine snapshots/selectors.

- [ ] **Step 2: Remove independent lifecycle/activity/retry authority**

Remove or demote `sessionActivityPhases`, `sessionActivityCooldowns`, `sessionStates`, and `sessionAttentionStates` as authoritative state. Any temporary cache must fail parity if it diverges.

- [ ] **Step 3: Preserve compatibility route shapes**

Existing notification/session snapshot routes must keep their response shape until their consumers move to canonical snapshots in Plan 5.

## Task 6: Server Tests And Commit

- [ ] **Step 1: Run bridge tests**

Run: `bun test packages/web/server/lib/session-state/`

Expected: exits 0.

- [ ] **Step 2: Run existing server runtime tests**

Run: `bun run --cwd packages/web test -- packages/web/server/lib/opencode/session/session-runtime.test.js packages/web/server/lib/event-stream/runtime.test.js`

Expected: exits 0 or the package runner equivalent exits 0.

- [ ] **Step 3: Run root checks**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 4: Commit**

Run: `git add packages/web/server/lib/session-state packages/web/server/lib/opencode/session packages/web/server/lib/opencode/bootstrap && git commit -m "feat: add server session machine bridge"`

Expected: commit succeeds.
