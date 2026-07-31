/**
 * Narrow machine selectors for message/streaming/retry domain.
 *
 * These selectors are the single authoritative source for migrated fields.
 * No selector returns the entire machine snapshot.
 */

import type { SessionMachineContext, SessionMessageRecord, SessionPartRecord } from '@openchamber/session-state'
import { useSelector } from '@xstate/react'
import { useSessionActor } from './useSessionActor'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = any

// Selector function type for extracting context from actor snapshot
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContextSelector<T> = (snapshot: any) => T

function useActorSelector<T>(directory: string, sessionId: string, selector: ContextSelector<T>): T {
  const actor = useSessionActor(directory, sessionId)
  return useSelector(actor as AnyActor, selector as ContextSelector<T>)
}

// ---------------------------------------------------------------------------
// Message Order
// ---------------------------------------------------------------------------

/**
 * Returns the ordered array of message IDs for the session.
 * The order is oldest-to-newest (append order).
 */
export function useMessageOrder(directory: string, sessionId: string): string[] {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.messageOrder ?? []
  })
}

/**
 * Selector: returns the full messageOrder array from context.
 * For use in derived computations outside React.
 */
export function selectMessageOrder(context: SessionMachineContext): string[] {
  return context.messageOrder
}

// ---------------------------------------------------------------------------
// Single Message Record
// ---------------------------------------------------------------------------

/**
 * Returns a single message record by ID, or undefined if not found.
 */
export function useMessageById(directory: string, sessionId: string, messageId: string): SessionMessageRecord | undefined {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.messagesById?.[messageId]
  })
}

/**
 * Selector: returns a single message record by ID from context.
 * For use in derived computations outside React.
 */
export function selectMessageById(context: SessionMachineContext, messageId: string): SessionMessageRecord | undefined {
  return context.messagesById?.[messageId]
}

// ---------------------------------------------------------------------------
// Part IDs for a Message
// ---------------------------------------------------------------------------

/**
 * Returns the ordered array of part IDs for a given message.
 */
export function usePartIdsForMessage(directory: string, sessionId: string, messageId: string): string[] {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.partsByMessageId?.[messageId] ?? []
  })
}

/**
 * Selector: returns part IDs for a message from context.
 * For use in derived computations outside React.
 */
export function selectPartIdsForMessage(context: SessionMachineContext, messageId: string): string[] {
  return context.partsByMessageId?.[messageId] ?? []
}

// ---------------------------------------------------------------------------
// Single Part Record
// ---------------------------------------------------------------------------

/**
 * Returns a single part record by ID, or undefined if not found.
 */
export function usePartById(directory: string, sessionId: string, partId: string): SessionPartRecord | undefined {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.partsById?.[partId]
  })
}

/**
 * Selector: returns a single part record by ID from context.
 * For use in derived computations outside React.
 */
export function selectPartById(context: SessionMachineContext, partId: string): SessionPartRecord | undefined {
  return context.partsById?.[partId]
}

// ---------------------------------------------------------------------------
// Streaming Message ID
// ---------------------------------------------------------------------------

/**
 * Returns the currently streaming message ID, or null if not streaming.
 */
export function useStreamingMessageId(directory: string, sessionId: string): string | null {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.streamingMessageId ?? null
  })
}

/**
 * Selector: returns the streaming message ID from context.
 * For use in derived computations outside React.
 */
export function selectStreamingMessageId(context: SessionMachineContext): string | null {
  return context.streamingMessageId
}

// ---------------------------------------------------------------------------
// Retry Overlay
// ---------------------------------------------------------------------------

/**
 * Returns the retry overlay state for display.
 * Returns null when no retry is active or when in cooldown.
 */
export function useRetryOverlay(
  directory: string,
  sessionId: string,
): {
  sessionId: string
  message: string
} | null {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return null

    // No retry message
    if (!ctx.retryMessage) return null

    // In cooldown - no overlay
    if (ctx.retryCooldownUntil !== null) return null

    return {
      sessionId,
      message: ctx.retryMessage,
    }
  })
}

// ---------------------------------------------------------------------------
// Error Display
// ---------------------------------------------------------------------------

/**
 * Returns the current error type for display.
 */
export function useErrorType(directory: string, sessionId: string): string | null {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.errorType ?? null
  })
}

/**
 * Returns the fatal error details if present.
 */
export function useFatalError(directory: string, sessionId: string): SessionMachineContext['fatalError'] {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx?.fatalError ?? null
  })
}

// ---------------------------------------------------------------------------
// History Domain
// ---------------------------------------------------------------------------

/**
 * Returns the history domain state.
 */
export function useHistoryDomain(directory: string, sessionId: string): {
  isLoadingOlder: boolean
  hasMoreAbove: boolean
  oldestLoadedMessageId: string | null
  newestLoadedMessageId: string | null
  historyLoadError: string | null
} {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) {
      return {
        isLoadingOlder: false,
        hasMoreAbove: false,
        oldestLoadedMessageId: null,
        newestLoadedMessageId: null,
        historyLoadError: null,
      }
    }
    return {
      isLoadingOlder: ctx.isLoadingOlder,
      hasMoreAbove: ctx.hasMoreAbove,
      oldestLoadedMessageId: ctx.oldestLoadedMessageId,
      newestLoadedMessageId: ctx.newestLoadedMessageId,
      historyLoadError: ctx.historyLoadError,
    }
  })
}

// ---------------------------------------------------------------------------
// Message Parts Data (for render derivation)
// ---------------------------------------------------------------------------

/**
 * Narrow slice of message/parts data for render derivation.
 * Returns only the normalized maps needed to build render entries.
 * This is a narrow selector - it does NOT return the entire machine context.
 */
export function useMessagePartsData(directory: string, sessionId: string): {
  messageOrder: string[]
  messagesById: Record<string, SessionMessageRecord>
  partsByMessageId: Record<string, string[]>
  partsById: Record<string, SessionPartRecord>
  streamingMessageId: string | null
} {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) {
      return {
        messageOrder: [],
        messagesById: {},
        partsByMessageId: {},
        partsById: {},
        streamingMessageId: null,
      }
    }
    return {
      messageOrder: ctx.messageOrder,
      messagesById: ctx.messagesById,
      partsByMessageId: ctx.partsByMessageId,
      partsById: ctx.partsById,
      streamingMessageId: ctx.streamingMessageId,
    }
  })
}
