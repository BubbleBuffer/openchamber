// ---------------------------------------------------------------------------
// Session Domain Events
//
// All events carry directory, sessionId, timestamp, and optional
// sourceEventId so the bridge can route and annotate them consistently.
// ---------------------------------------------------------------------------

import type {
  SessionMessageRecord,
  SessionPartRecord,
  SessionPermissionRecord,
  SessionQuestionRecord,
} from './context.js'

// ---------------------------------------------------------------------------
// Identity / Load
// ---------------------------------------------------------------------------

export interface SessionDomainEventSessionOpened {
  type: 'SESSION_OPENED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  projectId: string | null
  parentSessionId: string | null
}

export interface SessionDomainEventSessionLoaded {
  type: 'SESSION_LOADED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventSessionNotFound {
  type: 'SESSION_NOT_FOUND'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventSessionLoadFailed {
  type: 'SESSION_LOAD_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  error: string
}

// ---------------------------------------------------------------------------
// Prompt / Stream
// ---------------------------------------------------------------------------

export interface SessionDomainEventPromptSubmitted {
  type: 'PROMPT_SUBMITTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  prompt: string
  provider: string | null
  model: string | null
  agent: string | null
}

export interface SessionDomainEventStreamStarted {
  type: 'STREAM_STARTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  streamingMessageId: string
  streamingPartId: string
}

export interface SessionDomainEventStreamCompleted {
  type: 'STREAM_COMPLETED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventStreamFailed {
  type: 'STREAM_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  error: string
}

// ---------------------------------------------------------------------------
// Message / Part Events
// ---------------------------------------------------------------------------

export interface SessionDomainEventMessageAdded {
  type: 'MESSAGE_ADDED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  message: SessionMessageRecord
  initialParts: SessionPartRecord[]
}

export interface SessionDomainEventMessageUpdated {
  type: 'MESSAGE_UPDATED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  messageId: string
  updates: Partial<Omit<SessionMessageRecord, 'id' | 'sessionId'>>
}

export interface SessionDomainEventMessagePartStarted {
  type: 'MESSAGE_PART_STARTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  part: SessionPartRecord
}

export interface SessionDomainEventMessagePartDelta {
  type: 'MESSAGE_PART_DELTA'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  messageId: string
  partId: string
  field: string
  delta: string
}

export interface SessionDomainEventMessagePartUpdated {
  type: 'MESSAGE_PART_UPDATED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  partId: string
  updates: Partial<SessionPartRecord>
}

export interface SessionDomainEventMessagePartFinished {
  type: 'MESSAGE_PART_FINISHED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  partId: string
}

export interface SessionDomainEventMessagePartRemoved {
  type: 'MESSAGE_PART_REMOVED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  messageId: string
  partId: string
}

// ---------------------------------------------------------------------------
// Abort
// ---------------------------------------------------------------------------

export interface SessionDomainEventAbortRequested {
  type: 'ABORT_REQUESTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventAbortConfirmed {
  type: 'ABORT_CONFIRMED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventAbortFailed {
  type: 'ABORT_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  error: string
}

// ---------------------------------------------------------------------------
// Permission / Question Interruptions
// ---------------------------------------------------------------------------

export interface SessionDomainEventPermissionRequested {
  type: 'PERMISSION_REQUESTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  permission: SessionPermissionRecord
}

export interface SessionDomainEventPermissionResolved {
  type: 'PERMISSION_RESOLVED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  permissionId: string
  approved: boolean
}

export interface SessionDomainEventQuestionRequested {
  type: 'QUESTION_REQUESTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  question: SessionQuestionRecord
}

export interface SessionDomainEventQuestionAnswered {
  type: 'QUESTION_ANSWERED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  questionId: string
  answer: string
}

export interface SessionDomainEventQuestionRejected {
  type: 'QUESTION_REJECTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  questionId: string
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export interface SessionDomainEventLoadOlderRequested {
  type: 'LOAD_OLDER_REQUESTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventLoadOlderCompleted {
  type: 'LOAD_OLDER_COMPLETED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  olderMessages: SessionMessageRecord[]
  olderPartsByMessageId: Record<string, SessionPartRecord[]>
}

export interface SessionDomainEventLoadOlderFailed {
  type: 'LOAD_OLDER_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  error: string
}

// ---------------------------------------------------------------------------
// Retry
// ---------------------------------------------------------------------------

export interface SessionDomainEventRetryRequested {
  type: 'RETRY_REQUESTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventRetryStarted {
  type: 'RETRY_STARTED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  retryCount: number
  retryMessage: string | null
  retryCooldownUntil: number | null
}

export interface SessionDomainEventRetryFailed {
  type: 'RETRY_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  error: string
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface SessionDomainEventErrorDismissed {
  type: 'ERROR_DISMISSED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
}

export interface SessionDomainEventFatalInvariantFailed {
  type: 'FATAL_INVARIANT_FAILED'
  directory: string
  sessionId: string
  timestamp: number
  sourceEventId?: string | null
  invariantName: string
  actorKey: string
  revision: number
  eventType: string
}

// ---------------------------------------------------------------------------
// Event union type
// ---------------------------------------------------------------------------

export type SessionDomainEvent =
  | SessionDomainEventSessionOpened
  | SessionDomainEventSessionLoaded
  | SessionDomainEventSessionNotFound
  | SessionDomainEventSessionLoadFailed
  | SessionDomainEventPromptSubmitted
  | SessionDomainEventStreamStarted
  | SessionDomainEventStreamCompleted
  | SessionDomainEventStreamFailed
  | SessionDomainEventMessageAdded
  | SessionDomainEventMessageUpdated
  | SessionDomainEventMessagePartStarted
  | SessionDomainEventMessagePartDelta
  | SessionDomainEventMessagePartUpdated
  | SessionDomainEventMessagePartFinished
  | SessionDomainEventMessagePartRemoved
  | SessionDomainEventAbortRequested
  | SessionDomainEventAbortConfirmed
  | SessionDomainEventAbortFailed
  | SessionDomainEventPermissionRequested
  | SessionDomainEventPermissionResolved
  | SessionDomainEventQuestionRequested
  | SessionDomainEventQuestionAnswered
  | SessionDomainEventQuestionRejected
  | SessionDomainEventLoadOlderRequested
  | SessionDomainEventLoadOlderCompleted
  | SessionDomainEventLoadOlderFailed
  | SessionDomainEventRetryRequested
  | SessionDomainEventRetryStarted
  | SessionDomainEventRetryFailed
  | SessionDomainEventErrorDismissed
  | SessionDomainEventFatalInvariantFailed
