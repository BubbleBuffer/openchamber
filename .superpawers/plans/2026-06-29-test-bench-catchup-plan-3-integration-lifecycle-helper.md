# Test and Benchmark Catch-Up Plan 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated OpenCode availability/start/stop boilerplate into shared integration-suite helpers and migrate the integration tests without changing test semantics.

**Architecture:** Add `tests/helpers/integration-suite.ts` as the only new helper surface. It centralizes OpenCode availability gating, PID-file-only cleanup comments, OpenCode-only suite setup, and OpenChamber-against-OpenCode setup. Migrate straightforward suites to the lifecycle helpers first, then migrate special web suites conservatively where they have custom shared runtime behavior.

**Tech Stack:** `vitest`, existing `tests/helpers/opencode-process.ts`, existing `tests/helpers/openchamber-process.ts`, TypeScript.

---

## File Structure

- Create: `tests/helpers/integration-suite.ts` — shared `describeWhenOpenCode`, `describeWithOpenCode`, and `describeWithOpenChamber` helpers.
- Modify: `tests/opencode/*.test.ts` — remove repeated availability/start/stop boilerplate where possible.
- Modify: `tests/web/*.test.ts` — remove repeated availability/start/stop boilerplate where possible while preserving custom shared-runtime suites.
- Read only: `tests/helpers/opencode-process.ts` — PID-file-only cleanup remains the source of truth.

## Hard Constraint

Do not add, run, or suggest `pgrep`, `pkill`, `killall`, or any name-based process matching. Cleanup remains PID-file-only through `tests/helpers/opencode-process.ts` (`<tempdir>/pid`, `process.kill(pid, 0)`, and PID-targeted termination only).

---

### Task 1: Add Integration Suite Helper

**Files:**
- Create: `tests/helpers/integration-suite.ts`
- Read: `tests/helpers/opencode-process.ts`
- Read: `tests/helpers/openchamber-process.ts`
- Read: `tests/helpers/vitest.ts`

- [ ] **Step 1: Create helper tests by type-checking the new API shape**

Create `tests/helpers/integration-suite.ts` with this target state:

```ts
import { afterAll, beforeAll, describe } from "vitest"
import { checkOpenCodeAvailable } from "./env"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "./openchamber-process"
import { startOpenCodeInstance, type StartedOpenCode } from "./opencode-process"

type MaybePromise<T> = T | Promise<T>

export const openCodeAvailability = await checkOpenCodeAvailable()
export const describeWhenOpenCode = openCodeAvailability.available ? describe : describe.skip

export type OpenCodeSuiteContext = {
  readonly opencode: StartedOpenCode
}

export type OpenChamberSuiteContext = OpenCodeSuiteContext & {
  readonly openchamber: StartedOpenChamber
}

type OpenCodeSuiteOptions = {
  timeoutMs?: number
  start?: () => Promise<StartedOpenCode>
  beforeStop?: (ctx: OpenCodeSuiteContext) => MaybePromise<void>
  afterStop?: () => MaybePromise<void>
}

type OpenChamberSuiteOptions = Omit<OpenCodeSuiteOptions, "beforeStop"> & {
  startOpenChamber?: (opencode: StartedOpenCode) => Promise<StartedOpenChamber>
  beforeStop?: (ctx: OpenChamberSuiteContext) => MaybePromise<void>
}

const missing = (name: string): never => {
  throw new Error(`${name} was accessed before the integration suite started`)
}

// PID-file-only cleanup is implemented in opencode-process.ts. Do not add
// process-name matching here; user-spawned opencode instances must never be
// matched or killed by these tests.
export function describeWithOpenCode(
  name: string,
  options: OpenCodeSuiteOptions,
  register: (ctx: OpenCodeSuiteContext) => void,
): void {
  let opencode: StartedOpenCode | undefined
  const ctx: OpenCodeSuiteContext = {
    get opencode() {
      return opencode ?? missing("opencode")
    },
  }

  afterAll(async () => {
    try { await options.beforeStop?.(ctx) } catch { /* best-effort */ }
    try { await opencode?.stop() } catch { /* best-effort */ }
    try { await options.afterStop?.() } catch { /* best-effort */ }
  })

  describeWhenOpenCode(name, () => {
    beforeAll(async () => {
      opencode = await (options.start?.() ?? startOpenCodeInstance())
    }, options.timeoutMs ?? 30_000)

    register(ctx)
  })
}

export function describeWithOpenChamber(
  name: string,
  options: OpenChamberSuiteOptions,
  register: (ctx: OpenChamberSuiteContext) => void,
): void {
  let opencode: StartedOpenCode | undefined
  let openchamber: StartedOpenChamber | undefined
  const ctx: OpenChamberSuiteContext = {
    get opencode() {
      return opencode ?? missing("opencode")
    },
    get openchamber() {
      return openchamber ?? missing("openchamber")
    },
  }

  afterAll(async () => {
    try { await options.beforeStop?.(ctx) } catch { /* best-effort */ }
    try { await openchamber?.stop() } catch { /* best-effort */ }
    try { await opencode?.stop() } catch { /* best-effort */ }
    try { await options.afterStop?.() } catch { /* best-effort */ }
  })

  describeWhenOpenCode(name, () => {
    beforeAll(async () => {
      opencode = await (options.start?.() ?? startOpenCodeInstance())
      openchamber = await (options.startOpenChamber?.(opencode) ?? startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl }))
    }, options.timeoutMs ?? 45_000)

    register(ctx)
  })
}
```

