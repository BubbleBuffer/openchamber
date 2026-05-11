import React from 'react';
import type { Message } from '@/lib/opencode/client';

import { type MessageListHandle } from './MessageList';
import ChatEmptyState from './ChatEmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { useChatTimelineController } from './hooks/useChatTimelineController';
import { useUserScrollDetector } from './hooks/useUserScrollDetector';
import { useSSEAnchorSuppression } from './hooks/useSSEAnchorSuppression';
import { useChatTurnNavigation } from './hooks/useChatTurnNavigation';
import { useDeviceInfo } from '@/lib/device';
import { usePlanDetection } from '@/hooks/usePlanDetection';
import { cn } from '@/lib/utils';
import {
    collectVisibleSessionIdsForBlockingRequests,
    flattenBlockingRequests,
} from './lib/blockingRequests';

import { useUIStore } from '@/stores/useUIStore';
import { useStreamingStore } from '@/sync/streaming';
import {
    useSessionMessageRecords,
    useSessions,
    useDirectorySync,
    useSessionStatus,
} from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { ActiveSessionContext } from './ActiveSessionContext';
import { ChatViewport } from './ChatViewport';

const EMPTY_PERMISSIONS: import('@/types/permission').PermissionRequest[] = [];
const EMPTY_QUESTIONS: import('@/types/question').QuestionRequest[] = [];
const IDLE_SESSION_STATUS = { type: 'idle' as const };
const SESSION_RESELECTED_EVENT = 'openchamber:session-reselected';
const DEFAULT_RETRY_MESSAGE = 'Quota limit reached. Retrying automatically.';

type HydratingToolSkeletonRow = {
    id: string;
    titleWidth: string;
    detailWidth: string;
};

