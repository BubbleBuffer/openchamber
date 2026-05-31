# Phase 3.1 Shared Canonical Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the runtime-agnostic `@openchamber/session-state` XState v5 machine, canonical snapshot schema, selectors, invariants, snapshot restoration, effects, and fixture suite.

**Architecture:** One actor represents one `{ directory, sessionId }` pair. The machine owns session-domain state; bridges execute typed effects and provide serializable event metadata. Snapshots are versioned, validated, serializable, and derived from actor state.

**Tech Stack:** TypeScript, XState v5, Bun test.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Machine scope, events, effects, snapshots, snapshot restoration, invariants, selectors, fixture scenarios, and identity-preservation tests cover the shared package requirements.

## Files

- Modify: `packages/session-state/src/index.ts`
- Create: `packages/session-state/src/machine/actorKey.ts`
- Create: `packages/session-state/src/machine/context.ts`
- Create: `packages/session-state/src/machine/events.ts`
- Create: `packages/session-state/src/machine/effects.ts`
- Create: `packages/session-state/src/machine/snapshots.ts`
- Create: `packages/session-state/src/machine/invariants.ts`
- Create: `packages/session-state/src/machine/selectors.ts`
- Create: `packages/session-state/src/machine/sessionMachine.ts`
- Create: `packages/session-state/src/fixtures/fixtureRunner.ts`
- Create: `packages/session-state/src/fixtures/scenarios.test.ts`

## Task 1: Define Actor Identity And Core Types

- [ ] **Step 1: Write failing actor-key tests inside `packages/session-state/src/fixtures/scenarios.test.ts`**

```ts
import { describe, expect, test } from 'bun:test'
import { createSessionActorKey, parseSessionActorKey } from '../machine/actorKey'

describe('session actor keys', () => {
  test('round trips directory and session ID', () => {
    const key = createSessionActorKey('/repo/app', 'ses_123')
    expect(key).toBe('/repo/app::ses_123')
    expect(parseSessionActorKey(key)).toEqual({ directory: '/repo/app', sessionId: 'ses_123' })
  })

  test('rejects empty identity fields', () => {
    expect(() => createSessionActorKey('', 'ses_123')).toThrow('directory is required')
    expect(() => createSessionActorKey('/repo/app', '')).toThrow('sessionId is required')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run: `bun test packages/session-state/src/fixtures/scenarios.test.ts`

Expected: fails because `../machine/actorKey` does not exist.

- [ ] **Step 3: Implement `actorKey.ts`**

```ts
export type SessionActorKey = `${string}::${string}`

export interface SessionActorIdentity {
  directory: string
  sessionId: string
}

export function createSessionActorKey(directory: string, sessionId: string): SessionActorKey {
  if (!directory) throw new Error('directory is required')
  if (!sessionId) throw new Error('sessionId is required')
  return `${directory}::${sessionId}`
}