Notes:
- Keep `describeWhenOpenCode` exported for special suites that cannot use the full lifecycle helper.
- Register `afterAll` at file scope, matching the old cleanup safety-net pattern.
- `beforeStop` runs before stopping servers for suite-specific handles such as SSE streams or WebSockets.
- `afterStop` runs after server cleanup for manually-created temp directories.
- Do not destructure `ctx` in the `register` callback parameter. The context uses getters, and destructuring the parameter reads the getter while tests are still being registered, before the helper `beforeAll` has started. Use `(ctx) => { ... ctx.opencode ... }` or `(ctx) => { ... ctx.openchamber ... }` inside nested hooks/tests instead.

- [ ] **Step 2: Verify helper type-checks**

Run: `bun run --cwd tests type-check`

Expected: PASS or only errors introduced by call sites not yet migrated. Fix helper-local type errors before migrating test files.

- [ ] **Step 3: Commit helper**

```bash
git add tests/helpers/integration-suite.ts
git commit -m "test(integration): add shared suite lifecycle helper"
```

---

### Task 2: Migrate OpenCode-Only Integration Tests

**Files:**
- Modify: all `tests/opencode/*.test.ts`

- [ ] **Step 1: Migrate straightforward OpenCode suites**

Replace per-file `checkOpenCodeAvailable`, `describeWhenOpenCode`, `let opencode`, `beforeAll(startOpenCodeInstance)`, and `afterAll(opencode.stop)` boilerplate with `describeWithOpenCode`.

Apply this pattern to files that only need an OpenCode instance:

```ts
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode session CRUD", {}, (ctx) => {
  test("create, list, get, and delete a session", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
    // existing assertions unchanged
  })
})
```

For files with file-level clients, initialize them in a nested `beforeAll` inside the callback:

```ts
describeWithOpenCode("OpenCode tool registry", {}, (ctx) => {
  let client: OpencodeClient
  beforeAll(() => {
    client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
  })
  // existing tests unchanged
})
```

For `tests/opencode/prompt-async-events.test.ts`, use `beforeStop` to close `sse` before OpenCode stops, and keep the nested SSE setup:

```ts
let sse: SseHandle | undefined

describeWithOpenCode(
  "OpenCode prompt_async + event stream",
  { timeoutMs: 30_000, beforeStop: () => { try { sse?.close() } catch { /* ignore */ } } },
  (ctx) => {
    beforeAll(async () => {
      sse = await openSseStream(ctx.opencode.baseUrl, "/event")
    })
    // existing tests unchanged
  },
)
```

Migrate these files:
- `tests/opencode/binary-resolution.test.ts`
- `tests/opencode/concurrent-sessions.test.ts`
- `tests/opencode/multi-directory.test.ts`
- `tests/opencode/prompt-async-events.test.ts`
- `tests/opencode/sdk-connect.test.ts`
- `tests/opencode/session-archive.test.ts`
- `tests/opencode/session-crud.test.ts`
- `tests/opencode/session-errors.test.ts`
- `tests/opencode/tool-part-lifecycle.test.ts`
- `tests/opencode/tool-registry.test.ts`

- [ ] **Step 2: Verify OpenCode suite still passes**

Run: `bun run --cwd tests test:opencode`

Expected: same behavior as baseline, with no semantic assertion changes.

- [ ] **Step 3: Inspect boilerplate reduction**

Run: `git diff -- tests/opencode tests/helpers/integration-suite.ts`

Expected: imports from `../helpers/env`, direct `startOpenCodeInstance` lifecycle declarations, and local `describeWhenOpenCode` constants are removed from migrated files unless the file has a justified custom lifecycle.

- [ ] **Step 4: Commit OpenCode migration**

```bash
git add tests/helpers/integration-suite.ts tests/opencode/*.test.ts
git commit -m "test(integration): use shared OpenCode suite helper"
```

