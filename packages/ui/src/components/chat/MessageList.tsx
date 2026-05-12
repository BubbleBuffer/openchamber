import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { ChatMessageEntry } from './lib/turns/types';
import type { StreamPhase } from './message/types';
import { useTurnRecords } from './hooks/useTurnRecords';
import { applyRetryOverlay } from './lib/turns/applyRetryOverlay';
import { useUIStore } from '@/stores/useUIStore';
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { hasPendingUserSendAnimation, consumePendingUserSendAnimation } from '@/lib/userSendAnimation';
import { streamPerfCount, streamPerfMeasure } from '@/stores/utils/streamDebug';
import { LoadOlderButton } from './turn/LoadOlderButton';
import { getNormalizedMessageForDisplay, hasCompactionPart, getPartText, normalizeCompactionSummaryMessage, isUserSubtaskMessage, isSyntheticSubtaskBridgeAssistant, withSubtaskSessionId, isUserShellMarkerMessage, getShellBridgeAssistantDetails, getMessageId, withShellBridgeDetails, resolveMessageRole } from './message-list/normalizeMessages';
import type { RenderEntry } from './message-list/MessageListEntry';
import { MessageListEntry, StreamingTailContent } from './message-list/MessageListEntry';
import type { TurnUiState } from './message-list/TurnBlock';

