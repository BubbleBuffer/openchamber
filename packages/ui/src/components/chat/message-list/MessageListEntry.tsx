import React from 'react';
import type { ChatMessageEntry, TurnRecord } from '../lib/turns/types';
import type { StreamPhase } from '../message/types';
import type { AnimationHandlers, ContentChangeReason } from '../timeline/types';
import { TurnBlock, type TurnUiState } from './TurnBlock';
import { UngroupedMessageRow } from './UngroupedMessageRow';

export type RenderEntry =
    | {
        kind: 'ungrouped';
        key: string;
        message: ChatMessageEntry;
        previousMessage?: ChatMessageEntry;
        nextMessage?: ChatMessageEntry;
    }
    | { kind: 'turn'; key: string; turn: TurnRecord; isLastTurn: boolean };

interface MessageListEntryProps {
    entry: RenderEntry;
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    stickyUserHeader?: boolean;
    sessionIsWorking: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: (turnId: string) => void;
    chatRenderMode: 'sorted' | 'live';
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
}

export const MessageListEntry: React.FC<MessageListEntryProps> = ({
    entry,
    onMessageContentChange,
    getAnimationHandlers,
    scrollToBottom,
    stickyUserHeader,
    sessionIsWorking,
    defaultActivityExpanded,
    turnUiStates,
    onToggleTurnGroup,
    chatRenderMode,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
}) => {
    if (entry.kind === 'ungrouped') {
        return (
            <UngroupedMessageRow
                message={entry.message}
                previousMessage={entry.previousMessage}
                nextMessage={entry.nextMessage}
                onMessageContentChange={onMessageContentChange}
                getAnimationHandlers={getAnimationHandlers}
                scrollToBottom={scrollToBottom}
                shouldAnimateUserMessage={shouldAnimateUserMessage}
                onUserAnimationConsumed={onUserAnimationConsumed}
                activeStreamingMessageId={activeStreamingMessageId}
                activeStreamingPhase={activeStreamingPhase}
            />
        );
    }

    return (
        <TurnBlock
            turn={entry.turn}
            isLastTurn={entry.isLastTurn}
            sessionIsWorking={sessionIsWorking}
            defaultActivityExpanded={defaultActivityExpanded}
            turnUiStates={turnUiStates}
            onToggleTurnGroup={onToggleTurnGroup}
            chatRenderMode={chatRenderMode}
            shouldAnimateUserMessage={shouldAnimateUserMessage}
            onUserAnimationConsumed={onUserAnimationConsumed}
            activeStreamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            onMessageContentChange={onMessageContentChange}
            getAnimationHandlers={getAnimationHandlers}
            scrollToBottom={scrollToBottom}
            stickyUserHeader={stickyUserHeader}
        />
    );
};

MessageListEntry.displayName = 'MessageListEntry';

export const StreamingTailContent: React.FC<{
    entry: RenderEntry;
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    stickyUserHeader: boolean;
    sessionIsWorking: boolean;
    defaultActivityExpanded: boolean;
    turnUiStates: Map<string, TurnUiState>;
    onToggleTurnGroup: (turnId: string) => void;
    chatRenderMode: 'sorted' | 'live';
    shouldAnimateUserMessage: (message: ChatMessageEntry) => boolean;
    onUserAnimationConsumed: (messageId: string) => void;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
}> = ({
    entry,
    onMessageContentChange,
    getAnimationHandlers,
    scrollToBottom,
    stickyUserHeader,
    sessionIsWorking,
    defaultActivityExpanded,
    turnUiStates,
    onToggleTurnGroup,
    chatRenderMode,
    shouldAnimateUserMessage,
    onUserAnimationConsumed,
    activeStreamingMessageId,
    activeStreamingPhase,
}) => {
    return (
        <MessageListEntry
            entry={entry}
            onMessageContentChange={onMessageContentChange}
            getAnimationHandlers={getAnimationHandlers}
            scrollToBottom={scrollToBottom}
            stickyUserHeader={stickyUserHeader}
            sessionIsWorking={sessionIsWorking}
            defaultActivityExpanded={defaultActivityExpanded}
            turnUiStates={turnUiStates}
            onToggleTurnGroup={onToggleTurnGroup}
            chatRenderMode={chatRenderMode}
            shouldAnimateUserMessage={shouldAnimateUserMessage}
            onUserAnimationConsumed={onUserAnimationConsumed}
            activeStreamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
        />
    );
};

StreamingTailContent.displayName = 'StreamingTailContent';
