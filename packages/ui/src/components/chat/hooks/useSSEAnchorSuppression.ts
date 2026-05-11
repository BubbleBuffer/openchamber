import React from 'react';

export function useSSEAnchorSuppression(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  userScrolledUp: boolean,
  messageCount: number,
): void {
  const prevCountRef = React.useRef(messageCount);

  React.useLayoutEffect(() => {
    if (userScrolledUp) {
      prevCountRef.current = messageCount;
      return;
    }
    if (messageCount <= prevCountRef.current) {
      prevCountRef.current = messageCount;
      return;
    }
    prevCountRef.current = messageCount;

    const container = scrollRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      if (container.scrollTop !== 0) {
        container.scrollTop = 0;
      }
    });
  }, [messageCount, userScrolledUp, scrollRef]);
}
