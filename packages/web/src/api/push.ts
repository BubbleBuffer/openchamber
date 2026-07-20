import { parsePushResponse, parseVapidPublicKeyResponse } from '@contracts/notifications';
import type {
  PushResponse,
  PushSubscribeRequest,
  PushUnsubscribeRequest,
  PushVisibilityRequest,
  VapidPublicKeyResponse,
} from '@contracts/notifications';

export type PushSubscribePayload = PushSubscribeRequest & { origin?: string };
export type PushUnsubscribePayload = PushUnsubscribeRequest;
export interface PushAPI {
  getVapidPublicKey(): Promise<VapidPublicKeyResponse | null>;
  subscribe(payload: PushSubscribePayload): Promise<PushResponse | null>;
  unsubscribe(payload: PushUnsubscribePayload): Promise<PushResponse | null>;
  setVisibility(payload: PushVisibilityRequest): Promise<PushResponse | null>;
}

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
      const parsed = parseVapidPublicKeyResponse(await res.json().catch(() => undefined));
      return res.ok && parsed.ok ? parsed.value : null;
    } catch {
      return null;
    }
  },

  async subscribe(payload: PushSubscribePayload) {
    return fetchJson<PushResponse>('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async unsubscribe(payload: PushUnsubscribePayload) {
    return fetchJson<PushResponse>('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  },

  async setVisibility(payload: PushVisibilityRequest) {
    return fetchJson<PushResponse>('/api/push/visibility', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  },
});
