// packages/web/server/src/index.ts
import "../instrument.mjs";
import "reflect-metadata";
import * as Sentry from "@sentry/node";
import express from "express";
import type { Response } from "express";
import compression from "compression";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import os from "node:os";
import crypto from "node:crypto";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import webPush from "web-push";

import { createEventBus } from "./domains/core/index.js";
import { createOpenCodeDomain } from "./domains/opencode/index.js";

import { createUiAuth } from "./domains/ui-auth/index.js";
import { createRequestSecurityRuntime } from "./domains/security/index.js";
import { prepareNotificationLastMessage } from "./domains/notifications/index.js";
import { createTerminalRuntime } from "./domains/terminal/runtime.js";
import {
  createGlobalUiEventBroadcaster,
  createGlobalMessageStreamHub,
  createMessageStreamWsRuntime,
} from "./domains/event-stream/index.js";
import { createFsSearchRuntime as createFsSearchRuntimeFactory } from "./domains/fs/index.js";
import { createOpenCodeEnvRuntime } from "./domains/opencode-support/index.js";
import { resolveOpenCodeEnvConfig } from "./domains/opencode-support/index.js";
import { createHmrStateRuntime } from "./domains/opencode-support/index.js";
import { createProjectDirectoryRuntime } from "./domains/opencode-support/index.js";
import { createSettingsNormalizationRuntime } from "./domains/settings/index.js";
import { createSettingsHelpers } from "./domains/settings/index.js";
import { createThemeRuntime } from "./domains/settings/index.js";
import { createFeatureRoutesRuntime } from "./domains/routes/index.js";
import { parseServeCliOptions } from "./domains/bootstrap/index.js";
import {
  registerAuthAndAccessRoutes,
  registerCommonRequestMiddleware,
  registerServerStatusRoutes,
} from "./domains/routes/index.js";
import { registerOpenChamberRoutes } from "./domains/routes/index.js";
import { createServerUtilsRuntime } from "./domains/server-utils/index.js";
import { createStaticRoutesRuntime } from "./domains/routes/index.js";
import { createSettingsRuntime } from "./domains/settings/index.js";
import { createOpenCodeResolutionRuntime } from "./domains/opencode-support/index.js";
import { createBootstrapRuntime } from "./domains/bootstrap/index.js";

import { createOpenCodeWatcherRuntime } from "./domains/opencode-support/index.js";
import { createServerStartupRuntime } from "./domains/bootstrap/index.js";
import { createStartupPipelineRuntime } from "./domains/bootstrap/index.js";
import { runCliEntryIfMain } from "./domains/bootstrap/index.js";
import { registerNotificationRoutes, createNotificationEmitterRuntime, createNotificationDeliveryRuntime, createNotificationTriggerRuntime, createPushRuntime, createNotificationTemplateRuntime } from "./domains/notifications/index.js";
import { createGracefulShutdownRuntime } from "./domains/bootstrap/index.js";
import { createSessionMachine } from "@openchamber/session-state";
import { createSessionRuntime, createSessionActorRegistry as createSessionActorRegistryFactory, createEffectExecutor as createEffectExecutorFactory, createSnapshotPublisher as createSnapshotPublisherFactory, createServerSessionMachineBridge } from "./domains/sessions/index.js";

// ── Constants ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
// src/index.ts lives one level deeper than server/index.js; go up to match old __dirname
const __dirname = path.dirname(path.dirname(__filename));

const DEFAULT_PORT = 3000;
const uiNotificationClients: Set<Response> = new Set();
const uiNotificationWsClients: Set<Response> = new Set();
const HEALTH_CHECK_INTERVAL = 15000;
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

// ── SSE compression bypass ────────────────────────────────────────
const SSE_PATH_PREFIXES = ["/api/event", "/api/global/event", "/api/notifications/stream"];

function headerIncludesEventStream(value: any): boolean {
  if (typeof value === "string") return value.toLowerCase().includes("text/event-stream");
  if (Array.isArray(value)) return value.some((e: any) => typeof e === "string" && e.toLowerCase().includes("text/event-stream"));
  return false;
}

