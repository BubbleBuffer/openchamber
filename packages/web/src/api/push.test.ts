import { afterEach, describe, expect, test, vi } from 'vitest';
import { createWebPushAPI } from './push';

describe('web push API', () => {
  afterEach(() => vi.restoreAllMocks());

  test('uses browser subscribe, unsubscribe, and visibility endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => (
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));
    const api = createWebPushAPI();
    const subscription = { endpoint: 'https://push.example/sub', keys: { auth: 'a', p256dh: 'p' } };

    await expect(api.subscribe(subscription)).resolves.toEqual({ ok: true });
    await expect(api.unsubscribe({ endpoint: subscription.endpoint })).resolves.toEqual({ ok: true });
    await expect(api.setVisibility({ visible: false })).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      ['/api/push/subscribe', 'POST'],
      ['/api/push/subscribe', 'DELETE'],
      ['/api/push/visibility', 'POST'],
    ]);
  });

  test('fails safely for malformed successful, auth-error, and thrown push responses', async () => {
    const api = createWebPushAPI();
    const subscription = { endpoint: 'https://push.example/sub', keys: { auth: 'a', p256dh: 'p' } };
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: 'yes' }), { status: 200 }));
    await expect(api.subscribe(subscription)).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(api.unsubscribe({ endpoint: subscription.endpoint })).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(api.setVisibility({ visible: true })).resolves.toBeNull();
  });
});
