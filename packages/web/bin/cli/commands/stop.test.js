import { describe, expect, it, vi } from 'vitest';

import { createStopCommand } from './stop.js';

function output() {
  return {
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
    shouldRenderHumanOutput: () => false,
    isJsonMode: (options) => Boolean(options.json),
    isQuietMode: (options) => Boolean(options.quiet),
    printJson: vi.fn(),
  };
}

describe('stop command', () => {
  it('requests graceful shutdown and only removes a verified instance record after success', async () => {
    const removed = [];
    const instance = { port: 3000, pid: 42, pidFilePath: '42.pid', instanceFilePath: '42.json' };
    const store = {
      discoverRunningInstances: vi.fn(async () => [instance]),
      removePidFile: (value) => removed.push(['pid', value]),
      removeInstanceFile: (value) => removed.push(['instance', value]),
    };
    const runtime = {
      requestServerShutdown: vi.fn(async () => true),
      stopInstanceProcess: vi.fn(async () => ({ stopped: true })),
      isProcessRunning: vi.fn(() => false),
    };
    const stop = createStopCommand({ instanceStore: store, processRuntime: runtime, output: output() });

    await stop({});

    expect(runtime.requestServerShutdown).toHaveBeenCalledWith(3000);
    expect(runtime.stopInstanceProcess).toHaveBeenCalledWith(instance, expect.objectContaining({ shutdownWaitMs: 5000 }));
    expect(removed).toEqual([['pid', '42.pid'], ['instance', '42.json']]);
  });
});
