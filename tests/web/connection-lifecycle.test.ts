import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"
import { startOpenChamberAgainstOpenCode, type StartedOpenChamber } from "../helpers/openchamber-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined
let openchamber: StartedOpenChamber | undefined

// File-level afterAll ensures cleanup runs even if describe block hooks
// are inconsistent in certain vitest fork pool edge cases.
// Stop OpenChamber first (graceful disconnect from OpenCode), then OpenCode.
afterAll(async () => {
  try { await openchamber?.stop() } catch { /* best-effort */ }
  try { await opencode?.stop() } catch { /* best-effort */ }
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenChamber web connection lifecycle", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
    openchamber = await startOpenChamberAgainstOpenCode({ opencodeHost: opencode.baseUrl })
  }, 30_000)

  test("web server starts against external OpenCode and responds to /health", async () => {
    const response = await fetch(`${openchamber!.baseUrl}/health`)
    expect(response.status).toBe(200)
    const body = await response.json() as { status?: string }
    expect(body.status).toBe("ok")
  }, 15_000)
})
