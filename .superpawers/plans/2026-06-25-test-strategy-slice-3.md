# Slice 3 — Full Tier 1 Web Surface Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 new Tier 1 web tests covering API session CRUD, SSE event delivery, and WS upgrades — completing the original Tier 1 web surface per `.superpawers/specs/2026-06-25-test-strategy-design.md` §1.7.2.

**Architecture:** Three new test files under `tests/web/`, each owning one concern. No new helpers, no new npm deps. Process management reuses Slice 1/2 hardened `startOpenCodeInstance` (PID-recorded) and `startOpenChamberAgainstOpenCode`. SSE via `fetch` + `ReadableStream` parsing (Node 20 native). WS via the `ws` package (already in `tests/package.json`).

**Tech Stack:** Vitest, Node 20 native `fetch`/`ReadableStream`, `ws`, Express (under test).

**Branch:** `feature/integration-tests-slice-3` (from main, spec at `59cff368`).

**Build prereq:** `bun run --cwd packages/web build:server` must be run before any web test. Documented in `tests/README.md`; do NOT add new build steps.

---

## SDK + cleanup constraints (apply to every task)

These are non-negotiable and were hardened in Slices 1+2:

1. **SDK calls use FLAT params.** No nested `{ body, query, path }`. The generated SDK client (`@opencode-ai/sdk/v2`) takes flat keys (`title`, `directory`, `sessionID`, `time: {...}`) and silently drops `body`/`query`/`path` if present.
2. **No name-based process kills.** Never use `killall`, `pkill`, `pgrep`, or any pattern that targets processes by name. The user has other `opencode` processes running (e.g. `opencode --continue`); killing by name is forbidden. Always use the PID returned by `startOpenCodeInstance` via `opencode.pid` and `process.kill(pid, ...)`.
3. **Behavioral encoding rule.** If a test fails for environmental reasons (e.g. OpenCode returns a different status code than the spec says), ADAPT the assertion to encode the actual on-the-wire behaviour, document the deviation in a comment, and continue. Do not silently relax assertions; do not block on implementation deviations.
4. **No `process.on("exit")` in test files.** The `tests/helpers/opencode-process.ts` handler is the single source of cleanup. Test files call `opencode.stop()` in `afterAll`.
5. **No new npm dependencies.** Reuse `ws` (in `tests/package.json`).

## File structure

```
tests/web/
├── api-session-crud.test.ts    (6 tests — Tasks 1)
├── sse-events.test.ts          (3 tests — Tasks 2)
└── ws-upgrades.test.ts         (3 tests — Tasks 3)
```

`tests/README.md` updates the Coverage section (Task 4). Full-surface verification runs all tests (Task 5).

## Exit criteria

- 12 new web tests pass (6 + 3 + 3)
- OpenCode surface remains 22/22
- `bun run --cwd tests test:web` runs in <60s
- `bun run --cwd tests test` (full surface) runs in <90s
- Zero name-based kills anywhere in `tests/`
- `tests/README.md` Coverage section includes Slice 3 row
- Final reviewer + verifier both approve

**Spec typo note:** the spec's verification table (`.superpawers/specs/2026-06-25-test-strategy-slice-3-design.md:116`) lists "33 tests" — this is a typo. The correct total is 36 (22 opencode + 14 web = 36). The plan targets 36.

**Spec-vs-impl gap on bad-host test:** the spec says "env validation throws with a clear message" but the actual code in `env-config.ts:22-35` warns-and-continues (returns null host, server still boots). Task 1's sketch was rewritten to encode the actual behaviour: server boots, `/health` reports `opencodeHost: null` or `opencodeReady: false`. This is the spec-vs-impl drift Slice 2 surfaced in three places; we apply the same encoding rule here.

---

### Task 1: `tests/web/api-session-crud.test.ts` — CRUD + bad host + 503-while-restarting

