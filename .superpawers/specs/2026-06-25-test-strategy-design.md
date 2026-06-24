# Test Strategy Spec — Integration, React/DOM, and Performance

**Date:** 2026-06-25
**Branch:** `feature/integration-tests-spec`
**Status:** Draft for review
**Supersedes:** None (initial spec)
**Scope:** This is a multi-plan source of truth. Each numbered plan derived from this spec covers one slice.

---

## 0. Overview

OpenChamber's existing test coverage is solid for individual units (Zustand stores, XState machines, server runtimes, message renderers) but has structural gaps:

1. **No end-to-end test of the OpenCode → OpenChamber → React chain.** Unit tests mock the OpenCode SDK or test pure functions. When OpenCode's behavior changes (it does, regularly), we have no automated signal of breakage. Today we catch this in production.
2. **No React component tests.** The 1800-delta synthetic perf test exercises message rendering in isolation, but no test verifies that a real `SessionMount` correctly re-renders when machine state changes, or that selectors don't cause list-wide re-renders.
3. **No perf regression net.** Phase 3.3 explicitly skipped the "render fanout guard test" because React Testing Library wasn't installed. The hot path we've spent two phases polishing is unprotected.

This spec defines a test surface covering all three gaps, structured so that fast tests stay fast and slow tests stay opt-in.

---

## Part 1: Integration Tests (real OpenCode + real OpenChamber)

### 1.1 Goals

- Drive a real OpenCode binary against a real OpenChamber process via real HTTP, SSE, and WebSocket
- Catch regressions in the integration boundary that unit tests with mocked SDKs cannot
- Exercise the liveness fix (data_stalled/data_resumed) end-to-end against actual process death
- Provide a regression net for sync layer desync (optimistic inserts, reconnect storms, undo/redo races, mid-message crash)

### 1.2 Non-Goals

- **No mocks, recordings, or fake OpenCode instances.** This is a hard rule. Recorded interactions become stale; mocked SDKs don't catch real OpenCode behavior changes. If a test needs a model response, it talks to a real one.
- **No UI rendering.** React component tests live in Part 2.
- **No Electron or VS Code shell testing.** Out of scope for this spec; tracked in §6.
- **No cross-version OpenCode matrix.** Tests run against whatever `opencode` is on PATH. Version skew is handled by having a working binary, not a matrix.

### 1.3 Surface taxonomy

Two surfaces, each with its own directory and intent:

| Surface | Directory | What it tests | OpenCode mode | OpenChamber mode |
|---|---|---|---|---|
| OpenCode | `tests/opencode/` | OpenChamber's opencode domain in isolation: binary resolution, SDK connect, session CRUD against a real OpenCode | Mode A or B | N/A — talks to OpenCode directly via SDK |
| Web | `tests/web/` | Full OpenChamber web server: HTTP API + SSE + WS + event-stream + the liveness fix path | Mode A or B | Always — bootstraps OC web server with `OPENCODE_SKIP_START=true` pointing at OpenCode |

Future surfaces (deferred — see §6):
- `tests/electron/` — desktop shell
- `tests/vscode/` — VS Code extension

### 1.4 Harness architecture

```
tests/
├── package.json                          # vitest, no shared deps with main packages
├── vitest.config.ts                      # slow annotation handling, surfaces
├── tsconfig.json
├── README.md
├── helpers/                              # shared across all surfaces
│   ├── opencode-process.ts               # spawn + manage real binary
│   ├── openchamber-process.ts            # spawn + manage real OC web server
│   ├── opencode-sdk.ts                   # typed SDK wrapper
│   ├── ports.ts                          # port allocation (no clashes)
│   ├── cleanup.ts                        # shared teardown
│   ├── env.ts                            # OPENCODE_HOST, OPENCODE_BINARY, etc.
│   └── logs.ts                           # process log capture
├── opencode/                             # surface: OpenCode-only tests
│   └── ...
├── web/                                  # surface: OpenChamber web integration
│   └── ...
├── fixtures/                             # shared test data, configs
│   └── ...
```

**All surfaces share `helpers/`. Each surface owns its own tests.** No cross-surface imports except through helpers.

### 1.5 OpenCode instance management — Mode A and Mode B

The harness supports two first-class modes. Tests declare which they need.

#### Mode A: per-suite (isolated)

Each test suite (`describe` block or test file) gets its own OpenCode instance.

