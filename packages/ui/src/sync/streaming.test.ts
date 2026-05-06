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
})
