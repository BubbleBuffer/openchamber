import { expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenCode } from "../helpers/integration-suite"

const archivedAt = Date.now()

describeWithOpenCode("OpenCode session archive", { timeoutMs: 20_000 }, (ctx) => {
  test("archive moves a session out of the default list and into the archived list", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

    const created = await client.session.create({ title: "to-archive", directory: ctx.opencode.cwd })
    const id = created.data!.id

    const beforeDefault = await client.experimental.session.list({ directory: ctx.opencode.cwd })
    expect((beforeDefault.data ?? []).some((s) => s.id === id)).toBe(true)

    const archived = await client.session.update({ sessionID: id, time: { archived: archivedAt } })
    expect(archived.data?.id).toBe(id)
    expect(archived.data?.time?.archived).toBe(archivedAt)

    const afterDefault = await client.experimental.session.list({ directory: ctx.opencode.cwd })
    expect((afterDefault.data ?? []).some((s) => s.id === id)).toBe(false)

    const archivedList = await client.experimental.session.list({
      directory: ctx.opencode.cwd,
      archived: true,
    })
    expect((archivedList.data ?? []).some((s) => s.id === id)).toBe(true)

    const fetched = await client.session.get({ sessionID: id })
    expect(fetched.data?.id).toBe(id)
    expect(fetched.data?.time?.archived).toBe(archivedAt)
  })

  test("archive is reversible by setting time.archived to 0", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

    const created = await client.session.create({ title: "to-unarchive", directory: ctx.opencode.cwd })
    const id = created.data!.id

    await client.session.update({ sessionID: id, time: { archived: archivedAt + 1 } })

    const archived = await client.experimental.session.list({
      directory: ctx.opencode.cwd,
      archived: true,
    })
    expect((archived.data ?? []).some((s) => s.id === id)).toBe(true)

    const unarchived = await client.session.update({ sessionID: id, time: { archived: 0 } })
    expect(unarchived.data?.time?.archived).toBe(0)

    const fetched = await client.session.get({ sessionID: id })
    expect(fetched.data?.time?.archived).toBe(0)
  })

  test("archived session is still deletable", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

    const created = await client.session.create({ title: "archived-then-deleted", directory: ctx.opencode.cwd })
    const id = created.data!.id

    await client.session.update({ sessionID: id, time: { archived: archivedAt + 2 } })

    const deleted = await client.session.delete({ sessionID: id })
    expect(deleted.data).toBe(true)

    const after = await client.session.get({ sessionID: id })
    expect(after.response.status).toBe(404)
  })
})
