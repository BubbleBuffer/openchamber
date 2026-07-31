// Re-export machine selectors for React-friendly usage
export {
  selectIsStreaming,
  selectIsWorking,
  selectNeedsAttention,
  selectHasBlockingInterruption,
  selectCanLoadOlder,
  selectRetrySnapshot,
  selectHistorySnapshot,
  selectMessageOrder,
  selectMessageById,
  selectPartById,
  selectStreamingMessageId,
  selectSessionSnapshot,
} from '@openchamber/session-state'

import type { SessionMachineContext, SessionHistorySnapshot } from '@openchamber/session-state'
import { useSelector } from '@xstate/react'
import { useSessionActor } from './useSessionActor'

/**
 * Narrow selector hook wrappers around useSelector(actor, selector).
 *
 * Each hook selects a specific slice of the actor's snapshot context.
 * These are the primary interface for React components to read machine state.
 *
 * The hooks read from the actor owned by ClientSessionMachineBridge.
 * Throws if used outside the bridge provider.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = any

// Selector function type for extracting context from actor snapshot
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContextSelector<T> = (snapshot: any) => T

function useActorSelector<T>(directory: string, sessionId: string, selector: ContextSelector<T>): T {
  const actor = useSessionActor(directory, sessionId)
  return useSelector(actor as AnyActor, selector as ContextSelector<T>)
}

function useActorContext(directory: string, sessionId: string): SessionMachineContext {
  return useActorSelector(directory, sessionId, (snap) => snap.context as SessionMachineContext)
}

export function useSessionSnapshot(directory: string, sessionId: string): SessionMachineContext {
  return useActorContext(directory, sessionId)
}

export function useIsStreaming(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => snap.context?.streamingMessageId !== null)
}

export function useIsWorking(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return false
    if (ctx.streamingMessageId !== null) return true
    if (ctx.retryMessage !== null && ctx.retryCooldownUntil === null) return true
    return false
  })
}

export function useNeedsAttention(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return false
    if (Object.keys(ctx.permissionsById ?? {}).length > 0) return true
    if (Object.keys(ctx.questionsById ?? {}).length > 0) return true
    if (ctx.retryMessage !== null) return true
    if (ctx.fatalError !== null) return true
    return false
  })
}

export function useHasBlockingInterruption(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return false
    return (
      Object.keys(ctx.permissionsById ?? {}).length > 0 ||
      Object.keys(ctx.questionsById ?? {}).length > 0
    )
  })
}

export function useStreamingMessageId(directory: string, sessionId: string): string | null {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.streamingMessageId ?? null)
}

export function useLoaded(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.loaded ?? false)
}

export function useSessionExists(directory: string, sessionId: string): boolean {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.exists ?? false)
}

export function useParentSessionId(directory: string, sessionId: string): string | null {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.parentSessionId ?? null)
}

export function usePermissions(directory: string, sessionId: string): Array<SessionMachineContext['permissionsById'][string]> {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx ? Object.values(ctx.permissionsById ?? {}) : []
  })
}

export function useQuestions(directory: string, sessionId: string): Array<SessionMachineContext['questionsById'][string]> {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    return ctx ? Object.values(ctx.questionsById ?? {}) : []
  })
}

export function useRetryState(directory: string, sessionId: string): { retryMessage: string | null; retryCount: number; retryCooldownUntil: number | null } {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return { retryMessage: null, retryCount: 0, retryCooldownUntil: null }
    return {
      retryMessage: ctx.retryMessage,
      retryCount: ctx.retryCount,
      retryCooldownUntil: ctx.retryCooldownUntil,
    }
  })
}

export function useHistoryState(directory: string, sessionId: string): SessionHistorySnapshot {
  return useActorSelector(directory, sessionId, (snap) => {
    const ctx = snap.context as SessionMachineContext | undefined
    if (!ctx) return { isLoadingOlder: false, hasMoreAbove: false, oldestLoadedMessageId: null, newestLoadedMessageId: null, historyLoadError: null }
    return {
      isLoadingOlder: ctx.isLoadingOlder,
      hasMoreAbove: ctx.hasMoreAbove,
      oldestLoadedMessageId: ctx.oldestLoadedMessageId,
      newestLoadedMessageId: ctx.newestLoadedMessageId,
      historyLoadError: ctx.historyLoadError,
    }
  })
}

export function useMessageOrder(directory: string, sessionId: string): string[] {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.messageOrder ?? [])
}

export function useErrorType(directory: string, sessionId: string): string | null {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.errorType ?? null)
}

export function useFatalError(directory: string, sessionId: string): SessionMachineContext['fatalError'] {
  return useActorSelector(directory, sessionId, (snap) => (snap.context as SessionMachineContext | undefined)?.fatalError ?? null)
}