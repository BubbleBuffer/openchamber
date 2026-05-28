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

export function useChatMessages({
  messages,
  renderedMessages,
  streamingMessageId,
  historyMeta,
  retryOverlay,
}: UseChatMessagesOptions): ChatMessagesState {
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