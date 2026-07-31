import type { SessionMachineContext, SessionMessageRecord, SessionPartRecord } from './context.js'
import type { SessionRetrySnapshot, SessionHistorySnapshot } from './snapshots.js'
import { createSessionSnapshot } from './snapshots.js'
import type { SessionSnapshotV1 } from './snapshots.js'

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export function selectIsStreaming(context: SessionMachineContext): boolean {
  return context.streamingMessageId !== null
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function selectIsWorking(context: SessionMachineContext): boolean {
  if (context.streamingMessageId !== null) {
    return true
  }
  // Working if retry is active and not in cooldown
  if (context.retryMessage !== null && context.retryCooldownUntil === null) {
    return true
  }
  return false
}

export function selectNeedsAttention(context: SessionMachineContext): boolean {
  // Permissions or questions pending
  if (Object.keys(context.permissionsById).length > 0) {
    return true
  }
  if (Object.keys(context.questionsById).length > 0) {
    return true
  }
  // Retry state active
  if (context.retryMessage !== null) {
    return true
  }
  // Fatal error
  if (context.fatalError !== null) {
    return true
  }
  return false
}

export function selectHasBlockingInterruption(context: SessionMachineContext): boolean {
  return (
    Object.keys(context.permissionsById).length > 0 ||
    Object.keys(context.questionsById).length > 0
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function selectCanLoadOlder(context: SessionMachineContext): boolean {
  return !context.isLoadingOlder && context.hasMoreAbove
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function selectRetrySnapshot(context: SessionMachineContext): SessionRetrySnapshot {
  return {
    retryMessage: context.retryMessage,
    retryCount: context.retryCount,
    retryCooldownUntil: context.retryCooldownUntil,
  }
}

export function selectHistorySnapshot(context: SessionMachineContext): SessionHistorySnapshot {
  return {
    isLoadingOlder: context.isLoadingOlder,
    hasMoreAbove: context.hasMoreAbove,
    oldestLoadedMessageId: context.oldestLoadedMessageId,
    newestLoadedMessageId: context.newestLoadedMessageId,
    historyLoadError: context.historyLoadError,
  }
}

// ---------------------------------------------------------------------------
// Messages & Parts
// ---------------------------------------------------------------------------

export function selectMessageOrder(context: SessionMachineContext): string[] {
  return context.messageOrder
}

export function selectMessageById(
  context: SessionMachineContext,
  messageId: string,
): SessionMessageRecord | undefined {
  return context.messagesById[messageId]
}

export function selectPartById(
  context: SessionMachineContext,
  partId: string,
): SessionPartRecord | undefined {
  return context.partsById[partId]
}

export function selectStreamingMessageId(context: SessionMachineContext): string | null {
  return context.streamingMessageId
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export function selectSessionSnapshot(
  context: SessionMachineContext,
  regions: Record<string, string>,
  hydratedAt: number,
): SessionSnapshotV1 {
  return createSessionSnapshot(context, regions, hydratedAt)
}
