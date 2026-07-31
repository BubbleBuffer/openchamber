import { describe, expect, test } from "bun:test"
import { useSessionUIStore } from "./session-ui-store"

describe("cleanupSession", () => {
  test("removes sessionAbortFlags for a session", () => {
    const store = useSessionUIStore.getState()
    store.sessionAbortFlags.set("s1", { timestamp: Date.now(), acknowledged: false })
    store.cleanupSession("s1")
    const after = useSessionUIStore.getState()
    expect(after.sessionAbortFlags.has("s1")).toBe(false)
  })
})
