/**
 * useMachineMessages — Phase 3.3 Core Hook Migration
 *
 * Derives ChatMessageEntry[] from normalized machine state (messageOrder,
 * messagesById, partsByMessageId, partsById) using deriveRenderEntries with
 * an identity-preserving cache.
 *
 * This hook is the single authoritative source for message data in the
 * ChatSessionData.messages field after Phase 3.3 migration.
 *
 * Identity preservation: Only entries whose content actually changed will have
 * new references. Unchanged entries reuse their previous references from cache.
 * This minimizes React re-renders during high-frequency streaming updates.
 */

import React from 'react'
import type { ChatMessageEntry } from '../../lib/turns/types'
import { useMessagePartsData } from './messageSelectors'
import { deriveRenderEntries, createEmptyRenderCache, type RenderCache } from './renderedMessages'

interface UseMachineMessagesOptions {
  directory: string
  sessionId: string
}

interface UseMachineMessagesResult {
  /** Render-ready message entries in messageOrder sequence */
  messages: ChatMessageEntry[]
  /** Machine's streamingMessageId for convenience */
  streamingMessageId: string | null
  /** Internal cache for identity preservation — do not mutate */
  cache: RenderCache
}

/**
 * Hook that derives ChatMessageEntry[] from machine normalized state.
 *
 * The cache ref is stored outside React state to avoid triggering re-renders.
 * Only the derived messages array is returned as React state.
 */
export function useMachineMessages({
  directory,
  sessionId,
}: UseMachineMessagesOptions): UseMachineMessagesResult {
  // Get normalized machine data via narrow selector
  const { messageOrder, messagesById, partsByMessageId, partsById, streamingMessageId } =
    useMessagePartsData(directory, sessionId)

  // Cache ref outside React state for identity preservation
  // This avoids re-renders when only part content changes
  const cacheRef = React.useRef<RenderCache>(createEmptyRenderCache())

  // Derive render entries with identity preservation
  const messages = React.useMemo<ChatMessageEntry[]>(() => {
    const result = deriveRenderEntries(
      messageOrder,
      messagesById,
      partsByMessageId,
      partsById,
      cacheRef.current,
    )
    cacheRef.current = result.cache
    return result.entries
  }, [messageOrder, messagesById, partsByMessageId, partsById])

  return { messages, streamingMessageId, cache: cacheRef.current }
}