function shouldSkipCompression(req: any, res: any): boolean {
  if (headerIncludesEventStream(req.headers.accept)) return true;
  const pathname = req.path || req.url || "";
  if (pathname.startsWith("/api/terminal/") && pathname.endsWith("/stream")) return true;
  for (const prefix of SSE_PATH_PREFIXES) {
    if (pathname === prefix) return true;
  }
  return headerIncludesEventStream(res.getHeader("Content-Type"));
}

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

const isEnvFlagEnabled = (value: any): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  const n = value.trim().toLowerCase();
  return n === "1" || n === "true";
};

const PLAN_MODE_EXPERIMENT_ENABLED =
  isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE) ||
  isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL);

const fsPromises = fs.promises;

// ── Settings normalization & helpers ────────────────────────────────
const settingsNormalizationRuntime = createSettingsNormalizationRuntime({
  os,
  path,
  processLike: process,
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

// ── Paths & config ────────────────────────────────────────────────
const OPENCHAMBER_USER_CONFIG_ROOT = path.join(os.homedir(), ".config", "openchamber");
const OPENCHAMBER_USER_THEMES_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, "themes");
const MAX_THEME_JSON_BYTES = 512 * 1024;
const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber");
const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, "settings.json");
const PUSH_SUBSCRIPTIONS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, "push-subscriptions.json");

