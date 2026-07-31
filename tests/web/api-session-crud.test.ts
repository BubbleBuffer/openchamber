import { afterAll, beforeAll, expect, test } from "vitest"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { describeWhenOpenCode } from "../helpers/integration-suite"
import { getAvailablePort } from "../helpers/ports"
import { startOpenCodeInstance } from "../helpers/opencode-process"

// ── Helpers ───────────────────────────────────────────────────────────────

async function getOpencodePid(cwd: string): Promise<number | undefined> {
  try {
    const raw = await fs.readFile(path.join(cwd, "pid"), "utf8")
    const n = Number.parseInt(raw.trim(), 10)
    return Number.isFinite(n) ? n : undefined
  } catch {
    return undefined
  }
}

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

// ── Shared server lifecycle ──────────────────────────────────────────────
// This suite uses a custom shared runtime because it spans multiple describe
// blocks that all reuse the same OpenCode + OpenChamber instance (necessary
// because @openchamber/web is a module-level singleton). The first describe
// block ("API session CRUD") boots both servers and the subsequent suites
// ("bad OPENCODE_HOST", "503-while-restarting") reuse them.
//
// We use describeWhenOpenCode from the helper (not describeWithOpenChamber)
// because wrapping each of the three suites in their own helper would boot
// separate OpenChamber instances, breaking the shared-runtime semantics that
// Suite 3's PID-targeted 503 test depends on.

let ocCwd: string | undefined

let opencode: Awaited<ReturnType<typeof startOpenCodeInstance>> | undefined
let openchamber: { baseUrl: string; port: number; stop(): Promise<void> } | undefined

afterAll(async () => {
  try { await openchamber?.stop() } catch { /* best-effort */ }
  try { await opencode?.stop() } catch { /* best-effort */ }
  if (ocCwd) { try { await fs.rm(ocCwd, { recursive: true, force: true }) } catch { /* best-effort */ } }
})

// ───────────────────────────────────────────────────────────────────────────
// Suite 1: API session CRUD
// ───────────────────────────────────────────────────────────────────────────

describeWhenOpenCode("OpenChamber API session CRUD", () => {
  beforeAll(async () => {
    ocCwd = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-api-crud-"))
    const port = await getAvailablePort()
    opencode = await startOpenCodeInstance({ cwd: ocCwd, port })

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

    const boundPort = controller!.getPort()
    if (typeof boundPort !== "number") throw new Error("OpenChamber started without a bound port")
    openchamber = {
      baseUrl: `http://127.0.0.1:${boundPort}`,
      port: boundPort,
      async stop() { await controller!.stop({ exitProcess: false }) },
    }
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

// ───────────────────────────────────────────────────────────────────────────
// Suite 2: Bad OPENCODE_HOST
// ───────────────────────────────────────────────────────────────────────────

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
    let controller: {
      stop: (opts: { exitProcess: boolean }) => Promise<void>
      getPort: () => number | null
    } | undefined
    try {
      const { startWebUiServer } = await import("@openchamber/web")
      controller = await startWebUiServer({ port: 0, host: "127.0.0.1", attachSignals: false, exitOnShutdown: false })
      // Server booted despite bad env. Hit /health and confirm it returns 200.
      const boundPort = controller.getPort()
      if (boundPort === null) throw new Error("OpenChamber did not bind a port")
      const healthRes = await fetch(`http://127.0.0.1:${boundPort}/health`)
      expect(healthRes.status).toBe(200)
      const body = await healthRes.json() as { status: string }
      expect(body.status).toBe("ok")
    } finally {
      if (controller) {
        try { await controller.stop({ exitProcess: false }) } catch { /* best-effort */ }
      }
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  }, 15_000)
})

// ───────────────────────────────────────────────────────────────────────────
// Suite 3: 503-while-restarting
// ───────────────────────────────────────────────────────────────────────────
//
// This suite reuses the shared OpenChamber server and OpenCode instance from
// Suite 1. It kills the shared OpenCode via its PID (read from <ocCwd>/pid)
// and observes the proxy's behavior.
//
// Adaptation: The shared OpenCode runtime singleton still holds the cached
// config from Suite 1 (openCodePort, openCodeBaseUrl, isOpenCodeReady=true).
// After SIGKILL, the runtime does NOT detect the upstream is dead because
// there is no health monitoring (state.openCodeProcess is null — the runtime
// treats OpenCode as external). The proxy's restart gate (proxy.ts:238-250)
// only fires when openCodeRuntime.isReady() is false OR isRestarting() is
// true OR getPort() is null — none of which change after the kill.
//
// Instead, the http-proxy-middleware error handler (proxy.ts:353-358) returns
// 503 { error: "OpenCode service unavailable" } when the TCP connection to
// the dead upstream fails. This test verifies that the proxy:
//   a) returns 503 after the upstream dies (covered below).
//
// Recovery (restarting OC on the same port and observing 200 via the same
// proxy) is not tested here. The runtime singleton caches the upstream
// configuration and is not invalidated when the upstream dies and restarts.
// The proxy middleware may also hold stale connections that continue to
// error even after the new OC is listening. True end-to-end recovery would
// require a fresh OpenChamber process (new module load), which is
// impractical in this shared-instance suite.
//
// The restarting: true flag from the plan's original assertion is not
// available through this path. See also the plan's adaptation guidance at
// .superpawers/plans/2026-06-25-test-strategy-slice-3.md:261.

describeWhenOpenCode("OpenChamber proxy returns 503 while OpenCode is restarting", () => {
  test(
    "GET /api/session returns 503 after OpenCode is killed",
    async () => {
      // Acquire the shared OC PID from the pid file written at spawn time.
      const pid = await getOpencodePid(ocCwd!)
      expect(pid).toBeDefined()

      // Confirm OC is alive before killing.
      process.kill(pid!, 0)

      // Confirm the proxy can reach the upstream before we kill it.
      const preRes = await fetch(`${openchamber!.baseUrl}/api/session`)
      expect(preRes.status).toBe(200)

      // Kill OpenCode via PID only — never by name.
      process.kill(pid!, "SIGKILL")

      // Poll /api/session for up to 3s for a 503 response. The proxy's
      // http-proxy-middleware error handler returns 503 when the upstream
      // TCP connection fails.
      let saw503 = false
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`${openchamber!.baseUrl}/api/session`)
          if (res.status === 503) {
            saw503 = true
            break
          }
        } catch { /* connection refused / etc — keep polling */ }
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(saw503).toBe(true)

      // Wait for the OS to release the listening port, confirming the
      // upstream is fully gone.
      await waitForPortFree(opencode!.port)
    },
    30_000,
  )
})
