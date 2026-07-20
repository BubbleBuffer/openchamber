import type { PushAPI, PushSubscribePayload, PushUnsubscribePayload } from '@/lib/api/types';
import { parsePushResponse } from '@contracts/notifications';

const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<T | null> => {
  try {
    const res = await fetch(input, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      return null;
    }

    const payload = await res.json().catch(() => undefined);
    const parsed = parsePushResponse(payload);
    return parsed.ok ? parsed.value as T : null;
  } catch {
    return null;
  }
};

export const createWebPushAPI = (): PushAPI => ({
  async getVapidPublicKey() {
    try {
      const res = await fetch('/api/push/vapid-public-key', { credentials: 'include', headers: { Accept: 'application/json' } });
      const value = await res.json().catch(() => undefined);
      return res.ok && value && typeof value.publicKey === 'string' ? { publicKey: value.publicKey } : null;
    } catch {
      return null;
    }
  },

  async subscribe(payload: PushSubscribePayload) {
    return fetchJson<{ ok: true }>('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async unsubscribe(payload: PushUnsubscribePayload) {
    return fetchJson<{ ok: true }>('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async setVisibility(payload: { visible: boolean }) {
    return fetchJson<{ ok: true }>('/api/push/visibility', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  },
});
