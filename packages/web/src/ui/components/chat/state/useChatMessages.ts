import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { ChatMessagesState } from './types';
import {
  useStreamingMessageId as useMachineStreamingMessageId,
  useRetryState as useMachineRetryState,
  useHistoryState as useMachineHistoryState,
} from './machine/selectors';

interface UseChatMessagesOptions {
  directory: string;
  sessionId: string;
  renderedMessages: ChatMessageEntry[];
}

export function useChatMessages({
  directory,
  sessionId,
  renderedMessages,
}: UseChatMessagesOptions): ChatMessagesState {
  const streamingMessageId = useMachineStreamingMessageId(directory, sessionId) ?? undefined;
  const historyState = useMachineHistoryState(directory, sessionId);
  const retryState = useMachineRetryState(directory, sessionId);

  const [fallbackTimestamp, setFallbackTimestamp] = React.useState(0);
  const retrySessionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!retryState.retryMessage || retryState.retryCooldownUntil !== null) {
      retrySessionRef.current = null;
      setFallbackTimestamp(0);
      return;
    }
    if (retrySessionRef.current !== sessionId) {
      retrySessionRef.current = sessionId;
      setFallbackTimestamp(Date.now());
    }
  }, [retryState.retryMessage, retryState.retryCooldownUntil, sessionId]);

  const historyMeta = React.useMemo(() => ({
    limit: renderedMessages.length,
    complete: !historyState.hasMoreAbove,
    loading: historyState.isLoadingOlder,
  }), [historyState.hasMoreAbove, historyState.isLoadingOlder, renderedMessages.length]);

  const retryOverlay = React.useMemo(() => {
    if (!retryState.retryMessage || retryState.retryCooldownUntil !== null) {
      return null;
    }
    return {
      sessionId,
      message: retryState.retryMessage,
      confirmedAt: undefined,
      fallbackTimestamp,
    };
  }, [retryState.retryMessage, retryState.retryCooldownUntil, sessionId, fallbackTimestamp]);

  return React.useMemo(
    () => ({
      messages: renderedMessages,
      renderedMessages,
      messageCount: renderedMessages.length,
      streamingMessageId,
      historyMeta,
      retryOverlay,
    }),
    [historyMeta, renderedMessages, retryOverlay, streamingMessageId],
  );
}
