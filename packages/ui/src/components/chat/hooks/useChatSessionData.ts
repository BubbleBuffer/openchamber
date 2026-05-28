import React from 'react';
import type { Message } from '@/lib/opencode/client';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { StreamPhase } from '../message/types';
import type { ChatMessageEntry } from '../lib/turns/types';
import {
    collectVisibleSessionIdsForBlockingRequests,
    flattenBlockingRequests,
} from '../lib/blockingRequests';
import { useStreamingStore } from '@/sync/streaming';
import {
    useDirectoryStore,
    useDirectorySync,
    useSessionMessageRecords,
    useSessions,
    useSessionStatus,
} from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { usePlanDetection } from '@/hooks/usePlanDetection';

const EMPTY_PERMISSIONS: PermissionRequest[] = [];
const EMPTY_QUESTIONS: QuestionRequest[] = [];
const IDLE_SESSION_STATUS = { type: 'idle' as const };
const DEFAULT_RETRY_MESSAGE = 'Quota limit reached. Retrying automatically.';

type BlockingRequestsSnapshot = {
    permissions: PermissionRequest[];
    questions: QuestionRequest[];
};

export type ChatSessionData = {
    messages: ChatMessageEntry[];
    loaded: boolean;
    streamingMessageId: string | null;
    streamingPhase: StreamPhase | null;
    status: typeof IDLE_SESSION_STATUS | NonNullable<ReturnType<typeof useSessionStatus>>;
    blockingRequests: BlockingRequestsSnapshot;
    isWorking: boolean;
    retryOverlay: {
        sessionId: string;
        message: string;
        confirmedAt?: number;
        fallbackTimestamp: number;
    } | null;
    historyMeta: {
        limit: number;
        complete: boolean;
        loading: boolean;
    };
};

const sameRequestList = <T extends { id: string }>(a: T[], b: T[]): boolean => {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
        if (a[index] !== b[index]) return false;
    }
    return true;
};

const useScopedBlockingRequests = (sessionIds: string[]): BlockingRequestsSnapshot => {
    const store = useDirectoryStore();
    const snapshotRef = React.useRef<BlockingRequestsSnapshot>({
        permissions: EMPTY_PERMISSIONS,
        questions: EMPTY_QUESTIONS,
    });

    const getSnapshot = React.useCallback(() => {
        if (sessionIds.length === 0) {
            snapshotRef.current = {
                permissions: EMPTY_PERMISSIONS,
                questions: EMPTY_QUESTIONS,
            };
            return snapshotRef.current;
        }

        const state = store.getState();
        const permissionsMap = new Map<string, PermissionRequest[]>();
        const questionsMap = new Map<string, QuestionRequest[]>();
        for (const sessionId of sessionIds) {
            permissionsMap.set(sessionId, state.permission[sessionId] ?? EMPTY_PERMISSIONS);
            questionsMap.set(sessionId, state.question[sessionId] ?? EMPTY_QUESTIONS);
        }

        const permissions = flattenBlockingRequests(permissionsMap, sessionIds);
        const questions = flattenBlockingRequests(questionsMap, sessionIds);
        const previous = snapshotRef.current;
        if (sameRequestList(previous.permissions, permissions) && sameRequestList(previous.questions, questions)) {
            return previous;
        }

        snapshotRef.current = { permissions, questions };
        return snapshotRef.current;
    }, [sessionIds, store]);

    return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
};

export const useChatSessionData = (sessionId: string): ChatSessionData => {
    const sync = useSync();
    const streamingMessageId = useStreamingStore(
        React.useCallback(
            (s) => s.streamingMessageIds.get(sessionId) ?? null,
            [sessionId],
        ),
    );
    const streamingPhase = useStreamingStore(
        React.useCallback(
            (s) => {
                if (!streamingMessageId) return null;
                return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
            },
            [streamingMessageId],
        ),
    );

    const loaded = useDirectorySync(
        React.useCallback(
            (state) => state.message[sessionId] !== undefined,
            [sessionId],
        ),
    );
    const messages = useSessionMessageRecords(sessionId);
    const sessions = useSessions();
    const status = useSessionStatus(sessionId) ?? IDLE_SESSION_STATUS;

    usePlanDetection(sessionId);

    const scopedSessionIds = React.useMemo(
        () => collectVisibleSessionIdsForBlockingRequests(
            sessions.map((session) => ({ id: session.id, parentID: session.parentID })),
            sessionId,
        ),
        [sessions, sessionId],
    );
    const blockingRequests = useScopedBlockingRequests(scopedSessionIds);
    const { permissions, questions } = blockingRequests;

    const isWorking = React.useMemo(() => {
        if (!sessionId || permissions.length > 0 || questions.length > 0) {
            return false;
        }

        if (streamingMessageId || streamingPhase) {
            return true;
        }

        const statusType = status.type ?? 'idle';
        if (statusType === 'busy' || statusType === 'retry') {
            return true;
        }

        const lastMessage = messages[messages.length - 1]?.info as Message | undefined;
        return Boolean(
            lastMessage
            && lastMessage.role === 'assistant'
            && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== 'number',
        );
    }, [messages, permissions.length, questions.length, sessionId, status.type, streamingMessageId, streamingPhase]);

    const activeRetryStatus = React.useMemo(() => {
        if (!sessionId || status.type !== 'retry') {
            return null;
        }

        const rawMessage = typeof (status as { message?: string }).message === 'string'
            ? (((status as { message?: string }).message) ?? '').trim()
            : '';

        return {
            sessionId,
            message: rawMessage || DEFAULT_RETRY_MESSAGE,
            confirmedAt: (status as { confirmedAt?: number }).confirmedAt,
        };
    }, [sessionId, status]);

    const [retryFallbackTimestamp, setRetryFallbackTimestamp] = React.useState<number>(0);
    const retryFallbackSessionRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!activeRetryStatus || typeof activeRetryStatus.confirmedAt === 'number') {
            retryFallbackSessionRef.current = null;
            setRetryFallbackTimestamp(0);
            return;
        }

        if (retryFallbackSessionRef.current !== activeRetryStatus.sessionId) {
            retryFallbackSessionRef.current = activeRetryStatus.sessionId;
            setRetryFallbackTimestamp(Date.now());
        }
    }, [activeRetryStatus]);

    const retryOverlay = React.useMemo(() => {
        if (!activeRetryStatus) {
            return null;
        }

        return {
            ...activeRetryStatus,
            fallbackTimestamp: retryFallbackTimestamp,
        };
    }, [activeRetryStatus, retryFallbackTimestamp]);

    const historyMeta = React.useMemo(() => ({
        limit: messages.length,
        complete: !sync.hasMore(sessionId),
        loading: sync.isLoading(sessionId),
    }), [messages.length, sessionId, sync]);

    return {
        messages,
        loaded,
        streamingMessageId,
        streamingPhase,
        status,
        blockingRequests,
        isWorking,
        retryOverlay,
        historyMeta,
    };
};
