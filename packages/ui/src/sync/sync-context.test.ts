import { describe, test } from "bun:test"
import { handleEvent } from "./sync-context"
import type { Event } from "@/lib/opencode/client"
import { create } from "zustand"
import type { DirectoryStore } from "./child-store"
import { INITIAL_STATE } from "./types"

describe("handleEvent error boundary", () => {
  test("does not throw when store.setState fails", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    let callCount = 0
    const originalSetState = store.setState.bind(store)
    store.setState = (...args: unknown[]) => { callCount++; if (callCount === 2) throw new Error("setState crash"); return (originalSetState as (...args: unknown[]) => void)(...args) }
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex
    handleEvent("/tmp/project", { type: "session.created", properties: { info: { id: "s1", title: "Test", time: { created: 1, updated: 1 }, version: "1" } } } as unknown as Event, childStores, routingIndex)
    // These should not throw because handleEvent now has a try/catch boundary
    handleEvent("/tmp/project", { type: "session.status", properties: { sessionID: "s1", info: { type: "busy" } } } as unknown as Event, childStores, routingIndex)
    handleEvent("/tmp/project", { type: "session.status", properties: { sessionID: "s1", info: { type: "idle" } } } as unknown as Event, childStores, routingIndex)
  })
})
