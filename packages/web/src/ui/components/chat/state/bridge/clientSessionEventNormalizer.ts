import type { SessionDomainEvent } from '@openchamber/session-state'
import type { SessionPermissionRecord, SessionQuestionRecord } from '@openchamber/session-state'
import type { PermissionRequest } from '@/types/permission'
import type { QuestionRequest } from '@/types/question'

// ---------------------------------------------------------------------------
// Normalization input types
// ---------------------------------------------------------------------------

export interface NormalizerInput {
  directory: string
  sessionId: string
  /** Session status from useSessionStatus */
  sessionStatus: { type: 'idle' | 'busy' | 'retry'; message?: string; confirmedAt?: number; attempt?: number; next?: number }
  /** Streaming message ID from useStreamingStore */
  streamingMessageId: string | null
  /** Permission requests from blocking requests */
  permissions: PermissionRequest[]
  /** Question requests from blocking requests */
  questions: QuestionRequest[]
  /** Whether messages have been loaded */
  loaded: boolean
  /** Session exists */
  exists: boolean
  /** Current timestamp */
  timestamp: number
}

// ---------------------------------------------------------------------------
// Event builders
// ---------------------------------------------------------------------------

function makeEvent<T extends SessionDomainEvent>(partial: T): T {
  return partial
}

// ---------------------------------------------------------------------------
// Normalize sync state to session events
// ---------------------------------------------------------------------------

/**
 * Normalizes the current sync hook data into a list of session domain events.
 *
 * The normalizer derives which events should be dispatched based on the current
 * sync state. It produces an ordered list of events that should be sent to the
 * machine to bring it into sync with the current state.
 *
 * Returns events in the order they should be dispatched.
 */
export function normalizeSyncStateToEvents(input: NormalizerInput): SessionDomainEvent[] {
  const events: SessionDomainEvent[] = []
  const { directory, sessionId, timestamp } = input

  // Session loaded — machine starts in opening state, transition to ready
  if (input.loaded && input.exists) {
    events.push(
      makeEvent({
        type: 'SESSION_LOADED',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
      }),
    )
  } else if (!input.exists) {
    events.push(
      makeEvent({
        type: 'SESSION_NOT_FOUND',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
      }),
    )
  }

  // Stream started
  if (input.streamingMessageId !== null) {
    events.push(
      makeEvent({
        type: 'STREAM_STARTED',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
        streamingMessageId: input.streamingMessageId,
        streamingPartId: '', // Part ID will be set when part delta arrives
      }),
    )
  }

  // Retry events
  if (input.sessionStatus.type === 'retry') {
    events.push(
      makeEvent({
        type: 'RETRY_STARTED',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
        retryCount: input.sessionStatus.attempt ?? 1,
        retryMessage: input.sessionStatus.message ?? null,
        retryCooldownUntil: input.sessionStatus.next ?? null,
      }),
    )
  }

  // Permission events — map PermissionRequest (UI type) to SessionPermissionRecord (machine type)
  for (const perm of input.permissions) {
    const record: SessionPermissionRecord = {
      id: perm.id,
      sessionId: perm.sessionID, // UI uses sessionID, machine uses sessionId
      permission: perm.permission,
      patterns: perm.patterns,
      metadata: perm.metadata ?? {},
    }
    events.push(
      makeEvent({
        type: 'PERMISSION_REQUESTED',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
        permission: record,
      }),
    )
  }

  // Question events — map QuestionRequest (UI type) to SessionQuestionRecord (machine type)
  for (const q of input.questions) {
    // Extract just the question strings from QuestionInfo[]
    const questionStrings: string[] = q.questions.map((info) => info.question)
    const record: SessionQuestionRecord = {
      id: q.id,
      sessionId: q.sessionID, // UI uses sessionID, machine uses sessionId
      questions: questionStrings,
      tool: q.tool ? `${q.tool.messageID}:${q.tool.callID}` : null, // Convert to string | null
    }
    events.push(
      makeEvent({
        type: 'QUESTION_REQUESTED',
        directory,
        sessionId,
        timestamp,
        sourceEventId: null,
        question: record,
      }),
    )
  }

  return events
}

// ---------------------------------------------------------------------------
// Resolve permission / question from blocking requests
// ---------------------------------------------------------------------------

export interface ResolvedPermission {
  permissionId: string
  approved: boolean
}

export interface ResolvedQuestion {
  questionId: string
  answer: string
}

/**
 * Creates a PERMISSION_RESOLVED event.
 */
export function normalizePermissionResolved(input: ResolvedPermission & { directory: string; sessionId: string; timestamp: number }): SessionDomainEvent {
  return makeEvent({
    type: 'PERMISSION_RESOLVED',
    directory: input.directory,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    sourceEventId: null,
    permissionId: input.permissionId,
    approved: input.approved,
  })
}

/**
 * Creates a QUESTION_ANSWERED event.
 */
export function normalizeQuestionAnswered(input: ResolvedQuestion & { directory: string; sessionId: string; timestamp: number }): SessionDomainEvent {
  return makeEvent({
    type: 'QUESTION_ANSWERED',
    directory: input.directory,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    sourceEventId: null,
    questionId: input.questionId,
    answer: input.answer,
  })
}

/**
 * Creates a QUESTION_REJECTED event.
 */
export function normalizeQuestionRejected(input: { questionId: string; directory: string; sessionId: string; timestamp: number }): SessionDomainEvent {
  return makeEvent({
    type: 'QUESTION_REJECTED',
    directory: input.directory,
    sessionId: input.sessionId,
    timestamp: input.timestamp,
    sourceEventId: null,
    questionId: input.questionId,
  })
}