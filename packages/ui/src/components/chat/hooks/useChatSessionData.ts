import React from 'react';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { StreamPhase } from '../message/types';
import type { ChatMessageEntry } from '../lib/turns/types';
import {
    collectVisibleSessionIdsForBlockingRequests,
    flattenBlockingRequests,
} from '../lib/blockingRequests';
import {
    useDirectoryStore,
    useSessionMessageRecords,
    useSessions,
    useSessionStatus,
    useSyncDirectory,
} from '@/sync/sync-context';
import { usePlanDetection } from '@/hooks/usePlanDetection';

// Machine hooks - Phase 3.2 migration
import {
    useLoaded,
    useStreamingMessageId as useMachineStreamingMessageId,
    useIsWorking as useMachineIsWorking,
    usePermissions as useMachinePermissions,
    useQuestions as useMachineQuestions,
    useRetryState as useMachineRetryState,
    useHistoryState as useMachineHistoryState,
} from '../state/machine/selectors';

const EMPTY_PERMISSIONS: PermissionRequest[] = [];
const EMPTY_QUESTIONS: QuestionRequest[] = [];
const IDLE_SESSION_STATUS = { type: 'idle' as const };

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

/**
 * useChatSessionData — Phase 3.2 Migration
 *
 * Machine-owned fields now come from machine hooks.
 * Sync store still provides: messages, status (for now - Phase 3.3)
 */
export const useChatSessionData = (sessionId: string): ChatSessionData => {
    const directory = useSyncDirectory();

    // Machine hooks for machine-owned fields (Phase 3.2)
    const machineLoaded = useLoaded(directory, sessionId);
    const machineStreamingMessageId = useMachineStreamingMessageId(directory, sessionId);
    const machineIsWorking = useMachineIsWorking(directory, sessionId);
    const machinePermissions = useMachinePermissions(directory, sessionId);
    const machineQuestions = useMachineQuestions(directory, sessionId);
    const machineRetryState = useMachineRetryState(directory, sessionId);
    const machineHistoryState = useMachineHistoryState(directory, sessionId);

    // Sync store fields (messages still from sync - Phase 3.3)
    const messages = useSessionMessageRecords(sessionId);
    const sessions = useSessions();
    const status = useSessionStatus(sessionId) ?? IDLE_SESSION_STATUS;

    usePlanDetection(sessionId);

    // Store reference for multi-session blocking request aggregation
    const directoryStore = useDirectoryStore();

    // Machine-derived fields (Phase 3.2 migration)
    const loaded = machineLoaded;
    const streamingMessageId = machineStreamingMessageId;

    // Derive streamingPhase from machine state
    // streaming: when streamingMessageId is non-null and not in cooldown
    // cooldown: when in retry cooldown
    // null: when neither active
    const streamingPhase = React.useMemo<StreamPhase | null>(() => {
        if (machineStreamingMessageId) {
            // Active streaming
            if (machineRetryState.retryCooldownUntil !== null) {
                return 'cooldown';
            }
            return 'streaming';
        }
        // Check if in cooldown without active streaming
        if (machineRetryState.retryCooldownUntil !== null) {
            return 'cooldown';
        }
        return null;
    }, [machineStreamingMessageId, machineRetryState.retryCooldownUntil]);

    // isWorking from machine hook
    const isWorking = machineIsWorking;

    // blockingRequests from machine hooks
    const blockingRequests = React.useMemo<BlockingRequestsSnapshot>(() => {
        // Collect visible session IDs for hierarchical blocking requests
        const scopedSessionIds = collectVisibleSessionIdsForBlockingRequests(
            sessions.map((session) => ({ id: session.id, parentID: session.parentID })),
            sessionId,
        );

        // For the primary session, use machine permissions/questions directly
        // For child sessions, aggregate them (same as before but now machine provides the data)
        if (scopedSessionIds.length <= 1) {
            return {
                permissions: machinePermissions,
                questions: machineQuestions,
            };
        }

        // Multiple sessions - aggregate from sync store for now (Phase 3.2)
        // Machine hooks only return data for the specific sessionId
        const syncState = directoryStore.getState();
        const permissionsMap = new Map<string, PermissionRequest[]>();
        const questionsMap = new Map<string, QuestionRequest[]>();

        for (const sid of scopedSessionIds) {
            if (sid === sessionId) {
                permissionsMap.set(sid, machinePermissions);
                questionsMap.set(sid, machineQuestions);
            } else {
                permissionsMap.set(sid, syncState.permission[sid] ?? EMPTY_PERMISSIONS);
                questionsMap.set(sid, syncState.question[sid] ?? EMPTY_QUESTIONS);
            }
        }

        return {
            permissions: flattenBlockingRequests(permissionsMap, scopedSessionIds),
            questions: flattenBlockingRequests(questionsMap, scopedSessionIds),
        };
    }, [machinePermissions, machineQuestions, sessionId, sessions, directoryStore]);

    // Retry overlay from machine retry state
    const activeRetryStatus = React.useMemo(() => {
        if (!sessionId || !machineRetryState.retryMessage) {
            return null;
        }

        // retryCooldownUntil non-null means we're in cooldown - no overlay
        if (machineRetryState.retryCooldownUntil !== null) {
            return null;
        }

        return {
            sessionId,
            message: machineRetryState.retryMessage,
            confirmedAt: undefined,
        };
    }, [machineRetryState.retryMessage, machineRetryState.retryCooldownUntil, sessionId]);

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

    // historyMeta from machine useHistoryState hook
    const historyMeta = React.useMemo(() => ({
        limit: messages.length,
        // Machine's hasMoreAbove indicates if there are more messages to load
        complete: !machineHistoryState.hasMoreAbove,
        // Machine's isLoadingOlder indicates history is being loaded
        loading: machineHistoryState.isLoadingOlder,
    }), [machineHistoryState.hasMoreAbove, machineHistoryState.isLoadingOlder, messages.length]);

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