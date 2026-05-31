# Phase 3: Shared Session State Machine — Design Spec

**Status:** Draft, revised after architecture critique  
**Date:** 2026-05-28  
**Parent program:** Radical Architecture Refactor v2  
**Depends on:** Phase 1 server runtime extraction, Phase 2 chat adapter modularization  
**Scope:** Full shared session-domain XState machine, canonical snapshots, server/client runtime bridges, chat adapter migration, legacy authority removal  
**Out of scope:** Legacy store deletion, non-chat UI migration, visual redesign, OpenCode SDK protocol changes

## Pre-Work: Branch Reconciliation And Dependency Setup

Before Phase 3 implementation, the working tree must be clean and the correct integration base established.

### Current State

- **Current branch:** `feature/chat-adapter-modularization-spec` with Phase 2 UI-only commits.
- **Integration target:** `feature/phase-1b-runtime-extractions`, which contains EventBus plus EventStreamRuntime, TunnelRuntime, NotificationRuntime, SessionRuntime, bounded caches, and security fixes.
- **Known dirty server files:** `packages/web/server/lib/opencode/runtime.js` and `packages/web/server/lib/opencode/runtime.test.js` contain a small import-path fix that should be discarded before rebase and re-applied after rebase if still needed.
- **Expected conflict level:** low. Phase 2 commits are UI-only. Phase 1b commits are server-only. The dirty server files are the only conflict risk.

### Pre-Work Tasks

1. **Discard dirty server files before rebase.**
   The dirty import fix changes `./auth.js` to `./auth/auth-state-runtime.js` and `./network.js` to `./network/network-runtime.js`. Discard it before rebase; re-apply after rebase if the broken imports still exist.

2. **Rebase Phase 2 onto Phase 1b.**
   ```bash
   git checkout feature/chat-adapter-modularization-spec
   git checkout -- packages/web/server/lib/opencode/runtime.js packages/web/server/lib/opencode/runtime.test.js
   git rebase feature/phase-1b-runtime-extractions
   ```

3. **Re-apply the server import fix if needed.**
   Verify `packages/web/server/lib/opencode/runtime.js` imports the actual auth/network runtime file paths after rebase.

4. **Create the shared session-state workspace package.**
   Add `packages/session-state/` as a private workspace package named `@openchamber/session-state`. This package is runtime-agnostic and contains no React, DOM, Express, OpenCode SDK, filesystem, browser, EventBus, or AbortController imports.

5. **Install XState dependencies deliberately.**
   - `xstate` belongs in `@openchamber/session-state`.
   - `@xstate/react` belongs in `@openchamber/ui` only.
   - Server code imports the shared package, not React bindings.

6. **Verify baseline.**
   ```bash
   bun run type-check && bun run lint && bun test packages/ui/src/components/chat/
   ```
   Expected: type-check passes all packages, lint is 0/0, chat tests pass.

## Problem Statement

Phase 1 split the server monolith into focused runtimes and EventBus wiring, but it did not create a canonical session-domain model. Server-side lifecycle/activity state still exists as derived maps, cooldown timers, synthetic events, request handlers, retry/error handling, and transport broadcasts.

Phase 2 gave the client a chat adapter boundary, but chat state still comes from scattered sync/UI stores, `useStreamingStore`, and derived heuristics. The Phase 2 adapter names are useful, but the real aggregation still lives in `useChatSessionData` and sync-store selectors.

The original Phase 3 direction was correct, but it left too much authority split across old and new systems. The revised Phase 3 must build the clean architecture directly:

```text
@openchamber/session-state
  owns the complete canonical session-domain XState machine

Server bridge
  owns OpenCode/EventBus/SSE resources and feeds/runs the shared machine

Client bridge
  owns React actor lifecycle and feeds/runs the shared machine for chat adapters

Legacy stores/runtimes
  temporary compatibility surfaces only, never alternate session-domain truth
```

Rollout is staged. Architecture is not partial. The shared XState machine models the complete session domain from the first implementation; migration phases decide which consumers are allowed to read from it.

## Design Goals

- Define one canonical session-domain model shared by server and client from day one.
- Use XState v5 for the real state machine, not an interim events/reducers/snapshots layer.
- Make the machine runtime-agnostic, serializable, fixture-tested, and fail-fast.
- Move session-domain interpretation out of `SessionRuntime`, sync-store heuristics, and chat adapter aggregation.
- Preserve Phase 2 chat component APIs while replacing adapter internals.
- Replace old global session synthetic events with one canonical snapshot transport event.
- Keep UI presentation state, server resources, transport connections, and SDK objects outside machine context.
- Make streaming, abort, retry, permissions, questions, reconnect, snapshot restoration, history, and fatal recovery explicit and testable.

