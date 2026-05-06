import { describe, expect, test } from "bun:test"
import { useSessionUIStore } from "./session-ui-store"

describe("cleanupSession", () => {
  test("removes abortControllers and sessionAbortFlags for a session", () => {
    const store = useSessionUIStore.getState()
    store.abortControllers.set("s1", new AbortController())
    store.sessionAbortFlags.set("s1", { timestamp: Date.now(), acknowledged: false })
    store.cleanupSession("s1")
    const after = useSessionUIStore.getState()
    expect(after.abortControllers.has("s1")).toBe(false)
    expect(after.sessionAbortFlags.has("s1")).toBe(false)
  })
})
