/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ServerStartupDeps, ServerStartupRuntime } from "./types.js";

export function createServerStartupRuntime(deps: ServerStartupDeps): ServerStartupRuntime {
  const {
    process,
    crypto,
    server,
    readSettingsFromDiskMigrated,
    gracefulShutdown,
    getSignalsAttached,
    setSignalsAttached,
    syncToHmrState,
  } = deps;

  void crypto;
  void readSettingsFromDiskMigrated;

  const resolveBindHost = (host?: string): string =>
    host
    || (typeof process.env.OPENCHAMBER_HOST === 'string' && process.env.OPENCHAMBER_HOST.trim().length > 0
      ? process.env.OPENCHAMBER_HOST.trim()
      : '127.0.0.1');

  const startListening = async ({
    port,
    bindHost,
  }: {
    port: number;
    bindHost: string;
  }): Promise<{ activePort: number }> => {
    let activePort = port;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('error', onError);
        reject(error);
      };
      server.once('error', onError);
      const onListening = async () => {
        server.off('error', onError);
        const addressInfo = server.address();
        activePort = typeof addressInfo === 'object' && addressInfo ? addressInfo.port : port;

        const displayHost = (bindHost === '0.0.0.0' || bindHost === '::' || bindHost === '[::]')
          ? 'localhost'
          : (bindHost.includes(':') ? `[${bindHost}]` : bindHost);
        console.log(`OpenChamber server listening on ${bindHost}:${activePort}`);
        console.log(`Health check: http://${displayHost}:${activePort}/health`);
        console.log(`Web interface: http://${displayHost}:${activePort}`);

        resolve();
      };

      server.listen(port, bindHost, onListening);
    });

    return { activePort };
  };

  const attachProcessHandlers = ({ attachSignals }: { attachSignals?: boolean }): void => {
    if (attachSignals && !getSignalsAttached()) {
      const handleSignal = async () => {
        await gracefulShutdown();
      };
      process.on('SIGTERM', handleSignal);
      process.on('SIGINT', handleSignal);
      process.on('SIGQUIT', handleSignal);
      setSignalsAttached(true);
      syncToHmrState();
    }

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown();
    });
  };

  return {
    resolveBindHost,
    startListening,
    attachProcessHandlers,
  };
}
