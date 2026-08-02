import type React from "react";

import type { ViewportAnchor } from "./types.js";

const ENTRY_SELECTOR = "[data-agent-timeline-key]";

export function captureViewportAnchor(
  scrollRef: React.RefObject<HTMLDivElement | null>,
): ViewportAnchor | null {
  const container = scrollRef.current;
  if (!container) return null;

  const containerTop = container.getBoundingClientRect().top;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR));
  const firstVisible = nodes.find((node) => node.getBoundingClientRect().bottom > containerTop + 1);
  const entryKey = firstVisible?.dataset.agentTimelineKey;
  if (!firstVisible || !entryKey) return null;

  return {
    entryKey,
    offsetTop: firstVisible.getBoundingClientRect().top - containerTop,
  };
}

export function restoreViewportAnchor(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  anchor: ViewportAnchor | null,
): boolean {
  const container = scrollRef.current;
  if (!container || !anchor) return false;

  const element = Array.from(container.querySelectorAll<HTMLElement>(ENTRY_SELECTOR))
    .find((node) => node.dataset.agentTimelineKey === anchor.entryKey);
  if (!element) return false;

  const containerTop = container.getBoundingClientRect().top;
  const currentOffset = element.getBoundingClientRect().top - containerTop;
  container.scrollTop += currentOffset - anchor.offsetTop;
  return true;
}
