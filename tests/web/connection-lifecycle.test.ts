import { expect, test } from "vitest"
import { describeWithOpenChamber } from "../helpers/integration-suite"

describeWithOpenChamber("OpenChamber web connection lifecycle", {}, (ctx) => {
  test("web server starts against external OpenCode and responds to /health", async () => {
    const response = await fetch(`${ctx.openchamber.baseUrl}/health`)
    expect(response.status).toBe(200)
    const body = await response.json() as { status?: string }
    expect(body.status).toBe("ok")
  }, 15_000)
})
