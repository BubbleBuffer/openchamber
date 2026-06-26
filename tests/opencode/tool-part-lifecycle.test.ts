import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2"
import { startOpenCodeInstance, type StartedOpenCode } from "../helpers/opencode-process"

let opencode: StartedOpenCode
let client: OpencodeClient
let sessionId: string
let userMessageId: string

beforeAll(async () => {
  opencode = await startOpenCodeInstance()
  client = createOpencodeClient({ baseUrl: opencode.baseUrl })

  // Create a session.
  const created = await client.session.create({ title: "tool-part-lifecycle" })
  sessionId = created.data!.id

  // Create a user message via prompt_async so part.update has a real
  // message to attach to.  prompt_async returns 204 immediately; the
  // message object appears asynchronously.  We poll for it.
  await fetch(`${opencode.baseUrl}/session/${sessionId}/prompt_async`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: { providerID: "noop", modelID: "noop" },
      parts: [{ type: "text", text: "probe" }],
    }),
  })

  // Poll until the user message materialises.
  for (let i = 0; i < 20; i++) {
    const msgs = await client.session.messages({ sessionID: sessionId })
    if (msgs.data && msgs.data.length > 0) {
      userMessageId = msgs.data[0].info.id
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!userMessageId) {
    throw new Error("User message did not appear within 5 s")
  }
}, 60_000)

afterAll(async () => {
  await opencode.stop()
})

// SSE helper — mirrors tests/opencode/prompt-async-events.test.ts pattern.
// Small duplication is preferred over a premature shared helper at this scale.
async function openSseStream(baseUrl: string): Promise<{
  buffer: string
  close(): void
}> {
  const ctrl = new AbortController()
  const res = await fetch(`${baseUrl}/event`, { signal: ctrl.signal })
  let buffer = ""
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  ;(async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
      }
    } catch {
      // stream aborted; expected on close
    }
  })()
  return {
    get buffer() {
      return buffer
    },
    close() {
      ctrl.abort()
    },
  }
}

async function waitForBufferText(
  stream: { buffer: string },
  regex: RegExp,
  timeoutMs = 10_000,
): Promise<{ matched: boolean; text: string }> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const text = stream.buffer
    if (regex.test(text)) return { matched: true, text }
    await new Promise((r) => setTimeout(r, 50))
  }
  return { matched: false, text: stream.buffer }
}

describe("OpenCode tool-part lifecycle (synthetic, provider-agnostic)", () => {
  // NOTE: Real tool calls require an LLM provider. We drive state
  // transitions with client.part.update() to inject synthetic ToolParts.
  // OpenCode does not validate that the tool name exists in the registry
  // for part.update() — the SDK accepts any Part2 shape. The wire-format,
  // storage, event stream, and proxy paths are exercised identically to a
  // real tool call.
  const toolName = "noop_test_tool"
  const callID = `call-${Date.now()}`
  const partID = `prt-${Date.now()}`

  test("ToolPart with pending state persists via part.update + messages.list", async () => {
    await client.part.update({
      sessionID: sessionId,
      messageID: userMessageId,
      partID,
      part: {
        id: partID,
        sessionID: sessionId,
        messageID: userMessageId,
        type: "tool",
        callID,
        tool: toolName,
        state: { status: "pending", input: { foo: "bar" }, raw: "" },
      },
    })
    const messages = await client.session.messages({ sessionID: sessionId })
    const toolPart = (messages.data ?? []).flatMap((m) => m.parts ?? []).find((p) => p.id === partID)
    expect(toolPart).toBeDefined()
    expect(toolPart!.type).toBe("tool")
    const state = (toolPart as { state: { status: string; input?: unknown } }).state
    expect(state.status).toBe("pending")
  })

  test("ToolPart transitions to running state with title + time.start", async () => {
    const runningPartID = `${partID}-running`
    await client.part.update({
      sessionID: sessionId,
      messageID: userMessageId,
      partID: runningPartID,
      part: {
        id: runningPartID,
        sessionID: sessionId,
        messageID: userMessageId,
        type: "tool",
        callID,
        tool: toolName,
        state: {
          status: "running",
          input: { foo: "bar" },
          title: "Running noop",
          time: { start: Date.now() },
        },
      },
    })
    const messages = await client.session.messages({ sessionID: sessionId })
    const toolPart = (messages.data ?? [])
      .flatMap((m) => m.parts ?? [])
      .find((p) => p.id === runningPartID)
    expect(toolPart).toBeDefined()
    const state = (toolPart as { state: { status: string; title?: string; time?: { start?: number } } }).state
    expect(state.status).toBe("running")
    expect(state.title).toBe("Running noop")
    expect(typeof state.time?.start).toBe("number")
  })

  test("ToolPart transitions to completed state with output + time.end", async () => {
    const completedPartID = `${partID}-completed`
    await client.part.update({
      sessionID: sessionId,
      messageID: userMessageId,
      partID: completedPartID,
      part: {
        id: completedPartID,
        sessionID: sessionId,
        messageID: userMessageId,
        type: "tool",
        callID,
        tool: toolName,
        state: {
          status: "completed",
          input: { foo: "bar" },
          output: "result-string",
          title: "Completed noop",
          metadata: { duration_ms: 12 },
          time: { start: Date.now() - 100, end: Date.now() },
        },
      },
    })
    const messages = await client.session.messages({ sessionID: sessionId })
    const toolPart = (messages.data ?? [])
      .flatMap((m) => m.parts ?? [])
      .find((p) => p.id === completedPartID)
    expect(toolPart).toBeDefined()
    const state = (toolPart as { state: { status: string; output?: string; time?: { end?: number } } }).state
    expect(state.status).toBe("completed")
    expect(state.output).toBe("result-string")
    expect(typeof state.time?.end).toBe("number")
  })

  test(
    "SSE stream emits message.part.updated events for state transitions",
    async () => {
      const sse = await openSseStream(opencode.baseUrl)
      try {
        const newPartID = `prt-sse-${Date.now()}`
        await client.part.update({
          sessionID: sessionId,
          messageID: userMessageId,
          partID: newPartID,
          part: {
            id: newPartID,
            sessionID: sessionId,
            messageID: userMessageId,
            type: "tool",
            callID,
            tool: toolName,
            state: { status: "pending", input: { sse: true }, raw: "" },
          },
        })
        // Wait for the event referencing our new partID to appear in the SSE buffer.
        const result = await waitForBufferText(sse, new RegExp(newPartID), 10_000)
        expect(result.matched).toBe(true)
      } finally {
        sse.close()
      }
    },
    20_000,
  )
})
