import React from 'react';
const SESSION_RESELECTED_EVENT = 'openchamber:session-reselected';

type UseChatSessionLifecycleOptions = {
    sessionId: string;
    loaded: boolean;
    isDesktopExpandedInput: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    loadMessages: (sessionId: string) => Promise<unknown>;
    resumeToLatestInstant: () => void;
    resumeToBottomInstant: () => void;
};

const hasHashTarget = (): boolean =>
    typeof window !== 'undefined' && window.location.hash.length > 0;

export const useChatSessionLifecycle = ({
    sessionId,
    loaded,
    isDesktopExpandedInput,
    scrollRef,
    loadMessages,
    resumeToLatestInstant,
    resumeToBottomInstant,
}: UseChatSessionLifecycleOptions): void => {
    React.useEffect(() => {
        if (typeof window === 'undefined' || !sessionId) return;

        const handleSessionReselected = (event: Event) => {
            const customEvent = event as CustomEvent<string>;
            if (customEvent.detail !== sessionId) return;
            void resumeToBottomInstant();
        };

        window.addEventListener(SESSION_RESELECTED_EVENT, handleSessionReselected as EventListener);
        return () => {
            window.removeEventListener(SESSION_RESELECTED_EVENT, handleSessionReselected as EventListener);
        };
    }, [sessionId, resumeToBottomInstant]);

    React.useLayoutEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const updateChatScrollHeight = () => {
            container.style.setProperty('--chat-scroll-height', `${container.clientHeight}px`);
        };

        updateChatScrollHeight();

        let rafId = 0;
        const scheduleUpdate = () => {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                updateChatScrollHeight();
            });
        };

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', scheduleUpdate);
            return () => {
                if (rafId) cancelAnimationFrame(rafId);
                window.removeEventListener('resize', scheduleUpdate);
            };
        }

        const resizeObserver = new ResizeObserver(scheduleUpdate);
        resizeObserver.observe(container);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
        };
    }, [sessionId, isDesktopExpandedInput, scrollRef]);

    const lastScrolledSessionRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!sessionId) {
            return;
        }

        if (lastScrolledSessionRef.current === sessionId) {
            return;
        }

        if (hasHashTarget()) {
            lastScrolledSessionRef.current = sessionId;
            return;
        }

        lastScrolledSessionRef.current = sessionId;

        if (typeof window === 'undefined') {
            resumeToLatestInstant();
            return;
        }

        window.requestAnimationFrame(() => {
            resumeToLatestInstant();
        });
    }, [sessionId, resumeToLatestInstant]);

    React.useEffect(() => {
        if (!sessionId) return;
        if (loaded) return;

        const load = async () => {
            await loadMessages(sessionId).finally(() => {
                if (hasHashTarget()) {
                    return;
                }

                if (typeof window === 'undefined') {
                    resumeToLatestInstant();
                } else {
                    window.requestAnimationFrame(() => {
                        resumeToLatestInstant();
                    });
                }
            });
        };

        void load();
    }, [sessionId, loaded, loadMessages, resumeToLatestInstant]);
};
