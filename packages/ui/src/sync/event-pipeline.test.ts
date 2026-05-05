import { describe, expect, it } from "bun:test"
import { createEventPipeline } from "./event-pipeline"
import type { Event, OpencodeClient } from "@/lib/opencode/client"

function mockSdk(events: Event[]): OpencodeClient {
  return {
    global: {
      event: async ({ signal }: { signal?: AbortSignal } = {}) => ({
        stream: (async function* () {
          for (const event of events) {
            if (signal?.aborted) break
            yield { payload: event }
            await new Promise((r) => setTimeout(r, 10))
          }
        })(),
      }),
    },
    getBaseUrl: () => "http://localhost:3001",
  } as unknown as OpencodeClient
}

describe("createEventPipeline", () => {
  it("does not orphan remaining events when onEvent throws", async () => {
    const events: Event[] = [
      { type: "session.status", properties: { sessionID: "s1", info: { type: "busy" } } } as Event,
      { type: "message.updated", properties: { info: { id: "m1", sessionID: "s1", role: "assistant" } } } as Event,
      { type: "session.status", properties: { sessionID: "s1", info: { type: "idle" } } } as Event,
    ]
    const received: string[] = []
    let shouldThrow = false
    const { cleanup } = createEventPipeline({
      sdk: mockSdk(events),
      transport: "sse",
      onEvent: (_directory, payload) => {
        if (shouldThrow) { shouldThrow = false; throw new Error("handler crash") }
        received.push(payload.type)
        if (payload.type === "message.updated") shouldThrow = true
      },
    })
    await new Promise((r) => setTimeout(r, 300))
    cleanup()
    expect(received.filter((t) => t === "session.status")).toHaveLength(2)
  })

  it("increases reconnect delay with consecutive failures", async () => {
    let attempts = 0
    const sdk: OpencodeClient = {
      global: { event: async () => { attempts++; throw new Error("fail") } },
      getBaseUrl: () => "http://localhost:3001",
    } as unknown as OpencodeClient
    const { cleanup } = createEventPipeline({
      sdk, transport: "sse", reconnectDelayMs: 50, heartbeatTimeoutMs: 5000,
      onEvent: () => {}, onDisconnect: () => {},
    })
    await new Promise((r) => setTimeout(r, 600))
    cleanup()
    expect(attempts).toBeGreaterThanOrEqual(3)
  })
})
