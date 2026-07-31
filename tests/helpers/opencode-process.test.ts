import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { createServer, type Server, type Socket } from "node:net"
import {
  getOpenCodeOwnershipPath,
  getOpenCodePidPath,
  getProcessStartTime,
  prepareOpenCodeIsolation,
  reapOrphanedInstances,
  sanitizeOpenCodeEnvironment,
  waitForHttp,
} from "./opencode-process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

describe("waitForHttp", () => {
  let hangingServer: Server
  let port: number
  // Keep references to sockets so we can destroy them on teardown — otherwise
  // close() hangs waiting for accepted sockets to finish.
  const sockets = new Set<Socket>()

  beforeEach(async () => {
    hangingServer = createServer((socket) => {
      // Accept the TCP connection but never send an HTTP response.
      // This simulates the race where opencode has bound the port but the
      // HTTP server is not yet processing requests.
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
    })
    await new Promise<void>((resolve) => hangingServer.listen(0, "127.0.0.1", resolve))
    port = (hangingServer.address() as { port: number }).port
  })

  afterEach(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((resolve) => hangingServer.close(() => resolve()))
  })

  it("rejects within a bounded time when the server accepts but never responds", async () => {
    // With the per-request timeout fix, each fetch aborts after 2s.
    // A 5s overall deadline means the function rejects well under the
    // OS TCP timeout (21s+) — observed ~8s in practice.
    // Without the fix, a single fetch hangs 21-127s (OS TCP timeout),
    // so this assertion fails against the unbounded code.
    const start = Date.now()
    await expect(
      waitForHttp(`http://127.0.0.1:${port}`, 5_000),
    ).rejects.toThrow()
    const elapsed = Date.now() - start
    // Should complete well under the OS TCP timeout (21s+).
    // Generous upper bound: 12s (5s deadline + 2s per-request timeout + slack).
    expect(elapsed).toBeLessThan(12_000)
  })
})

describe("prepareOpenCodeIsolation", () => {
  it("keeps OpenCode config, state, cache, and data under the worker root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-isolation-test-"))
    try {
      const isolation = await prepareOpenCodeIsolation(root)
      expect(isolation.env.HOME).toBe(isolation.home)
      expect(isolation.env.XDG_CONFIG_HOME).toBe(isolation.xdgConfigHome)
      expect(isolation.env.XDG_DATA_HOME).toBe(isolation.xdgDataHome)
      expect(isolation.env.XDG_STATE_HOME).toBe(isolation.xdgStateHome)
      expect(isolation.env.XDG_CACHE_HOME).toBe(isolation.xdgCacheHome)
      expect(isolation.env.OPENCODE_DATA_DIR).toBe(isolation.opencodeDataDir)
      expect(isolation.env.OPENCODE_DB).toBe(isolation.opencodeDbPath)
      expect(isolation.env.OPENCODE_DISABLE_MODELS_FETCH).toBe("true")
      expect(isolation.configPath.startsWith(root)).toBe(true)
      expect(isolation.opencodeDataDir.startsWith(root)).toBe(true)
      expect(isolation.opencodeDbPath.startsWith(root)).toBe(true)
      expect(isolation.env.XDG_DATA_HOME).not.toBe(process.env.XDG_DATA_HOME)
      expect(isolation.env.OPENCODE_DATA_DIR).not.toBe(process.env.OPENCODE_DATA_DIR)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("writes an optional provider config only inside the isolated root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-config-test-"))
    const config = {
      provider: {
        "browser-test": {
          api: "openai",
          options: {
            baseURL: "http://127.0.0.1:4567/v1",
            apiKey: "browser-test-key",
          },
          models: { "test-model": { name: "Browser Test Model" } },
        },
      },
    }
    try {
      const isolation = await prepareOpenCodeIsolation(root, config)
      expect(JSON.parse(await fs.readFile(isolation.configPath, "utf8"))).toEqual(config)
      expect(isolation.configPath.startsWith(root)).toBe(true)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("removes inherited database, provider credentials, and proxy settings", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-env-test-"))
    try {
      const isolation = await prepareOpenCodeIsolation(root)
      const childEnv = sanitizeOpenCodeEnvironment({
        PATH: "/test/path",
        OPENCODE_DB: "/outside/opencode.db",
        OPENCODE_SERVER_PASSWORD: "secret",
        OPENAI_API_KEY: "secret",
        ANTHROPIC_API_TOKEN: "secret",
        AWS_SHARED_CREDENTIALS_FILE: "/outside/credentials",
        THIRD_PARTY_API_KEY: "secret",
        GITLAB_TOKEN: "secret",
        HTTPS_PROXY: "http://outside-proxy.invalid",
        SAFE_TEST_VALUE: "kept",
      }, isolation)
      expect(childEnv.PATH).toBe("/test/path")
      expect(childEnv.SAFE_TEST_VALUE).toBe("kept")
      expect(childEnv.OPENCODE_DB).toBe(isolation.opencodeDbPath)
      expect(childEnv.OPENCODE_SERVER_PASSWORD).toBeUndefined()
      expect(childEnv.OPENAI_API_KEY).toBeUndefined()
      expect(childEnv.ANTHROPIC_API_TOKEN).toBeUndefined()
      expect(childEnv.AWS_SHARED_CREDENTIALS_FILE).toBeUndefined()
      expect(childEnv.THIRD_PARTY_API_KEY).toBeUndefined()
      expect(childEnv.GITLAB_TOKEN).toBeUndefined()
      expect(childEnv.HTTPS_PROXY).toBeUndefined()
      expect(childEnv.XDG_CONFIG_HOME).toBe(isolation.xdgConfigHome)
      expect(childEnv.HOME).toBe(isolation.home)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe("reapOrphanedInstances", () => {
  async function startProbe(): Promise<ReturnType<typeof spawn>> {
    return spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  }

  async function writeOwnership(root: string, child: ReturnType<typeof spawn>, ownerPid: number, ownerStartTime: string | null): Promise<void> {
    const targetPid = child.pid
    if (targetPid === undefined) throw new Error("probe did not expose a PID")
    const targetStartTime = await getProcessStartTime(targetPid)
    if (!targetStartTime) throw new Error("probe did not expose a process start identity")
    await fs.writeFile(getOpenCodePidPath(root), String(targetPid))
    await fs.writeFile(getOpenCodeOwnershipPath(root), JSON.stringify({ ownerPid, ownerStartTime, targetPid, targetStartTime }))
  }

  it("does not kill a live concurrent harness owner", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-reaper-"))
    const child = await startProbe()
    try {
      await writeOwnership(root, child, process.pid, await getProcessStartTime(process.pid))
      await reapOrphanedInstances()
      expect(() => process.kill(child.pid!, 0)).not.toThrow()
      expect(await fs.stat(root)).toBeTruthy()
    } finally {
      try { child.kill("SIGKILL") } catch { /* best-effort */ }
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("reaps only an owned target whose owner is gone", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-reaper-"))
    const child = await startProbe()
    try {
      await writeOwnership(root, child, 999_999_999, "stale-owner")
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
      await reapOrphanedInstances()
      await exited
      await expect(fs.stat(root)).rejects.toThrow()
    } finally {
      try { child.kill("SIGKILL") } catch { /* best-effort */ }
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
