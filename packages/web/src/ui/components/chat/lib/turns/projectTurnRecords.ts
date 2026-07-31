import { projectTurnActivity } from './projectTurnActivity';
import { projectTurnIndexes } from './projectTurnIndexes';
import { projectTurnDiffStats, projectTurnSummary } from './projectTurnSummary';
import type {
    ChatMessageEntry,
    TurnMessageRecord,
    TurnProjectionResult,
    TurnRecord,
    TurnStreamState,
} from './types';

const resolveMessageRole = (message: ChatMessageEntry): string => {
    const role = (message.info as { clientRole?: string | null; role?: string | null }).clientRole ?? message.info.role;
    return typeof role === 'string' ? role : '';
};

const getMessageParentId = (message: ChatMessageEntry): string | undefined => {
    const parentId = (message.info as { parentID?: unknown }).parentID;
    if (typeof parentId !== 'string' || parentId.trim().length === 0) {
        return undefined;
    }
    return parentId;
};

const getMessageCreatedAt = (message: ChatMessageEntry): number | undefined => {
    const created = (message.info as { time?: { created?: unknown } }).time?.created;
    return typeof created === 'number' ? created : undefined;
};

const getMessageCompletedAt = (message: ChatMessageEntry): number | undefined => {
    const completed = (message.info as { time?: { completed?: unknown } }).time?.completed;
    return typeof completed === 'number' ? completed : undefined;
};

const getUserSummaryBody = (message: ChatMessageEntry): string | undefined => {
    const summaryBody = (message.info as { summary?: { body?: unknown } | null | undefined })?.summary?.body;
    if (typeof summaryBody !== 'string') {
        return undefined;
    }

    const trimmed = summaryBody.trim();
    return trimmed.length > 0 ? summaryBody : undefined;
};

const createTurnMessageRecord = (message: ChatMessageEntry, order: number): TurnMessageRecord => {
    const role = resolveMessageRole(message);
    return {
        messageId: message.info.id,
        role,
        parentMessageId: getMessageParentId(message),
        message,
        order,
    };
};

const buildTurnStreamState = (userMessage: ChatMessageEntry, assistantMessages: ChatMessageEntry[]): TurnStreamState => {
    const startedAt = getMessageCreatedAt(userMessage);
    let completedAt: number | undefined;
    let isStreaming = false;

    assistantMessages.forEach((message) => {
        const completed = getMessageCompletedAt(message);
        if (typeof completed === 'number') {
            completedAt = Math.max(completedAt ?? 0, completed);
        } else {
            isStreaming = true;
        }
    });

    const durationMs = typeof startedAt === 'number' && typeof completedAt === 'number' && completedAt >= startedAt
        ? completedAt - startedAt
        : undefined;

    return {
        isStreaming,
        isRetrying: assistantMessages.length > 1,
        startedAt,
        completedAt,
        durationMs,
    };
};

interface ProjectTurnRecordsOptions {
    previousProjection?: TurnProjectionResult | null;
    showTextJustificationActivity: boolean;
}

const DEFAULT_OPTIONS: ProjectTurnRecordsOptions = {
    previousProjection: null,
    showTextJustificationActivity: false,
};

export const projectTurnRecords = (
    messages: ChatMessageEntry[],
    options?: Partial<ProjectTurnRecordsOptions>,
): TurnProjectionResult => {
    const effectiveOptions: ProjectTurnRecordsOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    const turns: TurnRecord[] = [];
    const turnByUserId = new Map<string, TurnRecord>();
    const groupedMessageIds = new Set<string>();

    // Pass 1: create turns for all user messages so turnByUserId is
    // fully populated before any assistant is associated. This prevents
    // an assistant whose parentID references a user message that appears
    // later in the sorted-messages array from falling back to the wrong
    // turn via currentTurn.
    messages.forEach((message, index) => {
        const role = resolveMessageRole(message);
        if (role !== 'user') return;

        const turn: TurnRecord = {
            turnId: message.info.id,
            userMessageId: message.info.id,
            userMessage: message,
            headerMessageId: undefined,
            messages: [createTurnMessageRecord(message, index)],
            assistantMessageIds: [],
            assistantMessages: [],
            activityParts: [],
            activitySegments: [],
            summary: {},
            summaryText: undefined,
            hasTools: false,
            hasReasoning: false,
            diffStats: undefined,
            stream: {
                isStreaming: false,
                isRetrying: false,
            },
        };
        turns.push(turn);
        turnByUserId.set(turn.userMessageId, turn);
        groupedMessageIds.add(message.info.id);
    });

    // Pass 2: associate assistant messages with their parent turns.
    // All user turns are already in turnByUserId, so parentID lookups
    // always succeed (no fallback needed for well-formed assistants).
    let currentTurn: TurnRecord | undefined;

    messages.forEach((message, index) => {
        const role = resolveMessageRole(message);
        if (role === 'user') {
            currentTurn = turnByUserId.get(message.info.id);
            return;
        }

        if (role !== 'assistant') {
            return;
        }

        const parentId = getMessageParentId(message);
        const parentTurn = parentId ? turnByUserId.get(parentId) : undefined;
        const targetTurn = parentTurn ?? currentTurn;
        if (!targetTurn) {
            return;
        }

        targetTurn.assistantMessages.push(message);
        targetTurn.assistantMessageIds.push(message.info.id);
        targetTurn.messages.push(createTurnMessageRecord(message, index));
        if (!targetTurn.headerMessageId) {
            targetTurn.headerMessageId = message.info.id;
        }
        groupedMessageIds.add(message.info.id);

        if (!parentTurn) {
            currentTurn = targetTurn;
        }
    });

    turns.forEach((turn) => {
        turn.summary = projectTurnSummary(turn.assistantMessages);
        turn.summaryText = turn.summary.text ?? getUserSummaryBody(turn.userMessage);
        turn.diffStats = projectTurnDiffStats(turn.userMessage);

        const activity = projectTurnActivity({
            turnId: turn.turnId,
            assistantMessages: turn.assistantMessages,
            summarySourceMessageId: turn.summary.sourceMessageId,
            summarySourcePartId: turn.summary.sourcePartId,
            showTextJustificationActivity: effectiveOptions.showTextJustificationActivity,
        });
        turn.activityParts = activity.activityParts;
        turn.activitySegments = activity.activitySegments;
        turn.hasTools = activity.hasTools;
        turn.hasReasoning = activity.hasReasoning;

        turn.stream = buildTurnStreamState(turn.userMessage, turn.assistantMessages);
        turn.startedAt = turn.stream.startedAt;
        turn.completedAt = turn.stream.completedAt;
        turn.durationMs = turn.stream.durationMs;
    });

    const projection = projectTurnIndexes(turns);
    const ungroupedMessageIds = new Set<string>();
    messages.forEach((message) => {
        if (!groupedMessageIds.has(message.info.id)) {
            ungroupedMessageIds.add(message.info.id);
        }
    });

    return {
        ...projection,
        ungroupedMessageIds,
    };
};
