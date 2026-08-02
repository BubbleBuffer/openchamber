import type React from "react";

export type AgentTimelineEntry = {
  key: string;
};

export type ViewportAnchor = {
  entryKey: string;
  offsetTop: number;
};

export type AgentTimelineHandle = {
  scrollToKey: (key: string, options?: { behavior?: ScrollBehavior; align?: "start" | "center" | "end" }) => boolean;
  scrollToBottom: (options?: { behavior?: ScrollBehavior }) => void;
  captureViewportAnchor: () => ViewportAnchor | null;
  restoreViewportAnchor: (anchor: ViewportAnchor | null) => boolean;
};

export type TimelineScrollState = {
  userScrolledUp: boolean;
  scrollToBottom: () => void;
};

export type AgentTimelineProps<TEntry extends AgentTimelineEntry> = {
  entries: readonly TEntry[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderEntry: (entry: TEntry, index: number) => React.ReactNode;
  estimateSize?: number | ((index: number, entry: TEntry) => number);
  overscan?: number;
  isActive?: boolean;
  hasMoreBefore?: boolean;
  isLoadingBefore?: boolean;
  onLoadBefore?: () => void;
  loadBeforeThresholdIndex?: number;
  bottomThresholdPx?: number;
  onScrollStateChange?: (state: TimelineScrollState) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
  leadingContent?: React.ReactNode;
  trailingContent?: React.ReactNode;
  emptyContent?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  itemClassName?: string | ((entry: TEntry, index: number) => string | undefined);
  ariaLabel?: string;
};
