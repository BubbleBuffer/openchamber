import { describe, expect, it, vi } from 'vitest';

import { createCommands } from './create-commands.js';

function makeOutput() {
  return {
    stdout: { write: vi.fn() },
    shouldRenderHumanOutput: () => false,
    isJsonMode: (options) => Boolean(options.json),
    isQuietMode: (options) => Boolean(options.quiet),
    createSpinner: () => null,
  };
}

describe('CLI command composition', () => {
  it('injects the lifecycle owners into restart without a circular command import', async () => {
    const calls = [];
    const instance = { port: 3000, launchMode: 'daemon', instanceFilePath: 'instance.json' };
    const commands = createCommands({
      paths: { getPackageRoot: () => '/package' },
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [instance]),
        readInstanceRecord: () => ({ port: 3000 }),
      },
      processRuntime: {},
      logFiles: {},
      output: makeOutput(),
      serve: async (options) => { calls.push(['serve', options]); return 3000; },
      stop: async (options) => { calls.push(['stop', options]); return []; },
      packageManagerAdapter: async () => ({
        getCurrentVersion: () => '1.0.0',
        checkForUpdates: async () => ({ available: false, version: '1.0.0' }),
        detectPackageManager: () => 'npm',
        executeUpdate: () => ({ success: true, exitCode: 0 }),
      }),
    });

    await commands.restart({ quiet: true });

    expect(commands).toEqual(expect.objectContaining({ serve: expect.any(Function), stop: expect.any(Function), restart: expect.any(Function), update: expect.any(Function) }));
    expect(calls[0][0]).toBe('stop');
    expect(calls[1][0]).toBe('serve');
  });
});
