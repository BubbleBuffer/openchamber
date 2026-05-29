# Phase 3.3 Hot-Path Message Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate chat messages, message parts, retry/error display, and history domain fields to normalized machine selectors without broad render fanout or identity churn.

**Architecture:** Canonical normalized message state lives in `@openchamber/session-state`. UI derives render-ready arrays outside snapshots and keeps timeline presentation state in existing controllers/stores.

**Tech Stack:** React, `@xstate/react`, TypeScript, Bun tests, existing chat rendering components.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Message/part migration, timeline domain split, identity preservation, render fanout guards, and continuous streaming verification are explicitly planned.

## Files

- Modify: `packages/ui/src/components/chat/state/useChatMessages.ts`
- Modify: `packages/ui/src/components/chat/state/useChatTimelineState.ts`
- Modify: `packages/ui/src/components/chat/hooks/useChatSessionData.ts`
- Modify: `packages/ui/src/sync/streaming.ts`
- Create: `packages/ui/src/components/chat/state/machine/messageSelectors.ts`
- Create: `packages/ui/src/components/chat/state/machine/renderedMessages.ts`
- Test: `packages/ui/src/components/chat/state/chatMessagesMachine.test.tsx`
- Test: `packages/ui/src/components/chat/state/chatTimelineMachine.test.tsx`

## Task 1: Render-Ready Message Derivation

- [ ] **Step 1: Add selector tests for identity preservation**

Test that converting normalized machine records to chat render entries preserves unchanged message entry references after a part-only delta and changes only the active part entry.

- [ ] **Step 2: Implement `renderedMessages.ts`**

Create a memoized derivation helper that accepts `messageOrder`, `messagesById`, `partsByMessageId`, `partsById`, and previous render cache. Return render entries compatible with existing `ChatMessageEntry` consumers while preserving identity for unchanged records.

- [ ] **Step 3: Implement `messageSelectors.ts`**

Expose narrow hooks/selectors for `messageOrder`, a single message record, part IDs for a message, a single part record, `streamingMessageId`, retry overlay, and error display. Do not add a selector that returns the entire machine snapshot.

## Task 2: Migrate `useChatMessages`

- [ ] **Step 1: Refactor `useChatMessages.ts`**

Keep the existing `ChatMessagesState` shape. Source `messages`, `renderedMessages`, `streamingMessageId`, `retryOverlay`, and error fields from machine selectors and render derivation.

- [ ] **Step 2: Remove `useStreamingStore` authority for migrated outputs**

After migration, `useStreamingStore` may remain for unmigrated compatibility consumers, but `useChatMessages` and `useChatSessionData` must not use it for migrated message/streaming outputs.

- [ ] **Step 3: Add no-fallback tests**

Set legacy streaming store state to conflicting values and assert machine-backed adapter output wins or parity throws in development/test.

## Task 3: Migrate History Domain In Timeline Hook

- [ ] **Step 1: Split timeline inputs**

Keep `turnStart`, `pendingRevealWork`, viewport state, pin-to-bottom state, and reveal animation state store/controller-backed.

- [ ] **Step 2: Source history domain from machine selectors**

Migrate `isLoadingOlder`, `hasMoreAbove`, `oldestLoadedMessageId`, `newestLoadedMessageId`, and `historyLoadError` to machine selectors.

- [ ] **Step 3: Add load-older tests**

Test `LOAD_OLDER_REQUESTED`, `LOAD_OLDER_COMPLETED`, and `LOAD_OLDER_FAILED` through the client actor and assert `useChatTimelineState` exposes correct history domain fields while presentation state remains unchanged.

## Task 4: Streaming Performance Verification

- [ ] **Step 1: Add a continuous-delta test**

Drive one actor with at least 1,800 `MESSAGE_PART_DELTA` events to simulate 30 seconds at 60 deltas/sec. Assert only the active part record changes and message records remain referentially stable.

- [ ] **Step 2: Add render fanout guard tests**

Use test components subscribed to `selectMessageOrder`, `selectMessageById`, `selectPartById`, and unrelated activity selectors. Assert unrelated subscribers do not re-render for part-only deltas.

- [ ] **Step 3: Manual profile**

Run the app, stream a 30+ second response, and inspect React profiler for broad re-render regressions in chat list, input chrome, mobile controls, and session shell.

## Task 5: Verification And Commit

- [ ] **Step 1: Run focused tests**

Run: `bun test packages/session-state/ packages/ui/src/components/chat/state/ packages/ui/src/sync/streaming.test.ts`

Expected: exits 0.

- [ ] **Step 2: Run chat tests**

Run: `bun test packages/ui/src/components/chat/`

Expected: exits 0.

- [ ] **Step 3: Run root checks**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 4: Commit**

Run: `git add packages/ui/src/components/chat/state packages/ui/src/components/chat/hooks packages/ui/src/sync/streaming.ts && git commit -m "feat: migrate chat messages to session machine"`

Expected: commit succeeds.