## Non-Goals

- Do not delete legacy stores in Phase 3. Phase 4 handles deletion after all consumers migrate.
- Do not rewrite chat presentation components. Adapter and data-hook internals change; component contracts stay stable unless a migration slice explicitly names the component boundary.
- Do not put React, DOM, Express, OpenCode SDK calls, AbortControllers, timers, EventBus instances, filesystem objects, or browser globals in shared machine context.
- Do not keep `SessionRuntime` as an independent lifecycle/activity authority after the server bridge lands.
- Do not broadcast both old and new global session protocols.
- Do not add legacy fallback for migrated fields.

## Architecture Overview

```text
packages/session-state
  createSessionMachine()
  typed context/events/effects
  SessionSnapshotV1
  snapshot restoration entrypoint
  pure transition actions and guards
  selectors/derivations
  fixture runner

packages/web/server/lib/session-state
  ServerSessionActorRegistry
  ServerSessionMachineBridge
  OpenCode/EventBus normalizers
  effect executor
  openchamber:session-snapshot publisher

packages/ui/src/components/chat/state
  ClientSessionActorRegistry
  ClientSessionMachineBridge
  sync/snapshot normalizers
  useSessionActor/useSessionSnapshot selectors
  machine-backed Phase 2 adapters

Legacy SessionRuntime/sync stores
  temporary compatibility APIs backed by or checked against machine snapshots
```

Server and client run separate actors. They do not share process objects. They share the same machine definition, event types, snapshot schema, invariants, and fixture expectations.

## Source Of Truth During Phase 3

The shared machine is the canonical session-domain model from the beginning of Phase 3.

Rules:

1. **Machine owns session-domain interpretation.** Lifecycle, activity, streaming state, messages, parts, permissions, questions, retry/error, snapshot restoration/reconnect, history metadata, and emitted effect intents are machine-owned.
2. **Legacy state is compatibility state.** Legacy stores/runtimes may temporarily receive events or expose compatibility APIs, but they are not valid alternate truth for migrated domains.
3. **Migration order controls reads, not model scope.** The machine models the complete session domain before every consumer reads from it.
4. **Divergence is not normal.** Once a slice is declared migrated, divergence from the machine is a bug, rollback trigger, or explicitly allowlisted temporary gap.
5. **No bridge invents local semantics.** Runtime bridges translate inputs/outputs and manage actors/resources. They do not define lifecycle, retry, streaming, interruption, or history rules.

## Fail-Fast Policy

Phase 3 is fail-fast by default.

### Dev, Test, And CI

The following fail immediately:

- Impossible machine transitions.
- Malformed domain events.
- Invalid snapshot restoration input.
- Non-serializable machine context or snapshots.
- Missing `directory` or `sessionId` identity.
- Duplicate actor keys in one registry.
- Snapshot schema violations.
- Adapter reads of migrated fields from legacy state.
- Parity mismatch for a migrated slice.
- Any open allowlist entry for a domain marked complete.

### Production

Production invariant violations are globally severe but session-local in containment.

When a session actor hits a machine invariant violation:

- The affected actor enters a fatal state and stops processing domain events until restored from a validated canonical snapshot.
- The UI renders an explicit recovery surface for that session.
- The app emits a high-severity diagnostic containing actor key, revision, event type, invariant name, source event ID when available, and snapshot version.
- Other session actors may continue.
- There is no fallback to legacy state for migrated fields.

Recovery requires a valid canonical restoration snapshot or a code fix. Silent warning-only parity checks are not allowed.

## Shared Package Contract

Create `packages/session-state/` with package name `@openchamber/session-state`.

The package exports:

- `createSessionMachine`.
- `createInitialSessionContext`.
- `restoreSessionMachineSnapshot(machine, snapshot)` or equivalent snapshot restoration entrypoint.
- Typed `SessionMachineContext`.
- Typed `SessionDomainEvent` union.
- Typed `SessionMachineEffect` union.
- `SessionActorKey` helpers.
- `SessionSnapshotV1` and snapshot validation.
- Machine selectors/derivations used by server and client.
- Fixture runner that drives the real machine, not reducer-only helpers.

The package must not import runtime code. Reducer-like operations are implementation details inside machine actions; the exported artifact is the full shared XState machine.

## XState Decision

Use XState v5 in the shared package.

