/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import webPush from "web-push";
import { createSessionMachine } from "@openchamber/session-state";

import { createEventBus } from "../core/index.js";
import { createOpenCodeDomain } from "../opencode/index.js";
import { createRequestSecurityRuntime } from "../security/index.js";
import { prepareNotificationLastMessage } from "../notifications/index.js";
import {
  createNotificationDeliveryRuntime,
  createNotificationEmitterRuntime,
  createNotificationTemplateRuntime,
  createNotificationTriggerRuntime,
  createPushRuntime,
} from "../notifications/index.js";
import {
  createGlobalMessageStreamHub,
  createGlobalUiEventBroadcaster,
  createMessageStreamWsRuntime,
} from "../event-stream/index.js";
import { createFsSearchRuntime as createFsSearchRuntimeFactory } from "../fs/index.js";
import {
  createHmrStateRuntime,
  createOpenCodeEnvRuntime,
  createOpenCodeResolutionRuntime,
  createOpenCodeWatcherRuntime,
  createProjectDirectoryRuntime,
  resolveOpenCodeEnvConfig,
} from "../opencode-support/index.js";
import {
  createSettingsHelpers,
  createSettingsNormalizationRuntime,
  createSettingsRuntime,
  createThemeRuntime,
} from "../settings/index.js";
import {
  registerAuthAndAccessRoutes,
  registerCommonRequestMiddleware,
  registerOpenChamberRoutes,
  registerServerStatusRoutes,
} from "../routes/index.js";
import { registerNotificationRoutes } from "../notifications/index.js";
import { createServerUtilsRuntime } from "../server-utils/index.js";
import { createTerminalRuntime } from "../terminal/runtime.js";
import {
  createEffectExecutor as createEffectExecutorFactory,
  createServerSessionMachineBridge,
  createSessionActorRegistry as createSessionActorRegistryFactory,
  createSessionRuntime,
  createSnapshotPublisher as createSnapshotPublisherFactory,
} from "../sessions/index.js";
import { createUiAuth } from "../ui-auth/index.js";
import { createBootstrapRuntime } from "./bootstrap-runtime.js";
import { createGracefulShutdownRuntime } from "./shutdown-runtime.js";
import { createServerStartupRuntime } from "./server-startup.js";
import { createStartupPipelineRuntime } from "./startup-pipeline.js";

export interface ServerCompositionOptions {
  createOpenCodeDomain?: typeof createOpenCodeDomain;
  processLike?: typeof process;
  env?: NodeJS.ProcessEnv;
  globalThisLike?: typeof globalThis;
}

