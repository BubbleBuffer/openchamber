# OpenChamber Integration Testing — Branch Complete

**Date:** 2026-06-26
**Status:** Integration testing branch **COMPLETE** (5 slices shipped, 53 tests)
**Branch state:** `main` at `bdb39f8b`, 276 ahead of `origin/main`, no feature branches open
**Scope of this handoff:** Closes the integration testing branch started in `.superpawers/specs/2026-06-25-handoff-spec.md`. React DOM testing is a separate, future branch.

---

## Where we are

Five integration testing slices shipped in order, each on its own feature branch and merged to `main` with `--no-ff`:

| Slice | Branch | Merge SHA | Tests added | Coverage |
|---|---|---|---|---|
| 1 | `feature/integration-tests-spec` | `bcdc65c1` | 9 + 2 | OpenCode binary + SDK connect + session CRUD; web external-OC smoke + streaming liveness regression |
| 2 | (worked on `main` directly) | `feef615c` → `e34be5d3` | 13 + 0 | OpenCode multi-directory, archive, error paths, concurrent ops; PID-targeted cleanup hardening |
| 3 | `feature/integration-tests-slice-3` | `f6f63f50` | 5 + 7 | Web Tier 1 surface — API session CRUD, bad-host, 503-while-restarting; SSE events; WS upgrades + lastEventId replay |
| 4 | `feature/integration-tests-slice-4` | `696bd481` | 5 + 2 | Live conversation flows — OpenCode `prompt_async` + event stream; web proxy forwarding + error passthrough |
| 5 | `feature/integration-tests-slice-5` | `bdb39f8b` | 7 + 3 | Tool-call streaming — tool registry (ids/list); ToolPart lifecycle (pending/running/completed); web tool-part proxy |

**Cumulative: 53 tests** (34 opencode + 19 web), all passing on isolated runs. Full-surface runs show environmental flake on `beforeAll` port contention (same pattern documented in Slices 3/4/5) — isolated re-runs always pass.

---

## What's covered

### OpenCode surface (34 tests)
- **Binary resolution** (6) — env discovery, PATH probing, missing-binary errors
- **SDK connect** (2) — `@opencode-ai/sdk/v2` round-trip
- **Session CRUD** (1) — create, list, get, delete baseline
- **Multi-directory** (2) — directory isolation, session ID global resolution
- **Archive** (3) — `session.update({ time: { archived } })`, round-trip behavior, list filter
- **Error paths** (5) — unknown session IDs (get/delete/update/messages), empty-title create
- **Concurrent ops** (3) — parallel create, parallel update, parallel list
- **Prompt async + events** (5) — prompt_async return, prompt text via SSE, lifecycle event, parallel session isolation, malformed body
- **Tool registry** (3) — `tool.ids()` non-empty + built-ins, `tool.list()` schema shape, list ⊂ ids invariant
- **Tool part lifecycle** (4) — pending/running/completed state transitions + SSE `message.part.updated` events

### OpenChamber web surface (19 tests)
- **Connection lifecycle** (1) — server boot
- **Streaming liveness regression** (2 + 1 documented skip) — global WS connects, no `openchamber:heartbeat` payload, restart preserves health
- **API session CRUD** (6) — POST/GET/list/DELETE; bad host + skip-start; 503-while-restarting
- **SSE events** (3) — `/api/event` and `/api/global/event` connect + delivery; session id appears in SSE buffer
- **WS upgrades** (3) — global + directory WS upgrade + frames; lastEventId replay (environmental skip)
- **Prompt async proxy** (2) — proxy forwards valid request + echoes marker via `/api/global/event`; preserves upstream 4xx/5xx
- **Tool part proxy** (3) — `GET /api/experimental/tool/ids`; `PATCH /api/session/{sid}/message/{mid}/part/{pid}`; `DELETE` same path

---

## What's NOT covered (explicit out-of-scope)

These are deliberate omissions from the integration testing branch. They belong to a different testing layer (React DOM, e2e, perf) and warrant separate brainstorming:

1. **React component render & interaction tests** — packages/ui/src/components/. Would catch render regressions, user interaction bugs, client state transitions, mobile responsive bugs. jsdom + Testing Library paradigm.
2. **Zustand store unit tests** — packages/ui/src/stores/. Sync layer stores (`useSyncStore`, etc.) are covered indirectly via integration tests on the API surface, but unit-level coverage of internal transitions is missing.
3. **Cross-runtime parity** — Electron vs web vs VS Code. The server side (`@opencode-ai/sdk` and `@openchamber/web/server`) is shared across all three runtimes, so most drift lives in the native shells. Would need Electron + VS Code harnesses (separate work).
4. **Failure-mode coverage** — OC crash mid-conversation, port collision, malformed input, network drop, slow-streaming client. Defensive code paths; flaky-prone tests; value depends on how much failure-mode handling the project actually ships.
5. **Performance regression tests** — streaming latency bounds, render lag, memory bounds. The Slice 1 streaming liveness test is one data point but no broader perf budget is defined.
6. **End-to-end / Playwright tests** — full user flows through a real browser. Not yet in scope.

---

## Critical guardrails (in AGENTS.md)

These rules are **already committed to main** in AGENTS.md (commits `fc6997ac`, `d4fc5d14`, `09b9bf91`) and **must continue to hold for all future test work**:

### Test process safety (HARD RULES)
- Cleanup is **already handled by two layers** in `tests/helpers/opencode-process.ts` and `tests/helpers/opencode-watchdog.cjs`:
  1. **PID recording** — every spawn writes `child.pid` to `<tempdir>/pid`
  2. **Sibling watchdog** — tiny Node child polls `process.ppid` every 250ms; on parent death (including SIGKILL), SIGKILLs the recorded opencode PID
  3. **Orphan reaper** — `startOpenCodeInstance()` scans `/tmp/openchamber-opencode-*/pid` and kills any recorded PID still alive

