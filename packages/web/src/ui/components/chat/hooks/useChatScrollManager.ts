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
  onScrollStateChange?: (state: { userScrolledUp: boolean; scrollToBottom: () => void }) => void;
}

export function useChatScrollManager({
  virtualizer,
  entryCount,
  isActive,
  loadMore,
  canLoadMore,
  isLoadingOlder,
  onScrollStateChange,
}: UseChatScrollManagerOptions) {
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const isAtBottomRef = React.useRef(true);
  const prevEntryCountRef = React.useRef(entryCount);
  const prevScrollHeightRef = React.useRef(0);
  const loadMoreRef = React.useRef(loadMore);
  loadMoreRef.current = loadMore;
  const canLoadMoreRef = React.useRef(canLoadMore);
  canLoadMoreRef.current = canLoadMore;
  const isLoadingOlderRef = React.useRef(isLoadingOlder);
  isLoadingOlderRef.current = isLoadingOlder;
  const onScrollStateChangeRef = React.useRef(onScrollStateChange);
  onScrollStateChangeRef.current = onScrollStateChange;
  const prevSentUserScrolledUpRef = React.useRef<boolean | undefined>(undefined);
  const loadMoreSnapshotRef = React.useRef<{ firstVisibleIndex: number; entryCount: number } | null>(null);

  const virtualizerRef = React.useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const entryCountRef = React.useRef(entryCount);
  entryCountRef.current = entryCount;

  const scrollToBottom = React.useCallback(() => {
    const v = virtualizerRef.current;
    const count = entryCountRef.current;
    if (count > 0) {
      v.scrollToIndex(count - 1, { align: 'end' });
    }
  }, []);

  React.useEffect(() => {
    const scrollEl = virtualizer.scrollElement;
    if (!scrollEl || !isActive) return;

    const fireState = () => {
      const atBottom = scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight) < BOTTOM_THRESHOLD_PX;
      const overflowing = scrollEl.scrollHeight > scrollEl.clientHeight;
      const currentUserScrolledUp = !atBottom && overflowing;

      if (atBottom !== isAtBottomRef.current) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
      setIsOverflowing(overflowing);

      if (currentUserScrolledUp !== prevSentUserScrolledUpRef.current) {
        prevSentUserScrolledUpRef.current = currentUserScrolledUp;
        onScrollStateChangeRef.current?.({
          userScrolledUp: currentUserScrolledUp,
          scrollToBottom,
        });
      }
    };

    fireState();

    const handleScroll = () => {
      fireState();

      if (
        virtualizerRef.current.range &&
        virtualizerRef.current.range.startIndex <= LOAD_MORE_START_INDEX &&
        canLoadMoreRef.current &&
        !isLoadingOlderRef.current
      ) {
        loadMoreSnapshotRef.current = {
          firstVisibleIndex: virtualizerRef.current.range.startIndex,
          entryCount: entryCountRef.current,
        };
        loadMoreRef.current();
      }
    };

    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, [virtualizer, isActive, scrollToBottom]);

  React.useEffect(() => {
    if (!isActive) return;
    if (entryCount > prevEntryCountRef.current && isAtBottomRef.current) {
      virtualizer.scrollToIndex(entryCount - 1, { align: 'end' });
    }
    prevEntryCountRef.current = entryCount;
  }, [entryCount, virtualizer, isActive]);

  React.useEffect(() => {
    const snapshot = loadMoreSnapshotRef.current;
    if (!snapshot) return;
    if (entryCount > snapshot.entryCount) {
      const delta = entryCount - snapshot.entryCount;
      virtualizer.scrollToIndex(snapshot.firstVisibleIndex + delta, { align: 'start' });
    }
    loadMoreSnapshotRef.current = null;
  }, [entryCount, virtualizer]);

  React.useEffect(() => {
    const scrollEl = virtualizer.scrollElement;
    if (!scrollEl || !isActive) return;

    const observer = new ResizeObserver(() => {
      const currentHeight = scrollEl.scrollHeight;
      if (currentHeight > prevScrollHeightRef.current && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          const count = entryCountRef.current;
          if (count > 0) {
            virtualizerRef.current.scrollToIndex(count - 1, { align: 'end' });
          }
        });
      }
      prevScrollHeightRef.current = currentHeight;
    });

    observer.observe(scrollEl);
    return () => observer.disconnect();
  }, [virtualizer, isActive]);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window) || !isActive) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleResize = () => {
      if (isAtBottomRef.current) {
        const count = entryCountRef.current;
        if (count > 0) {
          virtualizerRef.current.scrollToIndex(count - 1, { align: 'end' });
        }
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, [virtualizer, isActive]);

  return { isAtBottom, isOverflowing, scrollToBottom };
}
