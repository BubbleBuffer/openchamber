import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMagicPromptOverrides, invalidateMagicPromptOverridesCache } from './magicPrompts';

describe('magic prompt client contract', () => {
  afterEach(() => {
    invalidateMagicPromptOverridesCache();
    vi.unstubAllGlobals();
  });

  it('does not admit malformed override successes into the cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ version: '1', overrides: {} }) })));
    await expect(fetchMagicPromptOverrides()).rejects.toThrow('Malformed magic prompt response');
  });
});
