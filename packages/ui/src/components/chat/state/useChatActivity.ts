import React from 'react';
import type { ChatActivityState } from './types';

// Machine hooks for state that was migrated
import {
    useIsWorking as useMachineIsWorking,
    useIsStreaming as useMachineIsStreaming,
    useNeedsAttention as useMachineNeedsAttention,
} from './machine/selectors';

interface UseChatActivityOptions {
  directory: string;
  sessionId: string;
  showAbortStatus: boolean;
}

export function useChatActivity({
  directory,
  sessionId,
  showAbortStatus,
}: UseChatActivityOptions): ChatActivityState {
  // Get machine state
  const isWorking = useMachineIsWorking(directory, sessionId);
  const isStreaming = useMachineIsStreaming(directory, sessionId);
  const needsAttention = useMachineNeedsAttention(directory, sessionId);

  return React.useMemo(
    () => ({
      isWorking,
      isStreaming,
      isAborting: showAbortStatus,
      showAbortStatus,
      needsAttention,
    }),
    [isWorking, isStreaming, needsAttention, showAbortStatus],
  );
}