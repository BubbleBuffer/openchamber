import React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

const BOTTOM_THRESHOLD_PX = 80;
const LOAD_MORE_START_INDEX = 2;

interface UseChatScrollManagerOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  entryCount: number;
  isActive: boolean;
  loadMore: () => void;
  canLoadMore: boolean;
  isLoadingOlder: boolean;
}

export function useChatScrollManager({
  virtualizer,
  entryCount,
  isActive,
  loadMore,
  canLoadMore,
  isLoadingOlder,
}: UseChatScrollManagerOptions) {
  const isAtBottomRef = React.useRef(true);
  const prevEntryCountRef = React.useRef(entryCount);

  React.useEffect(() => {
    const scrollEl = virtualizer.scrollElement;
    if (!scrollEl || !isActive) return;

    const checkIfAtBottom = () => {
      const scrollBottom = scrollEl.scrollTop + scrollEl.clientHeight;
      const totalHeight = scrollEl.scrollHeight;
      isAtBottomRef.current = totalHeight - scrollBottom < BOTTOM_THRESHOLD_PX;
    };

    scrollEl.addEventListener('scroll', checkIfAtBottom, { passive: true });
    return () => scrollEl.removeEventListener('scroll', checkIfAtBottom);
  }, [virtualizer, isActive]);

  React.useEffect(() => {
    if (!isActive) return;
    const range = virtualizer.range;
    if (range && range.startIndex <= LOAD_MORE_START_INDEX && canLoadMore && !isLoadingOlder) {
      loadMore();
    }
  });

  React.useEffect(() => {
    if (!isActive) return;
    if (entryCount > prevEntryCountRef.current && isAtBottomRef.current) {
      virtualizer.scrollToIndex(entryCount - 1, { align: 'end' });
    }
    prevEntryCountRef.current = entryCount;
  }, [entryCount, virtualizer, isActive]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window) || !isActive) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleResize = () => {
      if (isAtBottomRef.current) {
        virtualizer.scrollToIndex(entryCount - 1, { align: 'end' });
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, [virtualizer, entryCount, isActive]);

  return { isAtBottom: isAtBottomRef };
}
