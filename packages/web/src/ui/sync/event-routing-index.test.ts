import { describe, expect, test } from "bun:test"
import { create } from "zustand"
import type { Event, Message, Session } from "@/lib/opencode/client"
import type { ChildStoreManager, DirectoryStore } from "./child-store"
import { INITIAL_STATE } from "./types"
import {
  createEventRoutingIndex,
  ingestDirectoryStateIntoRoutingIndex,
  resolveDirectoryFromRoutingIndex,
  updateRoutingIndexFromEvent,
} from "./event-routing-index"

const makeStore = (state: Partial<DirectoryStore> = {}) =>
  create<DirectoryStore>()((set) => ({
    ...INITIAL_STATE,
    patch: (partial) => set(partial),
    replace: (next) => set(next),
    ...state,
  }))

const makeChildStores = (entries: Array<[string, ReturnType<typeof makeStore>]>) => {
  const children = new Map(entries)
  return {
    children,
    getChild: (directory: string) => children.get(directory),
  } as unknown as ChildStoreManager
}

const session = (id: string): Session => ({
  id,
  title: id,
  version: "1",
  time: { created: 1, updated: 1 },
} as Session)

const message = (id: string, sessionID: string): Message => ({
  id,
  sessionID,
  role: "user",
  time: { created: 1 },
} as Message)

describe("event routing index", () => {
  test("indexes a directory snapshot and removes stale session messages", () => {
    const index = createEventRoutingIndex()
    const first = {
      ...INITIAL_STATE,
      session: [session("session-1")],
      message: { "session-1": [message("message-old", "session-1")] },
    }

    ingestDirectoryStateIntoRoutingIndex(index, "/project", first)
    expect(index.sessionDirectoryById.get("session-1")).toBe("/project")
    expect(index.messageSessionById.get("message-old")).toBe("session-1")

    ingestDirectoryStateIntoRoutingIndex(index, "/project", {
      ...first,
      message: { "session-1": [message("message-new", "session-1")] },
    })
    expect(index.messageSessionById.has("message-old")).toBe(false)
    expect(index.messageSessionById.get("message-new")).toBe("session-1")
  })

  test("uses indexed ownership when an event reports the wrong directory", () => {
    const index = createEventRoutingIndex()
    const childStores = makeChildStores([
      ["/one", makeStore()],
      ["/two", makeStore()],
    ])
    ingestDirectoryStateIntoRoutingIndex(index, "/two", {
      ...INITIAL_STATE,
      session: [session("session-2")],
    })

    const event = {
      type: "session.status",
      properties: { sessionID: "session-2", status: { type: "busy" } },
    } as unknown as Event

    expect(resolveDirectoryFromRoutingIndex(index, "/one", event, childStores)).toBe("/two")
  })

  test("self-heals an index miss from live child-store state", () => {
    const index = createEventRoutingIndex()
    const childStores = makeChildStores([
      ["/project", makeStore({ session: [session("session-live")] })],
    ])
    const event = {
      type: "todo.updated",
      properties: { sessionID: "session-live", todos: [] },
    } as unknown as Event

    expect(resolveDirectoryFromRoutingIndex(index, "global", event, childStores)).toBe("/project")
    expect(index.sessionDirectoryById.get("session-live")).toBe("/project")
  })

  test("removes all message ownership when a session is deleted", () => {
    const index = createEventRoutingIndex()
    ingestDirectoryStateIntoRoutingIndex(index, "/project", {
      ...INITIAL_STATE,
      session: [session("session-3")],
      message: {
        "session-3": [
          message("message-1", "session-3"),
          message("message-2", "session-3"),
        ],
      },
    })

    updateRoutingIndexFromEvent(index, "/project", {
      type: "session.deleted",
      properties: { sessionID: "session-3" },
    } as unknown as Event)

    expect(index.sessionDirectoryById.has("session-3")).toBe(false)
    expect(index.sessionMessageIdsById.has("session-3")).toBe(false)
    expect(index.messageSessionById.size).toBe(0)
  })
})
