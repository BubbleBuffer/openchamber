import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const virtualizerState = vi.hoisted(() => ({
  options: null as null | {
    count: number;
    getScrollElement: () => HTMLDivElement | null;
  },
  rangeStartIndex: 0,
  scrollToIndex: vi.fn(),
  measureElement: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => {
  const virtualizer = {
    get scrollElement() {
      return virtualizerState.options?.getScrollElement() ?? null;
    },
    get range() {
      return { startIndex: virtualizerState.rangeStartIndex, endIndex: virtualizerState.rangeStartIndex };
    },
    getVirtualItems: () => Array.from(
      { length: virtualizerState.options?.count ?? 0 },
      (_, index) => ({ index, key: index, start: index * 100, size: 100 }),
    ),
    getTotalSize: () => (virtualizerState.options?.count ?? 0) * 100,
    scrollToIndex: virtualizerState.scrollToIndex,
    measureElement: virtualizerState.measureElement,
  };

  return {
    useVirtualizer: (options: typeof virtualizerState.options) => {
      virtualizerState.options = options;
      return virtualizer;
    },
  };
});

import { AgentTimeline } from "./AgentTimeline";
import type { AgentTimelineHandle } from "./types";

type Entry = { key: string; label: string };

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this);
  }
}

function setScrollMetrics(
  element: HTMLDivElement,
  metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight },
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
    scrollTop: {
      configurable: true,
      get: () => metrics.scrollTop,
      set: (value: number) => { metrics.scrollTop = value; },
    },
  });
}

function timeline(
  entries: Entry[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
  props: Partial<React.ComponentProps<typeof AgentTimeline<Entry>>> = {},
) {
  return (
    <AgentTimeline
      entries={entries}
      scrollRef={scrollRef}
      renderEntry={(entry) => <span>{entry.label}</span>}
      {...props}
    />
  );
}

describe("AgentTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    virtualizerState.options = null;
    virtualizerState.rangeStartIndex = 0;
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  test("renders semantic keyed entries and initially places the viewport at the tail", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const entries = [{ key: "a", label: "Alpha" }, { key: "b", label: "Beta" }];

    const view = render(timeline(entries, scrollRef), { container: scrollElement });

    expect(view.container.querySelectorAll("[data-agent-timeline-key]")).toHaveLength(2);
    expect(view.container.querySelector("[data-agent-timeline-key='a']")?.textContent).toBe("Alpha");
    expect(virtualizerState.scrollToIndex).toHaveBeenCalledWith(1, { align: "end" });
  });

  test("rejects duplicate stable keys before rendering an ambiguous timeline", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(timeline([
      { key: "same", label: "First" },
      { key: "same", label: "Second" },
    ], scrollRef), { container: scrollElement })).toThrow("duplicate timeline key: same");
    consoleError.mockRestore();
  });

  test("follows live appends only while the user remains at the bottom", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const metrics = { scrollHeight: 1_000, clientHeight: 300, scrollTop: 700 };
    setScrollMetrics(scrollElement, metrics);
    const first = [{ key: "a", label: "Alpha" }];
    const view = render(timeline(first, scrollRef), { container: scrollElement });

    virtualizerState.scrollToIndex.mockClear();
    view.rerender(timeline([...first, { key: "b", label: "Beta" }], scrollRef));
    expect(virtualizerState.scrollToIndex).toHaveBeenCalledWith(1, { align: "end" });

    virtualizerState.scrollToIndex.mockClear();
    metrics.scrollTop = 500;
    fireEvent.scroll(scrollElement);
    view.rerender(timeline([...first, { key: "b", label: "Beta" }, { key: "c", label: "Gamma" }], scrollRef));
    expect(virtualizerState.scrollToIndex).not.toHaveBeenCalled();
  });

  test("suppresses duplicate leading loads and preserves scroll height across a prepend", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const metrics = { scrollHeight: 600, clientHeight: 300, scrollTop: 100 };
    const onLoadBefore = vi.fn();
    setScrollMetrics(scrollElement, metrics);
    const existing = [{ key: "b", label: "Beta" }, { key: "c", label: "Gamma" }];
    const props = { hasMoreBefore: true, isLoadingBefore: false, onLoadBefore };
    const view = render(timeline(existing, scrollRef, props), { container: scrollElement });

    fireEvent.scroll(scrollElement);
    fireEvent.scroll(scrollElement);
    expect(onLoadBefore).toHaveBeenCalledTimes(1);

    metrics.scrollHeight = 900;
    view.rerender(timeline([{ key: "a", label: "Alpha" }, ...existing], scrollRef, props));
    expect(metrics.scrollTop).toBe(400);
  });

  test("navigates by stable key and exposes viewport anchor capture and restore", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const metrics = { scrollHeight: 600, clientHeight: 300, scrollTop: 100 };
    const handle = React.createRef<AgentTimelineHandle>();
    setScrollMetrics(scrollElement, metrics);
    Object.defineProperty(scrollElement, "getBoundingClientRect", {
      value: () => ({ top: 0, bottom: 300, left: 0, right: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} }),
    });

    const view = render(
      <AgentTimeline
        ref={handle}
        entries={[{ key: "a", label: "Alpha" }, { key: "b", label: "Beta" }]}
        scrollRef={scrollRef}
        renderEntry={(entry) => <span>{entry.label}</span>}
      />,
      { container: scrollElement },
    );
    const nodes = view.container.querySelectorAll<HTMLElement>("[data-agent-timeline-key]");
    Object.defineProperty(nodes[0], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: -40, bottom: 60, left: 0, right: 300, width: 300, height: 100, x: 0, y: -40, toJSON() {} }),
    });

    expect(handle.current?.scrollToKey("b")).toBe(true);
    expect(virtualizerState.scrollToIndex).toHaveBeenCalledWith(1, { align: "start", behavior: "auto" });
    const anchor = handle.current?.captureViewportAnchor();
    expect(anchor).toEqual({ entryKey: "a", offsetTop: -40 });

    Object.defineProperty(nodes[0], "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 10, bottom: 110, left: 0, right: 300, width: 300, height: 100, x: 0, y: 10, toJSON() {} }),
    });
    expect(handle.current?.restoreViewportAnchor(anchor ?? null)).toBe(true);
    expect(metrics.scrollTop).toBe(150);
    expect(handle.current?.scrollToKey("missing")).toBe(false);
  });

  test("follows content and mobile viewport resizes at the tail, then cleans up", () => {
    const scrollElement = document.createElement("div");
    const scrollRef = { current: scrollElement };
    const metrics = { scrollHeight: 600, clientHeight: 300, scrollTop: 300 };
    const visualViewport = new EventTarget();
    Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
    setScrollMetrics(scrollElement, metrics);
    const view = render(
      timeline([{ key: "a", label: "Alpha" }], scrollRef),
      { container: scrollElement },
    );
    virtualizerState.scrollToIndex.mockClear();

    metrics.scrollHeight = 700;
    ResizeObserverMock.instances[0]?.callback([], ResizeObserverMock.instances[0] as unknown as ResizeObserver);
    metrics.clientHeight = 250;
    visualViewport.dispatchEvent(new Event("resize"));
    expect(virtualizerState.scrollToIndex).toHaveBeenCalledTimes(2);

    const observer = ResizeObserverMock.instances[0];
    view.unmount();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    virtualizerState.scrollToIndex.mockClear();
    visualViewport.dispatchEvent(new Event("resize"));
    expect(virtualizerState.scrollToIndex).not.toHaveBeenCalled();
  });
});