Reasons:

- The desired model is a statechart with parallel regions, not another loose reducer/event heap.
- Formal transitions make impossible combinations explicit.
- One actor per session matches isolation and fatal containment.
- The same machine can be interpreted on server and client.
- Runtime bridges can test against one fixture suite.
- React integration remains optional and isolated to `@openchamber/ui` through `@xstate/react`.

This dependency is justified only if the implementation keeps state semantics inside the shared machine. If bridges or adapters re-create state rules locally, the Phase 3 architecture has failed.

## Actor Identity And Lifecycle

Actor keys include directory and session ID:

```ts
type SessionActorKey = `${string}::${string}`; // `${directory}::${sessionId}`
```

Rules:

- `directory` and `sessionId` are required for every actor, event, and snapshot.
- Actor registries reject duplicate keys.
- Actor registries reject events whose key does not match the target actor.
- Server and client registries may have different retention policies, but both use the same keying.
- Registry retention never changes session-domain semantics.

## Machine Regions

The machine uses parallel regions. Region state is serialized explicitly in snapshots. Consumers must not rely on a vague `lifecyclePhase` context field.

| Region | Responsibility |
|--------|----------------|
| `lifecycle` | session opening, ready, streaming, completed, aborted, not-found, fatal |
| `activity` | working, streaming, aborting, attention-worthy activity |
| `interruptions` | active permission and question requests |
| `history` | loaded message window, load-older state, history boundaries |
| `retry` | retry state, retry counters, retry cooldown/effect intent |
| `error` | recoverable error state and fatal invariant state |

Selectors may derive convenience booleans such as `isStreaming`, `isWorking`, `needsAttention`, `hasBlockingInterruption`, and `canLoadOlder` from region state plus context.

## Machine-Owned Context

The machine owns the complete session domain from the first implementation.

| Field | Notes |
|-------|-------|
| `directory` | actor identity and routing guard |
| `sessionId` | actor identity |
| `projectId` | nullable session metadata |
| `parentSessionId` | nullable session metadata |
| `exists` | `false` only after canonical not-found input; actor remains inspectable and recoverable by snapshot restoration |
| `loaded` | current session identity and initial message window have loaded or restored successfully |
| `messageOrder` | ordered message IDs for loaded window |
| `messagesById` | stable message metadata keyed by message ID |
| `partsByMessageId` | ordered part IDs per message |
| `partsById` | part records keyed by part ID; streaming deltas update only the active part record |
| `streamingMessageId` | current streaming message ID, if any |
| `streamingPartId` | current streaming part ID, if any |
| `permissionsById` | active and recently resolved permission domain records |
| `questionsById` | active and recently answered question domain records |
| `retryMessage` | current retry/error display message, if any |
| `retryCount` | current retry attempt count |
| `retryCooldownUntil` | serializable timestamp or null; timers stay in bridge/effects |
| `errorType` | normalized recoverable error category |
| `fatalError` | invariant failure details for the actor fatal state |
| `isLoadingOlder` | machine-owned history request state |
| `hasMoreAbove` | canonical older-history availability |
| `oldestLoadedMessageId` | oldest loaded message boundary |
| `newestLoadedMessageId` | newest loaded message boundary |
| `historyLoadError` | load-older error details, if any |
| `revision` | monotonic actor revision incremented for accepted domain changes |
| `updatedAt` | serializable timestamp supplied by bridge event metadata |
| `sourceEventId` | latest accepted transport/source event ID when available |

### Normalized Messages And Parts

Canonical message state is normalized:

```ts
interface SessionMessagesState {
  messageOrder: string[];
  messagesById: Record<string, SessionMessageRecord>;
  partsByMessageId: Record<string, string[]>;
  partsById: Record<string, SessionPartRecord>;
}
```

Rules:

- Message records hold stable message metadata, not inline streaming text.
- Part records hold content/tool/error/metadata payloads.
- A text delta updates one `partsById[partId]` record.
- Part-only updates must preserve `messageOrder`, `messagesById`, unrelated `partsByMessageId` arrays, and unrelated `partsById` records.
- Message identity must not change for part-only streaming updates.
- Render-ready arrays are derived by selectors outside the canonical snapshot.

### Not Owned By Machine Context

These remain runtime/UI concerns:

