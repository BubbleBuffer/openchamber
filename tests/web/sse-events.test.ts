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

let opencode: StartedOpenCode | undefined
let openchamber: StartedOpenChamber | undefined
let ocCwd: string | undefined
let ocPort: number | undefined

// File-level afterAll ensures cleanup runs even if describe block hooks
// are inconsistent in certain vitest fork pool edge cases.
afterAll(async () => {
  try { await openchamber?.stop() } catch { /* best-effort */ }
  try { await opencode?.stop() } catch { /* best-effort */ }
  if (ocCwd) { try { await fs.rm(ocCwd, { recursive: true, force: true }) } catch {} }
})

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

describeWhenOpenCode("OpenChamber SSE event streams", () => {
  beforeAll(async () => {
    ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-sse-"))
    ocPort = await getAvailablePort()
    opencode = await startOpenCodeInstance({ cwd: ocCwd, port: ocPort })
    openchamber = await startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl })
  }, 30_000)

  // ---------------------------------------------------------------------------
  // Test 1: Directory-scoped /api/event SSE
  // ---------------------------------------------------------------------------
  test("/api/event SSE connects and receives OpenCode events", async () => {
    const { status, contentType, firstEvent } = await readFirstSseEvent(
      `${openchamber!.baseUrl}/api/event?directory=${encodeURIComponent(ocCwd!)}`,
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
      `${openchamber!.baseUrl}/api/global/event`,
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
    const created = (await createRes.json()) as { id: string }

    const buffer = await ssePromise
    sseController.abort()
    // Adapt to actual on-the-wire shape: assert the created id appears somewhere
    expect(buffer).toContain(created.id)
  }, 15_000)
})
