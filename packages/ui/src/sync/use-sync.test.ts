import { describe, expect, test } from "bun:test"
import { evictSessionCaches } from "./use-sync"
import type { State } from "./types"
import type { Message, Part, SessionStatus, Todo, PermissionRequest, QuestionRequest } from "@/lib/opencode/client"
import type { FileDiff } from "./types"
import type { OptimisticItem } from "./optimistic"
import { SESSION_CACHE_LIMIT } from "./types"

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

const S1 = "s1"
const S2 = "s2"

function makeMessages(sessionID: string): Message[] {
  return [
    {
      id: sessionID + "-m1",
      sessionID,
      role: "user",
      time: { created: 1, updated: 1 },
      parts: [{ type: "text" as const, text: "hello" }],
    },
  ] as unknown as Message[]
}

function makeParts(sessionID: string): Part[] {
  return [
    {
      id: sessionID + "-m1",
      messageID: sessionID + "-m1",
      type: "text",
      text: "hello",
      sessionID, // dropSessionCaches matches on part.sessionID
    },
  ] as unknown as Part[]
}

// ---------------------------------------------------------------------------
// Mock child stores
// ---------------------------------------------------------------------------

function makeMockChildStores(seed: {
  message: Record<string, Message[]>
  part: Record<string, Part[]>
  session_status: Record<string, SessionStatus>
  session_diff: Record<string, FileDiff[]>
  todo: Record<string, Todo[]>
  permission: Record<string, PermissionRequest[]>
  question: Record<string, QuestionRequest[]>
}) {
  // Zustand-style: store is a single mutable object; setState mutates in place
  // and getState returns the same reference (unlike my previous mock which replaced it).
  const store: State = {
    ...seed,
    // Fill in remaining required fields with sensible defaults
    status: "complete",
    agent: [],
    command: [],
    project: "/test",
    projectMeta: undefined,
    icon: undefined,
    provider: { all: [], connected: [], default: {} },
    config: {},
    path: { state: "", config: "", worktree: "", directory: "", home: "" },
    session: [],
    sessionTotal: 0,
    mcp: {},
    lsp: [],
    vcs: undefined,
    limit: 50,
    partDeltaBuffer: {},
  } as State

  const childStores = {
    getChild: (_dir: string) => ({
      getState: () => store,
      setState: (partial: Partial<State>) => {
        // Zustand shallow merge: mutate the existing store object
        Object.assign(store, partial)
      },
    }),
  }

  return { childStores, getStore: () => store }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("evictSessionCaches", () => {
  test("only message and part get new references after eviction", () => {
    const { childStores, getStore } = makeMockChildStores({
      message: { [S1]: makeMessages(S1), [S2]: makeMessages(S2) },
      // dropSessionCaches deletes from part by messageID (message's id field)
      part: { [S1 + "-m1"]: makeParts(S1), [S2 + "-m1"]: makeParts(S2) },
      session_status: {
        [S1]: { type: "idle" } as SessionStatus,
        [S2]: { type: "busy" } as SessionStatus,
      },
      session_diff: { [S1]: [{ file: "a.txt" }], [S2]: [{ file: "b.txt" }] },
      todo: { [S1]: [{ content: "task", status: "pending", priority: "medium" }] as unknown as Todo[], [S2]: [] as Todo[] },
      permission: { [S1]: [] as PermissionRequest[], [S2]: [{ id: "p1", type: "file" as const, request: "read" as const }] as unknown as PermissionRequest[] },
      question: { [S1]: [{ id: "q1", text: "?", type: "clarification" as const }] as unknown as QuestionRequest[], [S2]: [] as QuestionRequest[] },
    })

    const meta = new Map<
      string,
      { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }
    >()
    const optimistic = new Map<string, Map<string, OptimisticItem>>()
    let prefetchCleared: string[] = []
    const clearSessionPrefetchFn = (_dir: string, ids: string[]) => {
      prefetchCleared = ids
    }

    const before = getStore()
    // Snapshot references before eviction (getStore returns the same mutable object)
    const beforeMessage = before.message
    const beforePart = before.part
    const beforeSessionStatus = before.session_status
    const beforeSessionDiff = before.session_diff
    const beforeTodo = before.todo
    const beforePermission = before.permission
    const beforeQuestion = before.question

    evictSessionCaches(
      "/test",
      [S1],
      childStores,
      meta,
      optimistic,
      clearSessionPrefetchFn,
    )

    const after = getStore()

    // message and part MUST get new references (the collections being mutated)
    expect(after.message).not.toBe(beforeMessage)
    expect(after.part).not.toBe(beforePart)

    // The other 5 collections should preserve their references
    // (dropSessionCaches mutates them in-place via delete, no need to clone)
    expect(after.session_status).toBe(beforeSessionStatus)
    expect(after.session_diff).toBe(beforeSessionDiff)
    expect(after.todo).toBe(beforeTodo)
    expect(after.permission).toBe(beforePermission)
    expect(after.question).toBe(beforeQuestion)

    // Data correctness: s1 removed, s2 retained
    expect(after.message[S1]).toBeUndefined()
    expect(after.message[S2]).toEqual(beforeMessage[S2])
    expect(after.part[S1 + "-m1"]).toBeUndefined()
    expect(after.part[S2 + "-m1"]).toEqual(beforePart[S2 + "-m1"])
    expect(after.session_status![S1]).toBeUndefined()
    expect(after.session_status![S2]).toEqual(beforeSessionStatus[S2])
    expect(after.session_diff![S1]).toBeUndefined()
    expect(after.session_diff![S2]).toEqual(beforeSessionDiff[S2])
    expect(after.todo![S1]).toBeUndefined()
    expect(after.todo![S2]).toEqual(beforeTodo[S2])
    expect(after.permission![S1]).toBeUndefined()
    expect(after.permission![S2]).toEqual(beforePermission[S2])
    expect(after.question![S1]).toBeUndefined()
    expect(after.question![S2]).toEqual(beforeQuestion[S2])

    // Prefetch was cleared
    expect(prefetchCleared).toEqual([S1])
  })

  test("evicting multiple sessions at once", () => {
    const S3 = "s3"
    const { childStores, getStore } = makeMockChildStores({
      message: { [S1]: makeMessages(S1), [S2]: makeMessages(S2), [S3]: makeMessages(S3) },
      part: { [S1 + "-m1"]: makeParts(S1), [S2 + "-m1"]: makeParts(S2), [S3 + "-m1"]: makeParts(S3) },
      session_status: {
        [S1]: { type: "idle" } as SessionStatus,
        [S2]: { type: "busy" } as SessionStatus,
        [S3]: { type: "idle" } as SessionStatus,
      },
      session_diff: { [S1]: [], [S2]: [], [S3]: [] },
      todo: { [S1]: [] as Todo[], [S2]: [] as Todo[], [S3]: [] as Todo[] },
      permission: { [S1]: [] as PermissionRequest[], [S2]: [] as PermissionRequest[], [S3]: [] as PermissionRequest[] },
      question: { [S1]: [] as QuestionRequest[], [S2]: [] as QuestionRequest[], [S3]: [] as QuestionRequest[] },
    })

    const meta = new Map<string, { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>()
    const optimistic = new Map<string, Map<string, OptimisticItem>>()
    const clearSessionPrefetchFn = () => {}

    const before = getStore()
    const beforeMessage = before.message
    const beforePart = before.part
    const beforeSessionStatus = before.session_status
    const beforeSessionDiff = before.session_diff
    const beforeTodo = before.todo
    const beforePermission = before.permission
    const beforeQuestion = before.question

    evictSessionCaches("/test", [S1, S3], childStores, meta, optimistic, clearSessionPrefetchFn)

    const after = getStore()

    expect(after.message).not.toBe(beforeMessage)
    expect(after.part).not.toBe(beforePart)
    expect(after.session_status).toBe(beforeSessionStatus)
    expect(after.session_diff).toBe(beforeSessionDiff)
    expect(after.todo).toBe(beforeTodo)
    expect(after.permission).toBe(beforePermission)
    expect(after.question).toBe(beforeQuestion)

    expect(after.message[S1]).toBeUndefined()
    expect(after.message[S3]).toBeUndefined()
    expect(after.message[S2]).toEqual(beforeMessage[S2])
  })

  test("empty sessionIDs is a no-op — no state change, no new references", () => {
    const { childStores, getStore } = makeMockChildStores({
      message: { [S1]: makeMessages(S1) },
      part: { [S1 + "-m1"]: makeParts(S1) },
      session_status: { [S1]: { type: "idle" } as SessionStatus },
      session_diff: { [S1]: [] },
      todo: { [S1]: [] as Todo[] },
      permission: { [S1]: [] as PermissionRequest[] },
      question: { [S1]: [] as QuestionRequest[] },
    })

    const meta = new Map<string, { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>()
    const optimistic = new Map<string, Map<string, OptimisticItem>>()
    const clearSessionPrefetchFn = () => {}

    const before = getStore()

    evictSessionCaches("/test", [], childStores, meta, optimistic, clearSessionPrefetchFn)

    const after = getStore()

    // Empty sessionIDs = early return, no setState called, store unchanged
    // All references preserved
    expect(after.message).toBe(before.message)
    expect(after.part).toBe(before.part)
    expect(after.session_status).toBe(before.session_status)
    expect(after.session_diff).toBe(before.session_diff)
    expect(after.todo).toBe(before.todo)
    expect(after.permission).toBe(before.permission)
    expect(after.question).toBe(before.question)
    // Data intact
    expect(after.message[S1]).toEqual(before.message[S1])
    expect(after.part[S1]).toEqual(before.part[S1])
  })

  test("eviction of session with no entry in some collections does not affect those collections", () => {
    // s1 only has message/part; s2 is in all collections
    const { childStores, getStore } = makeMockChildStores({
      message: { [S1]: makeMessages(S1), [S2]: makeMessages(S2) },
      part: { [S1 + "-m1"]: makeParts(S1), [S2 + "-m1"]: makeParts(S2) },
      // s1 has NO entries in the other 5 collections
      session_status: { [S2]: { type: "busy" } as SessionStatus },
      session_diff: { [S2]: [] },
      todo: { [S2]: [] as Todo[] },
      permission: { [S2]: [] as PermissionRequest[] },
      question: { [S2]: [] as QuestionRequest[] },
    })

    const meta = new Map<string, { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>()
    const optimistic = new Map<string, Map<string, OptimisticItem>>()
    const clearSessionPrefetchFn = () => {}

    const before = getStore()
    const beforeMessage = before.message
    const beforePart = before.part
    const beforeSessionStatus = before.session_status
    const beforeSessionDiff = before.session_diff
    const beforeTodo = before.todo
    const beforePermission = before.permission
    const beforeQuestion = before.question

    evictSessionCaches("/test", [S1], childStores, meta, optimistic, clearSessionPrefetchFn)

    const after = getStore()

    expect(after.message).not.toBe(beforeMessage)
    expect(after.part).not.toBe(beforePart)
    // Collections that didn't have s1 are untouched (same reference)
    expect(after.session_status).toBe(beforeSessionStatus)
    expect(after.session_diff).toBe(beforeSessionDiff)
    expect(after.todo).toBe(beforeTodo)
    expect(after.permission).toBe(beforePermission)
    expect(after.question).toBe(beforeQuestion)
    // s1 removed from message/part
    expect(after.message[S1]).toBeUndefined()
    expect(after.message[S2]).toEqual(beforeMessage[S2])
    // s2 still intact in session_status etc.
    expect(after.session_status![S2]).toEqual(beforeSessionStatus[S2])
  })

  test("LRU eviction path: evicting oldest session when cache is full", () => {
    // Simulate the scenario where SESSION_CACHE_LIMIT is exceeded and the
    // oldest session is evicted via the same path that evictSessionCaches uses.
    const sessions = Array.from({ length: SESSION_CACHE_LIMIT + 2 }, (_, i) => "s" + i)
    const oldest = sessions[0]
    const survivors = sessions.slice(1)

    const seed = {
      message: Object.fromEntries(sessions.map((id) => [id, makeMessages(id)])),
      part: Object.fromEntries(sessions.map((id) => [id + "-m1", makeParts(id)])),
      session_status: Object.fromEntries(sessions.map((id) => [id, { type: "idle" }])) as Record<string, SessionStatus>,
      session_diff: Object.fromEntries(sessions.map((id) => [id, [] as FileDiff[]])),
      todo: Object.fromEntries(sessions.map((id) => [id, [] as Todo[]])),
      permission: Object.fromEntries(sessions.map((id) => [id, [] as PermissionRequest[]])),
      question: Object.fromEntries(sessions.map((id) => [id, [] as QuestionRequest[]])),
    }

    const { childStores, getStore } = makeMockChildStores(seed)
    const meta = new Map<string, { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>()
    const optimistic = new Map<string, Map<string, OptimisticItem>>()
    const clearSessionPrefetchFn = () => {}

    const before = getStore()
    const beforeMessage = before.message
    const beforePart = before.part
    const beforeSessionStatus = before.session_status
    const beforeSessionDiff = before.session_diff
    const beforeTodo = before.todo
    const beforePermission = before.permission
    const beforeQuestion = before.question

    evictSessionCaches("/test", [oldest], childStores, meta, optimistic, clearSessionPrefetchFn)

    const after = getStore()

    expect(after.message).not.toBe(beforeMessage)
    expect(after.part).not.toBe(beforePart)
    expect(after.session_status).toBe(beforeSessionStatus)
    expect(after.session_diff).toBe(beforeSessionDiff)
    expect(after.todo).toBe(beforeTodo)
    expect(after.permission).toBe(beforePermission)
    expect(after.question).toBe(beforeQuestion)

    // Oldest removed, all survivors intact
    expect(after.message[oldest]).toBeUndefined()
    for (const id of survivors) {
      expect(after.message[id]).toEqual(beforeMessage[id])
    }
  })
})
