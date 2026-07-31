import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { removeTempDir } from "./cleanup"
import { checkOpenCodeAvailable, getOpencodeBinary } from "./env"
import { createProcessLogBuffer } from "./logs"
import { getAvailablePort } from "./ports"

const TEMP_DIR_PREFIX = path.join(os.tmpdir(), "openchamber-opencode-")
const WATCHDOG_SCRIPT = path.join(import.meta.dirname, "opencode-watchdog.cjs")
const OWNERSHIP_FILE = "owner.json"
const PROVIDER_ENV_PREFIXES = [
  "AI_GATEWAY_",
  "ANTHROPIC_",
  "AWS_",
  "AZURE_",
  "CEREBRAS_",
  "COHERE_",
  "CLOUDFLARE_",
  "DEEPSEEK_",
  "FIREWORKS_",
  "GEMINI_",
  "GOOGLE_",
  "GROQ_",
  "MISTRAL_",
  "MINIMAX_",
  "MOONSHOT_",
  "OPENAI_",
  "OPENROUTER_",
  "OPENCODE_",
  "PERPLEXITY_",
  "TOGETHERAI_",
  "XAI_",
  "ZAI_",
]

export function getOpenCodePidPath(stateRoot: string): string {
  return path.join(stateRoot, "pid")
}

export function getOpenCodeOwnershipPath(stateRoot: string): string {
  return path.join(stateRoot, OWNERSHIP_FILE)
}

export type StartedOpenCode = {
  baseUrl: string
  port: number
  pid: number
  pidPath: string
  cwd: string
  stateRoot: string
  isolation: OpenCodeIsolation
  logs: { dump(): string }
  stop(): Promise<void>
}

export type OpenCodeIsolation = {
  root: string
  home: string
  xdgConfigHome: string
  xdgDataHome: string
  xdgStateHome: string
  xdgCacheHome: string
  opencodeDataDir: string
  opencodeDbPath: string
  configDir: string
  logDir: string
  configPath: string
  env: Record<string, string>
}

export type OpenCodeConfig = Record<string, unknown>

export async function prepareOpenCodeIsolation(root: string, config?: OpenCodeConfig): Promise<OpenCodeIsolation> {
  const home = path.join(root, "home")
  const xdgConfigHome = path.join(root, "xdg-config")
  const xdgDataHome = path.join(root, "xdg-data")
  const xdgStateHome = path.join(root, "xdg-state")
  const xdgCacheHome = path.join(root, "xdg-cache")
  const opencodeDataDir = path.join(root, "opencode-data")
  const configDir = path.join(xdgConfigHome, "opencode")
  const logDir = path.join(xdgStateHome, "opencode", "logs")
  const configPath = path.join(configDir, "opencode.json")
  const opencodeDbPath = path.join(opencodeDataDir, "opencode.db")
  await Promise.all([
    home,
    xdgConfigHome,
    xdgDataHome,
    xdgStateHome,
    xdgCacheHome,
    opencodeDataDir,
    configDir,
    logDir,
  ].map((directory) => fs.mkdir(directory, { recursive: true })))
  if (config) await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  return {
    root,
    home,
    xdgConfigHome,
    xdgDataHome,
    xdgStateHome,
    xdgCacheHome,
    opencodeDataDir,
    opencodeDbPath,
    configDir,
    logDir,
    configPath,
    env: {
      HOME: home,
      XDG_CONFIG_HOME: xdgConfigHome,
      XDG_DATA_HOME: xdgDataHome,
      XDG_STATE_HOME: xdgStateHome,
      XDG_CACHE_HOME: xdgCacheHome,
      OPENCODE_DATA_DIR: opencodeDataDir,
      OPENCODE_DB: opencodeDbPath,
      OPENCODE_CONFIG_DIR: configDir,
      OPENCODE_LOG_DIR: logDir,
      OPENCODE_DISABLE_MODELS_FETCH: "true",
      NO_PROXY: "127.0.0.1,localhost",
    },
  }
}

