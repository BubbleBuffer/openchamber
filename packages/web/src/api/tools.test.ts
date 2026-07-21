import { describe, expect, test, vi } from 'vitest';
import { createWebToolsAPI, parseToolIdList } from './tools';

describe('web tools API SDK adapter', () => {
  test('decodes only the required upstream tool ID list shape', async () => {
    expect(parseToolIdList(['read', 'invalid', 'write'])).toEqual(['read', 'write']);
    expect(parseToolIdList(['read', 1])).toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ['read', 1],
    } as Response);

    await expect(createWebToolsAPI().getAvailableTools()).rejects.toThrow('Tools API returned invalid data format');
  });
});
