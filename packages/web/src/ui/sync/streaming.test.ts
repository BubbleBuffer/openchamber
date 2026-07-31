import { describe, expect, test } from "bun:test"
import { updateStreamingState, useStreamingStore } from "./streaming"
import type { State } from "./types"

describe("updateStreamingState stuck session recovery", () => {
  test("forces completion after STUCK_SESSION_TIMEOUT_MS of no updates", () => {
    const state = {
      session_status: { s1: { type: "busy" } },
      message: { s1: [{ id: "m1", sessionID: "s1", role: "assistant", time: { created: 1, updated: 1 }, parts: [] }] },
      session: [], sessionTotal: 0, limit: 50, status: "ready",
      vcs: undefined, projectMeta: undefined, icon: undefined,
      command: [], lsp: [], session_diff: {}, todo: {},
      part: {}, permission: {}, question: {},
    } as unknown as State
    updateStreamingState(state)
    expect(useStreamingStore.getState().messageStreamStates.get("m1")?.phase).toBe("streaming")
    useStreamingStore.setState({
      messageStreamStates: new Map([["m1", {
        phase: "streaming" as const,
        startedAt: Date.now() - 6 * 60 * 1000,
        lastUpdateAt: Date.now() - 6 * 60 * 1000,
      }]]),
      streamingMessageIds: new Map([["s1", "m1"]]),
    })
    let stuckSessionId: string | undefined
    updateStreamingState(state, { onStuckSession: (id) => { stuckSessionId = id } })
    expect(useStreamingStore.getState().messageStreamStates.get("m1")?.phase).toBe("completed")
    expect(stuckSessionId).toBe("s1")
  })

  // RC-5: Sessions that go busy but never produce an assistant message must
  // also recover. The per-message stuck check can't catch this because no
  // streamState entry is created without a streaming assistant message.
  test("recovers sessions stuck busy with no assistant message ever produced", () => {
    useStreamingStore.setState({
      streamingMessageIds: new Map(),
      messageStreamStates: new Map(),
      busySinceBySessionId: new Map(),
    })
    const state = {
      session_status: { s2: { type: "busy" } },
      message: { s2: [] }, // No assistant message — server hung before any output
      session: [], sessionTotal: 0, limit: 50, status: "ready",
      vcs: undefined, projectMeta: undefined, icon: undefined,
      command: [], lsp: [], session_diff: {}, todo: {},
      part: {}, permission: {}, question: {},
    } as unknown as State

    // First call records busySince = now.
    updateStreamingState(state)
    expect(useStreamingStore.getState().busySinceBySessionId.get("s2")).toBeGreaterThan(0)

    // Backdate busySince so the timeout window has elapsed.
    useStreamingStore.setState({
      busySinceBySessionId: new Map([["s2", Date.now() - 6 * 60 * 1000]]),
    })

    let stuckSessionId: string | undefined
    updateStreamingState(state, { onStuckSession: (id) => { stuckSessionId = id } })
    expect(stuckSessionId).toBe("s2")
    expect(useStreamingStore.getState().busySinceBySessionId.has("s2")).toBe(false)
  })
})