export function sanitizeOpenCodeEnvironment(
  source: NodeJS.ProcessEnv,
  isolation: OpenCodeIsolation,
): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = { ...source }
  for (const key of Object.keys(childEnv)) {
    const upperKey = key.toUpperCase()
    if (
      PROVIDER_ENV_PREFIXES.some((prefix) => upperKey.startsWith(prefix)) ||
      /(?:API_KEY|API_TOKEN|ACCESS_KEY|SECRET|TOKEN|PASSWORD|CREDENTIALS_FILE)$/i.test(key)
    ) {
      delete childEnv[key]
    }
    if (/^(?:ALL|HTTP|HTTPS|NO)_PROXY$/i.test(key)) delete childEnv[key]
  }
  Object.assign(childEnv, isolation.env)
  return childEnv
}

export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OpenCodeUnavailableError"
  }
}

// Kill any opencode PIDs that this harness previously spawned but whose
// parent (a vitest fork worker) died before stop() could run. Reaper is
// PID-targeted only — it reads each PID from a pid file we wrote on spawn
// and validates both the owning worker and target process identity before
// terminating. No name matching, no process-name-based kill commands. A live
// owner means another harness run still owns the directory, so it is skipped.
export async function reapOrphanedInstances(): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(path.dirname(TEMP_DIR_PREFIX))
  } catch {
    return
  }
  const prefix = path.basename(TEMP_DIR_PREFIX)
  for (const entry of entries.filter((candidate) => candidate.startsWith(prefix))) {
    const dir = path.join(path.dirname(TEMP_DIR_PREFIX), entry)
    const pidFile = path.join(dir, "pid")
    const ownershipFile = path.join(dir, OWNERSHIP_FILE)
    let pidStr: string
    try {
      pidStr = (await fs.readFile(pidFile, "utf8")).trim()
    } catch {
      continue
    }
    const pid = Number(pidStr)
    if (!Number.isInteger(pid) || pid <= 0) continue
    let ownership: OpenCodeOwnership
    try {
      ownership = JSON.parse(await fs.readFile(ownershipFile, "utf8")) as OpenCodeOwnership
    } catch {
      // Directories without our ownership record are not safe to reap. This
      // also protects concurrent/legacy harness state from a broad prefix scan.
      continue
    }
    if (ownership.targetPid !== pid || !Number.isInteger(ownership.ownerPid) || ownership.ownerPid <= 0) continue
    if (await isProcessAlive(ownership.ownerPid, ownership.ownerStartTime)) continue
    if (!await hasProcessIdentity(pid, ownership.targetStartTime)) {
      // Never kill a PID whose start identity cannot be proved. It may have
      // been reused by an unrelated process after the harness died.
      continue
    }
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // already dead or no permission; ignore
    }
    try {
      await fs.rm(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
}

type OpenCodeOwnership = {
  ownerPid: number
  ownerStartTime: string | null
  targetPid: number
  targetStartTime: string | null
}

export async function getProcessStartTime(pid: number): Promise<string | null> {
  try {
    const stat = await fs.readFile(`/proc/${pid}/stat`, "utf8")
    const closingParen = stat.lastIndexOf(")")
    if (closingParen < 0) return null
    return stat.slice(closingParen + 2).trim().split(/\s+/)[19] ?? null
  } catch {
    return null
  }
}

async function hasProcessIdentity(pid: number, expectedStartTime: string | null): Promise<boolean> {
  if (!expectedStartTime) return false
  return (await getProcessStartTime(pid)) === expectedStartTime
}

async function isProcessAlive(pid: number, expectedStartTime: string | null): Promise<boolean> {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  // If /proc is unavailable, retaining the directory is safer than risking a
  // kill after PID reuse. Linux CI exposes this identity for our harness.
  if (!expectedStartTime) return true
  return (await getProcessStartTime(pid)) === expectedStartTime
}

export async function startOpenCodeInstance(options: {
  cwd?: string
  port?: number
  timeoutMs?: number
  stateRoot?: string
  config?: OpenCodeConfig
} = {}): Promise<StartedOpenCode> {
  await reapOrphanedInstances()
  const availability = await checkOpenCodeAvailable()
  if (!availability.available) throw new OpenCodeUnavailableError(availability.reason)
  const port = options.port ?? await getAvailablePort()
  const stateRoot = options.stateRoot ?? await fs.mkdtemp(TEMP_DIR_PREFIX)
  const ownsStateRoot = !options.stateRoot
  const isolation = await prepareOpenCodeIsolation(stateRoot, options.config)
  const cwd = options.cwd ?? (options.stateRoot ? path.join(stateRoot, "workspace") : stateRoot)
  await fs.mkdir(cwd, { recursive: true })
  const baseUrl = `http://127.0.0.1:${port}`
  const logs = createProcessLogBuffer("opencode")
  // Strip inherited env that would change opencode's behaviour or lock the
  // spawned server behind auth. Tests run against a no-auth local instance;
  // the user's shell commonly has OPENCODE_SERVER_PASSWORD set (their
  // OpenChamber web server sets it for its own managed instance), and
  // inheriting it would force every test request to send basic-auth headers.
  const childEnv = sanitizeOpenCodeEnvironment(process.env, isolation)
  const child = spawn(getOpencodeBinary(), ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  })

  // Record the spawned PID to <stateRoot>/pid so the reaper can find it if the
  // parent dies unexpectedly. Only place we ever write a process identifier
  // for later targeted cleanup.
  if (child.pid !== undefined) {
    try {
      const targetStartTime = await getProcessStartTime(child.pid)
      await fs.writeFile(getOpenCodePidPath(stateRoot), String(child.pid))
      if (cwd !== stateRoot) await fs.writeFile(getOpenCodePidPath(cwd), String(child.pid))
      await fs.writeFile(getOpenCodeOwnershipPath(stateRoot), JSON.stringify({
        ownerPid: process.pid,
        ownerStartTime: await getProcessStartTime(process.pid),
        targetPid: child.pid,
        targetStartTime,
      }))
    } catch {
      // best-effort
    }
  }

  // Sibling watchdog: a tiny Node.js process that polls process.ppid every
  // 250ms. If our parent (this vitest fork) dies for any reason — including
  // SIGKILL, which skips process.on("exit") — the watchdog detects the
  // ppid change and sends SIGKILL to the opencode child. PID-targeted only.
  let watchdog: ReturnType<typeof spawn> | undefined
  if (child.pid !== undefined) {
    watchdog = spawn(process.execPath, [WATCHDOG_SCRIPT, String(child.pid)], {
      stdio: "ignore",
    })
  }

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
    if (ownsStateRoot) await removeTempDir(stateRoot)
    throw new Error(`OpenCode failed to start at ${baseUrl}: ${String(error)}\n${logs.dump()}`)
  }

  return {
    baseUrl,
    port,
    pid: child.pid ?? -1,
    pidPath: getOpenCodePidPath(cwd),
    cwd,
    stateRoot,
    isolation,
    logs,
    async stop() {
      process.off("exit", killOnExit)
      // Kill the child process synchronously. Use child.kill (which updates
      // the .killed flag) instead of process.kill so that the safety-net
      // process.on("exit") handler knows the child was already dealt with.
      try { child.kill("SIGKILL") } catch { /* best-effort */ }
      // Kill the sibling watchdog. It will detect the child is dead on its
      // next poll and exit; sending SIGKILL here is a fast path.
      try { watchdog?.kill("SIGKILL") } catch { /* best-effort */ }
      if (ownsStateRoot) await removeTempDir(stateRoot)
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

export async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const urlPath of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${urlPath}`, {
          signal: AbortSignal.timeout(2_000),
        })
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw lastError ?? new Error("Timed out waiting for OpenCode HTTP endpoint")
}