```ts
// Example usage
suite("session CRUD", modeA(async (oc) => {
  const session = await oc.client.session.create({ ... });
  ...
}));
```

- **Pros:** Full isolation. Suite can corrupt state freely. No cross-test ordering concerns.
- **Cons:** Slow (3-5s per suite for binary startup). Bad for suites with many small tests.
- **When to use:** Tests that mutate OpenCode state in non-idempotent ways, that need a clean slate, or that test crash/restart behavior.

#### Mode B: per-run (shared)

One OpenCode instance for the entire test run, reused across suites.

```ts
// Example usage
test("session CRUD via web API", modeB(async (oc) => {
  // oc is the same instance for all tests in the run
  const session = await oc.client.session.create({ ... });
}));
```

- **Pros:** Fast (one binary startup per test run). Tests can chain.
- **Cons:** Tests must be order-safe within a run. Cleanup between tests must be explicit.
- **When to use:** Read-only tests, idempotent tests, or tests that explicitly clean up after themselves.

#### Mode selection rule of thumb

- **If the test is read-only or self-cleaning** → Mode B
- **If the test corrupts state or tests crash recovery** → Mode A
- **If in doubt** → Mode A (overhead is fine; flakes are not)

Both modes are built into the harness from day one. Neither is surface-specific. `tests/web/` may use Mode A for the liveness test (kill OC mid-test) and Mode B for normal API tests.

### 1.6 `@slow` annotation

Slow tests (anything that depends on model completion, deep I/O, or large-scale state) get a `@slow` marker.

**Convention:** `@slow` appears in the test name as a suffix.

```ts
test("live prompt streams model response @slow", async () => { ... });
```

**Mechanism:** A custom vitest matcher excludes `@slow` tests by default. The harness provides a `slow` flag that tests can read.

```ts
import { test, isSlowEnabled } from "../helpers/vitest";

test.skipIf(!isSlowEnabled())("live prompt @slow", async () => { ... });
```

Or simply:

```ts
test("live prompt @slow", async ({ skip }) => {
  skip(); // vitest's built-in skip
  // ...
});
```

**Recommended form** (cleaner): A custom `slowTest` export that respects the env var:

```ts
// helpers/vitest.ts
export const slowTest = process.env.RUN_SLOW_TESTS === "1" ? test : test.skip;
```

**CI integration:** Vitest config sets `RUN_SLOW_TESTS` only for the nightly/manual lane.

### 1.7 Tier 1: always-on integration tests

These run in default CI. No model calls, no `@slow` annotation.

#### 1.7.1 OpenCode surface (`tests/opencode/`)

| Test | Mode | What it verifies |
|---|---|---|
| Binary resolution honors `OPENCODE_BINARY` env var | A | Custom binary path is used |
| Binary resolution honors `OPENCODE_PATH` etc. | A | All explicit env vars are tried in order |
| Binary resolution falls back to PATH | A | Resolution succeeds when `opencode` is on PATH |
| Binary resolution falls back to common install paths | A | `~/.opencode/bin/opencode`, `~/.bun/bin/opencode`, etc. are searched |
| SDK connect succeeds | A or B | `opencodeClient` connects to spawned binary |
| SDK connect fails cleanly on bad binary | A | Process exits, error is reported, no zombie process |
| Session create returns valid session | A or B | SDK `session.create` returns object with id, title, directory |
| Session list returns created sessions | A or B | `session.list` includes the session we just created |
| Session get returns the same session | A or B | `session.get(id)` returns equivalent data |
| Session delete removes the session | A or B | Subsequent `session.get(id)` fails or returns null |
| Session archive moves to archive | A or B | `session.list({archived: true})` includes it |
| Multi-directory session routing | A | Sessions in different directories are isolated |

#### 1.7.2 Web surface (`tests/web/`)

