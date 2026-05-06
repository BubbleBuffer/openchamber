import type {
  Event,
  Message,
  Part,
  PermissionRequest,
  Project,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
} from "@/lib/opencode/client"
import { Binary } from "./binary"
import type { FileDiff, GlobalState, State } from "./types"
import { dropSessionCaches } from "./session-cache"
import { stripSessionDiffSnapshots } from "./sanitize"
import { syncDebug } from "./debug"

const SKIP_PARTS = new Set(["patch", "step-start", "step-finish"])
const DELTA_OVERLAP_FIELDS = ["text", "output"] as const
const FINAL_TOOL_STATUSES = new Set(["completed", "error", "aborted", "failed", "timeout", "cancelled"])

type DedupeMetadata = {
  __dedupeNextDeltaFields?: string[]
}

function appendNonOverlappingDelta(existingValue: string | undefined, delta: string) {
  if (!existingValue || delta.length === 0) return (existingValue ?? "") + delta
  if (existingValue.endsWith(delta)) return existingValue

  const maxOverlap = Math.min(existingValue.length, delta.length)
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (existingValue.endsWith(delta.slice(0, overlap))) {
      return existingValue + delta.slice(overlap)
    }
  }

  return existingValue + delta
}

function getUpdatedDeltaFields(previous: Part, next: Part) {
  const dedupeFields: string[] = []
  for (const field of DELTA_OVERLAP_FIELDS) {
    const previousValue = (previous as Record<string, unknown>)[field]
    const nextValue = (next as Record<string, unknown>)[field]
    if (typeof previousValue !== "string" || typeof nextValue !== "string") continue
    if (previousValue.length === 0 || nextValue.length === 0) continue
    if (nextValue === previousValue || nextValue.startsWith(previousValue) || previousValue.startsWith(nextValue)) {
      dedupeFields.push(field)
    }
  }
  return dedupeFields
}

function getPartEndTime(part: Part): number | undefined {
  const stateEnd = (part as { state?: { time?: { end?: unknown } } }).state?.time?.end
  if (typeof stateEnd === "number") {
    return stateEnd
  }

  const timeEnd = (part as { time?: { end?: unknown } }).time?.end
  return typeof timeEnd === "number" ? timeEnd : undefined
}

function getToolStatus(part: Part): string | undefined {
  if (part.type !== "tool") {
    return undefined
  }

  const status = (part as { state?: { status?: unknown } }).state?.status
  return typeof status === "string" ? status : undefined
}

