# Slice 3 — Full Tier 1 Web Surface Tests

**Date:** 2026-06-25
**Branch:** `feature/integration-tests-slice-3`
**Status:** Design — pending user approval
**Spec source:** `.superpawers/specs/2026-06-25-test-strategy-design.md` §1.7.2, §1.14 Plan 3

---

## Context

| Slice | Commits | Opencode tests | Web tests |
|---|---|---|---|
| 1 (shipped) | `bcdc65c1` | 9 | 2 |
| 2 (shipped) | `a5f87bf3` … `e34be5d3` | 13 | 0 |
| **3 (this)** | — | **0** | **12** |

After Slice 2 the opencode surface is 22/22 passing with PID-targeted process cleanup. The web surface is still at 2/2 — only `connection-lifecycle` (boot + `/health`) and `liveness-fix` (global WS upgrade + OpenCode restart resilience) are covered.

The original Tier 1 web test table (§1.7.2) lists 7 rows; Slice 1 covered 2. Slice 3 covers the remaining 5 with two extra hardening rows (bad host rejection, 503 during OpenCode restart).

## Goal

Reach full Tier 1 coverage of the OpenChamber web surface: API session CRUD, SSE event delivery, WS upgrades. Add hardening rows that exercise the proxy's readiness gate and env validation — failure modes Slice 1's boot test cannot reach. 12 new tests total.

## Approach (chosen)

Three test files, three concerns:

```
tests/web/
├── api-session-crud.test.ts     — 6 tests   (CRUD + bad host + 503-while-restarting)
├── sse-events.test.ts           — 3 tests   (SSE connect x2 + event delivery)
└── ws-upgrades.test.ts          — 3 tests   (WS upgrade x2 + lastEventId replay)
```

## Architectural anchors

| Concern | File | Lines |
|---|---|---|
| API session CRUD routes | `packages/web/server/src/domains/server-utils/proxy.ts` | 332-362 (proxy middleware) |
| `/api/global/event` SSE | `packages/web/server/src/domains/server-utils/proxy.ts` | 329 |
| `/api/event` SSE | `packages/web/server/src/domains/server-utils/proxy.ts` | 330 |
| 503-while-restarting gate | `packages/web/server/src/domains/server-utils/proxy.ts` | 238-250 |
| `/api/system/shutdown` | `packages/web/server/src/domains/opencode/routes/core-routes.ts` | 50 |
| WS bridge upgrade handler | `packages/web/server/src/domains/event-stream/runtime.ts` | 140-189 |
| Global WS `ready` frame | `packages/web/server/src/domains/event-stream/global-ws-bridge.ts` | 54-71 |
| `lastEventId` query param | `packages/web/server/src/domains/event-stream/runtime.ts` | 116-117 |
| Auth gate (test mode = off) | `packages/web/server/src/domains/event-stream/runtime.ts` | 150-169 |

In test mode `uiAuthController?.enabled` is false (no `UI_AUTH_*` env vars), so the upgrade handler accepts anonymous connections. The 503 gate is reachable by killing the spawned OpenCode child and hitting any proxied `/api/*` within `OPEN_CODE_READY_GRACE_MS`.

## File 1: `tests/web/api-session-crud.test.ts`

Per-suite Mode A setup. Reuses `startOpenCodeInstance()` and `startOpenChamberAgainstOpenCode()` from `tests/helpers/`. Cleanup uses existing `afterAll` pattern (OpenChamber stop, then OpenCode stop).

| # | Test | Verifies |
|---|---|---|
| 1 | POST `/api/session` creates a session and returns 200 with id/title | Proxy POST → OpenCode SDK create → 200 round-trip |
| 2 | GET `/api/session` lists the created session | Proxy GET list → OpenCode SDK list → array contains id |
| 3 | GET `/api/session/:id` returns the same session | Proxy GET by id → OpenCode SDK get → equivalent object |
| 4 | DELETE `/api/session/:id` removes it | Proxy DELETE → OpenCode SDK delete → subsequent GET returns 404 |
| 5 | Bad `OPENCODE_HOST` is rejected at startup | Env validation throws with a clear message; no zombie server |
| 6 | Proxy returns 503 while OpenCode is restarting | Kill OC child → hit `/api/session` within grace → 503 with `{ restarting: true }`; restart OC → 200 again |

**Note on test 6:** the Slice 1 liveness test exercises the **WS** layer during OpenCode restart; this row exercises the **HTTP proxy** layer — a different code path. Both layers must handle the same outage correctly.

## File 2: `tests/web/sse-events.test.ts`

Per-suite Mode A setup. Same process layout as File 1. SSE is read via `fetch(url, { headers: { Accept: "text/event-stream" } })` then parsed from `response.body` (a `ReadableStream`) chunk-by-chunk. No new npm deps.

| # | Test | Verifies |
|---|---|---|
| 1 | `/api/event` SSE connects and receives OpenCode events | Proxy SSE forward streams initial OpenCode events; `Content-Type: text/event-stream` |
| 2 | `/api/global/event` SSE connects and receives OpenCode events | Same pattern, global path |
| 3 | POST `/api/session` emits a session event through `/api/global/event` | Create a session via API; observe an SSE event referencing it within 5s |

## File 3: `tests/web/ws-upgrades.test.ts`

