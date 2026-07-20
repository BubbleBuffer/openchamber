import { afterEach, describe, expect, it, vi } from 'vitest';
import { opencodeClient } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('OpenCode directory switch contract', () => {
  it('rejects a malformed 2xx response instead of fabricating a successful directory switch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    await expect(opencodeClient.setOpenCodeWorkingDirectory('/workspace/project')).rejects.toThrow('Invalid directory switch response');
  });
});
