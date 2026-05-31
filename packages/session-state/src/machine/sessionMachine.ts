import { setup, assign, emit } from 'xstate'
import type { SessionMachineContext, CreateInitialSessionContextInput } from './context'
import { createInitialSessionContext } from './context'
import type { SessionDomainEvent } from './events'
import type { SessionMachineEffect } from './effects'
import {
  assertNormalizedReferences,
  createFatalInvariantFailure,
} from './invariants'

// XState v5 type inference narrows per-event in Transitions but can't
// reconcile the action union across all event types. The machine is
// correct at runtime; suppress the type-level noise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Actions = any

const MAX_RETRIES = 3

/**
 * Identity validation guard - throws if event directory/sessionId don't match context.
 * Applied before transitions that emit effects or change state.
 */
function assertIdentity(event: SessionDomainEvent, ctx: SessionMachineContext): void {
  if (event.directory !== ctx.directory) {
    throw new Error(
      `SessionEvent identity mismatch: event directory "${event.directory}" does not match ` +
        `context directory "${ctx.directory}"`,
    )
  }
  if (event.sessionId !== ctx.sessionId) {
    throw new Error(
      `SessionEvent identity mismatch: event sessionId "${event.sessionId}" does not match ` +
        `context sessionId "${ctx.sessionId}"`,
    )
  }
}

/**
 * Guard: identity check for PROMPT_SUBMITTED, ABORT_REQUESTED, RETRY_REQUESTED
 * Returns false (blocks transition) if identity doesn't match.
 */
function identityMatches(
  event: SessionDomainEvent,
  ctx: SessionMachineContext,
): boolean {
  return event.directory === ctx.directory && event.sessionId === ctx.sessionId
}

function patchMeta(
  ctx: SessionMachineContext,
  event: SessionDomainEvent,
): Pick<SessionMachineContext, 'revision' | 'updatedAt' | 'sourceEventId'> {
  return {
    revision: ctx.revision + 1,
    updatedAt: 'timestamp' in event ? event.timestamp : Date.now(),
    sourceEventId:
      'sourceEventId' in event ? (event.sourceEventId ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// Action factories
// ---------------------------------------------------------------------------

const handleSessionOpenedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'SESSION_OPENED') return {}
    assertIdentity(event, ctx)
    assertNormalizedReferences(ctx)
    return {
      ...patchMeta(ctx, event),
      projectId: event.projectId,
      parentSessionId: event.parentSessionId,
      loaded: true,
    }
  },
)

const handleSessionLoadedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'SESSION_LOADED') return {}
    assertIdentity(event, ctx)
    assertNormalizedReferences(ctx)
    return {
      ...patchMeta(ctx, event),
      loaded: true,
    }
  },
)

const handleSessionNotFoundAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'SESSION_NOT_FOUND') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      exists: false,
      loaded: true,
    }
  },
)

const handleMessageAddedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_ADDED') return {}
    assertIdentity(event, ctx)
    assertNormalizedReferences(ctx)
    const { message, initialParts } = event
    return {
      ...patchMeta(ctx, event),
      messageOrder: [...ctx.messageOrder, message.id],
      messagesById: { ...ctx.messagesById, [message.id]: message },
      partsByMessageId: {
        ...ctx.partsByMessageId,
        [message.id]: initialParts.map((p) => p.id),
      },
      partsById: {
        ...ctx.partsById,
        ...Object.fromEntries(initialParts.map((p) => [p.id, p])),
      },
    }
  },
)

const handleMessagePartDeltaAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_PART_DELTA') return {}
    assertIdentity(event, ctx)
    const { partId, messageId, field, delta } = event
    const existing = ctx.partsById[partId]
    if (
      !existing ||
      existing.messageId !== messageId ||
      field !== 'text' ||
      existing.type !== 'text'
    ) {
      return {}
    }
    return {
      ...patchMeta(ctx, event),
      partsById: {
        ...ctx.partsById,
        [partId]: { ...existing, text: existing.text + delta },
      },
    }
  },
)

const handleMessageUpdatedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_UPDATED') return {}
    assertIdentity(event, ctx)
    const existing = ctx.messagesById[event.messageId]
    if (!existing) return {}
    return {
      ...patchMeta(ctx, event),
      messagesById: {
        ...ctx.messagesById,
        [event.messageId]: { ...existing, ...event.updates },
      },
    }
  },
)

const handleStreamStartedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'STREAM_STARTED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      streamingMessageId: event.streamingMessageId,
      streamingPartId: event.streamingPartId,
    }
  },
)

const handleStreamCompletedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'STREAM_COMPLETED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      streamingMessageId: null,
      streamingPartId: null,
    }
  },
)

const handleStreamFailedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'STREAM_FAILED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      streamingMessageId: null,
      streamingPartId: null,
      errorType: 'stream_failed',
    }
  },
)

const handleAbortConfirmedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'ABORT_CONFIRMED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      streamingMessageId: null,
      streamingPartId: null,
    }
  },
)

const handlePermissionRequestedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'PERMISSION_REQUESTED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      permissionsById: {
        ...ctx.permissionsById,
        [event.permission.id]: event.permission,
      },
    }
  },
)

const handlePermissionResolvedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'PERMISSION_RESOLVED') return {}
    assertIdentity(event, ctx)
    const next = { ...ctx.permissionsById }
    delete next[event.permissionId]
    return { ...patchMeta(ctx, event), permissionsById: next }
  },
)

const handleQuestionRequestedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'QUESTION_REQUESTED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      questionsById: {
        ...ctx.questionsById,
        [event.question.id]: event.question,
      },
    }
  },
)

const handleQuestionResolvedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (
      event.type !== 'QUESTION_ANSWERED' &&
      event.type !== 'QUESTION_REJECTED'
    ) {
      return {}
    }
    assertIdentity(event, ctx)
    const next = { ...ctx.questionsById }
    delete next[event.questionId]
    return { ...patchMeta(ctx, event), questionsById: next }
  },
)

const handleLoadOlderRequestedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'LOAD_OLDER_REQUESTED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      isLoadingOlder: true,
      historyLoadError: null,
    }
  },
)

const handleLoadOlderCompletedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'LOAD_OLDER_COMPLETED') return {}
    assertIdentity(event, ctx)
    const { olderMessages, olderPartsByMessageId } = event
    const newMessageOrder = [
      ...olderMessages.map((m) => m.id).reverse(),
      ...ctx.messageOrder,
    ]
    const newMessagesById = { ...ctx.messagesById }
    for (const msg of olderMessages) {
      newMessagesById[msg.id] = msg
    }
    const newPartsByMessageId = { ...ctx.partsByMessageId }
    for (const [msgId, parts] of Object.entries(olderPartsByMessageId)) {
      newPartsByMessageId[msgId] = parts.map((p) => p.id)
    }
    const newPartsById = { ...ctx.partsById }
    for (const parts of Object.values(olderPartsByMessageId)) {
      for (const part of parts) {
        newPartsById[part.id] = part
      }
    }
    const oldestId =
      olderMessages.length > 0
        ? olderMessages[0].id
        : ctx.oldestLoadedMessageId
    return {
      ...patchMeta(ctx, event),
      messageOrder: newMessageOrder,
      messagesById: newMessagesById,
      partsByMessageId: newPartsByMessageId,
      partsById: newPartsById,
      isLoadingOlder: false,
      oldestLoadedMessageId: oldestId,
      hasMoreAbove: olderMessages.length > 0,
    }
  },
)

const handleLoadOlderFailedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'LOAD_OLDER_FAILED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      isLoadingOlder: false,
      historyLoadError: event.error,
    }
  },
)

const handleRetryStartedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'RETRY_STARTED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      retryCount: event.retryCount,
      retryMessage: event.retryMessage,
      retryCooldownUntil: event.retryCooldownUntil,
    }
  },
)

const handleRetryFailedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'RETRY_FAILED') return {}
    assertIdentity(event, ctx)
    if (ctx.retryCount >= MAX_RETRIES) {
      return {
        ...patchMeta(ctx, event),
        retryMessage: null,
        retryCount: 0,
        retryCooldownUntil: null,
        errorType: 'retry_exhausted',
      }
    }
    return patchMeta(ctx, event)
  },
)

const handleErrorDismissedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'ERROR_DISMISSED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      retryMessage: null,
      retryCount: 0,
      retryCooldownUntil: null,
      errorType: null,
      fatalError: null,
    }
  },
)

const handleFatalInvariantFailedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'FATAL_INVARIANT_FAILED') return {}
    assertIdentity(event, ctx)
    return {
      ...patchMeta(ctx, event),
      fatalError: createFatalInvariantFailure(
        event.invariantName,
        ctx,
        event.eventType,
      ),
      errorType: 'fatal_invariant',
    }
  },
)

// ---------------------------------------------------------------------------
// Part lifecycle handlers
// ---------------------------------------------------------------------------

const handleMessagePartStartedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_PART_STARTED') return {}
    assertIdentity(event, ctx)
    const { part } = event
    return {
      ...patchMeta(ctx, event),
      partsById: { ...ctx.partsById, [part.id]: part },
      partsByMessageId: {
        ...ctx.partsByMessageId,
        [part.messageId]: [...(ctx.partsByMessageId[part.messageId] ?? []), part.id],
      },
    }
  },
)

const handleMessagePartUpdatedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_PART_UPDATED') return {}
    assertIdentity(event, ctx)
    const existing = ctx.partsById[event.partId]
    if (!existing) return {}
    return {
      ...patchMeta(ctx, event),
      partsById: {
        ...ctx.partsById,
        [event.partId]: { ...existing, ...event.updates },
      },
    }
  },
)

const handleMessagePartFinishedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_PART_FINISHED') return {}
    assertIdentity(event, ctx)
    const existing = ctx.partsById[event.partId]
    if (!existing) return {}
    // Only metadata-type parts have metadata to patch
    if (existing.type !== 'metadata') return {}
    return {
      ...patchMeta(ctx, event),
      partsById: {
        ...ctx.partsById,
        [event.partId]: {
          ...existing,
          metadata: { ...existing.metadata, finishedAt: event.timestamp },
        },
      },
    }
  },
)

