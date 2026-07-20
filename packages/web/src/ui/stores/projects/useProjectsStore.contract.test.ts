import { afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectsStore } from './useProjectsStore';

describe('projects store transport contract', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects malformed successful icon mutations without changing project references', async () => {
    const projects = useProjectsStore.getState().projects;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ settings: 'invalid' }), { status: 200 })) as unknown as typeof fetch;

    const result = await useProjectsStore.getState().discoverProjectIcon('project-id');

    expect(result).toEqual({ ok: false, error: 'Invalid project icon response' });
    expect(useProjectsStore.getState().projects).toBe(projects);
  });

  it('uses coded server errors and safe transport errors', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Unsupported favicon format', code: 'project_assets_unsupported_media' }), { status: 415 })) as unknown as typeof fetch;
    await expect(useProjectsStore.getState().discoverProjectIcon('project-id')).resolves.toEqual({ ok: false, error: 'Unsupported favicon format' });

    globalThis.fetch = vi.fn(async () => { throw new Error('network details'); }) as unknown as typeof fetch;
    await expect(useProjectsStore.getState().discoverProjectIcon('project-id')).resolves.toEqual({ ok: false, error: 'Failed to discover project icon' });
  });
});
