import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

function parseDaemonArgs(argv = []) {
  let port;
  let host;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') port = Number(argv[++index]);
    else if (arg === '--host') host = argv[++index];
    else throw new Error(`Unknown daemon option: ${arg}`);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Daemon requires a valid --port.');
  return { port, host: typeof host === 'string' && host.length > 0 ? host : undefined };
}

async function runDaemonEntry({
  argv = process.argv.slice(2),
  env = process.env,
  processLike = process,
  importServer = (filePath) => import(pathToFileURL(filePath).href),
  serverEntry,
  send = (message) => processLike.send?.(message),
  packageRoot,
} = {}) {
  const options = parseDaemonArgs(argv);
  // Snapshot these values before importing the server. Server modules read
  // their environment while evaluating, so the wrapper must not normalize or
  // replace any inherited OpenCode/data-directory setting.
  const inheritedEnvironment = env;
  const uiPassword = inheritedEnvironment.OPENCHAMBER_UI_PASSWORD;
  const resolvedEntry = serverEntry || path.join(packageRoot || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), 'server', 'dist', 'index.js');

  try {
    const server = await importServer(resolvedEntry, inheritedEnvironment);
    const controller = await server.startWebUiServer({
      port: options.port,
      host: options.host,
      uiPassword,
      attachSignals: true,
      exitOnShutdown: true,
    });
    const actualPort = controller?.getPort?.();
    if (!Number.isInteger(actualPort) || actualPort < 1 || actualPort > 65535) {
      throw new Error('Daemon server did not report a valid listening port.');
    }
    send({ type: 'openchamber:ready', port: actualPort });
    return controller;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { send({ type: 'openchamber:error', message }); } catch {}
    processLike.exitCode = 1;
    throw error;
  }
}

const isDirectExecution = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch { return false; }
})();

if (isDirectExecution) {
  runDaemonEntry().catch(() => {});
}

export { parseDaemonArgs, runDaemonEntry };