export function parseSessionActorKey(key: SessionActorKey): SessionActorIdentity {
  const separator = key.lastIndexOf('::')
  if (separator <= 0 || separator === key.length - 2) throw new Error('invalid session actor key')
  return { directory: key.slice(0, separator), sessionId: key.slice(separator + 2) }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/session-state/src/fixtures/scenarios.test.ts`

Expected: actor-key tests pass.

## Task 2: Define Serializable Context, Events, And Effects

- [ ] **Step 1: Add domain type definitions in `context.ts`**

Define normalized records and context with these exported interfaces: `SessionMessageRecord`, `SessionPartRecord`, `SessionPermissionRecord`, `SessionQuestionRecord`, `SessionHistoryState`, `SessionRetryState`, `SessionErrorState`, `SessionMachineContext`.

The context must include `directory`, `sessionId`, `projectId`, `parentSessionId`, `exists`, `loaded`, `messageOrder`, `messagesById`, `partsByMessageId`, `partsById`, `streamingMessageId`, `streamingPartId`, `permissionsById`, `questionsById`, `retryMessage`, `retryCount`, `retryCooldownUntil`, `errorType`, `fatalError`, `isLoadingOlder`, `hasMoreAbove`, `oldestLoadedMessageId`, `newestLoadedMessageId`, `historyLoadError`, `revision`, `updatedAt`, and `sourceEventId`.

- [ ] **Step 2: Add `createInitialSessionContext`**

`createInitialSessionContext({ directory, sessionId, timestamp })` must return an empty loaded-false context with `revision: 0`, `exists: true`, empty normalized maps, `updatedAt: timestamp`, and `sourceEventId: null`.

- [ ] **Step 3: Add `events.ts` union**

Create `SessionDomainEvent` with these event families: `SESSION_OPENED`, `SESSION_LOADED`, `SESSION_NOT_FOUND`, `SESSION_LOAD_FAILED`, `PROMPT_SUBMITTED`, `STREAM_STARTED`, `STREAM_COMPLETED`, `STREAM_FAILED`, `MESSAGE_ADDED`, `MESSAGE_UPDATED`, `MESSAGE_PART_STARTED`, `MESSAGE_PART_DELTA`, `MESSAGE_PART_UPDATED`, `MESSAGE_PART_FINISHED`, `MESSAGE_PART_REMOVED`, `ABORT_REQUESTED`, `ABORT_CONFIRMED`, `ABORT_FAILED`, `PERMISSION_REQUESTED`, `PERMISSION_RESOLVED`, `QUESTION_REQUESTED`, `QUESTION_ANSWERED`, `QUESTION_REJECTED`, `LOAD_OLDER_REQUESTED`, `LOAD_OLDER_COMPLETED`, `LOAD_OLDER_FAILED`, `RETRY_REQUESTED`, `RETRY_STARTED`, `RETRY_FAILED`, `ERROR_DISMISSED`, `FATAL_INVARIANT_FAILED`.

Every domain event must carry `directory`, `sessionId`, `timestamp`, and optional `sourceEventId`.

- [ ] **Step 4: Add `effects.ts` union**

Create `SessionMachineEffect` with `effect.sendPrompt`, `effect.abort`, `effect.retry`, `effect.loadOlder`, `effect.scheduleRetryCooldown`, `effect.cancelRetryCooldown`, `effect.publishSnapshot`, and `effect.reportFatalInvariant` variants. Effect payloads must be serializable.

## Task 3: Implement Snapshots, Validation, And Restoration

- [ ] **Step 1: Write snapshot validation tests**

Add tests proving valid snapshots pass, invalid version fails, mismatched normalized references fail, and non-serializable values fail.

- [ ] **Step 2: Implement `SessionSnapshotV1` in `snapshots.ts`**

Export `SESSION_SNAPSHOT_VERSION = 1`, `SessionSnapshotV1`, `createSessionSnapshot(context, regions, hydratedAt)`, `validateSessionSnapshotV1(snapshot)`, and `assertSerializableSnapshot(snapshot)`.

- [ ] **Step 3: Implement snapshot restoration helpers**

Export `createContextFromSnapshot(snapshot)` that validates snapshot version, identity, explicit region values, normalized message references, and serializability before creating context. Export `restoreSessionMachineSnapshot(machine, snapshot)` that converts a validated `SessionSnapshotV1` into an XState actor snapshot by restoring both context and explicit parallel region values. Consumers must pass the returned snapshot to `createActor(machine, { snapshot })`; restoration is not modeled as a public domain event.

- [ ] **Step 4: Run snapshot tests**

Run: `bun test packages/session-state/src/fixtures/scenarios.test.ts`

Expected: snapshot tests pass.

## Task 4: Implement Machine Regions And Selectors

- [ ] **Step 1: Create `sessionMachine.ts` with a parallel XState machine**

Export `createSessionMachine(input)` using `setup({ types })` from XState v5. Regions: `lifecycle`, `activity`, `interruptions`, `history`, `retry`, `error`.

Initial states: `lifecycle.opening`, `activity.idle`, `interruptions.clear`, `history.idle`, `retry.idle`, `error.clear`.

- [ ] **Step 2: Add pure actions for accepted domain events**

Implement actions that update only changed context branches. `MESSAGE_PART_DELTA` must update one `partsById[partId]` record and must not clone `messageOrder`, `messagesById`, or unrelated `partsByMessageId` arrays.

- [ ] **Step 3: Add selectors in `selectors.ts`**

Export selectors: `selectSessionSnapshot`, `selectIsStreaming`, `selectIsWorking`, `selectNeedsAttention`, `selectHasBlockingInterruption`, `selectCanLoadOlder`, `selectMessageOrder`, `selectMessageById`, `selectPartById`, `selectStreamingMessageId`, `selectRetrySnapshot`, `selectHistorySnapshot`.

- [ ] **Step 4: Add invariant handling in `invariants.ts`**

Export `assertSessionEventIdentityMatchesContext`, `assertNormalizedReferences`, and `createFatalInvariantFailure`. Impossible transitions and malformed events must route to `FATAL_INVARIANT_FAILED` in production-safe execution and throw in test/dev helpers.

## Task 5: Fixture Runner And Scenario Coverage

- [ ] **Step 1: Implement `fixtureRunner.ts`**

Create a runner that starts the real XState machine actor, sends typed events, records snapshots and emitted effect intents, and exposes final snapshot assertions.

- [ ] **Step 2: Add required scenarios**

Add fixture tests for valid snapshot restoration, malformed snapshot rejection, normal stream, duplicate idempotent event, invalid delta failure, reconnect with existing messages, permission during streaming, question during streaming, permission and question together, abort during streaming, retry after recoverable error, retry cooldown effect scheduling, max retries exceeded, load older merge/prepend, load older failure, not-found session, fatal invariant containment, and actor identity mismatch.

- [ ] **Step 3: Add identity preservation tests**

Add a test that records references for `messageOrder`, `messagesById`, an unchanged message record, `partsByMessageId[messageId]`, and an unrelated part record before a `MESSAGE_PART_DELTA`, then asserts those references are unchanged after the delta.

- [ ] **Step 4: Run package verification**

Run: `bun run --cwd packages/session-state type-check`

Expected: exits 0.

Run: `bun test packages/session-state/`

Expected: exits 0.

## Task 6: Public Exports And Commit

- [ ] **Step 1: Export all public APIs from `src/index.ts`**

Export machine factory, context factory, domain event types, effect types, actor-key helpers, snapshot types/validation, selectors, invariants, and fixture runner.

- [ ] **Step 2: Run root verification**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 3: Commit**

Run: `git add packages/session-state && git commit -m "feat: add shared session state machine"`

Expected: commit succeeds.
