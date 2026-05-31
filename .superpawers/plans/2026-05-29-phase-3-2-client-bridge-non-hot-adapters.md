# Phase 3.2 Client Bridge And Non-Hot Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client actor registry and bridge, then migrate chat identity, lifecycle, activity, retry, and interruption adapter fields to machine-backed selectors.

**Architecture:** The client bridge owns actor lifecycle, sync/canonical snapshot restoration, and React actor access. Chat adapters use narrow `@xstate/react` selectors and must not read migrated fields from legacy sync or streaming stores.

**Tech Stack:** React, `@xstate/react`, TypeScript, `@openchamber/session-state`, Zustand sync stores.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Client registry, bridge, snapshot restoration, non-hot adapter migration, dev parity failures, and no-legacy-fallback requirements are covered.

## Files

- Create: `packages/ui/src/components/chat/state/bridge/clientSessionActorRegistry.ts`
- Create: `packages/ui/src/components/chat/state/bridge/clientSessionEventNormalizer.ts`
- Create: `packages/ui/src/components/chat/state/bridge/clientSessionRestoration.ts`
- Create: `packages/ui/src/components/chat/state/bridge/clientSessionMachineBridge.tsx`
- Create: `packages/ui/src/components/chat/state/machine/useSessionActor.ts`
- Create: `packages/ui/src/components/chat/state/machine/useSessionSnapshot.ts`
- Create: `packages/ui/src/components/chat/state/machine/selectors.ts`
- Modify: `packages/ui/src/components/chat/hooks/useChatSessionData.ts`
- Modify: `packages/ui/src/components/chat/state/useChatSessionState.ts`
- Modify: `packages/ui/src/components/chat/state/useChatActivity.ts`
- Modify: `packages/ui/src/components/chat/state/useChatInterruptions.ts`
- Test: `packages/ui/src/components/chat/state/clientSessionActorRegistry.test.ts`
- Test: `packages/ui/src/components/chat/state/clientSessionAdapters.test.tsx`

## Task 1: Client Actor Registry

- [ ] **Step 1: Write registry tests**

Test that the registry creates one actor per `directory::sessionId`, rejects duplicate explicit registration, rejects events whose identity does not match the target key, returns existing actors for repeated `getOrCreate`, and stops actors on eviction.

- [ ] **Step 2: Implement `clientSessionActorRegistry.ts`**

Use `createActor(createSessionMachine(...))` from XState. Store actors in `Map<SessionActorKey, ActorRefFrom<ReturnType<typeof createSessionMachine>>>`. Keep retention policy simple: explicit `evict(key)` and `dispose()` only in this slice.

- [ ] **Step 3: Run registry tests**

Run: `bun test packages/ui/src/components/chat/state/clientSessionActorRegistry.test.ts`

Expected: exits 0.

## Task 2: Snapshot Restoration From Current Sync State

- [ ] **Step 1: Implement `clientSessionRestoration.ts`**

Create `createSessionSnapshotFromSyncState({ directory, sessionId, messages, status, permissions, questions, historyMeta, timestamp })`. The function must create a validated `SessionSnapshotV1` suitable for `restoreSessionMachineSnapshot(machine, snapshot)`. Do not create or send a restoration domain event.

- [ ] **Step 2: Implement normalizer tests**

Cover `session_status` busy/retry/idle, permission arrays, question arrays, no loaded messages, not-found session, and history metadata.

- [ ] **Step 3: Implement `clientSessionEventNormalizer.ts`**

Map current sync hook data into either an initial `SessionSnapshotV1` restoration path or incremental `SESSION_LOADED`, `STREAM_STARTED`, `STREAM_COMPLETED`, `RETRY_STARTED`, `PERMISSION_REQUESTED`, `PERMISSION_RESOLVED`, `QUESTION_REQUESTED`, and `QUESTION_ANSWERED` events. Do not derive local semantics beyond the shared domain event contract.

## Task 3: React Bridge Provider And Actor Hooks

- [ ] **Step 1: Implement `clientSessionMachineBridge.tsx`**

Create a provider component that owns one `ClientSessionActorRegistry`, exposes it through React context, restores actors from sync-state snapshots when a session mounts, and consumes canonical `openchamber:session-snapshot` events when available. Actor creation from a snapshot must use `restoreSessionMachineSnapshot(machine, snapshot)` and `createActor(machine, { snapshot: restored })`.

- [ ] **Step 2: Implement `useSessionActor.ts`**

Expose `useSessionActor({ directory, sessionId })`. The hook must return the actor for the key and must throw a clear error if used outside the bridge provider.

- [ ] **Step 3: Implement `useSessionSnapshot.ts` and selector wrappers**

Expose wrappers around `useSelector(actor, selector)` for narrow selectors only. Do not expose a hook that selects the whole actor snapshot for render components.

## Task 4: Migrate Identity, Lifecycle, Activity, Retry, And Interruptions

- [ ] **Step 1: Refactor `useChatSessionData` for migrated fields**

Preserve the existing return shape, but source `loaded`, `exists`, `streamingMessageId`, `streamingPhase`, `status`, `isWorking`, `retryOverlay`, `permissions`, and `questions` from machine selectors for sessions covered by the bridge.

- [ ] **Step 2: Remove legacy fallback for migrated fields**

If a required actor or selector is unavailable, throw in development/test instead of reading the legacy sync store. Production should render the session fatal/recovery state when the actor snapshot is fatal.

- [ ] **Step 3: Keep composer and selection store-backed**

Do not modify `useChatComposerState`, `useChatComposerActions`, or `useChatSelection` except to document that they remain UI concerns.

- [ ] **Step 4: Add dev parity assertions**

Add a development/test-only helper that compares migrated machine fields against legacy values during rollout and throws on mismatch. No warning-only parity checks.

## Task 5: Adapter Tests And Verification

- [ ] **Step 1: Add adapter tests**

Test that `useChatSessionState`, `useChatActivity`, and `useChatInterruptions` return the same public shape as before while reading from machine-backed inputs.

- [ ] **Step 2: Test no legacy reads for migrated fields**

Use failing test doubles for legacy selectors after actor restoration and assert migrated fields still resolve from the actor.

- [ ] **Step 3: Run focused tests**

Run: `bun test packages/ui/src/components/chat/state/ packages/ui/src/components/chat/hooks/useChatSessionData.test.tsx`

Expected: exits 0.

- [ ] **Step 4: Run root verification**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 5: Commit**

Run: `git add packages/ui/src/components/chat/state packages/ui/src/components/chat/hooks/useChatSessionData.ts && git commit -m "feat: migrate chat session adapters to machine selectors"`

Expected: commit succeeds.