const useStableEvent = <TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) => {
    const handlerRef = React.useRef(handler);
    React.useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

interface MessageListProps {
    sessionKey: string;
    turnStart: number;
    disableStaging?: boolean;
    messages: ChatMessageEntry[];
    sessionIsWorking?: boolean;
    activeStreamingMessageId?: string | null;
    activeStreamingPhase?: StreamPhase | null;
    retryOverlay?: {
        sessionId: string;
        message: string;
        confirmedAt?: number;
        fallbackTimestamp?: number;
    } | null;
    onMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export interface MessageListHandle {
    scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => boolean;
    scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => boolean;
    captureViewportAnchor: () => { messageId: string; offsetTop: number } | null;
    restoreViewportAnchor: (anchor: { messageId: string; offsetTop: number }) => boolean;
}

const MessageList = React.forwardRef<MessageListHandle, MessageListProps>(({ 
    sessionKey,
    turnStart,
    disableStaging: _disableStaging,
    messages,
    sessionIsWorking = false,
    activeStreamingMessageId = null,
    activeStreamingPhase = null,
    retryOverlay = null,
    onMessageContentChange,
    getAnimationHandlers,
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
    scrollToBottom,
    scrollRef,
}, ref) => {
    streamPerfCount('ui.message_list.render');
    void _disableStaging;
    const stickyUserHeader = useUIStore(state => state.stickyUserHeader);
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    const activityRenderMode = useUIStore((state) => state.activityRenderMode);
    const defaultActivityExpanded = activityRenderMode === 'summary';
    const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => new Map());
    const userAnimationRef = React.useRef<{
        sessionKey: string | undefined;
        previousOrder: string[];
        animatedIds: Set<string>;
    }>({ sessionKey: undefined, previousOrder: [], animatedIds: new Set() });
    const stableGetAnimationHandlers = useStableEvent(getAnimationHandlers);
    const stableOnLoadOlder = useStableEvent(onLoadOlder);
    const stableScrollToBottom = useStableEvent((options?: { instant?: boolean; force?: boolean }) => {
        scrollToBottom?.(options);
    });

    React.useEffect(() => {
        setTurnUiStates(new Map());
    }, [activityRenderMode]);

    const toggleTurnGroup = React.useCallback((turnId: string) => {
        setTurnUiStates((previous) => {
            const next = new Map(previous);
            const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
            next.set(turnId, { isExpanded: !current.isExpanded });
            return next;
        });
    }, [defaultActivityExpanded]);


    const baseDisplayMessages = React.useMemo(() => streamPerfMeasure('ui.message_list.base_display_ms', () => {
        const seenIdsFromTail = new Set<string>();
        const dedupedMessages: ChatMessageEntry[] = [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
            const message = messages[index];
            const messageId = message.info?.id;
            if (typeof messageId === 'string') {
                if (seenIdsFromTail.has(messageId)) {
                    continue;
                }
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
    }), [messages]);

    const historyContentRef = React.useRef<HTMLDivElement | null>(null);
    const resolveScrollContainer = React.useCallback((): HTMLDivElement | null => {
        if (scrollRef?.current) {
            return scrollRef.current;
        }
        if (typeof document === 'undefined') {
            return null;
        }
        return document.querySelector<HTMLDivElement>('[data-scrollbar="chat"]');
    }, [scrollRef]);

    const displayMessages = React.useMemo(() => streamPerfMeasure('ui.message_list.retry_overlay_ms', () => {
        return applyRetryOverlay(baseDisplayMessages, {
            sessionId: retryOverlay?.sessionId ?? null,
            message: retryOverlay?.message ?? 'Quota limit reached. Retrying automatically.',
            confirmedAt: retryOverlay?.confirmedAt,
            fallbackTimestamp: retryOverlay?.fallbackTimestamp ?? 0,
        });
    }), [baseDisplayMessages, retryOverlay]);

    const reversedDisplayMessages = React.useMemo(
        () => [...displayMessages].reverse(),
        [displayMessages],
    );

    const { projection, staticTurns, streamingTurn } = useTurnRecords(reversedDisplayMessages, {
        sessionKey,
        showTextJustificationActivity: chatRenderMode === 'sorted',
    });
    const staticRenderEntries = React.useMemo<RenderEntry[]>(() => streamPerfMeasure('ui.message_list.render_entries_ms', () => {
        const turnEntries = staticTurns.map((turn) => ({
            kind: 'turn' as const,
            key: `turn:${turn.turnId}`,
            turn,
            isLastTurn: turn.turnId === projection.lastTurnId,
        }));

        if (projection.ungroupedMessageIds.size === 0) {
            return turnEntries;
        }

        const turnEntryByUserMessageId = new Map<string, RenderEntry>();
        turnEntries.forEach((entry) => {
            turnEntryByUserMessageId.set(entry.turn.userMessage.info.id, entry);
        });

        const orderedEntries: RenderEntry[] = [];
        reversedDisplayMessages.forEach((message: ChatMessageEntry, i: number) => {
            const turnEntry = turnEntryByUserMessageId.get(message.info.id);
            if (turnEntry) {
                orderedEntries.push(turnEntry);
                return;
            }

            if (!projection.ungroupedMessageIds.has(message.info.id)) {
                return;
            }

            orderedEntries.push({
                kind: 'ungrouped',
                key: `msg:${message.info.id}`,
                message,
                previousMessage: i + 1 < reversedDisplayMessages.length ? reversedDisplayMessages[i + 1] : undefined,
                nextMessage: i - 1 >= 0 ? reversedDisplayMessages[i - 1] : undefined,
            });
        });

        return orderedEntries;
    }), [reversedDisplayMessages, projection.lastTurnId, projection.ungroupedMessageIds, staticTurns]);

    const trailingStreamingEntry = React.useMemo<RenderEntry | undefined>(() => {
        if (streamingTurn) {
            return {
                kind: 'turn',
                key: `turn:${streamingTurn.turnId}`,
                turn: streamingTurn,
                isLastTurn: streamingTurn.turnId === projection.lastTurnId,
            } satisfies RenderEntry;
        }

        if (projection.ungroupedMessageIds.size === 0) {
            return undefined;
        }

        const firstMessage = reversedDisplayMessages[0];
        if (!firstMessage || !projection.ungroupedMessageIds.has(firstMessage.info.id)) {
            return undefined;
        }

        return {
            kind: 'ungrouped',
            key: `msg:${firstMessage.info.id}`,
            message: firstMessage,
            previousMessage: reversedDisplayMessages.length > 1 ? reversedDisplayMessages[1] : undefined,
            nextMessage: undefined,
        } satisfies RenderEntry;
    }, [reversedDisplayMessages, projection.lastTurnId, projection.ungroupedMessageIds, streamingTurn]);

    if (trailingStreamingEntry) {
        streamPerfCount('ui.message_list.render.streaming');
    }

    const historyEntries = staticRenderEntries;

    const allEntries = React.useMemo(() => {
        return trailingStreamingEntry ? [...historyEntries, trailingStreamingEntry] : historyEntries;
    }, [historyEntries, trailingStreamingEntry]);

    const stableHistoryContentChange = useStableEvent((reason?: ContentChangeReason) => {
        onMessageContentChange(reason);
    });

    const stableTailContentChange = useStableEvent((reason?: ContentChangeReason) => {
        onMessageContentChange(reason);
    });

    const currentUserOrder = React.useMemo(() => {
        return messages
            .filter((message) => resolveMessageRole(message) === 'user')
            .map((message) => message.info.id);
    }, [messages]);

    // Detect new user messages SYNCHRONOUSLY during render.
    // Must happen during render (not in useEffect) so that ToolRevealOnMount
    // receives animate=true on the FIRST render of the new message,
    // starting it hidden (opacity 0). An effect-based approach causes
    // the message to flash visible before the animation starts.
    {
        const anim = userAnimationRef.current;

        // Reset on session switch
        if (anim.sessionKey !== sessionKey) {
            anim.sessionKey = sessionKey;
            anim.previousOrder = currentUserOrder;
            anim.animatedIds = new Set();
        }

        // Detect appended user messages
        const prev = anim.previousOrder;
        if (currentUserOrder.length > prev.length) {
            const isAppendOnly = prev.every((id, i) => currentUserOrder[i] === id);
            if (isAppendOnly && hasPendingUserSendAnimation(sessionKey)) {
                for (let i = prev.length; i < currentUserOrder.length; i += 1) {
                    const id = currentUserOrder[i];
                    if (id && !anim.animatedIds.has(id)) {
                        if (!consumePendingUserSendAnimation(sessionKey)) break;
                        anim.animatedIds.add(id);
                    }
                }
            }
        }
        anim.previousOrder = currentUserOrder;
    }

    const shouldAnimateUserMessage = React.useCallback((message: ChatMessageEntry): boolean => {
        if (resolveMessageRole(message) !== 'user') return false;
        return userAnimationRef.current.animatedIds.has(message.info.id);
    }, []);

    const onUserAnimationConsumed = React.useCallback((messageId: string) => {
        userAnimationRef.current.animatedIds.delete(messageId);
    }, []);

    const messageIndexMap = React.useMemo(() => {
        const indexMap = new Map<string, number>();

        allEntries.forEach((entry, index) => {
            if (entry.kind === 'ungrouped') {
                indexMap.set(entry.message.info.id, index);
                return;
            }
            indexMap.set(entry.turn.userMessage.info.id, index);
            entry.turn.assistantMessages.forEach((message) => {
                indexMap.set(message.info.id, index);
            });
        });

        return indexMap;
    }, [allEntries]);

    const findMessageElement = React.useCallback((messageId: string): HTMLElement | null => {
        const container = resolveScrollContainer();
        if (!container) {
            return null;
        }
        return container.querySelector(`[data-message-id="${messageId}"]`);
    }, [resolveScrollContainer]);

    const scrollHistoryIndexIntoView = React.useCallback((index: number, behavior: ScrollBehavior = 'auto') => {
        if (index < 0 || index >= historyEntries.length) {
            return false;
        }
        const container = resolveScrollContainer();
        if (!container) return false;
        const entry = historyEntries[index];
        if (!entry) return false;
        const element = container.querySelector(`[data-turn-entry="${entry.key}"]`);
        if (element) {
            element.scrollIntoView({ behavior, block: 'nearest' });
            return true;
        }
        return false;
    }, [historyEntries, resolveScrollContainer]);

    React.useEffect(() => {
        if (!ref) {
            return;
        }

        const handle: MessageListHandle = {
            scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => {
                const behavior = options?.behavior ?? 'auto';
                const container = resolveScrollContainer();
                if (!container) {
                    return false;
                }
                const turnElement = container.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
                if (turnElement) {
                    turnElement.scrollIntoView({ behavior, block: 'nearest' });
                    return true;
                }
                const reversedIndex = historyEntries.findIndex(
                    (e) => e.kind === 'turn' && e.turn.turnId === turnId,
                );
                if (reversedIndex !== -1) {
                    return scrollHistoryIndexIntoView(reversedIndex, behavior);
                }
                return false;
            },

            scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => {
                const behavior = options?.behavior ?? 'auto';
                const container = resolveScrollContainer();
                if (!container) {
                    return false;
                }
                const messageElement = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    messageElement.scrollIntoView({ behavior, block: 'nearest' });
                    return true;
                }
                return false;
            },

            captureViewportAnchor: () => {
                const container = resolveScrollContainer();
                if (!container) {
                    return null;
                }

                const containerRect = container.getBoundingClientRect();
                const nodes: HTMLElement[] = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'));
                const firstVisible = nodes.find((node) => {
                    const rect = node.getBoundingClientRect();
                    if (rect.bottom <= containerRect.top + 1) {
                        return false;
                    }

                    if (typeof window === 'undefined') {
                        return true;
                    }

                    const computed = window.getComputedStyle(node);
                    const isStuckSticky = computed.position === 'sticky' && rect.top <= containerRect.top + 1;
                    return !isStuckSticky;
                }) ?? nodes.find((node) => node.getBoundingClientRect().bottom > containerRect.top + 1);
                if (!firstVisible) {
                    return null;
                }

                const messageId = firstVisible.dataset.messageId;
                if (!messageId) {
                    return null;
                }

                return {
                    messageId,
                    offsetTop: firstVisible.getBoundingClientRect().top - containerRect.top,
                };
            },

            restoreViewportAnchor: (anchor: { messageId: string; offsetTop: number }) => {
                const container = resolveScrollContainer();
                if (!container) {
                    return false;
                }

                if (!messageIndexMap.has(anchor.messageId)) {
                    return false;
                }

                const applyAnchor = (): boolean => {
                    const element = findMessageElement(anchor.messageId);
                    if (!element) {
                        return false;
                    }
                    const containerRect = container.getBoundingClientRect();
                    const targetTop = element.getBoundingClientRect().top - containerRect.top;
                    const delta = targetTop - anchor.offsetTop;
                    if (delta !== 0) {
                        container.scrollTop += delta;
                    }
                    return true;
                };

                if (!applyAnchor()) {
                    const index = messageIndexMap.get(anchor.messageId);
                    if (typeof index === 'number' && index < historyEntries.length) {
                        scrollHistoryIndexIntoView(index, 'auto');
                    }
                }

                return applyAnchor();
            },
        };

        if (typeof ref === 'function') {
            ref(handle);
            return () => {
                ref(null);
            };
        }

        const objectRef = ref;
        objectRef.current = handle;
        return () => {
            objectRef.current = null;
        };
    }, [findMessageElement, historyEntries, messageIndexMap, resolveScrollContainer, scrollHistoryIndexIntoView, ref]);

    const disableFadeIn = false;

    return (
        <div>
                <LoadOlderButton
                    hasMoreAbove={turnStart > 0 || hasMoreAbove}
                    isLoadingOlder={isLoadingOlder}
                    onLoadOlder={stableOnLoadOlder}
                />

                <FadeInDisabledProvider disabled={disableFadeIn}>
                    <div ref={historyContentRef} className="flex flex-col-reverse relative w-full">
                        {trailingStreamingEntry ? (
                            <StreamingTailContent
                                entry={trailingStreamingEntry}
                                onMessageContentChange={stableTailContentChange}
                                getAnimationHandlers={stableGetAnimationHandlers}
                                scrollToBottom={stableScrollToBottom}
                                stickyUserHeader={stickyUserHeader}
                                sessionIsWorking={sessionIsWorking}
                                defaultActivityExpanded={defaultActivityExpanded}
                                turnUiStates={turnUiStates}
                                onToggleTurnGroup={toggleTurnGroup}
                                chatRenderMode={chatRenderMode}
                                shouldAnimateUserMessage={shouldAnimateUserMessage}
                                onUserAnimationConsumed={onUserAnimationConsumed}
                                activeStreamingMessageId={activeStreamingMessageId}
                                activeStreamingPhase={activeStreamingPhase}
                            />
                        ) : null}
                        {historyEntries.map((entry) => (
                            <div
                                key={entry.key}
                                data-turn-entry={entry.key}
                            >
                                <MessageListEntry
                                    key={entry.key}
                                    entry={entry}
                                    onMessageContentChange={stableHistoryContentChange}
                                    getAnimationHandlers={stableGetAnimationHandlers}
                                    scrollToBottom={stableScrollToBottom}
                                    stickyUserHeader={stickyUserHeader}
                                    sessionIsWorking={false}
                                    defaultActivityExpanded={defaultActivityExpanded}
                                    turnUiStates={turnUiStates}
                                    onToggleTurnGroup={toggleTurnGroup}
                                    chatRenderMode={chatRenderMode}
                                    shouldAnimateUserMessage={shouldAnimateUserMessage}
                                    onUserAnimationConsumed={onUserAnimationConsumed}
                                    activeStreamingMessageId={null}
                                    activeStreamingPhase={activeStreamingPhase}
                                />
                            </div>
                        ))}
                    </div>
                </FadeInDisabledProvider>

        </div>
    );
});

MessageList.displayName = 'MessageList';

export default React.memo(MessageList);
