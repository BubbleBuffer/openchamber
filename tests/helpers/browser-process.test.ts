import { describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { getOpenCodePidPath, reapOrphanedInstances } from "./opencode-process"
import { getBrowserBunBinary, getOpenChamberPidPath, startOpenChamberProcess } from "../browser/support/server-process"

describe("browser process ownership", () => {
  it("uses a PATH-resolved bun command unless BUN_BINARY overrides it", () => {
    expect(getBrowserBunBinary({})).toBe("bun")
    expect(getBrowserBunBinary({ BUN_BINARY: "/custom/bun" })).toBe("/custom/bun")
  })

  it("reports an unavailable Bun launcher without leaking a child", async () => {
    const previous = process.env.BUN_BINARY
    process.env.BUN_BINARY = "/tmp/openchamber-missing-bun"
    try {
      await expect(startOpenChamberProcess({ openCodeUrl: "http://127.0.0.1:1" })).rejects.toThrow(/launcher failed|failed to start/i)
    } finally {
      if (previous === undefined) delete process.env.BUN_BINARY
      else process.env.BUN_BINARY = previous
    }
  })

  it("records OpenCode and OpenChamber PIDs at reaper-discoverable roots", () => {
    const openCodeRoot = "/tmp/openchamber-opencode-browser-worker"
    const openChamberRoot = "/tmp/openchamber-openchamber-worker"
    expect(getOpenCodePidPath(openCodeRoot)).toBe(path.join(openCodeRoot, "pid"))
    expect(getOpenChamberPidPath(openChamberRoot)).toBe(path.join(openChamberRoot, "pid"))
  })

  it("does not reap an active OpenChamber PID from the OpenCode reaper", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openchamber-openchamber-reaper-"))
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", reject)
    })
    await fs.writeFile(getOpenChamberPidPath(root), String(child.pid), "utf8")
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
    try {
      await reapOrphanedInstances()
      expect(() => process.kill(child.pid!, 0)).not.toThrow()
    } finally {
      try { child.kill("SIGKILL") } catch { /* best-effort */ }
      await exited
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