- AbortController instances and other non-serializable server resources.
- OpenCode SDK client objects.
- EventBus instance.
- SSE/WebSocket connection objects.
- Timers and intervals.
- Composer draft text.
- Textarea cursor/selection state.
- Provider/model/agent/variant selection.
- Attached files and local composer queue state.
- Viewport scroll position.
- Timeline reveal state: `turnStart`, `pendingRevealWork`, pin-to-bottom, viewport/windowing, reveal animations.
- Mobile drawer/layout state.
- Theme/layout preferences.
- Linked issue/PR picker local UI state.

The machine may receive send-time provider/model/agent/variant values only as opaque effect payload metadata for prompt submission. It does not own or select those values.

## History And Timeline Boundary

The machine owns history domain state:

- `isLoadingOlder`.
- `hasMoreAbove`.
- `oldestLoadedMessageId`.
- `newestLoadedMessageId`.
- `historyLoadError`.
- Successful prepend/merge of older messages into normalized message state.

The UI owns timeline presentation state:

- `turnStart`.
- `pendingRevealWork`.
- Scroll position.
- Pin-to-bottom.
- Viewport/windowing.
- Reveal animations.

`useChatTimelineState` may combine machine history selectors with UI-owned timeline-controller state, but it must not move presentation state into machine context.

## SessionSnapshotV1

`SessionSnapshotV1` is the serializable current truth of one session actor at one revision. It is used for transport, actor restoration, adapter selectors, compatibility APIs, and parity checks. It is not a UI convenience object.

Required shape:

```ts
interface SessionSnapshotV1 {
  version: 1;
  key: {
    directory: string;
    sessionId: string;
  };
  identity: {
    projectId: string | null;
    parentSessionId: string | null;
    exists: boolean;
    loaded: boolean;
  };
  regions: {
    lifecycle: string;
    activity: string;
    interruptions: string;
    history: string;
    retry: string;
    error: string;
  };
  domain: {
    messageOrder: string[];
    messagesById: Record<string, SessionMessageRecord>;
    partsByMessageId: Record<string, string[]>;
    partsById: Record<string, SessionPartRecord>;
    streamingMessageId: string | null;
    streamingPartId: string | null;
    permissionsById: Record<string, SessionPermissionRecord>;
    questionsById: Record<string, SessionQuestionRecord>;
    retry: SessionRetrySnapshot;
    error: SessionErrorSnapshot;
    history: SessionHistorySnapshot;
  };
  meta: {
    revision: number;
    updatedAt: number;
    sourceEventId: string | null;
    hydratedAt: number | null;
  };
}
```

Snapshot rules:

- Version from day one.
- Explicit region values, not derived `lifecyclePhase` fields.
- Monotonic `revision` per actor for accepted domain changes.
- Serializable only; no functions, class instances, AbortControllers, stores, SDK clients, Maps, Sets, Dates, or DOM objects.
- Snapshot validation is shared and fail-fast.
- Snapshot restoration validates version, identity, region values, normalized message references, and monotonic revision rules.

## Domain Event Model

Machine events are typed `SessionDomainEvent` values. Server and client bridges map transport-specific inputs to this union.

Core event families:

| Family | Examples | Notes |
|--------|----------|-------|
| identity/load | `SESSION_OPENED`, `SESSION_LOADED`, `SESSION_NOT_FOUND`, `SESSION_LOAD_FAILED` | establish actor identity and load state |
| prompt/stream | `PROMPT_SUBMITTED`, `STREAM_STARTED`, `STREAM_COMPLETED`, `STREAM_FAILED` | lifecycle/activity transitions |
| messages/parts | `MESSAGE_ADDED`, `MESSAGE_UPDATED`, `MESSAGE_PART_STARTED`, `MESSAGE_PART_DELTA`, `MESSAGE_PART_UPDATED`, `MESSAGE_PART_FINISHED`, `MESSAGE_PART_REMOVED` | normalized message/part updates |
| abort | `ABORT_REQUESTED`, `ABORT_CONFIRMED`, `ABORT_FAILED` | machine emits effect intent for runtime abort |
| interruptions | `PERMISSION_REQUESTED`, `PERMISSION_RESOLVED`, `QUESTION_REQUESTED`, `QUESTION_ANSWERED`, `QUESTION_REJECTED` | permission/question state |
| history | `LOAD_OLDER_REQUESTED`, `LOAD_OLDER_COMPLETED`, `LOAD_OLDER_FAILED` | older-history domain state |
| retry/error | `RETRY_REQUESTED`, `RETRY_STARTED`, `RETRY_FAILED`, `ERROR_DISMISSED`, `FATAL_INVARIANT_FAILED` | retry and fatal containment |

Every event must include or be routed with:

