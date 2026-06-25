import { spawn } from "node:child_process"

export function getOpencodeBinary(): string {
  // Test harness control only. OpenChamber's production resolver also checks
  // PATH/common install locations and may evolve independently.
  return (
    process.env.TEST_OPENCODE_BINARY ||
    process.env.OPENCODE_BINARY ||
    process.env.OPENCODE_PATH ||
    process.env.OPENCHAMBER_OPENCODE_PATH ||
    process.env.OPENCHAMBER_OPENCODE_BIN ||
    "opencode"
  ).trim() || "opencode"
}

export function getTestModel(): string | null {
  return (process.env.TEST_MODEL || process.env.OPENCODE_TEST_MODEL || "").trim() || null
}

export function isSlowEnabled(): boolean {
  return process.env.RUN_SLOW_TESTS === "1"
}

export async function checkOpenCodeAvailable(binary = getOpencodeBinary()): Promise<{ available: true } | { available: false; reason: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ available: false, reason: `${binary} --version timed out` })
    }, 5_000)
    child.stderr.on("data", (chunk) => { stderr += String(chunk) })
    child.once("error", (error) => {
      clearTimeout(timeout)
      resolve({ available: false, reason: `${binary} is unavailable: ${error.message}` })
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve({ available: true })
      else resolve({ available: false, reason: `${binary} --version exited ${code}${stderr ? `: ${stderr}` : ""}` })
    })
  })
}
