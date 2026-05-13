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
  const loadMoreRef = React.useRef(loadMore);
  loadMoreRef.current = loadMore;
  const canLoadMoreRef = React.useRef(canLoadMore);
  canLoadMoreRef.current = canLoadMore;
  const isLoadingOlderRef = React.useRef(isLoadingOlder);
  isLoadingOlderRef.current = isLoadingOlder;

  React.useEffect(() => {
    const scrollEl = virtualizer.scrollElement;
    if (!scrollEl || !isActive) return;

    const handleScroll = () => {
      const scrollBottom = scrollEl.scrollTop + scrollEl.clientHeight;
      const totalHeight = scrollEl.scrollHeight;
      isAtBottomRef.current = totalHeight - scrollBottom < BOTTOM_THRESHOLD_PX;

      if (virtualizer.range && virtualizer.range.startIndex <= LOAD_MORE_START_INDEX && canLoadMoreRef.current && !isLoadingOlderRef.current) {
        loadMoreRef.current();
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [virtualizer, isActive]);

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