- `directory`.
- `sessionId`.
- `sourceEventId` when available.
- `timestamp` supplied by bridge metadata.

### Delta Semantics

The spec does not define heuristic out-of-order delta reordering or buffering.

Streaming deltas are append/update events for a valid active part. The machine applies a valid delta to the target part record. Duplicate or malformed deltas follow the fail-fast and idempotency rules defined by the concrete event payload. If OpenCode later provides explicit sequencing metadata, that can be added as a versioned event contract change.

## Normalization Tables

The implementation plan must include concrete normalization tables before coding bridge logic.

Minimum required mappings:

| Transport/source input | Domain event or snapshot output |
|------------------------|---------------------------------|
| OpenCode `session.status` busy/retry/idle | lifecycle/activity/retry domain events |
| OpenCode `message.updated` | `MESSAGE_ADDED` or `MESSAGE_UPDATED` |
| OpenCode `message.part.updated` | `MESSAGE_PART_STARTED`, `MESSAGE_PART_UPDATED`, or `MESSAGE_PART_FINISHED` |
| OpenCode `message.part.delta` | `MESSAGE_PART_DELTA` |
| OpenCode message/part removal if present | `MESSAGE_PART_REMOVED` or message removal event if supported |
| OpenCode permission asked/replied | `PERMISSION_REQUESTED` / `PERMISSION_RESOLVED` |
| OpenCode question asked/answered/rejected | `QUESTION_REQUESTED` / `QUESTION_ANSWERED` / `QUESTION_REJECTED` |
| OpenCode/runtime error | `SESSION_LOAD_FAILED`, `STREAM_FAILED`, or recoverable error event |
| Sync store loaded session window | `SessionSnapshotV1` restored with `restoreSessionMachineSnapshot(...)` or incremental `SESSION_LOADED` plus message/part events |
| Load older response | `LOAD_OLDER_COMPLETED` |
| Load older failure | `LOAD_OLDER_FAILED` |

Bridge normalizers are allowed to adapt transport shapes. They are not allowed to invent session-domain behavior.

## Machine Effects

The shared machine emits typed effect intents. Bridges execute effects and feed results back as domain events.

Core effects:

| Machine effect | Bridge responsibility |
|----------------|-----------------------|
| `effect.sendPrompt` | call current prompt/send path with send-time provider/model/agent/variant payload |
| `effect.abort` | call server/runtime abort path for the actor key |
| `effect.retry` | invoke retry/resume path |
| `effect.loadOlder` | load older history through current APIs |
| `effect.scheduleRetryCooldown` | set runtime timer and later send cooldown/retry event |
| `effect.cancelRetryCooldown` | clear runtime timer/resource |
| `effect.publishSnapshot` | publish `SessionSnapshotV1` through the active runtime transport |
| `effect.reportFatalInvariant` | emit high-severity diagnostic |

Resource rules:

- AbortControllers, timers, request handles, and connection objects live in bridges/runtimes.
- Effect execution failures return domain events such as `ABORT_FAILED`, `RETRY_FAILED`, or `LOAD_OLDER_FAILED`.
- Effects are typed and fixture-tested through bridge tests.

## Server Bridge

### Location

`packages/web/server/lib/session-state/`

### Responsibilities

- Create and manage server-side session actors from `@openchamber/session-state`.
- Subscribe to Phase 1 EventBus and OpenCode runtime events.
- Normalize server runtime/OpenCode inputs into `SessionDomainEvent`.
- Execute `SessionMachineEffect` values through existing server APIs/runtimes.
- Publish canonical `openchamber:session-snapshot` events.
- Provide compatibility APIs required by existing server callers.
- Keep non-serializable resources outside machine context.
- Stop all actors during shutdown before runtime disposal.

### SessionRuntime Integration

`SessionRuntime` must not remain an independent session-domain authority.

After the server bridge lands:

- `SessionRuntime` becomes runtime glue and a compatibility API over machine snapshots.
- Compatibility methods such as `getSessionActivitySnapshot()`, `getSessionStateSnapshot()`, and `getSessionAttentionSnapshot()` read from machine snapshots or machine selectors.
- Existing lifecycle/activity/retry cooldown maps are removed, replaced, or made non-authoritative caches that fail parity if they diverge.
- Cooldown/retry timers either move into machine-scheduled effects or are bridge resources driven by machine effects.
- Synthetic server events derive from machine snapshots only.

### Server Actor Lifecycle

