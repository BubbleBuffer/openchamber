export interface SkillDiscoveryCache<T> {
  get(directory: string | null): T;
  clear(directory?: string | null): void;
}

export function createSkillDiscoveryCache<T>(
  load: (directory: string | null) => T,
  ttlMs = 5_000,
  now: () => number = Date.now,
): SkillDiscoveryCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  const keyFor = (directory: string | null) => directory ?? "";

  return {
    get(directory) {
      const key = keyFor(directory);
      const cached = entries.get(key);
      const timestamp = now();
      if (cached && cached.expiresAt > timestamp) return cached.value;

      const value = load(directory);
      entries.set(key, { value, expiresAt: timestamp + ttlMs });
      return value;
    },
    clear(directory) {
      if (arguments.length === 0) {
        entries.clear();
        return;
      }
      entries.delete(keyFor(directory ?? null));
    },
  };
}
