import { useCallback, useMemo } from "react"
import type { Message, Part } from "@/lib/opencode/client"
import { Binary } from "./binary"
import { retry } from "./retry"
import { SESSION_CACHE_LIMIT, type State } from "./types"
import { pickSessionCacheEvictions } from "./session-cache"
import {
  mergeOptimisticPage,
  mergeMessages,
  type OptimisticItem,
} from "./optimistic"
import { useDirectoryStore, useSyncSDK, useSyncDirectory, useChildStoreManager } from "./sync-context"
import { dropSessionCaches } from "./session-cache"
import { stripMessageDiffSnapshots } from "./sanitize"
import {
  shouldSkipSessionPrefetch,
  getSessionPrefetch,
  setSessionPrefetch,
  clearSessionPrefetch,
} from "./session-prefetch-cache"
import { runDedupedSessionLoad } from "./session-resource-manager"

const SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])
const MESSAGE_PAGE_SIZE = 5
const MAX_SEEN_DIRS = 30
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function sortParts(parts: Part[]) {
  return parts.filter((p) => !!p?.id).sort((a, b) => cmp(a.id, b.id))
}

// ---------------------------------------------------------------------------
// evictSessionCaches — extracted for testability
// ---------------------------------------------------------------------------

type ChildStoresForEvict = {
  getChild: (dir: string) => {
    getState: () => State
    setState: (partial: Partial<State>) => void
  } | undefined
}
type MetaMap = Map<string, { limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>
type OptimisticMap = Map<string, Map<string, OptimisticItem>>

// One resource registry serves every useSync consumer. Hook-local maps caused
// each sidebar/control/chat instance to miss the others' request metadata and
// reset the LRU whenever SessionMount remounted.
const sharedOptimistic: OptimisticMap = new Map()
const sharedSeen = new Map<string, Set<string>>()
const sharedMeta: MetaMap = new Map()

export function getSessionHistoryMeta(directory: string, sessionID: string) {
  return sharedMeta.get(`${directory}\n${sessionID}`) ?? {
    limit: MESSAGE_PAGE_SIZE,
    cursor: undefined,
    complete: false,
    loading: false,
  }
}

export function resolveMessageFetchLimit(
  metaLimit: number,
  residentMessageCount: number,
  mode: "replace" | "prepend" = "replace",
) {
  if (mode === "prepend") return metaLimit
  return Math.max(metaLimit, residentMessageCount)
}

/**
 * Evict cached session data for `sessionIDs` from directory `dir`'s store.
 * Exported for unit-testing; prefer `useSync().touch()` / `syncSession()` in product.
 */
export function evictSessionCaches(
  dir: string,
  sessionIDs: string[],
  childStores: ChildStoresForEvict,
  meta: MetaMap,
  optimistic: OptimisticMap,
  clearSessionPrefetchFn: (dir: string, sessionIDs: string[]) => void,
): void {
  if (sessionIDs.length === 0) return
  const dirStore = childStores.getChild(dir)
  if (!dirStore) return

  const current = dirStore.getState()
  const draft = {
    message: { ...current.message },
    part: { ...current.part },
    // Pass direct references: dropSessionCaches mutates these in-place (delete),
    // no need to clone — only message and part trigger Zustand subscriber updates.
    session_status: current.session_status,
    session_diff: current.session_diff,
    todo: current.todo,
    permission: current.permission,
    question: current.question,
  }
  dropSessionCaches(draft, sessionIDs)
  dirStore.setState(draft)

  // Clear meta + optimistic + prefetch cache for evicted sessions
  for (const id of sessionIDs) {
    optimistic.delete(`${dir}\n${id}`)
    meta.delete(`${dir}\n${id}`)
  }
  clearSessionPrefetchFn(dir, sessionIDs)
}

// ---------------------------------------------------------------------------
// useSync — message loading, pagination, optimistic updates
// ---------------------------------------------------------------------------

export function useSync() {
  const sdk = useSyncSDK()
  const directory = useSyncDirectory()
  const store = useDirectoryStore()
  const childStores = useChildStoreManager()

  const keyFor = useCallback(
    (sessionID: string) => `${directory}\n${sessionID}`,
    [directory],
  )

  const getMetaFor = useCallback(
    (sessionID: string) => {
      return getSessionHistoryMeta(directory, sessionID)
    },
    [directory],
  )

  const setMetaFor = useCallback(
    (sessionID: string, patch: Partial<{ limit: number; cursor: string | undefined; complete: boolean; loading: boolean }>) => {
      const key = keyFor(sessionID)
      const current = sharedMeta.get(key) ?? { limit: MESSAGE_PAGE_SIZE, cursor: undefined, complete: false, loading: false }
      sharedMeta.set(key, { ...current, ...patch })
    },
    [keyFor],
  )

  // Session cache eviction — two levels of LRU:
  // (1) across directories (max 30), (2) within a directory (SESSION_CACHE_LIMIT).

  // Evict all cached session data for given IDs from a directory's store
  const evict = useCallback(
    (dir: string, sessionIDs: string[]) => {
      evictSessionCaches(
        dir,
        sessionIDs,
        childStores,
        sharedMeta,
        sharedOptimistic,
        clearSessionPrefetch,
      )
    },
    [childStores],
  )

  // Get or create the seen-set for a directory. LRU reorder on access.
  // When seen directories exceed MAX_SEEN_DIRS, evict the oldest directory's caches.
  // LRU reorder on access. Evicts oldest directory when exceeding MAX_SEEN_DIRS.
  const seenFor = useCallback(() => {
    const existing = sharedSeen.get(directory)
    if (existing) {
      // LRU reorder: delete + re-insert moves to end (most recent)
      sharedSeen.delete(directory)
      sharedSeen.set(directory, existing)
      return existing
    }
    const created = new Set<string>()
    sharedSeen.set(directory, created)

    // Evict oldest directories if over limit
    while (sharedSeen.size > MAX_SEEN_DIRS) {
      const first = sharedSeen.keys().next().value
      if (!first) break
      const staleSessionIds = [...(sharedSeen.get(first) ?? [])]
      sharedSeen.delete(first)
      evict(first, staleSessionIds)
    }

    return created
  }, [directory, evict])

  // Touch a session — triggers both directory-level and session-level eviction
  const touch = useCallback(
    (sessionID: string) => {
      const s = seenFor()
      const stale = pickSessionCacheEvictions({
        seen: s,
        keep: sessionID,
        limit: SESSION_CACHE_LIMIT,
      })
      evict(directory, stale)
    },
    [directory, seenFor, evict],
  )

  // Optimistic operations
  const getOptimistic = useCallback(
    (sessionID: string): OptimisticItem[] => {
      const key = `${directory}\n${sessionID}`
      return [...(sharedOptimistic.get(key)?.values() ?? [])]
    },
    [directory],
  )

  const setOptimistic = useCallback(
    (sessionID: string, item: OptimisticItem) => {
      const key = `${directory}\n${sessionID}`
      const list = sharedOptimistic.get(key)
      const sorted: OptimisticItem = { message: item.message, parts: sortParts(item.parts) }
      if (list) {
        list.set(item.message.id, sorted)
      } else {
        sharedOptimistic.set(key, new Map([[item.message.id, sorted]]))
      }
    },
    [directory],
  )

  const clearOptimistic = useCallback(
    (sessionID: string, messageID?: string) => {
      const key = `${directory}\n${sessionID}`
      if (!messageID) {
        sharedOptimistic.delete(key)
        return
      }
      const list = sharedOptimistic.get(key)
      if (!list) return
      list.delete(messageID)
      if (list.size === 0) sharedOptimistic.delete(key)
    },
    [directory],
  )

  // Fetch messages from API
  const fetchMessages = useCallback(
    async (sessionID: string, limit: number, before?: string) => {
      const result = await retry(() =>
        sdk.session.messages({ sessionID, limit, before }),
      )
      const items = (result.data ?? []).filter((x: { info?: { id?: string } }) => !!x?.info?.id)
      const session = items
        .map((x: { info: Message }) => stripMessageDiffSnapshots(x.info))
        .sort((a: Message, b: Message) => cmp(a.id, b.id))
      const part = items.map((x: { info: { id: string }; parts: Part[] }) => ({
        id: x.info.id,
        part: sortParts(x.parts),
      }))
      const cursor = result.response?.headers?.get?.("x-next-cursor") ?? undefined
      return { session, part, cursor, complete: !cursor }
    },
    [sdk],
  )

  // Load messages for a session
  const loadMessages = useCallback(
    async (sessionID: string, options?: { before?: string; mode?: "replace" | "prepend" }) => {
      const m = getMetaFor(sessionID)
      if (m.loading) return
      setMetaFor(sessionID, { loading: true })

      try {
        // A forced replace happens after a turn finishes to reconcile SSE
        // deltas with the canonical REST snapshot. The history meta can still
        // reflect the smaller page fetched before new turn messages arrived,
        // so never request fewer messages than are already resident.
        const residentMessageCount = store.getState().message[sessionID]?.length ?? 0
        const limit = resolveMessageFetchLimit(m.limit, residentMessageCount, options?.mode)
        const page = await fetchMessages(sessionID, limit, options?.before)

        // Merge optimistic items
        const items = getOptimistic(sessionID)
        const merged = mergeOptimisticPage(page, items)
        for (const messageID of merged.confirmed) {
          clearOptimistic(sessionID, messageID)
        }

        const current = store.getState()
        const cached = options?.mode === "prepend" ? (current.message[sessionID] ?? []) : []
        const messages = options?.mode === "prepend"
          ? mergeMessages(cached, merged.session)
          : merged.session

        // Build part updates — preserve existing references on prepend to avoid flicker
        const isPrepend = options?.mode === "prepend"
        let partsChanged = false
        const partUpdate: Record<string, Part[]> = { ...current.part }
        for (const p of merged.part) {
          if (isPrepend && partUpdate[p.id]) continue // already loaded
          const filtered = p.part.filter((x: Part) => !SKIP_PARTS.has(x.type))
          if (filtered.length) {
            partUpdate[p.id] = filtered
            partsChanged = true
          }
        }

        const patch: Record<string, unknown> = {
          message: messages !== cached ? { ...current.message, [sessionID]: messages } : current.message,
        }
        if (!isPrepend || partsChanged) {
          patch.part = partUpdate
        }
        store.setState(patch)
        setMetaFor(sessionID, {
          limit: messages.length,
          cursor: merged.cursor,
          complete: merged.complete,
          loading: false,
        })
        setSessionPrefetch({
          directory,
          sessionID,
          limit: messages.length,
          cursor: merged.cursor,
          complete: merged.complete,
        })
      } catch {
        setMetaFor(sessionID, { loading: false })
      }
    },
    [store, fetchMessages, getMetaFor, setMetaFor, getOptimistic, clearOptimistic, directory],
  )

  // Sync a session (load if not cached)
  const syncSession = useCallback(
    async (sessionID: string, force?: boolean) => {
      touch(sessionID)
      const key = keyFor(sessionID)

      const current = store.getState()
      const m = getMetaFor(sessionID)
      const cached = current.message[sessionID] !== undefined && m.limit > 0
      const hasSession = Binary.search(current.session, sessionID, (s) => s.id).found
      if (cached && hasSession && !force) return

      // Skip if recently fetched (TTL)
      if (!force) {
        const prefetchInfo = getSessionPrefetch(directory, sessionID)
        if (shouldSkipSessionPrefetch({
          hasMessages: cached,
          info: prefetchInfo,
          pageSize: MESSAGE_PAGE_SIZE,
        })) return
      }

      return runDedupedSessionLoad(key, async () => {
        const sessionTask = (!hasSession || force)
          ? (async () => {
              try {
                const result = await retry(() => sdk.session.get({ sessionID }))
                if (result.data) {
                  const s = store.getState()
                  const sessions = [...s.session]
                  const idx = Binary.search(sessions, sessionID, (s) => s.id)
                  if (idx.found) {
                    sessions[idx.index] = result.data
                  } else {
                    sessions.splice(idx.index, 0, result.data)
                  }
                  store.setState({ session: sessions })
                }
              } catch (e) {
                console.error("[sync] failed to fetch session", sessionID, e)
              }
            })()
          : Promise.resolve()

        const messagesTask = (!cached || force)
          ? loadMessages(sessionID)
          : Promise.resolve()

        // Metadata and the first message page are independent. Starting them
        // together removes a full round-trip from cold session navigation.
        await Promise.all([sessionTask, messagesTask])
      })
    },
    [store, sdk, keyFor, touch, getMetaFor, loadMessages, directory],
  )

  // Load more (pagination)
  const loadMore = useCallback(
    async (sessionID: string) => {
      touch(sessionID)
      const m = getMetaFor(sessionID)
      if (m.loading || m.complete || !m.cursor) return
      await loadMessages(sessionID, { before: m.cursor, mode: "prepend" })
    },
    [touch, getMetaFor, loadMessages],
  )

  const hasMore = useCallback(
    (sessionID: string) => {
      const m = getMetaFor(sessionID)
      return !m.complete && !!m.cursor
    },
    [getMetaFor],
  )

  const isLoading = useCallback(
    (sessionID: string) => getMetaFor(sessionID).loading,
    [getMetaFor],
  )

  // Optimistic add (for prompt submission)
  const optimisticAdd = useCallback(
    (input: { sessionID: string; message: Message; parts: Part[] }) => {
      setOptimistic(input.sessionID, { message: input.message, parts: input.parts })
      const current = store.getState()
      const message = { ...current.message }
      const part = { ...current.part }

      // Insert message
      const messages = message[input.sessionID] ? [...message[input.sessionID]] : []
      const result = Binary.search(messages, input.message.id, (m) => m.id)
      if (!result.found) messages.splice(result.index, 0, input.message)
      message[input.sessionID] = messages

      // Insert parts
      part[input.message.id] = sortParts(input.parts)

      store.setState({ message, part })
    },
    [store, setOptimistic],
  )

  // Optimistic remove (for rollback on error)
  const optimisticRemove = useCallback(
    (input: { sessionID: string; messageID: string }) => {
      clearOptimistic(input.sessionID, input.messageID)
      const current = store.getState()
      const message = { ...current.message }
      const part = { ...current.part }

      const messages = message[input.sessionID]
      if (messages) {
        const next = [...messages]
        const result = Binary.search(next, input.messageID, (m) => m.id)
        if (result.found) {
          next.splice(result.index, 1)
          message[input.sessionID] = next
        }
      }
      delete part[input.messageID]

      store.setState({ message, part })
    },
    [store, clearOptimistic],
  )

  return useMemo(
    () => ({
      syncSession,
      loadMore,
      hasMore,
      isLoading,
      optimistic: {
        add: optimisticAdd,
        remove: optimisticRemove,
      },
    }),
    [syncSession, loadMore, hasMore, isLoading, optimisticAdd, optimisticRemove],
  )
}
