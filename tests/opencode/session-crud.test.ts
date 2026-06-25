import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
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

describeWhenOpenCode("OpenCode session CRUD", () => {
  beforeAll(async () => {
    opencode = await startOpenCodeInstance()
  }, 20_000)

  test("create, list, get, and delete a session", async () => {
    const client = createOpencodeClient({ baseUrl: opencode!.baseUrl })

    // Create
    const title = "integration test session"
    const createResult = await client.session.create({ title })
    const created = createResult.data
    expect(created).toBeDefined()
    expect(created?.id).toBeTruthy()
    expect(created?.title).toBe(title)
    const sessionId = created!.id

    // List
    const listResult = await client.session.list()
    const sessions = listResult.data ?? []
    const found = sessions.some((s) => s.id === sessionId)
    expect(found).toBe(true)

    // Get
    const getResult = await client.session.get({ sessionID: sessionId })
    const fetched = getResult.data
    expect(fetched).toBeDefined()
    expect(fetched?.id).toBe(sessionId)
    expect(fetched?.title).toBe(title)

    // Delete
    const deleteResult = await client.session.delete({ sessionID: sessionId })
    expect(deleteResult.data).toBe(true)

    // Verify deletion
    const listAfterResult = await client.session.list()
    const sessionsAfter = listAfterResult.data ?? []
    const stillExists = sessionsAfter.some((s) => s.id === sessionId)
    expect(stillExists).toBe(false)
  })
})
