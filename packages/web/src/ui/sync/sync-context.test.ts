import { describe, expect, test } from "bun:test"
import { handleEvent } from "./sync-context"
import type { Event } from "@/lib/opencode/client"
import { create } from "zustand"
import type { DirectoryStore } from "./child-store"
import { INITIAL_STATE } from "./types"
import { __registerSessionSnapshotCallback, __triggerSessionSnapshotRestoration, __unregisterSessionSnapshotCallback } from "@/components/chat/state/bridge/__sessionSnapshotCallbackBridge"
import type { SessionSnapshotV1 } from "@openchamber/session-state"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeValidSnapshot(overrides: { revision?: number; directory?: string; sessionId?: string } = {}): SessionSnapshotV1 {
  return {
    version: 1,
    key: { directory: overrides.directory ?? "/tmp/project", sessionId: overrides.sessionId ?? "s1" },
    identity: { projectId: null, parentSessionId: null, exists: true, loaded: true },
    regions: { lifecycle: "ready", activity: "idle", interruptions: "clear", history: "idle", retry: "idle", error: "clear" },
    domain: {
      messageOrder: [],
      messagesById: {},
      partsByMessageId: {},
      partsById: {},
      streamingMessageId: null,
      streamingPartId: null,
      permissionsById: {},
      questionsById: {},
      retry: { retryMessage: null, retryCount: 0, retryCooldownUntil: null },
      error: { errorType: null, fatalError: null },
      history: { isLoadingOlder: false, hasMoreAbove: false, oldestLoadedMessageId: null, newestLoadedMessageId: null, historyLoadError: null },
    },
    meta: { revision: overrides.revision ?? 0, updatedAt: Date.now(), sourceEventId: null, hydratedAt: null },
  }
}

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

describe("openchamber:session-snapshot handling", () => {
  test("calls onSessionSnapshot callback with validated snapshot when event is received", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Send openchamber:session-snapshot event with a valid SessionSnapshotV1 structure
    const validSnapshot = {
      version: 1,
      key: { directory: "/tmp/project", sessionId: "s1" },
      identity: { projectId: null, parentSessionId: null, exists: true, loaded: true },
      regions: { lifecycle: "ready", activity: "idle", interruptions: "clear", history: "idle", retry: "idle", error: "clear" },
      domain: {
        messageOrder: [],
        messagesById: {},
        partsByMessageId: {},
        partsById: {},
        streamingMessageId: null,
        streamingPartId: null,
        permissionsById: {},
        questionsById: {},
        retry: { retryMessage: null, retryCount: 0, retryCooldownUntil: null },
        error: { errorType: null, fatalError: null },
        history: { isLoadingOlder: false, hasMoreAbove: false, oldestLoadedMessageId: null, newestLoadedMessageId: null, historyLoadError: null },
      },
      meta: { revision: 0, updatedAt: Date.now(), sourceEventId: null, hydratedAt: null },
    }

    handleEvent(
      "global",
      { type: "openchamber:session-snapshot", properties: validSnapshot } as unknown as Event,
      childStores,
      routingIndex,
      { onSessionSnapshot },
    )

    expect(receivedSnapshots).toHaveLength(1)
    expect(receivedSnapshots[0]).toEqual(validSnapshot)
  })

  test("does not call onSessionSnapshot for non-snapshot global events", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Send server.connected (refresh-type global event) - should not trigger snapshot callback
    handleEvent(
      "global",
      { type: "server.connected", properties: {} } as unknown as Event,
      childStores,
      routingIndex,
      { onSessionSnapshot },
    )

    expect(receivedSnapshots).toHaveLength(0)
  })

  test("calls onSessionSnapshot with directory-scoped event routed to correct directory", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    const validSnapshot = makeValidSnapshot()

    // Event arrives with /tmp/project directory
    handleEvent(
      "/tmp/project",
      { type: "openchamber:session-snapshot", properties: validSnapshot } as unknown as Event,
      childStores,
      routingIndex,
      { onSessionSnapshot },
    )

    expect(receivedSnapshots).toHaveLength(1)
    expect((receivedSnapshots[0] as { key: { directory: string } }).key.directory).toBe("/tmp/project")
  })

  test("does NOT call onSessionSnapshot for malformed snapshot (wrong version)", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Malformed snapshot: version 99 instead of 1
    const malformedSnapshot = {
      ...makeValidSnapshot(),
      version: 99,
    }

    // Must not throw
    let threw = false
    try {
      handleEvent(
        "global",
        { type: "openchamber:session-snapshot", properties: malformedSnapshot } as unknown as Event,
        childStores,
        routingIndex,
        { onSessionSnapshot },
      )
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(receivedSnapshots).toHaveLength(0)
  })

  test("does NOT call onSessionSnapshot for malformed snapshot (missing key.directory)", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Malformed: key.directory is null
    const malformedSnapshot = {
      ...makeValidSnapshot(),
      key: { directory: null as unknown as string, sessionId: "s1" },
    }

    let threw2 = false
    try {
      handleEvent(
        "global",
        { type: "openchamber:session-snapshot", properties: malformedSnapshot } as unknown as Event,
        childStores,
        routingIndex,
        { onSessionSnapshot },
      )
    } catch {
      threw2 = true
    }
    expect(threw2).toBe(false)
    expect(receivedSnapshots).toHaveLength(0)
  })

  test("does NOT call onSessionSnapshot for malformed snapshot (empty key.sessionId)", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Malformed: key.sessionId is empty string
    const malformedSnapshot = {
      ...makeValidSnapshot(),
      key: { directory: "/tmp/project", sessionId: "" },
    }

    let threw3 = false
    try {
      handleEvent(
        "global",
        { type: "openchamber:session-snapshot", properties: malformedSnapshot } as unknown as Event,
        childStores,
        routingIndex,
        { onSessionSnapshot },
      )
    } catch {
      threw3 = true
    }
    expect(threw3).toBe(false)
    expect(receivedSnapshots).toHaveLength(0)
  })

  test("directory-scoped malformed snapshot is silently rejected and does not throw", () => {
    const store = create<DirectoryStore>()((set) => ({ ...INITIAL_STATE, patch: (partial) => set(partial), replace: (next) => set(next) }))
    const childStores = { children: new Map([["/tmp/project", store]]), getChild: (dir: string) => childStores.children.get(dir), mark: () => {} } as unknown as import("./child-store").ChildStoreManager
    const routingIndex = { sessionDirectoryById: new Map(), messageSessionById: new Map(), sessionMessageIdsById: new Map() } as unknown as import("./sync-context").EventRoutingIndex

    const receivedSnapshots: unknown[] = []
    const onSessionSnapshot = (snapshot: unknown) => { receivedSnapshots.push(snapshot) }

    // Malformed: domain.messageOrder is not a string array
    const validBase = makeValidSnapshot()
    const malformedSnapshot: SessionSnapshotV1 = {
      ...validBase,
      domain: { ...validBase.domain, messageOrder: "not-an-array" as unknown as string[] },
    }

    // The directory-scoped path goes through sync-context's own try/catch
    let threw4 = false
    try {
      handleEvent(
        "/tmp/project",
        { type: "openchamber:session-snapshot", properties: malformedSnapshot } as unknown as Event,
        childStores,
        routingIndex,
        { onSessionSnapshot },
      )
    } catch {
      threw4 = true
    }
    expect(threw4).toBe(false)
    expect(receivedSnapshots).toHaveLength(0)
  })
})

