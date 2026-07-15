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
});
