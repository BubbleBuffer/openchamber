import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { StreamPhase } from './message/types';
import type { MessageListHandle } from './VirtualizedMessageList';
import type { ChatActivityState, ChatInterruptionsState, ChatMessagesState, ChatSessionState } from './state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import ChatEmptyState from './ChatEmptyState';
import { ChatViewport } from './ChatViewport';

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

type ChatSessionViewProps = {
    session: ChatSessionState;
    messages: ChatMessagesState;
    activity: ChatActivityState;
    interruptions: ChatInterruptionsState;
    currentSessionId: string;
    isDesktopExpandedInput: boolean;
    stickyUserHeader: boolean;
    activeStreamingPhase: StreamPhase | null;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messageListRef: React.RefObject<MessageListHandle | null>;
    turnStart: number;
    pendingRevealWork: boolean;
    hasMoreAboveTurns: boolean;
    isLoadingOlder: boolean;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    handleLoadOlder: () => void;
    onScrollStateChange?: (state: { userScrolledUp: boolean; scrollToBottom: () => void }) => void;
};

export const ChatSessionView = React.memo(({
    session,
    messages,
    activity,
    interruptions,
    currentSessionId,
    isDesktopExpandedInput,
    stickyUserHeader,
    activeStreamingPhase,
    scrollRef,
    messageListRef,
    turnStart,
    pendingRevealWork,
    hasMoreAboveTurns,
    isLoadingOlder,
    handleMessageContentChange,
    getAnimationHandlers,
    handleLoadOlder,
    onScrollStateChange,
}: ChatSessionViewProps) => {
    const showLoading = !session.loaded && activeStreamingPhase === null && !messages.streamingMessageId;
    const showEmpty = session.loaded && messages.messageCount === 0 && !messages.streamingMessageId;

    if (showLoading) {
        return (
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
                                            {item.toolRows.map((row) => (
                                                <div key={`${item.id}-${row.id}`} className="flex items-center gap-2">
                                                    <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0" />
                                                    <Skeleton className={cn('h-4 rounded-md', row.titleWidth)} />
                                                    <Skeleton className={cn('h-4 rounded-md', row.detailWidth)} />
                                                </div>
                                            ))}
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
        );
    }

    if (showEmpty) {
        return (
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
        );
    }

    return (
        <ChatViewport
            messages={messages}
            activity={activity}
            interruptions={interruptions}
            currentSessionId={currentSessionId}
            isDesktopExpandedInput={isDesktopExpandedInput}
            stickyUserHeader={stickyUserHeader}
            activeStreamingPhase={activeStreamingPhase}
            scrollRef={scrollRef}
            messageListRef={messageListRef}
            turnStart={turnStart}
            pendingRevealWork={pendingRevealWork}
            hasMoreAboveTurns={hasMoreAboveTurns}
            isLoadingOlder={isLoadingOlder}
            handleMessageContentChange={handleMessageContentChange}
            getAnimationHandlers={getAnimationHandlers}
            handleLoadOlder={handleLoadOlder}
            onScrollStateChange={onScrollStateChange}
        />
    );
});

ChatSessionView.displayName = 'ChatSessionView';
