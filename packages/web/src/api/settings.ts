import type { SettingsAPI, SettingsLoadResult, SettingsPayload } from '@/lib/api/types';
import { parseAppSettingsResponse, parseSettingsUpdateRequest } from '@contracts/settings';

const SETTINGS_ENDPOINT = '/api/config/settings';
const RELOAD_ENDPOINT = '/api/config/reload';

const sanitizePayload = (data: unknown): SettingsPayload => {
  const parsed = parseAppSettingsResponse(data);
  if (!parsed.ok) throw new Error('Invalid settings response');
  return parsed.value as SettingsPayload;
};

export const createWebSettingsAPI = (): SettingsAPI => ({
  async load(): Promise<SettingsLoadResult> {
    const response = await fetch(SETTINGS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to load settings: ${response.statusText}`);
    }

    const payload = sanitizePayload(await response.json().catch(() => ({})));
    return {
      settings: payload,
      source: 'web',
    };
  },

  async save(changes: Partial<SettingsPayload>): Promise<SettingsPayload> {
    const request = parseSettingsUpdateRequest(changes);
    if (!request.ok) throw new Error('Invalid settings request');
    const response = await fetch(SETTINGS_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request.value),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to save settings');
    }

    const payload = sanitizePayload(await response.json().catch(() => ({})));
    return payload;
  },

  async restartOpenCode(): Promise<{ restarted: boolean }> {
    const response = await fetch(RELOAD_ENDPOINT, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to restart OpenCode');
    }
    return { restarted: true };
  },
});
