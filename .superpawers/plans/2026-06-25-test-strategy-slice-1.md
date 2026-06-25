# Test Strategy Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the top-level `tests/` workspace and land the first real-OpenCode / real-OpenChamber integration tests for binary boot, SDK connectivity, session CRUD, web bootstrap, and streaming liveness regression.

**Architecture:** `tests/` is a private workspace outside `packages/*`, with vitest as its test runner and explicit root wrapper scripts. Helpers own process lifecycle, port allocation, logs, environment, and cleanup. Tests are split by surface (`tests/opencode/`, `tests/web/`) and declare whether they need a per-suite OpenCode instance or the shared per-run OpenCode instance.

**Tech Stack:** Bun workspaces, TypeScript, vitest, Node `child_process`, real `opencode` binary, real OpenChamber web server via `startWebUiServer`.

**Spec:** `.superpawers/specs/2026-06-25-test-strategy-design.md`

---

## File Structure

Create this first-slice structure:

```text
tests/
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── fixtures/
│   └── README.md
├── helpers/
│   ├── cleanup.ts
│   ├── env.ts
│   ├── logs.ts
│   ├── opencode-process.ts
│   ├── openchamber-process.ts
│   ├── ports.ts
│   └── vitest.ts
├── opencode/
│   ├── binary-resolution.test.ts
│   ├── sdk-connect.test.ts
│   └── session-crud.test.ts
└── web/
    ├── connection-lifecycle.test.ts
    └── liveness-fix.test.ts
```

Modify these existing files:

```text
package.json
bun.lock / bun.lockb (whatever Bun updates in this repo)
```

Do not modify package-local test scripts outside this plan.

---

## Task 1: Create `tests/` workspace scaffolding

**Files:**
- Modify: `package.json` — add `tests` to `workspaces`; add explicit wrapper scripts only
- Create: `tests/package.json`
- Create: `tests/tsconfig.json`
- Create: `tests/vitest.config.ts`
- Create: `tests/README.md`
- Create: `tests/fixtures/README.md`
- Create: `tests/helpers/vitest.ts`

- [ ] **Step 1: Update root workspace membership and scripts**

In root `package.json`, update `workspaces` from:

```json
"workspaces": [
  "packages/*"
]
```

to:

```json
"workspaces": [
  "packages/*",
  "tests"
]
```

In root `scripts`, add these wrappers. Do **not** add a generic root `test` script.

```json
"test:integration": "bun run --cwd tests test:integration",
"test:opencode": "bun run --cwd tests test:opencode",
"test:web": "bun run --cwd tests test:web",
"test:react": "bun run --cwd tests test:react",
"test:perf": "bun run --cwd tests bench",
"test:integration:slow": "RUN_SLOW_TESTS=1 bun run --cwd tests test:integration"
```

- [ ] **Step 2: Create `tests/package.json`**

Use this exact initial package manifest:

```json
{
  "name": "@openchamber/tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "type-check": "tsc --noEmit",
    "test:integration": "vitest run opencode web",
    "test:opencode": "vitest run opencode",
    "test:web": "vitest run web",
    "test:react": "vitest run react --config react/vitest.config.ts",
    "bench": "vitest bench perf --config perf/vitest.config.ts"
  },
  "dependencies": {
    "@opencode-ai/sdk": "^1.14.39",
    "@openchamber/web": "workspace:*",
    "ws": "^8.20.0"
  },
  "devDependencies": {
    "@types/node": "^25.9.1",
    "@types/ws": "^8.18.1",
    "typescript": "~5.8.3",
    "vitest": "^4.1.5"
  }
}
```

Use the same Node type major as `packages/web` (`^25.9.1`) because this workspace imports `@openchamber/web`. Do not add React DOM dependencies in Slice 1; those are Plan 8 in the spec.