| Test | Mode | What it verifies |
|---|---|---|
| OC web server boots with `OPENCODE_SKIP_START=true` | B | Server starts, `OPENCODE_HOST` is honored |
| OC web server rejects bad `OPENCODE_HOST` URL | A | Server fails fast with clear error |
| Web API session CRUD | B | `POST /api/sessions`, `GET /api/sessions`, etc. work end-to-end |
| SSE event stream connects | B | Browser-equivalent client receives `server.connected` |
| SSE event stream receives session events | B | Creating a session via API emits an SSE event |
| WS connection upgrades on event stream path | B | WS handshake succeeds, frames flow |
| **Liveness: OpenCode crash mid-stream emits `data_stalled`** | **A** | Kill OC, observe `data_stalled` frame within 20s |
| **Liveness: OpenCode restart emits `data_resumed` with `lastEventId`** | **A** | Restart OC, observe `data_resumed`, browser reconnects with `lastEventId` |
| **Liveness: events resume after `data_resumed`** | **A** | No events missed; replay works |
| Sync state matches OpenCode state after clean flow | A | Send message via API, observe shadow state, query OpenCode directly, compare |
| Undo via SDK call (`session.chat.undo()`) | A | OpenCode mutates, OC observes via SSE, shadow updates |
| Redo via SDK call (`session.chat.redo()`) | A | Restores undone state |

The three **liveness** tests are the highest-value Tier 1 tests because they regression-protect the bug we just shipped.

### 1.8 Tier 2: `@slow` integration tests

These require model completion, deep I/O, or large state. Marked `@slow`. Default-off CI.

#### 1.8.1 Live query flow

| Test | What it verifies |
|---|---|
| Live prompt streams model response `@slow` | `message.part.delta` events arrive; tokens accumulate |
| Live prompt completes `@slow` | Final message state matches OpenCode |
| Live prompt aborts cleanly `@slow` | Abort signal cancels the request; OpenCode marks session idle |
| Multi-message conversation `@slow` | Sequential prompts produce correct message sequence |
| Long conversation (50+ messages) `@slow` | Performance stays acceptable; no memory growth |

#### 1.8.2 Existing session resume

| Test | What it verifies |
|---|---|
| Resume session across OC web server restarts `@slow` | Session ID + messages survive; `lastEventId` replay works |
| Resume session across OpenCode restarts `@slow` | OpenCode's session storage is the source of truth; OC reflects it |

#### 1.8.3 Undo/redo races

| Test | What it verifies |
|---|---|
| Send → undo mid-stream `@slow` | Undo races with the in-flight response; final state is consistent |
| Send → undo during reconnect `@slow` | Undo races with the reconnect path; final state is consistent |
| Send, OpenCode crashes, restart, undo `@slow` | Crash recovery + undo compose cleanly |
| Multiple undos in quick succession `@slow` | Rate-limit or event-ordering bugs surface |
| Undo of already-undone `@slow` | Idempotency: second undo is a no-op, no error |
| Undo with permissions/pending questions `@slow` | Blocked states reject undo appropriately |

#### 1.8.4 MCP integration

| Test | What it verifies |
|---|---|
| MCP server configure via API `@slow` | Server is registered; `mcp` list endpoint reflects it |
| MCP server tools appear in available tools `@slow` | Tool listing includes the configured MCP tools |
| MCP tool invoke via SDK `@slow` | Tool call returns expected result; events flow |

#### 1.8.5 Config persistence

| Test | What it verifies |
|---|---|
| Set config via API, restart OC, verify persisted `@slow` | Config survives restart; no data loss |
| Provider config (custom API key) `@slow` | Custom provider is usable after restart |
| Agent config (selected agent per directory) `@slow` | Per-directory agent selection persists |

#### 1.8.6 Context loading

| Test | What it verifies |
|---|---|
| File attachment in prompt `@slow` | File content reaches the model; OpenCode returns contextual response |
| Multi-file context `@slow` | Multiple files concatenate correctly |
| Project-level context `@slow` | Project root is detected; relevant files are included |

### 1.9 Model strategy

- **Default model for `@slow` tests:** Configurable via env var (e.g., `TEST_MODEL`). Suggested default: a free model like deepseek-flash (user-confirmed).
- **Tests that need model completion:** `@slow`. Skip in default CI.
- **Tests that don't need model completion:** Tier 1. They drive OpenCode to a specific state (session created, message sent, etc.) and abort before the model responds.
- **Tests never hardcode model providers.** They request a model by ID via env var. If the configured model is unavailable, tests fail with a clear message.

### 1.10 CI strategy

| Lane | Trigger | What runs | Duration target |
|---|---|---|---|
| Default | Push, PR | All Tier 1 tests across both surfaces | <30s |
| Nightly | Cron | All Tier 1 + Tier 2 (`@slow` enabled) | <10min |
| Manual | Workflow dispatch | Same as nightly, with extra logging | <10min |

**Local dev:**

```bash
# Fast lane
bun test

# Full lane
RUN_SLOW_TESTS=1 bun test
```

