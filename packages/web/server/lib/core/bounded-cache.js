// packages/web/server/lib/core/bounded-cache.js

/**
 * @template K, V
 * @param {{ maxSize?: number, ttlMs: number, sweepIntervalMs?: number }} options
 * @returns {{
 *   get: (key: K) => V | undefined,
 *   set: (key: K, value: V) => void,
 *   has: (key: K) => boolean,
 *   delete: (key: K) => boolean,
 *   clear: () => void,
 *   get size(): number,
 *   entries: () => IterableIterator<[K, V]>,
 *   keys: () => IterableIterator<K>,
 *   values: () => IterableIterator<V>,
 *   forEach: (fn: (value: V, key: K) => void) => void,
 *   dispose: () => void,
 * }}
 */
export function createBoundedMap({ maxSize = 1000, ttlMs, sweepIntervalMs = 60000 } = {}) {
  const store = new Map();
  const accessOrder = [];
  let sweepTimer = null;

  const now = () => Date.now();

  function evictStale() {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of store) {
      if (entry.createdAt <= cutoff) {
        store.delete(key);
        const idx = accessOrder.indexOf(key);
        if (idx !== -1) accessOrder.splice(idx, 1);
      }
    }
  }

  function evictLru() {
    let i = 0;
    while (store.size > maxSize && i < accessOrder.length) {
      const key = accessOrder[i];
      if (store.has(key)) {
        store.delete(key);
        accessOrder.splice(i, 1);
      } else {
        i++;
      }
    }
  }

  function touch(key) {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(key);
  }

  function startSweep() {
    if (sweepTimer) return;
    sweepTimer = setInterval(evictStale, sweepIntervalMs);
    if (sweepTimer && typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
      sweepTimer.unref();
    }
  }

  startSweep();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (now() - entry.createdAt > ttlMs) {
        store.delete(key);
        const idx = accessOrder.indexOf(key);
        if (idx !== -1) accessOrder.splice(idx, 1);
        return undefined;
      }
      touch(key);
      return entry.value;
    },
    set(key, value) {
      const entry = { value, createdAt: now() };
      store.set(key, entry);
      touch(key);
      evictLru();
    },
    has(key) {
      const entry = store.get(key);
      if (!entry) return false;
      if (now() - entry.createdAt > ttlMs) {
        store.delete(key);
        const idx = accessOrder.indexOf(key);
        if (idx !== -1) accessOrder.splice(idx, 1);
        return false;
      }
      return true;
    },
    delete(key) {
      const idx = accessOrder.indexOf(key);
      if (idx !== -1) accessOrder.splice(idx, 1);
      return store.delete(key);
    },
    clear() {
      store.clear();
      accessOrder.length = 0;
    },
    get size() {
      return store.size;
    },
    *entries() {
      const cutoff = now() - ttlMs;
      for (const [key, entry] of store) {
        if (entry.createdAt > cutoff) {
          touch(key);
          yield [key, entry.value];
        }
      }
    },
    *keys() {
      for (const [key] of this.entries()) yield key;
    },
    *values() {
      for (const [, value] of this.entries()) yield value;
    },
    forEach(fn) {
      for (const [key, value] of this.entries()) fn(value, key);
    },
    dispose() {
      if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
      }
      store.clear();
      accessOrder.length = 0;
    },
  };
}

/**
 * @template T
 * @param {{ maxSize?: number, ttlMs: number, sweepIntervalMs?: number }} options
 * @returns {{
 *   add: (value: T) => void,
 *   has: (value: T) => boolean,
 *   delete: (value: T) => boolean,
 *   clear: () => void,
 *   get size(): number,
 *   forEach: (fn: (value: T) => void) => void,
 *   values: () => IterableIterator<T>,
 *   [Symbol.iterator]: () => IterableIterator<T>,
 *   dispose: () => void,
 * }}
 */
export function createBoundedSet({ maxSize = 1000, ttlMs, sweepIntervalMs = 60000 } = {}) {
  const inner = createBoundedMap({ maxSize, ttlMs, sweepIntervalMs });

  return {
    add(value) {
      inner.set(value, true);
    },
    has(value) {
      return inner.has(value);
    },
    delete(value) {
      return inner.delete(value);
    },
    clear() {
      inner.clear();
    },
    get size() {
      return inner.size;
    },
    forEach(fn) {
      for (const [value] of inner.entries()) fn(value);
    },
    *values() {
      for (const [value] of inner.entries()) yield value;
    },
    [Symbol.iterator]() {
      return this.values();
    },
    dispose() {
      inner.dispose();
    },
  };
}
