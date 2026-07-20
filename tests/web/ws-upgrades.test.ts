import { afterAll, expect, test } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import WebSocket from "ws"
import { describeWithOpenChamber } from "../helpers/integration-suite"
import { getAvailablePort } from "../helpers/ports"
import { startOpenCodeInstance } from "../helpers/opencode-process"

// ── WS helper ────────────────────────────────────────────────────

type WsFrame = Record<string, unknown>

interface WsHandle {
  socket: WebSocket
  frames: WsFrame[]
  waitForFrame(type: string, waitMs?: number): Promise<WsFrame>
  waitForMatchingFrame(predicate: (frame: WsFrame) => boolean, waitMs?: number): Promise<WsFrame>
  close(): Promise<void>
}

/**
 * Small delay to allow the OpenChamber WS bridge's upstream SSE reader to
 * fully shut down after the previous WS connection is closed. Each WS
 * connection creates its own upstream reader to OpenCode's SSE endpoint,
 * and OpenCode limits concurrent SSE connections from a single client.
 * Without this cooldown, a new WS connection's upstream reader may hang
 * waiting for OpenCode to accept the second SSE connection.
 */
async function wsCooldown(ms = 800): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

/**
 * Open a WebSocket to an arbitrary URL, wait for the initial "ready"
 * frame, and return a handle for collecting / waiting on frames.
 */
