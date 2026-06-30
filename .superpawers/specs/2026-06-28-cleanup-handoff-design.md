# Codebase Cleanup Handoff Spec

> **For a new chat or a future session:** this spec captures the durable cleanup work that remains after the test/bench catch-up spec (`2026-06-28-test-bench-catchup-design.md`) is fully merged to `main`. It is intentionally a handoff document, not an implementation plan — each section describes what to do, why, and how to verify, but does not decompose the work into per-task checkboxes. The implementing agent should treat this as the input to a fresh `brainstorming` or `writing-plans` pass.

**Goal:** Document the highest-leverage remaining codebase cleanup work so a new session can pick it up without re-doing discovery.

**Architecture:** Each recommended cleanup is described with anchors, current behavior, expected outcome, and verification approach. The order is sequenced for momentum — smaller, focused cleanups first, broader refactors later.

**Tech Stack:** Existing — `packages/ui` (React + Zustand + Base UI), `packages/ui/src/sync/*` (event pipeline), `tests/*` (vitest + bun:test harnesses), `packages/electron`, `packages/vscode`.

---

## Pre-flight

Before starting any of the cleanups below, read:

- `AGENTS.md` — repo-wide conventions, including the hard rule that no `pgrep` / `pkill` / `killall` / process-name matching is permitted in test code.
- `summaries/2026-06-28-test-bench-catchup-complete.md` (vault) — what just shipped, including the known follow-ups section.
- `packages/ui/src/sync/DOCUMENTATION.md` — canonical rules for store splitting, targeted cloning, and selector hygiene. Every recommendation below cites these rules directly.
- `packages/ui/src/sync/DOCUMENTATION.md` sections 30–43 and 175–195 are the binding constraints for the UI live-subscription and `evict()` recommendations.

Worktree rules carried over from prior sessions and still in force:

- The pre-existing dirty files in the worktree (`.superpawers/OVERVIEW.md`, `bun.lock`, `packages/ui/package.json`, multiple `packages/ui/src/**/*.test.ts` files, deleted `packages/ui/src/types/bun-test.d.ts`, `packages/ui/tsconfig.json`, `packages/vscode/package.json`, `packages/vscode/tsconfig.webview.json`, `packages/vscode/webview/main.tsx`, `packages/web/package.json`, `packages/web/tsconfig.json`, untracked `opencode.json`) are not part of any cleanup below. Do not modify, stage, or commit them.
- No `pgrep`, `pkill`, `killall`, or process-name matching anywhere.
- No new dependencies without explicit user approval.
- TDD: every behavioral change ships with a test in the appropriate layer (`tests/react/`, `tests/perf/`, `tests/`, `bun:test` colocated).

---

## Recommendation 1 — UI live-state subscription cleanup

**Files:**
- `packages/ui/src/sync/sync-context.tsx` (lines ~118-123, ~1683-1687)
- `packages/ui/src/sync/live-aggregate.ts` (lines ~96-170)
- `packages/ui/src/components/layout/Header.tsx` (line ~648)
- `packages/ui/src/components/session/SessionSidebar.tsx` (lines ~277-278)
- `packages/ui/src/components/views/agent-manager/AgentGroupDetail.tsx` (line ~146)
- `packages/ui/src/components/views/agent-manager/AgentManagerSidebar.tsx` (line ~179)
- `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx` (lines ~1280-1311)

**Current behavior:** `useAllSessionStatuses()` and `useAllLiveSessions()` return new object/array references on every session status change (which happens ~60/sec during streaming). `areStatusMapsEquivalent` does a shallow key + `type` comparison, but a new identity still re-evaluates the subscriber. `Header`, `SessionSidebar`, the agent manager, and the mobile status bar all subscribe to one or both. `useSessions()` is subscribed by 20+ components and re-evaluates on every session-list mutation.

**Why it matters:** This violates the `performance-rules` skill ("Do not subscribe shell/layout components to broad live collections") and the sync `DOCUMENTATION.md` rule that broad live-aggregate subscriptions belong in the store, not in shell components. During streaming, every status change re-renders the Header, both Sidebar panels, agent manager panels, and the mobile status bar. Mobile is the worst — `MobileSessionStatusBar` also calls `useSessionGrouping` on every render, which iterates and sorts all sessions.

