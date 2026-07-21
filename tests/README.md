# OpenChamber Integration Tests

These tests use a real `opencode` binary and/or a real OpenChamber web server. They do not use recorded OpenCode responses or fake OpenCode services.

## Commands

| Command | What runs |
|---|---|
| `bun run --cwd tests test` | All test surfaces (opencode + web) |
| `bun run --cwd tests test:opencode` | `tests/opencode/` only |
| `bun run --cwd tests test:web` | `tests/web/` only |
| `RUN_SLOW_TESTS=1 bun run --cwd tests test` | Includes `slowTest` cases when they exist |
| `bun run --cwd tests type-check` | TypeScript check for tests workspace only |
| `bun run test:integration` | Root wrapper → same as `--cwd tests test` |
| `bun run test:opencode` | Root wrapper → delegates to tests workspace |
| `bun run test:web` | Root wrapper → delegates to tests workspace |

## Coverage

### Slice 1

| File | What it covers |
|---|---|
| `opencode/binary-resolution.test.ts` | `getOpencodeBinary()` env-var precedence (`TEST_OPENCODE_BINARY`, `OPENCODE_BINARY`, `OPENCODE_PATH`, `OPENCHAMBER_OPENCODE_PATH`, `OPENCHAMBER_OPENCODE_BIN`, default `"opencode"`) |
| `opencode/sdk-connect.test.ts` | Real OpenCode HTTP `/health` and `/` endpoints respond successfully |
| `opencode/session-crud.test.ts` | Create, list, get, and delete a session via the OpenCode SDK |
| `web/connection-lifecycle.test.ts` | OpenChamber web server boots against a real external OpenCode, `/health` returns 200 and `{"status":"ok"}` |
| `web/liveness-fix.test.ts` | Global WS connects and receives `ready` frame; OpenChamber `/health` remains healthy after OpenCode kill + restart; `data_stalled` assertion is skipped (requires a controllable upstream-silence fixture) |

### Slice 2

| File | What it covers |
|---|---|
| `opencode/multi-directory.test.ts` | Sessions in different directories are isolated via `session.list` filtering; `session.get` resolves globally by ID (not per-directory) on this OpenCode binary |
| `opencode/session-archive.test.ts` | Archive a session via `time.archived: <ms>`; `client.experimental.session.list({ archived: true })` filters correctly; archived sessions remain deletable. **Caveat:** this OpenCode binary treats `time.archived = 0` as still-archived (checks `!== undefined`, not `> 0`), so true unarchive is not testable. |
| `opencode/session-errors.test.ts` | 404 (or sane fallback) for `session.get`/`delete`/`update` on unknown IDs; `messages` endpoint handles unknown session; `session.create` accepts empty title with auto-generated fallback |
| `opencode/concurrent-sessions.test.ts` | Parallel session creation yields distinct IDs; parallel updates to distinct sessions don't cross-contaminate; parallel `session.list` calls return consistent snapshots containing all recently-created sessions |

### Slice 3

| File | Tests |
|---|---|
| `web/api-session-crud.test.ts` | 6 |
| `web/sse-events.test.ts` | 3 |
| `web/ws-upgrades.test.ts` | 3 |
| **Slice 3 web** | **12** |
| **Web total** | **14** |
| **OpenCode total** | **22** |
| **Total** | **36** |

### Slice 4

| File | Tests |
|---|---|
| `opencode/prompt-async-events.test.ts` | 5 |
| `web/prompt-async-proxy.test.ts` | 2 |
| **Slice 4 opencode** | **5** |
| **Slice 4 web** | **2** |
| **OpenCode total** | **27** |
| **Web total** | **16** |
| **Total** | **43** |

### Slice 5

| File | Tests |
|---|---|
| `opencode/tool-registry.test.ts` | 3 |
| `opencode/tool-part-lifecycle.test.ts` | 4 |
| `web/tool-part-proxy.test.ts` | 3 |
| **Slice 5 opencode** | **7** |
| **Slice 5 web** | **3** |
| **OpenCode total** | **34** |
| **Web total** | **19** |
| **Total** | **53** |

