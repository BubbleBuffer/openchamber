import { describe, expect, test } from "bun:test";

import {
  activityDurationMs,
  assertUniqueTimelineKeys,
  isJsonValue,
  normalizeTimestampMs,
  orderTimelineItems,
} from "./projection";

describe("agent UI core projections", () => {
  test("normalizes numeric and ISO timestamps", () => {
    expect(normalizeTimestampMs(42)).toBe(42);
    expect(normalizeTimestampMs("2026-07-31T10:00:00.000Z")).toBe(1785492000000);
    expect(() => normalizeTimestampMs("not-a-time")).toThrow("invalid timestamp");
  });

  test("computes bounded activity duration", () => {
    expect(activityDurationMs(100, 180)).toBe(80);
    expect(activityDurationMs(100)).toBeNull();
    expect(activityDurationMs(180, 100)).toBe(0);
  });

  test("orders timeline entries deterministically without mutating input", () => {
    const input = [
      { key: "b", occurredAtMs: 20 },
      { key: "c", occurredAtMs: 10 },
      { key: "a", occurredAtMs: 20 },
    ];
    expect(orderTimelineItems(input).map((item) => item.key)).toEqual(["c", "a", "b"]);
    expect(input.map((item) => item.key)).toEqual(["b", "c", "a"]);
  });

  test("rejects duplicate timeline keys", () => {
    expect(() => assertUniqueTimelineKeys([
      { key: "same", occurredAtMs: 1 },
      { key: "same", occurredAtMs: 2 },
    ])).toThrow("duplicate timeline key: same");
  });

  test("accepts JSON-safe extension detail and rejects runtime values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(isJsonValue({ nested: [true, 2, "text", null] })).toBe(true);
    expect(isJsonValue({ bad: undefined })).toBe(false);
    expect(isJsonValue(Number.NaN)).toBe(false);
    expect(isJsonValue(new Date())).toBe(false);
    expect(isJsonValue(cyclic)).toBe(false);
  });
});
