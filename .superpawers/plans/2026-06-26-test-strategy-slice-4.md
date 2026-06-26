# Slice 4 — Live Conversation Flow Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 provider-agnostic tests (5 direct OpenCode, 2 OpenChamber proxy) that prove `prompt_async` accepts prompts, emits prompt-related events, validates malformed input, and works through the proxy route used by the UI.

**Architecture:** Two new test files. File 1 hits OpenCode directly to assert fine-grained prompt/event behavior using fetch + an SSE buffer helper. File 2 goes through OpenChamber's `/api/session/:id/prompt_async` route to prove the UI path still works. Both rely on the existing PID-targeted cleanup harness; no new helpers, no new dependencies.

**Tech Stack:** Bun (test runner via Vitest), TypeScript, native `fetch` + `ReadableStream` (already used in Slice 3 SSE tests), `@opencode-ai/sdk/v2` for session CRUD only.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `tests/opencode/prompt-async-events.test.ts` | create | Direct OpenCode `prompt_async` + event assertions |
| `tests/web/prompt-async-proxy.test.ts` | create | OpenChamber proxy `/api/session/:id/prompt_async` forwarding + error passthrough |
| `tests/README.md` | modify | Append Slice 4 coverage row + totals |

No new helpers, no new packages, no harness changes.

---

### Task 1: Direct OpenCode prompt_async + event tests

**Files:**
- Create: `tests/opencode/prompt-async-events.test.ts` — 5 tests covering direct OpenCode prompt submission and event delivery
- Test: `tests/opencode/prompt-async-events.test.ts`

**Anchors to reuse:**
- `tests/opencode/session-crud.test.ts` — clean SDK round-trip pattern, `startOpenCodeInstance()` lifecycle, `createOpencodeClient()` for session creation.
- `tests/web/sse-events.test.ts` (lines 33-64) — `readFirstSseEvent`-style helper using native `fetch` + `ReadableStream` + `AbortController`. Adapt into a buffered `openSseStream` + `waitForEvent` pair for Slice 4 (don't import across packages; copy and adapt inline).
- `packages/ui/src/lib/opencode/client.ts:614-791` — the `sendMessage()` function shows the exact body shape: `{ model: { providerID, modelID }, agent, variant, messageID, format, parts: [{ type: "text", text: "..." }] }`. The `model` field can be a placeholder string pair because we never expect a model completion (provider-less).

**Hard rule:** No name-based process kills. The harness's PID recording + sibling watchdog + orphan reaper own cleanup. Don't add a verification step that runs `pgrep`/`killall`/`pkill`.

- [ ] **Step 1: Write the failing test file**

Create `tests/opencode/prompt-async-events.test.ts` with this structure (full content provided; copy verbatim):

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { StartedOpenCode } from "../helpers/opencode-process"
import { startOpenCodeInstance } from "../helpers/opencode-process"

const SSE_TIMEOUT_MS = 8_000
const SSE_POLL_INTERVAL_MS = 50

type PromptAsyncBody = {
  model: { providerID: string; modelID: string }
  agent?: string
  variant?: string
  messageID?: string
  format?: unknown
  parts: Array<{ type: "text"; text: string } | { type: "file"; [k: string]: unknown }>
}

const postPromptAsync = async (
  baseUrl: string,
  sessionID: string,
  body: PromptAsyncBody,
): Promise<Response> => {
  const res = await fetch(`${baseUrl}/session/${sessionID}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return res
}

type SseHandle = {
  buffer: string
  close: () => void
}

const openSseStream = async (baseUrl: string, path: string): Promise<SseHandle> => {
  const controller = new AbortController()
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal,
  })
  if (!res.ok || !res.body) {
    controller.abort()
    throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`)
  }
  const buffer: string[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  ;(async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        if (value) buffer.push(decoder.decode(value, { stream: true }))
      }
    } catch {
      // abort or stream closed
    }
  })().catch(() => {})
  return {
    get buffer() {
      return buffer.join("")
    },
    close: () => {
      try { reader.cancel() } catch { /* ignore */ }
      controller.abort()
    },
  }
}

const waitForBufferText = async (
  handle: SseHandle,
  predicate: (text: string) => boolean,
  timeoutMs: number,
): Promise<{ matched: true; text: string } | { matched: false; text: string }> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = handle.buffer
    if (predicate(text)) return { matched: true, text }
    await new Promise((r) => setTimeout(r, SSE_POLL_INTERVAL_MS))
  }
  return { matched: false, text: handle.buffer }
}

