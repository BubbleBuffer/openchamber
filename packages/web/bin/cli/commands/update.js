import path from 'path';
import { pathToFileURL } from 'url';

import { createInstanceStore } from '../instance-store.js';
import { createPaths } from '../paths.js';
import { productionOutput } from '../../cli-output.js';

function defaultPackageManagerPath(paths) {
  const packageRoot = paths.getPackageRoot();
  return path.join(packageRoot, 'server', 'dist', 'domains', 'package-manager', 'index.js');
}

function createPackageManagerAdapter({
  paths = createPaths(),
  modulePath = defaultPackageManagerPath(paths),
  importModule = (url) => import(url),
} = {}) {
  return async function loadPackageManager() {
    const service = await importModule(pathToFileURL(modulePath).href);
    return {
      checkForUpdates: service.checkForUpdates,
      executeUpdate: service.executeUpdate,
      detectPackageManager: service.detectPackageManager,
      getCurrentVersion: service.getCurrentVersion,
    };
  };
}

function asPackageManagerAdapter(value) {
  if (typeof value === 'function') return value;
  return async () => value;
}

function createUpdateCommand({
  packageManagerAdapter,
  packageManager,
  instanceStore = createInstanceStore({ paths: createPaths() }),
  stop,
  serve,
  output = productionOutput,
} = {}) {
  if (typeof stop !== 'function' || typeof serve !== 'function') {
    throw new TypeError('createUpdateCommand requires stop and serve operations');
  }
  const loadPackageManager = asPackageManagerAdapter(
    packageManagerAdapter || packageManager || createPackageManagerAdapter(),
  );
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);
  const quiet = (options) => output.isQuietMode(options);
  const write = (value) => (output.stdout || process.stdout)?.write?.(value);

  return async function update(options = {}) {
    const showOutput = human(options);
    const spinner = output.createSpinner?.(options) || null;
    const service = await loadPackageManager();
    const runningInstances = await instanceStore.discoverRunningInstances();
    const currentVersion = await service.getCurrentVersion();

    if (showOutput) output.intro?.('OpenChamber Update');
    if (showOutput && !spinner) output.logStatus?.('info', `current version: ${currentVersion}`);
    spinner?.start?.('Checking for updates...');

    let updateInfo;
    try {
      updateInfo = await service.checkForUpdates();
    } catch (error) {
      spinner?.error?.('Update check failed');
      if (showOutput) output.outro?.('update failed');
      throw error;
    }
    if (updateInfo?.error) {
      spinner?.error?.('Update check failed');
      if (showOutput) output.outro?.('update failed');
      throw new Error(updateInfo.error);
    }

    if (!updateInfo?.available) {
      const result = {
        currentVersion,
        latestVersion: updateInfo?.version || currentVersion,
        updated: false,
      };
      spinner?.stop?.('Already up to date');
      if (json(options)) output.printJson?.(result);
      else if (showOutput) {
        if (!spinner) output.logStatus?.('success', 'you are running the latest version');
        output.outro?.('no update needed');
      } else if (quiet(options)) write(`up-to-date ${currentVersion}\n`);
      return result;
    }

    const targetVersion = updateInfo.version || 'latest';
    if (showOutput && !spinner) output.logStatus?.('info', `updating ${updateInfo.currentVersion || currentVersion} -> ${targetVersion}`);
    spinner?.message?.(`Updating to ${targetVersion}...`);

    const storedInstances = (Array.isArray(runningInstances) ? runningInstances : []).map((instance) => ({
      instance,
      stored: (() => {
        try {
          return instanceStore.readInstanceRecord?.(instance.instanceFilePath) || instance;
        } catch {
          return instance;
        }
      })(),
    }));
    for (const { instance } of storedInstances) {
      try {
        await stop({
          explicitPort: true,
          port: instance.port,
          quiet: true,
          suppressQuietOutput: true,
        });
      } catch {
        // A partial stop should not prevent the package-manager operation.
      }
    }

    const packageManager = service.detectPackageManager();
    let installResult;
    try {
      installResult = await service.executeUpdate(packageManager, { silent: json(options) || quiet(options) });
    } catch (error) {
      spinner?.error?.('Update failed');
      if (showOutput) output.outro?.('update failed');
      throw error;
    }
    if (!installResult?.success) {
      spinner?.error?.('Update failed');
      if (showOutput) output.outro?.('update failed');
      throw new Error(`Update failed with exit code ${installResult?.exitCode}`);
    }

    try {
      if (storedInstances.length > 0) spinner?.message?.(`Restarting ${storedInstances.length} instance(s)...`);
      for (const { instance, stored } of storedInstances) {
        await serve({
          port: stored.port || instance.port,
          host: stored.host,
          explicitPort: true,
          uiPassword: stored.uiPassword,
          suppressStartupSummary: true,
          suppressUiPasswordWarning: true,
          quiet: true,
          suppressQuietOutput: true,
        });
      }
    } catch (error) {
      spinner?.error?.('Update restart failed');
      if (showOutput) output.outro?.('update failed');
      throw error;
    }

    const result = {
      currentVersion,
      latestVersion: targetVersion,
      updated: true,
      restartedCount: storedInstances.length,
    };
    spinner?.stop?.(`Updated to ${targetVersion}`);
    if (json(options)) output.printJson?.(result);
    else if (showOutput) {
      if (!spinner) output.logStatus?.('success', `updated to ${targetVersion}`);
      output.outro?.('update complete');
    } else if (quiet(options)) write(`updated ${targetVersion}\n`);
    return result;
  };
}

export { createPackageManagerAdapter, createUpdateCommand };