**Required CI environment:**

- `opencode` binary on PATH (or `OPENCODE_BINARY` set)
- For nightly: `TEST_MODEL` configured to a free model

### 1.11 Test data management

- **Default:** Each test creates a fresh session (Tier 1) or uses a fixture session ID (Tier 2 "existing sessions").
- **Cleanup:** Mode A — process teardown handles it. Mode B — explicit `afterEach` cleanup deletes created sessions.
- **Port allocation:** Helpers provide a `getFreePort()` that uses `net.createServer` to find an unused port. No hardcoded ports.
- **Temp directories:** Each suite gets a `tmpdir()` for any per-test files. Cleaned in `afterAll`.

### 1.12 Failure modes & debugging

| Failure | Behavior |
|---|---|
| `opencode` binary missing on PATH | Skip entire run with `console.error` + non-zero exit. CI fails clearly. |
| OpenCode binary fails to start | Test fails with captured stderr in test output. |
| Test timeout | Capture process logs (OC stdout/stderr) and attach to test output. |
| Persistent flake | Move to `@slow` or quarantine file. Tracked in CI history. |
| Liveness test flake | Investigate timing constants (15s data, 5s server stall) before marking flaky. |

### 1.13 First integration slice (Plan 1)

**Scope:** Build the harness + a focused subset that proves the loop closes.

**Tasks:**

1. `tests/package.json` + `vitest.config.ts` + `tsconfig.json` + `README.md`
2. `tests/helpers/ports.ts` — port allocation
3. `tests/helpers/opencode-process.ts` — spawn + manage OpenCode binary
4. `tests/helpers/openchamber-process.ts` — spawn + manage OC web server
5. `tests/helpers/cleanup.ts` — teardown helpers
6. `tests/helpers/env.ts` — env var resolution
7. `tests/helpers/vitest.ts` — `slowTest` export, Mode A/B fixtures
8. `tests/opencode/binary-resolution.test.ts` — Tier 1 binary tests
9. `tests/opencode/sdk-connection.test.ts` — Tier 1 SDK tests
10. `tests/opencode/session-crud.test.ts` — Tier 1 session tests
11. `tests/web/connection-lifecycle.test.ts` — Tier 1 OC web server tests
12. `tests/web/liveness-fix.test.ts` — Tier 1 liveness regression test (the highest-value test)

**Exit criteria:** All 12 tasks done. `bun test` (fast lane) runs <30s locally. Liveness test reliably catches `data_stalled`/`data_resumed` against a real OC.

### 1.14 Subsequent integration plans

| Plan | Surface | Scope |
|---|---|---|
| 2 | opencode | Multi-directory routing, archive flows, edge cases |
| 3 | web | Full Tier 1 web tests (CRUD via API, SSE basics, WS upgrades) |
| 4 | web | Tier 2 live query tests (`@slow`) |
| 5 | web | Tier 2 undo/redo race tests (`@slow`) |
| 6 | web | Tier 2 MCP, config, context tests (`@slow`) |
| 7 | web | Tier 2 existing session resume tests (`@slow`) |

---

## Part 2: React + DOM Tests (component tests)

### 2.1 Goals

- Test React components in a real DOM (not pure rendering)
- Cover the gap between machine/state tests and the user-facing surface
- Provide regression protection for the perf-critical hot path (chat rendering, message deltas)
- Enable tests that need `useEffect`, `useLayoutEffect`, `useState` lifecycle, refs, etc.

### 2.2 Non-Goals

- **No end-to-end browser testing.** Playwright is a separate concern, deferred (§6).
- **No visual regression testing.** Out of scope.
- **No "test every component."** Focus on the hot path and the highest-leverage surfaces (chat, sync-driven UI).

### 2.3 Setup

**Framework:** `vitest` + `happy-dom` + `@testing-library/react`.

**Why happy-dom over jsdom:**

