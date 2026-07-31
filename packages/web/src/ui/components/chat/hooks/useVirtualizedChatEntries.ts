import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import { applyRetryOverlay } from '../lib/turns/applyRetryOverlay';
import {
    getNormalizedMessageForDisplay,
    hasCompactionPart,
    getPartText,
    normalizeCompactionSummaryMessage,
    isUserSubtaskMessage,
    isSyntheticSubtaskBridgeAssistant,
    withSubtaskSessionId,
    isUserShellMarkerMessage,
    getShellBridgeAssistantDetails,
    getMessageId,
    withShellBridgeDetails,
} from '../message-list/normalizeMessages';
import type { RenderEntry } from '../message-list/MessageListEntry';
import { useTurnRecords } from './useTurnRecords';
import { streamPerfCount, streamPerfMeasure } from '@/stores/utils/streamDebug';

type RetryOverlayInput = {
    sessionId: string;
    message: string;
    confirmedAt?: number;
    fallbackTimestamp?: number;
} | null;

export const buildBaseDisplayMessages = (messages: ChatMessageEntry[]): ChatMessageEntry[] => {
    const seenIdsFromTail = new Set<string>();
    const dedupedMessages: ChatMessageEntry[] = [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const messageId = message.info?.id;
        if (typeof messageId === 'string') {
            if (seenIdsFromTail.has(messageId)) continue;
            seenIdsFromTail.add(messageId);
        }
        dedupedMessages.push(getNormalizedMessageForDisplay(message));
    }
    dedupedMessages.reverse();

    const output: ChatMessageEntry[] = [];
    const compactionCommandIds = new Set<string>();
    for (let index = 0; index < dedupedMessages.length; index += 1) {
        const current = dedupedMessages[index];
        const currentWithRole = normalizeCompactionSummaryMessage(current, compactionCommandIds);
        if (hasCompactionPart(current) || current.parts.some((part) => part.type === 'text' && getPartText(part).trim() === '/compact')) {
            compactionCommandIds.add(current.info.id);
        }
        const previous = output.length > 0 ? output[output.length - 1] : undefined;
        if (isUserSubtaskMessage(previous)) {
            const bridge = isSyntheticSubtaskBridgeAssistant(currentWithRole);
            if (bridge.hide) {
                output[output.length - 1] = withSubtaskSessionId(previous as ChatMessageEntry, bridge.taskSessionId);
                continue;
            }
        }
        if (isUserShellMarkerMessage(previous)) {
            const bridge = getShellBridgeAssistantDetails(currentWithRole, getMessageId(previous));
            if (bridge.hide) {
                output[output.length - 1] = withShellBridgeDetails(previous as ChatMessageEntry, bridge.details);
                continue;
            }
        }
        output.push(currentWithRole);
    }
    return output;
};

export const buildMessageIndexMap = (entries: RenderEntry[]): Map<string, number> => {
    const indexMap = new Map<string, number>();
    entries.forEach((entry, index) => {
        if (entry.kind === 'ungrouped') {
            indexMap.set(entry.message.info.id, index);
            return;
        }
        indexMap.set(entry.turn.userMessage.info.id, index);
        entry.turn.assistantMessages.forEach((message) => indexMap.set(message.info.id, index));
    });
    return indexMap;
};

export const useVirtualizedChatEntries = ({
    messages,
    retryOverlay,
    sessionKey,
    chatRenderMode,
}: {
    messages: ChatMessageEntry[];
    retryOverlay: RetryOverlayInput;
    sessionKey: string;
    chatRenderMode: 'sorted' | 'live';
}) => {
    const baseDisplayMessages = React.useMemo(
        () => streamPerfMeasure('ui.virtual_list.base_display_ms', () => buildBaseDisplayMessages(messages)),
        [messages],
    );

    const displayMessages = React.useMemo(
        () => streamPerfMeasure('ui.virtual_list.retry_overlay_ms', () =>
            applyRetryOverlay(baseDisplayMessages, {
                sessionId: retryOverlay?.sessionId ?? null,
                message: retryOverlay?.message ?? 'Quota limit reached. Retrying automatically.',
                confirmedAt: retryOverlay?.confirmedAt,
                fallbackTimestamp: retryOverlay?.fallbackTimestamp ?? 0,
            }),
        ),
        [baseDisplayMessages, retryOverlay],
    );

    const { projection, staticTurns, streamingTurn } = useTurnRecords(displayMessages, {
        sessionKey,
        showTextJustificationActivity: chatRenderMode === 'sorted',
    });

    const historyEntries = React.useMemo<RenderEntry[]>(
        () => streamPerfMeasure('ui.virtual_list.render_entries_ms', () => {
            const turnEntries = staticTurns.map((turn) => ({
                kind: 'turn' as const,
                key: `turn:${turn.turnId}`,
                turn,
                isLastTurn: turn.turnId === projection.lastTurnId,
            }));

            if (projection.ungroupedMessageIds.size === 0) return turnEntries;

            const turnEntryByUserMessageId = new Map<string, RenderEntry>();
            turnEntries.forEach((entry) => {
                turnEntryByUserMessageId.set(entry.turn.userMessage.info.id, entry);
            });

            const orderedEntries: RenderEntry[] = [];
            displayMessages.forEach((message: ChatMessageEntry, index: number) => {
                const turnEntry = turnEntryByUserMessageId.get(message.info.id);
                if (turnEntry) {
                    orderedEntries.push(turnEntry);
                    return;
                }
                if (!projection.ungroupedMessageIds.has(message.info.id)) return;
                orderedEntries.push({
                    kind: 'ungrouped',
                    key: `msg:${message.info.id}`,
                    message,
                    previousMessage: index > 0 ? displayMessages[index - 1] : undefined,
                    nextMessage: index + 1 < displayMessages.length ? displayMessages[index + 1] : undefined,
                });
            });
            return orderedEntries;
        }),
        [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, staticTurns],
    );

    const trailingStreamingEntry = React.useMemo<RenderEntry | undefined>(() => {
        if (streamingTurn) {
            return {
                kind: 'turn',
                key: `turn:${streamingTurn.turnId}`,
                turn: streamingTurn,
                isLastTurn: streamingTurn.turnId === projection.lastTurnId,
            } satisfies RenderEntry;
        }
        if (projection.ungroupedMessageIds.size === 0) return undefined;
        const lastMessage = displayMessages[displayMessages.length - 1];
        if (!lastMessage || !projection.ungroupedMessageIds.has(lastMessage.info.id)) return undefined;
        return {
            kind: 'ungrouped',
            key: `msg:${lastMessage.info.id}`,
            message: lastMessage,
            previousMessage: displayMessages.length > 1 ? displayMessages[displayMessages.length - 2] : undefined,
            nextMessage: undefined,
        } satisfies RenderEntry;
    }, [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, streamingTurn]);

    if (trailingStreamingEntry) streamPerfCount('ui.virtual_list.render.streaming');

    const allEntries = React.useMemo(() => {
        if (trailingStreamingEntry) {
            return [...historyEntries, trailingStreamingEntry];
        }
        return historyEntries;
    }, [historyEntries, trailingStreamingEntry]);

    const messageIndexMap = React.useMemo(() => buildMessageIndexMap(allEntries), [allEntries]);

    return {
        allEntries,
        trailingStreamingEntry,
        messageIndexMap,
    };
};