function shouldPreserveExistingPart(previous: Part, next: Part): boolean {
  if (previous.type !== "tool" || next.type !== "tool") {
    return false
  }

  const previousStatus = getToolStatus(previous)
  const nextStatus = getToolStatus(next)
  if (previousStatus && FINAL_TOOL_STATUSES.has(previousStatus) && (!nextStatus || !FINAL_TOOL_STATUSES.has(nextStatus))) {
    return true
  }

  const previousEnd = getPartEndTime(previous)
  const nextEnd = getPartEndTime(next)
  if (typeof previousEnd === "number" && typeof nextEnd !== "number") {
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Global events
// ---------------------------------------------------------------------------

export type GlobalEventResult = {
  type: "refresh"
} | {
  type: "project"
  project: Project
} | null

export function reduceGlobalEvent(event: Event): GlobalEventResult {
  if (event.type === "global.disposed" || event.type === "server.connected") {
    return { type: "refresh" }
  }
  if (event.type === "project.updated") {
    return { type: "project", project: event.properties as Project }
  }
  return null
}

export function applyGlobalProject(state: GlobalState, project: Project): GlobalState {
  const projects = [...state.projects]
  const result = Binary.search(projects, project.id, (s) => s.id)
  if (result.found) {
    projects[result.index] = { ...projects[result.index], ...project }
  } else {
    projects.splice(result.index, 0, project)
  }
  return { ...state, projects }
}

// ---------------------------------------------------------------------------
// Directory events — mutates draft in place for batching efficiency.
// Caller MUST pass a mutable copy of State (e.g. structuredClone or spread).
// ---------------------------------------------------------------------------

export function applyDirectoryEvent(
  draft: State,
  event: Event,
  callbacks?: {
    onRefresh?: (directory: string) => void
    onLoadLsp?: () => void
    onSetSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void
  },
): boolean {
  switch (event.type) {
    case "server.instance.disposed": {
      callbacks?.onRefresh?.("")
      return false
    }

    case "session.created": {
      const info = stripSessionDiffSnapshots((event.properties as { info: Session }).info)
      const sessions = draft.session
      const result = Binary.search(sessions, info.id, (s) => s.id)
      if (result.found) {
        sessions[result.index] = info
      } else {
        sessions.splice(result.index, 0, info)
        trimSessions(draft)
        if (!info.parentID) draft.sessionTotal += 1
      }
      return true
    }

    case "session.updated": {
      const info = stripSessionDiffSnapshots((event.properties as { info: Session }).info)
      const sessions = draft.session
      const result = Binary.search(sessions, info.id, (s) => s.id)

      if (info.time.archived) {
        if (result.found) sessions.splice(result.index, 1)
        cleanupSessionCaches(draft, info.id, callbacks?.onSetSessionTodo)
        if (!info.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
        return true
      }

      if (result.found) {
        // Skip replacement when displayed fields are identical — preserves array
        // reference and avoids re-rendering every session-list consumer for no-op
        // updates. Mirrors the unchanged check in case "message.updated" above.
        const existing = sessions[result.index]
        const existingShare = (existing as Session & { share?: { url?: string | null } | null }).share?.url ?? null
        const nextShare = (info as Session & { share?: { url?: string | null } | null }).share?.url ?? null
        const existingWorktree = (existing as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null
        const nextWorktree = (info as Session & { project?: { worktree?: string | null } | null }).project?.worktree ?? null
        const existingDirectory = (existing as Session & { directory?: string | null }).directory ?? null
        const nextDirectory = (info as Session & { directory?: string | null }).directory ?? null
        const unchanged = existing.title === info.title
          && existing.time?.updated === info.time?.updated
          && (existing.time?.archived ?? null) === (info.time?.archived ?? null)
          && (existing.parentID ?? null) === (info.parentID ?? null)
          && existingShare === nextShare
          && existingWorktree === nextWorktree
          && existingDirectory === nextDirectory
        if (unchanged) {
          return false
        }
        sessions[result.index] = info
      } else {
        sessions.splice(result.index, 0, info)
        trimSessions(draft)
      }
      return true
    }

    case "session.deleted": {
      const info = (event.properties as { info: Session }).info
      const sessions = draft.session
      const result = Binary.search(sessions, info.id, (s) => s.id)
      if (result.found) sessions.splice(result.index, 1)
      cleanupSessionCaches(draft, info.id, callbacks?.onSetSessionTodo)
      if (!info.parentID) draft.sessionTotal = Math.max(0, draft.sessionTotal - 1)
      return true
    }

    case "session.diff": {
      const props = event.properties as { sessionID: string; diff: FileDiff[] }
      draft.session_diff[props.sessionID] = props.diff
      return true
    }

    case "todo.updated": {
      const props = event.properties as { sessionID: string; todos: Todo[] }
      draft.todo[props.sessionID] = props.todos
      callbacks?.onSetSessionTodo?.(props.sessionID, props.todos)
      return true
    }

    case "session.status": {
      const props = event.properties as { sessionID: string; status: SessionStatus }
      draft.session_status[props.sessionID] = props.status
      return true
    }

    case "session.idle": {
      const props = event.properties as { sessionID: string }
      draft.session_status[props.sessionID] = { type: "idle" }
      return true
    }

    case "session.error": {
      const props = event.properties as { sessionID: string }
      draft.session_status[props.sessionID] = { type: "idle" }
      return true
    }

    case "message.updated": {
      const info = (event.properties as { info: Message }).info
      const messages = draft.message[info.sessionID]
      if (!messages) {
        draft.message[info.sessionID] = [info]
        return true
      }
      const result = Binary.search(messages, info.id, (m) => m.id)
      if (result.found) {
        // Skip message replacement if unchanged — preserves reference, avoids re-render
        const existing = messages[result.index]
        const unchanged = existing.role === info.role
          && (existing as { finish?: unknown }).finish === (info as { finish?: unknown }).finish
          && (existing.time as { completed?: number })?.completed === (info.time as { completed?: number })?.completed
        if (unchanged) {
          syncDebug.reducer.messageUpdatedUnchanged(info.sessionID, info.id, info.role, (info as { finish?: unknown }).finish, (info.time as { completed?: number })?.completed)
          return false
        }
        const next = [...messages]
        next[result.index] = info
        draft.message[info.sessionID] = next
      } else {
        const next = [...messages]
        next.splice(result.index, 0, info)
        draft.message[info.sessionID] = next
      }

      // Fallback: transition session_status to idle when an assistant message
      // completes. OpenCode may not always send a session.status (idle) event
      // after message.updated with finish='stop', leaving the UI stuck in busy.
      if (
        info.role === "assistant" &&
        info.finish === "stop" &&
        typeof info.time?.completed === "number" &&
        draft.session_status?.[info.sessionID]?.type === "busy"
      ) {
        draft.session_status[info.sessionID] = { type: "idle" }
      }

      return true
    }

    case "message.removed": {
      const props = event.properties as { sessionID: string; messageID: string }
      const messages = draft.message[props.sessionID]
      if (messages) {
        const next = [...messages]
        const result = Binary.search(next, props.messageID, (m) => m.id)
        if (result.found) {
          next.splice(result.index, 1)
          draft.message[props.sessionID] = next
        }
      }
      delete draft.part[props.messageID]
      delete draft.partDeltaBuffer[props.messageID]
      return true
    }

    case "message.part.updated": {
      const part = (event.properties as { part: Part }).part
      if (SKIP_PARTS.has(part.type)) {
        syncDebug.reducer.partSkipped((part as { messageID: string }).messageID, part.id, part.type)
        return false
      }
      const messageID = (part as { messageID: string }).messageID
      const parts = draft.part[messageID]
      if (!parts) {
        syncDebug.reducer.partUpdatedNoExistingParts(messageID, part.id, part.type)
        const drained = applyOrphanDeltasToPart(draft, messageID, part)
        draft.part[messageID] = [drained]
        return true
      }
      const next = [...parts]
      const result = Binary.search(next, part.id, (p) => p.id)
      let insertedIndex: number
      if (result.found) {
        const previous = next[result.index]
        if (shouldPreserveExistingPart(previous, part)) {
          return false
        }
        const dedupeFields = getUpdatedDeltaFields(previous, part)
        next[result.index] = dedupeFields.length > 0
          ? { ...part, __dedupeNextDeltaFields: dedupeFields } as unknown as Part
          : part
        insertedIndex = result.index
      } else {
        // Replace optimistic part (no sessionID) with server part of same type.
        // Gate: only scan if the first part lacks sessionID (optimistic parts are
        // always inserted first). Assistant messages never have optimistic parts,
        // so this check is effectively free during streaming.
        const hasOptimistic = next.length > 0 && !(next[0] as { sessionID?: string }).sessionID
        const optimisticIdx = hasOptimistic && (part.type === "text" || part.type === "file")
          ? next.findIndex((p) => p.type === part.type && !(p as { sessionID?: string }).sessionID)
          : -1
        if (optimisticIdx >= 0) {
          next.splice(optimisticIdx, 1)
        }
        const insertResult = Binary.search(next, part.id, (p) => p.id)
        next.splice(insertResult.index, 0, part)
        insertedIndex = insertResult.index
      }
      // RC-1: Replay any deltas buffered while this part was missing.
      const drained = applyOrphanDeltasToPart(draft, messageID, next[insertedIndex])
      if (drained !== next[insertedIndex]) next[insertedIndex] = drained
      draft.part[messageID] = next
      return true
    }

    case "message.part.removed": {
      const props = event.properties as { messageID: string; partID: string }
      const buffered = draft.partDeltaBuffer[props.messageID]
      if (buffered && buffered[props.partID]) {
        delete buffered[props.partID]
        if (Object.keys(buffered).length === 0) delete draft.partDeltaBuffer[props.messageID]
      }
      const parts = draft.part[props.messageID]
      if (!parts) return false
      const result = Binary.search(parts, props.partID, (p) => p.id)
      if (result.found) {
        const next = [...parts]
        next.splice(result.index, 1)
        if (next.length === 0) {
          delete draft.part[props.messageID]
        } else {
          draft.part[props.messageID] = next
        }
        return true
      }
      return false
    }

    case "message.part.delta": {
      const props = event.properties as {
        messageID: string
        partID: string
        field: string
        delta: string
      }
      const parts = draft.part[props.messageID]
      const result = parts ? Binary.search(parts, props.partID, (p) => p.id) : null
      if (!parts || !result || !result.found) {
        // RC-1: Buffer the orphan delta instead of silently dropping it. The
        // delta will be replayed when the matching part arrives via
        // `message.part.updated` (typically the very next event in the
        // stream, but can be delayed by network reordering).
        if (!parts) syncDebug.reducer.partDeltaNoParts(props.messageID, props.partID)
        else syncDebug.reducer.partDeltaNotFound(props.messageID, props.partID)
        bufferOrphanDelta(draft, props.messageID, props.partID, props.field, props.delta)
        return false
      }
      const existing = parts[result.index] as Record<string, unknown>
      const existingValue = existing[props.field] as string | undefined
      const dedupeFields = (existing as DedupeMetadata).__dedupeNextDeltaFields ?? []
      const shouldDedupe = dedupeFields.includes(props.field)
      // Create new Part object + new array so React detects the change
      const next = [...parts]
      next[result.index] = {
        ...existing,
        [props.field]: shouldDedupe ? appendNonOverlappingDelta(existingValue, props.delta) : (existingValue ?? "") + props.delta,
        __dedupeNextDeltaFields: dedupeFields.filter((field) => field !== props.field),
      } as unknown as Part
      draft.part[props.messageID] = next
      return true
    }

    case "vcs.branch.updated": {
      const props = event.properties as { branch: string }
      if (draft.vcs?.branch === props.branch) return false
      draft.vcs = { branch: props.branch }
      return true
    }

    case "permission.asked": {
      const permission = event.properties as PermissionRequest
      const permissions = draft.permission[permission.sessionID] ?? []
      draft.permission[permission.sessionID] = permissions
      const result = Binary.search(permissions, permission.id, (p) => p.id)
      if (result.found) {
        permissions[result.index] = permission
      } else {
        permissions.splice(result.index, 0, permission)
      }
      return true
    }

    case "permission.replied": {
      const props = event.properties as { sessionID: string; requestID: string }
      const permissions = draft.permission[props.sessionID]
      if (!permissions) return false
      const result = Binary.search(permissions, props.requestID, (p) => p.id)
      if (result.found) {
        permissions.splice(result.index, 1)
        return true
      }
      return false
    }

    case "question.asked": {
      const question = event.properties as QuestionRequest
      const questions = draft.question[question.sessionID] ?? []
      draft.question[question.sessionID] = questions
      const result = Binary.search(questions, question.id, (q) => q.id)
      if (result.found) {
        questions[result.index] = question
      } else {
        questions.splice(result.index, 0, question)
      }
      return true
    }

    case "question.replied":
    case "question.rejected": {
      const props = event.properties as { sessionID: string; requestID: string }
      const questions = draft.question[props.sessionID]
      if (!questions) return false
      const result = Binary.search(questions, props.requestID, (q) => q.id)
      if (result.found) {
        questions.splice(result.index, 1)
        return true
      }
      return false
    }

    case "lsp.updated": {
      callbacks?.onLoadLsp?.()
      return false
    }

    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimSessions(draft: State) {
  if (draft.session.length <= draft.limit) return
  // RC-6: Previously this silently shifted sessions off the front of the
  // array when length > limit, causing data loss when SSE delivered sessions
  // beyond the bootstrap-set limit. Now we auto-grow the limit instead —
  // sessions can only ever grow legitimately via session.created/updated
  // events, so dropping them is never the right behaviour.
  draft.limit = draft.session.length
}

// ---------------------------------------------------------------------------
// RC-1: Orphan delta buffering
//
// `message.part.delta` events can arrive before the matching part is inserted
// (typical race: delta packet beats the `message.part.updated` packet by a
// frame). Previously the reducer silently dropped these deltas, producing
// truncated assistant output. Now we buffer them per (messageID, partID) and
// drain on the next `message.part.updated` for that part.
//
// Buffers are bounded per part so a malformed stream can't OOM the client.
// ---------------------------------------------------------------------------

const ORPHAN_DELTA_MAX_PER_PART = 1024
const ORPHAN_DELTA_MAX_TOTAL_CHARS = 1_000_000

function bufferOrphanDelta(
  draft: State,
  messageID: string,
  partID: string,
  field: string,
  delta: string,
) {
  if (!delta) return
  const messageBucket = draft.partDeltaBuffer[messageID] ?? (draft.partDeltaBuffer[messageID] = {})
  const partBucket = messageBucket[partID] ?? (messageBucket[partID] = [])
  if (partBucket.length >= ORPHAN_DELTA_MAX_PER_PART) return
  // Crude total-size guard
  let total = 0
  for (const entry of partBucket) total += entry.delta.length
  if (total + delta.length > ORPHAN_DELTA_MAX_TOTAL_CHARS) return
  partBucket.push({ field, delta })
}

function applyOrphanDeltasToPart(draft: State, messageID: string, part: Part): Part {
  const messageBucket = draft.partDeltaBuffer[messageID]
  if (!messageBucket) return part
  const queued = messageBucket[part.id]
  if (!queued || queued.length === 0) return part

  const merged = { ...(part as Record<string, unknown>) } as Record<string, unknown>
  const dedupeFields = ((part as DedupeMetadata).__dedupeNextDeltaFields ?? []).slice()

  for (const { field, delta } of queued) {
    const existing = typeof merged[field] === "string" ? (merged[field] as string) : ""
    const shouldDedupe = dedupeFields.includes(field)
    merged[field] = shouldDedupe ? appendNonOverlappingDelta(existing, delta) : existing + delta
    // Each delta consumes its dedupe hint exactly once
    const idx = dedupeFields.indexOf(field)
    if (idx >= 0) dedupeFields.splice(idx, 1)
  }
  ; (merged as DedupeMetadata).__dedupeNextDeltaFields = dedupeFields

  delete messageBucket[part.id]
  if (Object.keys(messageBucket).length === 0) {
    delete draft.partDeltaBuffer[messageID]
  }

  return merged as unknown as Part
}

function cleanupSessionCaches(
  draft: State,
  sessionID: string,
  setSessionTodo?: (sessionID: string, todos: Todo[] | undefined) => void,
) {
  if (!sessionID) return
  setSessionTodo?.(sessionID, undefined)
  dropSessionCaches(draft, [sessionID])
}
