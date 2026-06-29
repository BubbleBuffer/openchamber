import { describe, expect, test } from "vitest"
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode HTTP connectivity", { timeoutMs: 20_000 }, (ctx) => {
  test("responds over HTTP", async () => {
    const response = await fetch(ctx.opencode.baseUrl)
    expect(response.status).toBeLessThan(500)
  })

  test("/health endpoint returns OK", async () => {
    const response = await fetch(`${ctx.opencode.baseUrl}/health`)
    expect(response.status).toBeLessThan(500)
  })
})
