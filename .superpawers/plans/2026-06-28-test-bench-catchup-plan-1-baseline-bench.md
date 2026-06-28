# Test and Benchmark Catch-Up Plan 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the `@openchamber/tests` type-check baseline and document the existing perf benchmark workflow without changing benchmark semantics.

**Architecture:** Add a tests-local ambient type shim for Vite and OpenChamber window globals, then add a `tests/perf/README.md` documenting the already-existing `vitest bench` workflow, frozen ChatInput snapshots, ChatView inline thresholds, and standalone event-pipeline benchmark.

**Tech Stack:** TypeScript ambient declarations, `vite/client`, `vitest bench`, existing `tests/perf/*` benchmark files.

---

## File Structure

- Create: `tests/types.d.ts` — tests-workspace ambient declarations for UI imports compiled through `tests/tsconfig.json`.
- Create: `tests/perf/README.md` — human-readable perf benchmark workflow and maintenance rules.
- Read-only verification anchors: `tests/tsconfig.json`, `tests/perf/chat-input.bench.tsx`, `tests/perf/chat-view.bench.tsx`, `tests/perf/__snapshots__/chat-input.bench.snap.json`, `packages/ui/src/sync/__tests__/event-pipeline.bench.js`, `tests/package.json`, root `package.json`.

## Current Baseline

`bun run --cwd tests type-check` currently fails with 16 known errors:

- `Window.__OPENCHAMBER_LOCAL_ORIGIN__` missing in `DesktopHostSwitcher.tsx`, `Header.tsx`, `desktop.ts`.
- `Window.__OPENCHAMBER_HOME__` missing in `persistence.ts`, `desktop.ts`, `useDirectoryStore.ts`.
- `ImportMeta.env` and `ImportMeta.glob` missing in UI files compiled through the tests workspace.
- Vite suffix imports missing for `@pierre/diffs/worker/worker.js?worker&url` and `*.svg?raw`.

The minimal fix is tests-local declarations. Do not edit production source for these ambient issues.

---

### Task 1: Restore `@openchamber/tests` Type-Check Baseline

**Files:**
- Create: `tests/types.d.ts` — ambient declarations loaded by `tests/tsconfig.json` include pattern.
- Read: `tests/tsconfig.json` — confirm it includes `**/*.ts`, `**/*.tsx`, or otherwise includes `types.d.ts`.

- [ ] **Step 1: Run failing baseline**

Run: `bun run --cwd tests type-check`

Expected: FAIL with the 16 ambient type errors listed above.

- [ ] **Step 2: Create tests-local ambient type file**

Create `tests/types.d.ts` with this complete content:

```ts
/// <reference types="vite/client" />

declare global {
  interface Window {
    __OPENCHAMBER_HOME__?: string;
    __OPENCHAMBER_LOCAL_ORIGIN__?: string;
  }
}

export {};
```

Notes:
- `vite/client` provides `ImportMeta.env`, `ImportMeta.glob`, `?raw`, and `?worker&url` declarations.
- The window globals duplicate the declarations in `packages/ui/src/types/desktop.d.ts` because the tests workspace compiles UI files through a separate `tsconfig` boundary.
- Do not add broad `any` declarations for `ImportMeta` or wildcard modules. Use `vite/client`.

- [ ] **Step 3: Inspect the diff**

Run: `git diff -- tests/types.d.ts`

Expected: exactly one new ambient declaration file; no production source changes.

- [ ] **Step 4: Verify tests workspace type-check passes**

Run: `bun run --cwd tests type-check`

Expected: PASS, exit 0.

- [ ] **Step 5: Verify package and root type-check stay clean**

Run: `bun run --cwd packages/ui type-check`

Expected: PASS, exit 0.

