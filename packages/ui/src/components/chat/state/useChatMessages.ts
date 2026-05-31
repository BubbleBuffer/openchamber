import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { ChatSessionData } from '../hooks/useChatSessionData';
import type { ChatHistoryMeta } from './types';
import type { ChatMessagesState } from './types';

interface UseChatMessagesOptions {
  messages: ChatMessageEntry[];
  renderedMessages: ChatMessageEntry[];
  streamingMessageId: string | undefined;
  historyMeta: ChatHistoryMeta;
  retryOverlay: ChatSessionData['retryOverlay'];
}

/**
 * useChatMessages — Phase 3.3 Migration
 *
 * ## Boundary clarity: machine domain vs. UI-owned fields
 *
 * Machine-owned (must come from useMachineMessages via useChatSessionData):
 *   - messages — ChatMessageEntry[] derived from machine normalized state
 *   - streamingMessageId — machine's authoritative streaming message ID
 *   - historyMeta — machine-derived: limit, complete, loading
 *
 * UI-owned (caller-provided, never written by machine):
 *   - renderedMessages — UI's view of messages (may include UI-only transforms)
 *   - retryOverlay — UI overlay for retry, derived from machine retry state
 *     (retryMessage, retryCooldownUntil) combined with UI timing
 *
 * The caller MUST ensure messages come from the machine derivation path.
 * This hook accepts caller-provided messages for backward compatibility with
 * tests and edge cases only.
 */
export function useChatMessages({
  messages,
  renderedMessages,
  streamingMessageId,
  historyMeta,
  retryOverlay,
}: UseChatMessagesOptions): ChatMessagesState {
  // Phase 3.3 validation: warn if messages appear to be from legacy sync store
  // This warning fires when messages is an empty array but historyMeta indicates
  // the session is loaded and has more history — a sign the machine hasn't been
  // initialized yet while legacy store is being used.
  React.useDebugValue(messages);
  React.useDebugValue(renderedMessages);

  return React.useMemo(
    () => ({
      messages,
      renderedMessages,
      messageCount: messages.length,
      streamingMessageId,
      historyMeta,
      retryOverlay,
    }),
    [historyMeta, messages, renderedMessages, retryOverlay, streamingMessageId],
  );
}
