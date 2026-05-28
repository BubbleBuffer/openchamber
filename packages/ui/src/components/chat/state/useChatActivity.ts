import React from 'react';
import type { ChatActivityState } from './types';

interface UseChatActivityOptions {
  isWorking: boolean;
  streamingMessageId: string | undefined;
  showAbortStatus: boolean;
  hasBlockingRequest: boolean;
}

export function useChatActivity({
  isWorking,
  streamingMessageId,
  showAbortStatus,
  hasBlockingRequest,
}: UseChatActivityOptions): ChatActivityState {
  return React.useMemo(
    () => ({
      isWorking,
      isStreaming: Boolean(streamingMessageId),
      isAborting: showAbortStatus,
      showAbortStatus,
      needsAttention: hasBlockingRequest,
    }),
    [hasBlockingRequest, isWorking, showAbortStatus, streamingMessageId],
  );
}