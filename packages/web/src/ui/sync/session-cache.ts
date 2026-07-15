import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  Todo,
} from "@/lib/opencode/client"
import type { FileDiff } from "./types"

type SessionCache = {
  session_status: Record<string, SessionStatus | undefined>
  session_diff: Record<string, FileDiff[] | undefined>
  todo: Record<string, Todo[] | undefined>
  message: Record<string, Message[] | undefined>
  part: Record<string, Part[] | undefined>
  permission: Record<string, PermissionRequest[] | undefined>
  question: Record<string, QuestionRequest[] | undefined>
  partDeltaBuffer?: Record<string, Record<string, Array<{ field: string; delta: string }>> | undefined>
}

export function dropSessionCaches(store: SessionCache, sessionIDs: Iterable<string>) {
  const stale = new Set(Array.from(sessionIDs).filter(Boolean))
  if (stale.size === 0) return

  // RC-1: Collect messageIDs belonging to stale sessions so we can drop their
  // orphan-delta buffers along with the part/message state.
  const staleMessageIDs = new Set<string>()
  for (const sessionID of stale) {
    const messages = store.message[sessionID]
    if (!messages) continue
    for (const message of messages) staleMessageIDs.add(message.id)
  }

  for (const key of Object.keys(store.part ?? {})) {
    const parts = store.part[key]
    if (!parts?.some((part) => stale.has((part as { sessionID?: string })?.sessionID ?? "")))
      continue
    delete store.part[key]
    staleMessageIDs.add(key)
  }

  if (store.partDeltaBuffer) {
    for (const messageID of staleMessageIDs) {
      delete store.partDeltaBuffer[messageID]
    }
  }

  for (const sessionID of stale) {
    delete store.message[sessionID]
    delete store.todo[sessionID]
    delete store.session_diff[sessionID]
    delete store.session_status[sessionID]
    delete store.permission[sessionID]
    delete store.question[sessionID]
  }
}

export function pickSessionCacheEvictions(input: {
  seen: Set<string>
  keep: string
  limit: number
  preserve?: Iterable<string>
}) {
  const stale: string[] = []
  const keep = new Set([input.keep, ...Array.from(input.preserve ?? [])])
  if (input.seen.has(input.keep)) input.seen.delete(input.keep)
  input.seen.add(input.keep)
  for (const id of input.seen) {
    if (input.seen.size - stale.length <= input.limit) break
    if (keep.has(id)) continue
    stale.push(id)
  }
  for (const id of stale) {
    input.seen.delete(id)
  }
  return stale
}
