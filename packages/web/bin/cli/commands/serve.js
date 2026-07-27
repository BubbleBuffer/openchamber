import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn } from 'child_process';

import { assertSafeBrowserPort, EXIT_CODE, TunnelCliError } from '../arguments.js';
import { createPaths } from '../paths.js';
import { createInstanceStore } from '../instance-store.js';
import { createProcessRuntime } from '../process-runtime.js';
import { createLogFiles } from '../log-files.js';
import { createOpenCodeCli } from '../opencode-cli.js';
import { resolveCliDaemonEntry } from '../../cli-entry.js';
import { productionOutput } from '../../cli-output.js';

const defaultTimers = { setTimeout, clearTimeout };

function defaultServerEntries(paths) {
  if (typeof paths.getCompiledServerEntries === 'function') return paths.getCompiledServerEntries();
  const packageRoot = typeof paths.getPackageRoot === 'function'
    ? paths.getPackageRoot()
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  return {
    daemon: path.join(packageRoot, 'server', 'dist', 'main.js'),
    foreground: path.join(packageRoot, 'server', 'dist', 'index.js'),
  };
}

function hasPassword(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function createServeCommand({
  paths = createPaths(),
  instanceStore = createInstanceStore({ paths }),
  processRuntime = createProcessRuntime({}),
  logFiles = createLogFiles({ paths }),
  output = productionOutput,
  processLike = process,
  fsLike = fs,
  spawnImpl = spawn,
  timers = defaultTimers,
  serverEntries = defaultServerEntries(paths),
  daemonEntry = resolveCliDaemonEntry(typeof paths.getPackageRoot === 'function'
    ? paths.getPackageRoot()
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')),
  runtimeBin,
  openCodeCli = createOpenCodeCli({ env: processLike.env, fsLike, processLike }),
  discoverOpenCode = openCodeCli.checkOpenCodeCli,
  importServer = (filePath) => import(pathToFileURL(filePath).href),
  startForeground,
  keepForegroundAlive = () => new Promise(() => {}),
  clock = () => Date.now(),
  processState,
  readinessTimeoutMs = 5000,
} = {}) {
  const stream = (name) => output?.[name] || processLike[name] || process[name];
  const write = (name, value) => stream(name)?.write?.(value);
  const human = (options) => output.shouldRenderHumanOutput(options);
  const json = (options) => output.isJsonMode(options);
  const quiet = (options) => output.isQuietMode(options);

  const emitNotice = (options, messages, notice) => {
    if (!notice || typeof notice.message !== 'string') return;
    const level = notice.level === 'warning' || notice.level === 'error' ? notice.level : 'info';
    if (json(options)) {
      messages.push({ level, code: notice.code, message: notice.message });
    } else if (human(options)) {
      output.logStatus?.(level, notice.message);
    } else if (!quiet(options)) {
      write(level === 'error' ? 'stderr' : 'stderr', `${level === 'warning' ? 'Warning' : level === 'error' ? 'Error' : 'Info'}: ${notice.message}\n`);
    }
  };

  const cleanupFiles = (port) => {
    const pidPath = paths.getPidFilePath(port);
    const instancePath = paths.getInstanceFilePath(port);
    instanceStore.removePidFile(pidPath);
    instanceStore.removeInstanceFile(instancePath);
  };

  async function startForegroundServer(options, port, uiPassword, host, opencodeBinary) {
    logFiles.ensureLogDir();
    const initialLogPath = logFiles.getLogFilePath(port === 0 ? 'auto' : String(port));
    logFiles.rotateLogFile(initialLogPath);
    const logFd = fsLike.openSync(initialLogPath, 'a');
    const realStdoutWrite = processLike.stdout?.write?.bind(processLike.stdout);
    let logStream;
    if (quiet(options) && processLike === process && processLike.stdout && processLike.stderr) {
      logStream = fsLike.createWriteStream(null, { fd: logFd });
      processLike.stdout.write = (chunk, encoding, callback) => logStream.write(chunk, encoding, callback);
      processLike.stderr.write = (chunk, encoding, callback) => logStream.write(chunk, encoding, callback);
    } else {
      try { fsLike.closeSync(logFd); } catch {}
    }
    if (!quiet(options)) write('stdout', `Starting OpenChamber on port ${port === 0 ? 'auto' : port} (foreground)\n`);
    const importer = startForeground || (async (startOptions) => {
      const module = await importServer(serverEntries.foreground);
      return module.startWebUiServer(startOptions);
    });
    const environment = processLike.env || (processLike.env = {});
    if (opencodeBinary) environment.OPENCODE_BINARY = opencodeBinary;
    if (uiPassword) environment.OPENCHAMBER_UI_PASSWORD = uiPassword;

    let controller;
    try {
      controller = await importer({
        port,
        host,
        uiPassword,
        attachSignals: false,
        exitOnShutdown: false,
      });
    } catch (error) {
      if (logStream) logStream.end();
      else { try { fsLike.closeSync(logFd); } catch {} }
      try { fsLike.unlinkSync(initialLogPath); } catch {}
      throw error;
    }
    const resolvedPort = controller.getPort();
    const pidPath = paths.getPidFilePath(resolvedPort);
    const instancePath = paths.getInstanceFilePath(resolvedPort);
    instanceStore.writePidFile(pidPath, processLike.pid, (notice) => emitNotice(options, [], notice));
    instanceStore.writeInstanceRecord(instancePath, {
      port: resolvedPort,
      pid: processLike.pid,
      host,
      launchMode: 'foreground',
      uiPassword,
      startedAt: clock(),
    }, (notice) => emitNotice(options, [], notice));

    if (quiet(options) && !options.suppressQuietOutput) {
      if (realStdoutWrite) realStdoutWrite(`${resolvedPort}\n`);
      else write('stdout', `${resolvedPort}\n`);
    }

    let stopping = false;
    const stop = async (signal = 'SIGTERM') => {
      if (stopping) return;
      stopping = true;
      try { await controller.stop?.({ exitProcess: false }); } catch {}
      cleanupFiles(resolvedPort);
      processState?.setForegroundState?.({ active: false });
      if (typeof processLike.exit === 'function' && processLike === process) {
        processLike.exit(signal === 'SIGINT' ? 130 : signal === 'SIGQUIT' ? 131 : 143);
      }
    };
    if (processState?.setForegroundState) {
      processState.setForegroundState({ active: true, shutdown: stop });
    } else {
      processLike.on?.('SIGINT', () => { void stop('SIGINT'); });
      processLike.on?.('SIGTERM', () => { void stop('SIGTERM'); });
      processLike.on?.('SIGQUIT', () => { void stop('SIGQUIT'); });
    }
    processLike.once?.('exit', () => cleanupFiles(resolvedPort));
    await keepForegroundAlive({ controller, stop });
    return resolvedPort;
  }

  async function waitForDaemonReady(child, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, port) => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timeout);
        if (error) reject(error); else resolve(port);
      };
      const timeout = timers.setTimeout(() => finish(new Error('Timed out waiting for OpenChamber daemon readiness.')), timeoutMs);
      child.on?.('message', (message) => {
        if (!message || typeof message !== 'object' || message.type !== 'openchamber:ready' || !Number.isInteger(message.port) || message.port < 1 || message.port > 65535) {
          finish(new Error('Daemon reported malformed readiness message.'));
          return;
        }
        finish(null, message.port);
      });
      child.on?.('error', (error) => finish(error));
      child.on?.('exit', (code, signal) => finish(new Error(`Daemon exited before readiness${code == null ? ` (${signal || 'unknown'})` : ` with code ${code}`}.`)));
    });
  }

  async function cleanupChild(child) {
    if (!child?.pid) return;
    const identity = processRuntime.getProcessIdentity?.(child.pid);
    if (identity?.fingerprint) {
      await processRuntime.terminateProcessTree?.({ pid: child.pid, identityFingerprint: identity.fingerprint }, {
        gracefulTimeoutMs: 250,
        forceTimeoutMs: 250,
      });
      return;
    }
    // The spawn handle is still safe to use when the platform cannot expose
    // an identity fingerprint: it can only signal the child created here.
    try { child.kill?.('SIGTERM'); } catch {}
  }

  async function startDaemonServer(options, port, uiPassword, host, opencodeBinary, messages) {
    logFiles.ensureLogDir();
    const initialLogPort = port === 0 ? 'auto' : String(port);
    const initialLogPath = logFiles.getLogFilePath(initialLogPort);
    logFiles.rotateLogFile(initialLogPath);
    const logFd = fsLike.openSync(initialLogPath, 'a');
    const args = [daemonEntry, '--port', String(port)];
    if (host) args.push('--host', host);
    const inheritedEnv = processLike.env || {};
    const env = { ...inheritedEnv };
    if (opencodeBinary) env.OPENCODE_BINARY = opencodeBinary;
    if (uiPassword) env.OPENCHAMBER_UI_PASSWORD = uiPassword;
    if (host) env.OPENCHAMBER_HOST = host;
    if (inheritedEnv.OPENCODE_SKIP_START && !inheritedEnv.OPENCHAMBER_SKIP_OPENCODE_START) {
      env.OPENCHAMBER_SKIP_OPENCODE_START = inheritedEnv.OPENCODE_SKIP_START;
    }
    const daemonRuntimeBin = runtimeBin || openCodeCli.getDaemonRuntimeBin({ nodeBinary: processLike.execPath || process.execPath });
    const child = spawnImpl(daemonRuntimeBin, args, {
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd, 'ipc'],
      env,
    });
    child.unref?.();
    try {
      const resolvedPort = await waitForDaemonReady(child, readinessTimeoutMs);
      try { child.disconnect?.(); } catch {}
      try { fsLike.closeSync(logFd); } catch {}
      const resolvedLogPath = logFiles.getLogFilePath(resolvedPort);
      if (initialLogPath !== resolvedLogPath && !fsLike.existsSync(resolvedLogPath)) {
        try { fsLike.renameSync(initialLogPath, resolvedLogPath); } catch {}
      }
      const pidPath = paths.getPidFilePath(resolvedPort);
      const instancePath = paths.getInstanceFilePath(resolvedPort);
      instanceStore.writePidFile(pidPath, child.pid, (notice) => emitNotice(options, messages, notice));
      instanceStore.writeInstanceRecord(instancePath, {
        port: resolvedPort,
        pid: child.pid,
        host,
        launchMode: 'daemon',
        uiPassword,
        startedAt: clock(),
      }, (notice) => emitNotice(options, messages, notice));
      return { port: resolvedPort, pid: child.pid };
    } catch (error) {
      await cleanupChild(child);
      try { fsLike.closeSync(logFd); } catch {}
      try { fsLike.unlinkSync(initialLogPath); } catch {}
      cleanupFiles(port);
      throw error;
    }
  }

  return async function serve(options = {}) {
    const messages = [];
    if (options.foreground && json(options)) {
      throw new TunnelCliError('--json is not supported with --foreground. Use --json with background (daemon) mode instead.', EXIT_CODE.USAGE_ERROR);
    }
    const explicitPort = options.explicitPort === true;
    const targetPort = await processRuntime.resolveAvailablePort(options.port, explicitPort, (notice) => emitNotice(options, messages, notice));
    if (targetPort !== 0 && !options.suppressUnsafePortWarning) assertSafeBrowserPort(targetPort, { context: 'OpenChamber serve', env: processLike.env });
    if (targetPort !== 0) {
      const pidPath = paths.getPidFilePath(targetPort);
      const instancePath = paths.getInstanceFilePath(targetPort);
      const existingPid = instanceStore.readPidFile?.(pidPath);
      if (existingPid) {
        const storedRecord = instanceStore.readInstanceRecord?.(instancePath) || { pid: existingPid };
        const record = { ...storedRecord, pid: existingPid };
        const identity = processRuntime.verifyIdentity?.(record);
        const active = processRuntime.isProcessRunning?.(existingPid) === true;
        if (active && identity?.verified === true) {
          throw new Error(`OpenChamber is already running on port ${targetPort} (PID: ${existingPid})`);
        }
        instanceStore.removePidFile?.(pidPath);
        instanceStore.removeInstanceFile?.(instancePath);
      }
      if (explicitPort && !(await processRuntime.isPortAvailable(targetPort, options.host))) {
        const info = await processRuntime.fetchSystemInfoFromPort(targetPort);
        if (info?.runtime) throw new Error(`OpenChamber is already running on port ${targetPort}. Use \`openchamber status\` or \`openchamber stop --port ${targetPort}\`.`);
        throw new Error(`Port ${targetPort} is already in use by another process.`);
      }
    }
    const opencodeBinary = await discoverOpenCode((notice) => emitNotice(options, messages, notice));
    const uiPassword = hasPassword(options.uiPassword) ? options.uiPassword : undefined;
    const host = typeof options.host === 'string' && options.host.length > 0 ? options.host : undefined;
    if (!uiPassword && !options.suppressUiPasswordWarning) emitNotice(options, messages, { level: 'warning', code: 'UI_PASSWORD_MISSING', message: 'OPENCHAMBER_UI_PASSWORD is not set; browser UI is unsecured. Use --ui-password or OPENCHAMBER_UI_PASSWORD.' });

    if (options.foreground) return startForegroundServer(options, targetPort, uiPassword, host, opencodeBinary);
    const started = await startDaemonServer(options, targetPort, uiPassword, host, opencodeBinary, messages);
    const result = {
      port: started.port,
      pid: started.pid,
      url: processRuntime.buildLocalUrl(started.port, '/'),
      logs: `openchamber logs -p ${started.port}`,
      launchMode: 'daemon',
    };
    if (json(options)) output.printJson({ ...result, messages });
    else if (quiet(options)) { if (!options.suppressQuietOutput) write('stdout', `${started.port}\n`); }
    else if (!options.suppressStartupSummary && human(options)) {
      output.intro?.('OpenChamber Started');
      output.logStatus?.('success', `port ${result.port} (PID: ${result.pid})`);
      output.logStatus?.('info', `visit: ${result.url}`);
      output.logStatus?.('info', `logs: ${result.logs}`);
      output.outro?.('daemon running');
    }
    return started.port;
  };
}

export { createServeCommand };
