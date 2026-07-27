import { createPaths } from '../paths.js';
import { createInstanceStore } from '../instance-store.js';
import { createProcessRuntime } from '../process-runtime.js';
import { createOutputAdapter, productionOutput } from '../../cli-output.js';

function createStopCommand({
  paths = createPaths(),
  instanceStore = createInstanceStore({ paths }),
  processRuntime = createProcessRuntime({}),
  output = productionOutput,
  processLike = process,
} = {}) {
  const stream = (name) => output?.[name] || processLike[name] || process[name];
  const write = (name, value) => stream(name)?.write?.(value);
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);
  const quiet = (options) => output.isQuietMode(options);

  const removeRecord = (instance) => {
    instanceStore.removePidFile(instance.pidFilePath || paths.getPidFilePath(instance.port));
    instanceStore.removeInstanceFile(instance.instanceFilePath || paths.getInstanceFilePath(instance.port));
  };

  const renderQuiet = (options, results) => {
    if (!quiet(options) || json(options) || options.suppressQuietOutput) return;
    if (results.length === 0) write('stdout', 'none\n');
    for (const result of results) {
      if (result.stopped) write('stdout', `stopped ${result.port}\n`);
      else write('stderr', `failed ${result.port} ${result.reason || 'failed'}\n`);
    }
  };

  const shutdownOne = async (instance) => {
    const requested = await processRuntime.requestServerShutdown(instance.port);
    const result = await processRuntime.stopInstanceProcess(instance, {
      shutdownWaitMs: requested ? 5000 : 0,
      gracefulTimeoutMs: 2500,
      forceTimeoutMs: 3000,
    });
    if (!result?.stopped && typeof processRuntime.isProcessRunning === 'function' && processRuntime.isProcessRunning(instance.pid)) {
      throw new Error(result?.reason || `Timed out stopping pid ${instance.pid}`);
    }
    if (!result?.stopped) throw new Error(result?.reason || 'stop-failed');
    removeRecord(instance);
    return { port: instance.port, pid: instance.pid, stopped: true };
  };

  const stopUnmanaged = async (options, info) => {
    const requested = await processRuntime.requestServerShutdown(options.port);
    let processReason = null;
    if (Number.isFinite(info.pid) && typeof processRuntime.isProcessRunning === 'function' && processRuntime.isProcessRunning(info.pid)) {
      const result = await processRuntime.stopInstanceProcess({ pid: info.pid }, {
        shutdownWaitMs: requested ? 5000 : 0,
        gracefulTimeoutMs: 2500,
        forceTimeoutMs: 3000,
      }).catch((error) => ({ stopped: false, reason: error instanceof Error ? error.message : String(error) }));
      if (!result.stopped) processReason = result.reason || 'stop-failed';
    }
    if (await processRuntime.isPortAvailable(options.port)) return { port: options.port, runtime: info.runtime || 'unmanaged', stopped: true };
    return {
      port: options.port,
      runtime: info.runtime || 'unmanaged',
      stopped: false,
      reason: processReason || (requested ? 'shutdown-requested-port-busy' : 'stop-failed'),
    };
  };

  return async function stop(options = {}) {
    if (human(options)) output.intro?.('OpenChamber Stop');
    let instances = await instanceStore.discoverRunningInstances();
    const results = [];
    if (options.explicitPort) {
      instances = instances.filter((entry) => entry.port === options.port);
      if (instances.length === 0) {
        const info = await processRuntime.fetchSystemInfoFromPort(options.port);
        if (info?.runtime) {
          const result = await stopUnmanaged(options, info);
          results.push(result);
        } else results.push({ port: options.port, stopped: false, reason: 'not-found' });
      }
    }
    for (const instance of instances) {
      try {
        results.push(await shutdownOne(instance));
        if (human(options)) output.logStatus?.('success', `stopped port ${instance.port}`);
      } catch (error) {
        results.push({ port: instance.port, pid: instance.pid, stopped: false, reason: error instanceof Error ? error.message : String(error) });
        if (human(options)) output.logStatus?.('error', `error stopping port ${instance.port}`, results.at(-1).reason);
      }
    }
    if (json(options)) {
      const failed = results.some((entry) => !entry.stopped);
      output.printJson?.({ status: failed && results.some((entry) => entry.stopped) ? 'warning' : failed ? 'warning' : 'ok', stoppedCount: results.filter((entry) => entry.stopped).length, results });
    } else if (quiet(options)) renderQuiet(options, results);
    else if (human(options)) {
      if (results.length === 0 || results.every((entry) => entry.reason === 'not-found')) output.logStatus?.('info', 'No running OpenChamber instances found');
      output.outro?.(results.length > 0 && results.every((entry) => entry.stopped) ? `${results.length} instance(s)` : 'stop complete');
    }
    return results;
  };
}

export { createStopCommand };