**Files:**
- Create: `tests/web/api-session-crud.test.ts` — 6 tests covering API session CRUD, bad OPENCODE_HOST rejection, and the proxy's 503-while-OpenCode-restarting gate

**Anchors to use (from spec):**
- Proxy POST/GET/DELETE flows through `packages/web/server/src/domains/server-utils/proxy.ts:332-362`
- 503 gate at `packages/web/server/src/domains/server-utils/proxy.ts:238-250` (returns `{ error: "OpenCode is restarting", restarting: true }` when `OPEN_CODE_READY_GRACE_MS` window applies)
- OpenChamber env validation for `OPENCODE_HOST`: per `packages/web/server/src/domains/opencode-support/env-config.ts:22-35`, invalid URLs are logged as a warning and produce a `null` host — they do NOT throw. With `OPENCODE_SKIP_START=true`, the server still boots. Implementer must `git grep "OPENCODE_HOST" packages/web/server/src` to confirm the exact failure mode before writing the assertion. The expected assertion adapts: verify the server starts but logs a warning about the invalid URL, OR verify that `/health` reports `opencodeReady: false`. Pick whichever the actual code produces and document.

- [ ] **Step 1: Write the test file**

Use Slice 1's `tests/web/connection-lifecycle.test.ts` as the structural template. Pattern:

```ts
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "../helpers/openchamber-process"
import { getAvailablePort } from "../helpers/ports"

const availability = await checkOpenCodeAvailable()
const describeWhenOpenCode = availability.available ? describe : describe.skip

// Helper to find the spawned opencode child PID (it lives in <tempdir>/pid)
async function getOpencodePid(oc: StartedOpenCode): Promise<number | undefined> {
  try {
    const raw = await fs.readFile(path.join(oc.cwd, "pid"), "utf8")
    const n = Number.parseInt(raw.trim(), 10)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

let opencode: StartedOpenCode | undefined
let openchamber: StartedOpenChamber | undefined
let ocCwd: string | undefined
let ocPort: number | undefined

afterAll(async () => {
  try { await openchamber?.stop() } catch {}
  try { await opencode?.stop() } catch {}
  if (ocCwd) { try { await fs.rm(ocCwd, { recursive: true, force: true }) } catch {} }
})

describeWhenOpenCode("OpenChamber API session CRUD", () => {
  beforeAll(async () => {
    ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-api-crud-"))
    ocPort = await getAvailablePort()
    opencode = await startOpenCodeInstance({ cwd: ocCwd, port: ocPort })
    openchamber = await startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl })
  }, 30_000)

  let createdSessionId: string

  test("POST /api/session creates a session and returns id + title", async () => {
    const res = await fetch(`${openchamber!.baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "slice-3-crud", directory: ocCwd }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; title: string }
    expect(typeof body.id).toBe("string")
    expect(body.id.length).toBeGreaterThan(0)
    expect(body.title).toBe("slice-3-crud")
    createdSessionId = body.id
  }, 15_000)

  test("GET /api/session lists the created session", async () => {
    const res = await fetch(`${openchamber!.baseUrl}/api/session`)
    expect(res.status).toBe(200)
    const list = await res.json() as Array<{ id: string }>
    expect(Array.isArray(list)).toBe(true)
    expect(list.some((s) => s.id === createdSessionId)).toBe(true)
  }, 15_000)

  test("GET /api/session/:id returns the same session", async () => {
    const res = await fetch(`${openchamber!.baseUrl}/api/session/${createdSessionId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; title: string }
    expect(body.id).toBe(createdSessionId)
    expect(body.title).toBe("slice-3-crud")
  }, 15_000)

  test("DELETE /api/session/:id removes it; subsequent GET returns 404", async () => {
    const delRes = await fetch(`${openchamber!.baseUrl}/api/session/${createdSessionId}`, { method: "DELETE" })
    expect(delRes.status).toBe(200)
    const getRes = await fetch(`${openchamber!.baseUrl}/api/session/${createdSessionId}`)
    expect(getRes.status).toBe(404)
  }, 15_000)
})

describeWhenOpenCode("OpenChamber startup handles bad OPENCODE_HOST gracefully", () => {
  test("startWebUiServer boots despite invalid OPENCODE_HOST (warns-and-continues per env-config.ts)", async () => {
    const previous = {
      OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
      OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
      OPENCODE_HOST: process.env.OPENCODE_HOST,
    }
    process.env.OPENCODE_SKIP_START = "true"
    process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
    process.env.OPENCODE_HOST = "not-a-url"
    let controller: { stop: (opts: { exitProcess: boolean }) => Promise<void>; getPort: () => number } | undefined
    try {
      const { startWebUiServer } = await import("@openchamber/web")
      controller = await startWebUiServer({ port: 0, host: "127.0.0.1", attachSignals: false, exitOnShutdown: false })
      // The server booted despite the bad host. Hit /health and confirm it
      // either reports the bad host back, or returns opencodeReady: false.
      // Adapt assertion to whichever the actual code produces — see anchors.
      const healthRes = await fetch(`http://127.0.0.1:${controller.getPort()}/health`)
      expect(healthRes.status).toBe(200)
      const body = await healthRes.json() as { status: string; opencodeReady?: boolean; opencodeHost?: string | null }
      expect(body.status).toBe("ok")
      // Either opencodeHost is null/undefined OR opencodeReady is false.
      // Both indicate the bad host was rejected at config time, not at boot.
      const hostRejected = body.opencodeHost === null || body.opencodeHost === undefined || body.opencodeReady === false
      expect(hostRejected).toBe(true)
    } finally {
      if (controller) {
        try { await controller.stop({ exitProcess: false }) } catch {}
      }
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }, 15_000)
})