- [ ] **Step 3: Create `tests/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node", "vitest"],
    "allowJs": false,
    "verbatimModuleSyntax": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

Do not extend the root `tsconfig.json`; it is a project-reference config and is not a useful standalone base for this workspace. Do not weaken strictness unless type-check fails for test-only Node globals, and document the reason.

- [ ] **Step 4: Create `tests/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["opencode/**/*.test.ts", "web/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    isolate: true,
    env: {
      OPENCODE_SKIP_START: "true",
      OPENCHAMBER_SKIP_OPENCODE_START: "true",
    },
  },
})
```

Use `pool: "forks"` because these tests spawn child processes and mutate process environment. The static skip-start env vars must be present before any web server module is imported. `OPENCODE_HOST` is dynamic and is set by `openchamber-process.ts` immediately before a dynamic import of `@openchamber/web`. If vitest version rejects the `pool` option, remove it and document that default workers are used.

- [ ] **Step 5: Create `tests/helpers/vitest.ts`**

```ts
import { test } from "vitest"

export const slowTestsEnabled = process.env.RUN_SLOW_TESTS === "1"
export const slowTest = slowTestsEnabled ? test : test.skip
```

- [ ] **Step 6: Create `tests/README.md`**

README must include:

```md
# OpenChamber Integration Tests

These tests use a real `opencode` binary and/or a real OpenChamber web server. They do not use recorded OpenCode responses or fake OpenCode services.

## Commands

- `bun run --cwd tests test` — fast lane (`tests/opencode`, `tests/web`)
- `bun run --cwd tests test:opencode`
- `bun run --cwd tests test:web`
- `RUN_SLOW_TESTS=1 bun run --cwd tests test` — includes `slowTest` cases when they exist

## Required Environment

- `opencode` must be on `PATH`, or set `TEST_OPENCODE_BINARY` / `OPENCODE_BINARY`.
- Tests allocate dynamic ports.
- Tests write temporary state under OS temp directories and clean up after themselves.

## Instance Modes

- Per-suite: the suite owns an isolated OpenCode process.
- Per-run: a shared OpenCode process can be reused by tests that do not corrupt global state. In Slice 1 this is intra-file only because `isolate: true` gives each test file its own worker. Cross-file Mode B requires a future `globalSetup`.
```

- [ ] **Step 7: Create `tests/fixtures/README.md`**

```md
# Fixtures

Shared fixtures for the top-level test workspace. Keep fixtures small, deterministic, and free of secrets.
```

- [ ] **Step 8: Install workspace dependencies**

Run: `bun install`

Expected: lockfile updates only for the new `tests` workspace metadata and dependencies that are not already present.

- [ ] **Step 9: Verify scaffolding**

Run:

```bash
bun run --cwd tests test -- --passWithNoTests
```

Expected: vitest exits successfully with no tests or reports no matching tests. If this vitest version does not support `--passWithNoTests`, run `bun run --cwd tests test:opencode -- --passWithNoTests` after Task 3 adds tests and document the behavior in the implementation report. Do not add test-runner flags from other frameworks.

- [ ] **Step 10: Commit**

```bash
git add package.json bun.lock* tests
git commit -m "test(integration): add top-level tests workspace"
```

---

## Task 2: Add process, environment, port, log, and cleanup helpers

**Files:**
- Create: `tests/helpers/ports.ts`
- Create: `tests/helpers/logs.ts`
- Create: `tests/helpers/cleanup.ts`
- Create: `tests/helpers/env.ts`
- Create: `tests/helpers/opencode-process.ts`
- Create: `tests/helpers/openchamber-process.ts`

- [ ] **Step 1: Create `tests/helpers/ports.ts`**

Complete target content:

```ts
import net from "node:net"

export async function getAvailablePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, host, () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate TCP port")))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}
```

- [ ] **Step 2: Create `tests/helpers/logs.ts`**

Complete target content:

```ts
export type ProcessLogBuffer = {
  pushStdout(chunk: unknown): void
  pushStderr(chunk: unknown): void
  dump(): string
}