const HYDRATING_SKELETON_ITEMS: Array<{
    id: number;
    toolRows: HydratingToolSkeletonRow[];
    textWidths: [string, string, string];
}> = [
    {
        id: 1,
        toolRows: [
            { id: 'search', titleWidth: 'w-24', detailWidth: 'w-52' },
            { id: 'read', titleWidth: 'w-20', detailWidth: 'w-36' },
            { id: 'edit', titleWidth: 'w-24', detailWidth: 'w-64' },
        ],
        textWidths: ['w-24', 'w-[92%]', 'w-[78%]'],
    },
    {
        id: 2,
        toolRows: [
            { id: 'read', titleWidth: 'w-20', detailWidth: 'w-40' },
            { id: 'search', titleWidth: 'w-24', detailWidth: 'w-48' },
        ],
        textWidths: ['w-20', 'w-[88%]', 'w-[70%]'],
    },
    {
        id: 3,
        toolRows: [
            { id: 'shell', titleWidth: 'w-28', detailWidth: 'w-44' },
            { id: 'edit', titleWidth: 'w-24', detailWidth: 'w-56' },
        ],
        textWidths: ['w-24', 'w-[84%]', 'w-[64%]'],
    },
];

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
    // UI store
    const isExpandedInput = useUIStore((state) => state.isExpandedInput);
    const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);

    // Sync actions
    const sync = useSync();
    const loadMessages = React.useCallback(
        (id: string) => sync.syncSession(id),
        [sync],
    );
    const loadMoreMessages = React.useCallback(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (id: string, _direction: 'up' | 'down') => sync.loadMore(id),
        [sync],
    );

    // Streaming state
    const streamingMessageId = useStreamingStore(
        React.useCallback(
            (s) => s.streamingMessageIds.get(sessionId) ?? null,
            [sessionId],
        ),
    );
    const activeStreamingPhase = useStreamingStore(
        React.useCallback(
            (s) => {
                if (!streamingMessageId) return null;
                return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
            },
            [streamingMessageId],
        ),
    );

    // Session data
    const hasLoadedSessionMessages = useDirectorySync(
        React.useCallback(
            (state) => state.message[sessionId] !== undefined,
            [sessionId],
        ),
    );
    const sessionMessageRecords = useSessionMessageRecords(sessionId);
    const sessionMessages = sessionMessageRecords;

    // Sessions
    const sessions = useSessions();

    // Plan detection
    usePlanDetection(sessionId);

    // Session status
    const sessionStatusForCurrent = useSessionStatus(sessionId) ?? IDLE_SESSION_STATUS;

    // Permissions & questions
    const allPermissions = useDirectorySync(
        React.useCallback((s) => s.permission ?? {}, []),
    );
    const allQuestions = useDirectorySync(
        React.useCallback((s) => s.question ?? {}, []),
    );

    const permissionsMap = React.useMemo(() => {
        const m = new Map<string, import('@/types/permission').PermissionRequest[]>();
        for (const [k, v] of Object.entries(allPermissions)) m.set(k, v as import('@/types/permission').PermissionRequest[]);
        return m;
    }, [allPermissions]);

    const questionsMap = React.useMemo(() => {
        const m = new Map<string, import('@/types/question').QuestionRequest[]>();
        for (const [k, v] of Object.entries(allQuestions)) m.set(k, v as import('@/types/question').QuestionRequest[]);
        return m;
    }, [allQuestions]);

    const scopedSessionIds = React.useMemo(
        () => collectVisibleSessionIdsForBlockingRequests(
            sessions.map((session) => ({ id: session.id, parentID: session.parentID })),
            sessionId,
        ),
        [sessions, sessionId],
    );

    const sessionPermissions = React.useMemo(() => {
        if (scopedSessionIds.length === 0) return EMPTY_PERMISSIONS;
        return flattenBlockingRequests(permissionsMap, scopedSessionIds);
    }, [permissionsMap, scopedSessionIds]);

    const sessionQuestions = React.useMemo(() => {
        if (scopedSessionIds.length === 0) return EMPTY_QUESTIONS;
        return flattenBlockingRequests(questionsMap, scopedSessionIds);
    }, [questionsMap, scopedSessionIds]);

    const sessionIsWorking = React.useMemo(() => {
        if (!sessionId || sessionPermissions.length > 0 || sessionQuestions.length > 0) {
            return false;
        }

        if (streamingMessageId || activeStreamingPhase) {
            return true;
        }

        const statusType = sessionStatusForCurrent.type ?? 'idle';
        if (statusType === 'busy' || statusType === 'retry') {
            return true;
        }

        const lastMessage = sessionMessages[sessionMessages.length - 1]?.info as Message | undefined;
        return Boolean(
            lastMessage
            && lastMessage.role === 'assistant'
            && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== 'number',
        );
    }, [activeStreamingPhase, sessionId, sessionMessages, sessionPermissions.length, sessionQuestions.length, sessionStatusForCurrent.type, streamingMessageId]);

    const activeRetryStatus = React.useMemo(() => {
        if (!sessionId || sessionStatusForCurrent.type !== 'retry') {
            return null;
        }

        const rawMessage = typeof (sessionStatusForCurrent as { message?: string }).message === 'string'
            ? (((sessionStatusForCurrent as { message?: string }).message) ?? '').trim()
            : '';

        return {
            sessionId,
            message: rawMessage || DEFAULT_RETRY_MESSAGE,
            confirmedAt: (sessionStatusForCurrent as { confirmedAt?: number }).confirmedAt,
        };
    }, [sessionId, sessionStatusForCurrent]);

    const [retryFallbackTimestamp, setRetryFallbackTimestamp] = React.useState<number>(0);
    const retryFallbackSessionRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!activeRetryStatus || typeof activeRetryStatus.confirmedAt === 'number') {
            retryFallbackSessionRef.current = null;
            setRetryFallbackTimestamp(0);
            return;
        }

        if (retryFallbackSessionRef.current !== activeRetryStatus.sessionId) {
            retryFallbackSessionRef.current = activeRetryStatus.sessionId;
            setRetryFallbackTimestamp(Date.now());
        }
    }, [activeRetryStatus]);

    const retryOverlay = React.useMemo(() => {
        if (!activeRetryStatus) {
            return null;
        }

        return {
            ...activeRetryStatus,
            fallbackTimestamp: retryFallbackTimestamp,
        };
    }, [activeRetryStatus, retryFallbackTimestamp]);

    // History metadata
    const historyMeta = React.useMemo(() => {
        return {
            limit: sessionMessages.length,
            complete: !sync.hasMore(sessionId),
            loading: sync.isLoading(sessionId),
        };
    }, [sessionId, sessionMessages.length, sync]);

    const { isMobile } = useDeviceInfo();
    const isDesktopExpandedInput = isExpandedInput && !isMobile;
    const messageListRef = React.useRef<MessageListHandle | null>(null);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    const { userScrolledUp, scrollToBottom, onScroll } = useUserScrollDetector(scrollRef);
    useSSEAnchorSuppression(scrollRef, userScrolledUp, sessionMessages.length);

    const getAnimationHandlers = React.useCallback(
        (): import('@/components/chat/timeline/types').AnimationHandlers => ({
            onChunk: () => {},
            onComplete: () => {},
            onStreamingCandidate: () => {},
            onAnimationStart: () => {},
            onReservationCancelled: () => {},
            onReasoningBlock: () => {},
            onAnimatedHeightChange: () => {},
        }),
        [],
    );

    const handleMessageContentChange = React.useCallback(
        (): void => {},
        [],
    );

    const viewportMessages = sessionMessages;

    const timelineController = useChatTimelineController({
        sessionId,
        messages: viewportMessages,
        historyMeta,
        scrollRef,
        messageListRef,
        loadMoreMessages,
    });
    const { loadEarlier, resumeToBottomInstant } = timelineController;

    const runLatestInstantResume = React.useCallback(async () => {
        await resumeToBottomInstant();
    }, [resumeToBottomInstant]);

    const resumeToLatestInstant = React.useCallback(() => {
        void runLatestInstantResume();
    }, [runLatestInstantResume]);

    React.useEffect(() => {
        if (sessionPermissions.length === 0 && sessionQuestions.length === 0) {
            return;
        }
        handleMessageContentChange();
    }, [handleMessageContentChange, sessionPermissions, sessionQuestions]);

    const handleLoadOlder = React.useCallback(() => {
        void loadEarlier();
    }, [loadEarlier]);

    useChatTurnNavigation({
        sessionId,
        turnIds: timelineController.turnIds,
        activeTurnId: timelineController.activeTurnId,
        scrollToTurn: timelineController.scrollToTurn,
        scrollToMessage: timelineController.scrollToMessage,
        resumeToBottom: timelineController.resumeToBottomInstant,
    });

    React.useEffect(() => {
        if (typeof window === 'undefined' || !sessionId) return;

        const handleSessionReselected = (event: Event) => {
            const customEvent = event as CustomEvent<string>;
            if (customEvent.detail !== sessionId) return;
            void resumeToBottomInstant();
        };

        window.addEventListener(SESSION_RESELECTED_EVENT, handleSessionReselected as EventListener);
        return () => {
            window.removeEventListener(SESSION_RESELECTED_EVENT, handleSessionReselected as EventListener);
        };
    }, [sessionId, resumeToBottomInstant]);

    React.useLayoutEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const updateChatScrollHeight = () => {
            container.style.setProperty('--chat-scroll-height', `${container.clientHeight}px`);
        };

        updateChatScrollHeight();

        let rafId = 0;
        const scheduleUpdate = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                updateChatScrollHeight();
            });
        };

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', scheduleUpdate);
            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', scheduleUpdate);
            };
        }

        const resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(container);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
        };
    }, [sessionId, isDesktopExpandedInput, scrollRef]);

    const lastScrolledSessionRef = React.useRef<string | null>(null);

    const isSessionHydrating =
        Boolean(sessionId)
        && !hasLoadedSessionMessages;

    React.useEffect(() => {
        if (!sessionId) {
            return;
        }

        if (lastScrolledSessionRef.current === sessionId) {
            return;
        }

        const hasHashTarget = typeof window !== 'undefined' && window.location.hash.length > 0;
        if (hasHashTarget) {
            lastScrolledSessionRef.current = sessionId;
            return;
        }

        lastScrolledSessionRef.current = sessionId;

        if (typeof window === 'undefined') {
            resumeToLatestInstant();
            return;
        }

        window.requestAnimationFrame(() => {
            resumeToLatestInstant();
        });
    }, [sessionId, resumeToLatestInstant]);

    React.useEffect(() => {
        if (!sessionId) return;
        if (hasLoadedSessionMessages) return;

        const load = async () => {
            await loadMessages(sessionId).finally(() => {
                const hasHashTarget = typeof window !== 'undefined' && window.location.hash.length > 0;
                const shouldSkipScroll = hasHashTarget;

                if (!shouldSkipScroll) {
                    if (typeof window === 'undefined') {
                        resumeToLatestInstant();
                    } else {
                        window.requestAnimationFrame(() => {
                            resumeToLatestInstant();
                        });
                    }
                }
            });
        };

        void load();
    }, [sessionId, hasLoadedSessionMessages, loadMessages, resumeToLatestInstant]);

    // Notify parent of scroll state changes
    React.useEffect(() => {
        if (isActive && onScrollStateChange) {
            onScrollStateChange({ userScrolledUp, scrollToBottom });
        }
    }, [isActive, onScrollStateChange, userScrolledUp, scrollToBottom]);

    if (isSessionHydrating && sessionMessages.length === 0 && !streamingMessageId) {
        return (
            <ActiveSessionContext.Provider value={{ isActive }}>
                <div
                    className={cn(
                        'relative min-h-0',
                        isDesktopExpandedInput
                            ? 'absolute inset-0 opacity-0 pointer-events-none'
                            : 'flex-1'
                    )}
                    aria-hidden={isDesktopExpandedInput}
                >
                    <div className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-background pt-6">
                        <div className="space-y-4">
                            {HYDRATING_SKELETON_ITEMS.map((item) => (
                                <div key={item.id} className="group w-full">
                                    <div className="chat-message-column">
                                        <div className="space-y-2.5 px-4 py-3">
                                            <div className="space-y-1.5">
                                                {item.toolRows.map((row) => {
                                                    return (
                                                        <div key={`${item.id}-${row.id}`} className="flex items-center gap-2">
                                                            <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0" />
                                                            <Skeleton className={cn('h-4 rounded-md', row.titleWidth)} />
                                                            <Skeleton className={cn('h-4 rounded-md', row.detailWidth)} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="space-y-1.5 pt-1">
                                                <Skeleton className={cn('h-4 rounded-md', item.textWidths[0])} />
                                                <Skeleton className={cn('h-4 rounded-md', item.textWidths[1])} />
                                                <Skeleton className={cn('h-4 rounded-md', item.textWidths[2])} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ActiveSessionContext.Provider>
        );
    }

    if (sessionMessages.length === 0 && !streamingMessageId) {
        return (
            <ActiveSessionContext.Provider value={{ isActive }}>
                <div
                    className={cn(
                        'relative min-h-0',
                        isDesktopExpandedInput
                            ? 'absolute inset-0 opacity-0 pointer-events-none'
                            : 'flex-1'
                    )}
                    aria-hidden={isDesktopExpandedInput}
                >
                    {!isDesktopExpandedInput ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <ChatEmptyState />
                        </div>
                    ) : null}
                </div>
            </ActiveSessionContext.Provider>
        );
    }

    return (
        <ActiveSessionContext.Provider value={{ isActive }}>
            <ChatViewport
                currentSessionId={sessionId}
                isDesktopExpandedInput={isDesktopExpandedInput}
                stickyUserHeader={stickyUserHeader}
                scrollRef={scrollRef}
                messageListRef={messageListRef}
                turnStart={timelineController.turnStart}
                pendingRevealWork={timelineController.pendingRevealWork}
                renderedMessages={timelineController.renderedMessages}
                hasMoreAboveTurns={timelineController.historySignals.hasMoreAboveTurns}
                isLoadingOlder={timelineController.isLoadingOlder}
                sessionIsWorking={sessionIsWorking}
                streamingMessageId={streamingMessageId}
                activeStreamingPhase={activeStreamingPhase}
                retryOverlay={retryOverlay}
                handleMessageContentChange={handleMessageContentChange}
                getAnimationHandlers={getAnimationHandlers}
                handleLoadOlder={handleLoadOlder}
                scrollToBottom={scrollToBottom}
                sessionQuestions={sessionQuestions}
                sessionPermissions={sessionPermissions}
                isProgrammaticFollowActive={false}
                onScroll={onScroll}
            />
        </ActiveSessionContext.Provider>
    );
});

SessionMount.displayName = 'SessionMount';
