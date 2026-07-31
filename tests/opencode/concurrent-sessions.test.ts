import { expect, test } from "vitest"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode concurrent sessions", { timeoutMs: 20_000 }, (ctx) => {
  test("creating N sessions in parallel yields N distinct ids", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
    const N = 10

    const created = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        client.session.create({ title: `parallel-${i}`, directory: ctx.opencode.cwd }),
      ),
    )

    const ids = created.map((r) => r.data?.id).filter((id): id is string => typeof id === "string")
    expect(ids).toHaveLength(N)
    expect(new Set(ids).size).toBe(N)

    const list = await client.session.list({ directory: ctx.opencode.cwd })
    const listedIds = new Set((list.data ?? []).map((s) => s.id))
    for (const id of ids) expect(listedIds.has(id)).toBe(true)

    await Promise.all(
      ids.map((id) => client.session.delete({ sessionID: id, directory: ctx.opencode.cwd })),
    )
  })

  test("parallel updates to distinct sessions do not corrupt each other", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
    const N = 6

    const created = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        client.session.create({ title: `update-${i}`, directory: ctx.opencode.cwd }),
      ),
    )
    const ids = created.map((r) => r.data!.id)

    const updated = await Promise.all(
      ids.map((id, i) =>
        client.session.update({ sessionID: id, title: `renamed-${i}` }),
      ),
    )

    expect(updated).toHaveLength(N)
    for (let i = 0; i < N; i++) {
      expect(updated[i].data?.title).toBe(`renamed-${i}`)
      expect(updated[i].data?.id).toBe(ids[i])
    }

    await Promise.all(
      ids.map((id) => client.session.delete({ sessionID: id, directory: ctx.opencode.cwd })),
    )
  })

  test("parallel reads via session.list return a consistent snapshot", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
    const N = 5

    const created = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        client.session.create({ title: `snapshot-${i}`, directory: ctx.opencode.cwd }),
      ),
    )
    const ids = created.map((r) => r.data!.id)

    const lists = await Promise.all(
      Array.from({ length: 4 }, () => client.session.list({ directory: ctx.opencode.cwd })),
    )

    for (const list of lists) {
      const listedIds = new Set((list.data ?? []).map((s) => s.id))
      for (const id of ids) expect(listedIds.has(id)).toBe(true)
    }

    await Promise.all(
      ids.map((id) => client.session.delete({ sessionID: id, directory: ctx.opencode.cwd })),
    )
  })
})
