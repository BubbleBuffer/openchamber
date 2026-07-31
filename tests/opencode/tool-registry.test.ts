import { beforeAll, expect, test } from "vitest"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import { describeWithOpenCode } from "../helpers/integration-suite"

describeWithOpenCode("OpenCode tool registry", { timeoutMs: 30_000 }, (ctx) => {
  let client: OpencodeClient

  beforeAll(() => {
    client = createOpencodeClient({ baseUrl: ctx.opencode.baseUrl })
  }, 30_000)

  test("tool.ids returns non-empty list containing common built-ins", async () => {
    const result = await client.tool.ids({})
    const ids = result.data ?? []
    expect(Array.isArray(ids)).toBe(true)
    expect(ids.length).toBeGreaterThan(0)
    // OpenCode's well-known built-in tools. Asserting "at least one" rather
    // than exact membership because the tool set evolves across versions.
    const wellKnown = ["bash", "read", "write", "edit", "glob", "grep"]
    const present = wellKnown.filter((name) => ids.includes(name))
    expect(present.length).toBeGreaterThan(0)
  })

  test("tool.list returns objects with id, description, and JSON-schema parameters", async () => {
    const result = await client.tool.list({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    })
    const tools = result.data ?? []
    expect(tools.length).toBeGreaterThan(0)
    const first = tools[0] as { id?: string; description?: string; parameters?: unknown }
    expect(typeof first.id).toBe("string")
    expect(typeof first.description).toBe("string")
    expect(first.parameters).toBeDefined()
  })

  test("every tool listed by tool.list has its id in tool.ids", async () => {
    const idsResult = await client.tool.ids({})
    const listResult = await client.tool.list({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    })
    const allIds = idsResult.data ?? []
    // tool.list() returns ToolListItem[] (array of {id, description, parameters}),
    // not a dict keyed by ID. Extract the id field from each entry.
    const listItems = listResult.data ?? []
    for (const item of listItems) {
      expect(allIds).toContain(item.id)
    }
  })
})
