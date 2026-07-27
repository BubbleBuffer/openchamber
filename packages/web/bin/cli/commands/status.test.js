import { describe, expect, it, vi } from 'vitest';

import { createStatusCommand } from './status.js';

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

describe('status command', () => {
  it('reports an empty instance service in JSON, quiet, and human modes', async () => {
    const output = makeOutput();
    const status = createStatusCommand({
      instanceStore: { discoverRunningInstances: vi.fn(async () => []) },
      output,
    });

    await status({ json: true });
    expect(output.printJson).toHaveBeenCalledWith({ state: 'stopped', runningCount: 0, instances: [] });

    await status({ quiet: true });
    expect(output.stdout.write).toHaveBeenCalledWith('stopped\n');

    await status({});
    expect(output.logStatus).toHaveBeenCalledWith('warning', 'stopped');
  });

  it('normalizes malformed records from the instance service', async () => {
    const output = makeOutput();
    const status = createStatusCommand({
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [
          { port: 3001, pid: 42, launchMode: 'foreground', hasUiPassword: true },
          { port: 'bad', pid: 'bad', launchMode: 'unknown', uiPassword: '' },
        ]),
        readInstanceRecord: vi.fn(() => ({ uiPassword: 'secret' })),
      },
      output,
    });

    await status({ json: true });

    expect(output.printJson).toHaveBeenCalledWith({
      state: 'running',
      runningCount: 1,
      instances: [{ runtime: 'cli', port: 3001, pid: 42, launchMode: 'foreground', passwordProtected: true }],
    });
  });

  it('reports maintained web records and omits removed desktop or unknown runtimes', async () => {
    const output = makeOutput();
    const status = createStatusCommand({
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [
          { port: 3001, pid: 42, runtime: 'web' },
          { port: 3002, pid: 43, runtime: 'desktop' },
          { port: 3003, pid: 44, runtime: 'unknown' },
        ]),
      },
      output,
    });

    await status({ json: true });

    expect(output.printJson).toHaveBeenCalledWith({
      state: 'running',
      runningCount: 1,
      instances: [{ runtime: 'web', port: 3001, pid: 42, launchMode: 'daemon', passwordProtected: false }],
    });
  });

  it('renders multiple maintained instances in human and quiet modes', async () => {
    const output = makeOutput();
    const status = createStatusCommand({
      instanceStore: {
        discoverRunningInstances: vi.fn(async () => [
          { port: 3001, pid: 42, launchMode: 'daemon' },
          { port: 3002, pid: 43, launchMode: 'foreground', hasUiPassword: true },
        ]),
      },
      output,
    });

    await status({});
    await status({ quiet: true });

    expect(output.logStatus).toHaveBeenCalledWith('success', 'port 3001 (PID: 42)', 'mode: daemon; password: no');
    expect(output.logStatus).toHaveBeenCalledWith('success', 'port 3002 (PID: 43)', 'mode: foreground; password: yes');
    expect(output.stdout.write).toHaveBeenCalledWith('port 3001 mode:daemon pass:no\n');
    expect(output.stdout.write).toHaveBeenCalledWith('port 3002 mode:foreground pass:yes\n');
  });
});
