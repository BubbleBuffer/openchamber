import { createOutputAdapter } from '../cli-output.js';

function createProcessState() {
  let activeCommandOptions = null;
  let cancelCleanup = null;
  let foregroundServerActive = false;
  let foregroundShutdown = null;

  return {
    getActiveCommandOptions: () => activeCommandOptions,
    setActiveCommandOptions: (options) => { activeCommandOptions = options || null; },
    setCancelCleanup: (handler) => { cancelCleanup = typeof handler === 'function' ? handler : null; },
    getCancelCleanup: () => cancelCleanup,
    setForegroundState: ({ active = false, shutdown = null } = {}) => {
      foregroundServerActive = active === true;
      foregroundShutdown = typeof shutdown === 'function' ? shutdown : null;
    },
    isForegroundServerActive: () => foregroundServerActive,
    getForegroundShutdown: () => foregroundShutdown,
  };
}

function writeLine(stream, ...values) {
  if (stream && typeof stream.write === 'function') {
    stream.write(`${values.join(' ')}\n`);
  }
}

function installProcessHandlers({
  processLike = process,
  output,
  state = createProcessState(),
  exit,
  onCancelCleanup,
} = {}) {
  const outputAdapter = output || createOutputAdapter({
    stdout: processLike.stdout || process.stdout,
    stdin: processLike.stdin || process.stdin,
  });
  const exitProcess = typeof exit === 'function'
    ? exit
    : (typeof processLike.exit === 'function' ? processLike.exit.bind(processLike) : () => {});
  if (typeof onCancelCleanup === 'function') state.setCancelCleanup(onCancelCleanup);

  let disposed = false;
  let handlingSigint = false;

  const onSigint = () => {
    if (handlingSigint) return;
    const shutdown = state.getForegroundShutdown();
    if (state.isForegroundServerActive() && typeof shutdown === 'function') {
      void shutdown('SIGINT');
      return;
    }

    handlingSigint = true;
    outputAdapter.cancel('Operation cancelled.');
    const cleanup = state.getCancelCleanup();
    Promise.resolve().then(() => cleanup?.()).catch(() => undefined).finally(() => {
      state.setCancelCleanup(null);
      exitProcess(130);
    });
  };

  const onUnhandledRejection = (reason, promise) => {
    if (outputAdapter.isJsonMode(state.getActiveCommandOptions())) {
      outputAdapter.printJson({
        status: 'error',
        error: { message: `Unhandled rejection: ${String(reason)}` },
      });
    } else {
      writeLine(processLike.stderr || process.stderr, 'Unhandled Rejection at:', promise, 'reason:', reason);
    }
    exitProcess(1);
  };

  const onUncaughtException = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (outputAdapter.isJsonMode(state.getActiveCommandOptions())) {
      outputAdapter.printJson({
        status: 'error',
        error: { message: `Uncaught exception: ${message}` },
      });
    } else {
      writeLine(processLike.stderr || process.stderr, 'Uncaught Exception:', error);
    }
    exitProcess(1);
  };

  processLike.on('SIGINT', onSigint);
  processLike.on('unhandledRejection', onUnhandledRejection);
  processLike.on('uncaughtException', onUncaughtException);

  return {
    state,
    dispose() {
      if (disposed) return;
      disposed = true;
      const removeListener = processLike.off || processLike.removeListener;
      removeListener?.call(processLike, 'SIGINT', onSigint);
      removeListener?.call(processLike, 'unhandledRejection', onUnhandledRejection);
      removeListener?.call(processLike, 'uncaughtException', onUncaughtException);
    },
  };
}

export { createProcessState, installProcessHandlers };