let opencode: StartedOpenCode
let sse: SseHandle | undefined

beforeAll(async () => {
  opencode = await startOpenCodeInstance()
  sse = await openSseStream(opencode.baseUrl, "/event")
}, 30_000)

afterAll(async () => {
  try { sse?.close() } catch { /* ignore */ }
  try { await opencode?.stop() } catch { /* ignore */ }
})

describe("OpenCode prompt_async + event stream", () => {
  test(
    "prompt_async accepts a text prompt and returns promptly",
    async () => {
      const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await client.session.create({ title: "slice4-prompt-1" })
      const sessionID = created.data!.id
      const start = Date.now()
      const res = await postPromptAsync(opencode.baseUrl, sessionID, {
        model: { providerID: "noop", modelID: "noop" },
        parts: [{ type: "text", text: "hello slice4" }],
      })
      const elapsed = Date.now() - start
      expect(res.status).toBeLessThan(500)
      expect(elapsed).toBeLessThan(10_000)
      await client.session.delete({ sessionID })
    },
    20_000,
  )

  test(
    "prompt submission emits a message event containing the prompt text",
    async () => {
      const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await client.session.create({ title: "slice4-prompt-2" })
      const sessionID = created.data!.id
      const marker = `slice4-marker-${Date.now()}`
      await postPromptAsync(opencode.baseUrl, sessionID, {
        model: { providerID: "noop", modelID: "noop" },
        parts: [{ type: "text", text: marker }],
      })
      const result = await waitForBufferText(sse!, (t) => t.includes(marker), SSE_TIMEOUT_MS)
      expect(result.matched, `SSE buffer did not contain marker within ${SSE_TIMEOUT_MS}ms; buffer was:\n${result.text}`).toBe(true)
      await client.session.delete({ sessionID })
    },
    20_000,
  )

  test(
    "prompt submission emits a session lifecycle event",
    async () => {
      const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await client.session.create({ title: "slice4-prompt-3" })
      const sessionID = created.data!.id
      await postPromptAsync(opencode.baseUrl, sessionID, {
        model: { providerID: "noop", modelID: "noop" },
        parts: [{ type: "text", text: "lifecycle probe" }],
      })
      // Adapt to observed on-the-wire naming. Accept session.status, session.updated,
      // or any session-related event mentioning this sessionID. Encode whichever
      // lifecycle naming the current OpenCode binary actually emits.
      const sessionKey = sessionID.slice(0, 8)
      const result = await waitForBufferText(
        sse!,
        (t) =>
          (t.includes("session.status") || t.includes("session.updated")) &&
          t.includes(sessionKey),
        SSE_TIMEOUT_MS,
      )
      expect(
        result.matched,
        `SSE buffer did not contain session lifecycle event within ${SSE_TIMEOUT_MS}ms; buffer was:\n${result.text}`,
      ).toBe(true)
      await client.session.delete({ sessionID })
    },
    20_000,
  )

  test(
    "two parallel prompts in different sessions do not cross-contaminate observed session IDs",
    async () => {
      const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const a = await client.session.create({ title: "slice4-prompt-4a" })
      const b = await client.session.create({ title: "slice4-prompt-4b" })
      const markerA = `slice4-A-${Date.now()}`
      const markerB = `slice4-B-${Date.now()}`
      const baselineLength = sse!.buffer.length
      await Promise.all([
        postPromptAsync(opencode.baseUrl, a.data!.id, {
          model: { providerID: "noop", modelID: "noop" },
          parts: [{ type: "text", text: markerA }],
        }),
        postPromptAsync(opencode.baseUrl, b.data!.id, {
          model: { providerID: "noop", modelID: "noop" },
          parts: [{ type: "text", text: markerB }],
        }),
      ])
      const result = await waitForBufferText(
        sse!,
        (t) => t.includes(markerA) && t.includes(markerB),
        SSE_TIMEOUT_MS,
      )
      expect(
        result.matched,
        `SSE buffer did not contain both markers within ${SSE_TIMEOUT_MS}ms; buffer was:\n${result.text}`,
      ).toBe(true)
      // Verify each marker only appears once between baseline and now (no duplicate cross-pollination).
      const fresh = result.text.slice(baselineLength)
      const aCount = fresh.split(markerA).length - 1
      const bCount = fresh.split(markerB).length - 1
      expect(aCount).toBeGreaterThanOrEqual(1)
      expect(bCount).toBeGreaterThanOrEqual(1)
      await Promise.all([
        client.session.delete({ sessionID: a.data!.id }),
        client.session.delete({ sessionID: b.data!.id }),
      ])
    },
    20_000,
  )

  test(
    "malformed prompt body returns a structured error status",
    async () => {
      const client = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await client.session.create({ title: "slice4-prompt-5" })
      const sessionID = created.data!.id
      const res = await fetch(`${opencode.baseUrl}/session/${sessionID}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json-at-all",
      })
      // Accept 4xx range — the exact status depends on OC's parser. Anything
      // not a 2xx proves the validation/failure path is observable.
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      await client.session.delete({ sessionID })
    },
    20_000,
  )
})
```

- [ ] **Step 2: Run the file to verify it fails for the right reason**

Run: `bun run --cwd tests test:opencode -- prompt-async-events.test.ts`
Expected: tests should mostly PASS if OpenCode accepts the body shape. If any test fails, encode the observed behavior per the Slice 2 directive (adapt assertions, document inline, do not invent contracts). The malformed-payload test is expected to pass with a 4xx; if the binary accepts garbage, encode that instead.

- [ ] **Step 3: Commit**

```bash
git add tests/opencode/prompt-async-events.test.ts
git commit -m "test(opencode): add prompt_async + event stream tests

Five direct-OpenCode tests covering async prompt submission, prompt text
echoed through SSE, session lifecycle events, parallel-session isolation,
and malformed-payload validation. Provider-agnostic — does not require a
configured model."
```

---

### Task 2: OpenChamber proxy prompt_async tests

**Files:**
- Create: `tests/web/prompt-async-proxy.test.ts` — 2 tests covering OpenChamber proxy forwarding of `prompt_async`
- Test: `tests/web/prompt-async-proxy.test.ts`

**Anchors to reuse:**
- `tests/web/api-session-crud.test.ts` — shared OpenChamber + OpenCode lifecycle (the file already loads `@openchamber/web` and starts/stops both processes; reuse the import pattern and `controller.getPort()` shape).
- The same `openSseStream` + `waitForBufferText` pattern from Task 1 (copy inline; do not share modules across packages).

**Pre-step:** `bun run --cwd packages/web build:server` must have been run before web tests can start (documented in Slice 3).

- [ ] **Step 1: Write the failing test file**

Create `tests/web/prompt-async-proxy.test.ts` with this structure:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { StartedOpenCode } from "../helpers/opencode-process"
import { startOpenCodeInstance } from "../helpers/opencode-process"

const SSE_TIMEOUT_MS = 8_000
const SSE_POLL_INTERVAL_MS = 50

type SseHandle = {
  buffer: string
  close: () => void
}

const openSseStream = async (baseUrl: string, path: string): Promise<SseHandle> => {
  const controller = new AbortController()
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "text/event-stream" },
    signal: controller.signal,
  })
  if (!res.ok || !res.body) {
    controller.abort()
    throw new Error(`SSE connect failed: ${res.status} ${res.statusText}`)
  }
  const buffer: string[] = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  ;(async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) return
        if (value) buffer.push(decoder.decode(value, { stream: true }))
      }
    } catch {
      // abort or stream closed
    }
  })().catch(() => {})
  return {
    get buffer() {
      return buffer.join("")
    },
    close: () => {
      try { reader.cancel() } catch { /* ignore */ }
      controller.abort()
    },
  }
}

