# OpenChamber Test Strategy — Handoff Spec

**Date:** 2026-06-25
**Status:** Slice 1 shipped, Slice 2+ planned
**Branch state:** `main` at `bcdc65c1`, 247 ahead of `origin/main`, only `main` local

---

## Where we are

Three big pieces of rework landed in this session, in order:

1. **Phase 4 dead-field audit** — removed 27 dead symbols across 6 stores (`useUIStore`, `useSessionUIStore`, `useGlobalSyncStore`, `useGitStore`, `useGitHubPrStatusStore`, `SessionMemoryState`). Plus 2 follow-up commits for persist migration + signal hint param. **Shipped.**

2. **Streaming liveness fix** — fixed the heartbeat livelock bug (frozen-chat). Wired existing 20s `onStall`/`onResume` callbacks through the hub to emit `data_stalled`/`data_resumed` WS frames. Removed masking `openchamber:heartbeat` data frames. Added browser dual-timer liveness monitor (data 15s / socket 30s). **Shipped** via `21222216`.

3. **Integration test strategy** — wrote a multi-plan spec for real OpenCode + real OpenChamber integration tests, plus React/DOM tests, plus performance benchmarks. Implemented Slice 1. **Shipped** via `bcdc65c1`.

What landed in Slice 1:
- `tests/` private workspace (top-level, outside `packages/*`)
- vitest runner, 60s timeouts, `pool: "forks"`, `isolate: true`, `fileParallelism: false`
- Helper layer: `ports`, `logs`, `cleanup`, `env`, `opencode-process`, `openchamber-process`, `vitest`
- Tier 1 opencode tests: binary resolution (6), SDK connect (2), session CRUD (1)
- Tier 1 web tests: external-opencode smoke, streaming liveness regression
- `@openchamber/web` dynamically imported (env vars read at module load)
- 11 tests pass, 1 documented skip (controllable upstream-silence fixture)
- 28s runtime, no orphan processes

---

## What's planned next (from the spec)

The spec at `.superpawers/specs/2026-06-25-test-strategy-design.md` lays out 15 plans across three parts. **Slice 1 (Plan 1) is done.**

### Part 1 — Integration tests (Plans 2–7)
- **Plan 2:** OpenCode Tier 1 expansion — multi-directory, archive, error paths
- **Plan 3:** Web Tier 1 expansion — SSE event delivery, WS upgrade auth, recovery on upstream reconnect
- **Plan 4:** Sync layer state vs OpenCode state comparison (the "shadow" desync problem)
- **Plan 5:** Undo/redo races against stream + reconnect
- **Plan 6:** Existing session resume across OpenChamber restart
- **Plan 7:** MCP configure + tool invoke, config persistence, context loading

