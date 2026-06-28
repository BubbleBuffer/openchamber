# Test and Benchmark Catch-Up

> **For agentic workers:** This is a design document. Implementation follows via multiple plans (one per slice, written after this spec is committed and approved). Each plan must be executed under `superpawers:subagent-driven-development`.

**Goal:** Restore a trustworthy test and benchmark baseline so future development is gated by real signals, not silent debt. Consolidate the deferred React coverage and shell-runtime coverage into one multi-plan catch-up, leaving room for a follow-up perf-spec slice when the React bench baseline stabilises.

**Architecture:** Four implementation plans derived from one spec. Each plan targets an independent concern, produces self-contained, verifiable changes, and uses the existing test infrastructure (no new runner, no new config). Process cleanup stays PID-file-only — no `pgrep`/`pkill`/`killall` anywhere.

**Tech Stack:** `bun:test` (store/sync unit), `vitest` (React DOM, perf bench, integration), `happy-dom`, `@testing-library/react`, existing `tests/helpers/*` integration harness, `@types/bun` (already staged).

---

## Why this spec now

Recent merged work landed significant test surface but left gaps:

1. **`@openchamber/tests` workspace has 17 pre-existing TS errors** that block `bun run type-check` from being meaningful for downstream changes. They are concentrated in UI ambient typing (e.g. `__OPENCHAMBER_HOME__`, `__OPENCHAMBER_LOCAL_ORIGIN__`, `ImportMeta.env`, `@pierre/diffs/worker/worker.js?worker&url`). Without a baseline, every PR's CI is a coin-flip on whether `type-check` is meaningful.
2. **Perf benchmarks record samples but don't enforce thresholds.** `tests/perf/chat-input.bench.tsx` uses a hand-rolled JSON snapshot (`__snapshots__/chat-input.bench.snap.json`) with a `frozen` flag that defaults to `false`. There is no documentation of when to flip `frozen`, no threshold enforcement on `chat-view.bench.tsx`, and `packages/ui/src/sync/__tests__/event-pipeline.bench.js` is a standalone script outside the `bun run test:perf` flow.
3. **React critical coverage is partially done.** The `feature/react-critical-component-tests` slice covered `SettingsView`, `MainLayout`, `ChatView`, `ChatSessionView`, and `ChatInput`. Deferred components: `ChatMessage`, `MessageListEntry`, `MessageListEntries`, `VirtualizedMessageList`, `SessionSidebar`.
4. **Integration test lifecycle boilerplate is duplicated across ~17 files.** Each `tests/opencode/*.test.ts` and `tests/web/*.test.ts` file repeats the `checkOpenCodeAvailable` / `startOpenCodeInstance` / `afterAll(stop)` pattern. PID-file-only cleanup is already in place — that constraint must be preserved.
5. **Electron and VS Code shells have zero test coverage** across ~4000 lines of production code. The IPC contracts and bridge dispatch logic are completely unverified. Integration tests exercise web; nothing exercises Electron or VS Code surfaces.

Lint cleanup is intentionally out of scope. The 1-error/787-warning baseline is real debt but is large enough to need its own slice.

---

## Scope: four plans

### Plan 1 — Baseline + bench workflow

**Goal:** Restore meaningful `bun run type-check` for test workspaces and make perf benches actionable without changing their semantics.

**Files:**
- Read: `tests/tsconfig.json`, `tests/vitest.config.ts`, `packages/ui/src/types/global.d.ts` (or equivalent ambient types), `packages/ui/src/lib/opencode/__OPENCHAMBER_HOME__.ts` (or equivalent injection points), `tests/perf/chat-input.bench.tsx`, `tests/perf/chat-view.bench.tsx`, `packages/ui/src/sync/__tests__/event-pipeline.bench.js`, `tests/package.json`, `package.json`.
- Possibly modify: ambient type files (define `__OPENCHAMBER_HOME__`, `__OPENCHAMBER_LOCAL_ORIGIN__`, `ImportMeta.env`, `@pierre/diffs/worker/worker.js?worker&url`), root scripts.
- Possibly create: `tests/perf/__snapshots__/chat-view.bench.snap.json`, top-level doc under `tests/perf/README.md`.

**Work:**
1. **Type-check baseline.** Audit and fix the 17 TS errors in `@openchamber/tests` that currently block the workspace-level `type-check`. The errors are:
   - `__OPENCHAMBER_HOME__` and `__OPENCHAMBER_LOCAL_ORIGIN__` injection points — declare in ambient types file (likely `packages/ui/src/types/global.d.ts` or `tests/types.d.ts`).
   - `ImportMeta.env` declarations — likely need `vite/client` types reference or custom declaration.
   - `@pierre/diffs/worker/worker.js?worker&url` — declare module with `?worker&url` import suffix.
   - Verify `bun run --cwd tests type-check` exits 0.
   - Verify `bun run type-check` (root) exits 0.
   - Verify `bun run --cwd packages/ui type-check` still passes (already passing — must not regress).