const stringify = (chunk: unknown): string => {
  if (typeof chunk === "string") return chunk
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk)
  return String(chunk)
}

export function createProcessLogBuffer(label: string, maxBytes = 64 * 1024): ProcessLogBuffer {
  let stdout = ""
  let stderr = ""

  const append = (current: string, chunk: unknown) => {
    const next = current + stringify(chunk)
    return next.length > maxBytes ? next.slice(next.length - maxBytes) : next
  }

  return {
    pushStdout(chunk) {
      stdout = append(stdout, chunk)
    },
    pushStderr(chunk) {
      stderr = append(stderr, chunk)
    },
    dump() {
      return [`[${label}] stdout:`, stdout || "<empty>", `[${label}] stderr:`, stderr || "<empty>"].join("\n")
    },
  }
}
```

- [ ] **Step 3: Create `tests/helpers/cleanup.ts`**

Complete target content:

```ts
import fs from "node:fs/promises"
import type { ChildProcessWithoutNullStreams } from "node:child_process"

export async function killProcess(child: ChildProcessWithoutNullStreams | null | undefined, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill("SIGKILL")
      resolve()
    }, 2_000)
    child.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill(signal)
  })
}

export async function removeTempDir(path: string | null | undefined): Promise<void> {
  if (!path) return
  await fs.rm(path, { recursive: true, force: true })
}
```

- [ ] **Step 4: Create `tests/helpers/env.ts`**

Complete target content:

```ts
import { spawn } from "node:child_process"

export function getOpencodeBinary(): string {
  return (
    process.env.TEST_OPENCODE_BINARY ||
    process.env.OPENCODE_BINARY ||
    process.env.OPENCODE_PATH ||
    process.env.OPENCHAMBER_OPENCODE_PATH ||
    process.env.OPENCHAMBER_OPENCODE_BIN ||
    "opencode"
  ).trim() || "opencode"
}

export function getTestModel(): string | null {
  return (process.env.TEST_MODEL || process.env.OPENCODE_TEST_MODEL || "").trim() || null
}

export function isSlowEnabled(): boolean {
  return process.env.RUN_SLOW_TESTS === "1"
}

export async function checkOpenCodeAvailable(binary = getOpencodeBinary()): Promise<{ available: true } | { available: false; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ available: false, reason: `${binary} --version timed out` })
    }, 5_000)
    child.stderr.on("data", (chunk) => { stderr += String(chunk) })
    child.once("error", (error) => {
      clearTimeout(timeout)
      resolve({ available: false, reason: `${binary} is unavailable: ${error.message}` })
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve({ available: true })
      else resolve({ available: false, reason: `${binary} --version exited ${code}${stderr ? `: ${stderr}` : ""}` })
    })
  })
}
```

- [ ] **Step 5: Create `tests/helpers/opencode-process.ts`**

Target behavior:
- Spawn real OpenCode with `opencode serve --hostname 127.0.0.1 --port <dynamic>`.
- Use `getOpencodeBinary()`.
- Before spawning, call `checkOpenCodeAvailable()` and throw `OpenCodeUnavailableError` if unavailable. Tests use this to skip clearly instead of failing with ENOENT.
- Create an isolated temp dir for `cwd` unless caller passes `cwd`.
- Capture stdout/stderr with `createProcessLogBuffer`.
- Wait until `GET <baseUrl>/` or `GET <baseUrl>/health` responds with any HTTP response. Try `/health` first; if 404/405, try `/`.
- Return `{ baseUrl, port, cwd, logs, stop() }`.
- On startup timeout, throw an error that includes logs.

Target-state sketch:

```ts
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { killProcess, removeTempDir } from "./cleanup"
import { checkOpenCodeAvailable, getOpencodeBinary } from "./env"
import { createProcessLogBuffer } from "./logs"
import { getAvailablePort } from "./ports"

export type StartedOpenCode = {
  baseUrl: string
  port: number
  cwd: string
  logs: { dump(): string }
  stop(): Promise<void>
}

