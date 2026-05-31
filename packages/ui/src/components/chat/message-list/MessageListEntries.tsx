import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { StreamPhase } from '../message/types';
import type { TurnUiState } from './TurnBlock';
import type { RenderEntry } from './MessageListEntry';
import { MessageListEntry } from './MessageListEntry';

interface MessageListEntriesProps {
  turnUiStates: Map<string, TurnUiState>;
  toggleTurnGroup: (turnId: string) => void;
  defaultActivityExpanded: boolean;
  chatRenderMode: 'sorted' | 'live';
  sessionIsWorking: boolean;
  stickyUserHeader: boolean;
  shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
  onUserAnimationConsumed: (messageId: string) => void;
  activeStreamingMessageId: string | null;
  activeStreamingPhase: StreamPhase | null;
  getAnimationHandlers: (messageId: string) => AnimationHandlers;
  onMessageContentChange: (reason?: ContentChangeReason) => void;
  entries: RenderEntry[];
  trailingStreamingEntry: RenderEntry | null;
}

const useStableEvent = <TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
) => {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

export const MessageListEntries = React.memo(function MessageListEntries({
  turnUiStates,
  toggleTurnGroup,
  defaultActivityExpanded,
  chatRenderMode,
  sessionIsWorking,
  stickyUserHeader,
  shouldAnimateUserMessage,
  onUserAnimationConsumed,
  activeStreamingMessageId,
  activeStreamingPhase,
  getAnimationHandlers,
  onMessageContentChange,
  entries,
  trailingStreamingEntry,
}: MessageListEntriesProps) {
  const stableGetAnimationHandlers = useStableEvent(getAnimationHandlers);
  const stableHistoryContentChange = useStableEvent((reason?: ContentChangeReason) => {
    onMessageContentChange(reason);
  });
  const stableTailContentChange = useStableEvent((reason?: ContentChangeReason) => {
    onMessageContentChange(reason);
  });

  const renderEntry = React.useCallback(
    (entry: RenderEntry, isStreaming: boolean) => (
      <MessageListEntry
        entry={entry}
        onMessageContentChange={isStreaming ? stableTailContentChange : stableHistoryContentChange}
        getAnimationHandlers={stableGetAnimationHandlers}
        stickyUserHeader={stickyUserHeader}
        sessionIsWorking={isStreaming ? sessionIsWorking : false}
        defaultActivityExpanded={defaultActivityExpanded}
        turnUiStates={turnUiStates}
        onToggleTurnGroup={toggleTurnGroup}
        chatRenderMode={chatRenderMode}
        shouldAnimateUserMessage={shouldAnimateUserMessage}
        onUserAnimationConsumed={onUserAnimationConsumed}
        activeStreamingMessageId={isStreaming ? activeStreamingMessageId : null}
        activeStreamingPhase={isStreaming ? activeStreamingPhase : null}
      />
    ),
    [
      stickyUserHeader,
      sessionIsWorking,
      defaultActivityExpanded,
      turnUiStates,
      toggleTurnGroup,
      chatRenderMode,
      shouldAnimateUserMessage,
      onUserAnimationConsumed,
      activeStreamingMessageId,
      activeStreamingPhase,
      stableGetAnimationHandlers,
      stableHistoryContentChange,
      stableTailContentChange,
    ],
  );

  return (
    <>
      {entries.map((entry) => {
        const isStreaming = entry === trailingStreamingEntry;
        return (
          <div key={entry.key} data-turn-entry={entry.key}>
            {renderEntry(entry, isStreaming)}
          </div>
        );
      })}
    </>
  );
});