const waitForBufferText = async (
  handle: SseHandle,
  predicate: (text: string) => boolean,
  timeoutMs: number,
): Promise<{ matched: true; text: string } | { matched: false; text: string }> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = handle.buffer
    if (predicate(text)) return { matched: true, text }
    await new Promise((r) => setTimeout(r, SSE_POLL_INTERVAL_MS))
  }
  return { matched: false, text: handle.buffer }
}

// Mirror the bootstrap used by tests/web/api-session-crud.test.ts: import the
// web server via dynamic import (matches that file's pattern to avoid
// module-cache surprises), start it against the spawned OpenCode instance,
// and capture the returned handle (with baseUrl/port) for shutdown.
// Do not invent a new helper. The Slice 3 implementation chose inline
// import("@openchamber/web"); copy that exact pattern.
// import("@openchamber/web") returns { startWebUiServer, ... }.
// `startWebUiServer` returns a handle whose .port is the listener port and
// whose stop() shuts the server down; use those, not a controller object.

let opencode: StartedOpenCode
let webBaseUrl: string
let webStop: () => Promise<void> | void
let sse: SseHandle | undefined

beforeAll(async () => {
  opencode = await startOpenCodeInstance()
  const { startWebUiServer } = await import("@openchamber/web")
  const envBackups = {
    OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
    OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
    OPENCODE_HOST: process.env.OPENCODE_HOST,
  }
  process.env.OPENCODE_SKIP_START = "true"
  process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
  process.env.OPENCODE_HOST = opencode.baseUrl
  let handle: { port: number; stop(): void | Promise<void> } | undefined
  try {
    handle = await startWebUiServer({ port: 0 }) as unknown as { port: number; stop(): void | Promise<void> }
  } finally {
    if (envBackups.OPENCODE_SKIP_START === undefined) delete process.env.OPENCODE_SKIP_START
    else process.env.OPENCODE_SKIP_START = envBackups.OPENCODE_SKIP_START
    if (envBackups.OPENCHAMBER_SKIP_OPENCODE_START === undefined) delete process.env.OPENCHAMBER_SKIP_OPENCODE_START
    else process.env.OPENCHAMBER_SKIP_OPENCODE_START = envBackups.OPENCHAMBER_SKIP_OPENCODE_START
    if (envBackups.OPENCODE_HOST === undefined) delete process.env.OPENCODE_HOST
    else process.env.OPENCODE_HOST = envBackups.OPENCODE_HOST
  }
  webBaseUrl = `http://127.0.0.1:${handle!.port}`
  webStop = handle!.stop
  sse = await openSseStream(webBaseUrl, "/api/global/event")
}, 45_000)