const handleMessagePartRemovedAction = assign(
  ({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
    if (event.type !== 'MESSAGE_PART_REMOVED') return {}
    assertIdentity(event, ctx)
    const { partId, messageId } = event
    const newPartsById = { ...ctx.partsById }
    delete newPartsById[partId]
    const existingMsgPartIds = ctx.partsByMessageId[messageId] ?? []
    return {
      ...patchMeta(ctx, event),
      partsById: newPartsById,
      partsByMessageId: {
        ...ctx.partsByMessageId,
        [messageId]: existingMsgPartIds.filter((id) => id !== partId),
      },
    }
  },
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitSendPrompt = emit(((args: any): any => {
  const ctx = args.context as SessionMachineContext
  const event = args.event as SessionDomainEvent
  if (event.type !== 'PROMPT_SUBMITTED') return
  if (event.directory !== ctx.directory || event.sessionId !== ctx.sessionId) return
  return {
    type: 'sendPrompt' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
    prompt: event.prompt,
    provider: event.provider,
    model: event.model,
    agent: event.agent,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitAbort = emit(((args: any): any => {
  const ctx = args.context as SessionMachineContext
  const event = args.event as SessionDomainEvent
  if (event.type !== 'ABORT_REQUESTED') return
  if (event.directory !== ctx.directory || event.sessionId !== ctx.sessionId) return
  return {
    type: 'abort' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitRetry = emit(((args: any): any => {
  const ctx = args.context as SessionMachineContext
  const event = args.event as SessionDomainEvent
  if (event.type !== 'RETRY_REQUESTED') return
  if (event.directory !== ctx.directory || event.sessionId !== ctx.sessionId) return
  return {
    type: 'retry' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
    retryCount: ctx.retryCount,
    retryMessage: ctx.retryMessage,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitLoadOlder = emit((args: any) => {
  const ctx = args.context as SessionMachineContext
  return {
    type: 'loadOlder' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitScheduleRetryCooldown = emit((args: any) => {
  const ctx = args.context as SessionMachineContext
  return {
    type: 'scheduleRetryCooldown' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
    delayMs: 5000,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitCancelRetryCooldown = emit((args: any) => {
  const ctx = args.context as SessionMachineContext
  return {
    type: 'cancelRetryCooldown' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitPublishSnapshot = emit((args: any) => {
  const ctx = args.context as SessionMachineContext
  return {
    type: 'publishSnapshot' as const,
    snapshot: ctx,
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitReportFatalInvariant = emit(((args: any): any => {
  const ctx = args.context as SessionMachineContext
  const event = args.event as SessionDomainEvent
  if (event.type !== 'FATAL_INVARIANT_FAILED') return
  return {
    type: 'reportFatalInvariant' as const,
    directory: ctx.directory,
    sessionId: ctx.sessionId,
    invariantName: event.invariantName,
    actorKey: event.actorKey,
    revision: event.revision,
    eventType: event.eventType,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any)

function canRetryGuard({
  context: ctx,
}: { context: SessionMachineContext }): boolean {
  return ctx.retryCount < MAX_RETRIES
}

/**
 * Guard: blocks PROMPT_SUBMITTED, ABORT_REQUESTED, RETRY_REQUESTED if identity doesn't match.
 * Prevents state change or effect emission on identity mismatch.
 */
function identityMatchesGuard({
  context: ctx,
  event,
}: {
  context: SessionMachineContext
  event: SessionDomainEvent
}): boolean {
  return identityMatches(event, ctx)
}

// Shared context-only event handlers (no state change, actions only).
// Part lifecycle handlers are defined inline with their respective transitions.
const contextOnlyEvents = {
  MESSAGE_ADDED: { actions: [handleMessageAddedAction, emitPublishSnapshot] as Actions },
  MESSAGE_UPDATED: { actions: [handleMessageUpdatedAction, emitPublishSnapshot] as Actions },
  MESSAGE_PART_STARTED: { actions: [handleMessagePartStartedAction, emitPublishSnapshot] as Actions },
  MESSAGE_PART_DELTA: { actions: [handleMessagePartDeltaAction, emitPublishSnapshot] as Actions },
  MESSAGE_PART_UPDATED: { actions: [handleMessagePartUpdatedAction, emitPublishSnapshot] as Actions },
  MESSAGE_PART_FINISHED: { actions: [handleMessagePartFinishedAction, emitPublishSnapshot] as Actions },
  MESSAGE_PART_REMOVED: { actions: [handleMessagePartRemovedAction, emitPublishSnapshot] as Actions },
}

export function createSessionMachine(input: CreateInitialSessionContextInput) {
  return setup({
    types: {
      context: {} as SessionMachineContext,
      events: {} as SessionDomainEvent,
      emitted: {} as SessionMachineEffect,
    },
    guards: {
      canRetry: canRetryGuard as typeof canRetryGuard,
      identityMatches: identityMatchesGuard as typeof identityMatchesGuard,
    },
  }).createMachine({
    id: 'session',
    type: 'parallel',
    context: createInitialSessionContext(input),
    states: {
      lifecycle: {
        initial: 'opening',
        states: {
          opening: {
            on: {
              SESSION_OPENED: {
                target: 'ready',
                actions: [handleSessionOpenedAction, emitPublishSnapshot] as Actions,
              },
              SESSION_LOADED: {
                target: 'ready',
                actions: [handleSessionLoadedAction, emitPublishSnapshot] as Actions,
              },
              SESSION_NOT_FOUND: {
                target: 'not_found',
                actions: [handleSessionNotFoundAction, emitPublishSnapshot] as Actions,
              },
              SESSION_LOAD_FAILED: {
                target: 'error',
                actions: [
                  assign(({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
                    if (event.type !== 'SESSION_LOAD_FAILED') return {}
                    return {
                      ...patchMeta(ctx, event),
                      errorType: 'session_load_failed' as const,
                    }
                  }) as Actions,
                  emitPublishSnapshot,
                ] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
          error: {
            on: {
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
          ready: {
            on: {
              SESSION_LOADED: {
                target: 'ready',
                actions: [handleSessionLoadedAction, emitPublishSnapshot] as Actions,
              },
              PROMPT_SUBMITTED: [
                {
                  guard: 'identityMatches',
                  target: 'streaming',
                  actions: [emitSendPrompt, emitPublishSnapshot] as Actions,
                },
                // State-only: identity mismatch does nothing
                {},
              ],
              STREAM_STARTED: {
                target: 'streaming',
                actions: [handleStreamStartedAction, emitPublishSnapshot] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
              ...contextOnlyEvents,
            },
          },
          streaming: {
            on: {
              STREAM_COMPLETED: {
                target: 'completed',
                actions: [handleStreamCompletedAction, emitPublishSnapshot] as Actions,
              },
              STREAM_FAILED: {
                target: 'ready',
                actions: [handleStreamFailedAction, emitPublishSnapshot] as Actions,
              },
              ABORT_REQUESTED: [
                {
                  guard: 'identityMatches',
                  target: 'streaming', // stays in streaming, activity handles abort
                  actions: [emitPublishSnapshot] as Actions,
                },
                {},
              ],
              STREAM_STARTED: {
                target: 'streaming',
                actions: [handleStreamStartedAction, emitPublishSnapshot] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
              ...contextOnlyEvents,
            },
          },
          completed: {
            on: {
              PROMPT_SUBMITTED: [
                {
                  guard: 'identityMatches',
                  target: 'streaming',
                  actions: [emitSendPrompt, emitPublishSnapshot] as Actions,
                },
                {},
              ],
              STREAM_STARTED: {
                target: 'streaming',
                actions: [handleStreamStartedAction, emitPublishSnapshot] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
              ...contextOnlyEvents,
            },
          },
          aborted: {
            on: {
              PROMPT_SUBMITTED: [
                {
                  guard: 'identityMatches',
                  target: 'streaming',
                  actions: [emitSendPrompt, emitPublishSnapshot] as Actions,
                },
                {},
              ],
              STREAM_STARTED: {
                target: 'streaming',
                actions: [handleStreamStartedAction, emitPublishSnapshot] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
              ...contextOnlyEvents,
            },
          },
          not_found: {
            on: {
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
          fatal: {
            on: {
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
        },
      },

      activity: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              PROMPT_SUBMITTED: [
                { guard: 'identityMatches', target: 'streaming' },
                {},
              ],
              STREAM_STARTED: { target: 'streaming' },
            },
          },
          streaming: {
            on: {
              STREAM_COMPLETED: { target: 'idle' },
              STREAM_FAILED: { target: 'idle' },
              ABORT_REQUESTED: [
                {
                  guard: 'identityMatches',
                  target: 'aborting',
                  actions: [emitAbort] as Actions,
                },
                {},
              ],
            },
          },
          aborting: {
            on: {
              ABORT_CONFIRMED: {
                target: 'idle',
                actions: [handleAbortConfirmedAction, emitPublishSnapshot] as Actions,
              },
              ABORT_FAILED: { target: 'streaming' },
              ...contextOnlyEvents,
            },
          },
        },
      },

      interruptions: {
        initial: 'clear',
        states: {
          clear: {
            on: {
              PERMISSION_REQUESTED: {
                target: 'has_permission',
                actions: [handlePermissionRequestedAction, emitPublishSnapshot] as Actions,
              },
              QUESTION_REQUESTED: {
                target: 'has_question',
                actions: [handleQuestionRequestedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          has_permission: {
            on: {
              PERMISSION_RESOLVED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.permissionsById).length <= 1 &&
                    Object.keys(ctx.questionsById).length === 0,
                  target: 'clear',
                  actions: [handlePermissionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_permission',
                  actions: [handlePermissionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
              QUESTION_REQUESTED: {
                target: 'has_both',
                actions: [handleQuestionRequestedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          has_question: {
            on: {
              QUESTION_ANSWERED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.questionsById).length <= 1 &&
                    Object.keys(ctx.permissionsById).length === 0,
                  target: 'clear',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_question',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
              QUESTION_REJECTED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.questionsById).length <= 1 &&
                    Object.keys(ctx.permissionsById).length === 0,
                  target: 'clear',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_question',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
              PERMISSION_REQUESTED: {
                target: 'has_both',
                actions: [handlePermissionRequestedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          has_both: {
            on: {
              PERMISSION_RESOLVED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.permissionsById).length <= 1,
                  target: 'has_question',
                  actions: [handlePermissionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_both',
                  actions: [handlePermissionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
              QUESTION_ANSWERED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.questionsById).length <= 1,
                  target: 'has_permission',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_both',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
              QUESTION_REJECTED: [
                {
                  guard: ({ context: ctx }) =>
                    Object.keys(ctx.questionsById).length <= 1,
                  target: 'has_permission',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
                {
                  target: 'has_both',
                  actions: [handleQuestionResolvedAction, emitPublishSnapshot] as Actions,
                },
              ],
            },
          },
        },
      },

      history: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              LOAD_OLDER_REQUESTED: [
                {
                  guard: 'identityMatches',
                  target: 'loading_older',
                  actions: [handleLoadOlderRequestedAction, emitLoadOlder] as Actions,
                },
                {},
              ],
            },
          },
          loading_older: {
            on: {
              LOAD_OLDER_COMPLETED: {
                target: 'idle',
                actions: [handleLoadOlderCompletedAction, emitPublishSnapshot] as Actions,
              },
              LOAD_OLDER_FAILED: {
                target: 'idle',
                actions: [handleLoadOlderFailedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
        },
      },

      retry: {
        initial: 'idle',
        states: {
          idle: {
            on: {
              RETRY_REQUESTED: [
                {
                  guard: 'identityMatches',
                  target: 'retrying',
                  actions: [emitRetry] as Actions,
                },
                {},
              ],
              ERROR_DISMISSED: {
                target: 'idle',
                actions: [handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          retrying: {
            on: {
              RETRY_STARTED: {
                target: 'retrying',
                actions: [handleRetryStartedAction, emitPublishSnapshot] as Actions,
              },
              RETRY_FAILED: [
                {
                  guard: ({ context: ctx }) => ctx.retryCount >= MAX_RETRIES,
                  target: 'exhausted',
                  actions: [
                    assign(({ context: ctx, event }: { context: SessionMachineContext; event: SessionDomainEvent }) => {
                      if (event.type !== 'RETRY_FAILED') return {}
                      return {
                        ...patchMeta(ctx, event),
                        retryMessage: null,
                        retryCount: 0,
                        retryCooldownUntil: null,
                        errorType: 'retry_exhausted',
                      }
                    }) as Actions,
                    emitPublishSnapshot,
                  ] as Actions,
                },
                {
                  target: 'cooldown',
                  actions: [handleRetryFailedAction, emitScheduleRetryCooldown] as Actions,
                },
              ],
              ERROR_DISMISSED: {
                target: 'idle',
                actions: [handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          exhausted: {
            on: {
              ERROR_DISMISSED: {
                target: 'idle',
                actions: [handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          cooldown: {
            on: {
              RETRY_REQUESTED: [
                {
                  guard: ({ context: ctx }) => ctx.errorType !== 'retry_exhausted',
                  target: 'retrying',
                  actions: [emitCancelRetryCooldown, emitRetry] as Actions,
                },
                {},
              ],
              RETRY_FAILED: {
                target: 'idle',
                actions: [handleRetryFailedAction, emitPublishSnapshot] as Actions,
              },
              ERROR_DISMISSED: {
                target: 'idle',
                actions: [emitCancelRetryCooldown, handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
        },
      },

      error: {
        initial: 'clear',
        states: {
          clear: {
            on: {
              STREAM_FAILED: { target: 'recoverable_error' },
              RETRY_FAILED: { target: 'recoverable_error' },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
              ERROR_DISMISSED: {
                target: 'clear',
                actions: [handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
            },
          },
          recoverable_error: {
            on: {
              ERROR_DISMISSED: {
                target: 'clear',
                actions: [handleErrorDismissedAction, emitPublishSnapshot] as Actions,
              },
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
          fatal: {
            on: {
              FATAL_INVARIANT_FAILED: {
                target: 'fatal',
                actions: [handleFatalInvariantFailedAction, emitReportFatalInvariant] as Actions,
              },
            },
          },
        },
      },
    },
  })
}
