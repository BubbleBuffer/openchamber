import React from 'react';

interface ViewportAnchor {
  entryKey: string;
  offsetFromTop: number;
}

export function useViewportAnchor(
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const captureViewportAnchor = React.useCallback((): ViewportAnchor | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const nodes: HTMLElement[] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-turn-entry]'),
    );
    const firstVisible = nodes.find(
      (node) => node.getBoundingClientRect().bottom > containerRect.top + 1,
    );
    if (!firstVisible) return null;
    const entryKey = firstVisible.dataset.turnEntry;
    if (!entryKey) return null;
    return {
      entryKey,
      offsetFromTop: firstVisible.getBoundingClientRect().top - containerRect.top,
    };
  }, [scrollRef]);

  const restoreViewportAnchor = React.useCallback(
    (anchor: ViewportAnchor | null): boolean => {
      if (!anchor) return false;
      const container = scrollRef.current;
      if (!container) return false;
      const element = container.querySelector(
        `[data-turn-entry="${anchor.entryKey}"]`,
      );
      if (!element) return false;
      const containerRect = container.getBoundingClientRect();
      const targetTop = element.getBoundingClientRect().top - containerRect.top;
      const delta = targetTop - anchor.offsetFromTop;
      if (delta !== 0) {
        container.scrollTop += delta;
      }
      return true;
    },
    [scrollRef],
  );

  return { captureViewportAnchor, restoreViewportAnchor };
}
