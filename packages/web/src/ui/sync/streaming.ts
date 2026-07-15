/**
 * Streaming lifecycle tracking (DEPRECATED — Phase 3 migration).
 *
 * This module derives streaming state from the sync child store's
 * session_status and message/part updates. It was the authoritative source
 * before Phase 3 machine migration.
 *
 * DEPRECATED: The session machine is now the authoritative source for
 * streaming message IDs, lifecycle phase, and stuck session detection.
 * Replace usage with machine selectors:
 *   - useStreamingMessageId(directory, sessionId) from @/components/chat/state/machine/selectors
 *   - useIsStreaming(directory, sessionId) from @/components/chat/state/machine/selectors
 *   - useMessageStreamState / useActorSelector for stream phase details
 *
 * This module is retained for backward compatibility and will be removed
 * in a future phase once all callers migrate.
 */

import { create } from "zustand"
import type { Message, SessionStatus } from "@/lib/opencode/client"
import { STUCK_SESSION_TIMEOUT_MS } from "@/stores/types/sessionTypes"
import type { State } from "./types"
import { deprecationWarning } from "@/lib/deprecation"

export type StreamPhase = "streaming" | "cooldown" | "completed"

export type MessageStreamState = {
  phase: StreamPhase
  startedAt: number
  lastUpdateAt: number
  completedAt?: number
}

export type StreamingStore = {
  /** Currently streaming message per session */
  streamingMessageIds: Map<string, string | null>
  /** Lifecycle phase per message */
  messageStreamStates: Map<string, MessageStreamState>
  /**
   * RC-5: When did each session enter `busy` state? Used to detect sessions
   * that are stuck busy but never produced an assistant message (server hung
   * before any output), which the per-message stuck check can't catch.
   */
  busySinceBySessionId: Map<string, number>
}

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
  busySinceBySessionId: new Map(),
}))

/**
 * Called from the SyncBridge/flush handler when child store state changes.
 * Derives streaming state from session_status + messages.
 *
 * @deprecated Use machine session actor state instead. The machine owns
 * streamingMessageId, isWorking, and lifecycle phase. This function
 * populates a legacy UI-only store and will be removed in a future phase.
 */
/** Only update lastUpdateAt every this many ms to avoid 60Hz store churn */
const STREAMING_HEARTBEAT_MS = 1000