- Spawn actor on prompt/session API request, stream start, loaded session snapshot, or canonical snapshot restoration.
- Keep actor alive while streaming, retrying, aborting, holding unresolved permission/question state, or referenced by an active server operation.
- Retention policy may evict inactive non-streaming actors, but eviction must not be used to hide invariant violations.
- On process shutdown, stop all actors before runtime disposal.

### Canonical Transport Event

Replace old global synthetic session events with:

```text
openchamber:session-snapshot
```

Payload: `SessionSnapshotV1`.

Rules:

- Stop emitting global `openchamber:session-status` and `openchamber:session-activity` in the same migration slice that introduces canonical snapshots.
- Update consumers directly to consume `openchamber:session-snapshot`.
- Do not broadcast both old and new global protocols.
- If a named hard-to-migrate consumer forces compatibility, create a local adapter that consumes canonical snapshots and maps to the old local shape. That adapter must not re-emit old global events, must be fail-fast, must be named in the allowlist, and must have a removal phase.
- Snapshot events must integrate with the existing replay/event ID system via `sourceEventId` and transport event IDs.

## Client Bridge

### Location

`packages/ui/src/components/chat/state/bridge/`

### Responsibilities

- Create and manage client-side actors from `@openchamber/session-state`.
- Subscribe to the existing sync/SSE pipeline during migration.
- Consume canonical `openchamber:session-snapshot` events once available.
- Normalize client sync state/events into `SessionDomainEvent` values or `SessionSnapshotV1` restoration snapshots.
- Restore actors from valid `SessionSnapshotV1` values on spawn using `restoreSessionMachineSnapshot(machine, snapshot)` and `createActor(machine, { snapshot })`.
- Provide `useSessionActor` and narrow snapshot selectors to chat state adapters.
- Keep React, DOM, composer, viewport, and timeline presentation state outside shared machine context.

### `useChatSessionData` Migration

Phase 3 must explicitly address `useChatSessionData` because it is the current aggregation hook used by `SessionMount`.

Allowed outcomes:

- Replace its internals with machine-backed selectors while preserving its return shape for callers.
- Split its responsibilities so Phase 2 adapters subscribe directly to machine selectors and `SessionMount` no longer depends on `useChatSessionData` for migrated domains.

Not allowed:

- Leaving `useChatSessionData` as the source for fields that a migration phase declares machine-owned and migrated.
- Migrating `useChatMessages` or `useChatActivity` in name only while their inputs still come from legacy sync-store aggregation.

### Client Adapter Migration

Phase 2 adapter hook names remain stable:

- `useChatSessionState` reads lifecycle/identity selectors.
- `useChatActivity` reads activity/lifecycle/retry selectors.
- `useChatInterruptions` reads interruption selectors.
- `useChatMessages` reads normalized message/part selectors and retry/error selectors.
- `useChatTimelineState` combines machine history selectors with UI-owned timeline state.
- `useChatComposerState`, `useChatComposerActions`, and `useChatSelection` intentionally remain store-backed because composer and selection are UI concerns.

Once an adapter field migrates, it must not read that field from legacy stores.

## Legacy Compatibility And Allowlists

During Phase 3, old stores remain for non-chat consumers, but they are compatibility surfaces.

Rules:

- Migrated chat adapter fields read only from machine actors/selectors.
- Old stores may still receive sync writes for unmigrated consumers.
- Machine does not write back to old stores as a normal data flow.
- Compatibility APIs may derive old shapes from machine snapshots.
- Deprecated hooks/fields get `@deprecated` JSDoc and dev-only callsite warnings, but parity mismatches for migrated fields are fatal in dev/test/CI.
- Every temporary compatibility gap needs an allowlist entry with owner, reason, affected field/domain, removal phase, and expiry.
- Phase 3 cannot complete with open allowlist entries for migrated domains.

## Performance Constraints

Streaming is the hot path. `MESSAGE_PART_DELTA` can arrive frequently enough to expose broad render fanout and identity churn.

Rules:

- Use narrow `@xstate/react` selectors in adapters.
- Never select the entire actor snapshot in render components.
- Preserve message and part object identity for unchanged records.
- Part-only updates must not change message identities.
- Avoid cloning `messageOrder` or `partsByMessageId[messageId]` unless membership/order changes.
- Keep machine actions O(changed part) where possible.
- Coalesce transport events only in bridges when the coalescing preserves domain semantics and event ordering.
- Verify streaming under continuous output, not only static snapshots.

Selector examples:

```ts
const isStreaming = useSelector(actor, selectIsStreaming);
const streamingPartId = useSelector(actor, selectStreamingPartId);
const messageOrder = useSelector(actor, selectMessageOrder);
const part = useSelector(actor, (snapshot) => selectPartById(snapshot, partId));
```

