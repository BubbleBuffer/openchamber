// packages/web/server/src/index.ts
import "reflect-metadata";
import express from "express";
import compression from "compression";
import path from "node:path";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";

import { createFeatureRoutesRuntime, createStaticRoutesRuntime } from "./domains/routes/index.js";
import {
  createServerComposition,
  parseServeCliOptions,
  runCliEntryIfMain,
} from "./domains/bootstrap/index.js";
import { compressionFilter } from "./app/middleware.js";
import type {
  StartWebUiServerOptions,
  WebUiServerController,
} from "./shared/types.js";

// ── Constants ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
// src/index.ts lives one level deeper than server/index.js; go up to match old __dirname
const __dirname = path.dirname(path.dirname(__filename));

const DEFAULT_PORT = 3000;
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const CLIENT_RELOAD_DELAY_MS = 800;
const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 128;
const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 60 * 1000;
const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15 * 1000;

// ── Version detection ────────────────────────────────────────────
const OPENCHAMBER_VERSION = (() => {
  try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return (pkg && typeof pkg.version === "string" && pkg.version.trim()) || "unknown";
  } catch {
    return "unknown";
  }
})();

const isEnvFlagEnabled = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true";
};

export const shouldSkipZenModelValidation = (env: Record<string, unknown> = process.env): boolean =>
  isEnvFlagEnabled(env.OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION);

export const runZenModelValidationAtStartup = (
  env: Record<string, unknown>,
  validate: () => Promise<void>,
): boolean => {
  if (shouldSkipZenModelValidation(env)) {
    console.log("[zen] Startup model validation skipped by OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION");
    return false;
  }
  void validate();
  return true;
};

const PLAN_MODE_EXPERIMENT_ENABLED =
  isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE) ||
  isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL);

const fsPromises = fs.promises;
let composition = createServerComposition({
  processLike: process,
  env: process.env,
  globalThisLike: globalThis,
});