export function updateStreamingState(
  state: State,
  options?: { onStuckSession?: (sessionID: string) => void }
) {
  deprecationWarning(
    'updateStreamingState',
    'machine session actor state (useStreamingMessageId, useIsStreaming, etc.)',
  )
  const now = Date.now()
  const currentStore = useStreamingStore.getState()
  const currentStreamingIds = currentStore.streamingMessageIds
  const currentStreamStates = currentStore.messageStreamStates
  const currentBusySince = currentStore.busySinceBySessionId

  const nextStreamingIds = new Map<string, string | null>()
  const nextStreamStates = new Map(currentStreamStates)
  const nextBusySince = new Map(currentBusySince)
  let changed = false

  // Fast path: only scan sessions that are actually busy.
  // Idle sessions are handled by checking against currentStreamingIds below.
  const busySessionIds = new Set<string>()
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    if ((status as SessionStatus).type === "busy") {
      busySessionIds.add(sessionID)
    }
  }

  for (const sessionID of busySessionIds) {
    // RC-5: Track when each session first entered busy. Cleared when the
    // session leaves busy below.
    if (!nextBusySince.has(sessionID)) {
      nextBusySince.set(sessionID, now)
      changed = true
    }
    const messages = state.message[sessionID]
    if (!messages || messages.length === 0) continue

    // Find the last assistant message — that's the one streaming
    let streamingMsg: Message | null = null
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        streamingMsg = messages[i]
        break
      }
    }

    if (!streamingMsg) continue

    const prevId = currentStreamingIds.get(sessionID)
    if (prevId !== streamingMsg.id) changed = true
    nextStreamingIds.set(sessionID, streamingMsg.id)

    const existing = nextStreamStates.get(streamingMsg.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMsg.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
      // Throttle lastUpdateAt writes to ~1Hz instead of 60Hz
      nextStreamStates.set(streamingMsg.id, {
        ...existing,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  // Mark completed any previously streaming sessions that are now idle or gone
  for (const [sessionID, msgId] of currentStreamingIds) {
    if (!msgId) continue
    const isStillBusy = busySessionIds.has(sessionID)
    if (isStillBusy) continue

    nextStreamingIds.set(sessionID, null)
    const existing = nextStreamStates.get(msgId)
    if (existing && existing.phase === "streaming") {
      nextStreamStates.set(msgId, {
        ...existing,
        phase: "completed",
        completedAt: now,
      })
      changed = true
    }
  }

  const stuckSessionIds: string[] = []

  // Stuck session recovery: force completion if no updates for STUCK_SESSION_TIMEOUT_MS
  for (const [msgId, streamState] of currentStreamStates) {
    if (streamState.phase !== "streaming") continue
    if (now - streamState.lastUpdateAt < STUCK_SESSION_TIMEOUT_MS) continue
    let sessionID: string | undefined
    for (const [sid, messages] of Object.entries(state.message)) {
      if (messages.some((m) => m.id === msgId)) { sessionID = sid; break }
    }
    nextStreamStates.set(msgId, { ...streamState, phase: "completed", completedAt: now })
    if (sessionID) {
      nextStreamingIds.set(sessionID, null)
      nextBusySince.delete(sessionID)
      stuckSessionIds.push(sessionID)
    }
    changed = true
  }

  // RC-5: Recover sessions stuck in busy with no assistant message ever produced.
  // The per-message stuck check above only catches sessions that started
  // streaming and then went silent. If the server hung before producing any
  // output, no streamState exists for the session — handle that here.
  for (const [sessionID, busySince] of nextBusySince) {
    if (!busySessionIds.has(sessionID)) {
      // No longer busy — drop tracker.
      nextBusySince.delete(sessionID)
      changed = true
      continue
    }
    if (now - busySince < STUCK_SESSION_TIMEOUT_MS) continue
    const hasStreamingMessage = nextStreamingIds.get(sessionID) != null
    if (hasStreamingMessage) continue
    nextBusySince.delete(sessionID)
    stuckSessionIds.push(sessionID)
    changed = true
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
      busySinceBySessionId: nextBusySince,
    })
  }

  // Call callbacks AFTER the streaming store is updated so that any re-entrant
  // subscriber runs see the completed state and don't trigger stuck recovery again.
  for (const sessionID of stuckSessionIds) {
    options?.onStuckSession?.(sessionID)
  }
}

// Selectors — DEPRECATED: use machine selectors instead
// Machine replacement: useStreamingMessageId(directory, sessionId) from @/components/chat/state/machine/selectors

/** @deprecated Use useStreamingMessageId(directory, sessionId) from @/components/chat/state/machine/selectors instead */
export const selectStreamingMessageId = (sessionID: string) => {
  deprecationWarning(
    'selectStreamingMessageId',
    'useStreamingMessageId(directory, sessionId) from @/components/chat/state/machine/selectors',
  )
  return (state: StreamingStore) => state.streamingMessageIds.get(sessionID) ?? null
}

/** @deprecated Use machine state via useMessageStreamState — machine owns streaming phase authority */
export const selectMessageStreamState = (messageID: string) => {
  deprecationWarning(
    'selectMessageStreamState',
    'derive from machine state via useMessageStreamState or useActorSelector',
  )
  return (state: StreamingStore) => state.messageStreamStates.get(messageID) ?? null
}

/** @deprecated Use useIsStreaming(directory, sessionId) from @/components/chat/state/machine/selectors instead */
export const selectIsStreaming = (sessionID: string) => {
  deprecationWarning(
    'selectIsStreaming',
    'useIsStreaming(directory, sessionId) from @/components/chat/state/machine/selectors',
  )
  return (state: StreamingStore) => state.streamingMessageIds.get(sessionID) != null
}
