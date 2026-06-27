# React Component Render Performance Benchmarks

> **For agentic workers:** This is a design document. It is approved and frozen. Implementation follows in chunked plans.

**Goal:** Add render-performance benchmarks for the highest-frequency React component paths in the chat surface (`ChatInput` per-keystroke, `ChatView` streaming deltas) with vitest bench snapshot diffing for trend tracking across runs.

**Architecture:** Bench tests live in a new `tests/perf/` workspace with its own vitest bench config, mirroring the existing `tests/react/` workspace structure. Vitest bench provides three trend signals out of the box: stdout statistics (mean/median/stddev/p95/p99), `expect().toMatchSnapshot()` for commit-count trend snapshots, and deterministic hard assertions on commit counts where useful. Slice 2's existing fanout guard tests stay as the broad regression floor (cheap, fail CI clearly); benchmarks add granular trend data on top.

**Tech Stack:** Vitest 4 with `bench` mode, happy-dom, React 19 `Profiler`, `@testing-library/react`, `@testing-library/user-event`, existing `createCommitCollector` helper from `tests/react/helpers/renderMetrics.tsx`, existing UI package source aliases.

---

## Why this slice

Slice 2 added broad fanout regression guards (`expectNoUpdateCommits`, `expectUpdateCommitsAtMost`). They catch catastrophic regressions ("the app is blasting the browser") but don't characterize current performance or catch gradual regressions ("each keystroke got 20% slower over 10 commits").

Vitest bench with snapshots gives us trend tracking via `git diff` of the snapshot file — a reviewer can see commit counts change over time. Hard assertions on commit counts give deterministic CI failures. Stdout statistics give quick "is this branch slower than main?" answers.

The `tests/perf/` placeholder exists in the repo (`tests/package.json` has `"bench": "vitest bench perf --config perf/vitest.config.ts"`, root has `"test:perf"`) but the directory is empty. This slice fills it in.

---

## Scope

### In scope

- `tests/perf/vitest.config.ts` — vitest bench config with happy-dom, React plugin, `@/` and `@openchamber/ui` aliases.
- `tests/perf/setup.ts` — shared browser mocks + react-act setup for store mutations.
- `tests/react/helpers/chatInputMocks.ts` — extracted ChatInput mocks (used by both the slice 2 `chat-input.test.tsx` and the new bench file).
- `tests/perf/chat-input.bench.tsx` — 3 benchmarks.
- `tests/perf/chat-view.bench.tsx` — 2 benchmarks.
- `tests/perf/__snapshots__/` — generated snapshot files, committed to git for trend diffing.

### Out of scope (deferred)

- External trend storage / dashboards / CI integration beyond running the script.
- Performance optimizations — benchmarks measure, they don't fix.
- Snapshot review automation beyond what vitest provides natively.
- Benchmarks for components other than `ChatInput` and `ChatView`.
- Hard duration assertions (happy-dom timing is unreliable for cross-run comparison).

---

## Bench Scenarios

### `tests/perf/chat-input.bench.tsx`

1. **`chat input · single keystroke commit count`** — type one character via `userEvent`, snapshot total commit count for trend tracking. Expected: low single digits.
2. **`chat input · 50-character burst`** — type 50 characters via `userEvent`, snapshot total commit count. Expected: scales near-linearly (i.e., not quadratic or worse).
3. **`chat input · unrelated store write`** — `act(useUIStore.setState({ settingsPage: 'agents' }))`, assert exactly 0 update commits via `expect(commits).toHaveLength(0)`. Hard assertion: this is the same guard as slice 2's fanout test, expressed as a bench for trend data.

### `tests/perf/chat-view.bench.tsx`

4. **`chat view · session id change fanout`** — change `currentSessionId` via mocked `useSessionUIStore.setState` in `act()`, snapshot total commit count. Expected: low single digits.
5. **`chat view · 60-message streaming burst`** — simulate 60 rapid message-delta store writes via `act()` in a tight loop, snapshot total commit count. Expected: scales near-linearly with input count.

