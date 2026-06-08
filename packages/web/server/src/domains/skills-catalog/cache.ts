const DEFAULT_TTL_MS = 30 * 60 * 1000;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();

export function getCacheKey({
  normalizedRepo,
  subpath,
  identityId,
}: {
  normalizedRepo?: string;
  subpath?: string;
  identityId?: string;
}): string {
  const safeRepo = String(normalizedRepo || "").trim();
  const safeSubpath = String(subpath || "").trim();
  const safeIdentity = String(identityId || "").trim();
  return `${safeRepo}::${safeSubpath}::${safeIdentity}`;
}

export function getCachedScan(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedScan(
  key: string,
  value: unknown,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  const ttl = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS;
  cache.set(key, { expiresAt: Date.now() + ttl, value });
}

export function clearCache(): void {
  cache.clear();
}
