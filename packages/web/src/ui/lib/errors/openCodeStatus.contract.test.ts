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

  it('preserves nullable WSL diagnostics from a valid resolution wrapper', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://openchamber.test' } });
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' });
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('/api/config/opencode-resolution')) return new Response(JSON.stringify({ configured: null, resolved: null, resolvedDir: null, source: null, detectedNow: null, detectedSourceNow: null, launchBinary: null, launchArgs: [], launchWrapperType: null, viaWsl: true, wslBinary: null, wslPath: '/mnt/c/opencode', wslDistro: null, node: null, bun: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const report = await buildOpenCodeStatusReport();
    expect(report).toContain('via-wsl: true');
    expect(report).toContain('wsl-path: /mnt/c/opencode');
  });
});
