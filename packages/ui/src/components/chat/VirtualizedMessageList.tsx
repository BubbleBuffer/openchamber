import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { ChatMessageEntry } from './lib/turns/types';
import type { StreamPhase } from './message/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useChatRenderingStore } from '@/stores/useChatRenderingStore';
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { streamPerfCount } from '@/stores/utils/streamDebug';
import { resolveMessageRole } from './message-list/normalizeMessages';
import type { RenderEntry } from './message-list/MessageListEntry';
import { MessageListEntry } from './message-list/MessageListEntry';
import { useChatScrollManager } from './hooks/useChatScrollManager';
import { useViewportAnchor } from './hooks/useViewportAnchor';
import { useVirtualizedChatEntries } from './hooks/useVirtualizedChatEntries';
import { useMessageEntryUiState } from './message-list/useMessageEntryUiState';
import { useMessageAnimationState } from './message-list/useMessageAnimationState';
import { LoadOlderBoundary } from './message-list/LoadOlderBoundary';

const DEFAULT_ENTRY_HEIGHT = 160;
const OVERSCAN = 5;

const useStableEvent = <TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) => {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => { handlerRef.current = handler; }, [handler]);
  return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

export interface ChatViewerHandle {
  scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => boolean;
  scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => boolean;
  captureViewportAnchor: () => { entryKey: string; offsetTop: number } | null;
  restoreViewportAnchor: (anchor: { entryKey: string; offsetTop: number }) => boolean;
}

export type MessageListHandle = ChatViewerHandle;

interface VirtualizedMessageListProps {
  sessionKey: string;
  turnStart: number;
  disableStaging?: boolean;
  messages: ChatMessageEntry[];
  sessionIsWorking?: boolean;
  activeStreamingMessageId?: string | null;
  activeStreamingPhase?: StreamPhase | null;
  retryOverlay?: {
    sessionId: string;
    message: string;
    confirmedAt?: number;
    fallbackTimestamp?: number;
  } | null;
  onMessageContentChange: (reason?: ContentChangeReason) => void;
  getAnimationHandlers: (messageId: string) => AnimationHandlers;
  hasMoreAbove: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScrollStateChange?: (state: { userScrolledUp: boolean; scrollToBottom: () => void }) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
}

const VirtualizedMessageList = React.forwardRef<ChatViewerHandle, VirtualizedMessageListProps>(
  (
    {
      sessionKey,
      turnStart,
      disableStaging: _disableStaging,
      messages,
      sessionIsWorking = false,
      activeStreamingMessageId = null,
      activeStreamingPhase = null,
      retryOverlay = null,
      onMessageContentChange,
      getAnimationHandlers,
      hasMoreAbove,
      isLoadingOlder,
      onLoadOlder,
      scrollRef,
      onScrollStateChange,
      onAtBottomChange,
    },
    ref,
  ) => {
    streamPerfCount('ui.virtual_list.render');
    void _disableStaging;
    const stickyUserHeader = useChatRenderingStore((state) => state.stickyUserHeader);
    const chatRenderMode = useChatRenderingStore((state) => state.chatRenderMode);
    const activityRenderMode = useChatRenderingStore((state) => state.activityRenderMode);

    const { turnUiStates, toggleTurnGroup } = useMessageEntryUiState({ activityRenderMode });
    const { shouldAnimateUserMessage, onUserAnimationConsumed } = useMessageAnimationState({
      sessionKey,
      messages,
    });
    const stableGetAnimationHandlers = useStableEvent(getAnimationHandlers);
    const stableOnLoadOlder = useStableEvent(onLoadOlder);
    const stableHistoryContentChange = useStableEvent((reason?: ContentChangeReason) => {
      onMessageContentChange(reason);
    });
    const stableTailContentChange = useStableEvent((reason?: ContentChangeReason) => {
      onMessageContentChange(reason);
    });

    const { allEntries, trailingStreamingEntry, messageIndexMap } = useVirtualizedChatEntries({
      messages,
      retryOverlay,
      sessionKey,
      chatRenderMode,
    });

    const estimateEntrySize = React.useCallback(
      (index: number): number => {
        const entry = allEntries[index];
        if (!entry) return DEFAULT_ENTRY_HEIGHT;
        if (entry.kind === 'ungrouped') {
          return resolveMessageRole(entry.message) === 'user' ? 80 : DEFAULT_ENTRY_HEIGHT;
        }
        return DEFAULT_ENTRY_HEIGHT;
      },
      [allEntries],
    );

    const virtualizer = useVirtualizer({
      count: allEntries.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: estimateEntrySize,
      overscan: OVERSCAN,
    });

    const scrollManager = useChatScrollManager({
      virtualizer,
      entryCount: allEntries.length,
      isActive: true,
      loadMore: stableOnLoadOlder,
      canLoadMore: turnStart > 0 || hasMoreAbove,
      isLoadingOlder,
      onScrollStateChange,
    });

    React.useEffect(() => {
      onAtBottomChange?.(scrollManager.isAtBottom);
    }, [scrollManager.isAtBottom, onAtBottomChange]);

    const { captureViewportAnchor, restoreViewportAnchor } = useViewportAnchor(scrollRef);

    const defaultActivityExpanded = activityRenderMode === 'summary';

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

    React.useImperativeHandle(ref, () => ({
      scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => {
        const behavior = options?.behavior ?? 'auto';
        const container = scrollRef.current;
        if (!container) return false;
        const turnElement = container.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
        if (turnElement) { turnElement.scrollIntoView({ behavior, block: 'nearest' }); return true; }
        const index = allEntries.findIndex((e) => e.kind === 'turn' && e.turn.turnId === turnId);
        if (index !== -1) { virtualizer.scrollToIndex(index, { behavior, align: 'start' }); return true; }
        return false;
      },
      scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => {
        const behavior = options?.behavior ?? 'auto';
        const container = scrollRef.current;
        if (!container) return false;
        const messageElement = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
        if (messageElement) { messageElement.scrollIntoView({ behavior, block: 'nearest' }); return true; }
        const index = messageIndexMap.get(messageId);
        if (typeof index === 'number') { virtualizer.scrollToIndex(index, { behavior, align: 'start' }); return true; }
        return false;
      },
      captureViewportAnchor: () => {
        const anchor = captureViewportAnchor();
        if (!anchor) return null;
        return { entryKey: anchor.entryKey, offsetTop: anchor.offsetFromTop };
      },
      restoreViewportAnchor: (anchor: { entryKey: string; offsetTop: number }) => {
        return restoreViewportAnchor({ entryKey: anchor.entryKey, offsetFromTop: anchor.offsetTop });
      },
    }), [allEntries, messageIndexMap, virtualizer, captureViewportAnchor, restoreViewportAnchor, scrollRef]);

    const disableFadeIn = false;

    return (
      <FadeInDisabledProvider disabled={disableFadeIn}>
        <LoadOlderBoundary
          isLoadingOlder={isLoadingOlder}
          hasMoreAbove={hasMoreAbove}
          turnStart={turnStart}
          onLoadEarlier={stableOnLoadOlder}
        />

        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const entry = allEntries[virtualItem.index];
            if (!entry) return null;
            const isStreaming = entry === trailingStreamingEntry;
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${virtualItem.start}px)`,
                  width: '100%',
                }}
              >
                <div data-turn-entry={entry.key}>
                  {renderEntry(entry, isStreaming)}
                </div>
              </div>
            );
          })}
        </div>
      </FadeInDisabledProvider>
    );
  },
);

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default React.memo(VirtualizedMessageList);
