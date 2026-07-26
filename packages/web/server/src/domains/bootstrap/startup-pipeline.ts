/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ProcessHandlersDisposer,
  StartupPipelineDeps,
  StartupPipelineRunResult,
  StartupPipelineRuntime,
} from "./types.js";

export function createStartupPipelineRuntime(deps: StartupPipelineDeps): StartupPipelineRuntime {
  const {
    createTerminalRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  } = deps;

  const run = async (options: any): Promise<StartupPipelineRunResult> => {
    const {
      app,
      server,
      express,
      fs,
      path,
      uiAuthController,
      buildAugmentedPath,
      searchPathFor,
      isExecutable,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      openCodeRuntime,
      globalEventHub,
      processForwardedEventPayload,
      messageStreamWsClients,
      triggerHealthCheck,
      terminalHeartbeatIntervalMs,
      terminalRebindWindowMs,
      terminalMaxRebindsPerWindow,
      setupProxy,
      scheduleOpenCodeApiDetection,
      bootstrapOpenCodeAtStartup,
      staticRoutesRuntime,
      process,
      crypto,
      readSettingsFromDiskMigrated,
      gracefulShutdown,
      getSignalsAttached,
      setSignalsAttached,
      syncToHmrState,
      host,
      port,
      attachSignals,
    } = options;

    let terminalRuntime: any = null;
    let messageStreamRuntime: any = null;
    let disposeProcessHandlers: ProcessHandlersDisposer | null = null;
    let bootstrapPromise: Promise<void> | null = null;
    let failed = false;
    let openCodeCleanupPromise: Promise<void> | null = null;
    const initialOpenCodeProcess = openCodeRuntime?.getProcess?.() ?? null;
    const initialOpenCodePort = openCodeRuntime?.getPort?.() ?? null;

    const logCleanupFailure = (resource: string, error: unknown): void => {
      console.warn(
        `Startup cleanup failed for ${resource}: ${error instanceof Error ? error.message : String(error)}`,
      );
    };

    const cleanupOpenCodeWatcher = (): void => {
      try {
        options.stopOpenCodeWatcher?.();
      } catch (error) {
        logCleanupFailure("OpenCode watcher", error);
      }
      try {
        options.resetGlobalWatcherStartPromise?.();
      } catch (error) {
        logCleanupFailure("OpenCode watcher state", error);
      }
    };

    const closeServer = async (): Promise<void> => {
      if (!server || typeof server.close !== "function") return;
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true;
          if (error) logCleanupFailure("HTTP server", error);
          resolve();
        };
        try {
          server.close(finish);
        } catch (error) {
          finish(error);
        }
      });
    };

    const cleanupOpenCode = async (): Promise<void> => {
      if (openCodeCleanupPromise) return openCodeCleanupPromise;
      const currentProcess = openCodeRuntime?.getProcess?.() ?? null;
      const isExternal = openCodeRuntime?.isExternal?.() ?? false;
      const isOwnedByRun = options.isOpenCodeProcessOwnedByRun
        ? options.isOpenCodeProcessOwnedByRun()
        : currentProcess !== null && currentProcess !== initialOpenCodeProcess;
      if (!currentProcess || !isOwnedByRun || isExternal) return;
      openCodeCleanupPromise = (async () => {
        const currentPort = openCodeRuntime?.getPort?.() ?? null;
        try {
          await currentProcess.close?.();
        } catch (error) {
          logCleanupFailure("OpenCode process", error);
        } finally {
          try {
            openCodeRuntime?.clearProcess?.();
          } catch (error) {
            logCleanupFailure("OpenCode process state", error);
          }
        }

        if (currentPort !== null && currentPort !== initialOpenCodePort) {
          try {
            openCodeRuntime?.killProcessOnPort?.(currentPort);
            await openCodeRuntime?.waitForPortRelease?.(currentPort, 5000);
          } catch (error) {
            logCleanupFailure("OpenCode port", error);
          }
        }
      })();
      return openCodeCleanupPromise;
    };

    const observeBootstrap = (): void => {
      if (!bootstrapPromise) return;
      void bootstrapPromise.then(
        () => {
          if (!failed) return;
          cleanupOpenCodeWatcher();
          return cleanupOpenCode();
        },
        (error) => {
          console.warn(
            `OpenCode startup failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          if (!failed) return;
          cleanupOpenCodeWatcher();
          return cleanupOpenCode();
        },
      );
    };

    const rollback = async (): Promise<void> => {
      failed = true;
      observeBootstrap();
      cleanupOpenCodeWatcher();

      if (disposeProcessHandlers) {
        try {
          disposeProcessHandlers();
        } catch (error) {
          logCleanupFailure("process handlers", error);
        }
        disposeProcessHandlers = null;
      }

      if (messageStreamRuntime) {
        try {
          await messageStreamRuntime.close?.();
        } catch (error) {
          logCleanupFailure("message stream", error);
        }
        messageStreamRuntime = null;
      }

      if (terminalRuntime) {
        try {
          await terminalRuntime.shutdown?.();
        } catch (error) {
          logCleanupFailure("terminal", error);
        }
        terminalRuntime = null;
      }

      await cleanupOpenCode();
      await closeServer();

      if (uiAuthController?.dispose) {
        try {
          uiAuthController.dispose();
        } catch (error) {
          logCleanupFailure("UI auth", error);
        }
      }
    };

    try {
      terminalRuntime = createTerminalRuntime({
        app,
        server,
        express,
        fs,
        path,
        uiAuthController,
        buildAugmentedPath,
        searchPathFor,
        isExecutable,
        isRequestOriginAllowed,
        rejectWebSocketUpgrade,
        TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: terminalHeartbeatIntervalMs,
        TERMINAL_INPUT_WS_REBIND_WINDOW_MS: terminalRebindWindowMs,
        TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: terminalMaxRebindsPerWindow,
      });

      messageStreamRuntime = createMessageStreamWsRuntime({
        server,
        uiAuthController,
        isRequestOriginAllowed,
        rejectWebSocketUpgrade,
        openCodeRuntime,
        globalEventHub,
        processForwardedEventPayload,
        wsClients: messageStreamWsClients,
        triggerHealthCheck,
      });

      setupProxy(app);
      scheduleOpenCodeApiDetection();
      try {
        bootstrapPromise = Promise.resolve(bootstrapOpenCodeAtStartup());
      } catch (error) {
        bootstrapPromise = Promise.reject(error);
      }
      observeBootstrap();

      staticRoutesRuntime.registerStaticRoutes(app);

      const serverStartupRuntime = createServerStartupRuntime({
        process,
        crypto,
        server,
        readSettingsFromDiskMigrated,
        gracefulShutdown,
        getSignalsAttached,
        setSignalsAttached,
        syncToHmrState,
      });

      const bindHost = serverStartupRuntime.resolveBindHost(host);
      const startupResult = await serverStartupRuntime.startListening({
        port,
        bindHost,
      });

      disposeProcessHandlers =
        serverStartupRuntime.attachProcessHandlers({ attachSignals }) ?? (() => {});

      return {
        terminalRuntime,
        messageStreamRuntime,
        activePort: startupResult.activePort,
        disposeProcessHandlers: disposeProcessHandlers ?? (() => {}),
      };
    } catch (error) {
      await rollback();
      throw error;
    }
  };

  return {
    run,
  };
}
