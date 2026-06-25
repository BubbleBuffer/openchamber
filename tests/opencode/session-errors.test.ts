import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { checkOpenCodeAvailable } from "../helpers/env"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

const availability = await checkOpenCodeAvailable()

let opencode: StartedOpenCode | undefined
const garbageSessionId = "ses_nonexistent_zzzzzzzzzzzzzzzzz"

afterAll(async () => {
  await opencode?.stop()
})

const describeWhenOpenCode = availability.available ? describe : describe.skip

describeWhenOpenCode("OpenCode session error paths", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("session.get with unknown id returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.get({ sessionID: garbageSessionId })
    expect(result.response.status).toBe(404)
  })

  test("session.delete with unknown id returns false/404 (not a throw)", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.delete({ sessionID: garbageSessionId })
    expect(result.response.status).toBe(404)
  })

  test("session.update with unknown id returns 404", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.update({ sessionID: garbageSessionId, title: "noop" })
    expect(result.response.status).toBe(404)
  })

  test("messages.list on unknown session returns 404 (or empty)", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.messages({ sessionID: garbageSessionId })
    expect([200, 404]).toContain(result.response.status)
    if (result.response.status === 200) {
      expect(Array.isArray(result.data ?? [])).toBe(true)
    }
  })

  test("session.create with empty title succeeds with a generated id", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })
    const result = await client.session.create({ title: "", directory: opencode!.cwd })
    expect(result.response.status).toBe(200)
    expect(result.data?.id).toBeTruthy()
    await client.session.delete({ sessionID: result.data!.id })
  })
})