export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OpenCodeUnavailableError"
  }
}

export async function startOpenCodeInstance(options: { cwd?: string; port?: number; timeoutMs?: number } = {}): Promise<StartedOpenCode> {
  const availability = await checkOpenCodeAvailable()
  if (!availability.available) throw new OpenCodeUnavailableError(availability.reason)
  const port = options.port ?? await getAvailablePort()
  const cwd = options.cwd ?? await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-"))
  const ownsCwd = !options.cwd
  const baseUrl = `http://127.0.0.1:${port}`
  const logs = createProcessLogBuffer("opencode")
  const child = spawn(getOpencodeBinary(), ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  })

  child.stdout.on("data", (chunk) => logs.pushStdout(chunk))
  child.stderr.on("data", (chunk) => logs.pushStderr(chunk))

  try {
    await waitForHttp(baseUrl, options.timeoutMs ?? 15_000)
  } catch (error) {
    await killProcess(child)
    if (ownsCwd) await removeTempDir(cwd)
    throw new Error(`OpenCode failed to start at ${baseUrl}: ${String(error)}\n${logs.dump()}`)
  }

  return {
    baseUrl,
    port,
    cwd,
    logs,
    async stop() {
      await killProcess(child)
      if (ownsCwd) await removeTempDir(cwd)
    },
  }
}

async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const path of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${path}`)
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw lastError ?? new Error("Timed out waiting for OpenCode HTTP endpoint")
}
```

- [ ] **Step 6: Create `tests/helpers/openchamber-process.ts`**

Use in-process `startWebUiServer` from the `@openchamber/web` package rather than spawning the CLI. Existing pattern: `packages/web/server/src/__tests__/bootstrap.test.ts` imports `startWebUiServer` and starts with `{ port: 0, attachSignals: false, exitOnShutdown: false }`.

Important env timing rule: do **not** statically import `@openchamber/web` in this helper or anywhere in the tests workspace. `packages/web/server/src/index.ts` reads `OPENCODE_SKIP_START`, `OPENCHAMBER_SKIP_OPENCODE_START`, and `OPENCODE_HOST` at module load time. `startOpenChamberAgainstOpenCode()` must set env vars first, then dynamically import `@openchamber/web` with `await import("@openchamber/web")`.

Target behavior:
- Accept `opencodeHost`, optional `port`, `host`.
- Set `OPENCODE_SKIP_START=true`, `OPENCHAMBER_SKIP_OPENCODE_START=true`, and `OPENCODE_HOST=<opencodeHost>` for the duration of startup.
- Restore previous env vars after startup attempt.
- Return `{ baseUrl, port, controller, stop() }`.
- Do not attempt to configure event-stream upstream stall timeout in this helper. `startWebUiServer` currently exposes `StartWebUiServerOptions` with only `{ port, host, attachSignals, exitOnShutdown, uiPassword, onDesktopNotification }`.

Target-state sketch:

```ts
export type StartedOpenChamber = {
  baseUrl: string
  port: number
  stop(): Promise<void>
}

export async function startOpenChamberAgainstOpenCode(options: { opencodeHost: string; port?: number; host?: string }): Promise<StartedOpenChamber> {
  const previous = {
    OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
    OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
    OPENCODE_HOST: process.env.OPENCODE_HOST,
  }
  process.env.OPENCODE_SKIP_START = "true"
  process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
  // OPENCODE_HOST must include http:// and an explicit port, e.g. http://127.0.0.1:4096.
  // The web server env validation rejects host-only URLs.
  process.env.OPENCODE_HOST = options.opencodeHost
  try {
    const { startWebUiServer } = await import("@openchamber/web")
    const controller = await startWebUiServer({
      port: options.port ?? 0,
      host: options.host ?? "127.0.0.1",
      attachSignals: false,
      exitOnShutdown: false,
    })
    const port = controller.getPort()
    if (typeof port !== "number") throw new Error("OpenChamber started without a bound port")
    return {
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      async stop() {
        await controller.stop({ exitProcess: false })
      },
    }
  } finally {
    restoreEnv(previous)
  }
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
```

