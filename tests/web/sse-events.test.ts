import { afterAll, expect, test } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describeWithOpenChamber } from "../helpers/integration-suite"
import { getAvailablePort } from "../helpers/ports"
import { startOpenCodeInstance } from "../helpers/opencode-process"

let ocCwd: string | undefined

/**
 * Open a URL with `Accept: text/event-stream`, read the first SSE frame
 * delimited by "\n\n", and return status, content-type, and the raw text.
 * No external SSE library needed — uses native fetch + ReadableStream.
 * The AbortController ensures the connection is closed after collecting
 * the first event or hitting the timeout, preventing vitest from hanging.
 */
async function readFirstSseEvent(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 5_000,
): Promise<{ status: number; contentType: string; firstEvent: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/event-stream", ...headers },
      signal: controller.signal,
    })
    if (!res.body) {
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", firstEvent: null }
    }
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

describeWithOpenChamber(
  "OpenChamber SSE event streams",
  {
    timeoutMs: 45_000,
    start: async () => {
      ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-sse-"))
      const port = await getAvailablePort()
      return startOpenCodeInstance({ cwd: ocCwd, port })
    },
    afterStop: async () => {
      if (ocCwd) {
        try { await fs.rm(ocCwd, { recursive: true, force: true }) } catch { /* best-effort */ }
      }
    },
  },
  (ctx) => {
    afterAll(async () => {
      // Best-effort stop — the helper's afterAll handles the main teardown.
      try { await ctx.openchamber.stop() } catch { /* best-effort */ }
      try { await ctx.opencode.stop() } catch { /* best-effort */ }
    })

    // ---------------------------------------------------------------------------
    // Test 1: Directory-scoped /api/event SSE
    // ---------------------------------------------------------------------------
    test("/api/event SSE connects and receives OpenCode events", async () => {
      const { status, contentType, firstEvent } = await readFirstSseEvent(
        `${ctx.openchamber.baseUrl}/api/event?directory=${encodeURIComponent(ctx.opencode.cwd)}`,
        {},
      )
      expect(status).toBe(200)
      expect(contentType).toContain("text/event-stream")
      expect(firstEvent).not.toBeNull()
      // OpenCode initial SSE event shape varies across versions.
      // Observed on 2026-06-26: `data: {"id":"evt_...","type":"server.connected",...}`
      // Assert at least a non-empty `data:` line.
      expect(firstEvent!.length).toBeGreaterThan(0)
    }, 15_000)

    // ---------------------------------------------------------------------------
    // Test 2: Global /api/global/event SSE
    // ---------------------------------------------------------------------------
    test("/api/global/event SSE connects and receives OpenCode events", async () => {
      const { status, contentType, firstEvent } = await readFirstSseEvent(
        `${ctx.openchamber.baseUrl}/api/global/event`,
        {},
      )
      expect(status).toBe(200)
      expect(contentType).toContain("text/event-stream")
      expect(firstEvent).not.toBeNull()
      // Same lenient assertion — global event wrapper shape may differ
      // (observed: `data: {"payload":{"id":"evt_...","type":"server.connected",...}}`)
      expect(firstEvent!.length).toBeGreaterThan(0)
    }, 15_000)

    // ---------------------------------------------------------------------------
    // Test 3: Session-created event delivered through global SSE
    // ---------------------------------------------------------------------------
    test("POST /api/session emits a session event through /api/global/event SSE", async () => {
      // Open SSE first, then POST a session. The SSE reader accumulates events
      // until it sees any mention of "session" or 8 seconds pass.
      const sseController = new AbortController()
      const ssePromise = fetch(`${ctx.openchamber.baseUrl}/api/global/event`, {
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
      const createRes = await fetch(`${ctx.openchamber.baseUrl}/api/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "slice-3-sse-event", directory: ctx.opencode.cwd }),
      })
      expect(createRes.status).toBe(200)
      const created = (await createRes.json()) as { id: string }

      const buffer = await ssePromise
      sseController.abort()
      // Adapt to actual on-the-wire shape: assert the created id appears somewhere
      expect(buffer).toContain(created.id)
    }, 15_000)
  },
)