## Required Environment

- `opencode` must be on `PATH`, or set `TEST_OPENCODE_BINARY` / `OPENCODE_BINARY`.
- Tests allocate dynamic ports.
- Tests write temporary state under OS temp directories and clean up after themselves.
- Vitest env sets `OPENCODE_SKIP_START=true` and `OPENCHAMBER_SKIP_OPENCODE_START=true` so web tests can import `@openchamber/web` without triggering a real OpenCode spawn.

## Build prerequisites

Before running web tests, the `@openchamber/web` server must be built:

```bash
bun run --cwd packages/web build:server
```

If the dist is stale, web tests fail with `Error: Cannot find module './instrument.mjs'`.

## Execution model

The vitest config uses `fileParallelism: false` — test files run one at a time, not in parallel. This is intentional: every test file (both `opencode/` and `web/`) starts its own OpenCode child process and, for web tests, an OpenChamber Express server. Parallel execution causes resource contention and unreliable timeouts.

Each test file runs in its own vitest fork worker (`pool: "forks"`, `isolate: true`), so file-level state is fully isolated.

## Process lifecycle

- OpenCode processes are started via `startOpenCodeInstance()` and stopped via the returned `stop()` method.
- OpenChamber servers are started via `startOpenChamberAgainstOpenCode()` and stopped via the returned `stop()` method.
- OpenChamber must be stopped before OpenCode to allow a graceful disconnect.
- The `stop()` methods use SIGKILL + cleanup targeted at the tracked child PID. **No `killall`, `pkill`, `pgrep`, or process-name-based kills exist anywhere in the test helpers or tests.** Cleanup is PID-targeted only.
- File-level `afterAll` hooks are wrapped in try/catch so cleanup runs even after test failure.

### Defense-in-depth against leaks

When a vitest fork worker dies before `afterAll` can run (e.g. SIGKILL on timeout/OOM), the spawned OpenCode child would normally be reparented to init and leak. Three mechanisms prevent this — all PID-targeted, no name matching:

1. **PID recording** (`tests/helpers/opencode-process.ts`): each spawn writes its PID to `<tempdir>/pid`.
2. **Orphan reaper** (called at the start of every `startOpenCodeInstance()`): scans `/tmp/openchamber-opencode-*/pid`, liveness-checks each PID with `process.kill(pid, 0)`, and `process.kill(pid, "SIGKILL")` any that are still alive. Targets only PIDs we recorded.
3. **Sibling watchdog** (`tests/helpers/opencode-watchdog.cjs`): a tiny Node.js process spawned alongside each OpenCode instance. Polls `process.ppid` every 250ms; if the recorded parent dies (ppid changes — happens on SIGKILL too), it sends SIGKILL to the OpenCode PID and exits. Detection latency: ≤250ms.

User-spawned `opencode` sessions (e.g. `opencode --continue` from a terminal) never have a pid file under `/tmp/openchamber-opencode-*/`, so the reaper cannot touch them. The watchdog only kills a PID it was explicitly told to.

## Liveness test notes

The `data_stalled` / `data_resumed` WS frames cannot be reliably observed with a real OpenCode binary under normal conditions. OpenCode sends keepalive events that reset the 20s stall timer, and killing the process drops the TCP connection before the timer can fire (producing `stream_error` / disconnect instead). The stronger `data_stalled` assertion in `liveness-fix.test.ts` is skipped with documentation. A future slice may add an OpenCode plug-in or model-hold fixture to produce controllable upstream silence.

## Instance Modes

- **Per-suite (Mode A):** The suite owns an isolated OpenCode process. Used by all current tests. Full isolation, but each suite pays a ~3–5s binary startup cost.
- **Per-run (Mode B):** A shared OpenCode process reused across tests. Not yet implemented — requires a future `globalSetup`. In Slice 1 this is intra-file only because `isolate: true` gives each test file its own worker.
