import React from 'react';
import type { Session } from '@/lib/opencode/client';
import { MessageFreshnessDetector } from '@/lib/messages/messageFreshness';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import { getAllSyncSessions } from '@/sync/sync-refs';

type ActiveScrollState = {
    userScrolledUp: boolean;
    scrollToBottom: () => void;
};

const EMPTY_SCROLL_STATE: ActiveScrollState = {
    userScrolledUp: false,
    scrollToBottom: () => {},
};

export type ChatSessionShellState = {
    currentSessionId: string | null;
    draftOpen: boolean;
    parentSession: Session | null;
    activeScrollState: ActiveScrollState;
    actions: {
        returnToParentSession: () => void;
        setActiveScrollState: React.Dispatch<React.SetStateAction<ActiveScrollState>>;
    };
};

export const useChatSessionShell = (): ChatSessionShellState => {
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
    const setCurrentSession = useSessionUIStore((s) => s.setCurrentSession);
    const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);
    const draftOpen = Boolean(newSessionDraft?.open);
    const [activeScrollState, setActiveScrollState] = React.useState<ActiveScrollState>(EMPTY_SCROLL_STATE);
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

    const returnToParentSession = React.useCallback(() => {
        if (!parentSession) return;
        const parentDirectory = (parentSession as Session & { directory?: string | null }).directory ?? null;
        setCurrentSession(parentSession.id, parentDirectory);
    }, [parentSession, setCurrentSession]);

    React.useEffect(() => {
        if (!currentSessionId && !draftOpen) {
            openNewSessionDraft();
        }
    }, [currentSessionId, draftOpen, openNewSessionDraft]);

    React.useEffect(() => {
        if (!currentSessionId) return;
        setActiveScrollState(EMPTY_SCROLL_STATE);
        const hasHashTarget = typeof window !== 'undefined' && window.location.hash.length > 0;
        if (!hasHashTarget) {
            MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
        }
    }, [currentSessionId]);

    return {
        currentSessionId,
        draftOpen,
        parentSession,
        activeScrollState,
        actions: {
            returnToParentSession,
            setActiveScrollState,
        },
    };
};
