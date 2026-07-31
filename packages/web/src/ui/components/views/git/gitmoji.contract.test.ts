import { describe, expect, it } from 'vitest';
import {
  filterGitmojis,
  matchGitmojiFromSubject,
  type GitmojiEntry,
} from './gitmoji-data';

const gitmojis: GitmojiEntry[] = [
  { emoji: '✨', code: ':sparkles:', description: 'Introduce new features' },
  { emoji: '🐛', code: ':bug:', description: 'Fix a bug' },
  { emoji: '⚡️', code: ':zap:', description: 'Improve performance' },
];

describe('gitmoji presentation', () => {
  it.each([
    ['feat(parser): add support', ':sparkles:'],
    ['fix!: prevent crash', ':bug:'],
    ['Optimize session loading', ':zap:'],
  ])('matches %s to %s', (subject, expectedCode) => {
    expect(matchGitmojiFromSubject(subject, gitmojis)?.code).toBe(expectedCode);
  });

  it('returns no match for an unknown subject', () => {
    expect(matchGitmojiFromSubject('Explain current behavior', gitmojis)).toBeNull();
  });

  it('filters case-insensitively across code and description', () => {
    expect(filterGitmojis(gitmojis, 'PERFORMANCE')).toEqual([gitmojis[2]]);
    expect(filterGitmojis(gitmojis, ':BUG:')).toEqual([gitmojis[1]]);
  });

  it('returns the complete list for an empty search', () => {
    expect(filterGitmojis(gitmojis, '   ')).toBe(gitmojis);
  });
});
