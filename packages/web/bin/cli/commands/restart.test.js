import { describe, expect, it, vi } from 'vitest';

import { createRestartCommand } from './restart.js';

describe('restart command', () => {
  it('injects stop and serve and preserves stored daemon options', async () => {
    const calls = [];
    const restart = createRestartCommand({
      instanceStore: {
        discoverRunningInstances: async () => [{ port: 3000, launchMode: 'daemon', instanceFilePath: 'instance.json' }],
        readInstanceRecord: () => ({ port: 3000, host: '127.0.0.1', uiPassword: 'secret' }),
      },
      stop: async (options) => calls.push(['stop', options]),
      serve: async (options) => { calls.push(['serve', options]); return 3000; },
      timers: { setTimeout: (callback) => { callback(); return 1; }, clearTimeout: vi.fn() },
      output: {
        stdout: { write: vi.fn() },
        shouldRenderHumanOutput: () => false,
        isJsonMode: () => false,
        isQuietMode: () => true,
      },
    });

    await restart({ quiet: true });

    expect(calls[0]).toEqual(['stop', expect.objectContaining({ port: 3000, explicitPort: true })]);
    expect(calls[1]).toEqual(['serve', expect.objectContaining({ port: 3000, host: '127.0.0.1', uiPassword: 'secret' })]);
  });

  it('does not serve a foreground instance because its process manager owns restart', async () => {
    const serve = vi.fn();
    const restart = createRestartCommand({
      instanceStore: {
        discoverRunningInstances: async () => [{ port: 3001, launchMode: 'foreground', instanceFilePath: 'instance.json' }],
        readInstanceRecord: () => ({ port: 3001 }),
      },
      stop: vi.fn(async () => []),
      serve,
      output: { stdout: { write: vi.fn() }, shouldRenderHumanOutput: () => false, isJsonMode: () => false, isQuietMode: () => false },
    });

    await restart({});
    expect(serve).not.toHaveBeenCalled();
  });
});
