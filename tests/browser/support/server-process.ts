import { spawn, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { killProcess, removeTempDir } from "../../helpers/cleanup"
import { createProcessLogBuffer } from "../../helpers/logs"
import { getAvailablePort } from "../../helpers/ports"
import { waitForHttp } from "../../helpers/opencode-process"

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..")
const SERVER_TEMP_DIR_PREFIX = path.join(os.tmpdir(), "openchamber-openchamber-")
const WATCHDOG_SCRIPT = path.resolve(import.meta.dirname, "../../helpers/opencode-watchdog.cjs")

export function getBrowserBunBinary(env: Record<string, string | undefined> = process.env): string {
  const configured = env.BUN_BINARY?.trim()
  return configured || "bun"
}

export function getOpenChamberPidPath(root: string): string {
  return path.join(root, "pid")
}

export type StartedOpenChamber = {
  baseUrl: string
  port: number
  pid: number
  pidPath: string
  dataDir: string
  logs: { dump(): string }
  stop(): Promise<void>
}

export async function startOpenChamberProcess(options: {
  openCodeUrl: string
  dataDir?: string
  root?: string
  password?: string
  port?: number
  timeoutMs?: number
  initialSettings?: Record<string, unknown>
}): Promise<StartedOpenChamber> {
  const root = options.root ?? await fs.mkdtemp(SERVER_TEMP_DIR_PREFIX)
  const ownsRoot = !options.root
  const dataDir = options.dataDir ?? path.join(root, "data")
  await fs.mkdir(dataDir, { recursive: true })
  if (options.initialSettings) {
    await fs.writeFile(
      path.join(dataDir, "settings.json"),
      JSON.stringify(options.initialSettings),
      "utf8",
    )
  }
  const home = path.join(root, "home")
  await fs.mkdir(home, { recursive: true })
  const port = options.port ?? await getAvailablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const logs = createProcessLogBuffer("openchamber")
  const env = { ...process.env }
  delete env.OPENCODE_SERVER_PASSWORD
  Object.assign(env, {
    OPENCHAMBER_DATA_DIR: dataDir,
    OPENCHAMBER_UI_PASSWORD: options.password ?? "browser-test-password",
    OPENCODE_HOST: options.openCodeUrl,
    OPENCODE_SKIP_START: "true",
    OPENCHAMBER_SKIP_OPENCODE_START: "true",
    OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION: "true",
    HOME: home,
    XDG_CONFIG_HOME: path.join(root, "xdg-config"),
    XDG_DATA_HOME: path.join(root, "xdg-data"),
    XDG_STATE_HOME: path.join(root, "xdg-state"),
    XDG_CACHE_HOME: path.join(root, "xdg-cache"),
  })
  const child: ChildProcessByStdio<null, Readable, Readable> = spawn(
    getBrowserBunBinary(),
    ["run", "--cwd", "packages/web", "bin/cli.js", "serve", "--port", String(port), "--host", "127.0.0.1", "--foreground"],
    { cwd: REPO_ROOT, env, stdio: ["ignore", "pipe", "pipe"] },
  )
  const childFailure = waitForChildFailure(child)
  if (child.pid === undefined) {
    const launchFailure = await Promise.race([
      childFailure.then(() => null, (error) => error),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ])
    await killProcess(child, "SIGKILL")
    if (ownsRoot) await removeTempDir(root)
    throw new Error(`OpenChamber launcher failed before exposing a PID: ${String(launchFailure ?? "child did not expose a PID")}`)
  }
  const pidPath = getOpenChamberPidPath(root)
  let watchdog: ReturnType<typeof spawn>
  try {
    await fs.writeFile(pidPath, String(child.pid), "utf8")
    watchdog = spawn(process.execPath, [WATCHDOG_SCRIPT, String(child.pid)], { stdio: "ignore" })
  } catch (error) {
    await killProcess(child, "SIGKILL")
    if (ownsRoot) await removeTempDir(root)
    throw new Error(`Failed to install OpenChamber PID guard: ${String(error)}`)
  }
  child.stdout.on("data", (chunk) => logs.pushStdout(chunk))
  child.stderr.on("data", (chunk) => logs.pushStderr(chunk))
  try {
    await Promise.race([
      waitForHttp(baseUrl, options.timeoutMs ?? 30_000),
      childFailure,
    ])
  } catch (error) {
    await killProcess(child, "SIGKILL")
    try { watchdog.kill("SIGKILL") } catch { /* best-effort */ }
    if (ownsRoot) await removeTempDir(root)
    throw new Error(`OpenChamber failed to start at ${baseUrl}: ${String(error)}\n${logs.dump()}`)
  }

  return {
    baseUrl,
    port,
    pid: child.pid ?? -1,
    pidPath,
    dataDir,
    logs,
    async stop() {
      await killProcess(child)
      try { watchdog.kill("SIGKILL") } catch { /* best-effort */ }
      if (ownsRoot) await removeTempDir(root)
    },
  }
}

async function waitForChildFailure(child: ChildProcessByStdio<null, Readable, Readable>): Promise<never> {
  return new Promise((_, reject) => {
    child.once("error", reject)
    child.once("exit", (code, signal) => {
      reject(new Error(`OpenChamber exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"})`))
    })
  })
}
