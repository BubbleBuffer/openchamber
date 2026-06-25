import fs from "node:fs/promises"
import type { ChildProcess } from "node:child_process"

export async function killProcess(child: ChildProcess | null | undefined, signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (!child.killed && child.exitCode === null) child.kill("SIGKILL")
      resolve()
    }, 2_000)
    child.once("exit", () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill(signal)
  })
}

export async function removeTempDir(path: string | null | undefined): Promise<void> {
  if (!path) return
  await fs.rm(path, { recursive: true, force: true })
}
