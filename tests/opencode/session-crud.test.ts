import { expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode session CRUD", { timeoutMs: 20_000 }, (ctx) => {
  test("create, list, get, and delete a session", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

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