2. **Perf bench workflow.** Update `tests/perf/README.md` (create if missing) to document:
   - How `bun run test:perf` works (vitest bench).
   - The `frozen` flag semantics on `chat-input.bench.tsx`.
   - When to flip `frozen: true` (after a stable baseline is committed and reviewed) and how to unfreeze (delete snapshot).
   - Why `chat-view.bench.tsx` does not have a snapshot file (uses inline thresholds).
   - Whether `packages/ui/src/sync/__tests__/event-pipeline.bench.js` should be brought into the same workflow or kept as a standalone script. Default: keep standalone, document why.
3. **Documentation only — no changes to bench semantics.**

**Verification:**
- `bun run type-check` exits 0 from repo root.
- `bun run test:perf` runs and produces same sample counts as before (no threshold introduced).
- `tests/perf/README.md` exists and documents the workflow.

**Out of scope:** Adding threshold enforcement on `chat-view.bench.tsx`. Adding new bench tests. Migrating `event-pipeline.bench.js`. Lint cleanup.

---

### Plan 2 — React critical-component coverage

**Goal:** Cover the deferred critical components: `ChatMessage`, `MessageListEntry`, `MessageListEntries`, `VirtualizedMessageList`, `SessionSidebar`.

**Files:**
- Read: `tests/react/helpers/{browser,stores,render,fixtures,mocks,renderMetrics}.ts*`, `tests/react/helpers/chatInputMocks.tsx`, `tests/react/chat-input.test.tsx`, `tests/react/chat-session-view.test.tsx`, the deferred component source files.
- Create: `tests/react/chat-message.test.tsx`, `tests/react/message-list-entries.test.tsx`, `tests/react/virtualized-message-list.test.tsx`, `tests/react/session-sidebar.test.tsx`.
- Possibly modify: shared mocks helper if needed for new components.

**Work:**
1. **Mirror existing patterns.** Use the same approach as `chat-input.test.tsx` and `chat-session-view.test.tsx`:
   - Real components, mock at process boundaries (OpenCode SDK, fetch, shell APIs, virtualizer).
   - Use `tests/react/helpers/chatInputMocks.tsx` style shared mocks where multiple components share dependency chains.
   - Keep `useUIStore`/`useSessionUIStore` real unless the component is genuinely unreviewable through them.
2. **Per-component coverage targets:**
   - `ChatMessage.test.tsx` — render modes (user/assistant/tool), tool part variants, interruption/permission markers, mobile vs desktop layout branches.
   - `message-list-entries.test.tsx` — entry fan-out, scroll/virtualization triggers, scroll-to-bottom behaviour, streaming updates.
   - `virtualized-message-list.test.tsx` — windowing boundaries, overscan, anchor preservation.
   - `session-sidebar.test.tsx` — list rendering, selection, group by project, mobile drawer open/close, unread/streaming indicators.
3. **No new bench tests in this plan.** Perf coverage for these components is a follow-up.

**Verification:**
- `bun run test:react` exits 0.
- Each new file has ≥3 tests pinning load-bearing behaviour.
- No new test depends on production code changes (this is a test-only slice).

**Out of scope:** Adding render perf benchmarks for these components (separate future plan). Touching `useUIStore`. Touching the deferred cleanup items below the test layer.

---

### Plan 3 — Integration test lifecycle helper

**Goal:** Extract the duplicated OpenCode availability/start/stop pattern into a shared helper used across all `tests/opencode/*.test.ts` and `tests/web/*.test.ts` files.

**Files:**
- Read: `tests/helpers/opencode-process.ts`, `tests/helpers/vitest.ts`, all `tests/opencode/*.test.ts`, all `tests/web/*.test.ts`.
- Create: `tests/helpers/integration-suite.ts` (or extend `tests/helpers/vitest.ts`).
- Modify: every integration test file to use the new helper.

**Work:**
1. **Add `describeWhenOpenCode`** (or similar name) helper that:
   - Calls `checkOpenCodeAvailable()`.
   - When unavailable, returns `describe.skip`.
   - When available, returns `describe` and registers `beforeAll`/`afterAll` for `startOpenCodeInstance`/`stop`.
   - Optionally accepts a callback for setup that needs the opencode instance.
2. **Migrate all 17 integration test files.** Each file currently has ~15-20 lines of boilerplate; the helper should reduce that to ~3 lines per file.
3. **Preserve PID-file-only cleanup.** Do NOT add `pgrep`, `pkill`, `killall`, or name-based process matching anywhere. The three-layer cleanup (PID recording, watchdog, reaper) at `tests/helpers/opencode-process.ts` must remain the only cleanup mechanism.
4. **Document the constraint in the helper file's header comment** so future contributors do not add name-based matching.

**Verification:**
- `bun run test:integration` exits 0 (50/54 pass — same as baseline — 1 pre-existing liveness-fix test failure, 4 skipped).
- `bun run test:integration:slow` exits 0.
- `rg 'pgrep|pkill|killall' tests/` returns zero matches in added/modified files.
- Boilerplate line count reduced by ≥80% across the 17 files.