### Part 2 — React + DOM tests (Plans 8–14)
- **Plan 8:** `tests/react/` setup — happy-dom + `@testing-library/react` + `renderWithProviders` + the render-fanout guard test (the one Phase 3.3 skipped because RTL wasn't installed)
- **Plan 9:** `SessionMount` end-to-end via real React lifecycle
- **Plan 10:** `useChatSessionData` end-to-end
- **Plan 11:** Composer (input + selection + history) components
- **Plan 12:** Liveness UI (status chip when stalled) — this becomes possible once Slice 1 liveness is in
- **Plan 13:** Sidebar + session list
- **Plan 14:** Settings persistence components

### Part 3 — Performance benchmarks (Plan 15)
- **Plan 15:** vitest bench suite in `tests/perf/` — `chat-load-1800`, warm load, single delta, burst 50, reconnect storm, multi-directory switch, session list 1000

The full plan roadmap is in `.superpawers/specs/2026-06-25-test-strategy-design.md` Part 5.

---

## Open questions deferred during spec drafting

These are tracked in the spec but unresolved. Decision before/during implementation:

1. **Should `tests/` be a workspace or standalone package?** Currently a root workspace member (lockfile hygiene). Spec says "single top-level `tests/` package, outside `packages/*`" — current state matches.
2. **`@slow` split strategy.** Currently one boolean `RUN_SLOW_TESTS=1`. Should it later split into tags (network/model/etc)? Spec says no for now.
3. **Vitest bench vs tinybench for Part 3.** Currently vitest bench. Spec says yes for now.
4. **CI integration.** Root `type-check` and `lint` have pre-existing errors in `@openchamber/ui`. Integration tests have not been wired into root CI yet. Decide: ship CI wiring in a follow-up PR? Block on fixing the ui errors first?

---

## Things to be aware of when picking up

1. **`@openchamber/web` dist must be built** before web tests can run:
   ```
   bun run --cwd packages/web build:server
   ```
   Otherwise the dynamic import fails with module-not-found. CI should run this before `bun run --cwd tests test:web`. Documented in `tests/README.md`.

2. **`fileParallelism: false`** is intentional. Both web tests spawn their own OpenCode + OpenChamber. Parallelism caused resource contention. Don't re-enable without solving that first.

3. **Three concerns flagged by Slice 1 implementers that are NOT blockers but should be tracked:**
   - Intermittent `beforeAll` timeout in `session-crud.test.ts` when running with other files (works individually). TOCTOU port race suspected.
   - Orphaned `opencode` processes sometimes survive vitest exit (vitest fork pool SIGKILLs workers before exit handlers fire). The pre-existing PID 466895 is not from our tests.
   - `data_stalled` / `data_resumed` frames are not observable under normal conditions — killing OpenCode drops TCP before the 20s stall timer fires, producing `stream_error` instead. Real stall assertion requires a controllable upstream-silence fixture (OpenCode plugin or model-hold). Stronger assertion currently skipped with documentation.

4. **The `__slowTest` helper** lives in `tests/helpers/vitest.ts`. Use `slowTest` for Tier 2 tests (live prompts, slow models). Default is `test`; with `RUN_SLOW_TESTS=1` it becomes a real test.

5. **Vitest config sets static `OPENCODE_SKIP_START=true` and `OPENCHAMBER_SKIP_OPENCODE_START=true`** at the config level. `OPENCODE_HOST` is set per-test in the OpenChamber helper immediately before the dynamic `@openchamber/web` import. Don't add static `@openchamber/web` imports anywhere in `tests/` — they cache the module before env vars are set.

6. **The liveness test currently asserts:**
   - Global WS connects and receives `ready`
   - No WS `event` frame with `payload.type === "openchamber:heartbeat"` is emitted for 20s
   - OpenCode restart does not crash OpenChamber
   - Any `data_stalled` / `data_resumed` frames observed have the expected shape
   - Stronger `data_stalled` on kill is statically skipped with a clear reason

7. **Spec coverage gap:** Common install path parity for binary resolution (`~/.opencode/bin/opencode`, etc.) is deferred from Slice 1. Test harness only exercises env-var precedence. Production resolver lives in `packages/web/server/src/domains/opencode-support/env-runtime.ts:351` and is tested indirectly via Slice 1's `web/connection-lifecycle.test.ts` (which actually spawns and uses the resolver).

---

## Active state on main

```
main  bcdc65c1 [ahead 247]
       (Merge branch 'feature/integration-tests-spec')
```

Only branch is `main`. No uncommitted changes. No orphan test processes (PID 466895 is pre-existing).

### Root scripts added (from Slice 1)
```
test:integration     # all opencode + web tests
test:opencode        # opencode surface only
test:web             # web surface only
test:react           # placeholder for Plan 8
test:perf            # placeholder for Plan 15
test:integration:slow # with RUN_SLOW_TESTS=1
```

Plus `tests/package.json` scripts:
```
test                 # vitest run
test:integration     # vitest run opencode web
test:opencode        # vitest run opencode
test:web             # vitest run web
test:react           # placeholder
bench                # placeholder
type-check           # tsc --noEmit
```

---

## Recommended next slice

**Plan 2 — OpenCode Tier 1 expansion.** Smallest next step, stays in Tier 1 (no model calls), builds directly on Slice 1's opencode surface. Adds:
- Multi-directory session routing (different `cwd` per test, verify isolation)
- Session archive + restore
- Bad-input error paths (invalid sessionID, missing directory, etc.)
- Concurrent session operations

After Plan 2, **Plan 8 (React setup)** is a natural follow-up because it's foundational for Plans 9-14. Either order works.

For someone picking up: start with Plan 2 unless there's a specific reason to jump to Part 2 (React) first.

---

## Reference paths

- Spec: `.superpawers/specs/2026-06-25-test-strategy-design.md` (682 lines, multi-plan source of truth)
- Slice 1 plan: `.superpawers/plans/2026-06-25-test-strategy-slice-1.md` (959 lines, implementation-ready, reviewer-approved)
- Slice 1 README: `tests/README.md` (build prereqs, commands, instance modes)
- OVERVIEW: `.superpawers/OVERVIEW.md` (status snapshot + checklists)
- Helpers: `tests/helpers/*.ts`
- Tests: `tests/opencode/*.test.ts`, `tests/web/*.test.ts`
- Pre-existing liveness fix: merged via `21222216`, branch deleted
- Pre-existing Phase 4 cleanup: merged via `2109c6d6` and earlier, branches deleted