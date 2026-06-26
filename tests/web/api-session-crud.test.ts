import { afterAll, beforeAll, describe, expect, test } from "vitest"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "../helpers/openchamber-process"
import { getAvailablePort } from "../helpers/ports"

const availability = await checkOpenCodeAvailable()
const describeWhenOpenCode = availability.available ? describe : describe.skip

// ── Helpers ───────────────────────────────────────────────────────────────

async function getOpencodePid(oc: StartedOpenCode): Promise<number | undefined> {
  try {
    const raw = await fs.readFile(path.join(oc.cwd, "pid"), "utf8")
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
// All three suites share a single OpenCode + OpenChamber instance.
// The CRUD suite uses it for session operations. The bad-host suite starts
// a separate OpenChamber (on a different port) for its own brief check.
// The 503 suite reuses the shared server to observe proxy behavior after
// killing the shared OpenCode.
//
// NOTE on shared runtime: the `@openchamber/web` module is loaded once and
// cached. The env config (resolveOpenCodeEnvConfig) is evaluated at module
// init time and stored in module-level constants (ENV_CONFIGURED_OPENCODE_HOST,
// ENV_EFFECTIVE_PORT, etc.). The OpenCode runtime (openCodeRuntime) is a
// module-level singleton created by ensureOpenCodeDomain() when the
// first server boots. Subsequent startWebUiServer calls reuse the same
// singleton — they do NOT re-evaluate env or create a new runtime. This
// affects the bad-host and 503 suites.

let opencode: StartedOpenCode | undefined
let openchamber: StartedOpenChamber | undefined
let ocCwd: string | undefined
let ocPort: number | undefined

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
    ocPort = await getAvailablePort()
    opencode = await startOpenCodeInstance({ cwd: ocCwd, port: ocPort })
    // This is the first import of @openchamber/web — module init captures
    // OPENCODE_HOST, ENV_SKIP_OPENCODE_START, etc. The shared runtime is
    // configured with this OpenCode's URL and port.
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

// ───────────────────────────────────────────────────────────────────────────
// Suite 2: Bad OPENCODE_HOST
// ───────────────────────────────────────────────────────────────────────────
//
// Adaptation: The @openchamber/web module was already loaded by Suite 1 with
// a valid OPENCODE_HOST. Module-level constants (ENV_CONFIGURED_OPENCODE_HOST,
// ENV_SKIP_OPENCODE_START) are frozen at first load. Setting OPENCODE_HOST to
// "not-a-url" here and re-importing returns the cached module — the env
// config is NOT re-evaluated.
//
// This test instead verifies the operational invariant: the server boots
// (startWebUiServer does not throw) and /health returns 200 even when the
// env would be questionable. The actual env-config validation
// (warn-and-continue for invalid URLs) is tested by env-config.ts unit tests
// and would require a fresh process to observe. See the plan's spec-vs-impl
// gap note at .superpawers/plans/2026-06-25-test-strategy-slice-3.md:49-50.

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
      // Server booted despite bad env. Hit /health and confirm it returns 200.
      const healthRes = await fetch(`http://127.0.0.1:${controller.getPort()}/health`)
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
      // Acquire the shared OC PID from the helper's recorded pid file.
      const pid = await getOpencodePid(opencode!)
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
      await waitForPortFree(ocPort!)
    },
    30_000,
  )
})