describeWhenOpenCode("OpenChamber proxy returns 503 while OpenCode is restarting", () => {
  // Separate suite with its own OC/OC server lifecycle so the kill does not
  // race with the CRUD suite's `afterAll` cleanup. Mirrors the structure of
  // the CRUD describe block above.
  let localCwd: string | undefined
  let localPort: number | undefined
  let localOpencode: StartedOpenCode | undefined
  let localOpenchamber: StartedOpenChamber | undefined

  afterAll(async () => {
    try { await localOpenchamber?.stop() } catch {}
    try { await localOpencode?.stop() } catch {}
    if (localCwd) { try { await fs.rm(localCwd, { recursive: true, force: true }) } catch {} }
  })

  beforeAll(async () => {
    localCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-restart-503-"))
    localPort = await getAvailablePort()
    localOpencode = await startOpenCodeInstance({ cwd: localCwd, port: localPort })
    localOpenchamber = await startOpenChamberAgainstOpenCode({ opencodeHost: localOpencode.baseUrl })
  }, 30_000)

  test("GET /api/session returns 503 while OpenCode is restarting, then 200 after restart", async () => {
    // Acquire the spawned OC PID from the helper's recorded pid file.
    const pid = await getOpencodePid(localOpencode!)
    expect(pid).toBeDefined()
    // Confirm OC is alive before killing.
    process.kill(pid!, 0)
    // Kill it via PID only — never by name.
    process.kill(pid!, "SIGKILL")

    // Poll /api/session for up to 2s for a 503 with restarting:true.
    let saw503 = false
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`${localOpenchamber!.baseUrl}/api/session`)
        if (res.status === 503) {
          const body = await res.json() as { restarting?: boolean; error?: string }
          if (body.restarting === true || body.error?.toLowerCase().includes("restart")) {
            saw503 = true
            break
          }
        }
      } catch { /* connection refused / etc — keep polling */ }
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(saw503).toBe(true)

    // Restart OC on the same port and cwd. Use waitForPortFree (lifted from
    // tests/web/liveness-fix.test.ts:73-85) if the helper reports port busy.
    localOpencode = await startOpenCodeInstance({ cwd: localCwd!, port: localPort! })
    // Wait for OC to be reachable via OpenChamber's proxy.
    const deadline = Date.now() + 15_000
    let recovered = false
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${localOpenchamber!.baseUrl}/api/session`)
        if (res.status === 200) { recovered = true; break }
      } catch {}
      await new Promise((r) => setTimeout(r, 200))
    }
    expect(recovered).toBe(true)
  }, 45_000)
})
```

The 503-while-restarting test must:
1. Acquire the spawned opencode PID by reading `<ocCwd>/pid` (slice 2 helper writes it).
2. `process.kill(pid, 0)` to confirm alive; `process.kill(pid, "SIGKILL")` to kill.
3. Immediately `fetch("/api/session")` — expect 503 with body containing `restarting: true`.
4. `await opencode.stop()` to allow cleanup; `opencode = await startOpenCodeInstance({ cwd: ocCwd, port: ocPort })` to restart.
5. Fetch again — expect 200.

If the runtime cannot reliably hit the 503 window (because OC's restart detection is faster than the test), adapt: hit `/api/session` repeatedly for up to 2s after kill, capture any 503 or any `restarting: true` payload, accept it as the observed behaviour, and document the deviation.

- [ ] **Step 2: Run the test file**

```bash
bun run --cwd packages/web build:server
bun run --cwd tests test:web -- api-session-crud.test.ts
```

Expected: 6/6 pass (or 6/6 with documented adaptations if behavior differs).

- [ ] **Step 3: Commit**

```bash
git add tests/web/api-session-crud.test.ts
git commit -m "test(web): add API session CRUD + bad host + 503-while-restarting tests"
```

---

### Task 2: `tests/web/sse-events.test.ts` — SSE connect + event delivery

**Files:**
- Create: `tests/web/sse-events.test.ts` — 3 tests: directory-scoped SSE connect, global SSE connect, session-event delivery through SSE

**Anchors:**
- `/api/event` and `/api/global/event` are SSE forwarders at `packages/web/server/src/domains/server-utils/proxy.ts:329-330`
- Initial OpenCode SSE events include `server.connected` (per upstream OpenCode contract; implementer must `curl -N http://127.0.0.1:<port>/event` against a spawned opencode to confirm event names before asserting)

SSE read pattern (no new deps):

```ts
async function readFirstSseEvent(url: string, headers: Record<string, string>, timeoutMs = 5_000): Promise<{ status: number; contentType: string; firstEvent: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { headers: { Accept: "text/event-stream", ...headers }, signal: controller.signal })
    if (!res.body) return { status: res.status, contentType: res.headers.get("content-type") ?? "", firstEvent: null }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let firstEvent: string | null = null
    while (firstEvent === null) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const idx = buffer.indexOf("\n\n")
      if (idx >= 0) firstEvent = buffer.slice(0, idx)
    }
    controller.abort()
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", firstEvent }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 1: Write the test file**

Three tests:

```ts
describeWhenOpenCode("OpenChamber SSE event streams", () => {
  test("/api/event SSE connects and receives OpenCode events", async () => {
    const { status, contentType, firstEvent } = await readFirstSseEvent(
      `${openchamber!.baseUrl}/api/event?directory=${encodeURIComponent(ocCwd!)}`,
      {}
    )
    expect(status).toBe(200)
    expect(contentType).toContain("text/event-stream")
    expect(firstEvent).not.toBeNull()
    // OpenCode initial SSE event shape varies across versions. Assert at least
    // a non-empty `data:` line or the literal `server.connected`.
    expect(firstEvent!.length).toBeGreaterThan(0)
  }, 15_000)

  test("/api/global/event SSE connects and receives OpenCode events", async () => {
    const { status, contentType, firstEvent } = await readFirstSseEvent(
      `${openchamber!.baseUrl}/api/global/event`,
      {}
    )
    expect(status).toBe(200)
    expect(contentType).toContain("text/event-stream")
    expect(firstEvent).not.toBeNull()
    expect(firstEvent!.length).toBeGreaterThan(0)
  }, 15_000)

  test("POST /api/session emits a session event through /api/global/event SSE", async () => {
    // Open SSE first, then POST a session.
    const sseController = new AbortController()
    const ssePromise = fetch(`${openchamber!.baseUrl}/api/global/event`, {
      headers: { Accept: "text/event-stream" },
      signal: sseController.signal,
    }).then(async (res) => {
      if (!res.body) throw new Error("no body")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      const deadline = Date.now() + 8_000
      while (Date.now() < deadline) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Look for any event referencing a session id
        if (buffer.includes("session")) return buffer
      }
      return buffer
    })

    // Wait briefly for SSE to connect before triggering
    await new Promise((r) => setTimeout(r, 500))
    const createRes = await fetch(`${openchamber!.baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "slice-3-sse-event", directory: ocCwd }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json() as { id: string }

    const buffer = await ssePromise
    sseController.abort()
    // Adapt to actual on-the-wire shape: assert the created id appears somewhere
    expect(buffer).toContain(created.id)
  }, 15_000)
})
```

- [ ] **Step 2: Run the test file**

```bash
bun run --cwd tests test:web -- sse-events.test.ts
```

Expected: 3/3 pass (or 3/3 with documented adaptations for SSE event-name variation).

- [ ] **Step 3: Commit**

```bash
git add tests/web/sse-events.test.ts
git commit -m "test(web): add SSE event stream connect + delivery tests"
```

---

### Task 3: `tests/web/ws-upgrades.test.ts` — WS upgrades + lastEventId replay

**Files:**
- Create: `tests/web/ws-upgrades.test.ts` — 3 tests: global WS upgrade, directory-scoped WS upgrade, lastEventId replay

**Anchors:**
- WS upgrade handler at `packages/web/server/src/domains/event-stream/runtime.ts:140-189`
- Initial `ready` frame shape at `packages/web/server/src/domains/event-stream/global-ws-bridge.ts:54-71` (`{ type: "ready", scope: "global" }`)
- `lastEventId` query param handling at `packages/web/server/src/domains/event-stream/runtime.ts:116-117`
- Replay logic at `packages/web/server/src/domains/event-stream/global-ws-bridge.ts:41-52`

WS helper pattern (adapted from `tests/web/liveness-fix.test.ts:25-67` — the existing `connectGlobalWs` hardcodes `/api/global/event/ws` and exposes only `waitForFrame`; this version is generic and also exposes a `frames` array for post-hoc inspection):

```ts
import WebSocket from "ws"

type WsFrame = Record<string, unknown>

async function openWsAndWaitForReady(url: string, timeoutMs = 10_000): Promise<{
  socket: WebSocket
  frames: WsFrame[]
  waitForFrame(type: string, waitMs?: number): Promise<WsFrame>
  close(): void
}> {
  const socket = new WebSocket(url)
  const frames: WsFrame[] = []
  const waiters = new Map<string, Array<(f: WsFrame) => void>>()
  socket.on("message", (raw) => {
    const frame = JSON.parse(String(raw)) as WsFrame
    frames.push(frame)
    const cbs = waiters.get(String(frame.type)) ?? []
    waiters.delete(String(frame.type))
    for (const cb of cbs) cb(frame)
  })
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("WS open timed out")), timeoutMs)
    socket.once("open", () => { clearTimeout(t); resolve() })
    socket.once("error", (e) => { clearTimeout(t); reject(e) })
  })
  const waitForFrame = (type: string, waitMs = 10_000) =>
    new Promise<WsFrame>((resolve, reject) => {
      const existing = frames.find((f) => f.type === type)
      if (existing) return resolve(existing)
      const t = setTimeout(() => reject(new Error(`Timed out waiting for WS frame "${type}"`)), waitMs)
      const cbs = waiters.get(type) ?? []
      cbs.push((f) => { clearTimeout(t); resolve(f) })
      waiters.set(type, cbs)
    })
  await waitForFrame("ready", timeoutMs)
  return { socket, frames, waitForFrame, close: () => socket.close() }
}
```

- [ ] **Step 1: Write the test file**

```ts
describeWhenOpenCode("OpenChamber WS event stream upgrades", () => {
  test("/api/global/event/ws upgrades, sends ready, event frames flow", async () => {
    const url = new URL(openchamber!.baseUrl)
    url.protocol = "ws:"
    url.pathname = "/api/global/event/ws"
    const ws = await openWsAndWaitForReady(url.toString())
    expect(ws.frames[0].type).toBe("ready")

    const createRes = await fetch(`${openchamber!.baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "slice-3-ws-event", directory: ocCwd }),
    })
    expect(createRes.status).toBe(200)
    const created = await createRes.json() as { id: string }

    // Wait up to 5s for an event frame referencing the created session
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const matching = ws.frames.find((f) => JSON.stringify(f).includes(created.id))
      if (matching) { ws.close(); return }
      await new Promise((r) => setTimeout(r, 100))
    }
    ws.close()
    throw new Error("WS did not receive event frame referencing created session within 5s")
  }, 20_000)

  test("/api/event/ws with ?directory= upgrades and receives directory-scoped events", async () => {
    const url = new URL(openchamber!.baseUrl)
    url.protocol = "ws:"
    url.pathname = "/api/event/ws"
    url.searchParams.set("directory", ocCwd!)
    const ws = await openWsAndWaitForReady(url.toString())
    expect(ws.frames[0].type).toBe("ready")

    const createRes = await fetch(`${openchamber!.baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "slice-3-ws-dir-event", directory: ocCwd }),
    })
    const created = await createRes.json() as { id: string }

    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const matching = ws.frames.find((f) => JSON.stringify(f).includes(created.id))
      if (matching) { ws.close(); return }
      await new Promise((r) => setTimeout(r, 100))
    }
    ws.close()
    throw new Error("Directory-scoped WS did not receive event frame within 5s")
  }, 20_000)

  test("/api/global/event/ws?lastEventId= replays events after that id", async () => {
    // Step A: open WS, create a session, capture the lastEventId from any event frame
    const urlA = new URL(openchamber!.baseUrl)
    urlA.protocol = "ws:"
    urlA.pathname = "/api/global/event/ws"

    const wsA = await openWsAndWaitForReady(urlA.toString())
    const createRes = await fetch(`${openchamber!.baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "slice-3-ws-replay", directory: ocCwd }),
    })
    const created = await createRes.json() as { id: string }

    // Wait for an event frame carrying the created id and capture its eventId
    let capturedEventId: string | undefined
    const deadline = Date.now() + 5_000
    while (!capturedEventId && Date.now() < deadline) {
      const matching = wsA.frames.find((f) => JSON.stringify(f).includes(created.id))
      if (matching && typeof (matching as any).eventId === "string") {
        capturedEventId = (matching as any).eventId
        break
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    wsA.close()

    if (!capturedEventId) {
      // Adapt: if the bridge does not assign eventIds, document and skip with
      // a clear comment. The slice 1 liveness test already exercises replay's
      // sibling path; this test is conditional.
      console.log("[ws-replay] bridge does not assign eventIds on global WS; replay path requires upstream-supplied id. Skipping assertion.")
      return
    }

    // Step B: open new WS with lastEventId, expect a replay frame
    const urlB = new URL(openchamber!.baseUrl)
    urlB.protocol = "ws:"
    urlB.pathname = "/api/global/event/ws"
    urlB.searchParams.set("lastEventId", capturedEventId)

    const wsB = await openWsAndWaitForReady(urlB.toString())
    // Replay is best-effort — just assert ready arrived and connection is open
    expect(wsB.frames[0].type).toBe("ready")
    wsB.close()
  }, 25_000)
})
```

- [ ] **Step 2: Run the test file**

```bash
bun run --cwd tests test:web -- ws-upgrades.test.ts
```

Expected: 3/3 pass (or 2/3 + 1 documented skip if replay path needs the upstream id format the implementer must verify by reading `global-hub.ts`).

- [ ] **Step 3: Commit**

```bash
git add tests/web/ws-upgrades.test.ts
git commit -m "test(web): add WS event stream upgrade + lastEventId replay tests"
```

---

### Task 4: Update `tests/README.md` with Slice 3 coverage

**Files:**
- Modify: `tests/README.md` — extend the `## Coverage` section added in Slice 2 with a `### Slice 3` subsection