---

### Task 3: Migrate Web Integration Tests

**Files:**
- Modify: all `tests/web/*.test.ts`

- [ ] **Step 1: Migrate simple OpenChamber suites**

Use `describeWithOpenChamber` for suites that start one OpenCode and one OpenChamber instance and do not need custom cwd/port persistence:

```ts
import { describeWithOpenChamber } from "../helpers/integration-suite"

describeWithOpenChamber("OpenChamber web connection lifecycle", {}, (ctx) => {
  test("web server starts against external OpenCode and responds to /health", async () => {
    const response = await fetch(`${ctx.openchamber.baseUrl}/health`)
    // existing assertions unchanged
  })
})
```

For web tests that require a stable OpenCode cwd/port (`sse-events`, `ws-upgrades`, `liveness-fix`, `api-session-crud`), use `start` and `afterStop` options to preserve the existing temp-dir cleanup semantics:

```ts
let ocCwd: string | undefined
let ocPort: number | undefined

describeWithOpenChamber(
  "OpenChamber SSE event streams",
  {
    timeoutMs: 45_000,
    start: async () => {
      ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-sse-"))
      ocPort = await getAvailablePort()
      return startOpenCodeInstance({ cwd: ocCwd, port: ocPort })
    },
    afterStop: async () => {
      if (ocCwd) await fs.rm(ocCwd, { recursive: true, force: true })
    },
  },
  (ctx) => {
    // Use ctx.opencode and ctx.openchamber inside hooks/tests.
    // existing tests unchanged
  },
)
```

Migrate these straightforward web files first:
- `tests/web/connection-lifecycle.test.ts`
- `tests/web/tool-part-proxy.test.ts`
- `tests/web/prompt-async-proxy.test.ts`
- `tests/web/sse-events.test.ts`
- `tests/web/ws-upgrades.test.ts`

- [ ] **Step 2: Handle custom shared-runtime suites conservatively**

For `tests/web/api-session-crud.test.ts` and `tests/web/liveness-fix.test.ts`, preserve the existing shared-runtime comments and special behavior. At minimum:
- Replace local `checkOpenCodeAvailable` + `describeWhenOpenCode` with the exported `describeWhenOpenCode` from `../helpers/integration-suite`.
- If the full helper can preserve current behavior without changing assertions, use it.
- If not, keep custom lifecycle in place and add a short comment explaining that the suite uses custom shared/runtime restart behavior.

Do not change these semantics:
- `api-session-crud.test.ts` shares a single OpenCode + OpenChamber across multiple describe blocks and has a PID-targeted 503 test.
- `liveness-fix.test.ts` stops and restarts OpenCode on the same cwd/port in a single test.

- [ ] **Step 3: Verify web suite still matches baseline**

Run: `bun run --cwd tests test:web`

Expected: same pass/fail/skip behavior as baseline. If a known pre-existing liveness failure remains, document it with exact output; do not change assertions to hide it.

- [ ] **Step 4: Commit web migration**

```bash
git add tests/helpers/integration-suite.ts tests/web/*.test.ts
git commit -m "test(integration): use shared web suite lifecycle helper"
```

---

### Task 4: Final Plan 3 Verification

**Files:**
- Verify: `tests/helpers/integration-suite.ts`, `tests/opencode/*.test.ts`, `tests/web/*.test.ts`

- [ ] **Step 1: Run type-check**

Run: `bun run --cwd tests type-check`

Expected: PASS.

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 2: Run integration checks**

Run: `bun run test:integration`

Expected: same behavior as current baseline. If every integration test passes, record pass count. If the known liveness baseline still fails, record that exact pre-existing failure and do not claim clean integration pass.

Run: `bun run test:integration:slow`

Expected: same behavior as current slow baseline. If slow tests require external model/provider setup and skip/fail as before, document the exact output.

- [ ] **Step 3: Run forbidden-pattern audit**

Run: `git diff main..HEAD -- tests | rg "^\+.*(pgrep|pkill|killall)"`

Expected: no matches in added lines. Do not use shell `pgrep`, `pkill`, or `killall`.

- [ ] **Step 4: Verify boilerplate reduction**

Run: `rg "const availability = await checkOpenCodeAvailable|const describeWhenOpenCode = availability\.available|let opencode: StartedOpenCode" tests/opencode tests/web`

Expected: only special custom-runtime suites remain, if any. The straightforward suites should import from `../helpers/integration-suite`.

- [ ] **Step 5: Inspect final diff**

Run: `git diff main..HEAD --stat -- tests/helpers tests/opencode tests/web`

Expected: one helper file added and integration test files mechanically simplified; no production source changes.