Run: `bun run type-check`

Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/types.d.ts
git commit -m "test(types): restore tests workspace type-check baseline"
```

---

### Task 2: Document Perf Benchmark Workflow

**Files:**
- Create: `tests/perf/README.md` — documentation for `bun run test:perf` and related standalone benchmark.
- Read: `tests/perf/chat-input.bench.tsx` — hand-rolled snapshot behavior.
- Read: `tests/perf/chat-view.bench.tsx` — inline thresholds.
- Read: `tests/perf/__snapshots__/chat-input.bench.snap.json` — currently `frozen: true`.
- Read: `packages/ui/src/sync/__tests__/event-pipeline.bench.js` — standalone script.

- [ ] **Step 1: Confirm current perf files**

Run: `git ls-files tests/perf packages/ui/src/sync/__tests__/event-pipeline.bench.js`

Expected: includes:
- `tests/perf/chat-input.bench.tsx`
- `tests/perf/chat-view.bench.tsx`
- `tests/perf/vitest.config.ts`
- `tests/perf/setup.ts`
- `tests/perf/__snapshots__/chat-input.bench.snap.json`
- `packages/ui/src/sync/__tests__/event-pipeline.bench.js`

- [ ] **Step 2: Create README**

Create `tests/perf/README.md` with this complete content:

````md
# Performance Benchmarks

Run the React render benchmarks from the repository root:

```bash
bun run test:perf
```

This delegates to `bun run --cwd tests bench`, which runs `vitest bench perf --config perf/vitest.config.ts`.

## Benchmark Types

### `chat-input.bench.tsx`

`chat-input.bench.tsx` uses a custom JSON snapshot at `tests/perf/__snapshots__/chat-input.bench.snap.json`.

The snapshot has a `frozen` flag:

- `frozen: false` means runs record samples but do not enforce them.
- `frozen: true` means committed samples are the baseline and any drift throws during the benchmark.

Freeze a snapshot only after a stable baseline has been reviewed and committed. To intentionally reset the baseline, delete the snapshot file, rerun `bun run test:perf`, review the generated samples, then commit the new snapshot.

### `chat-view.bench.tsx`

`chat-view.bench.tsx` does not use a JSON snapshot. It uses inline commit-count thresholds because the mocked session/view setup is more synthetic than `ChatInput` and the useful signal is an upper bound, not exact sample equality.

Current expectations:

- Session id change: at most 1 update commit.
- 60-message streaming burst: at most 60 update commits.

## Standalone Sync Benchmark

`packages/ui/src/sync/__tests__/event-pipeline.bench.js` is not part of `bun run test:perf`.

Run it directly when investigating sync pipeline throughput:

```bash
bun packages/ui/src/sync/__tests__/event-pipeline.bench.js
```

It is intentionally standalone for now. It uses hand-rolled synthetic workloads and prints its own report instead of using `vitest bench`.

## Maintenance Rules

- Do not loosen benchmark thresholds or snapshot samples without documenting the reason in the commit message.
- Prefer adding a new focused benchmark over broadening an existing one.
- Keep mocks at process boundaries; do not import Electron, VS Code, or real OpenCode processes from perf tests.
````

- [ ] **Step 3: Inspect the diff**

Run: `git diff -- tests/perf/README.md`

Expected: exactly one new docs file; no benchmark implementation changes.

- [ ] **Step 4: Verify perf benchmarks still run**

Run: `bun run test:perf`

Expected: PASS. `chat-input.bench.tsx` should still use the already-frozen `tests/perf/__snapshots__/chat-input.bench.snap.json`; `chat-view.bench.tsx` should still use inline thresholds.

- [ ] **Step 5: Commit**

```bash
git add tests/perf/README.md
git commit -m "docs(perf): document benchmark workflow"
```

---

### Task 3: Final Plan 1 Verification

**Files:**
- Verify only: `tests/types.d.ts`, `tests/perf/README.md`.

- [ ] **Step 1: Run final commands**

Run: `bun run --cwd tests type-check`

Expected: PASS, exit 0.

Run: `bun run type-check`

Expected: PASS, exit 0.

Run: `bun run test:perf`

Expected: PASS, no benchmark semantic changes.

Run: `bun run test:stores`

Expected: PASS, existing store tests unchanged.

- [ ] **Step 2: Inspect final diff/status**

Run: `git status --short`

Expected: no unstaged changes from this plan. Pre-existing user work may remain dirty; do not touch it.

Run: `git log --oneline -3`

Expected: includes the two plan implementation commits above.
