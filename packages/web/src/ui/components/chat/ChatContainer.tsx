import React from 'react';
import { RiArrowLeftLine } from '@remixicon/react';

import { ChatInput } from './ChatInput';
import ChatEmptyState from './ChatEmptyState';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { SessionMount } from './SessionMount';
import { useChatSessionShell } from './hooks/useChatSessionShell';

export const ChatContainer: React.FC = () => {
    const {
        currentSessionId,
        draftOpen,
        mountedSessions,
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

    if (!currentSessionId && !draftOpen) {
        return (
            <div className="relative flex flex-col h-full bg-background">
                {returnToParentButton}
                <ChatEmptyState />
            </div>
        );
    }

    if (!currentSessionId && draftOpen) {
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

    // Active session — render mount pool
    return (
        <div className="relative flex flex-col h-full bg-background">
            {returnToParentButton}
            <div className="relative flex-1 min-h-0">
                {Array.from(mountedSessions.values()).map((mountState) => (
                    <div
                        key={mountState.id}
                        className={cn(
                            'absolute inset-0 flex flex-col transition-opacity duration-150',
                            mountState.isActive ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
                        )}
                        aria-hidden={!mountState.isActive}
                    >
                        <SessionMount
                            sessionId={mountState.id}
                            isActive={mountState.isActive}
                            onScrollStateChange={mountState.isActive ? actions.setActiveScrollState : undefined}
                        />
                    </div>
                ))}
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
