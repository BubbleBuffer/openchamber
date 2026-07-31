import React from 'react';

export type GitmojiEntry = {
  emoji: string;
  code: string;
  description: string;
};

type GitmojiCachePayload = {
  gitmojis: GitmojiEntry[];
  fetchedAt: number;
  version: string;
};

const GITMOJI_CACHE_KEY = 'gitmojiCache';
const GITMOJI_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GITMOJI_CACHE_VERSION = '1';
const GITMOJI_SOURCE_URL =
  'https://raw.githubusercontent.com/carloscuesta/gitmoji/master/packages/gitmojis/src/gitmojis.json';

const KEYWORD_MAP: Record<string, string> = {
  feat: ':sparkles:',
  feature: ':sparkles:',
  fix: ':bug:',
  bug: ':bug:',
  hotfix: ':ambulance:',
  docs: ':memo:',
  documentation: ':memo:',
  style: ':lipstick:',
  refactor: ':recycle:',
  perf: ':zap:',
  performance: ':zap:',
  test: ':white_check_mark:',
  tests: ':white_check_mark:',
  build: ':construction_worker:',
  ci: ':green_heart:',
  chore: ':wrench:',
  revert: ':rewind:',
  wip: ':construction:',
  security: ':lock:',
  release: ':bookmark:',
  merge: ':twisted_rightwards_arrows:',
  mv: ':truck:',
  move: ':truck:',
  rename: ':truck:',
  remove: ':fire:',
  delete: ':fire:',
  add: ':sparkles:',
  create: ':sparkles:',
  implement: ':sparkles:',
  update: ':recycle:',
  improve: ':zap:',
  optimize: ':zap:',
  upgrade: ':arrow_up:',
  downgrade: ':arrow_down:',
  deploy: ':rocket:',
  init: ':tada:',
  initial: ':tada:',
};

const isGitmojiEntry = (value: unknown): value is GitmojiEntry => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.emoji === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.description === 'string'
  );
};

const readGitmojiCache = (): GitmojiCachePayload | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GITMOJI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GitmojiCachePayload>;
    if (!parsed || parsed.version !== GITMOJI_CACHE_VERSION || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    if (!Array.isArray(parsed.gitmojis)) return null;
    const gitmojis = parsed.gitmojis.filter(isGitmojiEntry);
    return { gitmojis, fetchedAt: parsed.fetchedAt, version: parsed.version };
  } catch {
    return null;
  }
};

const writeGitmojiCache = (gitmojis: GitmojiEntry[]) => {
  if (typeof window === 'undefined') return;
  try {
    const payload: GitmojiCachePayload = {
      gitmojis,
      fetchedAt: Date.now(),
      version: GITMOJI_CACHE_VERSION,
    };
    window.localStorage.setItem(GITMOJI_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // The picker still works when storage is unavailable.
  }
};

const isGitmojiCacheFresh = (payload: GitmojiCachePayload) =>
  Date.now() - payload.fetchedAt < GITMOJI_CACHE_TTL_MS;

export const matchGitmojiFromSubject = (
  subject: string,
  gitmojis: GitmojiEntry[]
): GitmojiEntry | null => {
  const lowerSubject = subject.toLowerCase();
  const conventionalMatch = lowerSubject.match(/^([a-z]+)(?:\(.*\))?!?:/);
  const conventionalCode = conventionalMatch ? KEYWORD_MAP[conventionalMatch[1]] : undefined;

  if (conventionalCode) {
    return gitmojis.find((gitmoji) => gitmoji.code === conventionalCode) ?? null;
  }

  const firstWordCode = KEYWORD_MAP[lowerSubject.split(' ')[0]];
  if (firstWordCode) {
    return gitmojis.find((gitmoji) => gitmoji.code === firstWordCode) ?? null;
  }

  return null;
};

export const filterGitmojis = (gitmojis: GitmojiEntry[], search: string): GitmojiEntry[] => {
  const term = search.trim().toLowerCase();
  if (!term) return gitmojis;

  return gitmojis.filter(
    (entry) =>
      entry.emoji.includes(term) ||
      entry.code.toLowerCase().includes(term) ||
      entry.description.toLowerCase().includes(term)
  );
};

export const useGitmojis = (enabled: boolean): GitmojiEntry[] => {
  const [gitmojis, setGitmojis] = React.useState<GitmojiEntry[]>([]);

  React.useEffect(() => {
    if (!enabled) {
      setGitmojis([]);
      return;
    }

    let cancelled = false;
    const cached = readGitmojiCache();
    if (cached) {
      setGitmojis(cached.gitmojis);
      if (isGitmojiCacheFresh(cached)) {
        return () => {
          cancelled = true;
        };
      }
    }

    void (async () => {
      try {
        const response = await fetch(GITMOJI_SOURCE_URL);
        if (!response.ok) {
          throw new Error(`Failed to load gitmojis: ${response.statusText}`);
        }
        const payload = (await response.json()) as { gitmojis?: unknown[] };
        const nextGitmojis = Array.isArray(payload.gitmojis)
          ? payload.gitmojis.filter(isGitmojiEntry)
          : [];
        if (!cancelled) {
          setGitmojis(nextGitmojis);
          writeGitmojiCache(nextGitmojis);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load gitmoji list:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return gitmojis;
};