describe("__sessionSnapshotCallback ownership safety", () => {
  // Note: These tests use the real module-level singleton, so run serially
  // and manage registration state explicitly.

  test("register/unregister does not crash", () => {
    let callCount = 0
    const generation = __registerSessionSnapshotCallback((dir, sid, snapshot) => {
      void dir
      void sid
      void snapshot
      callCount++
    })
    __unregisterSessionSnapshotCallback(generation)
    expect(callCount).toBe(0)
  })

  test("trigger calls registered callback", () => {
    let lastDir = ""
    let lastSid = ""
    const generation = __registerSessionSnapshotCallback((dir, sid) => { lastDir = dir; lastSid = sid })
    const snap = makeValidSnapshot()
    __triggerSessionSnapshotRestoration("/dir", "/sid", snap)
    expect(lastDir).toBe("/dir")
    expect(lastSid).toBe("/sid")
    __unregisterSessionSnapshotCallback(generation)
  })

  test("trigger does nothing when no callback registered", () => {
    const generation = __registerSessionSnapshotCallback(() => {})
    __unregisterSessionSnapshotCallback(generation)
    // The function should be safe to call with no callback registered
    let threw = false
    try {
      __triggerSessionSnapshotRestoration("/dir", "/sid", {} as never)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  test("stale unregister does not clear a newer callback", () => {
    const firstGeneration = __registerSessionSnapshotCallback(() => {})

    let called = false
    const secondGeneration = __registerSessionSnapshotCallback(() => { called = true })
    __unregisterSessionSnapshotCallback(firstGeneration)

    __triggerSessionSnapshotRestoration("/dir", "/sid", makeValidSnapshot())
    expect(called).toBe(true)

    __unregisterSessionSnapshotCallback(secondGeneration)
  })
})
