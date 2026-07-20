import { describe, expect, it } from 'vitest';
import { installSkillsFromRepository } from './install.js';

describe('repository skill installation path invariant', () => {
  it('rejects traversal before clone, checkout, or copy', async () => {
    const result = await installSkillsFromRepository({
      source: 'owner/repo', scope: 'user', userSkillDir: '/tmp/skills', selections: [{ skillDir: '../escape' }],
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalidSource' } });
  });

  it('permits a nested repository-relative selection to reach normal service validation', async () => {
    const result = await installSkillsFromRepository({
      source: '', scope: 'user', userSkillDir: '/tmp/skills', selections: [{ skillDir: 'skills/nested' }],
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalidSource', message: 'Repository source is required' } });
  });
});