export interface ServerComposition {
  state: {
    signalsAttached: boolean;
    server: any;
    expressApp: any;
    uiAuthController: any;
    terminalRuntime: any;
    messageStreamRuntime: any;
    exitOnShutdown: boolean;
    globalWatcherStartPromise: Promise<void> | null;
    processHandlersDisposer: (() => void) | null;
    runResourcesStarted: boolean;
  };
  openCodeRuntime: any;
  ensureOpenCodeDomain: () => Promise<any>;
  bootstrapOpenCodeAtStartup: () => Promise<void>;
  isOpenCodeProcessOwnedByRun: () => boolean;
  stopOpenCodeWatcher: () => void;
  resetGlobalWatcherStartPromise: () => void;
  ensureGlobalWatcherStarted: () => Promise<void | null>;
  syncToHmrState: () => void;
  syncFromHmrState: () => void;
  gracefulShutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
  bootstrapRuntime: any;
  startupPipelineRuntime: any;
  featureRoutesDependencies: Record<string, any>;
  openCodeEnvState: Record<string, any>;
  uiNotificationClients: Set<any>;
  uiNotificationWsClients: Set<any>;
  eventBus: any;
  globalMessageStreamHub: any;
  openCodeWatcherRuntime: any;
  serverUtilsRuntime: any;
  sessionRuntime: any;
  sessionActorRegistry: any;
  openCodeResolutionRuntime: any;
  readSettingsFromDiskMigrated: any;
  readSettingsFromDisk: any;
  writeSettingsToDisk: any;
  persistSettings: any;
  normalizeDirectoryPath: any;
  normalizePathForPersistence: any;
  normalizeSettingsPaths: any;
  isUnsafeSkillRelativePath: any;
  sanitizeTypographySizesPartial: any;
  normalizeStringArray: any;
  sanitizeModelRefs: any;
  sanitizeSkillCatalogs: any;
  sanitizeProjects: any;
  normalizePwaAppName: any;
  normalizePwaOrientation: any;
  sanitizeSettingsUpdate: any;
  mergePersistedSettings: any;
  formatSettingsResponse: any;
  resolveDirectoryCandidate: any;
  validateDirectoryPath: any;
  resolveProjectDirectory: any;
  resolveOptionalProjectDirectory: any;
  readCustomThemesFromDisk: any;
  getUiSessionTokenFromRequest: any;
  rejectWebSocketUpgrade: any;
  isRequestOriginAllowed: any;
  getOrCreateVapidKeys: any;
  addOrUpdatePushSubscription: any;
  removePushSubscription: any;
  sendPushToAllUiSessions: any;
  updateUiVisibility: any;
  isUiVisible: any;
  ensurePushInitialized: any;
  setPushInitialized: any;
  resolveGitBinaryForSpawn: any;
  spawn: typeof import("node:child_process").spawn;
  fs: typeof fs;
  fsPromises: typeof fs.promises;
  os: typeof os;
  path: typeof path;
  crypto: typeof crypto;
  process: typeof process;
  express: typeof express;
  openchamberDataDir: string;
  openchamberUserConfigRoot: string;
  buildAugmentedPath: any;
  buildManagedOpenCodePath: any;
  searchPathFor: any;
  isExecutable: any;
  parseSseDataPayload: any;
  getOpenCodeResolutionSnapshot: any;
  resolveManagedOpenCodeLaunchSpec: any;
  refreshOpenCodeAfterConfigChange: any;
  writeSseEvent: any;
  fetchFreeZenModels: any;
  getCachedZenModels: any;
  resolveZenModel: any;
  validateZenModelAtStartup: any;
  setAutoAcceptSession: any;
  processForwardedEventPayload: any;
  getOpenCodePort: () => number | null;
  triggerHealthCheck: any;
  setupProxy: any;
}

const HEALTH_CHECK_INTERVAL = 15000;
const SHUTDOWN_TIMEOUT = 10000;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