- [ ] **Step 7: Run helper type-check**

Run: `bun run --cwd tests test -- --passWithNoTests`

Expected: vitest loads config and TypeScript transforms helpers without test execution failures.

- [ ] **Step 8: Commit**

```bash
git add tests/helpers
git commit -m "test(integration): add process harness helpers"
```

---

## Task 3: Add OpenCode surface Tier 1 tests

**Files:**
- Create: `tests/opencode/binary-resolution.test.ts`
- Create: `tests/opencode/sdk-connect.test.ts`
- Create: `tests/opencode/session-crud.test.ts`

- [ ] **Step 1: Create `binary-resolution.test.ts`**

Test `getOpencodeBinary()` only. Do not spawn the process in this file.

Target tests:

```ts
import { afterEach, describe, expect, test } from "vitest"
import { getOpencodeBinary } from "../helpers/env"

const BINARY_ENV_KEYS = [
  "TEST_OPENCODE_BINARY",
  "OPENCODE_BINARY",
  "OPENCODE_PATH",
  "OPENCHAMBER_OPENCODE_PATH",
  "OPENCHAMBER_OPENCODE_BIN",
] as const

const original = Object.fromEntries(BINARY_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<(typeof BINARY_ENV_KEYS)[number], string | undefined>

function clearBinaryEnv(): void {
  for (const key of BINARY_ENV_KEYS) delete process.env[key]
}

afterEach(() => {
  for (const key of BINARY_ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

describe("OpenCode binary resolution", () => {
  test("uses TEST_OPENCODE_BINARY first", () => {
    clearBinaryEnv()
    process.env.TEST_OPENCODE_BINARY = "/tmp/test-opencode"
    process.env.OPENCODE_BINARY = "/tmp/opencode"
    expect(getOpencodeBinary()).toBe("/tmp/test-opencode")
  })

  test("falls back to OPENCODE_BINARY", () => {
    clearBinaryEnv()
    process.env.OPENCODE_BINARY = "/tmp/opencode"
    expect(getOpencodeBinary()).toBe("/tmp/opencode")
  })

  test("falls back to OPENCODE_PATH", () => {
    clearBinaryEnv()
    process.env.OPENCODE_PATH = "/tmp/opencode-path"
    expect(getOpencodeBinary()).toBe("/tmp/opencode-path")
  })

  test("falls back to OPENCHAMBER_OPENCODE_PATH", () => {
    clearBinaryEnv()
    process.env.OPENCHAMBER_OPENCODE_PATH = "/tmp/openchamber-opencode-path"
    expect(getOpencodeBinary()).toBe("/tmp/openchamber-opencode-path")
  })

  test("falls back to OPENCHAMBER_OPENCODE_BIN", () => {
    clearBinaryEnv()
    process.env.OPENCHAMBER_OPENCODE_BIN = "/tmp/openchamber-opencode-bin"
    expect(getOpencodeBinary()).toBe("/tmp/openchamber-opencode-bin")
  })

  test("defaults to opencode", () => {
    clearBinaryEnv()
    expect(getOpencodeBinary()).toBe("opencode")
  })
})
```

Common install path parity (`~/.opencode/bin/opencode`, `~/.bun/bin/opencode`, etc.) belongs to OpenChamber's production resolver and is intentionally deferred from Slice 1. Slice 1 covers env-var precedence in the test harness helper; a future parity test can import or expose the production resolver directly.

- [ ] **Step 2: Create `sdk-connect.test.ts`**

This test starts a per-suite OpenCode instance and verifies a real HTTP endpoint or SDK health path.

