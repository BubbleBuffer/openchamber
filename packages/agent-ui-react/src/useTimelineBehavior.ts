import React from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import { classifyTimelineChange, isScrollAtBottom, shouldLoadBefore } from "./timeline-state.js";
import type { TimelineScrollState } from "./types.js";

type Options = {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  entryKeys: readonly string[];
  isActive: boolean;
  hasMoreBefore: boolean;
  isLoadingBefore: boolean;
  onLoadBefore?: () => void;
  loadBeforeThresholdIndex: number;
  bottomThresholdPx: number;
  onScrollStateChange?: (state: TimelineScrollState) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
};

type PrependSnapshot = {
  scrollHeight: number;
  scrollTop: number;
};

export function useTimelineBehavior(options: Options) {
  const {
    virtualizer,
    scrollRef,
    contentRef,
    entryKeys,
    isActive,
    hasMoreBefore,
    isLoadingBefore,
  } = options;
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const isAtBottomRef = React.useRef(true);
  const entryKeysRef = React.useRef(entryKeys);
  const previousKeysRef = React.useRef<readonly string[]>([]);
  const virtualizerRef = React.useRef(virtualizer);
  const optionsRef = React.useRef(options);
  const loadRequestedRef = React.useRef(false);
  const observedLoadingRef = React.useRef(false);
  const prependSnapshotRef = React.useRef<PrependSnapshot | null>(null);
  const sentScrollStateRef = React.useRef<boolean | undefined>(undefined);
  const sentAtBottomRef = React.useRef<boolean | undefined>(undefined);

  entryKeysRef.current = entryKeys;
  virtualizerRef.current = virtualizer;
  optionsRef.current = options;

  const scrollToBottom = React.useCallback((behavior?: ScrollBehavior) => {
    const count = entryKeysRef.current.length;
    if (count === 0) return;
    virtualizerRef.current.scrollToIndex(
      count - 1,
      behavior ? { align: "end", behavior } : { align: "end" },
    );
  }, []);

  const publishScrollState = React.useCallback(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const atBottom = isScrollAtBottom(scrollElement, optionsRef.current.bottomThresholdPx);
    const isOverflowing = scrollElement.scrollHeight > scrollElement.clientHeight;
    const userScrolledUp = isOverflowing && !atBottom;
    if (atBottom !== isAtBottomRef.current) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }
    if (sentAtBottomRef.current !== atBottom) {
      sentAtBottomRef.current = atBottom;
      optionsRef.current.onAtBottomChange?.(atBottom);
    }
    if (sentScrollStateRef.current !== userScrolledUp) {
      sentScrollStateRef.current = userScrolledUp;
      optionsRef.current.onScrollStateChange?.({ userScrolledUp, scrollToBottom });
    }
  }, [scrollRef, scrollToBottom]);

  React.useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || !isActive) return;

    const handleScroll = () => {
      publishScrollState();
      if (loadRequestedRef.current) return;
      if (!shouldLoadBefore({
        startIndex: virtualizerRef.current.range?.startIndex,
        thresholdIndex: optionsRef.current.loadBeforeThresholdIndex,
        hasMore: optionsRef.current.hasMoreBefore,
        isLoading: optionsRef.current.isLoadingBefore,
      })) return;

      prependSnapshotRef.current = {
        scrollHeight: scrollElement.scrollHeight,
        scrollTop: scrollElement.scrollTop,
      };
      loadRequestedRef.current = true;
      optionsRef.current.onLoadBefore?.();
    };

    publishScrollState();
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, [isActive, publishScrollState, scrollRef]);

  React.useLayoutEffect(() => {
    if (!isActive) return;
    const previousKeys = previousKeysRef.current;
    const change = classifyTimelineChange(previousKeys, entryKeys);
    const snapshot = prependSnapshotRef.current;
    const scrollElement = scrollRef.current;

    if (change === "initial") {
      scrollToBottom();
    } else if (change === "append" && isAtBottomRef.current) {
      scrollToBottom();
    } else if (change === "prepend" && snapshot && scrollElement) {
      const heightDelta = scrollElement.scrollHeight - snapshot.scrollHeight;
      scrollElement.scrollTop = snapshot.scrollTop + heightDelta;
    }

    if (entryKeys.length !== previousKeys.length) {
      prependSnapshotRef.current = null;
      loadRequestedRef.current = false;
      observedLoadingRef.current = false;
    }
    previousKeysRef.current = entryKeys;
  }, [entryKeys, isActive, scrollRef, scrollToBottom]);

  React.useEffect(() => {
    if (isLoadingBefore) observedLoadingRef.current = true;
    if (!isLoadingBefore && observedLoadingRef.current) {
      observedLoadingRef.current = false;
      loadRequestedRef.current = false;
    }
    if (!hasMoreBefore) loadRequestedRef.current = false;
  }, [hasMoreBefore, isLoadingBefore]);

  React.useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement || !isActive || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) {
        scrollToBottom();
        return;
      }
      publishScrollState();
    });
    observer.observe(contentElement);
    return () => observer.disconnect();
  }, [contentRef, isActive, publishScrollState, scrollToBottom]);

  React.useEffect(() => {
    if (!isActive || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleResize = () => {
      if (isAtBottomRef.current) {
        scrollToBottom();
        return;
      }
      publishScrollState();
    };
    viewport.addEventListener("resize", handleResize);
    return () => viewport.removeEventListener("resize", handleResize);
  }, [isActive, publishScrollState, scrollToBottom]);

  return { isAtBottom, scrollToBottom };
}