Do not do this in adapter consumers:

```ts
const snapshot = useSelector(actor, (snapshot) => snapshot);
```

## Target File Structure

```text
packages/session-state/
  package.json
  tsconfig.json
  src/
    index.ts
    machine/
      sessionMachine.ts
      context.ts
      events.ts
      effects.ts
      snapshots.ts
      selectors.ts
      invariants.ts
      regions/
        lifecycle.ts
        activity.ts
        interruptions.ts
        history.ts
        retry.ts
        error.ts
    fixtures/
      fixtureRunner.ts
      scenarios.test.ts

packages/web/server/lib/session-state/
  server-session-actor-registry.js
  server-session-machine-bridge.js
  server-session-event-normalizer.js
  server-session-effect-executor.js
  server-session-snapshot-publisher.js

packages/ui/src/components/chat/state/
  bridge/
    clientSessionActorRegistry.ts
    clientSessionMachineBridge.ts
    clientSessionEventNormalizer.ts
    clientSessionRestoration.ts
  machine/
    useSessionActor.ts
    useSessionSnapshot.ts
    selectors.ts
  useChatSessionState.ts
  useChatActivity.ts
  useChatInterruptions.ts
  useChatMessages.ts
  useChatTimelineState.ts
```

## Implementation Phases

### Pre-Work: Reconcile Branches And Dependencies

- Rebase Phase 2 onto Phase 1b.
- Re-apply server import fix if needed.
- Create `@openchamber/session-state` package.
- Add `xstate` to shared package and `@xstate/react` to UI package.
- Verify baseline.

### Phase 3.1: Shared Canonical Machine

- Define typed context, events, effects, snapshots, selectors, and invariants.
- Implement the full XState machine with all regions.
- Implement normalized message/part state inside machine actions.
- Implement snapshot restoration and snapshot validation.
- Implement fail-fast invariant handling.
- Add fixture runner and machine scenario tests.
- No server/client bridge authority yet, but the machine scope is complete.

Exit criteria:

- Fixture suite passes against the real machine.
- Invalid events/snapshot restoration/snapshots fail in tests.
- Snapshot serialization rejects non-serializable values.
- Normalized message identity tests prove part-only updates preserve message identity.

### Phase 3.2: Client Bridge And Non-Hot Adapter Reads

- Implement client actor registry.
- Restore actors from current sync state or canonical snapshots when available.
- Normalize client sync/session events into machine events.
- Introduce `useSessionActor` and narrow selector helpers.
- Migrate identity/lifecycle/activity/interruption fields first.
- Explicitly refactor or replace `useChatSessionData` for migrated fields.

Exit criteria:

- Migrated adapter fields have no legacy read path.
- Parity mismatches for migrated fields fail in dev/test.
- No fallback to legacy fields exists for migrated adapter outputs.

### Phase 3.3: Hot-Path Message/Part Migration

- Migrate `useChatMessages` to normalized machine selectors.
- Keep render-ready array derivation outside canonical snapshots.
- Keep `useChatTimelineState` split between machine-owned history domain and UI-owned timeline presentation.
- Remove `useStreamingStore` authority for migrated chat fields or make it a compatibility consumer of machine snapshots.

Exit criteria:

- Continuous 30+ second streaming profile does not introduce broad rerender regressions.
- Part-only deltas do not change message object identity.
- Chat behavior works for stream start, deltas, complete, abort, retry, permission, question, load older, and session switch.

### Phase 3.4: Server Bridge And SessionRuntime Delegation

- Implement server actor registry.
- Normalize server/OpenCode/EventBus inputs to machine events.
- Execute machine effects through existing server/runtime APIs.
- Convert `SessionRuntime` to compatibility glue over machine snapshots/selectors.
- Move or replace lifecycle/activity/retry cooldown authority with machine-driven state/effects.
- Stop independent `SessionRuntime` lifecycle/activity maps from being authoritative.

Exit criteria:

- `SessionRuntime` compatibility snapshots derive from machine snapshots.
- Server lifecycle/activity parity is fatal for migrated domains.
- Shutdown stops all session actors before runtime disposal.
- Server tests cover actor lifecycle, effect execution, fatal invariant handling, and compatibility APIs.

### Phase 3.5: Canonical Snapshot Transport