---

## Mock Reuse Strategy

The slice 2 `chat-input.test.tsx` has ~30 `vi.mock` blocks for `ChatInput`. Reusing them in the bench file via shared helper is the right move — duplication is the wrong tradeoff when both files need identical mocks.

Plan:
- Extract ChatInput mocks into `tests/react/helpers/chatInputMocks.ts`.
- Both `tests/react/chat-input.test.tsx` and `tests/perf/chat-input.bench.tsx` import from the shared helper.
- The shared helper is a module that calls `vi.mock(...)` for each dependency at top level (vitest hoists these to before-import). Each consumer imports the helper for its mock side effects.
- ChatView bench uses inline mocks (only ~5 needed, not worth extracting yet).

---

## Snapshot Strategy

- Snapshots live in `tests/perf/__snapshots__/` next to bench files (vitest default location).
- First run creates the snapshot; subsequent runs fail on diff.
- Intentional updates: `bun run test:perf -- --update` regenerates snapshots.
- Commit-count snapshots are deterministic (happy-dom rendering is deterministic), so this isn't flaky.
- Snapshot diffs in PRs are the primary trend surface: a reviewer sees "ChatInput per-keystroke went from 3 → 7 commits" at a glance.
- vitest bench stdout also prints mean/median/stddev/p95/p99 per bench — visible in CI logs for "is this branch slower than main?" quick checks.

---

## Acceptance Criteria

- `tests/perf/vitest.config.ts` exists and is invoked by `bun run test:perf`.
- `tests/perf/setup.ts` provides browser mocks + react-act setup.
- `tests/perf/chat-input.bench.tsx` has 3 benchmarks.
- `tests/perf/chat-view.bench.tsx` has 2 benchmarks.
- `tests/react/helpers/chatInputMocks.ts` exists; both the slice 2 test file and the bench file import from it.
- Snapshot files exist under `tests/perf/__snapshots__/` and are committed.
- All 5 benchmarks run deterministically across 3 consecutive `bun run test:perf` runs.
- Slice 2 fanout tests still pass (34/34 React tests).
- Store tests still pass (68/68).
- `bun run --cwd tests lint` has no branch-introduced errors in `tests/perf/` or `tests/react/helpers/chatInputMocks.ts`.
- `bun run --cwd tests type-check` has no branch-introduced errors in `tests/perf/` or `tests/react/helpers/chatInputMocks.ts`.
- No production source changes under `packages/`.
- No name-based process cleanup / process-matching commands anywhere.
- Pre-existing untracked `opencode.json` remains untouched.

---

## Verification Commands

- `bun run test:perf` × 3 — deterministic mean/stddev across runs; snapshot diffs only on intentional changes.
- `bun run test:react` — slice 2 fanout tests still pass (34/34).
- `bun run test:stores` — store tests still pass (68/68).
- `bun run --cwd tests lint` — clean for new files.
- `bun run --cwd tests type-check` — clean for new files.
- `git diff --stat main...HEAD` — only `tests/perf/`, `tests/react/helpers/chatInputMocks.ts`, `tests/package.json` (if scripts touched), and existing slice 1+2 files. No production changes.

---

## Reviewer Notes

- Snapshot files are committed for trend visibility — do not `.gitignore` them.
- Vitest bench iteration count defaults to 5 (stable mean/median without slowing CI).
- Duration metrics from vitest bench stdout are informational only; the trend surface is the commit-count snapshot, not duration.
- If a benchmark becomes flaky (e.g., due to a deterministic-but-environment-dependent commit count), loosen the bound slightly and document why rather than disabling the bench.
- `chatInputMocks.ts` extraction must preserve all existing slice 2 mock behavior exactly. The slice 2 test file should not change behavior — only the mock location moves.