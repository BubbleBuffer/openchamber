import type { SessionSnapshotV1, SessionPermissionRecord, SessionQuestionRecord } from '@openchamber/session-state'
import { SESSION_SNAPSHOT_VERSION } from '@openchamber/session-state'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface SyncStateInput {
  directory: string
  sessionId: string
  /** Whether the session exists in the directory */
  exists: boolean
  /** Whether the session's messages have been loaded */
  loaded: boolean
  /** Session status type */
  sessionStatusType: 'idle' | 'busy' | 'retry'
  /** Session status retry message */
  retryMessage: string | null
  /** Session status retry count */
  retryCount: number
  /** Session status retry cooldown */
  retryCooldownUntil: number | null
  /** Permission requests for this session (UI format) */
  permissions: Array<{ id: string; sessionID: string; permission: string; patterns: string[]; metadata: Record<string, unknown>; always: string[] }>
  /** Question requests for this session (UI format) */
  questions: Array<{ id: string; sessionID: string; questions: Array<{ question: string; header: string; options: Array<{ label: string; description: string }>; multiple?: boolean }>; tool?: { messageID: string; callID: string } }>
  /** History loading state */
  isLoadingOlder: boolean
  /** Whether there are older messages available */
  hasMoreAbove: boolean
  /** Oldest loaded message ID */
  oldestLoadedMessageId: string | null
  /** Newest loaded message ID */
  newestLoadedMessageId: string | null
  /** History load error */
  historyLoadError: string | null
  /** Streaming message ID */
  streamingMessageId: string | null
  /** Streaming part ID */
  streamingPartId: string | null
  /** Message order array */
  messageOrder: string[]
  /** Messages by ID */
  messagesById: Record<string, { id: string; role: string; sessionId: string; createdAt: number; parentId: string | null; model: string | null; agent: string | null; provider: string | null; cost: number | null; tokens: number | null; error: string | null }>
  /** Parts by message ID */
  partsByMessageId: Record<string, string[]>
  /** Parts by ID (exact SessionPartRecord types) */
  partsById: Record<string, { id: string; messageId: string; type: 'text'; text: string } | { id: string; messageId: string; type: 'tool'; toolName: string; toolCallId: string; toolState: string | null } | { id: string; messageId: string; type: 'error'; error: string } | { id: string; messageId: string; type: 'metadata'; metadata: Record<string, unknown> }>
  /** History metadata */
  historyMeta: { limit: number; complete: boolean; loading: boolean }
  /** Error type */
  errorType: string | null
  /** Fatal error */
  fatalError: { invariantName: string; actorKey: string; revision: number; eventType: string } | null
  /** Timestamp */
  timestamp: number
}

// ---------------------------------------------------------------------------
// Build a SessionSnapshotV1 from current sync state
// ---------------------------------------------------------------------------

/**
 * Creates a SessionSnapshotV1 from the current sync state.
 * This snapshot is suitable for use with `restoreSessionMachineSnapshot(machine, snapshot)`.
 *
 * The function maps sync store fields into the normalized SessionSnapshotV1 format,
 * deriving region state from activity indicators (streaming, permissions, questions, retry).
 */
