import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuotaStore } from './useQuotaStore';

const configured = { providerId: 'claude', providerName: 'Claude', ok: true, configured: true, usage: { windows: {} }, fetchedAt: 1 };

describe('quota store transport contract', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useQuotaStore.setState({ results: [], error: null, isFetchingProvider: {}, isLoading: false });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects malformed successful payloads without replacing unrelated state references', async () => {
    const selectedModels = useQuotaStore.getState().selectedModels;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ...configured, fetchedAt: 'bad' }), { status: 200 })) as unknown as typeof fetch;
    await useQuotaStore.getState().fetchProviderQuota('claude');
    const state = useQuotaStore.getState();
    expect(state.results[0]).toMatchObject({ providerId: 'claude', ok: false });
    expect(state.selectedModels).toBe(selectedModels);
  });

  it('preserves configured, unconfigured, provider-error, and partial result semantics', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ...configured, usage: { windows: {}, models: { 'gemini/pro': { windows: {} } } } }), { status: 200 })) as unknown as typeof fetch;
    await useQuotaStore.getState().fetchProviderQuota('claude');
    expect(useQuotaStore.getState().results[0]).toMatchObject({ ok: true, configured: true });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ...configured, ok: false, configured: false, usage: null, error: 'Not configured', errorCode: 'quota_unconfigured' }), { status: 200 })) as unknown as typeof fetch;
    await useQuotaStore.getState().fetchProviderQuota('claude');
    expect(useQuotaStore.getState().results[0]).toMatchObject({ configured: false, error: 'Not configured' });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Quota request failed', code: 'quota_provider_error' }), { status: 502 })) as unknown as typeof fetch;
    await useQuotaStore.getState().fetchProviderQuota('claude');
    expect(useQuotaStore.getState().error).toBe('quota_provider_error');
  });
});
