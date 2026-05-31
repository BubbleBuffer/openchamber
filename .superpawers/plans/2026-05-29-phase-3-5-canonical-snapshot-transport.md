# Phase 3.5 Canonical Snapshot Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace old global synthetic session transport events with canonical `openchamber:session-snapshot` events carrying validated `SessionSnapshotV1` payloads.

**Architecture:** The server bridge publishes one canonical snapshot event. Existing clients consume snapshots directly or through named local compatibility adapters. No global dual protocol is allowed.

**Tech Stack:** Server event-stream runtime, global hub/replay buffer, UI sync event pipeline, VS Code/Electron shared UI consumption.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Canonical snapshot transport replacement, replay semantics, client consumption, schema validation, and old protocol removal are specific and complete.

## Files

- Modify: `packages/web/server/lib/event-stream/runtime.js`
- Modify: `packages/web/server/lib/event-stream/runtime.test.js`
- Modify: `packages/web/server/index.js`
- Modify: `packages/web/server/lib/notifications/routes.js`
- Modify: `packages/ui/src/sync/event-pipeline.ts`
- Modify: `packages/ui/src/sync/sync-context.tsx`
- Modify: `packages/ui/src/components/chat/state/bridge/clientSessionEventNormalizer.ts`
- Modify: `packages/ui/src/components/chat/state/bridge/clientSessionMachineBridge.tsx`
- Test: `packages/ui/src/sync/event-pipeline.test.ts`
- Test: `packages/ui/src/sync/reconnect-recovery.test.ts`

## Task 1: Server Transport Event Replacement

- [ ] **Step 1: Update event-stream tests first**

Modify tests that expect `openchamber:session-status` and `openchamber:session-activity` so they expect a single `openchamber:session-snapshot` event with a valid `SessionSnapshotV1` payload.

- [ ] **Step 2: Remove old global synthetic emissions**

Remove old global emission paths for `openchamber:session-status` and `openchamber:session-activity` from `event-stream/runtime.js` and the duplicate forwarding helper in `packages/web/server/index.js`.

- [ ] **Step 3: Publish canonical snapshots**

Wire `server-session-snapshot-publisher.js` into the event-stream/global hub path so active clients and replay consumers receive `openchamber:session-snapshot`.

- [ ] **Step 4: Validate before publish**

Every event payload must pass `validateSessionSnapshotV1` before it is written to transport or stored in replay.

## Task 2: Initial Snapshot And Replay Semantics

- [ ] **Step 1: Add initial snapshot coverage**

Test that a newly connected client receives a complete canonical snapshot for active actors before incremental snapshot updates.

- [ ] **Step 2: Preserve event IDs**

Ensure `sourceEventId` and transport replay event IDs are preserved on the canonical snapshot payload and transport envelope.

- [ ] **Step 3: Verify reconnect behavior**

Update reconnect tests so replay/snapshot restoration restores actors from `SessionSnapshotV1` rather than old status/activity events.

## Task 3: Client Transport Consumption

- [ ] **Step 1: Add event-pipeline handling**

Teach `packages/ui/src/sync/event-pipeline.ts` and sync context to route `openchamber:session-snapshot` to the client session machine bridge.

- [ ] **Step 2: Validate snapshots on client**

Reject wrong-version or malformed snapshots in dev/test/CI. In production, route the affected actor to fatal containment without reading legacy fallback fields.

- [ ] **Step 3: Restore actor from snapshot**

Update client bridge so canonical snapshots use `restoreSessionMachineSnapshot(machine, snapshot)` to restore actor context and explicit region state. The bridge must accept an incoming snapshot only when its revision is newer or an idempotent duplicate, then replace/recreate the actor through the registry or apply the registry's documented restore path.

## Task 4: Compatibility Adapter Audit

- [ ] **Step 1: Search old event consumers**

Run: `rg "openchamber:session-(status|activity)" packages`

Expected after migration: no global emission or primary consumption remains. Any remaining reference must be a named local compatibility adapter with an allowlist entry.

- [ ] **Step 2: Add allowlist entries only for named blockers**

If a hard-to-migrate consumer remains, create an allowlist entry with owner, reason, affected domain, removal phase, and expiry. Do not re-emit old global events.

## Task 5: Verification And Commit

- [ ] **Step 1: Run server transport tests**

Run: `bun run --cwd packages/web test -- packages/web/server/lib/event-stream/runtime.test.js packages/web/server/lib/session-state/`

Expected: exits 0 or the package runner equivalent exits 0.

- [ ] **Step 2: Run client sync tests**

Run: `bun test packages/ui/src/sync/event-pipeline.test.ts packages/ui/src/sync/reconnect-recovery.test.ts packages/ui/src/components/chat/state/`

Expected: exits 0.

- [ ] **Step 3: Run root checks**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 4: Commit**

Run: `git add packages/web/server packages/ui/src/sync packages/ui/src/components/chat/state && git commit -m "feat: replace session transport with canonical snapshots"`

Expected: commit succeeds.
