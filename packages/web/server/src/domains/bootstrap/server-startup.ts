/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ProcessHandlersDisposer,
  ServerStartupDeps,
  ServerStartupRuntime,
} from "./types.js";

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

  let activeDisposer: ProcessHandlersDisposer | null = null;

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

  const attachProcessHandlers = ({ attachSignals }: { attachSignals?: boolean }): ProcessHandlersDisposer => {
    if (activeDisposer) return activeDisposer;

    const installed: Array<[string, (...args: any[]) => void]> = [];
    let installedSignals = false;
    const handleSignal = () => {
      void gracefulShutdown().catch((error) => {
        console.error('Signal shutdown failed:', error);
      });
    };
    const handleUnhandledRejection = (reason: unknown, promise: unknown) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    };
    const handleUncaughtException = (error: unknown) => {
      console.error('Uncaught Exception:', error);
      void gracefulShutdown().catch((shutdownError) => {
        console.error('Uncaught exception shutdown failed:', shutdownError);
      });
    };

    const install = (event: string, handler: (...args: any[]) => void): void => {
      process.on(event as any, handler);
      installed.push([event, handler]);
    };

    try {
      if (attachSignals && !getSignalsAttached()) {
        install('SIGTERM', handleSignal);
        install('SIGINT', handleSignal);
        install('SIGQUIT', handleSignal);
        installedSignals = true;
        setSignalsAttached(true);
        syncToHmrState();
      }

      install('unhandledRejection', handleUnhandledRejection);
      install('uncaughtException', handleUncaughtException);
    } catch (error) {
      for (const [event, handler] of installed) {
        process.off(event as any, handler);
      }
      if (installedSignals) {
        setSignalsAttached(false);
        syncToHmrState();
      }
      throw error;
    }

    let disposed = false;
    const disposer: ProcessHandlersDisposer = () => {
      if (disposed) return;
      disposed = true;
      for (const [event, handler] of installed) {
        process.off(event as any, handler);
      }
      if (installedSignals) {
        setSignalsAttached(false);
        syncToHmrState();
      }
      if (activeDisposer === disposer) activeDisposer = null;
    };
    activeDisposer = disposer;
    return disposer;
  };

  return {
    resolveBindHost,
    startListening,
    attachProcessHandlers,
  };
}
