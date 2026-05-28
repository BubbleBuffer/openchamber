import React from 'react';
import type { ChatTimelineState } from './types';
import type { ChatMessageEntry } from '../lib/turns/types';

interface UseChatTimelineStateOptions {
  turnStart: number;
  pendingRevealWork: boolean;
  hasMoreAboveTurns: boolean;
  isLoadingOlder: boolean;
  allEntries: ChatMessageEntry[];
}

export function useChatTimelineState({
  turnStart,
  pendingRevealWork,
  hasMoreAboveTurns,
  isLoadingOlder,
  allEntries,
}: UseChatTimelineStateOptions): ChatTimelineState {
  return React.useMemo(
    () => ({
      turnStart,
      pendingRevealWork,
      hasMoreAboveTurns,
      isLoadingOlder,
      allEntries,
    }),
    [turnStart, pendingRevealWork, hasMoreAboveTurns, isLoadingOlder, allEntries],
  );
}