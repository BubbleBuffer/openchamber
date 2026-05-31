import React from 'react';
import type { ChatTimelineState } from './types';
import type { ChatMessageEntry } from '../lib/turns/types';

interface UseChatTimelineStateOptions {
  turnStart: number;
  pendingRevealWork: boolean;
  hasMoreAboveTurns: boolean;
  /** Machine-provided isLoadingOlder. If undefined, caller must provide UI-owned value. */
  isLoadingOlder?: boolean;
  allEntries: ChatMessageEntry[];
}

/**
 * useChatTimelineState — Phase 3.3 Migration
 *
 * ## Boundary clarity: machine domain vs. UI-owned presentation state
 *
 * Machine-owned (passed in by controller from machine selectors):
 *   - isLoadingOlder — derived from machine's useHistoryState.isLoadingOlder
 *
 * UI/store-owned (caller-provided, never written by machine):
 *   - turnStart — viewport anchor for scroll position
 *   - pendingRevealWork — animation/reveal state
 *   - hasMoreAboveTurns — UI's knowledge of pagination
 *   - allEntries — ChatMessageEntry[] derived from machine messages via useMachineMessages
 *
 * The machine does NOT own timeline presentation state. It only provides
 * machine-readable history loading signals. UI state (scroll, reveal,
 * pagination) remains store-owned.
 */
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
      isLoadingOlder: isLoadingOlder ?? false,
      allEntries,
    }),
    [turnStart, pendingRevealWork, hasMoreAboveTurns, isLoadingOlder, allEntries],
  );
}