async function openWsAndWaitForReady(url: string, timeoutMs = 10_000): Promise<WsHandle> {
  const socket = new WebSocket(url)
  const frames: WsFrame[] = []
  const waiters = new Map<string, Array<(f: WsFrame) => void>>()
  const matchingWaiters = new Set<{ predicate: (frame: WsFrame) => boolean; resolve: (frame: WsFrame) => void }>()

  socket.on("message", (raw) => {
    const frame = JSON.parse(String(raw)) as WsFrame
    frames.push(frame)
    const cbs = waiters.get(String(frame.type)) ?? []
    waiters.delete(String(frame.type))
    for (const cb of cbs) cb(frame)
    for (const waiter of Array.from(matchingWaiters)) {
      if (waiter.predicate(frame)) {
        matchingWaiters.delete(waiter)
        waiter.resolve(frame)
      }
    }
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

  const waitForMatchingFrame = (predicate: (frame: WsFrame) => boolean, waitMs = 10_000) =>
    new Promise<WsFrame>((resolve, reject) => {
      const existing = frames.find(predicate)
      if (existing) return resolve(existing)
      const waiter = {
        predicate,
        resolve: (frame: WsFrame) => {
          clearTimeout(timer)
          resolve(frame)
        },
      }
      const timer = setTimeout(() => {
        matchingWaiters.delete(waiter)
        reject(new Error("Timed out waiting for matching WS frame"))
      }, waitMs)
      matchingWaiters.add(waiter)
    })

  await waitForFrame("ready", timeoutMs)

  const close = () =>
    new Promise<void>((resolve) => {
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        resolve()
        return
      }
      socket.once("close", () => resolve())
      socket.close()
    })

  return { socket, frames, waitForFrame, waitForMatchingFrame, close }
}

// ── Process fixtures ─────────────────────────────────────────────

let ocCwd: string | undefined

describeWithOpenChamber(
  "OpenChamber WS event stream upgrades",
  {
    timeoutMs: 45_000,
    start: async () => {
      ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-ws-upgrades-"))
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

    // ── Tests ────────────────────────────────────────────────────────

    test(
      "/api/global/event/ws upgrades, sends ready, event frames flow",
      async () => {
        const url = new URL(ctx.openchamber.baseUrl)
        url.protocol = "ws:"
        url.pathname = "/api/global/event/ws"
        const ws = await openWsAndWaitForReady(url.toString())

        try {
          expect(ws.frames[0].type).toBe("ready")

          const createRes = await fetch(`${ctx.openchamber.baseUrl}/api/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "slice-3-ws-event", directory: ctx.opencode.cwd }),
          })
          expect(createRes.status).toBe(200)
          const created = await createRes.json() as { id: string }

          // Wait up to 5s for an event frame referencing the created session
          const deadline = Date.now() + 5_000
          while (Date.now() < deadline) {
            const matching = ws.frames.find((f) => JSON.stringify(f).includes(created.id))
            if (matching) return
            await new Promise((r) => setTimeout(r, 100))
          }

          throw new Error("WS did not receive event frame referencing created session within 5s")
        } finally {
          await ws.close()
        }
      },
      20_000,
    )

    test(
      "/api/event/ws with ?directory= upgrades and receives directory-scoped events",
      async () => {
        // The directory bridge consumes the authoritative global stream and filters
        // wrapped events by this requested directory.
        await wsCooldown()

        const url = new URL(ctx.openchamber.baseUrl)
        url.protocol = "ws:"
        url.pathname = "/api/event/ws"
        url.searchParams.set("directory", ctx.opencode.cwd)

        let ws: WsHandle | undefined

        try {
          ws = await openWsAndWaitForReady(url.toString(), 15_000)
          expect(ws.frames[0].type).toBe("ready")

          const createRes = await fetch(`${ctx.openchamber.baseUrl}/api/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "slice-3-ws-dir-event", directory: ctx.opencode.cwd }),
          })
          const created = await createRes.json() as { id: string }

          const matching = await ws.waitForMatchingFrame((frame) => JSON.stringify(frame).includes(created.id), 5_000)
          expect(matching.type).toBe("event")
        } finally {
          await ws?.close()
        }
      },
      30_000,
    )

    test(
      "/api/global/event/ws?lastEventId= replays events after that id",
      async ({ skip }) => {
        // Step A: create two identifiable events and use the first as the replay boundary.
        const urlA = new URL(ctx.openchamber.baseUrl)
        urlA.protocol = "ws:"
        urlA.pathname = "/api/global/event/ws"

        let wsA: WsHandle | undefined

        try {
          wsA = await openWsAndWaitForReady(urlA.toString())

          const firstCreateRes = await fetch(`${ctx.openchamber.baseUrl}/api/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "slice-3-ws-replay-first", directory: ctx.opencode.cwd }),
          })
          const firstCreated = await firstCreateRes.json() as { id: string }
          const firstEvent = await wsA.waitForMatchingFrame(
            (frame) => frame.type === "event" && JSON.stringify(frame).includes(firstCreated.id),
            5_000,
          )
          if (typeof firstEvent.eventId !== "string") {
            skip("OpenCode did not provide the SSE event IDs required by the replay protocol")
            return
          }

          const secondCreateRes = await fetch(`${ctx.openchamber.baseUrl}/api/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "slice-3-ws-replay-second", directory: ctx.opencode.cwd }),
          })
          const secondCreated = await secondCreateRes.json() as { id: string }
          const secondEvent = await wsA.waitForMatchingFrame(
            (frame) => frame.type === "event" && JSON.stringify(frame).includes(secondCreated.id),
            5_000,
          )
          if (typeof secondEvent.eventId !== "string") {
            skip("OpenCode did not provide the SSE event IDs required by the replay protocol")
            return
          }

          const firstEventId = firstEvent.eventId as string
          const secondEventId = secondEvent.eventId as string
          await wsA.close()
          wsA = undefined

          // Step B: replayAfter() is exclusive, so the second event must follow the first boundary.
          const urlB = new URL(ctx.openchamber.baseUrl)
          urlB.protocol = "ws:"
          urlB.pathname = "/api/global/event/ws"
          urlB.searchParams.set("lastEventId", firstEventId)

          const wsB = await openWsAndWaitForReady(urlB.toString())
          try {
            const replayedEvent = await wsB.waitForMatchingFrame(
              (frame) => frame.type === "event" && frame.eventId === secondEventId,
              5_000,
            )
            expect(JSON.stringify(replayedEvent)).toContain(secondCreated.id)
          } finally {
            await wsB.close()
          }
        } finally {
          await wsA?.close()
        }
      },
      25_000,
    )
  },
)