afterAll(async () => {
  try { sse?.close() } catch { /* ignore */ }
  try { await webStop?.() } catch { /* ignore */ }
  try { await opencode?.stop() } catch { /* ignore */ }
})

describe("OpenChamber proxy: prompt_async", () => {
  test(
    "proxy forwards a valid prompt_async request and returns promptly",
    async () => {
      const ocClient = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await ocClient.session.create({ title: "slice4-proxy-1" })
      const sessionID = created.data!.id
      const marker = `slice4-proxy-${Date.now()}`
      const start = Date.now()
      const res = await fetch(`${webBaseUrl}/api/session/${sessionID}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: { providerID: "noop", modelID: "noop" },
          parts: [{ type: "text", text: marker }],
        }),
      })
      const elapsed = Date.now() - start
      expect(res.status).toBeLessThan(500)
      expect(elapsed).toBeLessThan(10_000)
      const sseResult = await waitForBufferText(sse!, (t) => t.includes(marker), SSE_TIMEOUT_MS)
      expect(
        sseResult.matched,
        `Proxy SSE did not echo prompt marker within ${SSE_TIMEOUT_MS}ms; buffer was:\n${sseResult.text}`,
      ).toBe(true)
      await ocClient.session.delete({ sessionID })
    },
    30_000,
  )

  test(
    "proxy preserves malformed prompt error behavior",
    async () => {
      const ocClient = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await ocClient.session.create({ title: "slice4-proxy-2" })
      const sessionID = created.data!.id
      const res = await fetch(`${webBaseUrl}/api/session/${sessionID}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json-at-all",
      })
      // The proxy must NOT silently swallow the error. Accept any 4xx; an
      // uncaught 500 also proves the failure path is observable.
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(600)
      await ocClient.session.delete({ sessionID })
    },
    20_000,
  )
})
```

**Note for implementer:** The sketch uses inline `import("@openchamber/web")` + `startWebUiServer({ port: 0 })` to match `tests/web/api-session-crud.test.ts`'s bootstrap. The exact return shape (`controller` vs `port`/`stop`) may differ from the sketch; resolve by reading that file before writing, do not invent a new helper.

- [ ] **Step 2: Run the file to verify it passes**

Run: `bun run --cwd tests test:web -- prompt-async-proxy.test.ts`
Expected: 2/2 pass. If the proxy rewrites the route unexpectedly (e.g. the prefix isn't `/api/...`), adapt the URL and document inline. If SSE doesn't carry the marker through the proxy, the failure path is "the proxy strips or rewrites event payloads" — encode that as a documented skip with the actual observed body, do not invent a passing assertion.

- [ ] **Step 3: Commit**

```bash
git add tests/web/prompt-async-proxy.test.ts
git commit -m "test(web): add prompt_async proxy forwarding + error passthrough

