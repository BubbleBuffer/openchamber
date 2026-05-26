import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createBoundedMap, createBoundedSet } from './bounded-cache.js';

// ---------------------------------------------------------------------------
// createBoundedMap
// ---------------------------------------------------------------------------
describe('createBoundedMap', () => {
  /** @type {import('./bounded-cache.js').createBoundedMap<number, string>} */
  let cache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = createBoundedMap({ maxSize: 3, ttlMs: 1000, sweepIntervalMs: 5000 });
  });

  afterEach(() => {
    cache?.dispose();
    vi.useRealTimers();
  });

  it('set and get a value', () => {
    cache.set(1, 'one');
    expect(cache.get(1)).toBe('one');
  });

  it('get returns undefined for missing key', () => {
    expect(cache.get('nope')).toBeUndefined();
  });

  it('has returns true for existing key', () => {
    cache.set('a', 1);
    expect(cache.has('a')).toBe(true);
  });

  it('has returns false for missing key', () => {
    expect(cache.has('missing')).toBe(false);
  });

  it('delete removes an entry and returns true when found', () => {
    cache.set('x', 10);
    expect(cache.delete('x')).toBe(true);
    expect(cache.has('x')).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('delete returns false for non-existent key', () => {
    expect(cache.delete('nope')).toBe(false);
  });

  it('clear removes all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.size).toBe(3);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(false);
  });

  it('size reflects the number of entries', () => {
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    expect(cache.size).toBe(1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
    cache.delete('a');
    expect(cache.size).toBe(1);
  });

  it('get returns undefined for TTL-expired entry', () => {
    cache.set('k', 'value');
    vi.advanceTimersByTime(1001); // past ttlMs
    expect(cache.get('k')).toBeUndefined();
  });

  it('has returns false for TTL-expired entry', () => {
    cache.set('k', 'value');
    vi.advanceTimersByTime(1001);
    expect(cache.has('k')).toBe(false);
  });

  it('evicts stale entries on sweep interval', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    vi.advanceTimersByTime(1001); // past ttlMs
    // get on 'a' returns undefined — get path evicts
    expect(cache.get('a')).toBeUndefined();
    // but 'b' is still in store (just stale)
    expect(cache.has('b')).toBe(false);
    // advance to trigger sweep
    vi.advanceTimersByTime(5000);
    expect(cache.size).toBe(0);
  });

  it('lru evicts least-recently-accessed when maxSize exceeded', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // access 'a' to make it most-recent
    cache.get('a');
    // insert 'd' — should evict 'b' (least-recent)
    cache.set('d', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.has('d')).toBe(true);
    expect(cache.size).toBe(3);
  });

  it('lru eviction respects most recent set', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    // re-set 'a' — should make it most-recent
    cache.set('a', 10);
    // insert 'd' — should evict 'b'
    cache.set('d', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(10);
  });

  it('entries() skips expired entries and updates access order', () => {
    cache.set('stale', 'no');
    vi.advanceTimersByTime(600); // still within TTL
    cache.set('fresh', 'yes');
    vi.advanceTimersByTime(600); // stale is past TTL (1200 > 1000), fresh is not (600 < 1000)
    const result = [...cache.entries()];
    expect(result).toEqual([['fresh', 'yes']]);
  });

  it('keys() returns only non-expired keys', () => {
    cache.set('dead', 2);
    vi.advanceTimersByTime(600);
    cache.set('live', 1);
    vi.advanceTimersByTime(600); // dead is past TTL, live is not
    expect([...cache.keys()]).toEqual(['live']);
  });

  it('values() returns only non-expired values', () => {
    cache.set('dead', 200);
    vi.advanceTimersByTime(600);
    cache.set('live', 100);
    vi.advanceTimersByTime(600); // dead is past TTL, live is not
    expect([...cache.values()]).toEqual([100]);
  });

  it('forEach iterates over non-expired entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    vi.advanceTimersByTime(500);
    cache.set('c', 3);
    const results = [];
    cache.forEach((v, k) => results.push([k, v]));
    expect(results).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });

  it('dispose stops the sweep timer and clears the store', () => {
    cache.set('a', 1);
    cache.dispose();
    expect(cache.size).toBe(0);
    // advance far past sweep interval — should not throw
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// createBoundedSet
// ---------------------------------------------------------------------------
describe('createBoundedSet', () => {
  /** @type {import('./bounded-cache.js').createBoundedSet<string>} */
  let set;

  beforeEach(() => {
    vi.useFakeTimers();
    set = createBoundedSet({ maxSize: 3, ttlMs: 1000, sweepIntervalMs: 5000 });
  });

  afterEach(() => {
    set?.dispose();
    vi.useRealTimers();
  });

  it('add and has a value', () => {
    set.add('hello');
    expect(set.has('hello')).toBe(true);
  });

  it('has returns false for value not in set', () => {
    expect(set.has('nope')).toBe(false);
  });

  it('has returns false for TTL-expired value', () => {
    set.add('temp');
    vi.advanceTimersByTime(1001);
    expect(set.has('temp')).toBe(false);
  });

  it('delete removes a value and returns true', () => {
    set.add('x');
    expect(set.delete('x')).toBe(true);
    expect(set.has('x')).toBe(false);
  });

  it('delete returns false for non-existent value', () => {
    expect(set.delete('nope')).toBe(false);
  });

  it('clear removes all values', () => {
    set.add('a');
    set.add('b');
    set.add('c');
    expect(set.size).toBe(3);
    set.clear();
    expect(set.size).toBe(0);
  });

  it('size reflects the number of entries', () => {
    expect(set.size).toBe(0);
    set.add('a');
    expect(set.size).toBe(1);
    set.add('b');
    expect(set.size).toBe(2);
    set.delete('a');
    expect(set.size).toBe(1);
  });

  it('lru eviction when maxSize exceeded', () => {
    set.add('a');
    set.add('b');
    set.add('c');
    set.add('d'); // should evict 'a'
    expect(set.has('a')).toBe(false);
    expect(set.has('b')).toBe(true);
    expect(set.has('c')).toBe(true);
    expect(set.has('d')).toBe(true);
    expect(set.size).toBe(3);
  });

  it('Symbol.iterator yields all values', () => {
    set.add('a');
    set.add('b');
    set.add('c');
    expect([...set]).toEqual(['a', 'b', 'c']);
  });

  it('forEach iterates values', () => {
    set.add('x');
    set.add('y');
    const acc = [];
    set.forEach((v) => acc.push(v));
    expect(acc).toEqual(['x', 'y']);
  });

  it('dispose clears the set and stops sweep', () => {
    set.add('keep');
    set.dispose();
    expect(set.size).toBe(0);
    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
  });
});
