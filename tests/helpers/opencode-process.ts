import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { killProcess, removeTempDir } from "./cleanup"
import { checkOpenCodeAvailable, getOpencodeBinary } from "./env"
import { createProcessLogBuffer } from "./logs"
import { getAvailablePort } from "./ports"

export type StartedOpenCode = {
  baseUrl: string
  port: number
  cwd: string
  logs: { dump(): string }
  stop(): Promise<void>
}

export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OpenCodeUnavailableError"
  }
}

export async function startOpenCodeInstance(options: { cwd?: string; port?: number; timeoutMs?: number } = {}): Promise<StartedOpenCode> {
  const availability = await checkOpenCodeAvailable()
  if (!availability.available) throw new OpenCodeUnavailableError(availability.reason)
  const port = options.port ?? await getAvailablePort()
  const cwd = options.cwd ?? await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-opencode-"))
  const ownsCwd = !options.cwd
  const baseUrl = `http://127.0.0.1:${port}`
  const logs = createProcessLogBuffer("opencode")
  const child = spawn(getOpencodeBinary(), ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  })

  child.stdout.on("data", (chunk) => logs.pushStdout(chunk))
  child.stderr.on("data", (chunk) => logs.pushStderr(chunk))
  // Unref so the child's stdio doesn't keep the parent's event loop alive.
  // Without this, vitest fork workers may not exit cleanly after the child
  // is killed, and the process.on("exit") cleanup may not fire in time.
  ;(child.stdout as { unref?: () => void }).unref?.()
  ;(child.stderr as { unref?: () => void }).unref?.()

  // Safety net: kill the child when the parent process exits normally.
  // Must NOT use signal handlers (SIGTERM, SIGHUP, etc.) because they
  // override Node.js's default behavior and can prevent the worker from
  // exiting when vitest expects it to.
  const killOnExit = (): void => {
    try {
      if (child.pid !== undefined && !child.killed && child.exitCode === null) {
        process.kill(child.pid, "SIGKILL")
      }
    } catch {
      // best-effort during process shutdown
    }
  }
  process.on("exit", killOnExit)

  try {
    await Promise.race([
      waitForHttp(baseUrl, options.timeoutMs ?? 15_000),
      waitForChildFailure(child),
    ])
  } catch (error) {
    process.off("exit", killOnExit)
    try { child.kill("SIGKILL") } catch { /* best-effort */ }
    if (ownsCwd) await removeTempDir(cwd)
    throw new Error(`OpenCode failed to start at ${baseUrl}: ${String(error)}\n${logs.dump()}`)
  }

  return {
    baseUrl,
    port,
    cwd,
    logs,
    async stop() {
      process.off("exit", killOnExit)
      // Kill the child process synchronously. Use child.kill (which updates
      // the .killed flag) instead of process.kill so that the safety-net
      // process.on("exit") handler knows the child was already dealt with.
      try { child.kill("SIGKILL") } catch { /* best-effort */ }
      if (ownsCwd) await removeTempDir(cwd)
    },
  }
}

async function waitForChildFailure(child: ReturnType<typeof spawn>): Promise<never> {
  return new Promise((_, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      reject(new Error(`OpenCode exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})`))
    })
  })
}

async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const urlPath of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${urlPath}`)
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw lastError ?? new Error("Timed out waiting for OpenCode HTTP endpoint")
}