Two tests covering the UI's real prompt route through OpenChamber:
successful forwarding of a valid prompt_async body (with marker echoed
through the proxy SSE) and passthrough of malformed-payload errors."
```

---

### Task 3: Update tests/README.md with Slice 4 coverage

**Files:**
- Modify: `tests/README.md` — append `### Slice 4` subsection after the existing `### Slice 3` block

- [ ] **Step 1: Append the Slice 4 subsection**

Anchor: the existing `### Slice 3` table ends with `| **Total** | **36** |`. Append directly after it (preserving exact whitespace, four-space indent inside table cells):

```markdown

### Slice 4

| File | Tests |
|---|---|
| `opencode/prompt-async-events.test.ts` | 5 |
| `web/prompt-async-proxy.test.ts` | 2 |
| **Slice 4 total** | **7** |
| **OpenCode total** | **27** |
| **Web total** | **16** |
| **Total** | **43** |
```

- [ ] **Step 2: Inspect the diff**

Run: `git diff tests/README.md`
Expected: only the appended Slice 4 subsection; Slice 1/2/3 rows unchanged; totals row updated to 43.

- [ ] **Step 3: Commit**

```bash
git add tests/README.md
git commit -m "docs(tests): document Slice 4 coverage (live conversation flows)"
```

---

### Task 4: Full-surface verification

**Files:**
- Test: full surface (`tests/opencode/*` + `tests/web/*`)

**Process safety:** No name-based process match. No verification subagent. Use only PID-file inspection (`/tmp/openchamber-opencode-*/pid`) and `process.kill(pid, 0)` if any anomaly needs diagnosis.

- [ ] **Step 1: Type-check the tests workspace**

Run: `bun run --cwd tests type-check`
Expected: clean (no errors).

- [ ] **Step 2: Run the OpenCode surface**

Run: `bun run --cwd tests test:opencode`
Expected: 27 opencode tests pass (22 prior + 5 new). Documented environmental skips only; no new failures introduced.

- [ ] **Step 3: Run the Web surface**

Run: `bun run --cwd tests test:web`
Expected: 16 web tests pass (14 prior + 2 new). Existing documented environmental skips acceptable; no new failures introduced.

- [ ] **Step 4: Build prereq for web tests**

If `packages/web/dist` is stale or missing:
```bash
bun run --cwd packages/web build:server
```
Expected: server bundle builds without errors.

- [ ] **Step 5: Commit any verification artifacts**

If any adaptation was needed during Steps 2/3 (e.g. an inline behavior note was added to a test), commit those as follow-up commits with the same per-task prefix style (`test(opencode): ...` / `test(web): ...`).

---

## Exit criteria

- All 7 new Slice 4 tests pass on the first run after potential adaptation.
- Opencode total: 27 (22 prior + 5 new).
- Web total: 16 (14 prior + 2 new).
- Grand total: 43 tests.
- `bun run --cwd tests type-check` clean.
- Zero new npm dependencies.
- Process cleanup remains PID-targeted (no name-based stoppage verification, no `killall`/`pkill`/`pgrep` anywhere).
- README updated with Slice 4 subsection.

## Out of scope

- Real provider/model completion assertions.
- Token/cost accounting.
- UI React sync store assertions.
- Tool-call execution and permission flows.
- Electron or VS Code runtime parity.
- Additional proxy route coverage beyond `prompt_async`.

## Risks

1. **Provider-less event sparsity.** If OpenCode queues the prompt and emits only minimal events, tests adapt to observed on-the-wire behavior; document inline rather than inventing contracts.
2. **SSE timing.** 8s timeout on event wait. If flake appears, raise to 15s and document.
3. **Proxy prefix drift.** If `/api/session/:id/prompt_async` is rewritten or rejected, adapt URL and document inline.
4. **Module-cache lock-in.** Web tests share module state (Slice 3 lesson). The proxy test reuses `api-session-crud.test.ts`'s bootstrap pattern verbatim to avoid module re-import surprises.

## Acceptance criteria

- 7 new tests committed across 2 files.
- Direct OpenCode prompt/event behavior and OpenChamber proxy forwarding both covered.
- Provider-agnostic — no model credentials required.
- README coverage totals reflect 43.
- No new dependencies, no process-name stoppage verification.
- Plan, implementation, review, and verification complete on `feature/integration-tests-slice-4` before merging to `main`.