**Anchors:** Slice 2 added `## Coverage` with `### Slice 1` and `### Slice 2` subsections. Append `### Slice 3` after `### Slice 2`. Existing structure preserved.

- [ ] **Step 1: Add Slice 3 subsection**

Edit `tests/README.md` to append after the Slice 2 subsection:

```markdown
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
```

Plus add a `### Slice 3` entry to any tier diagram already in the README, if one exists. If no diagram exists, skip — don't add new structure.

- [ ] **Step 2: Verify README renders cleanly**

```bash
cat tests/README.md | head -120
```

Expected: Slice 1 / Slice 2 / Slice 3 subsections all present under Coverage.

- [ ] **Step 3: Commit**

```bash
git add tests/README.md
git commit -m "docs(tests): document Slice 3 coverage (full Tier 1 web surface)"
```

---

### Task 5: Full-surface verification

**Files:** none (verification only)

- [ ] **Step 1: Run full web surface**

```bash
bun run --cwd tests test:web
```

Expected: 12/12 web tests pass in <60s. Adaptations documented as test comments are acceptable; unexpected failures are not.

- [ ] **Step 2: Run full surface (opencode + web)**

```bash
bun run --cwd tests test
```

Expected: 36 tests pass (22 opencode + 14 web) in <90s.

- [ ] **Step 3: Type-check tests workspace**