// ── main() — the actual server boot ──────────────────────────────
async function main(
  options: StartWebUiServerOptions = {},
): Promise<WebUiServerController> {
  const previousComposition = composition;
  const runComposition = previousComposition.state.runResourcesStarted
    ? createServerComposition({
        processLike: process,
        env: process.env,
        globalThisLike: globalThis,
      })
    : previousComposition;
  composition = runComposition;
  const { state: lifecycleState } = runComposition;
  const {
    openCodeRuntime,
    ensureOpenCodeDomain,
    bootstrapOpenCodeAtStartup,
    ensureGlobalWatcherStarted,
    syncToHmrState,
    gracefulShutdown,
    bootstrapRuntime,
    startupPipelineRuntime,
    featureRoutesDependencies,
    openCodeEnvState,
    uiNotificationClients,
    uiNotificationWsClients,
    globalMessageStreamHub,
    readSettingsFromDiskMigrated,
    readSettingsFromDisk,
    writeSettingsToDisk,
    persistSettings,
    normalizeDirectoryPath,
    sanitizeProjects,
    normalizePwaAppName,
    normalizePwaOrientation,
    formatSettingsResponse,
    validateDirectoryPath,
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
    readCustomThemesFromDisk,
    getUiSessionTokenFromRequest,
    rejectWebSocketUpgrade,
    isRequestOriginAllowed,
    getOrCreateVapidKeys,
    addOrUpdatePushSubscription,
    removePushSubscription,
    updateUiVisibility,
    isUiVisible,
    ensurePushInitialized,
    setPushInitialized,
    resolveGitBinaryForSpawn,
    buildAugmentedPath,
    searchPathFor,
    isExecutable,
    getOpenCodeResolutionSnapshot,
    resolveManagedOpenCodeLaunchSpec,
    refreshOpenCodeAfterConfigChange,
    writeSseEvent,
    fetchFreeZenModels,
    getCachedZenModels,
    resolveZenModel,
    validateZenModelAtStartup,
    setAutoAcceptSession,
    processForwardedEventPayload,
    triggerHealthCheck,
    setupProxy,
    sessionRuntime,
    isOpenCodeProcessOwnedByRun,
    stopOpenCodeWatcher,
    resetGlobalWatcherStartPromise,
  } = runComposition;
  const {
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
  } = runComposition;
  lifecycleState.runResourcesStarted = true;
  const port =
    typeof options.port === "number" && Number.isFinite(options.port) && options.port >= 0
      ? Math.trunc(options.port)
      : DEFAULT_PORT;
  const host =
    typeof options.host === "string" && options.host.length > 0
      ? options.host
      : undefined;
  const attachSignals = options.attachSignals !== false;
  if (typeof options.exitOnShutdown === "boolean") {
    lifecycleState.exitOnShutdown = options.exitOnShutdown;
  }

  console.log(`Starting OpenChamber on port ${port === 0 ? "auto" : port}`);
  runZenModelValidationAtStartup(process.env, validateZenModelAtStartup);

  const app = express();
  const serverStartedAt = new Date().toISOString();
  app.set("trust proxy", true);
  app.use(
    compression({
      filter: compressionFilter,
      threshold: 1024,
    }),
  );
  const previousLifecycleState = {
    server: lifecycleState.server,
    expressApp: lifecycleState.expressApp,
    uiAuthController: lifecycleState.uiAuthController,
    terminalRuntime: lifecycleState.terminalRuntime,
    messageStreamRuntime: lifecycleState.messageStreamRuntime,
    processHandlersDisposer: lifecycleState.processHandlersDisposer,
    signalsAttached: lifecycleState.signalsAttached,
  };
  lifecycleState.expressApp = app;
  const server = http.createServer(app);
  lifecycleState.server = server;

  let startupPipelineRunInvoked = false;
  let startupPipelineCompleted = false;
  let openCodeDomainInitialized = false;
  let previousOpenCodeApp: express.Express | null = null;
  let previousOpenCodeShuttingDown: boolean | undefined;
  const restorePreviousLifecycleState = (): void => {
    lifecycleState.server = previousLifecycleState.server;
    lifecycleState.expressApp = previousLifecycleState.expressApp;
    lifecycleState.uiAuthController = previousLifecycleState.uiAuthController;
    lifecycleState.terminalRuntime = previousLifecycleState.terminalRuntime;
    lifecycleState.messageStreamRuntime = previousLifecycleState.messageStreamRuntime;
    lifecycleState.processHandlersDisposer = previousLifecycleState.processHandlersDisposer;
    lifecycleState.signalsAttached = previousLifecycleState.signalsAttached;
    if (openCodeDomainInitialized) {
      openCodeRuntime.setApp(previousOpenCodeApp);
      if (previousOpenCodeShuttingDown !== undefined) {
        openCodeRuntime.setShuttingDown(previousOpenCodeShuttingDown);
      }
    }
  };
  const cleanupPreStartupResources = async (): Promise<void> => {
    const authController = lifecycleState.uiAuthController !== previousLifecycleState.uiAuthController
      ? lifecycleState.uiAuthController
      : null;
    if (authController?.dispose) {
      try {
        authController.dispose();
      } catch (error) {
        console.warn(
          `Startup cleanup failed for UI auth: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) {
          console.warn(
            `Startup cleanup failed for HTTP server: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        resolve();
      };
      try {
        server.close(finish);
      } catch (error) {
        finish(error);
      }
    });
    restorePreviousLifecycleState();
  };

  try {
    await ensureOpenCodeDomain();
    openCodeDomainInitialized = true;
    const openCodeState = openCodeRuntime.current?.getState?.();
    previousOpenCodeApp = openCodeState?.expressApp ?? null;
    previousOpenCodeShuttingDown = openCodeState?.isShuttingDown;
    openCodeRuntime.setShuttingDown(false);
    openCodeRuntime.setApp(app);

  const uiPassword = typeof options.uiPassword === "string" ? options.uiPassword : null;
  const bootstrapResult = bootstrapRuntime.setupBaseRoutes(app, {
    process,
    openchamberVersion: OPENCHAMBER_VERSION,
    runtimeName: "web",
    serverStartedAt,
    gracefulShutdown,
    getHealthSnapshot: () => {
      const resolvedBinary = openCodeEnvState.resolvedOpencodeBinary || null;
      const useWsl = openCodeEnvState.useWslForOpencode;
      const launchSpec = resolvedBinary && !useWsl ? resolveManagedOpenCodeLaunchSpec(resolvedBinary) : null;
      return {
        openCodePort: openCodeRuntime.getPort(),
        openCodeRunning: Boolean(
          openCodeRuntime.getPort() && openCodeRuntime.isReady() && !openCodeRuntime.isRestarting(),
        ),
        openCodeSecureConnection: openCodeRuntime.isConnectionSecure(),
        openCodeAuthSource: openCodeRuntime.getOpenCodeAuthSource() || null,
        openCodeApiPrefix: "",
        openCodeApiPrefixDetected: true,
        isOpenCodeReady: openCodeRuntime.isReady(),
        lastOpenCodeError: openCodeRuntime.getLastError(),
        opencodeBinaryResolved: openCodeEnvState.resolvedOpencodeBinary || null,
        opencodeBinarySource: openCodeEnvState.resolvedOpencodeBinarySource || null,
        opencodeLaunchBinary: launchSpec?.binary || null,
        opencodeLaunchArgs: launchSpec?.args || [],
        opencodeLaunchWrapperType: launchSpec?.wrapperType || null,
        opencodeViaWsl: openCodeEnvState.useWslForOpencode,
        opencodeWslBinary: openCodeEnvState.resolvedWslBinary || null,
        opencodeWslPath: openCodeEnvState.resolvedWslOpencodePath || null,
        opencodeWslDistro: openCodeEnvState.resolvedWslDistro || null,
        nodeBinaryResolved: openCodeEnvState.resolvedNodeBinary || null,
        bunBinaryResolved: openCodeEnvState.resolvedBunBinary || null,
        planModeExperimentalEnabled: PLAN_MODE_EXPERIMENT_ENABLED,
      };
    },
    uiPassword,
    readSettingsFromDiskMigrated,
    resolveZenModel,
    ensurePushInitialized,
    ensureGlobalWatcherStarted,
    getOrCreateVapidKeys,
    getUiSessionTokenFromRequest,
    writeSettingsToDisk,
    addOrUpdatePushSubscription,
    removePushSubscription,
    updateUiVisibility,
    isUiVisible,
    getUiNotificationClients: () => uiNotificationClients,
    writeSseEvent,
    sessionRuntime,
    setPushInitialized,
    fs,
    os,
    path,
    server,
    __dirname,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    modelsDevApiUrl: MODELS_DEV_API_URL,
    modelsMetadataCacheTtl: MODELS_METADATA_CACHE_TTL,
    fetchFreeZenModels,
    getCachedZenModels,
    setAutoAcceptSession,
  });
  lifecycleState.uiAuthController = bootstrapResult.uiAuthController;

  const featureRoutesRuntime = createFeatureRoutesRuntime({ clientReloadDelayMs: CLIENT_RELOAD_DELAY_MS });
  await featureRoutesRuntime.registerRoutes(app, {
    crypto,
    fs,
    os,
    path,
    fsPromises,
    spawn,
    resolveGitBinaryForSpawn,
    createFsSearchRuntime: featureRoutesDependencies.createFsSearchRuntime,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
    normalizeDirectoryPath,
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
    validateDirectoryPath,
    readCustomThemesFromDisk,
    refreshOpenCodeAfterConfigChange,
    getOpenCodeResolutionSnapshot,
    formatSettingsResponse,
    readSettingsFromDisk,
    readSettingsFromDiskMigrated,
    persistSettings,
    sanitizeProjects,
    buildAugmentedPath,
  });

  const staticRoutesRuntime = createStaticRoutesRuntime({
    fs,
    path,
    process,
    __dirname,
    express,
    resolveProjectDirectory,
    openCodeRuntime,
    readSettingsFromDiskMigrated,
    normalizePwaAppName,
    normalizePwaOrientation,
  });

  startupPipelineRunInvoked = true;
  const startupPipelineResult = await startupPipelineRuntime.run({
    app,
    server,
    express,
    fs,
    path,
    uiAuthController: lifecycleState.uiAuthController,
    buildAugmentedPath,
    searchPathFor,
    isExecutable,
    isRequestOriginAllowed,
    rejectWebSocketUpgrade,
    openCodeRuntime,
    globalEventHub: globalMessageStreamHub,
    processForwardedEventPayload,
    messageStreamWsClients: uiNotificationWsClients,
    terminalHeartbeatIntervalMs: TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
    terminalRebindWindowMs: TERMINAL_INPUT_WS_REBIND_WINDOW_MS,
    terminalMaxRebindsPerWindow: TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW,
    setupProxy: () => setupProxy(app),
    scheduleOpenCodeApiDetection: () => {},
    bootstrapOpenCodeAtStartup,
    triggerHealthCheck,
    staticRoutesRuntime,
    process,
    crypto,
    readSettingsFromDiskMigrated,
    gracefulShutdown,
    getSignalsAttached: () => lifecycleState.signalsAttached,
    setSignalsAttached: (value: boolean) => {
      lifecycleState.signalsAttached = value;
    },
    syncToHmrState,
    isOpenCodeProcessOwnedByRun,
    stopOpenCodeWatcher,
    resetGlobalWatcherStartPromise,
    host,
    port,
    attachSignals,
  });
  lifecycleState.terminalRuntime = startupPipelineResult.terminalRuntime;
  lifecycleState.messageStreamRuntime = startupPipelineResult.messageStreamRuntime;
  lifecycleState.processHandlersDisposer = startupPipelineResult.disposeProcessHandlers;
  let activePort: number | null = startupPipelineResult.activePort;
  startupPipelineCompleted = true;

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    console.error("[server] Unhandled request error", {
      method: req.method,
      route: typeof req.route?.path === "string" ? req.route.path : "unmatched",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    res.status(500).json({ error: "Internal server error", code: "internal_error" });
  });

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => activePort,
    getOpenCodePort: () => openCodeRuntime.getPort(),
    isReady: () => openCodeRuntime.isReady(),
    restartOpenCode: () => openCodeRuntime.restart(),
    stop: async (shutdownOptions: { exitProcess?: boolean } = {}) => {
      if (activePort !== null) {
        openCodeRuntime.setShuttingDown(false);
      }
      await gracefulShutdown({ exitProcess: shutdownOptions.exitProcess ?? false });
      activePort = null;
      lifecycleState.server = null;
      lifecycleState.expressApp = null;
    },
  };
  } catch (error) {
    if (!startupPipelineRunInvoked) {
      await cleanupPreStartupResources();
    } else if (!startupPipelineCompleted) {
      restorePreviousLifecycleState();
    } else {
      try {
        await gracefulShutdown({ exitProcess: false });
      } catch (cleanupError) {
        console.warn(
          `Startup cleanup failed after completion error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
    if (runComposition !== previousComposition && previousComposition.state.server) {
      composition = previousComposition;
    }
    throw error;
  }
}

// ── CLI entry ──────────────────────────────────────────────────────
runCliEntryIfMain({
  process,
  currentFilename: __filename,
  parseServeCliOptions,
  defaultPort: DEFAULT_PORT,
  setExitOnShutdown: (value: boolean) => {
    composition.state.exitOnShutdown = value;
  },
  startServer: main,
});

const gracefulShutdown = (options?: { exitProcess?: boolean }) => composition.gracefulShutdown(options);
const setupProxy = (app: express.Express) => composition.setupProxy(app);
const restartOpenCode = () => composition.openCodeRuntime.restart();
export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseServeCliOptions as parseArgs };
