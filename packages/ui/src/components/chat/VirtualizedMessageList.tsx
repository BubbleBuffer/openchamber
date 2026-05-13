import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { ChatMessageEntry } from './lib/turns/types';
import type { StreamPhase } from './message/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTurnRecords } from './hooks/useTurnRecords';
import { applyRetryOverlay } from './lib/turns/applyRetryOverlay';
import { useUIStore } from '@/stores/useUIStore';
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { hasPendingUserSendAnimation, consumePendingUserSendAnimation } from '@/lib/userSendAnimation';
import { streamPerfCount, streamPerfMeasure } from '@/stores/utils/streamDebug';
import { LoadOlderButton } from './turn/LoadOlderButton';
import {
  getNormalizedMessageForDisplay,
  hasCompactionPart,
  getPartText,
  normalizeCompactionSummaryMessage,
  isUserSubtaskMessage,
  isSyntheticSubtaskBridgeAssistant,
  withSubtaskSessionId,
  isUserShellMarkerMessage,
  getShellBridgeAssistantDetails,
  getMessageId,
  withShellBridgeDetails,
  resolveMessageRole,
} from './message-list/normalizeMessages';
import type { RenderEntry } from './message-list/MessageListEntry';
import { MessageListEntry } from './message-list/MessageListEntry';
import type { TurnUiState } from './message-list/TurnBlock';
import { useChatScrollManager } from './hooks/useChatScrollManager';
import { useViewportAnchor } from './hooks/useViewportAnchor';

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
    },
    ref,
  ) => {
    streamPerfCount('ui.virtual_list.render');
    void _disableStaging;
    const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    const activityRenderMode = useUIStore((state) => state.activityRenderMode);
    const defaultActivityExpanded = activityRenderMode === 'summary';
    const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => new Map());
    const userAnimationRef = React.useRef<{
      sessionKey: string | undefined;
      previousOrder: string[];
      animatedIds: Set<string>;
    }>({ sessionKey: undefined, previousOrder: [], animatedIds: new Set() });
    const stableGetAnimationHandlers = useStableEvent(getAnimationHandlers);
    const stableOnLoadOlder = useStableEvent(onLoadOlder);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => { setTurnUiStates(new Map()); }, [activityRenderMode]);

    const toggleTurnGroup = React.useCallback(
      (turnId: string) => {
        setTurnUiStates((previous) => {
          const next = new Map(previous);
          const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
          next.set(turnId, { isExpanded: !current.isExpanded });
          return next;
        });
      },
      [defaultActivityExpanded],
    );

    const baseDisplayMessages = React.useMemo(
      () => streamPerfMeasure('ui.virtual_list.base_display_ms', () => {
        const seenIdsFromTail = new Set<string>();
        const dedupedMessages: ChatMessageEntry[] = [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          const messageId = message.info?.id;
          if (typeof messageId === 'string') {
            if (seenIdsFromTail.has(messageId)) continue;
            seenIdsFromTail.add(messageId);
          }
          dedupedMessages.push(getNormalizedMessageForDisplay(message));
        }
        dedupedMessages.reverse();

        const output: ChatMessageEntry[] = [];
        const compactionCommandIds = new Set<string>();
        for (let index = 0; index < dedupedMessages.length; index += 1) {
          const current = dedupedMessages[index];
          const currentWithRole = normalizeCompactionSummaryMessage(current, compactionCommandIds);
          if (hasCompactionPart(current) || current.parts.some((part) => part.type === 'text' && getPartText(part).trim() === '/compact')) {
            compactionCommandIds.add(current.info.id);
          }
          const previous = output.length > 0 ? output[output.length - 1] : undefined;
          if (isUserSubtaskMessage(previous)) {
            const bridge = isSyntheticSubtaskBridgeAssistant(currentWithRole);
            if (bridge.hide) {
              output[output.length - 1] = withSubtaskSessionId(previous as ChatMessageEntry, bridge.taskSessionId);
              continue;
            }
          }
          if (isUserShellMarkerMessage(previous)) {
            const bridge = getShellBridgeAssistantDetails(currentWithRole, getMessageId(previous));
            if (bridge.hide) {
              output[output.length - 1] = withShellBridgeDetails(previous as ChatMessageEntry, bridge.details);
              continue;
            }
          }
          output.push(currentWithRole);
        }
        return output;
      }),
      [messages],
    );

    const displayMessages = React.useMemo(
      () => streamPerfMeasure('ui.virtual_list.retry_overlay_ms', () =>
        applyRetryOverlay(baseDisplayMessages, {
          sessionId: retryOverlay?.sessionId ?? null,
          message: retryOverlay?.message ?? 'Quota limit reached. Retrying automatically.',
          confirmedAt: retryOverlay?.confirmedAt,
          fallbackTimestamp: retryOverlay?.fallbackTimestamp ?? 0,
        }),
      ),
      [baseDisplayMessages, retryOverlay],
    );

    const { projection, staticTurns, streamingTurn } = useTurnRecords(displayMessages, {
      sessionKey,
      showTextJustificationActivity: chatRenderMode === 'sorted',
    });

    const staticRenderEntries = React.useMemo<RenderEntry[]>(
      () => streamPerfMeasure('ui.virtual_list.render_entries_ms', () => {
        const turnEntries = staticTurns.map((turn) => ({
          kind: 'turn' as const,
          key: `turn:${turn.turnId}`,
          turn,
          isLastTurn: turn.turnId === projection.lastTurnId,
        }));

        if (projection.ungroupedMessageIds.size === 0) return turnEntries;

        const turnEntryByUserMessageId = new Map<string, RenderEntry>();
        turnEntries.forEach((entry) => {
          turnEntryByUserMessageId.set(entry.turn.userMessage.info.id, entry);
        });

        const orderedEntries: RenderEntry[] = [];
        displayMessages.forEach((message: ChatMessageEntry, i: number) => {
          const turnEntry = turnEntryByUserMessageId.get(message.info.id);
          if (turnEntry) {
            orderedEntries.push(turnEntry);
            return;
          }
          if (!projection.ungroupedMessageIds.has(message.info.id)) return;
          orderedEntries.push({
            kind: 'ungrouped',
            key: `msg:${message.info.id}`,
            message,
            previousMessage: i > 0 ? displayMessages[i - 1] : undefined,
            nextMessage: i + 1 < displayMessages.length ? displayMessages[i + 1] : undefined,
          });
        });
        return orderedEntries;
      }),
      [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, staticTurns],
    );

    const trailingStreamingEntry = React.useMemo<RenderEntry | undefined>(() => {
      if (streamingTurn) {
        return {
          kind: 'turn',
          key: `turn:${streamingTurn.turnId}`,
          turn: streamingTurn,
          isLastTurn: streamingTurn.turnId === projection.lastTurnId,
        } satisfies RenderEntry;
      }
      if (projection.ungroupedMessageIds.size === 0) return undefined;
      const lastMessage = displayMessages[displayMessages.length - 1];
      if (!lastMessage || !projection.ungroupedMessageIds.has(lastMessage.info.id)) return undefined;
      return {
        kind: 'ungrouped',
        key: `msg:${lastMessage.info.id}`,
        message: lastMessage,
        previousMessage: displayMessages.length > 1 ? displayMessages[displayMessages.length - 2] : undefined,
        nextMessage: undefined,
      } satisfies RenderEntry;
    }, [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, streamingTurn]);

    if (trailingStreamingEntry) streamPerfCount('ui.virtual_list.render.streaming');

    const historyEntries = staticRenderEntries;

    const allEntries = React.useMemo(() => {
      const result: RenderEntry[] = [];
      if (trailingStreamingEntry) result.push(trailingStreamingEntry);
      result.push(...historyEntries);
      return result;
    }, [historyEntries, trailingStreamingEntry]);

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

    useChatScrollManager({
      virtualizer,
      entryCount: allEntries.length,
      isActive: true,
      loadMore: stableOnLoadOlder,
      canLoadMore: turnStart > 0 || hasMoreAbove,
      isLoadingOlder,
    });

    const { captureViewportAnchor, restoreViewportAnchor } = useViewportAnchor(scrollRef);

    const currentUserOrder = React.useMemo(
      () => messages.filter((m) => resolveMessageRole(m) === 'user').map((m) => m.info.id),
      [messages],
    );

    {
      const anim = userAnimationRef.current;
      if (anim.sessionKey !== sessionKey) {
        anim.sessionKey = sessionKey;
        anim.previousOrder = currentUserOrder;
        anim.animatedIds = new Set();
      }
      const prev = anim.previousOrder;
      if (currentUserOrder.length > prev.length) {
        const isAppendOnly = prev.every((id, i) => currentUserOrder[i] === id);
        if (isAppendOnly && hasPendingUserSendAnimation(sessionKey)) {
          for (let i = prev.length; i < currentUserOrder.length; i += 1) {
            const id = currentUserOrder[i];
            if (id && !anim.animatedIds.has(id)) {
              if (!consumePendingUserSendAnimation(sessionKey)) break;
              anim.animatedIds.add(id);
            }
          }
        }
      }
      anim.previousOrder = currentUserOrder;
    }

    const shouldAnimateUserMessage = React.useCallback(
      (message: ChatMessageEntry): boolean => {
        if (resolveMessageRole(message) !== 'user') return false;
        return userAnimationRef.current.animatedIds.has(message.info.id);
      },
      [],
    );
    const onUserAnimationConsumed = React.useCallback((messageId: string) => {
      userAnimationRef.current.animatedIds.delete(messageId);
    }, []);

    const stableHistoryContentChange = useStableEvent((reason?: ContentChangeReason) => { onMessageContentChange(reason); });
    const stableTailContentChange = useStableEvent((reason?: ContentChangeReason) => { onMessageContentChange(reason); });

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
          activeStreamingPhase={activeStreamingPhase}
        />
      ),
      [stickyUserHeader, sessionIsWorking, defaultActivityExpanded, turnUiStates, toggleTurnGroup, chatRenderMode, shouldAnimateUserMessage, onUserAnimationConsumed, activeStreamingMessageId, activeStreamingPhase, stableGetAnimationHandlers, stableHistoryContentChange, stableTailContentChange],
    );

    const messageIndexMap = React.useMemo(() => {
      const indexMap = new Map<string, number>();
      allEntries.forEach((entry, index) => {
        if (entry.kind === 'ungrouped') { indexMap.set(entry.message.info.id, index); return; }
        indexMap.set(entry.turn.userMessage.info.id, index);
        entry.turn.assistantMessages.forEach((m) => indexMap.set(m.info.id, index));
      });
      return indexMap;
    }, [allEntries]);

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
    }), [allEntries, messageIndexMap, virtualizer, captureViewportAnchor, restoreViewportAnchor]);

    const disableFadeIn = false;

    return (
      <FadeInDisabledProvider disabled={disableFadeIn}>
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
          data-scrollbar="chat"
        >
          <LoadOlderButton
            hasMoreAbove={turnStart > 0 || hasMoreAbove}
            isLoadingOlder={isLoadingOlder}
            onLoadOlder={stableOnLoadOlder}
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
        </div>
      </FadeInDisabledProvider>
    );
  },
);

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default React.memo(VirtualizedMessageList);
