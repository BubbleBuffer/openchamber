import React from 'react';
import type { ChatActivityState, ChatInterruptionsState, ChatMessagesState } from './state';

import VirtualizedMessageList, { type MessageListHandle } from './VirtualizedMessageList';
import { PermissionCard } from './permissions/PermissionCard';
import { QuestionCard } from './permissions/QuestionCard';
import { StatusRowContainer } from './status/StatusRowContainer';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import { cn } from '@/lib/utils';
import { useDeviceInfo } from '@/lib/device';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';

export type ChatViewportProps = {
    messages: ChatMessagesState;
    activity: ChatActivityState;
    interruptions: ChatInterruptionsState;
    currentSessionId: string;
    isDesktopExpandedInput: boolean;
    stickyUserHeader: boolean;
    activeStreamingPhase: import('./message/types').StreamPhase | null;
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

export const ChatViewport = React.memo(({
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
}: ChatViewportProps) => {
    const { isMobile } = useDeviceInfo();
    const [isAtBottom, setIsAtBottom] = React.useState(true);

    const handleAtBottomChange = React.useCallback((atBottom: boolean) => {
        setIsAtBottom(atBottom);
    }, []);

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
            <div className="absolute inset-0">
                <ScrollShadow
                    className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
                    ref={scrollRef}
                    observeMutations={false}
                    hideTopShadow={isMobile && stickyUserHeader}
                    data-scroll-shadow="true"
                    data-scrollbar="chat"
                >
                    <VirtualizedMessageList
                        ref={messageListRef}
                        sessionKey={currentSessionId}
                        turnStart={turnStart}
                        disableStaging={pendingRevealWork}
                        messages={messages.renderedMessages}
                        sessionIsWorking={activity.isWorking}
                        activeStreamingMessageId={messages.streamingMessageId ?? null}
                        activeStreamingPhase={activeStreamingPhase}
                        retryOverlay={messages.retryOverlay}
                        onMessageContentChange={handleMessageContentChange}
                        getAnimationHandlers={getAnimationHandlers}
                        hasMoreAbove={hasMoreAboveTurns}
                        isLoadingOlder={isLoadingOlder}
                        onLoadOlder={handleLoadOlder}
                        scrollRef={scrollRef}
                        onScrollStateChange={onScrollStateChange}
                        onAtBottomChange={handleAtBottomChange}
                    />
                    {(interruptions.questions.length > 0 || interruptions.permissions.length > 0) && (
                        <div>
                            {interruptions.questions.map((question) => (
                                <QuestionCard key={question.id} question={question} />
                            ))}
                            {interruptions.permissions.map((permission) => (
                                <PermissionCard key={permission.id} permission={permission} />
                            ))}
                        </div>
                    )}

                    <div className="mb-3">
                        <StatusRowContainer />
                    </div>

                    <div className="h-10 shrink-0" />
                </ScrollShadow>
                <OverlayScrollbar containerRef={scrollRef} suppressVisibility={isAtBottom} userIntentOnly observeMutations={false} />
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.messages === next.messages
        && prev.activity === next.activity
        && prev.interruptions === next.interruptions
        && prev.currentSessionId === next.currentSessionId
        && prev.isDesktopExpandedInput === next.isDesktopExpandedInput
        && prev.stickyUserHeader === next.stickyUserHeader
        && prev.scrollRef === next.scrollRef
        && prev.messageListRef === next.messageListRef
        && prev.turnStart === next.turnStart
        && prev.pendingRevealWork === next.pendingRevealWork
        && prev.hasMoreAboveTurns === next.hasMoreAboveTurns
        && prev.isLoadingOlder === next.isLoadingOlder
        && prev.handleMessageContentChange === next.handleMessageContentChange
        && prev.getAnimationHandlers === next.getAnimationHandlers
        && prev.handleLoadOlder === next.handleLoadOlder;
});
