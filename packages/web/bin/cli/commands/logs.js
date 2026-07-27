import { createInstanceStore } from '../instance-store.js';
import { createLogFiles } from '../log-files.js';
import { createPaths } from '../paths.js';
import { productionOutput } from '../../cli-output.js';

function createLogsCommand({
  instanceStore = createInstanceStore({ paths: createPaths() }),
  logFiles = createLogFiles({ paths: createPaths() }),
  output = productionOutput,
  processLike = process,
} = {}) {
  const stream = () => output.stdout || processLike.stdout || process.stdout;
  const write = (value) => stream()?.write?.(value);
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);

  function removeListener(signal, listener) {
    const remove = processLike.off || processLike.removeListener;
    try { remove?.call(processLike, signal, listener); } catch {}
  }

  return async function logs(options = {}) {
    const showFrames = human(options);
    const follow = options.follow !== false;
    const shouldPrefixLines = options.all || !showFrames;
    const running = await instanceStore.discoverRunningInstances();
    let targets;

    if (options.all) {
      targets = Array.isArray(running) ? running : [];
      if (targets.length === 0) throw new Error('No running OpenChamber instance found.');
    } else if (options.explicitPort) {
      const found = (Array.isArray(running) ? running : []).find((entry) => entry?.port === options.port);
      if (!found) throw new Error(`No running OpenChamber instance found on port ${options.port}.`);
      targets = [found];
    } else {
      const latest = instanceStore.getLatestInstance?.(Array.isArray(running) ? running : []);
      if (!latest) throw new Error('No running OpenChamber instance found.');
      targets = [latest];
      if (showFrames) output.logStatus?.('info', `no port specified; using latest started instance on port ${latest.port}`);
    }

    if (json(options)) {
      if (follow) {
        throw new Error('`openchamber logs --json` requires `--no-follow` for deterministic JSON output.');
      }
      const entries = targets.map((target) => {
        const logPath = logFiles.getLogFilePath(target.port);
        return { port: target.port, logPath, lines: logFiles.readTailLines(logPath, options.lines) };
      });
      output.printJson?.({ entries });
      return entries;
    }

    if (showFrames) output.intro?.('OpenChamber Logs');
    const printLine = (port, line) => write(`${shouldPrefixLines ? `[${port}] ` : ''}${line}\n`);

    for (const target of targets) {
      const logPath = logFiles.getLogFilePath(target.port);
      if (showFrames) output.logStatus?.('info', `port ${target.port}`, logPath);
      for (const line of logFiles.readTailLines(logPath, options.lines)) printLine(target.port, line);
    }

    if (showFrames) output.outro?.(follow ? 'following (Ctrl+C to stop)' : 'tail complete');
    if (!follow) return targets;

    const disposers = [];
    const listeners = [];
    let resolveFollow;
    const followDone = new Promise((resolve) => { resolveFollow = resolve; });
    const onSignal = () => resolveFollow();
    const addListener = (signal) => {
      listeners.push([signal, onSignal]);
      processLike.on?.(signal, onSignal);
    };
    try {
      addListener('SIGINT');
      addListener('SIGTERM');
      for (const target of targets) {
        const logPath = logFiles.getLogFilePath(target.port);
        disposers.push(logFiles.followFile(logPath, (line) => printLine(target.port, line)));
      }
      await followDone;
    } finally {
      for (const dispose of disposers) {
        try { dispose?.(); } catch {}
      }
      for (const [signal, listener] of listeners) removeListener(signal, listener);
    }
    return targets;
  };
}

export { createLogsCommand };