// ── Theme, settings helpers ────────────────
const themeRuntime = createThemeRuntime({
  fsPromises,
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

// ── Settings & project directory ──────────────────────────────────
const projectDirectoryRuntime = createProjectDirectoryRuntime({
  fsPromises,
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
  fsPromises,
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
const {
  readSettingsFromDiskMigrated,
  readSettingsFromDisk,
  writeSettingsToDisk,
  persistSettings,
} = settingsRuntime;

// ── Request security ──────────────────────────────────────────────
const requestSecurityRuntime = createRequestSecurityRuntime({ readSettingsFromDiskMigrated });
const {
  getUiSessionTokenFromRequest,
  rejectWebSocketUpgrade,
  isRequestOriginAllowed,
} = requestSecurityRuntime;

// ── Push runtime ──────────────────────────────────────────────────
const pushRuntime = createPushRuntime({
  fsPromises,
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
  isAnyUiVisible,
  isUiVisible,
  ensurePushInitialized,
  setPushInitialized,
} = pushRuntime;

// ── Terminal constants ────────────────────────────────────────────
const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 128;
const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 60 * 1000;
const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15 * 1000;

// ── Env config ────────────────────────────────────────────────────
const {
  configuredOpenCodePort: ENV_CONFIGURED_OPENCODE_PORT,
  configuredOpenCodeHost: ENV_CONFIGURED_OPENCODE_HOST,
  effectivePort: ENV_EFFECTIVE_PORT,
  configuredOpenCodeHostname: ENV_CONFIGURED_OPENCODE_HOSTNAME,
} = resolveOpenCodeEnvConfig({ env: process.env, logger: console });

const ENV_SKIP_OPENCODE_START =
  process.env.OPENCODE_SKIP_START === "true" || process.env.OPENCHAMBER_SKIP_OPENCODE_START === "true";

const ENV_CONFIGURED_OPENCODE_WSL_DISTRO =
  typeof process.env.OPENCODE_WSL_DISTRO === "string" && process.env.OPENCODE_WSL_DISTRO.trim().length > 0
    ? process.env.OPENCODE_WSL_DISTRO.trim()
    : typeof process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO === "string" &&
        process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim().length > 0
      ? process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim()
      : null;

// ── HMR state (survives Vite reloads to prevent zombie processes) ─
const hmrStateRuntime = createHmrStateRuntime({
  globalThisLike: globalThis,
  os,
  processLike: process,
  stateKey: "__openchamberHmrState",
});
const hmrState = hmrStateRuntime.getOrCreateHmrState();
hmrStateRuntime.ensureUserProvidedOpenCodePassword(hmrState);

// Module-level mutable state (not in OpenCodeRuntime)
let signalsAttached = false;
let server: http.Server | null = null;
let expressApp: express.Express | null = null;
let uiAuthController: any = null;
let terminalRuntime: any = null;
let messageStreamRuntime: any = null;
let exitOnShutdown = true;
let globalWatcherStartPromise: Promise<void> | null = null;

// ── syncToHmrState / syncFromHmrState closures ────────────────────
const syncToHmrState = () => {
  if (!openCodeRuntime) return;
  const s = openCodeRuntime.getState();
  hmrStateRuntime.syncStateFromRuntime(hmrState, {
    openCodeProcess: s.openCodeProcess,
    openCodePort: s.openCodePort,
    openCodeBaseUrl: s.openCodeBaseUrl,
    isShuttingDown: s.isShuttingDown,
    signalsAttached,
    openCodeWorkingDirectory: s.openCodeWorkingDirectory,
    openCodeAuthPassword: s.openCodeAuthPassword,
    openCodeAuthSource: s.openCodeAuthSource,
  });
};

const syncFromHmrState = () => {
  if (!openCodeRuntime) return;
  const s = openCodeRuntime.getState();
  const restored = hmrStateRuntime.restoreRuntimeFromState({
    hmrState,
    userProvidedOpenCodePassword,
  });
  s.openCodeProcess = restored.openCodeProcess;
  s.openCodePort = restored.openCodePort;
  s.openCodeBaseUrl = restored.openCodeBaseUrl;
  s.isShuttingDown = restored.isShuttingDown;
  s.openCodeWorkingDirectory = restored.openCodeWorkingDirectory;
  s.openCodeAuthPassword = restored.openCodeAuthPassword;
  s.openCodeAuthSource = restored.openCodeAuthSource;
  signalsAttached = restored.signalsAttached;
};

// ── Env runtime (binary resolution) ──────────────────────────────
const userProvidedOpenCodePassword =
  hmrStateRuntime.getUserProvidedOpenCodePassword(hmrState);

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
// applyOpencodeBinaryFromSettings returns Promise<string | null> from the runtime
// but the consumers (OpenCodeResolutionDeps, LifecycleDeps) expect Promise<void>
const applyOpencodeBinaryFromSettings: () => Promise<void> = async () => {
  await _applyOpencodeBinaryFromSettings();
};

applyLoginShellEnvSnapshot();

// ── Resolution runtime ────────────────────────────────────────────
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

// ── EventBus ──────────────────────────────────────────────────────
const eventBus = createEventBus();

// ── OpenCodeDomain (typed wrapper around OpenCode runtime) ────────
const openCodeRuntimeRef: { current: any } = { current: null };
const openCodeDomainRef: { current: any } = { current: null };
// `openCodeRuntime` is a Proxy that forwards all property accesses to
// openCodeRuntimeRef.current. This lets module-init code (`createXxxRuntime`)
// capture a stable reference that always reflects the current runtime.
const openCodeRuntime: any = new Proxy(openCodeRuntimeRef, {
  get(_target, prop) {
    if (prop === "current") return openCodeRuntimeRef.current;
    const runtime = openCodeRuntimeRef.current;
    if (runtime == null) return undefined;
    const value = (runtime as any)[prop];
    return typeof value === "function" ? value.bind(runtime) : value;
  },
  has(_target, prop) {
    if (prop === "current") return true;
    const runtime = openCodeRuntimeRef.current;
    if (runtime == null) return false;
    return prop in (runtime as any);
  },
});

async function ensureOpenCodeDomain(): Promise<any> {
  if (openCodeDomainRef.current) return openCodeDomainRef.current;
  openCodeDomainRef.current = await (createOpenCodeDomain as any)({
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
    normalizeApiPrefix: (p: string) => {
      const trimmed = (p || "").trim();
      return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    },
    userProvidedPassword: userProvidedOpenCodePassword,
    getServerUtilsRuntime: () => serverUtilsRuntime,
  });
  openCodeRuntimeRef.current = openCodeDomainRef.current;
  return openCodeDomainRef.current;
}

function getOpenCodeRuntime(): any {
  return openCodeRuntimeRef.current;
}

// ── SSE notification clients ──────────────────────────────────────
const notificationEmitterRuntime = createNotificationEmitterRuntime({
  getUiNotificationClients: () => uiNotificationClients,
  getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
});
const { writeSseEvent } =
  notificationEmitterRuntime;
const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
  sseClients: uiNotificationClients,
  wsClients: uiNotificationWsClients as unknown as Set<any>,
  writeSseEvent,
});

// ── Session actor registry (created before sessionRuntime so runtime derives snapshots from machine actors) ───
const sessionActorRegistry = createSessionActorRegistryFactory({
  createSessionMachine,
});

// ── Session runtime ───────────────────────────────────────────────
const sessionRuntime: any = createSessionRuntime({
  writeSseEvent,
  getNotificationClients: () => uiNotificationClients,
  broadcastEvent: broadcastGlobalUiEvent,
  actorRegistry: sessionActorRegistry,
});
sessionRuntime.resetAllSessionActivityToIdle();

// ── Server utils runtime (Express helpers, not OpenCode state) ────
const serverUtilsRuntime = (createServerUtilsRuntime as any)({
  fs,
  os,
  path,
  process,
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
  fetchAgentsSnapshot,
  fetchProvidersSnapshot,
  fetchModelsSnapshot,
} = serverUtilsRuntime;

// ── Notification template & trigger runtimes ──────────────────────
const notificationTemplateRuntime = (createNotificationTemplateRuntime as any)({
  eventBus,
  readSettingsFromDisk,
  persistSettings,
  getOpenCodeRuntime: () => openCodeRuntimeRef.current,
  resolveGitBinaryForSpawn,
});
const {
  createTimeoutSignal,
  resolveNotificationTemplate,
  shouldApplyResolvedTemplateMessage,
  summarizeText,
  extractTextFromParts,
  extractLastMessageText,
  fetchLastAssistantMessageText,
  maybeCacheSessionInfoFromEvent,
  buildTemplateVariables,
  fetchFreeZenModels,
  resolveZenModel,
  validateZenModelAtStartup,
  getCachedZenModels,
} = notificationTemplateRuntime;

const notificationTriggerRuntime = (createNotificationTriggerRuntime as any)({
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

// ── Event stream (SSE/WS hub) ─────────────────────────────────────
const globalMessageStreamHub = createGlobalMessageStreamHub({
  getOpenCodeRuntime: () => openCodeRuntimeRef.current,
});

globalMessageStreamHub.subscribeStatus((status: any) => {
  if (status.type === "connect") sessionRuntime.resetAllSessionActivityToIdle();
});

// ── Watcher ───────────────────────────────────────────────────────
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

const ensureGlobalWatcherStarted = async (): Promise<void | null> => {
  if (globalWatcherStartPromise) return globalWatcherStartPromise;
  globalWatcherStartPromise = openCodeWatcherRuntime.start().catch((e: any) => {
    globalWatcherStartPromise = null;
    throw e;
  });
  return globalWatcherStartPromise;
};

// ── Synthetic event forwarding ────────────────────────────────────
// Phase 3.5: processForwardedEventPayload is a no-op. Session snapshot
// publication is handled by sessionSnapshotPublisher wired directly to
// globalMessageStreamHub.emitSynthetic. No legacy openchamber:session-status
// or openchamber:session-activity events are emitted here.
const processForwardedEventPayload = (_payload: any, _emitSyntheticEvent: any): void => {
  void _payload;
  void _emitSyntheticEvent;
};

// ── Session state bridge (Phase 3.5 canonical snapshot transport) ──
const sessionEffectExecutor = (createEffectExecutorFactory as any)();
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

// ── Bootstrap and startup pipeline ──────────
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

const refreshOpenCodeAfterConfigChange: (...args: any[]) => any = (...args) =>
  openCodeRuntime.refreshAfterConfigChange(...args);

const bootstrapOpenCodeAtStartup = async (): Promise<void> => {
  await openCodeRuntime.init();
  if (openCodeRuntime.getProcess() && !openCodeRuntime.isExternal()) {
    openCodeRuntime.startHealthMonitoring(HEALTH_CHECK_INTERVAL);
  }
  void ensureGlobalWatcherStarted().catch((e) => {
    console.warn(
      `Global event watcher startup failed: ${e instanceof Error ? e.message : String(e)}`
    );
  });
};

// ── Shutdown runtime ──────────────────────────────────────────────
const gracefulShutdownRuntime = (createGracefulShutdownRuntime as any)({
  process,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT,
  getExitOnShutdown: () => exitOnShutdown,
  getIsShuttingDown: () =>
    openCodeRuntimeRef.current
      ? openCodeRuntimeRef.current.getState().isShuttingDown
      : false,
  setIsShuttingDown: (value: boolean) => {
    if (openCodeRuntimeRef.current) openCodeRuntimeRef.current.setShuttingDown(value);
  },
  syncToHmrState,
  openCodeWatcherRuntime,
  sessionRuntime,
  notificationRuntime: notificationDeliveryRuntime,
  getHealthCheckInterval: () =>
    openCodeRuntimeRef.current
      ? openCodeRuntimeRef.current.getState().healthCheckInterval
      : null,
  clearHealthCheckInterval: (value: any) => clearInterval(value),
  getTerminalRuntime: () => terminalRuntime,
  setTerminalRuntime: (value: any) => {
    terminalRuntime = value;
  },
  getMessageStreamRuntime: () => messageStreamRuntime,
  setMessageStreamRuntime: (value: any) => {
    messageStreamRuntime = value;
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
    if (openCodeRuntimeRef.current)
      openCodeRuntimeRef.current.getState().openCodeProcess = value;
  },
  killProcessOnPort: openCodeRuntimeRef.current
    ? openCodeRuntimeRef.current.killProcessOnPort
    : () => {},
  waitForPortRelease: openCodeRuntimeRef.current
    ? openCodeRuntimeRef.current.waitForPortRelease
    : async () => true,
  getServer: () => server,
  getUiAuthController: () => uiAuthController,
  setUiAuthController: (value: any) => {
    uiAuthController = value;
  },
  serverSessionMachineBridge,
  sessionActorRegistry,
  sessionEffectExecutor,
});
const { gracefulShutdown } = gracefulShutdownRuntime;

// ── EventBus subscriptions ────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════
// main() — the actual server boot
// ═══════════════════════════════════════════════════════════════════
async function main(options: any = {}): Promise<any> {
  const port =
    Number.isFinite(options.port) && options.port >= 0
      ? Math.trunc(options.port)
      : DEFAULT_PORT;
  const host =
    typeof options.host === "string" && options.host.length > 0
      ? options.host
      : undefined;
  const attachSignals = options.attachSignals !== false;
  if (typeof options.exitOnShutdown === "boolean")
    exitOnShutdown = options.exitOnShutdown;

  console.log(`Starting OpenChamber on port ${port === 0 ? "auto" : port}`);

  void validateZenModelAtStartup();

  const app = express();
  const serverStartedAt = new Date().toISOString();
  app.set("trust proxy", true);
  app.use(
    (compression as any)({
      filter: (req: any, res: any) =>
        shouldSkipCompression(req, res) ? false : compression.filter(req, res),
      threshold: 1024,
    })
  );
  expressApp = app;
  server = http.createServer(app);

  await ensureOpenCodeDomain();
  openCodeRuntime.setApp(app);

  const uiPassword =
    typeof options.uiPassword === "string" ? options.uiPassword : null;
  const bootstrapResult = bootstrapRuntime.setupBaseRoutes(app, {
    process,
    openchamberVersion: OPENCHAMBER_VERSION,
    runtimeName: "web",
    serverStartedAt,
    gracefulShutdown,
    getHealthSnapshot: () => {
      const resolvedBinary = openCodeEnvState.resolvedOpencodeBinary || null;
      const useWsl = openCodeEnvState.useWslForOpencode;
      const launchSpec =
        resolvedBinary && !useWsl
          ? resolveManagedOpenCodeLaunchSpec(resolvedBinary)
          : null;
      return {
        openCodePort: openCodeRuntime.getPort(),
        openCodeRunning: Boolean(
          openCodeRuntime.getPort() &&
            openCodeRuntime.isReady() &&
            !openCodeRuntime.isRestarting()
        ),
        openCodeSecureConnection: openCodeRuntime.isConnectionSecure(),
        openCodeAuthSource:
          openCodeRuntime.getOpenCodeAuthSource() || null,
        openCodeApiPrefix: "",
        openCodeApiPrefixDetected: true,
        isOpenCodeReady: openCodeRuntime.isReady(),
        lastOpenCodeError: openCodeRuntime.getLastError(),
        opencodeBinaryResolved:
          openCodeEnvState.resolvedOpencodeBinary || null,
        opencodeBinarySource:
          openCodeEnvState.resolvedOpencodeBinarySource || null,
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
  uiAuthController = bootstrapResult.uiAuthController;

  const featureRoutesRuntime = createFeatureRoutesRuntime({
    clientReloadDelayMs: CLIENT_RELOAD_DELAY_MS,
  });
  await featureRoutesRuntime.registerRoutes(app, {
    crypto,
    fs,
    os,
    path,
    fsPromises,
    spawn,
    resolveGitBinaryForSpawn,
    createFsSearchRuntime: createFsSearchRuntimeFactory,
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
    sanitizeSkillCatalogs,
    isUnsafeSkillRelativePath,
    openCodeRuntime,
    getOpenCodePort: () => openCodeRuntime.getPort(),
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

  const startupPipelineResult = await startupPipelineRuntime.run({
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
    globalEventHub: globalMessageStreamHub,
    processForwardedEventPayload,
    messageStreamWsClients: uiNotificationWsClients,
    terminalHeartbeatIntervalMs: TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
    terminalRebindWindowMs: TERMINAL_INPUT_WS_REBIND_WINDOW_MS,
    terminalMaxRebindsPerWindow: TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW,
    setupProxy: () => serverUtilsRuntime.setupProxy(app),
    scheduleOpenCodeApiDetection: () => {},
    bootstrapOpenCodeAtStartup,
    triggerHealthCheck: openCodeRuntime.triggerHealthCheck,
    staticRoutesRuntime,
    process,
    crypto,
    readSettingsFromDiskMigrated,
    gracefulShutdown,
    getSignalsAttached: () => signalsAttached,
    setSignalsAttached: (value: boolean) => {
      signalsAttached = value;
    },
    syncToHmrState,
    host,
    port,
    attachSignals,
  });
  terminalRuntime = startupPipelineResult.terminalRuntime;
  messageStreamRuntime = startupPipelineResult.messageStreamRuntime;
  let activePort: number | null = startupPipelineResult.activePort;

  Sentry.setupExpressErrorHandler(app);

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => activePort,
    getOpenCodePort: () => openCodeRuntime.getPort(),
    isReady: () => openCodeRuntime.isReady(),
    restartOpenCode: () => openCodeRuntime.restart(),
    stop: async (shutdownOptions: any = {}) => {
      await gracefulShutdown({
        exitProcess: shutdownOptions.exitProcess ?? false,
      });
      activePort = null;
    },
  };
}

// ── CLI entry ──────────────────────────────────────────────────────
runCliEntryIfMain({
  process,
  currentFilename: __filename,
  parseServeCliOptions,
  defaultPort: DEFAULT_PORT,
  setExitOnShutdown: (value: boolean) => {
    exitOnShutdown = value;
  },
  startServer: main,
});

const restartOpenCode = () => openCodeRuntime.restart();
export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseServeCliOptions as parseArgs };