Because OpenCode SDK surface may vary, implementer must inspect `@opencode-ai/sdk` usage in `packages/ui/src/lib/opencode/client.ts` and use the most stable client constructor/path available. If SDK direct connection is unclear, fall back to `fetch(`${baseUrl}/`)` and name the test "http connect" instead of "sdk connect". Do not invent a fake SDK wrapper.

Minimum test:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

describe.skipIf(!availability.available)("OpenCode SDK/connectivity", () => {
  let opencode: StartedOpenCode

  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  afterAll(async () => {
    await opencode?.stop()
  })

  test("responds over HTTP", async () => {
    const response = await fetch(opencode.baseUrl)
    expect(response.status).toBeLessThan(500)
  })
})
```

If vitest's `describe.skipIf` type is unavailable in this version, use `const describeWhenOpenCode = availability.available ? describe : describe.skip` and call `describeWhenOpenCode(...)`. Do not call `test.skip()` inside a running test body.

- [ ] **Step 3: Create `session-crud.test.ts`**

Goal: real session create/list/get/delete or archive with no model completion. This test may need SDK path discovery.

Implementation guidance:
- Inspect `packages/ui/src/lib/opencode/client.ts` for current SDK client wrapper.
- Inspect existing OpenChamber server code for SDK calls to session APIs (`session.list`, `session.create`, `session.delete`, archive equivalents).
- Use direct SDK calls if stable.
- If direct SDK calls are not obvious within 20 minutes, write a top-level skipped test as `test.skip("session CRUD requires SDK API mapping", () => {})` with a clear comment above it and report DONE_WITH_CONCERNS. Do not call `test.skip()` inside a running test body and do not guess the SDK API.

Acceptance target if SDK path is clear:
- Start per-suite OpenCode instance.
- Create a session with a title or empty initial state.
- List sessions and assert the session appears.
- Fetch the session by ID and assert the ID matches.
- Delete or archive it.
- List again and assert it is gone/archived depending on OpenCode behavior.

- [ ] **Step 4: Run OpenCode surface tests**

Run: `bun run --cwd tests test:opencode`

Expected:
- Binary resolution tests pass.
- Connectivity test passes if `opencode` binary exists.
- Session CRUD passes if SDK path is clear, or is skipped with clear reason.

- [ ] **Step 5: Commit**

```bash
git add tests/opencode
git commit -m "test(integration): add opencode tier 1 smoke tests"
```

---

## Task 4: Add web surface connection lifecycle test

**Files:**
- Create: `tests/web/connection-lifecycle.test.ts`

- [ ] **Step 1: Create test file**

Test must:
- Start per-suite OpenCode via `startOpenCodeInstance()`.
- Start OpenChamber against it via `startOpenChamberAgainstOpenCode({ opencodeHost })`.
- Fetch `/health` from OpenChamber and assert `200` and `{ status: "ok" }`.
- Stop OpenChamber first, then OpenCode.

Target content:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "../helpers/openchamber-process"

describe("OpenChamber web connection lifecycle", () => {
  let opencode: StartedOpenCode
  let openchamber: StartedOpenChamber

  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
    openchamber = await startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl })
  }, 30_000)

  afterAll(async () => {
    await openchamber?.stop()
    await opencode?.stop()
  })

  test("web server starts against external OpenCode and responds to /health", async () => {
    const response = await fetch(`${openchamber.baseUrl}/health`)
    expect(response.status).toBe(200)
    const body = await response.json() as { status?: string }
    expect(body.status).toBe("ok")
  })
})
```

- [ ] **Step 2: Run web test**

Run: `bun run --cwd tests test:web -- connection-lifecycle.test.ts`

Expected: test passes if `opencode` binary exists.

- [ ] **Step 3: Commit**

```bash
git add tests/web/connection-lifecycle.test.ts
git commit -m "test(integration): add web external-opencode smoke test"
```

---

## Task 5: Add web streaming liveness regression test

**Files:**
- Create: `tests/web/liveness-fix.test.ts`

