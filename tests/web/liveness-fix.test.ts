import { afterAll, beforeAll, expect, test } from "vitest"
import net from "node:net"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import WebSocket from "ws"
import { describeWhenOpenCode } from "../helpers/integration-suite"
import { getAvailablePort } from "../helpers/ports"
import { startOpenCodeInstance } from "../helpers/opencode-process"

// ── Wire-format helpers ──────────────────────────────────────────

type WsFrame = Record<string, unknown>

/**
 * Open a WebSocket to the OpenChamber global event stream, wait for the
 * initial `ready` frame, and return a handle for collecting / waiting.
 */
async function connectGlobalWs(baseUrl: string, timeoutMs = 15_000): Promise<{
  socket: WebSocket
  frames: WsFrame[]
  waitForFrame(type: string, timeoutMs?: number): Promise<WsFrame>
  close(): void
}> {
  const url = new URL(baseUrl)
  url.protocol = "ws:"
  url.pathname = "/api/global/event/ws"

  const frames: WsFrame[] = []
  const waiters = new Map<string, Array<(frame: WsFrame) => void>>()
  const socket = new WebSocket(url)

  socket.on("message", (raw) => {
    const frame = JSON.parse(String(raw)) as WsFrame
    frames.push(frame)
    const callbacks = waiters.get(String(frame.type)) ?? []
    waiters.delete(String(frame.type))
    for (const cb of callbacks) cb(frame)
  })

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WS connection timed out")), timeoutMs)
    socket.once("open", () => { clearTimeout(timer); resolve() })
    socket.once("error", (err) => { clearTimeout(timer); reject(err) })
  })

  const waitForFrame = (type: string, waitMs = 30_000): Promise<WsFrame> =>
    new Promise((resolve, reject) => {
      const existing = frames.find((f) => f.type === type)
      if (existing) return resolve(existing)
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for WS frame "${type}"`)), waitMs)
      const cbs = waiters.get(type) ?? []
      cbs.push((frame) => { clearTimeout(timer); resolve(frame) })
      waiters.set(type, cbs)
    })

  // Block until we see the initial "ready" frame
  await waitForFrame("ready", timeoutMs)

  return { socket, frames, waitForFrame, close: () => socket.close() }
}

/**
 * Poll a TCP port until it refuses connections (i.e. is free to bind).
 * Used after killing OpenCode to avoid EADDRINUSE on restart.
 */
async function waitForPortFree(port: number, host = "127.0.0.1", waitMs = 8_000): Promise<void> {
  const deadline = Date.now() + waitMs
  for (;;) {
    const isFree = await new Promise<boolean>((resolve) => {
      const s = net.createConnection(port, host)
      s.once("connect", () => { s.destroy(); resolve(false) })
      s.once("error", () => resolve(true))
    })
    if (isFree) return
    if (Date.now() > deadline) throw new Error(`Port ${port} not released within ${waitMs}ms`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

// ── Test suite ───────────────────────────────────────────────────
// NOTE: This suite uses describeWhenOpenCode + manual lifecycle (not
// describeWithOpenChamber) because it restarts OpenCode on the same cwd/port
// inside a single test. The helper's `start` option runs once at suite
// startup and its `afterAll` teardown cannot be interleaved with the in-test
// restart. The manual lifecycle gives us precise control over when to stop
// and restart the OpenCode instance.

let livenessCwd: string | undefined
let livenessPort: number | undefined

let opencode: Awaited<ReturnType<typeof startOpenCodeInstance>> | undefined
let openchamber: { baseUrl: string; port: number; stop(): Promise<void> } | undefined

afterAll(async () => {
  try { await openchamber?.stop() } catch { /* best-effort */ }
  try { await opencode?.stop() } catch { /* best-effort */ }
  if (livenessCwd) {
    try { await fs.rm(livenessCwd, { recursive: true, force: true }) } catch { /* best-effort */ }
  }
})

describeWhenOpenCode("OpenChamber streaming liveness regression", () => {
  beforeAll(async () => {
    // Create a persistent temp dir that outlives the first stop(), so we can
    // restart OpenCode on the same cwd without losing the directory.
    livenessCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-liveness-"))
    livenessPort = await getAvailablePort()
    opencode = await startOpenCodeInstance({ cwd: livenessCwd, port: livenessPort })

    const envBackups = {
      OPENCODE_SKIP_START: process.env.OPENCODE_SKIP_START,
      OPENCHAMBER_SKIP_OPENCODE_START: process.env.OPENCHAMBER_SKIP_OPENCODE_START,
      OPENCODE_HOST: process.env.OPENCODE_HOST,
    }
    process.env.OPENCODE_SKIP_START = "true"
    process.env.OPENCHAMBER_SKIP_OPENCODE_START = "true"
    process.env.OPENCODE_HOST = opencode.baseUrl

    let controller: { getPort(): number | null; stop(opts?: { exitProcess?: boolean }): Promise<void> } | undefined

    try {
      const mod = await import("@openchamber/web")
      const startWebUiServer = mod.startWebUiServer as (
        opts?: Record<string, unknown>,
      ) => Promise<{ getPort(): number | null; stop(opts?: { exitProcess?: boolean }): Promise<void> }>
      controller = await startWebUiServer({ port: 0, host: "127.0.0.1", attachSignals: false, exitOnShutdown: false })
    } finally {
      if (envBackups.OPENCODE_SKIP_START === undefined) delete process.env.OPENCODE_SKIP_START
      else process.env.OPENCODE_SKIP_START = envBackups.OPENCODE_SKIP_START
      if (envBackups.OPENCHAMBER_SKIP_OPENCODE_START === undefined) delete process.env.OPENCHAMBER_SKIP_OPENCODE_START
      else process.env.OPENCHAMBER_SKIP_OPENCODE_START = envBackups.OPENCHAMBER_SKIP_OPENCODE_START
      if (envBackups.OPENCODE_HOST === undefined) delete process.env.OPENCODE_HOST
      else process.env.OPENCODE_HOST = envBackups.OPENCODE_HOST
    }

    const port = controller!.getPort()
    if (typeof port !== "number") throw new Error("OpenChamber started without a bound port")
    openchamber = {
      baseUrl: `http://127.0.0.1:${port}`,
      port,
      async stop() { await controller!.stop({ exitProcess: false }) },
    }
  }, 30_000)

  test(
    "global WS connects, OpenCode restart preserves health",
    async () => {
      // ── 1. Connect WS and wait for ready ────────────────────────
      const ws = await connectGlobalWs(openchamber!.baseUrl)
      expect(ws.frames.length).toBeGreaterThan(0)
      expect(ws.frames[0].type).toBe("ready")

      // ── 2. Collect frames for a brief idle observation ─────────
      // Real OpenCode sends keepalive events, so data_stalled is NOT
      // expected during idle operation. We observe and log any
      // stall/resume frames that happen to appear.
      await new Promise((r) => setTimeout(r, 2_000))
      const stallBeforeKill = ws.frames.find((f) => f.type === "data_stalled")
      const resumeBeforeKill = ws.frames.find((f) => f.type === "data_resumed")

      // ── 3. Stop OpenCode ────────────────────────────────────────
      // Save port before stop (cwd is preserved via livenessCwd).
      const savedPort = opencode!.port
      await opencode!.stop()
      opencode = undefined

      // Wait for the OS to release the listening port.
      await waitForPortFree(savedPort)

      // ── 4. Collect frames while OpenCode is down ────────────────
      // The upstream reader will encounter connection errors and
      // either emit data_stalled (if the stall timer fires before the
      // connection drops) or error/disconnect statuses. In practice
      // the connection drops faster than the 20s stall timeout, so
      // data_stalled is unlikely; the WS should remain open.
      await new Promise((r) => setTimeout(r, 2_000))
      const stallWhileDown = ws.frames.find((f) => f.type === "data_stalled")
      const errorWhileDown = ws.frames.find((f) => f.type === "error")
      const disconnectFrame = ws.frames.find((f) => f.type === "disconnect")

      // ── 5. Restart OpenCode on the same port and cwd ────────────
      opencode = await startOpenCodeInstance({ cwd: livenessCwd!, port: savedPort })

      // ── 6. Wait for the new OpenCode to be visible upstream ─────
      // The upstream reader should reconnect automatically. Wait
      // for a new "ready" frame, which the bridge sends to ready
      // clients when the hub reconnects (connect status without
      // wasReady triggers markReady). If data_stalled was observed,
      // the hub would emit data_resumed instead.
      await Promise.race([
        ws.waitForFrame("ready", 12_000).then(() => {}),
        ws.waitForFrame("data_resumed", 12_000).then(() => {}),
        new Promise((r) => setTimeout(r, 12_000)),
      ])
      const stallAfterKill = ws.frames.find((f) => f.type === "data_stalled")
      const resumeAfterKill = ws.frames.find((f) => f.type === "data_resumed")
      const readyAfterKill = ws.frames.find((f) => f.type === "ready")
      const errorAfterKill = ws.frames.find((f) => f.type === "error")

      // ── 7. Assertions ───────────────────────────────────────────

      // 7a. WS remained controlled throughout.
      // "Controlled" means either the socket is still open, or it
      // received a known terminal frame (error) rather than an
      // unexpected close. We check that we didn't receive a close
      // event — the socket may be in CLOSED state if OpenChamber
      // decided to terminate it, but we should have at least one
      // explanatory frame.
      const wsEnded = ws.socket.readyState === WebSocket.CLOSED || ws.socket.readyState === WebSocket.CLOSING
      const hasExplanatoryFrame = errorWhileDown || stallWhileDown || disconnectFrame
      if (wsEnded) {
        // If the WS closed, there must have been an explanatory
        // frame before the close.
        expect(hasExplanatoryFrame).toBeTruthy()
      }
      // If the WS is still open, that's the expected case — the
      // bridge keeps idle WS clients alive across upstream outages.

      // 7b. OpenChamber's own health endpoint still returns 200
      // after the OpenCode restart.
      const healthResponse = await fetch(`${openchamber!.baseUrl}/health`)
      expect(healthResponse.status).toBe(200)
      const healthBody = await healthResponse.json() as { status?: string }
      expect(healthBody.status).toBe("ok")

      // 7c. Summary of stall/resume observations (no assertion —
      //      informational for the test log).
      const observations: string[] = []
      if (stallBeforeKill) observations.push(`data_stalled before kill: ${JSON.stringify(stallBeforeKill)}`)
      if (resumeBeforeKill) observations.push(`data_resumed before kill: ${JSON.stringify(resumeBeforeKill)}`)
      if (stallWhileDown) observations.push(`data_stalled while down: ${JSON.stringify(stallWhileDown)}`)
      if (errorWhileDown) observations.push(`error while down: ${JSON.stringify(errorWhileDown)}`)
      if (disconnectFrame) observations.push(`disconnect frame: ${JSON.stringify(disconnectFrame)}`)
      if (stallAfterKill) observations.push(`data_stalled after restart: ${JSON.stringify(stallAfterKill)}`)
      if (resumeAfterKill) observations.push(`data_resumed after restart: ${JSON.stringify(resumeAfterKill)}`)
      if (readyAfterKill) observations.push(`re-ready after restart: ${JSON.stringify(readyAfterKill)}`)
      if (errorAfterKill) observations.push(`error after restart: ${JSON.stringify(errorAfterKill)}`)

      if (observations.length > 0) {
        console.log("[liveness] observed frames:", observations.join("; "))
      } else {
        console.log("[liveness] no data_stalled/data_resumed/error frames observed (expected: OpenCode keepalive prevents idle stall, connection drop faster than stall timer)")
      }
    },
    60_000,
  )

  // Separate skipped test documenting the stronger assertion we cannot
  // reliably make with a real OpenCode binary.
  test.skip("data_stalled assertion requires controllable upstream silence", () => {
    // The upstream stall timer is 20s (DEFAULT_UPSTREAM_STALL_TIMEOUT_MS).
    // Real OpenCode sends keepalive events that reset the stall timer,
    // so data_stalled never fires during normal idle operation.
    // Killing the OpenCode process drops the TCP connection before the
    // stall timer can fire, producing stream_error/disconnect instead.
    //
    // To reliably observe data_stalled we would need either:
    //   a) An OpenCode plugin or configuration that suppresses keepalive,
    //   b) A fake/recorded upstream that sends no data for 20s+,
    //   c) A way to pause the upstream SSE stream without closing the connection.
    //
    // Future slice: add an OpenCode plugin / model-hold fixture.
  })
})
