import { createInstanceStore } from '../instance-store.js';
import { createPaths } from '../paths.js';
import { productionOutput } from '../../cli-output.js';

function createStatusCommand({
  instanceStore = createInstanceStore({ paths: createPaths() }),
  output = productionOutput,
  processLike = process,
} = {}) {
  const write = (value) => (output.stdout || processLike.stdout || process.stdout)?.write?.(value);
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);
  const quiet = (options) => output.isQuietMode(options);

  function passwordProtection(record) {
    return record?.hasUiPassword === true
      || (typeof record?.uiPassword === 'string' && record.uiPassword.trim().length > 0);
  }

  function normalizeInstance(instance) {
    if (!instance || typeof instance !== 'object') return null;
    const port = Number.isInteger(instance.port) && instance.port > 0 && instance.port <= 65535
      ? instance.port
      : null;
    if (port === null) return null;

    let stored = instance;
    if (instance.instanceFilePath) {
      try {
        stored = instanceStore.readInstanceRecord?.(instance.instanceFilePath) || instance;
      } catch {
        stored = instance;
      }
    }
    const runtime = instance.runtime || stored?.runtime || 'cli';
    if (runtime !== 'cli' && runtime !== 'web') return null;
    const pid = Number.isInteger(instance.pid) && instance.pid > 0 ? instance.pid : null;
    const launchMode = instance.launchMode === 'foreground' || stored?.launchMode === 'foreground'
      ? 'foreground'
      : 'daemon';
    return {
      runtime,
      port,
      pid,
      launchMode,
      passwordProtected: passwordProtection({ ...stored, ...instance }),
    };
  }

  return async function status(options = {}) {
    const discovered = await instanceStore.discoverRunningInstances();
    const instances = (Array.isArray(discovered) ? discovered : [])
      .map(normalizeInstance)
      .filter(Boolean);
    const result = {
      state: instances.length > 0 ? 'running' : 'stopped',
      runningCount: instances.length,
      instances,
    };

    if (json(options)) {
      output.printJson?.(result);
      return result;
    }

    if (quiet(options)) {
      if (instances.length === 0) {
        write('stopped\n');
      } else {
        for (const instance of instances) {
          write(`port ${instance.port} mode:${instance.launchMode} pass:${instance.passwordProtected ? 'yes' : 'no'}\n`);
        }
      }
      return result;
    }

    if (human(options)) {
      output.intro?.('OpenChamber Status');
      if (instances.length === 0) {
        output.logStatus?.('warning', 'stopped');
        output.outro?.('no running instances');
      } else {
        for (const instance of instances) {
          const pidSuffix = instance.pid === null ? '' : ` (PID: ${instance.pid})`;
          output.logStatus?.(
            'success',
            `port ${instance.port}${pidSuffix}`,
            `mode: ${instance.launchMode}; password: ${instance.passwordProtected ? 'yes' : 'no'}`,
          );
        }
        output.outro?.(`${instances.length} running runtime(s)`);
      }
    }
    return result;
  };
}

export { createStatusCommand };
