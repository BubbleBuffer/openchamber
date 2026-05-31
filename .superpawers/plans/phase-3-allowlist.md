# Phase 3 Allowlist — Temporary Compatibility Exceptions

> This file tracks temporary compatibility exceptions created during Phase 3
> session state migration. All entries must have an owner, reason, affected
> domain, removal phase, and expiry. Entries referencing Phase 3 migrated
> domains are FAIL-fast violations in tests.

## Active Entries

### 1. VS Code Local `openchamber:session-activity`

- **File:** `packages/vscode/src/sessionActivityWatcher.ts`
- **Owner:** VS Code extension team
- **Reason:** VS Code webview communication self-generates `openchamber:session-activity`
  inside the VS Code webview bridge, NOT via the server global transport.
  This is a local-only activity signal within VS Code, not the deprecated
  server global `session-activity` transport that was removed in Phase 3.4.
- **Affected Domain:** `openchamber:session-activity` (VS Code local, not server global)
- **Phase:** Phase 4 (defer cleanup)
- **Expiry:** Phase 4 completion
- **Status:** OPEN — Deferred

### 2. Temporary UI Callback Bridge (`__sessionSnapshotCallbackBridge`)

- **File:** `packages/ui/src/components/chat/state/bridge/__sessionSnapshotCallbackBridge.ts`
- **Owner:** UI/sync layer team
- **Reason:** Phase 3.5 migration mechanism bridging the non-React event pipeline
  (`handleEvent` in `sync-context.tsx`) to the React-owned actor registry
  (`ClientSessionMachineBridge`). Uses generation counter for ownership safety.
  Must be replaced with a proper event-bus / store-based approach.
- **Affected Domain:** `openchamber:session-snapshot` callback dispatch
- **Phase:** Phase 4 (defer removal)
- **Expiry:** Phase 4 completion
- **Status:** OPEN — Deferred

## Closed Entries

_(None yet — all entries from Plans 2-5 that referenced Phase 3 migrated
domains have been removed or were invalid and never implemented.)_

## Invalid Entries

_(None — no invalid entries were found in Plans 2-5 allowlists.)_

## Audit Trail

| Date | Action | Entry | Classification |
|------|--------|-------|-----------------|
| 2026-05-31 | Initial allowlist | VS Code sessionActivityWatcher | Deferred to Phase 4 |
| 2026-05-31 | Initial allowlist | __sessionSnapshotCallbackBridge | Deferred to Phase 4 |
