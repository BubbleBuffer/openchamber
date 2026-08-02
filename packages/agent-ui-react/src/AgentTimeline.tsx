import React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { assertUniqueTimelineKeys } from "@openchamber/agent-ui-core";

import type { AgentTimelineEntry, AgentTimelineHandle, AgentTimelineProps } from "./types.js";
import { useTimelineBehavior } from "./useTimelineBehavior.js";
import { captureViewportAnchor, restoreViewportAnchor } from "./viewport-anchor.js";

const DEFAULT_ESTIMATE_SIZE = 160;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_LOAD_THRESHOLD = 2;
const DEFAULT_BOTTOM_THRESHOLD = 80;

function AgentTimelineInner<TEntry extends AgentTimelineEntry>(
  {
    entries,
    scrollRef,
    renderEntry,
    estimateSize = DEFAULT_ESTIMATE_SIZE,
    overscan = DEFAULT_OVERSCAN,
    isActive = true,
    hasMoreBefore = false,
    isLoadingBefore = false,
    onLoadBefore,
    loadBeforeThresholdIndex = DEFAULT_LOAD_THRESHOLD,
    bottomThresholdPx = DEFAULT_BOTTOM_THRESHOLD,
    onScrollStateChange,
    onAtBottomChange,
    leadingContent,
    trailingContent,
    emptyContent,
    className,
    contentClassName,
    itemClassName,
    ariaLabel = "Agent conversation timeline",
  }: AgentTimelineProps<TEntry>,
  ref: React.ForwardedRef<AgentTimelineHandle>,
) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const entryKeys = React.useMemo(() => {
    assertUniqueTimelineKeys(entries);
    return entries.map((entry) => entry.key);
  }, [entries]);
  const estimateEntrySize = React.useCallback(
    (index: number) => typeof estimateSize === "number"
      ? estimateSize
      : estimateSize(index, entries[index] as TEntry),
    [entries, estimateSize],
  );
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateEntrySize,
    overscan,
  });
  const { scrollToBottom } = useTimelineBehavior({
    virtualizer,
    scrollRef,
    contentRef,
    entryKeys,
    isActive,
    hasMoreBefore,
    isLoadingBefore,
    onLoadBefore,
    loadBeforeThresholdIndex,
    bottomThresholdPx,
    onScrollStateChange,
    onAtBottomChange,
  });

  React.useImperativeHandle(ref, () => ({
    scrollToKey: (key, options) => {
      const index = entryKeys.indexOf(key);
      if (index < 0) return false;
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? "start",
        behavior: options?.behavior ?? "auto",
      });
      return true;
    },
    scrollToBottom: (options) => scrollToBottom(options?.behavior),
    captureViewportAnchor: () => captureViewportAnchor(scrollRef),
    restoreViewportAnchor: (anchor) => restoreViewportAnchor(scrollRef, anchor),
  }), [entryKeys, scrollRef, scrollToBottom, virtualizer]);

  const itemClass = (entry: TEntry, index: number) => typeof itemClassName === "function"
    ? itemClassName(entry, index)
    : itemClassName;

  return (
    <div className={className} data-agent-timeline="" role="feed" aria-label={ariaLabel}>
      {leadingContent}
      {entries.length === 0 ? emptyContent : (
        <div
          ref={contentRef}
          className={contentClassName}
          data-agent-timeline-content=""
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const entry = entries[virtualItem.index];
            if (!entry) return null;
            return (
              <div
                key={entry.key}
                ref={virtualizer.measureElement}
                className={itemClass(entry, virtualItem.index)}
                data-agent-timeline-key={entry.key}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualItem.start}px)`,
                  width: "100%",
                }}
              >
                {renderEntry(entry, virtualItem.index)}
              </div>
            );
          })}
        </div>
      )}
      {trailingContent}
    </div>
  );
}

export const AgentTimeline = React.forwardRef(AgentTimelineInner) as <TEntry extends AgentTimelineEntry>(
  props: AgentTimelineProps<TEntry> & React.RefAttributes<AgentTimelineHandle>,
) => React.ReactElement;