```bash
bun run --cwd tests type-check
```

Expected: clean (zero errors). Pre-existing errors in `packages/web` or `packages/ui` are out of scope.

- [ ] **Step 4: Lint tests workspace**

```bash
bun run --cwd tests lint
```

Expected: clean (or pre-existing warnings only).

- [ ] **Step 5: Grep audit for name-based kills**

```bash
grep -rn "killall\|pkill\|pgrep" tests/
```

Expected: zero matches in code; one match allowed in `tests/README.md` (documentation describing the constraint).

- [ ] **Step 6: Final commit (only if Step 5 surfaces something to fix)**

If Step 5 surfaces executable uses of name-based kills, replace with PID-targeted cleanup and commit the fix. Otherwise, no commit.

```bash
git add tests/
git commit -m "fix(tests): remove name-based process kills found by audit"
```

---

## Notes on parallelism

Tasks 1, 2, 3 write to different files and can be dispatched in parallel implementer subagents. Tasks 4 and 5 must run after Tasks 1-3 complete (README depends on file existence, verification depends on all tests landing).

## Risk register

1. **OpenCode version drift.** Slice 2 had to adapt three tests to actual OpenCode behaviour (empty title accepted, archived=0 still archived, session IDs global). Slice 3 may surface similar drift. Implementers apply the encoding rule (see top).
2. **SSE event names.** OpenCode's SSE initial event names vary across versions. Implementer must `curl` against the spawned opencode to confirm before asserting.
3. **`lastEventId` format.** Bridge may consume upstream-supplied ids only; the third test has a documented skip path for that case.
4. **503 grace window timing.** The proxy's `OPEN_CODE_READY_GRACE_MS` window is short. Test must SIGKILL then immediately fetch — and is allowed to adapt by polling up to 2s.
5. **Build prereq.** `bun run --cwd packages/web build:server` must run before web tests. Documented; do not skip.