**Out of scope:** Adding new tests. Changing test semantics. Changing the cleanup mechanism. Adding `Mode B` shared-process per-run setup.

---

### Plan 4 — Shell-runtime seam tests

**Goal:** Add the first test coverage for Electron and VS Code shells, focusing on IPC contract surface and bridge dispatch logic. End-to-end electron launch is out of scope.

**Files:**
- Read: `packages/electron/main.mjs`, `packages/electron/preload.mjs`, `packages/vscode/src/bridges/bridge.ts`, `packages/vscode/src/bridges/*-runtime.ts`, `packages/vscode/src/extension.ts`, existing test setups (`tests/react/vitest.config.ts`, `tests/vitest.config.ts`).
- Create: `packages/electron/__tests__/ipc-handlers.test.mjs` (or `.ts` if converted), `packages/electron/__tests__/preload-contract.test.mjs`, `packages/vscode/src/bridges/__tests__/bridge-dispatch.test.ts`, `packages/vscode/src/bridges/__tests__/*-runtime.test.ts` (one per runtime: opencode, git, github, fs, etc.).
- Possibly modify: vitest configs to include the new workspaces.

**Work:**
1. **Electron seam tests.** Test the IPC handler dispatch in `main.mjs` against the handler map (without launching Electron). Test the preload `__TAURI__` shim exposes the correct API surface.
2. **VS Code bridge dispatch tests.** Cover `bridge.ts:62-166` (the 18-case switch ladder) — every domain runtime case with stubbed dependencies. Cover the GitHub backend-disabled error path. Cover the per-runtime stubs (opencode auth, config, ready gate).
3. **No Electron launch.** Do not spawn Electron or VS Code in tests. Test the IPC handler map and bridge dispatch in isolation.
4. **Runner choice.** Match existing patterns:
   - Electron tests can use `bun:test` (the file is `.mjs`, no TS conversion needed unless touched).
   - VS Code tests can use `vitest` (matches `tests/` workspace) or `bun:test` colocated with source. Pick the lighter option per file.

**Verification:**
- New Electron tests: pass under `bun test --isolate` from `packages/electron/`.
- New VS Code tests: pass under vitest.
- No Electron or VS Code process is spawned during test runs.
- No `pgrep`/`pkill`/`killall` introduced.

**Out of scope:** End-to-end Electron launch. End-to-end VS Code extension host. Real IPC over WebSocket/SSE. UI smoke tests for shell windows.

---

## Cross-cutting constraints

These apply to every plan:

1. **HARD: No name-based process matching — ever.** `pgrep`, `pkill`, `killall`, or any name-based process match is forbidden in any plan, helper, test, or subagent prompt. Cleanup verification goes through PID files only (`<tempdir>/pid`), checking `process.kill(pid, 0)` for liveness. This is a hard rule from `AGENTS.md` and `.superpawers/specs/2026-06-26-integration-testing-complete.md`.
2. **No new test runner, no new config files** beyond what is strictly needed.
3. **No production code changes** in test-only plans (Plan 2, Plan 3, Plan 4). Plan 1 may modify ambient type files.
4. **Each plan must be independently runnable and verifiable.** No plan depends on another being merged first.
5. **Follow existing test patterns.** Use the same helper files, mock styles, and reset patterns as adjacent tests.

---

## Verification matrix

| Plan | Verification commands |
|---|---|
| Plan 1 | `bun run type-check`, `bun run test:perf` |
| Plan 2 | `bun run test:react` |
| Plan 3 | `bun run test:integration`, `bun run test:integration:slow`, `rg 'pgrep\|pkill\|killall' tests/` |
| Plan 4 | New Electron test command, new VS Code test command |

Across all plans:
- `bun run test:stores` continues to pass (existing baseline).
- `bun run docs:validate` continues to pass (no doc changes).
- `bun run type-check` exits 0 from repo root after Plan 1.

---

## Non-goals

- Lint cleanup (separate slice).
- `useUIStore` refactor (separate slice).
- New product behaviour.
- New perf bench tests for the deferred components (follow-up plan once render baseline stabilises).
- Migrating `event-pipeline.bench.js` (documented as standalone, not migrated).
- Adding threshold enforcement to `chat-view.bench.tsx` (deferred until baseline is committed).
- `Mode B` shared-process integration setup (deferred per existing docs).

---

## Open questions for the user (none blocking)

This spec assumes the four-plan scope above. If any of these are wrong, please flag before planning begins:

- Is the type-check baseline (Plan 1) acceptable as the only type-related work in this catch-up?
- Are deferred React components the right priority for Plan 2, or should `useAllSessionStatuses`-style render amplification fixes come first?
- Is integration lifecycle helper (Plan 3) high enough priority to land before shell-runtime seam tests (Plan 4)?