**Expected outcome:**
- `Header.tsx` no longer subscribes to `useAllLiveSessions()` directly. It uses a narrow selector (e.g., count of running sessions, or current session's status only).
- `SessionSidebar.tsx`'s use of `useAllLiveSessions()` / `useAllSessionStatuses()` is reviewed case-by-case; aggregate hooks are pushed to leaf subcomponents where needed.
- `MobileSessionStatusBar.tsx` uses `useGlobalSessionStatus(currentSessionId)` for the collapsed view's status pill, not the full aggregate. `useSessionGrouping` gets memoized on a stable signature, not the raw `sessions` array.
- `useSessions()` callers are audited; 20+ subscribers should drop to a smaller set using `useSession(id)` or per-id status hooks.

**Verification:**
- Add a per-component commit-counter (using the `createCommitCollector` helper from `tests/react/helpers/renderMetrics.tsx`) in a small test or dev-build flag. Measure commits per second during streaming before and after.
- The `tests/react/chat-input.bench.tsx` snapshot can be re-run after the change; commit counts should not increase.
- Run the full test suite: `bun run test:react`, `bun run test:stores`, `bun run test:perf`. All should remain green; the chat-input bench should be unchanged or improved.

**Bite-size first pass:** Recommend a single PR that fixes only `MobileSessionStatusBar` (the highest-cost single component), keeps the rest unchanged, and ships with a small test that asserts the narrowed selector path is used. Larger-scope refactors of `Header` / `SessionSidebar` can follow.

---

## Recommendation 2 — `use-sync.ts` `evict()` targeted cloning

**Files:**
- `packages/ui/src/sync/use-sync.ts` (lines ~86-94)

**Current behavior:**
```ts
const draft = {
  message: { ...current.message },
  part: { ...current.part },
  session_status: { ...current.session_status },
  session_diff: { ...current.session_diff },
  todo: { ...current.todo },
  permission: { ...current.permission },
  question: { ...current.question },
}
```
This creates new references for ALL collections on every call, even though `dropSessionCaches` only ever touches `message` and `part`. Every `useDirectorySync` subscriber gets a new reference for unchanged collections and re-renders unnecessarily.

**Why it matters:** This directly violates the golden rule in `sync/DOCUMENTATION.md` lines 175–195 (targeted cloning, not broad clone). It defeats the discipline that the rest of the sync layer follows.

**Expected outcome:** `evict(dir, sessionIDs)` only clones the collections that the eviction actually mutates (typically `message` and `part`). The shape remains `Partial<DirectoryStore>` so other collections keep their reference identity when unaffected.

**Verification:**
- Trace the call sites of `evict()`. Confirm the common case only mutates `message` and `part` (and possibly `session_diff` for some flow). The plan should reference each call site by line.
- After the fix, add a small colocated `bun:test` file `packages/ui/src/sync/use-sync.test.ts` (or extend an existing sync test) that asserts: after `evict(dir, [s1])`, the `permission`, `question`, `todo` collection references are unchanged from the pre-evict state when those collections are not in the affected set.
- Run `bun run test:stores` and `bun run --cwd tests test:integration` (the latter will be skipped if no OpenCode binary, but should not fail when the binary is present).

**Bite-size first pass:** A single PR. Touches one file. Add a regression test that asserts reference identity is preserved on the unaffected collections.

---

## Recommendation 3 — `useUIStore` measured split

**Files:**
- `packages/ui/src/stores/useUIStore.ts` (lines ~459-646)

**Current behavior:** `useUIStore` is a ~90-field monolith bundled with `persist` + `devtools` middlewares. The persistence wrapper creates a new root reference on every state change. Components subscribe via per-leaf selectors (e.g., `useUIStore((s) => s.isMobile)`), and each selector re-evaluates on any unrelated `set` call. `ChatInput`, `useKeyboardShortcuts`, `useChatComposerState`, `MobileSessionStatusBar`, `VirtualizedMessageList`, `ModelControls`, and `UnifiedControlsDrawer` together subscribe to dozens of leaves from this one store.

**Why it matters:** Largest Zustand monolith in the project. Violates the `performance-rules` skill ("NEVER add unrelated state to an existing store. Create a new store. Group state by how often it changes."). Every unrelated `set` re-evaluates dozens of selectors across the app.

**Expected outcome:** Split into focused stores. Suggested mapping (treat as input to a fresh brainstorming pass, not as a binding plan):
- `useThemeStore` — theme, fontSize, padding, cornerRadius
- `useLayoutStore` — `isSidebarOpen`, `sidebarWidth`, `isMobile`, `isKeyboardOpen`, plus any other layout dimensions
- `useModelPreferencesStore` — `favoriteModels`, `hiddenModels`, `recentModels`, `recentEfforts`
- `useNotificationSettingsStore` — all notification toggles and templates
- `useContextPanelStore` — `contextPanelByDirectory`
- `useDiffPreferencesStore` — diff layout, wrap, view mode

`useUIStore` keeps the remaining (rarely-changing) fields.

**Verification:**
- Every consumer of the moved fields must be updated. The plan should call out the call sites per field (use `rg` to enumerate).
- The colocated `useUIStore.test.ts` (from the singleton-store-tests slice) should keep passing. Add tests for the new stores mirroring that style.
- `bun run test:react`, `bun run test:stores`, and a fresh chat-input perf run should not regress.

**Bite-size first pass:** A larger, multi-PR refactor. Do NOT attempt this in a single commit. Recommend sequencing as one-store-per-PR, starting with `useThemeStore` (smallest, easiest, fewest consumers).

---

## Recommendation 4 — `useGlobalSessionsStore` test coverage

**Files:**
- `packages/ui/src/stores/useGlobalSessionsStore.ts`
- `packages/ui/src/stores/globalSessions.ts` (already covered by `globalSessions.test.ts`)

**Current behavior:** The pure helpers in `globalSessions.ts` have 6 tests, but `useGlobalSessionsStore` itself (which wraps the helpers and the OpenCode API surface) is explicitly excluded from the singleton-store tests slice as out of scope. It is the only singleton store without unit coverage.

**Why it matters:** Single largest untested state surface in the app. It composes the OpenCode session list across directories and is read by the Header, SessionSidebar, and MobileSessionStatusBar.

**Expected outcome:** A colocated `packages/ui/src/stores/useGlobalSessionsStore.test.ts` (or extending the existing store test) that:
- Resets the store via `setState` in `beforeEach`.
- Mocks the `@opencode-ai/sdk/v2` boundary (or whichever client surface the store uses), following the same `mock.module()` + `await import()` pattern already used in `useCommandsStore.test.ts` and `useMultiRunStore.test.ts`.
- Covers at minimum: cache hit, cache miss + fetch, cache invalidation, error propagation, and aggregate equivalence (`sameSessionList`).

**Verification:**
- `bun run test:stores` should report one more file, all green.
- No new deps. No production source changes.

**Bite-size first pass:** Single PR. Self-contained.

---

## Recommendation 5 — Integration liveness baseline investigation

**Files:**
- `tests/web/liveness-fix.test.ts` — pre-existing `data_stalled` failure (unrelated to Plan 3 refactor; exists on `main` before any of this work)
- `tests/web/` — cold-module-cache transient for `@openchamber/web` (first file in a full-suite run times out at 45s on `beforeAll`)

**Current behavior:** The `data_stalled` assertion expects a controllable upstream that can be silenced for 20s+; a real OpenCode binary sends keepalives that prevent the stall. The 60s test timeout fires. The cold-cache transient is a separate environmental issue that does not reproduce when each file runs in isolation.

**Why it matters:** These are pre-existing baseline failures that the test/bench catch-up spec left untouched (per spec constraints: no semantic test changes). They pollute integration-test output and obscure regressions introduced later.

**Expected outcome:**
- `data_stalled` is either fixed (e.g., by configuring the test client to suppress keepalives, or by replacing the controllable upstream with a local HTTP echo) or skipped with a documented reason and a TODO referencing the issue.
- The cold-cache transient is either fixed (e.g., by moving the `@openchamber/web` dynamic import to a `globalSetup` or per-suite warm-up) or documented with mitigation.

**Verification:**
- `bun run test:web` runs to completion with no failures, or with only explicitly-skip-annotated tests failing.
- `RUN_SLOW_TESTS=1 bun run test:web` similarly clean.
- No regressions in the rest of the test suite.

**Bite-size first pass:** Treat as a debugging spec, not a quick refactor. Use the `systematic-debugging` skill.

---

## Recommendation 6 — Electron IPC gate extraction (replaces Plan 4 source-contract tests)

**Files:**
- `packages/electron/main.mjs` (lines ~2215-2235 and the inline gate inside `ipcMain.handle('openchamber:invoke', ...)`)
- `packages/electron/__tests__/remote-ipc-gate.test.mjs` (current source-contract version)

**Current behavior:** `COMMANDS_SAFE_FOR_REMOTE` is a `new Set([...])` literal inside `main.mjs`, and the gate is an inline `if (!isLocalSender(event.sender) && !COMMANDS_SAFE_FOR_REMOTE.has(command)) throw ...` inside the `ipcMain.handle` body. The Plan 4 tests read the source and assert by regex.

**Why it matters:** Source-contract tests are brittle and have no coverage of edge cases (e.g., sender vs command priority, error message consistency, behaviour when `command` is undefined). Extracting the gate into a pure helper would unlock direct unit tests and also make the safety boundary easier to reason about.

**Expected outcome:** Extract `isCommandRemoteSafe(command)` (or a small `assertRemoteSafe(sender, command)` helper) into its own module that `main.mjs` imports. The Plan 4 `remote-ipc-gate.test.mjs` switches from source-contract regex to importing the helper and asserting directly. `preload-contract.test.mjs` stays source-contract (the preload's structure is small enough to stay that way; can be revisited in a later pass).

**Verification:**
- `node --test packages/electron/__tests__/*.test.mjs` — both files pass; the gate test now imports the helper rather than reading source.
- `bun run --cwd packages/electron type-check` — pass.
- `bun run type-check` (root) — pass.
- No new dependencies.

**Bite-size first pass:** Single PR. Touches `main.mjs` minimally and replaces the source-contract gate test with a direct one.

---

## Recommendation 7 — `SessionSidebar` test coverage

**Files:**
- `packages/ui/src/components/session/SessionSidebar.tsx` (1400+ lines)
- `tests/react/helpers/sessionSidebarMocks.tsx` (does not exist yet — must be created first)
- `tests/react/session-sidebar.test.tsx` (does not exist yet)

**Current behavior:** `SessionSidebar` has zero tests. It subscribes to 40+ store selectors across 12+ stores, depends on 15+ custom hooks (some doing async work), and renders 15+ mocked child components and 7+ dialogs. The 2026-06-27 critical-component-tests slice correctly deferred it as too coupled.

**Why it matters:** The largest untested component in the app, and the one that drives the most state. After Recommendations 1 and 2 (and possibly 3) land, the coupling will be reduced and a test file becomes feasible.

**Expected outcome:** A shared `tests/react/helpers/sessionSidebarMocks.tsx` (similar in pattern to `chatInputMocks.tsx` — hoisted state + `vi.mock()` calls for every store and child). A small `tests/react/session-sidebar.test.tsx` covering the high-signal render paths:
- Empty state.
- Single project + single session.
- Multi-select active.
- Search query active.

**Verification:**
- `bun run test:react` adds the new file; all tests pass.
- The mock helper does not leak state between tests (the existing helper-style `mockClear` pattern works).

**Bite-size first pass:** Larger than the others. Recommend deferring until after Recommendations 1 and 2 land, and possibly after Recommendation 3 if `useUIStore` is split first.

---

## What is intentionally NOT in this handoff

The following were considered and excluded:

- **Pre-existing UI ambient-type cleanup** (the `bun-test.d.ts` swap-in via `@types/bun`) was outside the cleanup scope and is already partially in flight in the worktree as pre-existing dirty state. Revisit only if a `bun run type-check` regression appears.
- **`bun run lint` baseline** (1 error + 787 warnings in `packages/ui`) is excluded. Broad lint cleanup is a separate, much larger arc.
- **Vitest config deduplication** (3 configs across `tests/`, `tests/react/`, `tests/perf/`) was excluded as not worth touching without a concrete drift incident.
- **`packages/web/server/src/index.ts` (1013 lines) decomposition** was excluded as too broad and out of scope for this session.
- **Dual git strategies in `packages/web/server/src/domains/git/service.ts`** (mix of `simple-git` and `runGitCommand`) was excluded as a larger maintenance cleanup needing a separate design pass.
- **Cross-runtime parity tests** (Electron vs web vs VS Code) were excluded; the Plan 4 first seam is the foundation; full parity needs separate planning.
- **`event-pipeline.bench.js` porting to vitest bench** was excluded; the standalone script works and the new `tests/perf/README.md` documents the gap.

---

## Acceptance bar for this handoff

A new chat should be able to:

1. Read this spec end-to-end without re-doing codebase discovery for any of the seven recommendations.
2. Pick any one recommendation and start work without additional context, except for the smaller anchors the implementing agent verifies on its own (line numbers may have drifted slightly).
3. Sequence work in the order given without stepping on prior recommendations. Recommendations 1 and 2 are safe to do in either order; Recommendation 3 should follow both; 4 can happen any time; 5 is independent; 6 is independent; 7 follows 1, 2, and possibly 3.
4. Continue to obey the worktree rules (no pre-existing dirty file edits; no `pgrep`/`pkill`/`killall`; no new deps without approval; TDD).
