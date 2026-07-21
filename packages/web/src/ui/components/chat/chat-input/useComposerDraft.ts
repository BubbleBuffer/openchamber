import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import {
    getDraftKey,
    getStoredDraft,
    loadConfirmedMentions,
    saveConfirmedMentions,
    saveStoredDraft,
} from './draftStorage';

const CHAT_DRAFT_PERSIST_DEBOUNCE_MS = 500;

type UseComposerDraftOptions = {
    currentSessionId: string | null;
    persistChatDraft: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    onSessionChanged?: () => void;
};

type ComposerDraftState = {
    message: string;
    setMessage: React.Dispatch<React.SetStateAction<string>>;
    messageRef: React.MutableRefObject<string>;
    confirmedMentionsRef: React.MutableRefObject<Set<string>>;
    isConfirmedFilePath: (text: string) => boolean;
    clearSubmittedDraft: (sessionId: string | null) => void;
};

export const useComposerDraft = ({
    currentSessionId,
    persistChatDraft,
    textareaRef,
    onSessionChanged,
}: UseComposerDraftOptions): ComposerDraftState => {
    const initialDraftRef = React.useRef<string | null>(null);
    const initialSessionIdRef = React.useRef<string | null>(null);
    const [message, setMessage] = React.useState(() => {
        const sessionId = useSessionUIStore.getState().currentSessionId;
        initialSessionIdRef.current = sessionId;
        const draft = getStoredDraft(sessionId);
        if (draft) {
            initialDraftRef.current = draft;
        }
        return draft;
    });
    const messageRef = React.useRef(message);
    const confirmedMentionsRef = React.useRef<Set<string>>(loadConfirmedMentions(initialSessionIdRef.current));
    const draftPersistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipNextDraftPersistRef = React.useRef(false);
    const lastPersistedDraftRef = React.useRef<Map<string, string>>(new Map());
    const currentSessionIdForDraftRef = React.useRef<string | null>(null);
    const prevSessionIdRef = React.useRef(currentSessionId);
    const hasHandledInitialDraftRef = React.useRef(false);

    const isConfirmedFilePath = React.useCallback((text: string): boolean => (
        text.includes('/') || text.includes('\\') || text.includes('.') || confirmedMentionsRef.current.has(text)
    ), []);

    React.useEffect(() => {
        messageRef.current = message;
    }, [message, messageRef]);

    React.useEffect(() => {
        currentSessionIdForDraftRef.current = currentSessionId;
    }, [currentSessionId]);

    const persistDraftImmediately = React.useCallback((sessionId: string | null, draft: string) => {
        const key = getDraftKey(sessionId);
        const lastPersisted = lastPersistedDraftRef.current.get(key);
        if (lastPersisted === draft) {
            return;
        }

        saveStoredDraft(sessionId, draft);
        const activeMentions = new Set<string>();
        for (const mention of confirmedMentionsRef.current) {
            if (draft.includes(`@${mention}`)) {
                activeMentions.add(mention);
            }
        }
        confirmedMentionsRef.current = activeMentions;
        saveConfirmedMentions(sessionId, activeMentions);
        lastPersistedDraftRef.current.set(key, draft);
    }, []);

    const clearPendingDraftPersist = React.useCallback(() => {
        if (!draftPersistTimerRef.current) {
            return;
        }
        clearTimeout(draftPersistTimerRef.current);
        draftPersistTimerRef.current = null;
    }, []);

    React.useEffect(() => {
        if (hasHandledInitialDraftRef.current) {
            return;
        }
        hasHandledInitialDraftRef.current = true;

        const draft = initialDraftRef.current;
        if (!draft) {
            return;
        }

        if (!persistChatDraft) {
            setMessage('');
            saveStoredDraft(initialSessionIdRef.current, '');
            return;
        }

        requestAnimationFrame(() => {
            textareaRef.current?.select();
        });
    }, [persistChatDraft, textareaRef]);

    React.useEffect(() => {
        if (prevSessionIdRef.current === currentSessionId) {
            return;
        }

        const oldSessionId = prevSessionIdRef.current;
        prevSessionIdRef.current = currentSessionId;
        onSessionChanged?.();
        clearPendingDraftPersist();
        skipNextDraftPersistRef.current = true;

        if (persistChatDraft) {
            persistDraftImmediately(oldSessionId, messageRef.current);
            const newDraft = getStoredDraft(currentSessionId);
            setMessage(newDraft);
            confirmedMentionsRef.current = loadConfirmedMentions(currentSessionId);
            if (newDraft) {
                requestAnimationFrame(() => {
                    textareaRef.current?.select();
                });
            }
            return;
        }

        setMessage('');
        confirmedMentionsRef.current = new Set();
    }, [clearPendingDraftPersist, currentSessionId, messageRef, onSessionChanged, persistChatDraft, persistDraftImmediately, textareaRef]);

    React.useEffect(() => {
        if (!persistChatDraft) {
            clearPendingDraftPersist();
            persistDraftImmediately(currentSessionId, '');
            return;
        }

        if (skipNextDraftPersistRef.current) {
            skipNextDraftPersistRef.current = false;
            return;
        }

        clearPendingDraftPersist();
        const draftSnapshot = message;
        const sessionSnapshot = currentSessionId;
        draftPersistTimerRef.current = setTimeout(() => {
            draftPersistTimerRef.current = null;
            persistDraftImmediately(sessionSnapshot, draftSnapshot);
        }, CHAT_DRAFT_PERSIST_DEBOUNCE_MS);

        return () => {
            clearPendingDraftPersist();
        };
    }, [clearPendingDraftPersist, currentSessionId, message, persistChatDraft, persistDraftImmediately]);

    React.useEffect(() => {
        return () => {
            clearPendingDraftPersist();
            if (persistChatDraft) {
                persistDraftImmediately(currentSessionIdForDraftRef.current, messageRef.current);
            }
        };
    }, [clearPendingDraftPersist, messageRef, persistChatDraft, persistDraftImmediately]);

    const clearSubmittedDraft = React.useCallback((sessionId: string | null) => {
        confirmedMentionsRef.current.clear();
        saveStoredDraft(sessionId, '');
        saveConfirmedMentions(sessionId, confirmedMentionsRef.current);
    }, []);

    return {
        message,
        setMessage,
        messageRef,
        confirmedMentionsRef,
        isConfirmedFilePath,
        clearSubmittedDraft,
    };
};
