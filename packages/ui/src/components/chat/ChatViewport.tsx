import React from 'react';
import type { Message, Part } from '@/lib/opencode/client';

import MessageList, { type MessageListHandle } from './MessageList';
import { PermissionCard } from './permissions/PermissionCard';
import { QuestionCard } from './permissions/QuestionCard';
import { StatusRowContainer } from './status/StatusRowContainer';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import { cn } from '@/lib/utils';
import { useDeviceInfo } from '@/lib/device';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';

export type ChatViewportProps = {
    currentSessionId: string;
    isDesktopExpandedInput: boolean;
    stickyUserHeader: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messageListRef: React.RefObject<MessageListHandle | null>;
    turnStart: number;
    pendingRevealWork: boolean;
    renderedMessages: Array<{ info: Message; parts: Part[] }>;
    hasMoreAboveTurns: boolean;
    isLoadingOlder: boolean;
    sessionIsWorking: boolean;
    streamingMessageId: string | null;
    activeStreamingPhase: import('./message/types').StreamPhase | null;
    retryOverlay: {
        sessionId: string;
        message: string;
        confirmedAt?: number;
        fallbackTimestamp?: number;
    } | null;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    handleLoadOlder: () => void;
    scrollToBottom: (options?: { instant?: boolean; force?: boolean }) => void;
    sessionQuestions: QuestionRequest[];
    sessionPermissions: PermissionRequest[];
    isProgrammaticFollowActive: boolean;
    onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
};

export const ChatViewport = React.memo(({
    currentSessionId,
    isDesktopExpandedInput,
    stickyUserHeader,
    scrollRef,
    messageListRef,
    turnStart,
    pendingRevealWork,
    renderedMessages,
    hasMoreAboveTurns,
    isLoadingOlder,
    sessionIsWorking,
    streamingMessageId,
    activeStreamingPhase,
    retryOverlay,
    handleMessageContentChange,
    getAnimationHandlers,
    handleLoadOlder,
    scrollToBottom,
    sessionQuestions,
    sessionPermissions,
    isProgrammaticFollowActive,
    onScroll,
}: ChatViewportProps) => {
    const { isMobile } = useDeviceInfo();
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
                    reversed
                    className="flex flex-col-reverse absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
                    ref={scrollRef}
                    onScroll={onScroll}
                    observeMutations={false}
                    hideTopShadow={isMobile && stickyUserHeader}
                    data-scroll-shadow="true"
                    data-scrollbar="chat"
                >
                    <MessageList
                        ref={messageListRef}
                        sessionKey={currentSessionId}
                        turnStart={turnStart}
                        disableStaging={pendingRevealWork}
                        messages={renderedMessages}
                        sessionIsWorking={sessionIsWorking}
                        activeStreamingMessageId={streamingMessageId}
                        activeStreamingPhase={activeStreamingPhase}
                        retryOverlay={retryOverlay}
                        onMessageContentChange={handleMessageContentChange}
                        getAnimationHandlers={getAnimationHandlers}
                        hasMoreAbove={hasMoreAboveTurns}
                        isLoadingOlder={isLoadingOlder}
                        onLoadOlder={handleLoadOlder}
                        scrollToBottom={scrollToBottom}
                        scrollRef={scrollRef}
                    />
                    {(sessionQuestions.length > 0 || sessionPermissions.length > 0) && (
                        <div>
                            {sessionQuestions.map((question) => (
                                <QuestionCard key={question.id} question={question} />
                            ))}
                            {sessionPermissions.map((permission) => (
                                <PermissionCard key={permission.id} permission={permission} />
                            ))}
                        </div>
                    )}

                    <div className="mb-3">
                        <StatusRowContainer />
                    </div>
                </ScrollShadow>
                <OverlayScrollbar containerRef={scrollRef} suppressVisibility={isProgrammaticFollowActive} userIntentOnly observeMutations={false} />
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.currentSessionId === next.currentSessionId
        && prev.isDesktopExpandedInput === next.isDesktopExpandedInput
        && prev.stickyUserHeader === next.stickyUserHeader
        && prev.scrollRef === next.scrollRef
        && prev.messageListRef === next.messageListRef
        && prev.turnStart === next.turnStart
        && prev.pendingRevealWork === next.pendingRevealWork
        && prev.renderedMessages === next.renderedMessages
        && prev.hasMoreAboveTurns === next.hasMoreAboveTurns
        && prev.isLoadingOlder === next.isLoadingOlder
        && prev.sessionIsWorking === next.sessionIsWorking
        && prev.streamingMessageId === next.streamingMessageId
        && prev.activeStreamingPhase === next.activeStreamingPhase
        && prev.retryOverlay === next.retryOverlay
        && prev.handleMessageContentChange === next.handleMessageContentChange
        && prev.getAnimationHandlers === next.getAnimationHandlers
        && prev.handleLoadOlder === next.handleLoadOlder
        && prev.scrollToBottom === next.scrollToBottom
        && prev.sessionQuestions === next.sessionQuestions
        && prev.sessionPermissions === next.sessionPermissions
        && prev.isProgrammaticFollowActive === next.isProgrammaticFollowActive
        && prev.onScroll === next.onScroll;
});

ChatViewport.displayName = 'ChatViewport';
