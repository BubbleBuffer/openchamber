import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSkillsCatalogStore } from './useSkillsCatalogStore';

describe('skills catalog store transport contract', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => useSkillsCatalogStore.setState({ scanResults: null, lastScanError: null, isScanning: false }));
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('turns malformed scan success into a stable local failure', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, items: [{ skillName: 'missing transport fields' }] }), { status: 200 })) as unknown as typeof fetch;
    const result = await useSkillsCatalogStore.getState().scanRepo({ source: 'owner/repo' });
    expect(result.ok).toBe(false);
    expect(useSkillsCatalogStore.getState().scanResults).toBeNull();
  });
});
