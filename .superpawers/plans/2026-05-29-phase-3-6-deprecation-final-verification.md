# Phase 3.6 Deprecation And Final Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 3 by marking migrated legacy surfaces as deprecated, closing allowlists for migrated domains, documenting intentionally store-backed UI state, and running final automated and manual verification.

**Architecture:** This plan does not migrate new domains. It verifies that migrated domains have the shared machine as their only authority and that compatibility surfaces are explicit, temporary, and quiet in production.

**Tech Stack:** TypeScript, Bun tests, ESLint, manual web/Electron/VS Code smoke checks.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Deprecation, allowlist closure, documentation boundaries, automated verification, and manual web/mobile/Electron/VS Code checks are covered.

## Files

- Modify: `packages/ui/src/sync/DOCUMENTATION.md`
- Modify: `packages/ui/src/sync/streaming.ts`
- Modify: `packages/ui/src/components/chat/state/useChatComposerState.ts`
- Modify: `packages/ui/src/components/chat/state/useChatSelection.ts`
- Modify: `packages/ui/src/components/chat/state/useChatTimelineState.ts`
- Modify: `packages/web/server/lib/session-state/DOCUMENTATION.md`
- Modify: `packages/web/server/lib/opencode/session/session-runtime.js`
- Create or modify: Phase 3 allowlist file chosen by implementation in earlier plans

## Task 1: Deprecate Migrated Legacy Surfaces

- [ ] **Step 1: Add `@deprecated` JSDoc to migrated legacy hooks/fields**

Mark legacy fields that no longer own migrated chat domains: streaming message IDs, session lifecycle/status fields, retry overlay fields, blocking interruption fields, and history domain fields.

- [ ] **Step 2: Add dev-only callsite warnings**

Warnings must be development/test only and must not run in production. They should identify the deprecated hook/field and the machine selector replacement.

- [ ] **Step 3: Add tests for warning behavior**

Test that warnings fire in development/test and do not fire under a production environment flag.

## Task 2: Close Migrated-Domain Allowlists

- [ ] **Step 1: Audit allowlist entries**

List every temporary compatibility gap created in Plans 2 through 5 and classify it as closed, deferred to Phase 4, or invalid.

- [ ] **Step 2: Remove closed entries**

For migrated domains, remove allowlist entries after consumers read machine selectors or canonical snapshots.

- [ ] **Step 3: Add fail-fast allowlist test**

Add a test that fails if any open allowlist entry references a Phase 3 migrated domain.

## Task 3: Document Store-Backed UI State Boundaries

- [ ] **Step 1: Update UI sync documentation**

Document that composer draft text, attached files, local queue state, provider/model/agent/variant selection, selection state, viewport scroll, reveal state, mobile drawer/layout state, and theme/layout preferences remain UI/store-owned.

- [ ] **Step 2: Update server session-state documentation**

Document that `SessionRuntime` is compatibility glue and not an independent lifecycle/activity/retry authority.

- [ ] **Step 3: Add comments only where boundary is non-obvious**

Add succinct comments near adapter code where machine history domain is intentionally combined with UI-owned timeline presentation state.

## Task 4: Automated Final Verification

- [ ] **Step 1: Run shared package tests**

Run: `bun test packages/session-state/`

Expected: exits 0.

- [ ] **Step 2: Run chat tests**

Run: `bun test packages/ui/src/components/chat/`

Expected: exits 0.

- [ ] **Step 3: Run server tests relevant to session state and transport**

Run: `bun run --cwd packages/web test -- packages/web/server/lib/session-state/ packages/web/server/lib/opencode/session/session-runtime.test.js packages/web/server/lib/event-stream/runtime.test.js`

Expected: exits 0 or the package runner equivalent exits 0.

- [ ] **Step 4: Run root checks**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0.

- [ ] **Step 5: Run build smoke**

Run: `bun run build`

Expected: exits 0.

## Task 5: Manual Verification Matrix

- [ ] **Step 1: Web chat session lifecycle**

Run the web app and verify: start a session, stream response, switch sessions during streaming, abort, retry after an induced error, resolve permission request, resolve question request, load older history, revisit session.

- [ ] **Step 2: Mobile/PWA layout behavior**

Verify chat input, soft keyboard, mobile drawer, abort/retry surfaces, permission/question surfaces, and fatal recovery surface on a mobile viewport.

- [ ] **Step 3: Desktop/Electron smoke**

Run: `bun run electron:dev`

Expected: Electron starts, chat connects, streaming session snapshots update UI, abort/retry surfaces work.

- [ ] **Step 4: VS Code smoke where practical**

Run the VS Code extension build or local extension host workflow used by the project and verify shared UI receives canonical session snapshots.

- [ ] **Step 5: Streaming profile**

Profile a 30+ second continuous stream and confirm no broad re-render regression in shell, chat input chrome, session list, message list rows unrelated to the active part, or mobile controls.

## Task 6: Commit

- [ ] **Step 1: Commit closure changes**

Run: `git add packages/ui/src/sync packages/ui/src/components/chat/state packages/web/server/lib/session-state packages/web/server/lib/opencode/session && git commit -m "chore: close phase 3 session state migration"`

Expected: commit succeeds.
