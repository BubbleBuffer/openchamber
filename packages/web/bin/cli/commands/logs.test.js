import { describe, expect, it, vi } from 'vitest';

import { createLogsCommand } from './logs.js';

function makeOutput() {
  return {
    stdout: { write: vi.fn() },
    printJson: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    logStatus: vi.fn(),
    shouldRenderHumanOutput: (options) => !options.json && !options.quiet,
    isJsonMode: (options) => Boolean(options.json),
    isQuietMode: (options) => Boolean(options.quiet),
  };
}

describe('logs command', () => {
  it('returns deterministic JSON only with --no-follow and selects latest/all instances', async () => {
    const output = makeOutput();
    const readTailLines = vi.fn(() => ['latest line']);
    const logs = createLogsCommand({
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [
          { port: 3000, startedAt: 1 },
          { port: 3001, startedAt: 2 },
        ]),
        getLatestInstance: vi.fn((instances) => instances[1]),
      },
      logFiles: {
        getLogFilePath: (port) => `/tmp/openchamber-${port}.log`,
        readTailLines,
        followFile: vi.fn(),
      },
      output,
    });

    await logs({ json: true, follow: false });
    expect(output.printJson).toHaveBeenCalledWith({
      entries: [{ port: 3001, logPath: '/tmp/openchamber-3001.log', lines: ['latest line'] }],
    });
    await expect(logs({ json: true, follow: true })).rejects.toThrow('--no-follow');
  });

  it('writes prefixed lines for every selected instance in quiet mode without following', async () => {
    const output = makeOutput();
    const logs = createLogsCommand({
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [{ port: 3000 }, { port: 3001 }]),
      },
      logFiles: {
        getLogFilePath: (port) => `/tmp/${port}.log`,
        readTailLines: (filePath) => [filePath],
        followFile: vi.fn(),
      },
      output,
    });

    await logs({ quiet: true, all: true, follow: false });

    expect(output.stdout.write).toHaveBeenCalledWith('[3000] /tmp/3000.log\n');
    expect(output.stdout.write).toHaveBeenCalledWith('[3001] /tmp/3001.log\n');
  });

  it('disposes all followers and signal listeners when follow is cancelled', async () => {
    const output = makeOutput();
    const listeners = new Map();
    const processLike = {
      on: vi.fn((signal, listener) => listeners.set(signal, listener)),
      off: vi.fn((signal, listener) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      }),
    };
    const dispose = [vi.fn(), vi.fn()];
    const logs = createLogsCommand({
      processLike,
      instanceStore: { discoverRunningInstances: vi.fn(async () => [{ port: 3000 }, { port: 3001 }]) },
      logFiles: {
        getLogFilePath: (port) => `/tmp/${port}.log`,
        readTailLines: () => [],
        followFile: vi.fn(() => dispose.shift()),
      },
      output,
    });

    const pending = logs({ follow: true, all: true });
    await Promise.resolve();
    listeners.get('SIGINT')();
    await pending;

    expect(dispose[0]).toBeUndefined();
    expect(processLike.off).toHaveBeenCalledTimes(2);
    expect([...listeners]).toHaveLength(0);
  });

  it('cleans already-created followers and listeners when a later follower fails', async () => {
    const output = makeOutput();
    const processLike = { on: vi.fn(), off: vi.fn() };
    const dispose = vi.fn();
    const logs = createLogsCommand({
      processLike,
      instanceStore: { discoverRunningInstances: vi.fn(async () => [{ port: 3000 }, { port: 3001 }]) },
      logFiles: {
        getLogFilePath: (port) => `/tmp/${port}.log`,
        readTailLines: () => [],
        followFile: vi.fn()
          .mockReturnValueOnce(dispose)
          .mockImplementationOnce(() => { throw new Error('follower failed'); }),
      },
      output,
    });

    await expect(logs({ follow: true, all: true })).rejects.toThrow('follower failed');
    expect(dispose).toHaveBeenCalledOnce();
    expect(processLike.off).toHaveBeenCalledTimes(2);
  });

  it('cleans the first signal listener when installing the second listener fails', async () => {
    const output = makeOutput();
    const on = vi.fn((signal) => {
      if (signal === 'SIGTERM') throw new Error('listener failed');
    });
    const processLike = { on, off: vi.fn() };
    const dispose = vi.fn();
    const logs = createLogsCommand({
      processLike,
      instanceStore: { discoverRunningInstances: vi.fn(async () => [{ port: 3000 }]) },
      logFiles: {
        getLogFilePath: () => '/tmp/3000.log',
        readTailLines: () => [],
        followFile: vi.fn(() => dispose),
      },
      output,
    });

    await expect(logs({ follow: true, all: true })).rejects.toThrow('listener failed');
    expect(processLike.off).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(dispose).not.toHaveBeenCalled();
  });
});
