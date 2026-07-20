import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTerminalSession, resizeTerminal } from './terminalApi';

describe('terminal API contracts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects malformed terminal session responses before configuring transport', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: 'terminal-1' }), { status: 200 })));
    await expect(createTerminalSession({ cwd: '/work' })).rejects.toThrow('Malformed terminal session response');
  });

  it('decodes coded terminal failures and rejects malformed success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Terminal request failed', code: 'terminal_invalid_request' }), { status: 400 })));
    await expect(resizeTerminal('terminal-1', 80, 24)).rejects.toThrow('Terminal request failed');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 200 })));
    await expect(resizeTerminal('terminal-1', 80, 24)).rejects.toThrow('Failed to resize terminal');
  });
});
