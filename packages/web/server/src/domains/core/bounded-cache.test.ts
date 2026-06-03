import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createBoundedMap, createBoundedSet } from "./bounded-cache.js";

describe("createBoundedMap", () => {
  let cache: ReturnType<typeof createBoundedMap>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createBoundedMap({ maxSize: 3, ttlMs: 1000, sweepIntervalMs: 5000 });
  });

  afterEach(() => {
    cache?.dispose();
    vi.useRealTimers();
  });

  it("set and get a value", () => {
    cache.set(1, "one");
    expect(cache.get(1)).toBe("one");
  });

  it("get returns undefined for missing key", () => {
    expect(cache.get("nope" as unknown as number)).toBeUndefined();
  });

  it("has returns true for existing key", () => {
    cache.set("a" as unknown as number, 1);
    expect(cache.has("a" as unknown as number)).toBe(true);
  });

  it("has returns false for missing key", () => {
    expect(cache.has("missing" as unknown as number)).toBe(false);
  });

  it("delete removes an entry and returns true when found", () => {
    cache.set("x" as unknown as number, 10);
    expect(cache.delete("x" as unknown as number)).toBe(true);
    expect(cache.has("x" as unknown as number)).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("delete returns false for non-existent key", () => {
    expect(cache.delete("nope" as unknown as number)).toBe(false);
  });

  it("clear removes all entries", () => {
    const c = createBoundedMap<string, number>({ maxSize: 10, ttlMs: 1000, sweepIntervalMs: 5000 });
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    expect(c.size).toBe(3);
    c.clear();
    expect(c.size).toBe(0);
    expect(c.has("a")).toBe(false);
    expect(c.has("b")).toBe(false);
    expect(c.has("c")).toBe(false);
    c.dispose();
  });

  it("size reflects the number of entries", () => {
    expect(cache.size).toBe(0);
    cache.set("a" as unknown as number, 1);
    expect(cache.size).toBe(1);
    cache.set("b" as unknown as number, 2);
    expect(cache.size).toBe(2);
    cache.delete("a" as unknown as number);
    expect(cache.size).toBe(1);
  });

  it("get returns undefined for TTL-expired entry", () => {
    cache.set("k" as unknown as number, "value");
    vi.advanceTimersByTime(1001);
    expect(cache.get("k" as unknown as number)).toBeUndefined();
  });

  it("has returns false for TTL-expired entry", () => {
    cache.set("k" as unknown as number, "value");
    vi.advanceTimersByTime(1001);
    expect(cache.has("k" as unknown as number)).toBe(false);
  });

  it("evicts stale entries on sweep interval", () => {
    cache.set("a" as unknown as number, 1);
    cache.set("b" as unknown as number, 2);
    vi.advanceTimersByTime(1001);
    expect(cache.get("a" as unknown as number)).toBeUndefined();
    expect(cache.has("b" as unknown as number)).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(cache.size).toBe(0);
  });

  it("lru evicts least-recently-accessed when maxSize exceeded", () => {
    cache.set("a" as unknown as number, 1);
    cache.set("b" as unknown as number, 2);
    cache.set("c" as unknown as number, 3);
    cache.get("a" as unknown as number);
    cache.set("d" as unknown as number, 4);
    expect(cache.has("b" as unknown as number)).toBe(false);
    expect(cache.has("a" as unknown as number)).toBe(true);
    expect(cache.has("c" as unknown as number)).toBe(true);
    expect(cache.has("d" as unknown as number)).toBe(true);
    expect(cache.size).toBe(3);
  });

  it("lru eviction respects most recent set", () => {
    cache.set("a" as unknown as number, 1);
    cache.set("b" as unknown as number, 2);
    cache.set("c" as unknown as number, 3);
    cache.set("a" as unknown as number, 10);
    cache.set("d" as unknown as number, 4);
    expect(cache.has("b" as unknown as number)).toBe(false);
    expect(cache.get("a" as unknown as number)).toBe(10);
  });

  it("entries() skips expired entries and updates access order", () => {
    cache.set("stale" as unknown as number, "no");
    vi.advanceTimersByTime(600);
    cache.set("fresh" as unknown as number, "yes");
    vi.advanceTimersByTime(600);
    const result = [...cache.entries()];
    expect(result).toEqual([["fresh" as unknown as number, "yes"]]);
  });

  it("keys() returns only non-expired keys", () => {
    cache.set("dead" as unknown as number, 2);
    vi.advanceTimersByTime(600);
    cache.set("live" as unknown as number, 1);
    vi.advanceTimersByTime(600);
    expect([...cache.keys()]).toEqual(["live" as unknown as number]);
  });

  it("values() returns only non-expired values", () => {
    cache.set("dead" as unknown as number, 200);
    vi.advanceTimersByTime(600);
    cache.set("live" as unknown as number, 100);
    vi.advanceTimersByTime(600);
    expect([...cache.values()]).toEqual([100]);
  });

  it("forEach iterates over non-expired entries", () => {
    cache.set("a" as unknown as number, 1);
    cache.set("b" as unknown as number, 2);
    vi.advanceTimersByTime(500);
    cache.set("c" as unknown as number, 3);
    const results: Array<[unknown, unknown]> = [];
    cache.forEach((v, k) => results.push([k, v]));
    expect(results).toEqual([
      ["a" as unknown as number, 1],
      ["b" as unknown as number, 2],
      ["c" as unknown as number, 3],
    ]);
  });

  it("dispose stops the sweep timer and clears the store", () => {
    cache.set("a" as unknown as number, 1);
    cache.dispose();
    expect(cache.size).toBe(0);
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});

describe("createBoundedSet", () => {
  let set: ReturnType<typeof createBoundedSet<string>>;

  beforeEach(() => {
    vi.useFakeTimers();
    set = createBoundedSet({ maxSize: 3, ttlMs: 1000, sweepIntervalMs: 5000 });
  });

  afterEach(() => {
    set?.dispose();
    vi.useRealTimers();
  });

  it("add and has a value", () => {
    set.add("hello");
    expect(set.has("hello")).toBe(true);
  });

  it("has returns false for value not in set", () => {
    expect(set.has("nope")).toBe(false);
  });

  it("has returns false for TTL-expired value", () => {
    set.add("temp");
    vi.advanceTimersByTime(1001);
    expect(set.has("temp")).toBe(false);
  });

  it("delete removes a value and returns true", () => {
    set.add("x");
    expect(set.delete("x")).toBe(true);
    expect(set.has("x")).toBe(false);
  });

  it("delete returns false for non-existent value", () => {
    expect(set.delete("nope")).toBe(false);
  });

  it("clear removes all values", () => {
    set.add("a");
    set.add("b");
    set.add("c");
    expect(set.size).toBe(3);
    set.clear();
    expect(set.size).toBe(0);
  });

  it("size reflects the number of entries", () => {
    expect(set.size).toBe(0);
    set.add("a");
    expect(set.size).toBe(1);
    set.add("b");
    expect(set.size).toBe(2);
    set.delete("a");
    expect(set.size).toBe(1);
  });

  it("lru eviction when maxSize exceeded", () => {
    set.add("a");
    set.add("b");
    set.add("c");
    set.add("d");
    expect(set.has("a")).toBe(false);
    expect(set.has("b")).toBe(true);
    expect(set.has("c")).toBe(true);
    expect(set.has("d")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("Symbol.iterator yields all values", () => {
    set.add("a");
    set.add("b");
    set.add("c");
    expect([...set]).toEqual(["a", "b", "c"]);
  });

  it("forEach iterates values", () => {
    set.add("x");
    set.add("y");
    const acc: string[] = [];
    set.forEach((v) => acc.push(v));
    expect(acc).toEqual(["x", "y"]);
  });

  it("dispose clears the set and stops sweep", () => {
    set.add("keep");
    set.dispose();
    expect(set.size).toBe(0);
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});
