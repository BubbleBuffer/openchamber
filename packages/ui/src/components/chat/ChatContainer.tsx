import React from 'react';
import { RiArrowLeftLine } from '@remixicon/react';
import type { Session } from '@/lib/opencode/client';

import { ChatInput } from './ChatInput';
import ChatEmptyState from './ChatEmptyState';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import { getAllSyncSessions } from '@/sync/sync-refs';
import { SessionMount } from './SessionMount';
import { useSessionMountPool } from './hooks/useSessionMountPool';
import { MessageFreshnessDetector } from '@/lib/messages/messageFreshness';

export const ChatContainer: React.FC = () => {
    // Session UI state
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
    const setCurrentSession = useSessionUIStore((s) => s.setCurrentSession);
    const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);

    const draftOpen = Boolean(newSessionDraft?.open);

    // Mount pool
    const { mountedSessions, activateSession } = useSessionMountPool();

    // Active session scroll state
    const [activeScrollState, setActiveScrollState] = React.useState<{
        userScrolledUp: boolean;
        scrollToBottom: () => void;
    }>({
        userScrolledUp: false,
        scrollToBottom: () => {},
    });

    // Sessions
    const sessions = useSessions();

    const parentSession = React.useMemo(() => {
        if (!currentSessionId) return null;
        const current = sessions.find((session) => session.id === currentSessionId);
        const parentID = current?.parentID;
        if (!parentID) return null;
        return sessions.find((session) => session.id === parentID)
            ?? getAllSyncSessions().find((session) => session.id === parentID)
            ?? null;
    }, [currentSessionId, sessions]);

    const handleReturnToParentSession = React.useCallback(() => {
        if (!parentSession) return;
        const parentDirectory = (parentSession as Session & { directory?: string | null }).directory ?? null;
        setCurrentSession(parentSession.id, parentDirectory);
    }, [parentSession, setCurrentSession]);

    const returnToParentButton = parentSession ? (
        <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleReturnToParentSession}
            className="absolute left-3 top-3 z-20 !font-normal bg-[var(--surface-background)]/95"
            aria-label="Return to parent session"
            title={parentSession.title?.trim() ? `Return to: ${parentSession.title}` : 'Return to parent session'}
        >
            <RiArrowLeftLine className="h-4 w-4" />
            Parent
        </Button>
    ) : null;

    React.useEffect(() => {
        if (!currentSessionId && !draftOpen) {
            openNewSessionDraft();
        }
    }, [currentSessionId, draftOpen, openNewSessionDraft]);

    // Session switch: activate in mount pool and record freshness
    React.useEffect(() => {
        if (!currentSessionId) return;
        activateSession(currentSessionId);
        const hasHashTarget = typeof window !== 'undefined' && window.location.hash.length > 0;
        if (!hasHashTarget) {
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
        }
    }, [currentSessionId, activateSession]);

    // No session selected
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
                            onScrollStateChange={mountState.isActive ? setActiveScrollState : undefined}
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
