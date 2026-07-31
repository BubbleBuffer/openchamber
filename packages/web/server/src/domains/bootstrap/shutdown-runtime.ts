/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ShutdownDeps, ShutdownRuntime } from "./types.js";

export function createGracefulShutdownRuntime(deps: ShutdownDeps): ShutdownRuntime {
  const {
    process,
    shutdownTimeoutMs,
    getExitOnShutdown,
    getIsShuttingDown,
    setIsShuttingDown,
    syncToHmrState,
    openCodeWatcherRuntime,
    resetGlobalWatcherStartPromise,
    sessionRuntime,
    notificationRuntime,
    getHealthCheckInterval,
    clearHealthCheckInterval,
    getTerminalRuntime,
    setTerminalRuntime,
    getMessageStreamRuntime,
    setMessageStreamRuntime,
    shouldSkipOpenCodeStop,
    getOpenCodeRuntime: _getOpenCodeRuntime,
    killProcessOnPort,
    waitForPortRelease,
    getServer,
    getUiAuthController,
    setUiAuthController,
    getProcessHandlersDisposer,
    setProcessHandlersDisposer,
    serverSessionMachineBridge,
    sessionActorRegistry,
    sessionEffectExecutor,
  } = deps;

  let shutdownPromise: Promise<void> | null = null;

  const gracefulShutdown = (options: { exitProcess?: boolean } = {}): Promise<void> => {
    const processHandlersDisposer = getProcessHandlersDisposer?.() ?? null;
    setProcessHandlersDisposer?.(null);
    if (processHandlersDisposer) {
      try {
        processHandlersDisposer();
      } catch (error) {
        console.warn('Error disposing process handlers:', error);
      }
    }
    if (shutdownPromise) return shutdownPromise;
    if (getIsShuttingDown()) return Promise.resolve();

    setIsShuttingDown(true);
    const runShutdown = async (): Promise<void> => {
      syncToHmrState();
      console.log('Starting graceful shutdown...');
      const exitProcess = typeof options.exitProcess === 'boolean' ? options.exitProcess : getExitOnShutdown();

      openCodeWatcherRuntime.stop();
      resetGlobalWatcherStartPromise?.();
      sessionRuntime.dispose();

      // Stop the server session machine bridge and dispose its resources
      if (serverSessionMachineBridge) {
        serverSessionMachineBridge.stop();
      }
      if (sessionActorRegistry) {
        sessionActorRegistry.dispose();
      }
      if (sessionEffectExecutor) {
        sessionEffectExecutor.dispose();
      }

      notificationRuntime?.dispose?.();

      const healthCheckInterval = getHealthCheckInterval();
      if (healthCheckInterval) {
        clearHealthCheckInterval(healthCheckInterval);
      }

      const terminalRuntime = getTerminalRuntime();
      if (terminalRuntime) {
        try {
          await terminalRuntime.shutdown();
        } catch (error) {
          console.warn('Error shutting down terminal runtime:', error);
        } finally {
          setTerminalRuntime(null);
        }
      }

      const messageStreamRuntime = getMessageStreamRuntime();
      if (messageStreamRuntime) {
        try {
          await messageStreamRuntime.close();
        } catch (error) {
          console.warn('Error closing message stream runtime:', error);
        } finally {
          setMessageStreamRuntime(null);
        }
      }

      if (!shouldSkipOpenCodeStop()) {
        const runtime = _getOpenCodeRuntime();
        const portToKill = runtime?.getPort() ?? null;
        const openCodeProcess = runtime?.getProcess() ?? null;

        if (openCodeProcess) {
          console.log('Stopping OpenCode process...');
          try {
            await openCodeProcess.close();
          } catch (error) {
            console.warn('Error closing OpenCode process:', error);
          }
          runtime?.clearProcess();
        }

        killProcessOnPort(portToKill);
        if (!(await waitForPortRelease(portToKill, 5000))) {
          console.warn(`Timed out waiting for OpenCode port ${portToKill} to be released during shutdown`);
        }
      } else {
        console.log('Skipping OpenCode shutdown (external server)');
      }

      const server = getServer();
      if (server) {
        await Promise.race([
          new Promise<void>((resolve) => {
            server.close(() => {
              console.log('HTTP server closed');
              resolve();
            });
          }),
          new Promise<void>((resolve) => {
            setTimeout(() => {
              console.warn('Server close timeout reached, forcing shutdown');
              resolve();
            }, shutdownTimeoutMs);
          }),
        ]);
      }

      const uiAuthController = getUiAuthController();
      if (uiAuthController) {
        uiAuthController.dispose();
        setUiAuthController(null);
      }

      console.log('Graceful shutdown complete');
      if (exitProcess) {
        process.exit(0);
      }
    };

    shutdownPromise = runShutdown().then(
      () => {
        shutdownPromise = null;
      },
      (error) => {
        shutdownPromise = null;
        setIsShuttingDown(false);
        try {
          syncToHmrState();
        } catch (syncError) {
          console.warn('Failed to synchronize shutdown state after shutdown error:', syncError);
        }
        throw error;
      },
    );
    return shutdownPromise;
  };

  return {
    gracefulShutdown,
  };
}
