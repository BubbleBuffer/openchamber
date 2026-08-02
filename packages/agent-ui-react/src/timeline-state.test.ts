import { describe, expect, test } from "vitest";

import {
  classifyTimelineChange,
  isScrollAtBottom,
  shouldLoadBefore,
} from "./timeline-state";

describe("timeline state", () => {
  test("classifies append, prepend, and replacement by stable keys", () => {
    expect(classifyTimelineChange([], ["a"])).toBe("initial");
    expect(classifyTimelineChange(["a"], ["a", "b"])).toBe("append");
    expect(classifyTimelineChange(["b"], ["a", "b"])).toBe("prepend");
    expect(classifyTimelineChange(["a"], ["x"])).toBe("replace");
    expect(classifyTimelineChange(["a"], ["a"])).toBe("stable");
  });

  test("measures bottom intent with overflow and a configurable threshold", () => {
    expect(isScrollAtBottom({ scrollHeight: 1_000, scrollTop: 700, clientHeight: 300 }, 80)).toBe(true);
    expect(isScrollAtBottom({ scrollHeight: 1_000, scrollTop: 610, clientHeight: 300 }, 80)).toBe(false);
    expect(isScrollAtBottom({ scrollHeight: 200, scrollTop: 0, clientHeight: 300 }, 80)).toBe(true);
  });

  test("requests older entries only at an enabled leading boundary", () => {
    expect(shouldLoadBefore({ startIndex: 2, thresholdIndex: 2, hasMore: true, isLoading: false })).toBe(true);
    expect(shouldLoadBefore({ startIndex: 3, thresholdIndex: 2, hasMore: true, isLoading: false })).toBe(false);
    expect(shouldLoadBefore({ startIndex: 0, thresholdIndex: 2, hasMore: false, isLoading: false })).toBe(false);
    expect(shouldLoadBefore({ startIndex: 0, thresholdIndex: 2, hasMore: true, isLoading: true })).toBe(false);
  });
});
