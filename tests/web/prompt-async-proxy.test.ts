import { expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenChamber } from "../helpers/integration-suite"

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
// Uses a custom startOpenChamber to mirror the bootstrap:
//   - dynamic import(@openchamber/web)
//   - env vars set BEFORE the import (module-level constants capture config
//     at import time via resolveOpenCodeEnvConfig())
//   - controller: { getPort(): number | null, stop({exitProcess: false}) }
//
// Each test file runs in its own vitest fork worker (pool: "forks",
// isolate: true), so the module cache is fresh per file.

let sse: SseHandle | undefined

describeWithOpenChamber(
  "OpenChamber proxy: prompt_async",
  {
    startOpenChamber: async (opencode) => {
      const envBackups = {
        OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
        OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
        OPENCODE_HOST: process.env.OPENCODE_HOST,
      }
      process.env.OPENCODE_SKIP_START = "true"
      process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
      process.env.OPENCODE_HOST = opencode.baseUrl

      let controller: {
        getPort(): number | null
        stop(opts?: { exitProcess?: boolean }): Promise<void>
      }

      try {
        const mod = await import("@openchamber/web")
        const startWebUiServer = mod.startWebUiServer as (
          opts?: Record<string, unknown>,
        ) => Promise<{
          getPort(): number | null
          stop(opts?: { exitProcess?: boolean }): Promise<void>
        }>
        controller = await startWebUiServer({
          port: 0,
          host: "127.0.0.1",
          attachSignals: false,
          exitOnShutdown: false,
        })
      } finally {
        if (envBackups.OPENCODE_SKIP_START === undefined) delete process.env.OPENCODE_SKIP_START
        else process.env.OPENCODE_SKIP_START = envBackups.OPENCODE_SKIP_START
        if (envBackups.OPENCHAMBER_SKIP_OPENCODE_START === undefined) delete process.env.OPENCHAMBER_SKIP_OPENCODE_START
        else process.env.OPENCHAMBER_SKIP_OPENCODE_START = envBackups.OPENCHAMBER_SKIP_OPENCODE_START
        if (envBackups.OPENCODE_HOST === undefined) delete process.env.OPENCODE_HOST
        else process.env.OPENCODE_HOST = envBackups.OPENCODE_HOST
      }

      const port = controller.getPort()
      if (typeof port !== "number") throw new Error("OpenChamber started without a bound port")

      return {
        baseUrl: `http://127.0.0.1:${port}`,
        port,
        async stop() {
          await controller.stop({ exitProcess: false })
        },
      }
    },
    // Close the SSE stream before the server stops so the stream closes cleanly.
    beforeStop: () => {
      if (sse) {
        try { sse.close() } catch { /* ignore */ }
        sse = undefined
      }
    },
  },
  (ctx) => {
    test(
      "proxy forwards a valid prompt_async request and echoes marker through SSE",
      async () => {
        const ocClient = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
        const created = await ocClient.session.create({ title: "slice4-proxy-1" })
        const sessionID = created.data!.id
        const marker = `slice4-proxy-${Date.now()}`

        // Open SSE stream inside the test body (fresh per test).
        sse = await openSseStream(ctx.openchamber.baseUrl, "/api/global/event")

        const start = Date.now()
        const res = await fetch(`${ctx.openchamber.baseUrl}/api/session/${sessionID}/prompt_async`, {
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
          sse,
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
        const ocClient = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
        const created = await ocClient.session.create({ title: "slice4-proxy-2" })
        const sessionID = created.data!.id

        const res = await fetch(`${ctx.openchamber.baseUrl}/api/session/${sessionID}/prompt_async`, {
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
  },
)
