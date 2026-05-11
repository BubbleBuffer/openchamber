import React from 'react';
import { RiArrowLeftLine } from '@remixicon/react';
import type { Session } from '@/lib/opencode/client';

import { ChatInput } from './ChatInput';
import { useUIStore } from '@/stores/useUIStore';
import ChatEmptyState from './ChatEmptyState';
import ScrollToBottomButton from './components/ScrollToBottomButton';
import { useDeviceInfo } from '@/lib/device';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import { getAllSyncSessions } from '@/sync/sync-refs';
import { SessionMount } from './SessionMount';

export const ChatContainer: React.FC = () => {
    // Session UI state
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
    const setCurrentSession = useSessionUIStore((s) => s.setCurrentSession);
    const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);

    // UI store
    const isExpandedInput = useUIStore((state) => state.isExpandedInput);

    const { isMobile } = useDeviceInfo();
    const draftOpen = Boolean(newSessionDraft?.open);
    const isDesktopExpandedInput = isExpandedInput && !isMobile;

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

    if (!currentSessionId && !draftOpen) {
        return (
            <div className="flex flex-col h-full bg-background">
                <ChatEmptyState />
            </div>
        );
    }

    if (!currentSessionId && draftOpen) {
        return (
            <div className="relative flex flex-col h-full bg-background transform-gpu">
                {!isDesktopExpandedInput ? (
                <div className="flex-1 flex items-center justify-center">
                    <ChatEmptyState />
                </div>
                ) : null}
                <div
                    className={cn(
                        'relative z-10',
                        isDesktopExpandedInput
                            ? 'flex-1 min-h-0 bg-background'
                            : 'bg-background'
                    )}
                >
                    <ChatInput scrollToBottom={() => {}} />
                </div>
            </div>
        );
    }

    if (!currentSessionId) {
        return null;
    }

    return (
        <div className="relative flex flex-col h-full bg-background">
            {returnToParentButton}
            <SessionMount sessionId={currentSessionId} isActive={true} />
            <div
                className={cn(
                    'relative z-10',
                    isDesktopExpandedInput
                        ? 'flex-1 min-h-0 bg-background'
                        : 'bg-background',
                    isMobile && 'pb-[env(safe-area-inset-bottom,0px)]'
                )}
            >
                <ScrollToBottomButton visible={false} onClick={() => {}} />
                <ChatInput scrollToBottom={() => {}} />
            </div>
        </div>
    );
};
