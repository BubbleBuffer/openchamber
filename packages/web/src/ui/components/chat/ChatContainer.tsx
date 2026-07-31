import React from 'react';
import { RiArrowLeftLine } from '@remixicon/react';

import { ChatInput } from './ChatInput';
import ChatEmptyState from './ChatEmptyState';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { Button } from '@/components/ui/button';

import { SessionMount } from './SessionMount';
import { useChatSessionShell } from './hooks/useChatSessionShell';

export const ChatContainer: React.FC = () => {
    const {
        currentSessionId,
        draftOpen,
        parentSession,
        activeScrollState,
        actions,
    } = useChatSessionShell();

    const returnToParentButton = parentSession ? (
        <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={actions.returnToParentSession}
            className="absolute left-3 top-3 z-20 !font-normal bg-[var(--surface-background)]/95"
            aria-label="Return to parent session"
            title={parentSession.title?.trim() ? `Return to: ${parentSession.title}` : 'Return to parent session'}
        >
            <RiArrowLeftLine className="h-4 w-4" />
            Parent
        </Button>
    ) : null;

    if (!currentSessionId) {
        if (!draftOpen) {
            return (
                <div className="relative flex flex-col h-full bg-background">
                    {returnToParentButton}
                    <ChatEmptyState />
                </div>
            );
        }

        return (
            <div className="relative flex flex-col h-full bg-background">
                {returnToParentButton}
                <div className="flex-1" />
                <div className="relative z-10 bg-background">
                    <ChatInput scrollToBottom={() => {}} />
                </div>
            </div>
        );
    }

    // Keep cached session data, not hidden React trees. A keyed active mount
    // gives every session one lifecycle owner and prevents background chats
    // from retaining observers, projections, and broad store subscriptions.
    return (
        <div className="relative flex flex-col h-full bg-background">
            {returnToParentButton}
            <div className="relative flex-1 min-h-0">
                <div className="absolute inset-0 flex flex-col">
                    <SessionMount
                        key={currentSessionId}
                        sessionId={currentSessionId}
                        isActive
                        onScrollStateChange={actions.setActiveScrollState}
                    />
                </div>
            </div>
            <div className="relative z-10 bg-background">
                <ScrollToBottomButton
                    visible={activeScrollState.userScrolledUp}
                    onClick={() => activeScrollState.scrollToBottom()}
                />
                <ChatInput scrollToBottom={() => activeScrollState.scrollToBottom()} />
            </div>
        </div>
    );
};