- ~5MB vs ~30MB
- Faster startup
- Sufficient for our needs (we don't need full browser quirks; we need React lifecycle)

**Why `@testing-library/react`:**

- Industry standard
- Encourages user-centric queries (`getByRole`, `getByText`) over implementation details
- Plays well with React's act() and Suspense

**Setup file** (`tests/react/setup.ts`):

```ts
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup(); // unmount all components between tests
});
```

**Vitest config** (`vitest.config.ts`):

```ts
export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./react/setup.ts"],
    // slow annotation handling as in §1.6
  },
});
```

### 2.4 Existing test patterns to extend

Today, the closest thing to a React test is the `installDomStubs()` helper in `event-pipeline.test.js`, which sets minimal DOM globals. We're replacing this with a real DOM via happy-dom for any test that needs it.

Tests that already have DOM stubs and would benefit from happy-dom:

- `packages/ui/src/sync/__tests__/event-pipeline.test.js` — happy-dom would let us test against a real `EventSource` polyfill
- `packages/session-state/src/machine/*.test.tsx` — already have `.tsx`; could move to happy-dom for richer interactions

### 2.5 Test scenarios

#### 2.5.1 Render fanout guard (Phase 3.3 missing piece)

**The test that was skipped in Phase 3.3.** The plan called for it, we couldn't write it without RTL, so we deferred.

```ts
test("rendering 1800 messages renders only the new message on delta", async () => {
  // Render SessionMount with 1800 messages
  // Use React Profiler to count commits per component
  // Send one new message via state
  // Assert: only the new message's component re-rendered, not the 1800 others
});
```

This is THE test. It validates the perf claim that motivated Phase 3.3.

#### 2.5.2 SessionMount end-to-end

| Test | What it verifies |
|---|---|
| Renders empty state | No session, no crash, shows "new chat" prompt |
| Renders existing session | Messages, status, composer all appear |
| Switches sessions | Old session unmounts, new session mounts cleanly |
| Handles session list update | New sessions in the list appear without full re-render |
| Streams a new message | `message.part.delta` updates the same DOM node; no flicker |
| Marks session busy/idle | Status chip updates correctly |
| Shows queued messages | Queued prompts appear above the active one |
| Handles scroll preservation | Scroll position maintained when prepending history |
| Handles viewport anchor | Restoring scroll on session switch |

#### 2.5.3 useChatSessionData end-to-end

| Test | What it verifies |
|---|---|
| Sources from machine hooks | Component subscribes to machine, not stores |
| Renders messages from machine | First paint shows machine state, not stale store state |
| Renders streaming message | Streaming message ID is shown as in-progress |
| Renders retry state | Retry overlay appears when retry is active |
| Renders history meta | `LOAD_OLDER_*` machine states surface as UI affordances |

#### 2.5.4 Composer

| Test | What it verifies |
|---|---|
| Draft persistence | Text persists across component unmount/remount |
| Submit clears input | After send, input is empty |
| Submit queues if busy | If session is busy, prompt is queued, not sent |
| Multiline input | Shift+Enter creates newline; Enter submits |
| Attachment handling | Attached files appear in input; sending includes them |
| Slash command autocomplete | `/undo`, `/redo`, etc. show autocomplete menu |

#### 2.5.5 Status / liveness UI (when added)

The liveness fix added data flow to the wire protocol but no UI feedback. When UI feedback lands, test it:

| Test | What it verifies |
|---|---|
| Shows "reconnecting" on `data_stalled` | Status chip updates to reconnecting state |
| Clears on `data_resumed` | Status returns to normal |
| Shows "disconnected" on socket timeout | Different from data-stalled; user can distinguish |

(Defer until UI feedback lands; these tests are placeholders for the future.)

#### 2.5.6 Sidebar / session list

| Test | What it verifies |
|---|---|
| Renders session list | All sessions in the active directory appear |
| Multi-select | Selection state works; bulk actions are available |
| Folder navigation | Clicking a folder navigates; breadcrumb appears |
| Search filters sessions | Query filters the list correctly |
| Empty state | "No sessions yet" appears for empty directories |

#### 2.5.7 Settings

| Test | What it verifies |
|---|---|
| Renders settings pages | Each page mounts without error |
| Settings changes persist | Toggle a setting, unmount, remount, value is preserved |
| Settings validation | Invalid input is rejected with an error message |

### 2.6 First React slice (Plan 8)

**Scope:** Build the React test setup + render fanout guard test (the highest-value test).

**Tasks:**

1. Add `happy-dom`, `@testing-library/react`, `@testing-library/dom` to root `package.json` (or `tests/package.json` if we keep tests isolated)
2. Create `tests/react/setup.ts` — happy-dom setup, RTL cleanup
3. Create `tests/react/vitest.config.ts` — separate vitest config for the React surface (different environment from opencode/web)
4. Create `tests/react/helpers/render.tsx` — `renderWithProviders` helper that wires up the minimum context (XState machine provider, theme, etc.)
5. Create `tests/react/render-fanout.test.tsx` — THE render fanout test
6. Wire `tests/react/vitest.config.ts` into root `package.json` test script

**Exit criteria:** Render fanout test passes. Setup is reusable for subsequent React tests.

### 2.7 Subsequent React plans

| Plan | Scope |
|---|---|
| 9 | `SessionMount` end-to-end tests |
| 10 | `useChatSessionData` end-to-end tests |
| 11 | Composer tests |
| 12 | Sidebar / session list tests |
| 13 | Settings tests |
| 14 | Liveness UI tests (when UI lands) |

---

## Part 3: Performance Benchmarks

### 3.1 Goals

- Provide a regression net for the perf-critical hot path (message rendering, sync layer)
- Establish baseline numbers that we can compare future changes against
- Catch perf regressions in CI before they ship

### 3.2 Non-Goals

- **Not a full benchmark suite.** A small focused set, not exhaustive.
- **Not for tracking model latency.** That's `@slow` test territory.
- **Not for sub-millisecond optimization.** Focus on user-visible perf.

### 3.3 Setup

**Approach:** Extend the existing `1800-delta` synthetic test pattern into a small vitest bench suite.

**Where:** `tests/perf/` — new surface, runs separately from opencode/web/react.

**Tooling:** vitest's built-in `bench` mode (`vitest bench`).

### 3.4 Test scenarios

| Test | What it measures | Baseline |
|---|---|---|
| `chat-load-1800` | Time to render 1800 messages from cold state | TBD (establish first) |
| `chat-load-1800-warm` | Time to render 1800 messages when machine is warm | TBD |
| `message-delta-single` | Time to apply one `message.part.delta` event | TBD |
| `message-delta-burst-50` | Time to apply 50 `message.part.delta` events | TBD |
| `reconnect-storm` | Time to recover from a forced disconnect with 1800 buffered events | TBD |
| `multi-directory-switch` | Time to switch between 3 directories with 100+ sessions each | TBD |
| `session-list-1000` | Time to render session sidebar with 1000 sessions | TBD |

### 3.5 CI strategy

- **Benchmarks don't run in default CI.** They're slow and noisy.
- **Benchmarks run on every PR to a `perf-snapshot.json` file.** Diff is shown in PR comments.
- **Manual trigger:** `bun run bench` for full benchmark run with console output.
- **Threshold:** Initial baseline is "whatever we measure today." Future PRs that increase by >10% require a perf-aware reviewer to sign off.

### 3.6 First perf slice (Plan 15)

**Scope:** Build the perf suite infrastructure + the `chat-load-1800` test as the first benchmark.

**Tasks:**

1. Create `tests/perf/vitest.config.ts` — bench mode config
2. Create `tests/perf/helpers/chat-fixture.ts` — generate 1800-message fixture
3. Create `tests/perf/chat-load-1800.bench.ts` — first benchmark
4. Run locally, capture baseline, commit `perf-snapshot.json`
5. Add `bun run bench` script to root `package.json`

**Exit criteria:** Benchmark runs locally. Baseline captured. CI integration deferred until pattern is proven.

### 3.7 Subsequent perf plans

| Plan | Scope |
|---|---|
| 16 | `message-delta-single` + `message-delta-burst-50` |
| 17 | `reconnect-storm` (uses Mode A harness from Part 1) |
| 18 | `multi-directory-switch` + `session-list-1000` |

---

## Part 4: Cross-cutting concerns

### 4.1 Package layout decision

Three options:

- **A. Single top-level `tests/` package** with sub-entries per surface
- **B. Multi-package monorepo** (`tests-opencode`, `tests-web`, `tests-react`, `tests-perf`)
- **C. One package per surface, all under `tests/`**

**Decision: A.** Single top-level `tests/` package with surface subdirectories. Vitest can run specific surfaces via `vitest --project opencode` etc. Avoids workspace churn, keeps helpers shared, easy to add surfaces.

### 4.2 Test commands

Root `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:opencode": "vitest run --project opencode",
    "test:web": "vitest run --project web",
    "test:react": "vitest run --project react",
    "test:perf": "vitest bench",
    "test:watch": "vitest",
    "test:slow": "RUN_SLOW_TESTS=1 vitest run"
  }
}
```

### 4.3 Dependencies (added in plan 1)

**Production (zero):** None. Tests are dev-only.

**Dev:**

- `vitest` (already a dev dep at root)
- `happy-dom`
- `@testing-library/react`
- `@testing-library/dom`
- `@types/node` (for process, fs in helpers)
- `@opencode-ai/sdk` (for direct SDK usage in `tests/opencode/`)

### 4.4 Out of scope (deferred)

- **Playwright E2E tests** — separate spec when needed
- **Electron integration tests** — `tests/electron/` future
- **VS Code extension tests** — `tests/vscode/` future
- **Visual regression tests** — likely never needed
- **Cross-version OpenCode matrix** — not needed; `opencode` on PATH
- **Cross-platform CI matrix** — initial Linux/macOS only; Windows when it becomes a priority

### 4.5 Open questions

These are deferred to the planning phase, not blocking the spec:

- **Q1:** Should `tests/` be a workspace member in the root `package.json` workspaces, or a standalone package? (Leaning: standalone, with its own lockfile.)
- **Q2:** Should `@slow` tests share a single `RUN_SLOW_TESTS` flag, or have per-test annotations? (Leaning: single flag for simplicity.)
- **Q3:** Should the perf suite be vitest bench or a separate tool like `tinybench`? (Leaning: vitest bench — already in the toolchain.)

---

## Part 5: Plan roadmap

A total of 15 plans emerge from this spec, in dependency order:

| # | Plan | Surface | Tier | Scope |
|---|---|---|---|---|
| 1 | Integration harness + first tests | opencode + web | 1 | §1.13 |
| 2 | OpenCode multi-directory + archive | opencode | 1 | §1.7.1 |
| 3 | Web full Tier 1 | web | 1 | §1.7.2 |
| 4 | Web live query `@slow` | web | 2 | §1.8.1 |
| 5 | Web undo/redo races `@slow` | web | 2 | §1.8.3 |
| 6 | Web MCP + config + context `@slow` | web | 2 | §1.8.4–1.8.6 |
| 7 | Web existing session resume `@slow` | web | 2 | §1.8.2 |
| 8 | React setup + render fanout | react | 1 | §2.6 |
| 9 | SessionMount end-to-end | react | 1 | §2.5.2 |
| 10 | useChatSessionData end-to-end | react | 1 | §2.5.3 |
| 11 | Composer tests | react | 1 | §2.5.4 |
| 12 | Sidebar / session list tests | react | 1 | §2.5.6 |
| 13 | Settings tests | react | 1 | §2.5.7 |
| 14 | Liveness UI tests (when UI lands) | react | 1 | §2.5.5 |
| 15 | Perf suite + first benchmark | perf | 1 | §3.6 |

Each plan is a separate, shippable unit. Plan 1 unblocks everything else. Plans 2–7 can run in any order after 1. Plans 8–14 can run in any order after 8. Plan 15 is independent.

**Total estimated effort:** 6–8 weeks of focused work across all plans.

**Slice 1 (Plan 1) is the most important.** It builds the harness and proves the loop closes. All subsequent plans are incremental.

---

## Part 6: References

### 6.1 Existing files referenced

- `packages/web/server/src/domains/opencode/lifecycle.ts:237` — OpenCode spawn command
- `packages/web/server/src/domains/opencode-support/env-runtime.ts:351` — binary resolution order
- `packages/web/server/src/index.ts:260` — `OPENCODE_SKIP_START` integration hook
- `packages/web/server/bin/cli.js:870` — `--opencode-skip-start` CLI flag
- `packages/web/server/src/domains/opencode-support/env-config.ts:23` — `OPENCODE_HOST` URL validation
- `packages/ui/src/sync/__tests__/event-pipeline.test.js:25-55` — `FakeWebSocket` pattern (reusable for tests)
- `packages/session-state/src/machine/chatMessagesMachine.test.tsx:687` — 1800-delta synthetic test pattern
- `packages/ui/src/sync/liveness.ts` — dual-timer monitor shipped with the liveness fix

### 6.2 Related specs

- `.superpawers/specs/2026-06-24-streaming-liveness-fix-design.md` — the liveness fix this spec regression-protects
- `.superpawers/OVERVIEW.md` — overall rework tracking (will reference this spec)
- `.superpawers/plans/2026-05-29-phase-3-3-hot-path-message-migration.md` — Phase 3.3 plan that explicitly skipped the render fanout test (now in §2.5.1)
