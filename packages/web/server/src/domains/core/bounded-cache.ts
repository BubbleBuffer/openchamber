export interface BoundedCacheOptions {
  maxSize?: number;
  ttlMs: number;
  sweepIntervalMs?: number;
}

export interface BoundedMap<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  readonly size: number;
  entries(): IterableIterator<[K, V]>;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  forEach(fn: (value: V, key: K) => void): void;
  dispose(): void;
}

export interface BoundedSet<T> {
  add(value: T): void;
  has(value: T): boolean;
  delete(value: T): boolean;
  clear(): void;
  readonly size: number;
  forEach(fn: (value: T) => void): void;
  values(): IterableIterator<T>;
  [Symbol.iterator](): IterableIterator<T>;
  dispose(): void;
}

interface StoreEntry<V> {
  value: V;
  createdAt: number;
}

export function createBoundedMap<K = unknown, V = unknown>({
  maxSize = 1000,
  ttlMs,
  sweepIntervalMs = 60000,
}: BoundedCacheOptions): BoundedMap<K, V> {
  const store = new Map<K, StoreEntry<V>>();
  const accessOrder: K[] = [];
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  const now = (): number => Date.now();

  const evictStale = (): void => {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of store) {
      if (entry.createdAt <= cutoff) {
        store.delete(key);
        const idx = accessOrder.indexOf(key);
        if (idx !== -1) accessOrder.splice(idx, 1);
      }
    }
  };

  const evictLru = (): void => {
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
  };

  const touch = (key: K): void => {
    const idx = accessOrder.indexOf(key);
    if (idx !== -1) accessOrder.splice(idx, 1);
    accessOrder.push(key);
  };

  const startSweep = (): void => {
    if (sweepTimer) return;
    sweepTimer = setInterval(evictStale, sweepIntervalMs);
    if (sweepTimer && typeof sweepTimer === "object" && "unref" in sweepTimer) {
      sweepTimer.unref();
    }
  };

  startSweep();

  return {
    get(key: K): V | undefined {
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

    set(key: K, value: V): void {
      store.set(key, { value, createdAt: now() });
      touch(key);
      evictLru();
    },

    has(key: K): boolean {
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

    delete(key: K): boolean {
      const idx = accessOrder.indexOf(key);
      if (idx !== -1) accessOrder.splice(idx, 1);
      return store.delete(key);
    },

    clear(): void {
      store.clear();
      accessOrder.length = 0;
    },

    get size(): number {
      return store.size;
    },

    *entries(): IterableIterator<[K, V]> {
      const cutoff = now() - ttlMs;
      for (const [key, entry] of store) {
        if (entry.createdAt > cutoff) {
          touch(key);
          yield [key, entry.value];
        }
      }
    },

    *keys(): IterableIterator<K> {
      for (const [key] of this.entries()) yield key;
    },

    *values(): IterableIterator<V> {
      for (const [, value] of this.entries()) yield value;
    },

    forEach(fn: (value: V, key: K) => void): void {
      for (const [key, value] of this.entries()) fn(value, key);
    },

    dispose(): void {
      if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
      }
      store.clear();
      accessOrder.length = 0;
    },
  };
}

export function createBoundedSet<T = unknown>(options: BoundedCacheOptions): BoundedSet<T> {
  const inner = createBoundedMap<T, boolean>(options);

  return {
    add(value: T): void {
      inner.set(value, true);
    },

    has(value: T): boolean {
      return inner.has(value);
    },

    delete(value: T): boolean {
      return inner.delete(value);
    },

    clear(): void {
      inner.clear();
    },

    get size(): number {
      return inner.size;
    },

    forEach(fn: (value: T) => void): void {
      for (const [value] of inner.entries()) fn(value);
    },

    *values(): IterableIterator<T> {
      for (const [value] of inner.entries()) yield value;
    },

    [Symbol.iterator](): IterableIterator<T> {
      return this.values();
    },

    dispose(): void {
      inner.dispose();
    },
  };
}
