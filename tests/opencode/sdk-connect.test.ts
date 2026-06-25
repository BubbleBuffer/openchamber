import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined

// File-level afterAll ensures cleanup runs even if describe block hooks
// are inconsistent in certain vitest fork pool edge cases.
afterAll(async () => {
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode HTTP connectivity", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("responds over HTTP", async () => {
    const response = await fetch(opencode!.baseUrl)
    expect(response.status).toBeLessThan(500)
  })

  test("/health endpoint returns OK", async () => {
    const response = await fetch(`${opencode!.baseUrl}/health`)
    expect(response.status).toBeLessThan(500)
  })
})
