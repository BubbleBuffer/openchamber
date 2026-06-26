import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { StartedOpenCode } from "../helpers/opencode-process"
import { startOpenCodeInstance } from "../helpers/opencode-process"
import { checkOpenCodeAvailable } from "../helpers/env"

const availability = await checkOpenCodeAvailable()
const describeWhenOpenCode = availability.available ? describe : describe.skip

const SSE_TIMEOUT_MS = 8_000
const SSE_POLL_INTERVAL_MS = 50

// ── SSE helpers (inline copy — do not import across packages) ─────────────

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

// ── Shared server lifecycle ───────────────────────────────────────────────
// Mirror the bootstrap used by tests/web/api-session-crud.test.ts:
// import @openchamber/web dynamically, set OPENCODE_HOST before the module
// captures its config, start the server on port 0, and capture the
// controller's port + stop().
//
// Each test file runs in its own vitest fork worker (pool: "forks",
// isolate: true), so the module cache is fresh per file.

let opencode: StartedOpenCode
let webBaseUrl: string
let webStop: () => Promise<void>
let sse: SseHandle | undefined

beforeAll(async () => {
  // Step 1: start external OpenCode first — we need its baseUrl for OPENCODE_HOST.
  opencode = await startOpenCodeInstance()

  // Step 2: save env, then set the vars that @openchamber/web reads at module-import time.
  // The module must see OPENCODE_HOST and the skip-start flags BEFORE the import
  // evaluates resolveOpenCodeEnvConfig() and ENV_SKIP_OPENCODE_START.
  const envBackups = {
    OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
    OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
    OPENCODE_HOST: process.env.OPENCODE_HOST,
  }
  process.env.OPENCODE_SKIP_START = "true"
  process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
  process.env.OPENCODE_HOST = opencode.baseUrl

  let controller:
    | { getPort(): number | null; stop(opts?: { exitProcess?: boolean }): Promise<void> }
    | undefined

  try {
    // Step 3: import when env is fully configured — module-level constants capture it.
    const mod = await import("@openchamber/web")
    const startWebUiServer = mod.startWebUiServer as (
      opts?: Record<string, unknown>,
    ) => Promise<{
      getPort(): number | null
      stop(opts?: { exitProcess?: boolean }): Promise<void>
    }>

    // Step 4: start the server now that module config is captured.
    controller = await startWebUiServer({
      port: 0,
      host: "127.0.0.1",
      attachSignals: false,
      exitOnShutdown: false,
    })
  } finally {
    // Step 5: restore env regardless of success or failure above.
    if (envBackups.OPENCODE_SKIP_START === undefined) delete process.env.OPENCODE_SKIP_START
    else process.env.OPENCODE_SKIP_START = envBackups.OPENCODE_SKIP_START
    if (envBackups.OPENCHAMBER_SKIP_OPENCODE_START === undefined) delete process.env.OPENCHAMBER_SKIP_OPENCODE_START
    else process.env.OPENCHAMBER_SKIP_OPENCODE_START = envBackups.OPENCHAMBER_SKIP_OPENCODE_START
    if (envBackups.OPENCODE_HOST === undefined) delete process.env.OPENCODE_HOST
    else process.env.OPENCODE_HOST = envBackups.OPENCODE_HOST
  }

  webBaseUrl = `http://127.0.0.1:${controller!.getPort()}`
  webStop = () => controller!.stop({ exitProcess: false })
  sse = await openSseStream(webBaseUrl, "/api/global/event")
}, 45_000)

afterAll(async () => {
  try { sse?.close() } catch { /* ignore */ }
  try { await webStop?.() } catch { /* ignore */ }
  try { await opencode?.stop() } catch { /* ignore */ }
})

// ── Tests ─────────────────────────────────────────────────────────────────

describeWhenOpenCode("OpenChamber proxy: prompt_async", () => {
  test(
    "proxy forwards a valid prompt_async request and echoes marker through SSE",
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

      // Verify the prompt text appears in the global SSE stream via the proxy.
      const sseResult = await waitForBufferText(
        sse!,
        (t) => t.includes(marker),
        SSE_TIMEOUT_MS,
      )
      expect(
        sseResult.matched,
        `Proxy SSE did not echo prompt marker within ${SSE_TIMEOUT_MS}ms; buffer was:\n${sseResult.text}`,
      ).toBe(true)

      await ocClient.session.delete({ sessionID })
    },
    30_000,
  )

  test(
    "proxy preserves upstream 4xx/5xx for malformed prompt body",
    async () => {
      const ocClient = createOpencodeClient({ baseUrl: opencode.baseUrl })
      const created = await ocClient.session.create({ title: "slice4-proxy-2" })
      const sessionID = created.data!.id

      const res = await fetch(`${webBaseUrl}/api/session/${sessionID}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json-at-all",
      })

      // The proxy must NOT silently swallow the upstream error.
      // Accept any 4xx or 5xx — the exact code depends on the upstream parser.
      expect(res.status).toBeGreaterThanOrEqual(400)

      await ocClient.session.delete({ sessionID })
    },
    20_000,
  )
})
