import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillsStore } from './useSkillsStore';

describe('skills store transport contract', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => useSkillsStore.setState({ skills: [], isLoading: false, selectedSkillName: null }));
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('rejects malformed list success without replacing installed skills', async () => {
    const skills = [{ name: 'existing', path: '/skills/existing/SKILL.md', scope: 'user' as const, source: 'opencode' as const }];
    useSkillsStore.setState({ skills });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ skills: [{ name: 'bad' }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await useSkillsStore.getState().loadSkills()).toBe(false);
    expect(useSkillsStore.getState().skills).toBe(skills);
  });
});
