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

## Slice 1 coverage

| File | What it covers |
|---|---|
| `opencode/binary-resolution.test.ts` | `getOpencodeBinary()` env-var precedence (`TEST_OPENCODE_BINARY`, `OPENCODE_BINARY`, `OPENCODE_PATH`, `OPENCHAMBER_OPENCODE_PATH`, `OPENCHAMBER_OPENCODE_BIN`, default `"opencode"`) |
| `opencode/sdk-connect.test.ts` | Real OpenCode HTTP `/health` and `/` endpoints respond successfully |
| `opencode/session-crud.test.ts` | Create, list, get, and delete a session via the OpenCode SDK |
| `web/connection-lifecycle.test.ts` | OpenChamber web server boots against a real external OpenCode, `/health` returns 200 and `{"status":"ok"}` |
| `web/liveness-fix.test.ts` | Global WS connects and receives `ready` frame; no `openchamber:heartbeat` payload leaks to WS clients; OpenChamber `/health` remains healthy after OpenCode kill + restart; `data_stalled` assertion is skipped (requires a controllable upstream-silence fixture) |

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
- The `stop()` methods use SIGKILL + cleanup. No global `killall`, `pkill`, or process-name-based kills are used anywhere in the test helpers or tests.
- File-level `afterAll` hooks are wrapped in try/catch so cleanup runs even after test failure.
- An `process.on("exit")` safety net in `startOpenCodeInstance()` kills orphaned children if the parent exits abnormally.

## Liveness test notes

The `data_stalled` / `data_resumed` WS frames cannot be reliably observed with a real OpenCode binary under normal conditions. OpenCode sends keepalive events that reset the 20s stall timer, and killing the process drops the TCP connection before the timer can fire (producing `stream_error` / disconnect instead). The stronger `data_stalled` assertion in `liveness-fix.test.ts` is skipped with documentation. A future slice may add an OpenCode plug-in or model-hold fixture to produce controllable upstream silence.

## Instance Modes

- **Per-suite (Mode A):** The suite owns an isolated OpenCode process. Used by all current tests. Full isolation, but each suite pays a ~3–5s binary startup cost.
- **Per-run (Mode B):** A shared OpenCode process reused across tests. Not yet implemented — requires a future `globalSetup`. In Slice 1 this is intra-file only because `isolate: true` gives each test file its own worker.