export function createServerComposition(
  options: ServerCompositionOptions = {},
): ServerComposition {
  const processLike = options.processLike ?? process;
  const env = options.env ?? processLike.env;
  const globalThisLike = options.globalThisLike ?? globalThis;

  const OPENCHAMBER_USER_CONFIG_ROOT = path.join(
    os.homedir(),
    ".config",
    "openchamber",
  );
  const OPENCHAMBER_USER_THEMES_DIR = path.join(
    OPENCHAMBER_USER_CONFIG_ROOT,
    "themes",
  );
  const MAX_THEME_JSON_BYTES = 512 * 1024;
  const OPENCHAMBER_DATA_DIR = env.OPENCHAMBER_DATA_DIR
    ? path.resolve(env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), ".config", "openchamber");
  const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, "settings.json");
  const PUSH_SUBSCRIPTIONS_FILE_PATH = path.join(
    OPENCHAMBER_DATA_DIR,
    "push-subscriptions.json",
  );

  const state: ServerComposition["state"] = {
    signalsAttached: false,
    server: null,
    expressApp: null,
    uiAuthController: null,
    terminalRuntime: null,
    messageStreamRuntime: null,
    exitOnShutdown: true,
    globalWatcherStartPromise: null,
    processHandlersDisposer: null,
    runResourcesStarted: false,
  };

  const settingsNormalizationRuntime = createSettingsNormalizationRuntime({
    os,
    path,
    processLike,
  });
  const {
    normalizeDirectoryPath,
    normalizePathForPersistence,
    normalizeSettingsPaths,
    isUnsafeSkillRelativePath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  } = settingsNormalizationRuntime;

  const themeRuntime = createThemeRuntime({
    fsPromises: fs.promises,
    path,
    themesDir: OPENCHAMBER_USER_THEMES_DIR,
    maxThemeJsonBytes: MAX_THEME_JSON_BYTES,
    logger: console,
  });
  const { readCustomThemesFromDisk } = themeRuntime;

  const settingsHelpers = createSettingsHelpers({
    normalizePathForPersistence,
    normalizeDirectoryPath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  });
  const {
    normalizePwaAppName,
    normalizePwaOrientation,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    formatSettingsResponse,
  } = settingsHelpers;

  const projectDirectoryRuntime = createProjectDirectoryRuntime({
    fsPromises: fs.promises,
    path,
    normalizeDirectoryPath,
    getReadSettingsFromDiskMigrated: () => readSettingsFromDiskMigrated,
    sanitizeProjects,
  } as any);
  const {
    resolveDirectoryCandidate,
    validateDirectoryPath,
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
  } = projectDirectoryRuntime;

  const settingsRuntime = createSettingsRuntime({
    fsPromises: fs.promises,
    path,
    crypto,
    SETTINGS_FILE_PATH,
    sanitizeProjects,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    normalizeSettingsPaths,
    normalizeStringArray,
    formatSettingsResponse,
    resolveDirectoryCandidate,
  });
  const readSettingsFromDiskMigrated = settingsRuntime.readSettingsFromDiskMigrated;
  const {
    readSettingsFromDisk,
    writeSettingsToDisk,
    persistSettings,
  } = settingsRuntime;

  const requestSecurityRuntime = createRequestSecurityRuntime({
    readSettingsFromDiskMigrated,
  });
  const {
    getUiSessionTokenFromRequest,
    rejectWebSocketUpgrade,
    isRequestOriginAllowed,
  } = requestSecurityRuntime;

  const pushRuntime = createPushRuntime({
    fsPromises: fs.promises,
    path,
    webPush,
    PUSH_SUBSCRIPTIONS_FILE_PATH,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
  });
  const {
    getOrCreateVapidKeys,
    addOrUpdatePushSubscription,
    removePushSubscription,
    sendPushToAllUiSessions,
    updateUiVisibility,
    isUiVisible,
    ensurePushInitialized,
    setPushInitialized,
  } = pushRuntime;

  const {
    configuredOpenCodePort: ENV_CONFIGURED_OPENCODE_PORT,
    configuredOpenCodeHost: ENV_CONFIGURED_OPENCODE_HOST,
    effectivePort: ENV_EFFECTIVE_PORT,
    configuredOpenCodeHostname: ENV_CONFIGURED_OPENCODE_HOSTNAME,
  } = resolveOpenCodeEnvConfig({ env, logger: console });
  const ENV_SKIP_OPENCODE_START =
    env.OPENCODE_SKIP_START === "true" ||
    env.OPENCHAMBER_SKIP_OPENCODE_START === "true";
  const ENV_CONFIGURED_OPENCODE_WSL_DISTRO =
    typeof env.OPENCODE_WSL_DISTRO === "string" &&
    env.OPENCODE_WSL_DISTRO.trim().length > 0
      ? env.OPENCODE_WSL_DISTRO.trim()
      : typeof env.OPENCHAMBER_OPENCODE_WSL_DISTRO === "string" &&
          env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim().length > 0
        ? env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim()
        : null;

  const hmrStateRuntime = createHmrStateRuntime({
    globalThisLike,
    os,
    processLike,
    stateKey: "__openchamberHmrState",
  });
  const hmrState = hmrStateRuntime.getOrCreateHmrState();
  hmrStateRuntime.ensureUserProvidedOpenCodePassword(hmrState);
  const userProvidedOpenCodePassword =
    hmrStateRuntime.getUserProvidedOpenCodePassword(hmrState);

  const syncToHmrState = () => {
    const runtime = openCodeRuntimeRef.current;
    if (!runtime) return;
    const s = runtime.getState();
    hmrStateRuntime.syncStateFromRuntime(hmrState, {
      openCodeProcess: s.openCodeProcess,
      openCodePort: s.openCodePort,
      openCodeBaseUrl: s.openCodeBaseUrl,
      isExternalOpenCode: s.isExternalOpenCode,
      isShuttingDown: s.isShuttingDown,
      signalsAttached: state.signalsAttached,
      openCodeWorkingDirectory: s.openCodeWorkingDirectory,
      openCodeAuthPassword: s.openCodeAuthPassword,
      openCodeAuthSource: s.openCodeAuthSource,
    });
  };

  const syncFromHmrState = () => {
    const runtime = openCodeRuntimeRef.current;
    if (!runtime) return;
    const s = runtime.getState();
    const restored = hmrStateRuntime.restoreRuntimeFromState({
      hmrState,
      userProvidedOpenCodePassword,
    });
    s.openCodeProcess = restored.openCodeProcess;
    s.openCodePort = restored.openCodePort;
    s.openCodeBaseUrl = restored.openCodeBaseUrl;
    if (restored.isExternalOpenCode !== undefined) {
      s.isExternalOpenCode = restored.isExternalOpenCode;
    }
    s.isShuttingDown = restored.isShuttingDown;
    s.openCodeWorkingDirectory = restored.openCodeWorkingDirectory;
    s.openCodeAuthPassword = restored.openCodeAuthPassword;
    s.openCodeAuthSource = restored.openCodeAuthSource;
    state.signalsAttached = restored.signalsAttached;
  };

  const openCodeEnvState: Record<string, any> = {};
  const openCodeEnvRuntime = createOpenCodeEnvRuntime({
    state: openCodeEnvState,
    normalizeDirectoryPath,
    readSettingsFromDiskMigrated,
    ENV_CONFIGURED_OPENCODE_WSL_DISTRO,
  });
  const {
    applyLoginShellEnvSnapshot,
    getLoginShellEnvSnapshot,
    ensureOpencodeCliEnv,
    applyOpencodeBinaryFromSettings: _applyOpencodeBinaryFromSettings,
    resolveOpencodeCliPath,
    isExecutable,
    searchPathFor,
    resolveGitBinaryForSpawn,
    resolveWslExecutablePath,
    buildWslExecArgs,
    resolveManagedOpenCodeLaunchSpec,
    clearResolvedOpenCodeBinary,
  } = openCodeEnvRuntime;
  const applyOpencodeBinaryFromSettings: () => Promise<void> = async () => {
    await _applyOpencodeBinaryFromSettings();
  };
  applyLoginShellEnvSnapshot();

  const openCodeResolutionRuntime = createOpenCodeResolutionRuntime({
    path,
    resolveOpencodeCliPath,
    applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv,
    resolveManagedOpenCodeLaunchSpec,
    getResolvedState: () => ({
      resolvedOpencodeBinary: openCodeEnvState.resolvedOpencodeBinary || null,
      resolvedOpencodeBinarySource:
        openCodeEnvState.resolvedOpencodeBinarySource || null,
      useWslForOpencode: openCodeEnvState.useWslForOpencode,
      resolvedWslBinary: openCodeEnvState.resolvedWslBinary,
      resolvedWslOpencodePath: openCodeEnvState.resolvedWslOpencodePath,
      resolvedWslDistro: openCodeEnvState.resolvedWslDistro,
      resolvedNodeBinary: openCodeEnvState.resolvedNodeBinary,
      resolvedBunBinary: openCodeEnvState.resolvedBunBinary,
    }),
    setResolvedOpencodeBinarySource: (value: any) => {
      openCodeEnvState.resolvedOpencodeBinarySource = value;
    },
  });
  const { getOpenCodeResolutionSnapshot } = openCodeResolutionRuntime;

  const eventBus = createEventBus();
  const openCodeRuntimeRef: { current: any } = { current: null };
  const openCodeDomainRef: { current: any } = { current: null };
  const openCodeRuntime: any = new Proxy(openCodeRuntimeRef, {
    get(_target, prop) {
      if (prop === "current") return openCodeRuntimeRef.current;
      const runtime = openCodeRuntimeRef.current;
      if (runtime == null) return undefined;
      const value = runtime[prop];
      return typeof value === "function" ? value.bind(runtime) : value;
    },
    has(_target, prop) {
      if (prop === "current") return true;
      const runtime = openCodeRuntimeRef.current;
      if (runtime == null) return false;
      return prop in runtime;
    },
  });

  const ensureOpenCodeDomain = async (): Promise<any> => {
    if (openCodeDomainRef.current) return openCodeDomainRef.current;
    const createDomain = options.createOpenCodeDomain ?? createOpenCodeDomain;
    openCodeDomainRef.current = await (createDomain as any)({
      eventBus,
      env: {
        ENV_CONFIGURED_OPENCODE_PORT,
        ENV_CONFIGURED_OPENCODE_HOST,
        ENV_EFFECTIVE_PORT,
        ENV_CONFIGURED_OPENCODE_HOSTNAME,
        ENV_SKIP_OPENCODE_START,
      },
      syncToHmrState,
      syncFromHmrState,
      applyOpencodeBinaryFromSettings,
      ensureOpencodeCliEnv,
      buildWslExecArgs,
      resolveWslExecutablePath,
      resolveManagedOpenCodeLaunchSpec,
      getBuildAugmentedPath: () =>
        serverUtilsRuntime ? serverUtilsRuntime.buildAugmentedPath() : "",
      getBuildManagedOpenCodePath: () =>
        serverUtilsRuntime
          ? serverUtilsRuntime.buildManagedOpenCodePath()
          : "",
      clearResolvedOpenCodeBinary,
      normalizeApiPrefix: (prefix: string) => {
        const trimmed = (prefix || "").trim();
        return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
      },
      userProvidedPassword: userProvidedOpenCodePassword,
      getServerUtilsRuntime: () => serverUtilsRuntime,
    });
    openCodeRuntimeRef.current = openCodeDomainRef.current;
    return openCodeDomainRef.current;
  };

  const uiNotificationClients: Set<any> = new Set();
  const uiNotificationWsClients: Set<any> = new Set();
  const notificationEmitterRuntime = createNotificationEmitterRuntime({
    getUiNotificationClients: () => uiNotificationClients,
    getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
  });
  const { writeSseEvent } = notificationEmitterRuntime;
  const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
    sseClients: uiNotificationClients,
    wsClients: uiNotificationWsClients,
    writeSseEvent,
  });

  const sessionActorRegistry = createSessionActorRegistryFactory({
    createSessionMachine,
  });
  const sessionRuntime: any = createSessionRuntime({
    writeSseEvent,
    getNotificationClients: () => uiNotificationClients,
    broadcastEvent: broadcastGlobalUiEvent,
    actorRegistry: sessionActorRegistry,
  });
  sessionRuntime.resetAllSessionActivityToIdle();

  const serverUtilsRuntime = (createServerUtilsRuntime as any)({
    fs,
    os,
    path,
    process: processLike,
    openCodeReadyGraceMs: OPEN_CODE_READY_GRACE_MS,
    longRequestTimeoutMs: LONG_REQUEST_TIMEOUT_MS,
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
    ensureOpenCodeApiPrefix: () => {
      try {
        openCodeRuntimeRef.current?.getNetworkRuntime().ensureOpenCodeApiPrefix();
      } catch {
        /* best-effort */
      }
    },
    getUiNotificationClients: () => uiNotificationClients,
    getOpenCodePort: () => openCodeRuntimeRef.current?.getPort() ?? null,
    getLoginShellPath: () => {
      const snapshot = getLoginShellEnvSnapshot();
      return snapshot && typeof snapshot.PATH === "string" && snapshot.PATH.length > 0
        ? snapshot.PATH
        : null;
    },
  });
  const {
    setupProxy,
    waitForOpenCodePort,
    buildAugmentedPath,
    buildManagedOpenCodePath,
    parseSseDataPayload,
  } = serverUtilsRuntime;

  const notificationTemplateRuntime: any = createNotificationTemplateRuntime({
    eventBus,
    readSettingsFromDisk,
    persistSettings,
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
    resolveGitBinaryForSpawn,
  });
  const {
    resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage,
    summarizeText,
    extractLastMessageText,
    fetchLastAssistantMessageText,
    maybeCacheSessionInfoFromEvent,
    buildTemplateVariables,
    fetchFreeZenModels,
    resolveZenModel,
    validateZenModelAtStartup,
    getCachedZenModels,
  } = notificationTemplateRuntime;

  const notificationTriggerRuntime: any = createNotificationTriggerRuntime({
    eventBus,
    readSettingsFromDisk,
    prepareNotificationLastMessage,
    summarizeText,
    resolveZenModel,
    buildTemplateVariables,
    extractLastMessageText,
    fetchLastAssistantMessageText,
    resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage,
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
  });
  const { maybeSendPushForTrigger, setAutoAcceptSession } = notificationTriggerRuntime;
  const notificationDeliveryRuntime = createNotificationDeliveryRuntime({
    eventBus,
    broadcastUiNotification: notificationEmitterRuntime.broadcastUiNotification,
    sendPushToAllUiSessions,
    notificationTriggerRuntime,
    notificationTemplateRuntime,
  });

  const globalMessageStreamHub = createGlobalMessageStreamHub({
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
  });
  globalMessageStreamHub.subscribeStatus((status: any) => {
    if (status.type === "connect") sessionRuntime.resetAllSessionActivityToIdle();
  });

  const openCodeWatcherRuntime = (createOpenCodeWatcherRuntime as any)({
    waitForOpenCodePort: (...args: any[]) => waitForOpenCodePort(...args),
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
    parseSseDataPayload,
    globalEventHub: globalMessageStreamHub,
    onPayload: (payload: any) => {
      maybeCacheSessionInfoFromEvent(payload);
      void maybeSendPushForTrigger(payload);
      sessionRuntime.processOpenCodeSsePayload(payload);
    },
  });
  let openCodeProcessOwnedByRun = false;
  const ensureGlobalWatcherStarted = async (): Promise<void | null> => {
    if (state.globalWatcherStartPromise) return state.globalWatcherStartPromise;
    state.globalWatcherStartPromise = openCodeWatcherRuntime.start().catch((error: any) => {
      state.globalWatcherStartPromise = null;
      throw error;
    });
    return state.globalWatcherStartPromise;
  };
  const resetGlobalWatcherStartPromise = (): void => {
    state.globalWatcherStartPromise = null;
  };

  const processForwardedEventPayload = (_payload: any, _emitSyntheticEvent: any): void => {
    void _payload;
    void _emitSyntheticEvent;
  };

  const sessionEffectExecutor = createEffectExecutorFactory();
  const sessionSnapshotPublisher = createSnapshotPublisherFactory({
    transport: {
      writeSseEvent: (snapshot: any) => {
        globalMessageStreamHub.emitSynthetic({
          type: "openchamber:session-snapshot",
          properties: snapshot,
        });
      },
    },
  });
  const serverSessionMachineBridge = createServerSessionMachineBridge({
    registry: sessionActorRegistry,
    executor: sessionEffectExecutor,
    publisher: sessionSnapshotPublisher,
    eventBus,
  });
  serverSessionMachineBridge.start();

  const bootstrapRuntime = createBootstrapRuntime({
    createUiAuth,
    registerServerStatusRoutes,
    registerCommonRequestMiddleware,
    registerAuthAndAccessRoutes,
    registerNotificationRoutes,
    registerOpenChamberRoutes,
    express,
  });
  const startupPipelineRuntime = createStartupPipelineRuntime({
    createTerminalRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  });

  const refreshOpenCodeAfterConfigChange = (...args: any[]) =>
    openCodeRuntime.refreshAfterConfigChange(...args);
  const bootstrapOpenCodeAtStartup = async (): Promise<void> => {
    const processBeforeInit = openCodeRuntime.getProcess();
    const hmrProcess = hmrState.openCodeProcess;
    await openCodeRuntime.init();
    openCodeRuntime.setShuttingDown(false);
    const processAfterInit = openCodeRuntime.getProcess();
    openCodeProcessOwnedByRun = Boolean(
      processAfterInit &&
      !openCodeRuntime.isExternal() &&
      processAfterInit !== processBeforeInit &&
      processAfterInit !== hmrProcess,
    );
    if (openCodeRuntime.getProcess() && !openCodeRuntime.isExternal()) {
      openCodeRuntime.startHealthMonitoring(HEALTH_CHECK_INTERVAL);
    }
    void ensureGlobalWatcherStarted().catch((error) => {
      console.warn(
        `Global event watcher startup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };

  const gracefulShutdownRuntime = (createGracefulShutdownRuntime as any)({
    process: processLike,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT,
    getExitOnShutdown: () => state.exitOnShutdown,
    getIsShuttingDown: () =>
      openCodeRuntimeRef.current
        ? openCodeRuntimeRef.current.getState().isShuttingDown
        : false,
    setIsShuttingDown: (value: boolean) => {
      if (openCodeRuntimeRef.current) openCodeRuntimeRef.current.setShuttingDown(value);
    },
    syncToHmrState,
    openCodeWatcherRuntime,
    resetGlobalWatcherStartPromise,
    sessionRuntime,
    notificationRuntime: notificationDeliveryRuntime,
    getHealthCheckInterval: () =>
      openCodeRuntimeRef.current
        ? openCodeRuntimeRef.current.getState().healthCheckInterval
        : null,
    clearHealthCheckInterval: (value: any) => clearInterval(value),
    getTerminalRuntime: () => state.terminalRuntime,
    setTerminalRuntime: (value: any) => {
      state.terminalRuntime = value;
    },
    getMessageStreamRuntime: () => state.messageStreamRuntime,
    setMessageStreamRuntime: (value: any) => {
      state.messageStreamRuntime = value;
    },
    shouldSkipOpenCodeStop: () =>
      ENV_SKIP_OPENCODE_START ||
      (openCodeRuntimeRef.current && openCodeRuntimeRef.current.isExternal()),
    getOpenCodeRuntime: () => openCodeRuntimeRef.current,
    getOpenCodePort: () =>
      openCodeRuntimeRef.current ? openCodeRuntimeRef.current.getPort() : null,
    getOpenCodeProcess: () =>
      openCodeRuntimeRef.current ? openCodeRuntimeRef.current.getProcess() : null,
    setOpenCodeProcess: (value: any) => {
      if (openCodeRuntimeRef.current) {
        openCodeRuntimeRef.current.getState().openCodeProcess = value;
      }
    },
    killProcessOnPort: (port: number) => {
      openCodeRuntimeRef.current?.killProcessOnPort(port);
    },
    waitForPortRelease: async (port: number, timeoutMs: number) =>
      (await openCodeRuntimeRef.current?.waitForPortRelease(port, timeoutMs)) ?? true,
    getServer: () => state.server,
    getUiAuthController: () => state.uiAuthController,
    setUiAuthController: (value: any) => {
      state.uiAuthController = value;
    },
    getProcessHandlersDisposer: () => state.processHandlersDisposer,
    setProcessHandlersDisposer: (value: (() => void) | null) => {
      state.processHandlersDisposer = value;
    },
    serverSessionMachineBridge,
    sessionActorRegistry,
    sessionEffectExecutor,
  });
  const { gracefulShutdown } = gracefulShutdownRuntime;

  eventBus.on("opencode:ready", () => {
    console.log("[event-bus] OpenCode server is ready");
  });
  eventBus.on("opencode:restarting", () => {
    console.log("[event-bus] OpenCode server restarting");
  });
  eventBus.on("opencode:restarted", () => {
    console.log("[event-bus] OpenCode server restarted");
  });
  eventBus.on("opencode:unhealthy", () => {
    console.log("[event-bus] OpenCode server health check failed");
  });

  return {
    state,
    openCodeRuntime,
    ensureOpenCodeDomain,
    bootstrapOpenCodeAtStartup,
    isOpenCodeProcessOwnedByRun: () => openCodeProcessOwnedByRun,
    stopOpenCodeWatcher: () => openCodeWatcherRuntime.stop(),
    resetGlobalWatcherStartPromise,
    ensureGlobalWatcherStarted,
    syncToHmrState,
    syncFromHmrState,
    gracefulShutdown,
    bootstrapRuntime,
    startupPipelineRuntime,
    featureRoutesDependencies: {
      createFsSearchRuntime: createFsSearchRuntimeFactory,
      openchamberDataDir: OPENCHAMBER_DATA_DIR,
      openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
    },
    openCodeEnvState,
    uiNotificationClients,
    uiNotificationWsClients,
    eventBus,
    globalMessageStreamHub,
    openCodeWatcherRuntime,
    serverUtilsRuntime,
    sessionRuntime,
    sessionActorRegistry,
    openCodeResolutionRuntime,
    readSettingsFromDiskMigrated,
    readSettingsFromDisk,
    writeSettingsToDisk,
    persistSettings,
    normalizeDirectoryPath,
    normalizePathForPersistence,
    normalizeSettingsPaths,
    isUnsafeSkillRelativePath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
    normalizePwaAppName,
    normalizePwaOrientation,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    formatSettingsResponse,
    resolveDirectoryCandidate,
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
    sendPushToAllUiSessions,
    updateUiVisibility,
    isUiVisible,
    ensurePushInitialized,
    setPushInitialized,
    resolveGitBinaryForSpawn,
    spawn,
    fs,
    fsPromises: fs.promises,
    os,
    path,
    crypto,
    process: processLike,
    express,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
    buildAugmentedPath,
    buildManagedOpenCodePath,
    searchPathFor,
    isExecutable,
    parseSseDataPayload,
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
    getOpenCodePort: () => openCodeRuntime.getPort() ?? null,
    triggerHealthCheck: () => {
      openCodeRuntime.triggerHealthCheck?.();
    },
    setupProxy,
  };
}
