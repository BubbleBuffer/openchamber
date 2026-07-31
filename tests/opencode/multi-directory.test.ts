import { beforeAll, expect, test } from "vitest"
import fs from "node:fs/promises"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode multi-directory routing", { timeoutMs: 20_000 }, (ctx) => {
  let dirA = ""
  let dirB = ""

  beforeAll(async () => {
    dirA = path.join(ctx.opencode.cwd, "project-a")
    dirB = path.join(ctx.opencode.cwd, "project-b")
    await fs.mkdir(dirA, { recursive: true })
    await fs.mkdir(dirB, { recursive: true })
  })

  test("sessions in different directories are isolated", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

    const inA = await client.session.create({ title: "session-a", directory: dirA })
    const inB = await client.session.create({ title: "session-b", directory: dirB })
    expect(inA.data?.id).toBeTruthy()
    expect(inB.data?.id).toBeTruthy()
    expect(inA.data?.id).not.toEqual(inB.data?.id)

    const listA = await client.session.list({ directory: dirA })
    const listB = await client.session.list({ directory: dirB })
    const idsA = (listA.data ?? []).map((s) => s.id)
    const idsB = (listB.data ?? []).map((s) => s.id)
    expect(idsA).toContain(inA.data!.id)
    expect(idsA).not.toContain(inB.data!.id)
    expect(idsB).toContain(inB.data!.id)
    expect(idsB).not.toContain(inA.data!.id)

    await client.session.delete({ sessionID: inA.data!.id, directory: dirA })
    await client.session.delete({ sessionID: inB.data!.id, directory: dirB })
  })

  test("session.get returns session from its own directory", async () => {
    const client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })

    const created = await client.session.create({ title: "scope-check", directory: dirA })
    const id = created.data!.id

    const byId = await client.session.get({ sessionID: id, directory: dirA })
    expect(byId.response.status).toBe(200)
    expect(byId.data?.id).toBe(id)

    await client.session.delete({ sessionID: id, directory: dirA })
  })
})