export function createSessionSnapshotFromSyncState(input: SyncStateInput): SessionSnapshotV1 {
  const regions = deriveRegions(input)

  // Convert UI permission format to machine format
  const permissionsById: Record<string, SessionPermissionRecord> = {}
  for (const perm of input.permissions) {
    permissionsById[perm.id] = {
      id: perm.id,
      sessionId: perm.sessionID, // UI uses sessionID
      permission: perm.permission,
      patterns: perm.patterns,
      metadata: perm.metadata ?? {},
    }
  }

  // Convert UI question format to machine format
  const questionsById: Record<string, SessionQuestionRecord> = {}
  for (const q of input.questions) {
    questionsById[q.id] = {
      id: q.id,
      sessionId: q.sessionID, // UI uses sessionID
      questions: q.questions.map((info) => info.question), // Extract question strings
      tool: q.tool ? `${q.tool.messageID}:${q.tool.callID}` : null, // Convert to string
    }
  }

  return {
    version: SESSION_SNAPSHOT_VERSION,
    key: {
      directory: input.directory,
      sessionId: input.sessionId,
    },
    identity: {
      projectId: null,
      parentSessionId: null,
      exists: input.exists,
      loaded: input.loaded,
    },
    regions,
    domain: {
      messageOrder: input.messageOrder,
      messagesById: input.messagesById,
      partsByMessageId: input.partsByMessageId,
      partsById: input.partsById as Record<string, import('@openchamber/session-state').SessionPartRecord>,
      streamingMessageId: input.streamingMessageId,
      streamingPartId: input.streamingPartId,
      permissionsById,
      questionsById,
      retry: {
        retryMessage: input.retryMessage,
        retryCount: input.retryCount,
        retryCooldownUntil: input.retryCooldownUntil,
      },
      error: {
        errorType: input.errorType,
        fatalError: input.fatalError,
      },
      history: {
        isLoadingOlder: input.isLoadingOlder,
        hasMoreAbove: input.hasMoreAbove,
        oldestLoadedMessageId: input.oldestLoadedMessageId,
        newestLoadedMessageId: input.newestLoadedMessageId,
        historyLoadError: input.historyLoadError,
      },
    },
    meta: {
      revision: 0,
      updatedAt: input.timestamp,
      sourceEventId: null,
      hydratedAt: null,
    },
  }
}

// ---------------------------------------------------------------------------
// Region type
// ---------------------------------------------------------------------------

type SessionRegions = { lifecycle: string; activity: string; interruptions: string; history: string; retry: string; error: string }

// ---------------------------------------------------------------------------
// Derive region states from sync data
// ---------------------------------------------------------------------------

function deriveRegions(input: SyncStateInput): SessionRegions {
  const { sessionStatusType, permissions, questions, streamingMessageId, retryMessage, errorType, fatalError, isLoadingOlder } = input

  // Lifecycle region - derive from session status and loaded state
  let lifecycle = 'opening'
  if (input.loaded) {
    if (sessionStatusType === 'busy') {
      lifecycle = streamingMessageId ? 'streaming' : 'ready'
    } else if (sessionStatusType === 'retry') {
      lifecycle = retryMessage ? 'ready' : 'ready'
    } else {
      lifecycle = 'ready'
    }
  }

  // Activity region
  let activity = 'idle'
  if (streamingMessageId) {
    activity = 'streaming'
  }

  // Interruptions region
  let interruptions = 'clear'
  const hasPermissions = permissions.length > 0
  const hasQuestions = questions.length > 0
  if (hasPermissions && hasQuestions) {
    interruptions = 'has_both'
  } else if (hasPermissions) {
    interruptions = 'has_permission'
  } else if (hasQuestions) {
    interruptions = 'has_question'
  }

  // History region
  const history = isLoadingOlder ? 'loading_older' : 'idle'

  // Retry region
  let retry = 'idle'
  if (sessionStatusType === 'retry') {
    if (input.retryCooldownUntil !== null) {
      retry = 'cooldown'
    } else {
      retry = 'retrying'
    }
  }

  // Error region
  let error = 'clear'
  if (fatalError) {
    error = 'fatal'
  } else if (errorType === 'stream_failed' || errorType === 'retry_exhausted') {
    error = 'recoverable_error'
  }

  return {
    lifecycle,
    activity,
    interruptions,
    history,
    retry,
    error,
  }
}

// ---------------------------------------------------------------------------
// Compute parent session ID from sessions list
// ---------------------------------------------------------------------------

export function getParentSessionId(
  sessions: Array<{ id: string; parentID?: string | null }>,
  sessionId: string,
): string | null {
  const session = sessions.find((s) => s.id === sessionId)
  return session?.parentID ?? null
}