// ---------------------------------------------------------------------------
// Domain Record Types
// ---------------------------------------------------------------------------

export interface SessionMessageRecord {
  id: string
  role: string
  sessionId: string
  createdAt: number
  parentId: string | null
  model: string | null
  agent: string | null
  provider: string | null
  cost: number | null
  tokens: number | null
  error: string | null
}

export type SessionPartRecord =
  | SessionPartRecordText
  | SessionPartRecordTool
  | SessionPartRecordError
  | SessionPartRecordMetadata

export interface SessionPartRecordText {
  id: string
  messageId: string
  type: 'text'
  text: string
}

export interface SessionPartRecordTool {
  id: string
  messageId: string
  type: 'tool'
  toolName: string
  toolCallId: string
  toolState: string | null
}

export interface SessionPartRecordError {
  id: string
  messageId: string
  type: 'error'
  error: string
}

export interface SessionPartRecordMetadata {
  id: string
  messageId: string
  type: 'metadata'
  metadata: Record<string, unknown>
}

export interface SessionPermissionRecord {
  id: string
  sessionId: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
}

export interface SessionQuestionRecord {
  id: string
  sessionId: string
  questions: string[]
  tool: string | null
}

// ---------------------------------------------------------------------------
// Session Machine Context
// ---------------------------------------------------------------------------

export interface SessionHistoryState {
  isLoadingOlder: boolean
  hasMoreAbove: boolean
  oldestLoadedMessageId: string | null
  newestLoadedMessageId: string | null
  historyLoadError: string | null
}

export interface SessionRetryState {
  retryMessage: string | null
  retryCount: number
  retryCooldownUntil: number | null
}

export interface SessionErrorState {
  errorType: string | null
  fatalError: SessionFatalError | null
}

export interface SessionFatalError {
  invariantName: string
  actorKey: string
  revision: number
  eventType: string
}

export interface SessionMachineContext {
  directory: string
  sessionId: string
  projectId: string | null
  parentSessionId: string | null
  exists: boolean
  loaded: boolean
  messageOrder: string[]
  messagesById: Record<string, SessionMessageRecord>
  partsByMessageId: Record<string, string[]>
  partsById: Record<string, SessionPartRecord>
  streamingMessageId: string | null
  streamingPartId: string | null
  permissionsById: Record<string, SessionPermissionRecord>
  questionsById: Record<string, SessionQuestionRecord>
  retryMessage: string | null
  retryCount: number
  retryCooldownUntil: number | null
  errorType: string | null
  fatalError: SessionFatalError | null
  isLoadingOlder: boolean
  hasMoreAbove: boolean
  oldestLoadedMessageId: string | null
  newestLoadedMessageId: string | null
  historyLoadError: string | null
  revision: number
  updatedAt: number
  sourceEventId: string | null
}

// ---------------------------------------------------------------------------
// Initial Context Factory
// ---------------------------------------------------------------------------

export interface CreateInitialSessionContextInput {
  directory: string
  sessionId: string
  timestamp: number
}

/**
 * Returns an initialised session context with `loaded: false` and empty
 * normalised maps. Used when spawning a fresh actor or when a session has
 * no persisted state tohydrate.
 */
export function createInitialSessionContext(
  input: CreateInitialSessionContextInput,
): SessionMachineContext {
  const { directory, sessionId, timestamp } = input
  return {
    directory,
    sessionId,
    projectId: null,
    parentSessionId: null,
    exists: true,
    loaded: false,
    messageOrder: [],
    messagesById: {},
    partsByMessageId: {},
    partsById: {},
    streamingMessageId: null,
    streamingPartId: null,
    permissionsById: {},
    questionsById: {},
    retryMessage: null,
    retryCount: 0,
    retryCooldownUntil: null,
    errorType: null,
    fatalError: null,
    isLoadingOlder: false,
    hasMoreAbove: false,
    oldestLoadedMessageId: null,
    newestLoadedMessageId: null,
    historyLoadError: null,
    revision: 0,
    updatedAt: timestamp,
    sourceEventId: null,
  }
}