Per-suite Mode A setup. Uses the `ws` package (already in `tests/package.json`). The Slice 1 liveness test proves the global WS upgrade works; this file extends coverage to:

| # | Test | Verifies |
|---|---|---|
| 1 | `/api/global/event/ws` upgrades, sends `ready` frame, event frames flow | First frame `{ type: "ready", scope: "global" }`; subsequent `event` frames after a session create |
| 2 | `/api/event/ws` with `?directory=<cwd>` upgrades and sends directory-scoped frames | Ready frame + event frames scoped to the requested directory |
| 3 | `/api/global/event/ws?lastEventId=<id>` replays events after that id | Reconnect with the last seen event id; bridge replays missed events in order |

**Note on test 3:** the implementation must read `global-hub.ts` and `global-ws-bridge.ts:41-52` (`replayEvents`) to confirm the exact `lastEventId` format used by OpenCode. If the format differs from a simple monotonic id, the test adapts to encode the actual on-the-wire behavior, following the Slice 2 directive.

## Helpers

No new helpers required. The existing `startOpenCodeInstance` (with PID recording for the 503 test) and `startOpenChamberAgainstOpenCode` are sufficient. Slice 3 uses inline `fetch` + `ReadableStream` parsing for SSE and the `ws` package for WS — both already in `tests/package.json`.

If the 503 test reveals that the helper's `startOpenCodeInstance` cannot be cleanly re-invoked against the same port (TOCTOU), the test adapts to either:
- Use a fresh port (re-running `startOpenCodeInstance({ port: newPort })` and verifying OC is reachable), or
- Sequence the assertions to avoid the race (kill → hit → wait for port-free → restart → hit).

The Slice 1 liveness test already proves restart-on-same-port works (`waitForPortFree` at `tests/web/liveness-fix.test.ts:73-85`), so reuse that helper if needed.

## Build prereq

`@openchamber/web` dist must be built before web tests can run (documented in Slice 1, `tests/README.md`):

```bash
bun run --cwd packages/web build:server
```

## Verification

| Step | Command | Expected |
|---|---|---|
| Per-file | `bun run --cwd tests test:web -- api-session-crud.test.ts` | All tests in file pass |
| Per-file | `bun run --cwd tests test:web -- sse-events.test.ts` | All tests in file pass |
| Per-file | `bun run --cwd tests test:web -- ws-upgrades.test.ts` | All tests in file pass |
| Web surface | `bun run --cwd tests test:web` | 12/12 pass in <60s |
| Full surface | `bun run --cwd tests test` | 33 tests pass in <90s |
| Type-check | `bun run --cwd tests type-check` | clean |
| Lint | `bun run --cwd tests lint` | clean (or pre-existing warnings only) |

## README update

Append a `### Slice 3` subsection to the Coverage section added in Slice 2 (`tests/README.md`):

```
| File | Tests |
|---|---|
| `web/api-session-crud.test.ts` | 6 |
| `web/sse-events.test.ts` | 3 |
| `web/ws-upgrades.test.ts` | 3 |
| **Slice 3 web** | **12** |
| **Web total** | **14** |
| **OpenCode total** | **22** |
| **Total** | **36** |
```

The exit criteria after Slice 3:
- All 36 tests pass in default CI lane
- Web surface runtime <60s
- Full surface runtime <90s
- Zero new dependencies

## Out of scope (deferred to future slices)

- Tier 2 `@slow` tests (live prompts, undo/redo, MCP, config, context) — Plan 4+
- Sync layer desync comparison — Plan 4
- React component tests — Plan 8+
- Performance benchmarks — Plan 15
- Internal OpenCode restart via HTTP API — `restartOpenCode` exists at `packages/web/server/src/index.ts:1012` but is not exposed as an HTTP endpoint; this slice exercises the same recovery path via process kill
- Liveness UI status chip — pending Slice 4+ once UI lands

## Risks

1. **SSE buffering delay.** OpenCode's SSE may not flush immediately on connect. 5s timeout. If flakes, raise.
2. **`lastEventId` format.** OpenCode may use a non-monotonic id. Implementer reads `global-hub.ts` and `global-ws-bridge.ts:41-52` before writing the assertion; adapts to actual behavior per Slice 2's "encode actual on-the-wire behaviour" rule.
3. **503 grace window.** `OPEN_CODE_READY_GRACE_MS` is short (few seconds). Kill+hit must happen within window. Use `process.kill(child.pid, 0)` to confirm dead before the fetch.
4. **`OPENCODE_SKIP_START=true` and test env.** The web server's env validation in `tests/helpers/openchamber-process.ts:13-17` sets the right vars per-call and restores on exit; tests run with the correct env state.
5. **Mode A port race.** The Slice 1 handoff noted an intermittent `beforeAll` timeout on `session-crud.test.ts` when run with other files. Slice 3 inherits this risk; mitigations: avoid hardcoded ports (use `getAvailablePort()`), give OC 5s settle time after start before hitting the proxy.

## Acceptance criteria

- All 12 web tests pass (6 + 3 + 3) with real OpenCode binary
- Opencode surface remains 22/22
- No new npm dependencies
- Process cleanup remains PID-targeted (no `killall`/`pkill`/`pgrep` anywhere)
- README updated with Slice 3 coverage row
- Reviewer approves spec compliance and code quality
- Verifier independently confirms the full 36-test surface passes
