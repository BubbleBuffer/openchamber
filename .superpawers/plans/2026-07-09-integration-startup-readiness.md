# Integration Startup Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `waitForHttp()` polling function so integration test suites (`test:web`, `test:opencode`) stop timing out in `beforeAll` hooks.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md` — Phase 1 (Section 5)

**Architecture:** Add a per-request `AbortSignal.timeout(2_000)` to each `fetch()` call inside `waitForHttp()` in `tests/helpers/opencode-process.ts`. Currently, a single stuck `fetch()` (TCP SYN retransmit while `opencode serve` binds but doesn't yet serve) blocks for 21–127s, making the outer deadline loop ineffective and blowing the vitest `beforeAll` hook timeout. The fix bounds each fetch to 2s, so the polling loop can check the deadline and exit promptly. This is a Node ≥20 native API (`AbortSignal.timeout`), consistent with existing precedent in `tests/web/sse-events.test.ts`.

**Tech Stack:** TypeScript, Node.js ≥20 (`AbortSignal.timeout`), Vitest, Node `net` module (for regression test)

---

### Task 1: Export `waitForHttp` for testability and write regression test

**Files:**
- Modify: `tests/helpers/opencode-process.ts` — export the `waitForHttp` function (currently module-private at line 183)
- Create: `tests/helpers/opencode-process.test.ts` — regression test proving bounded per-request timeout

- [ ] **Step 1: Export `waitForHttp`**

In `tests/helpers/opencode-process.ts`, change the function declaration from:

```typescript
async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
```

to:

```typescript
export async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
```

This is the only change to this function in this step. The fix itself comes in Task 2.

- [ ] **Step 2: Add `helpers/` to the vitest include glob**

In `tests/vitest.config.ts`, change the `include` array from:

```typescript
    include: ["opencode/**/*.test.ts", "web/**/*.test.ts"],
```

to:

```typescript
    include: ["opencode/**/*.test.ts", "web/**/*.test.ts", "helpers/**/*.test.ts"],
```

Note: `test:opencode`/`test:web`/`test:integration` are scoped by directory (`vitest run opencode web`), so they won't pick up the helper test. Only bare `vitest run` and explicit `helpers/...` commands will — which is the intent.

- [ ] **Step 3: Write the failing regression test**

Create `tests/helpers/opencode-process.test.ts` with this content:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createServer, type Server, type Socket } from "node:net"
import { waitForHttp } from "./opencode-process"

describe("waitForHttp", () => {
  let hangingServer: Server
  let port: number
  // Keep references to sockets so we can destroy them on teardown — otherwise
  // close() hangs waiting for accepted sockets to finish.
  const sockets = new Set<Socket>()

  beforeEach(async () => {
    hangingServer = createServer((socket) => {
      // Accept the TCP connection but never send an HTTP response.
      // This simulates the race where opencode has bound the port but the
      // HTTP server is not yet processing requests.
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    await new Promise<void>((resolve) => hangingServer.listen(0, "127.0.0.1", resolve))
    port = (hangingServer.address() as { port: number }).port
  })

  afterEach(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => hangingServer.close(() => resolve()))
  })

  it("rejects within a bounded time when the server accepts but never responds", async () => {
    // With the per-request timeout fix, each fetch aborts after 2s.
    // A 5s overall deadline means the function rejects well under the
    // OS TCP timeout (21s+) — observed ~8s in practice.
    // Without the fix, a single fetch hangs 21-127s (OS TCP timeout),
    // so this assertion fails against the unbounded code.
    const start = Date.now()
    await expect(
      waitForHttp(`http://127.0.0.1:${port}`, 5_000),
    ).rejects.toThrow()
    const elapsed = Date.now() - start
    // Should complete well under the OS TCP timeout (21s+).
    // Generous upper bound: 12s (5s deadline + 2s per-request timeout + slack).
    expect(elapsed).toBeLessThan(12_000)
  })
})
```

- [ ] **Step 4: Run test to verify it fails (red)**

Run: `bun run --cwd tests vitest run helpers/opencode-process.test.ts`
Expected: FAIL — the current `fetch()` has no per-request timeout, so `waitForHttp` hangs on the non-responsive server. The test will either time out at the 60s vitest `testTimeout` or take 21s+ and fail the `< 12_000ms` assertion.

- [ ] **Step 5: Apply the per-request timeout fix**

In `tests/helpers/opencode-process.ts`, the `waitForHttp` function body currently has (lines ~186–194):

```typescript
  while (Date.now() < deadline) {
    for (const urlPath of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${urlPath}`)
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
```

Change the `fetch` call to include a per-request timeout:

```typescript
  while (Date.now() < deadline) {
    for (const urlPath of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${urlPath}`, {
          signal: AbortSignal.timeout(2_000),
        })
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
```

- [ ] **Step 6: Inspect the diff**

Run: `git diff tests/helpers/opencode-process.ts tests/helpers/opencode-process.test.ts`
Expected: diff shows (1) `export` added to `waitForHttp`, (2) `"helpers/**/*.test.ts"` added to vitest include glob, (3) `signal: AbortSignal.timeout(2_000)` added to the fetch options object, (4) new test file created. No other changes.

- [ ] **Step 7: Run test to verify it passes (green)**

Run: `bun run --cwd tests vitest run helpers/opencode-process.test.ts`
Expected: PASS — `waitForHttp` now rejects within ~5s (deadline) instead of hanging 21s+.

- [ ] **Step 8: Commit**

```bash
git add tests/helpers/opencode-process.ts tests/helpers/opencode-process.test.ts tests/vitest.config.ts
git commit -m "fix(tests): bound waitForHttp fetch with per-request AbortSignal timeout"
```

---

### Task 2: Verify integration test suites pass

**Files:** None modified — verification only.

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: PASS (exit 0, all packages)

- [ ] **Step 2: Lint the tests package**

Run: `bun run --filter '@openchamber/tests' lint`
Expected: error count should not increase from baseline (40 errors). The new test file should be lint-clean.

- [ ] **Step 3: Run OpenCode integration tests**

Run: `bun run test:opencode`
Expected: PASS — all 10 opencode test files run without `beforeAll` timeout failures. This is the first time this suite can run successfully.

- [ ] **Step 4: Run web integration tests**

Run: `bun run test:web`
Expected: PASS — all 7 web test files run without `beforeAll` timeout failures. This suite was 100% failing (7/7 files timed out) before the fix.

- [ ] **Step 5: Run full integration suite**

Run: `bun run test:integration`
Expected: PASS — all 17 test files pass.

- [ ] **Step 6: Run store and react tests (regression check)**

Run: `bun run test:stores && bun run test:react`
Expected: PASS — 240 store tests + 72 react tests, no regressions.

- [ ] **Step 7: Commit verification record (optional)**

No code changes in Task 2. If all passes, the subplan is complete. No commit needed.