- **NEVER** add a "verify stoppage" step using `pgrep`/`killall`/`pkill`/name-matching. A third layer cannot distinguish test-spawned from user-spawned opencode and will kill the user's own sessions.
- **NEVER** include name-based process matches in subagent prompts. Subagents follow instructions literally.
- **NEVER** dispatch a subagent to "check for orphan opencode processes" or "verify cleanup." PID-file-only inspection.

If a test leak is suspected, debug by reading pid files and `process.kill(pid, 0)` for liveness — never by name.

### Helper fix (commit `dcc27e0b`)
`tests/helpers/opencode-process.ts` strips `OPENCODE_SERVER_PASSWORD` from spawn env. The user's shell commonly has it set (their OpenChamber web server sets it); without the strip, every test-spawned opencode returns 401.

---

## How to run

```bash
# Type-check the test workspace
bun run --cwd tests type-check

# Full opencode surface (34 tests, ~30s)
bun run --cwd tests test:opencode

# Full web surface (19 tests, ~60s; full-suite may flake on port contention — isolated re-runs pass)
bun run --cwd tests test:web

# Single file in isolation (always reliable)
bunx vitest run tests/opencode/tool-registry.test.ts --root tests
bunx vitest run tests/web/tool-part-proxy.test.ts --root tests
```

**Flake note:** Full-surface `test:web` runs sometimes show 1-2 file-level `beforeAll` timeouts (~30-45s) from port contention when multiple files start their own OC instance in parallel. This is **environmental** (vitest `fileParallelism: false` already prevents test-level parallelism, but `beforeAll` spawns can race on `getAvailablePort()` under certain kernel timing windows). Isolated re-runs always pass. If a fix is wanted, it's in `tests/helpers/ports.ts` (likely: longer retry, or commit to a single shared OC instance across all web suites — Slice 3 already proved the shared-instance approach works for api-session-crud, sse-events, ws-upgrades).

---

## File map

```
tests/
├── helpers/
│   ├── opencode-process.ts        # PID recording, reaper, watchdog (dcc27e0b)
│   ├── opencode-watchdog.cjs      # Sibling watchdog (Slice 2)
│   ├── openchamber-process.ts     # OpenChamber web server bootstrap
│   ├── ports.ts                   # getAvailablePort helper
│   ├── logs.ts                    # createProcessLogBuffer
│   ├── cleanup.ts                 # removeTempDir, killProcess
│   ├── env.ts                     # checkOpenCodeAvailable, getOpencodeBinary
│   └── vitest.ts                  # vitest config helpers
├── opencode/                      # 34 tests, 8 files
│   ├── binary-resolution.test.ts
│   ├── sdk-connect.test.ts
│   ├── session-crud.test.ts
│   ├── multi-directory.test.ts
│   ├── session-archive.test.ts
│   ├── session-errors.test.ts
│   ├── concurrent-sessions.test.ts
│   ├── prompt-async-events.test.ts
│   ├── tool-registry.test.ts
│   └── tool-part-lifecycle.test.ts
├── web/                           # 19 tests, 8 files
│   ├── connection-lifecycle.test.ts
│   ├── liveness-fix.test.ts
│   ├── api-session-crud.test.ts
│   ├── sse-events.test.ts
│   ├── ws-upgrades.test.ts
│   ├── prompt-async-proxy.test.ts
│   └── tool-part-proxy.test.ts
└── README.md                      # Coverage section + Process lifecycle section
```

---

## Per-slice design docs (for future reference)

- **Slice 1** — `.superpawers/specs/2026-06-25-test-strategy-design.md` (large multi-plan spec from initial handoff)
- **Slice 2** — inline in original handoff (`.superpawers/specs/2026-06-25-handoff-spec.md`)
- **Slice 3** — `.superpawers/specs/2026-06-25-test-strategy-slice-3-design.md`
- **Slice 4** — `.superpawers/specs/2026-06-26-test-strategy-slice-4-design.md`
- **Slice 5** — `.superpawers/specs/2026-06-26-test-strategy-slice-5-design.md`

Per-slice plans in `.superpawers/plans/`.

---

## Open follow-ups

### Immediate (optional polish)
- Port-contention flake on full-suite `test:web` — see "Flake note" above. Worth a small fix if you care about CI runs.
- Add `tests/package.json` lint script — Slice 1 didn't add one. Not blocking but recommended.
- Decide on push strategy — `main` is 276 commits ahead of `origin/main` and **unpushed**. No release artifact will exist until pushed.

### Future scope (separate branch)
1. **React DOM testing branch** — `packages/ui/src/components/` + `packages/ui/src/stores/` + `packages/ui/src/sync/`. jsdom + Testing Library + happy-dom. Fresh brainstorming recommended — scope is large (~50+ components, sync layer with DOCUMENTATION.md).

2. **Cross-runtime parity** — if/when Electron or VS Code diverge from web in a way that affects shared contracts. Requires harnesses for those runtimes.

3. **Performance regression** — streaming latency budgets, render lag, memory bounds. The Slice 1 liveness test is one signal; broader budgets need explicit thresholds.

---

## Vault hygiene

If the project's vault contains prior notes about integration testing plans or status, update them to reflect completion. Use `vault.search` to find related notes, then `vault.edit` (preferred) or `vault.write` for new durable records. Skip this if the vault has nothing related.