- Introduce `openchamber:session-snapshot` with `SessionSnapshotV1` payload.
- Stop global emission of `openchamber:session-status` and `openchamber:session-activity` in the same migration slice.
- Update consumers to read canonical snapshots directly.
- Add local compatibility adapters only for named, allowlisted hard-to-migrate consumers.

Exit criteria:

- No global dual protocol exists.
- Snapshot transport integrates with replay/event ID behavior.
- All canonical snapshot consumers validate schema and version.

### Phase 3.6: Deprecation, Allowlist Closure, And Final Verification

- Add `@deprecated` JSDoc to migrated legacy store hooks/fields.
- Add dev-only callsite warnings for deprecated hooks.
- Close or explicitly defer allowlist entries; no open entries for migrated domains.
- Document intentionally store-backed composer/selection/timeline presentation state.
- Run final verification.

Exit criteria:

- Phase 3 migrated domains have machine as their only authority.
- No production deprecation noise.
- No warn-only parity checks remain for migrated domains.

## Verification Strategy

### Automated

- `bun run type-check`
- `bun run lint`
- `bun test packages/session-state/`
- `bun test packages/ui/src/components/chat/`
- Relevant server runtime/session-state tests under `packages/web/server/`

### Fixture Scenarios

- Restore from valid snapshot.
- Reject malformed snapshot restoration input.
- Normal stream: submit -> stream start -> message/part updates -> complete.
- Duplicate valid idempotent event.
- Malformed duplicate or invalid delta fails.
- Reconnect with existing messages.
- Permission request during streaming.
- Question request during streaming.
- Permission and question active together.
- Abort during streaming.
- Retry after recoverable error.
- Retry cooldown scheduled and cleared through effects.
- Max retries exceeded.
- Load older history and merge/prepend messages.
- Load older failure.
- Session switch while streaming.
- Not-found session.
- Fatal invariant containment.
- Server actor shutdown while idle.
- Client actor eviction and restoration.

### Manual

- Start a session and stream a response.
- Switch sessions during streaming.
- Abort active response.
- Retry after error.
- Resolve permission and question requests.
- Load older history.
- Verify fatal-session recovery surface by injecting a test invariant failure in dev.
- Verify desktop and mobile layouts, including soft keyboard behavior.
- Profile React re-renders during 30+ seconds of continuous streaming.
- Verify web, Electron, and VS Code shared UI behavior where practical.

## Dependencies

| Dependency | Package | Purpose |
|------------|---------|---------|
| `xstate` | `@openchamber/session-state` | Shared statechart, actors, transition model |
| `@xstate/react` | `@openchamber/ui` | React actor selectors and integration |

No other new dependencies.

## Risk Controls

- Full machine scope is implemented before runtime authority migration.
- Shared package has no runtime imports.
- Bridges translate and execute effects; they do not define state semantics.
- Machine snapshots are versioned and validated.
- Server and client use the same fixture suite for domain behavior.
- Migrated fields have no legacy fallback.
- Compatibility gaps require explicit expiring allowlist entries.
- `SessionRuntime` becomes compatibility glue, not a second state machine.
- Old global session synthetic events are replaced, not duplicated.
- Streaming performance is verified under real continuous output.

## Success Criteria

- `@openchamber/session-state` exports a typed XState v5 session machine with complete session-domain ownership.
- `SessionSnapshotV1` is the canonical serializable snapshot for one session actor.
- Server and client bridges both use the same shared machine, event types, effects, invariants, and snapshots.
- `SessionRuntime` no longer independently owns lifecycle/activity/retry state for migrated domains.
- Global session transport uses `openchamber:session-snapshot`, not `openchamber:session-status` or `openchamber:session-activity`.
- Phase 2 chat components remain stable or any boundary change is explicitly named in the migration phase.
- `useChatSessionData` is no longer an untracked source of truth for migrated fields.
- `useChatSessionState`, `useChatActivity`, `useChatInterruptions`, `useChatMessages`, and `useChatTimelineState` read migrated fields from machine actors/selectors.
- Composer, selection, and timeline presentation state remain store/controller-backed by design.
- Fixture tests cover streaming, snapshot restoration, reconnect, abort, retry, permission, question, history, not-found, and fatal containment flows.
- Type-check, lint, shared package tests, chat tests, and relevant server tests pass.
- No production deprecation noise and no legacy fallback for migrated fields.

## Phase 4 And Beyond

Phase 4 begins after Phase 3 proves the shared machine model and closes migrated-domain allowlists. Phase 4 migrates remaining non-chat consumers, removes old store fields once unused, and deletes obsolete store/runtime compatibility code last.
