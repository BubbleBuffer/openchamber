import React from 'react';

import { type MessageListHandle } from './VirtualizedMessageList';
import { ActiveSessionContext } from './ActiveSessionContext';
import { ChatSessionView } from './ChatSessionView';
import { useChatSessionData } from './hooks/useChatSessionData';
import { useChatSessionLifecycle } from './hooks/useChatSessionLifecycle';
import { useChatTimelineController } from './hooks/useChatTimelineController';
import { useChatTurnNavigation } from './hooks/useChatTurnNavigation';
import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';
import { useChatRenderingStore } from '@/stores/useChatRenderingStore';
import { useSync } from '@/sync/use-sync';
import { useSyncDirectory } from '@/sync/sync-context';
import { useChatActivity, useChatInterruptions, useChatMessages, useChatSessionState } from './state';

export type SessionMountProps = {
    sessionId: string;
    isActive: boolean;
    onScrollStateChange?: (state: { userScrolledUp: boolean; scrollToBottom: () => void }) => void;
};

export const SessionMount = React.memo(({
    sessionId,
    isActive,
    onScrollStateChange,
}: SessionMountProps) => {
    const directory = useSyncDirectory();
    const isExpandedInput = useUIStore((state) => state.isExpandedInput);
    const stickyUserHeader = useChatRenderingStore((state) => state.stickyUserHeader);
    const { isMobile } = useDeviceInfo();
    const isDesktopExpandedInput = isExpandedInput && !isMobile;

    const sync = useSync();
    const loadMessages = React.useCallback(
        (id: string) => sync.syncSession(id),
        [sync],
    );
    const loadMoreMessages = React.useCallback(
        (id: string) => sync.loadMore(id),
        [sync],
    );

    const data = useChatSessionData(sessionId);
    const statusIsWorking = data.status.type !== 'idle';
    const wasStatusWorkingRef = React.useRef(statusIsWorking);
    const messageListRef = React.useRef<MessageListHandle | null>(null);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const scrollToBottomRef = React.useRef<() => void>(() => {});

    const timelineController = useChatTimelineController({
        sessionId,
        messages: data.messages,
        historyMeta: data.historyMeta,
        scrollRef,
        messageListRef,
        loadMoreMessages,
    });

    const interruptions = useChatInterruptions({
        directory,
        sessionId,
    });

    const messagesState = useChatMessages({
        directory,
        sessionId,
        renderedMessages: timelineController.renderedMessages,
    });

    const activity = useChatActivity({
        directory,
        sessionId,
        showAbortStatus: false,
    });

    const sessionState = useChatSessionState({
        directory,
        sessionId,
        isActive,
        resourceLoaded: data.loaded,
    });

    const resumeToLatestInstant = React.useCallback(() => {
        void timelineController.resumeToBottomInstant();
    }, [timelineController]);

    useChatSessionLifecycle({
        sessionId,
        loaded: data.loaded,
        isDesktopExpandedInput,
        scrollRef,
        loadMessages,
        resumeToLatestInstant,
        resumeToBottomInstant: timelineController.resumeToBottomInstant,
    });

    const handleScrollStateChange = React.useCallback((state: { userScrolledUp: boolean; scrollToBottom: () => void }) => {
        scrollToBottomRef.current = state.scrollToBottom;
        onScrollStateChange?.(state);
    }, [onScrollStateChange]);

    const getAnimationHandlers = React.useCallback(
        (): import('@/components/chat/timeline/types').AnimationHandlers => ({
            onChunk: () => {},
            onComplete: () => {},
            onStreamingCandidate: () => {},
            onAnimationStart: () => {},
            onReservationCancelled: () => {},
            onReasoningBlock: () => {},
            onAnimatedHeightChange: () => { scrollToBottomRef.current(); },
        }),
        [],
    );

    const handleMessageContentChange = React.useCallback(
        (): void => {
            scrollToBottomRef.current();
        },
        [],
    );

    React.useEffect(() => {
        if (data.blockingRequests.permissions.length === 0 && data.blockingRequests.questions.length === 0) {
            return;
        }
        handleMessageContentChange();
    }, [data.blockingRequests.permissions, data.blockingRequests.questions, handleMessageContentChange]);

    React.useEffect(() => {
        const wasWorking = wasStatusWorkingRef.current;
        wasStatusWorkingRef.current = statusIsWorking;
        if (wasWorking && !statusIsWorking) {
            // Reconcile once at the end of a turn. SSE deltas keep ordinary
            // text responsive, while the canonical REST snapshot guarantees
            // multi-step tool messages and rich result payloads are complete.
            void sync.syncSession(sessionId, true);
        }
    }, [sessionId, statusIsWorking, sync]);

    const handleLoadOlder = React.useCallback(() => {
        void timelineController.loadEarlier();
    }, [timelineController]);

    useChatTurnNavigation({
        sessionId,
        turnIds: timelineController.turnIds,
        activeTurnId: timelineController.activeTurnId,
        scrollToTurn: timelineController.scrollToTurn,
        scrollToMessage: timelineController.scrollToMessage,
        resumeToBottom: timelineController.resumeToBottomInstant,
    });

    return (
        <ActiveSessionContext.Provider value={{ isActive }}>
            <ChatSessionView
                session={sessionState}
                messages={messagesState}
                activity={activity}
                interruptions={interruptions}
                currentSessionId={sessionId}
                isDesktopExpandedInput={isDesktopExpandedInput}
                stickyUserHeader={stickyUserHeader}
                activeStreamingPhase={data.streamingPhase}
                scrollRef={scrollRef}
                messageListRef={messageListRef}
                turnStart={timelineController.turnStart}
                pendingRevealWork={timelineController.pendingRevealWork}
                hasMoreAboveTurns={timelineController.historySignals.hasMoreAboveTurns}
                isLoadingOlder={timelineController.isLoadingOlder}
                handleMessageContentChange={handleMessageContentChange}
                getAnimationHandlers={getAnimationHandlers}
                handleLoadOlder={handleLoadOlder}
                onScrollStateChange={onScrollStateChange ? handleScrollStateChange : undefined}
            />
        </ActiveSessionContext.Provider>
    );
});

SessionMount.displayName = 'SessionMount';
