import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/sync/session-ui-store', () => ({ useSessionUIStore: { getState: () => ({ currentSessionId: null }) } }));
vi.mock('@/sync/sync-refs', () => ({ getSyncSessions: () => [] }));
vi.mock('@/stores/useDialogStore', () => ({ useDialogStore: { getState: () => ({}) } }));
vi.mock('@/stores/useUIStore', () => ({ useUIStore: { getState: () => ({ eventStreamStatus: 'connected' }) } }));

import { buildOpenCodeStatusReport } from './openCodeStatus';

afterEach(() => vi.unstubAllGlobals());

describe('OpenCode resolution diagnostic contract', () => {
  it('rejects a malformed 2xx resolution wrapper without rendering its body', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://openchamber.test' } });
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('/api/config/opencode-resolution')) return new Response(JSON.stringify({ launchArgs: [1] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const report = await buildOpenCodeStatusReport();
    expect(report).toContain('resolution-endpoint: invalid json-shape');
    expect(report).not.toContain('launchArgs');
  });
});
