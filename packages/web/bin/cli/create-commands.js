import { createOpenCodeCli } from './opencode-cli.js';
import { createServeCommand } from './commands/serve.js';
import { createStopCommand } from './commands/stop.js';
import { createRestartCommand } from './commands/restart.js';
import { createStatusCommand } from './commands/status.js';
import { createLogsCommand } from './commands/logs.js';
import { createPackageManagerAdapter, createUpdateCommand } from './commands/update.js';

function createCommands({
  paths,
  instanceStore,
  processRuntime,
  logFiles,
  output,
  processLike = process,
  fsLike,
  processState,
  serverEntries,
  daemonEntry,
  openCodeCli,
  packageManagerAdapter,
  serve: suppliedServe,
  stop: suppliedStop,
} = {}) {
  const lifecycle = {
    serve: suppliedServe || createServeCommand({
      paths,
      instanceStore,
      processRuntime,
      logFiles,
      output,
      processLike,
      fsLike,
      processState,
      serverEntries,
      daemonEntry,
      openCodeCli: openCodeCli || createOpenCodeCli({ env: processLike.env, fsLike, processLike }),
    }),
    stop: suppliedStop || createStopCommand({
      paths,
      instanceStore,
      processRuntime,
      output,
      processLike,
    }),
  };

  const restart = createRestartCommand({
    stop: lifecycle.stop,
    serve: lifecycle.serve,
    paths,
    instanceStore,
    output,
    processLike,
  });
  const status = createStatusCommand({ instanceStore, output, processLike });
  const logs = createLogsCommand({ instanceStore, logFiles, output, processLike });
  const update = createUpdateCommand({
    instanceStore,
    stop: lifecycle.stop,
    serve: lifecycle.serve,
    output,
    packageManagerAdapter: packageManagerAdapter || createPackageManagerAdapter({ paths }),
  });

  return {
    ...lifecycle,
    restart,
    status,
    logs,
    update,
  };
}

export { createCommands };
