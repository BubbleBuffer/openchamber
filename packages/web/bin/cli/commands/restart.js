import { createPaths } from '../paths.js';
import { createInstanceStore } from '../instance-store.js';
import { productionOutput } from '../../cli-output.js';

function createRestartCommand({
  stop,
  serve,
  paths = createPaths(),
  instanceStore = createInstanceStore({ paths }),
  output = productionOutput,
  timers = { setTimeout, clearTimeout },
  restartDelayMs = 500,
  processLike = process,
} = {}) {
  if (typeof stop !== 'function' || typeof serve !== 'function') throw new TypeError('createRestartCommand requires stop and serve operations');
  const write = (value) => (output.stdout || processLike.stdout || process.stdout)?.write?.(value);
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);
  const quiet = (options) => output.isQuietMode(options);

  return async function restart(options = {}) {
    if (human(options)) output.intro?.('OpenChamber Restart');
    let instances = await instanceStore.discoverRunningInstances();
    if (options.explicitPort) instances = instances.filter((entry) => entry.port === options.port);
    const results = [];
    for (const instance of instances) {
      const stored = instanceStore.readInstanceRecord(instance.instanceFilePath) || { port: instance.port };
      const launchMode = instance.launchMode || stored.launchMode || 'daemon';
      const restartPort = options.explicitPort ? options.port : instance.port;
      await stop({ explicitPort: true, port: instance.port, quiet: true, suppressQuietOutput: true });
      if (launchMode === 'foreground') {
        results.push({ fromPort: instance.port, toPort: restartPort, launchMode, ok: true });
        continue;
      }
      await new Promise((resolve) => timers.setTimeout(resolve, restartDelayMs));
      const restartedPort = await serve({
        port: restartPort,
        host: stored.host,
        explicitPort: true,
        uiPassword: options.explicitUiPassword ? options.uiPassword : stored.uiPassword,
        suppressStartupSummary: true,
        suppressUiPasswordWarning: true,
        quiet: true,
        suppressQuietOutput: true,
      });
      results.push({ fromPort: instance.port, toPort: restartedPort, launchMode, ok: true });
    }

    if (json(options)) output.printJson?.({ restartedCount: results.length, results });
    else if (quiet(options)) write(`restarted ${results.length}\n`);
    else if (human(options)) output.outro?.(instances.length ? `${instances.length} instance(s) restarted` : 'nothing to restart');
    return results;
  };
}

export { createRestartCommand };
