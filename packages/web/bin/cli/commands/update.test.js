import { describe, expect, it, vi } from 'vitest';

import { createUpdateCommand } from './update.js';

function makeOutput() {
  return {
    stdout: { write: vi.fn() },
    printJson: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    logStatus: vi.fn(),
    createSpinner: vi.fn(() => null),
    shouldRenderHumanOutput: (options) => !options.json && !options.quiet,
    isJsonMode: (options) => Boolean(options.json),
    isQuietMode: (options) => Boolean(options.quiet),
  };
}

function makeCommand({ updateInfo, executeResult = { success: true, exitCode: 0 }, stop = vi.fn(async () => []), serve = vi.fn(async () => 3000) }) {
  return {
    output: makeOutput(),
    packageManager: {
      getCurrentVersion: () => '1.0.0',
      checkForUpdates: vi.fn(async () => updateInfo),
      detectPackageManager: vi.fn(() => 'npm'),
      executeUpdate: vi.fn(() => executeResult),
    },
    instanceStore: {
      discoverRunningInstances: vi.fn(async () => [{ port: 3000, instanceFilePath: 'instance.json', launchMode: 'daemon' }]),
      readInstanceRecord: vi.fn(() => ({ port: 3000, host: '127.0.0.1', uiPassword: 'secret' })),
    },
    stop,
    serve,
  };
}

describe('update command', () => {
  it('reports unavailable updates without stopping or installing', async () => {
    const deps = makeCommand({ updateInfo: { available: false, version: '1.0.0' } });
    const update = createUpdateCommand(deps);

    await update({ json: true });

    expect(deps.stop).not.toHaveBeenCalled();
    expect(deps.packageManager.executeUpdate).not.toHaveBeenCalled();
    expect(deps.output.printJson).toHaveBeenCalledWith({ currentVersion: '1.0.0', latestVersion: '1.0.0', updated: false });
  });

  it('continues through a partial stop, installs, and restarts using injected lifecycle operations', async () => {
    const stop = vi.fn(async ({ port }) => [{ port, stopped: false, reason: 'busy' }]);
    const deps = makeCommand({ updateInfo: { available: true, version: '2.0.0' }, stop });
    const update = createUpdateCommand(deps);

    await update({ json: true });

    expect(stop).toHaveBeenCalledWith(expect.objectContaining({ explicitPort: true, port: 3000 }));
    expect(deps.packageManager.executeUpdate).toHaveBeenCalledWith('npm', { silent: true });
    expect(deps.serve).toHaveBeenCalledWith(expect.objectContaining({ port: 3000, host: '127.0.0.1', uiPassword: 'secret' }));
    expect(deps.output.printJson).toHaveBeenCalledWith(expect.objectContaining({ updated: true, restartedCount: 1 }));
  });

  it('does not restart after an installation failure and surfaces the failure', async () => {
    const deps = makeCommand({ updateInfo: { available: true, version: '2.0.0' }, executeResult: { success: false, exitCode: 17 } });
    const update = createUpdateCommand(deps);

    await expect(update({ quiet: true })).rejects.toThrow('exit code 17');
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it('renders a successful human update through the output adapter', async () => {
    const deps = makeCommand({ updateInfo: { available: true, version: '2.0.0' } });
    const update = createUpdateCommand(deps);

    await update({});

    expect(deps.output.intro).toHaveBeenCalledWith('OpenChamber Update');
    expect(deps.output.outro).toHaveBeenCalledWith('update complete');
  });
});