This is the highest-value Slice 1 test, but it must match the real failure mode. `data_stalled` is emitted when OpenChamber's upstream reader experiences **silence while the upstream connection remains open**. Killing the OpenCode process may produce an immediate disconnect/error instead of `data_stalled`, so the first implementation must observe and document real behavior rather than force an assertion that the runtime cannot guarantee.

- [ ] **Step 1: Inspect current WS URL and frame shape**

Read:
- `packages/web/server/src/domains/event-stream/types.ts` for `MESSAGE_STREAM_GLOBAL_WS_PATH`
- `packages/web/server/src/domains/event-stream/global-ws-bridge.ts` for ready/stall/resume frames
- `packages/ui/src/sync/event-pipeline.ts` for expected browser consumption

Expected global WS path: `/api/global/event/ws`.

- [ ] **Step 2: Create a WS helper inside `liveness-fix.test.ts`**

Use `ws` from `tests/package.json`. Helper:
- Opens `ws://127.0.0.1:<port>/api/global/event/ws`.
- Resolves when it receives `{ type: "ready" }`.
- Collects parsed JSON frames.
- Exposes `waitForFrame(type, timeoutMs)`.

Minimal helper sketch:

```ts
import WebSocket from "ws"

type WsFrame = { type?: string; payload?: { type?: string }; [key: string]: unknown }

async function connectGlobalWs(baseUrl: string): Promise<{
  socket: WebSocket
  frames: WsFrame[]
  waitForFrame(type: string, timeoutMs?: number): Promise<WsFrame>
  close(): void
}> {
  const url = new URL(baseUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/api/global/event/ws"
  const frames: WsFrame[] = []
  const waiters = new Map<string, Array<(frame: WsFrame) => void>>()
  const socket = new WebSocket(url)

  socket.on("message", (raw) => {
    const frame = JSON.parse(String(raw)) as WsFrame
    frames.push(frame)
    const callbacks = waiters.get(String(frame.type)) ?? []
    waiters.delete(String(frame.type))
    for (const callback of callbacks) callback(frame)
  })

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve())
    socket.once("error", reject)
  })

  const waitForFrame = (type: string, timeoutMs = 30_000) => new Promise<WsFrame>((resolve, reject) => {
    const existing = frames.find((frame) => frame.type === type)
    if (existing) return resolve(existing)
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for WS frame ${type}`)), timeoutMs)
    const callbacks = waiters.get(type) ?? []
    callbacks.push((frame) => {
      clearTimeout(timeout)
      resolve(frame)
    })
    waiters.set(type, callbacks)
  })

  await waitForFrame("ready")
  return { socket, frames, waitForFrame, close: () => socket.close() }
}
```

- [ ] **Step 3: Implement the regression test**

Initial target behavior:
- Start OpenCode (Mode A, per-suite).
- Start OpenChamber against OpenCode.
- Connect global WS to OpenChamber and wait for `ready`.
- Wait up to 30s for either `data_stalled`/`data_resumed` during an idle upstream OR, if real OpenCode sends keepalive chunks and no stall occurs, record that no natural idle stall is observable in this environment.
- Stop OpenCode process, leaving OpenChamber running.
- Assert that the WS connection remains controlled (either receives a `data_stalled`/`error` frame or stays open without unexpected close). Also assert that no WS `event` frame has `payload.type === "openchamber:heartbeat"`. Do not assert `data_stalled` on kill unless observed.
- Restart OpenCode on the same port and same cwd so OpenChamber's upstream reconnect target is valid.
- If a prior `data_stalled` was observed, wait up to 30s for `data_resumed`. Otherwise assert OpenChamber remains healthy after restart and document the behavior.

Important implementation detail: `startOpenCodeInstance({ cwd, port })` must support reusing both cwd and port. If Task 2 helper lacks this, extend it locally and commit the helper change with this task.

If the test cannot reliably cause a real upstream-silence stall with a real OpenCode binary, commit the strongest deterministic regression available in Slice 1: **global WS connects, no WS `event` frame with `payload.type === "openchamber:heartbeat"` is emitted for 20s, OpenCode restart does not crash OpenChamber, and any `data_stalled`/`data_resumed` frames observed have the expected shape.** Add a static skipped test for the stronger `data_stalled` assertion, with an explicit reason in the test name or adjacent comment: "requires controllable real upstream silence; future slice may add an OpenCode plugin/model-hold fixture".

- [ ] **Step 4: Account for platform/process timing**

If OpenCode exits too slowly or restart binds before the old process fully closes, extend `killProcess` wait or add a small retry in `startOpenCodeInstance`. Do not add arbitrary sleeps unless bounded and justified by a condition check.

- [ ] **Step 5: Run the liveness test**

Run: `bun run --cwd tests test:web -- liveness-fix.test.ts`

Expected: deterministic assertions pass. If real idle OpenCode naturally triggers upstream silence, the test observes valid `data_stalled` and `data_resumed` frames. If not, the test still proves the global WS path is alive, no WS `event` frame with `payload.type === "openchamber:heartbeat"` is emitted, and OpenChamber remains healthy across OpenCode restart; the stronger stall assertion is skipped with a clear reason.

- [ ] **Step 6: Commit**

```bash
git add tests/web/liveness-fix.test.ts tests/helpers/opencode-process.ts tests/helpers/cleanup.ts
git commit -m "test(integration): cover streaming liveness with real opencode"
```

Only include helper files if modified in this task.

---

## Task 6: Document Slice 1 and verify

**Files:**
- Modify: `tests/README.md`
- Modify: `.superpawers/OVERVIEW.md`

- [ ] **Step 1: Update `tests/README.md` with Slice 1 status**

Add a "Current coverage" section listing:
- OpenCode binary resolution
- OpenCode connectivity
- OpenCode session CRUD if implemented, otherwise skipped with rationale
- OpenChamber web health against external OpenCode
- Streaming liveness regression

- [ ] **Step 2: Update `.superpawers/OVERVIEW.md`**

Add a testing section if none exists, or append to the current roadmap:
- Test strategy spec written
- Slice 1 plan written
- Slice 1 implementation coverage once complete
- Future slices: Tier 2 live query, MCP/config/context, React DOM, perf

- [ ] **Step 3: Run verification**

Run:

```bash
bun run --cwd tests test:opencode
bun run --cwd tests test:web
bun run type-check
bun run lint
```

Expected:
- Integration tests pass if `opencode` binary is available.
- If `opencode` is unavailable, tests must skip with a clear message rather than failing with ENOENT.
- Type-check and lint must not introduce new errors.

- [ ] **Step 4: Commit docs**

```bash
git add tests/README.md .superpawers/OVERVIEW.md
git commit -m "docs(tests): document integration test slice 1"
```

---

## Final Review Requirements

After all implementation tasks:

1. Dispatch reviewer for spec compliance against `.superpawers/specs/2026-06-25-test-strategy-design.md` and this plan.
2. Dispatch reviewer for code quality focused on process cleanup, env restoration, and flake risk.
3. Dispatch verifier subagent or run inline verification if the local environment has `opencode` available.
4. Do not merge to `main` until review issues are resolved and verification is recorded.

---

## Known Risks and Required Handling

| Risk | Required handling |
|---|---|
| `opencode` binary missing locally/CI | Tests skip clearly unless the specific test is for binary resolution. README documents requirement. |
| OpenCode SDK API shape unclear | Do not guess. Skip session CRUD with explicit reason and report DONE_WITH_CONCERNS. |
| Process leaks | Every helper returns `stop()`. Tests use `afterAll` and `try/finally` where needed. |
| Port collisions | Always use `getAvailablePort()` unless intentionally restarting on the same port. |
| Liveness timing flakes | Use condition-based waits around frame receipt, not fixed sleeps. Timeouts must dump logs. |
| Env leakage | `openchamber-process.ts` restores env after startup attempt. |
