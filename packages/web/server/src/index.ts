// packages/web/server/src/index.ts
import "./instrument.mjs";
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
import { createScheduledTasksRuntime } from "./domains/scheduled-tasks/index.js";
import { createServerStartupRuntime } from "./domains/bootstrap/index.js";
import { createStartupPipelineRuntime } from "./domains/bootstrap/index.js";
import { runCliEntryIfMain } from "./domains/bootstrap/index.js";
import { registerNotificationRoutes, createNotificationEmitterRuntime, createNotificationTriggerRuntime, createPushRuntime, createNotificationTemplateRuntime } from "./domains/notifications/index.js";
import { createGracefulShutdownRuntime } from "./domains/bootstrap/index.js";
import { createProjectConfigRuntime } from "./domains/projects/index.js";
import { createSessionMachine } from "@openchamber/session-state";
import { createSessionRuntime, createSessionActorRegistry as createSessionActorRegistryFactory, createEffectExecutor as createEffectExecutorFactory, createSnapshotPublisher as createSnapshotPublisherFactory, createServerSessionMachineBridge } from "./domains/sessions/index.js";

// ── Constants ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
// src/index.ts lives one level deeper than server/index.js; go up to match old __dirname
const __dirname = path.dirname(path.dirname(__filename));

const DEFAULT_PORT = 3000;
const DESKTOP_NOTIFY_PREFIX = "[OpenChamberDesktopNotify] ";
const uiNotificationClients: Set<Response> = new Set();
const uiNotificationWsClients: Set<Response> = new Set();
const uiOpenChamberEventClients: Set<Response> = new Set();
const HEALTH_CHECK_INTERVAL = 15000;
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

// ── SSE compression bypass ────────────────────────────────────────
const SSE_PATH_PREFIXES = ["/api/event", "/api/global/event", "/api/notifications/stream", "/api/openchamber/events"];

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

const normalizeDirectoryPath: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).normalizeDirectoryPath(...args);
const normalizePathForPersistence: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).normalizePathForPersistence(...args);
const normalizeSettingsPaths: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).normalizeSettingsPaths(...args);
const isUnsafeSkillRelativePath: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).isUnsafeSkillRelativePath(...args);
const sanitizeTypographySizesPartial: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).sanitizeTypographySizesPartial(...args);
const normalizeStringArray: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).normalizeStringArray(...args);
const sanitizeModelRefs: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).sanitizeModelRefs(...args);
const sanitizeSkillCatalogs: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).sanitizeSkillCatalogs(...args);
const sanitizeProjects: (...args: any[]) => any = (...args) =>
  (settingsNormalizationRuntime as any).sanitizeProjects(...args);

// ── Paths & config ────────────────────────────────────────────────
const OPENCHAMBER_USER_CONFIG_ROOT = path.join(os.homedir(), ".config", "openchamber");
const OPENCHAMBER_USER_THEMES_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, "themes");
const OPENCHAMBER_PROJECTS_CONFIG_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, "projects");
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
const readCustomThemesFromDisk: (...args: any[]) => any = (...args) =>
  (themeRuntime as any).readCustomThemesFromDisk(...args);

const settingsHelpers = createSettingsHelpers({
  normalizePathForPersistence,
  normalizeDirectoryPath,
  sanitizeTypographySizesPartial,
  normalizeStringArray,
  sanitizeModelRefs,
  sanitizeSkillCatalogs,
  sanitizeProjects,
});
const normalizePwaAppName: (...args: any[]) => any = (...args) =>
  (settingsHelpers as any).normalizePwaAppName(...args);
const normalizePwaOrientation: (...args: any[]) => any = (...args) =>
  (settingsHelpers as any).normalizePwaOrientation(...args);
const sanitizeSettingsUpdate: (...args: any[]) => any = (...args) =>
  (settingsHelpers as any).sanitizeSettingsUpdate(...args);
const mergePersistedSettings: (...args: any[]) => any = (...args) =>
  (settingsHelpers as any).mergePersistedSettings(...args);
const formatSettingsResponse: (...args: any[]) => any = (...args) =>
  (settingsHelpers as any).formatSettingsResponse(...args);

// ── Settings & project directory ──────────────────────────────────
const projectDirectoryRuntime = createProjectDirectoryRuntime({
  fsPromises,
  path,
  normalizeDirectoryPath,
  getReadSettingsFromDiskMigrated: () => readSettingsFromDiskMigrated,
  sanitizeProjects,
} as any);
const resolveDirectoryCandidate: (...args: any[]) => any = (...args) =>
  (projectDirectoryRuntime as any).resolveDirectoryCandidate(...args);
const validateDirectoryPath: (...args: any[]) => any = (...args) =>
  (projectDirectoryRuntime as any).validateDirectoryPath(...args);
const resolveProjectDirectory: (...args: any[]) => any = (...args) =>
  (projectDirectoryRuntime as any).resolveProjectDirectory(...args);
const resolveOptionalProjectDirectory: (...args: any[]) => any = (...args) =>
  (projectDirectoryRuntime as any).resolveOptionalProjectDirectory(...args);

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
const readSettingsFromDiskMigrated: (...args: any[]) => any = (...args) =>
  (settingsRuntime as any).readSettingsFromDiskMigrated(...args);
const readSettingsFromDisk: (...args: any[]) => any = (...args) =>
  (settingsRuntime as any).readSettingsFromDisk(...args);
const writeSettingsToDisk: (...args: any[]) => any = (...args) =>
  (settingsRuntime as any).writeSettingsToDisk(...args);
const persistSettings: (...args: any[]) => any = (...args) =>
  (settingsRuntime as any).persistSettings(...args);

// ── Request security ──────────────────────────────────────────────
const requestSecurityRuntime = createRequestSecurityRuntime({ readSettingsFromDiskMigrated });
const getUiSessionTokenFromRequest: (...args: any[]) => any = (...args) =>
  (requestSecurityRuntime as any).getUiSessionTokenFromRequest(...args);
const rejectWebSocketUpgrade: (...args: any[]) => any = (...args) =>
  (requestSecurityRuntime as any).rejectWebSocketUpgrade(...args);
const isRequestOriginAllowed: (...args: any[]) => any = (...args) =>
  (requestSecurityRuntime as any).isRequestOriginAllowed(...args);

// ── Push runtime ──────────────────────────────────────────────────
const pushRuntime = createPushRuntime({
  fsPromises,
  path,
  webPush,
  PUSH_SUBSCRIPTIONS_FILE_PATH,
  readSettingsFromDiskMigrated,
  writeSettingsToDisk,
});
const getOrCreateVapidKeys: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).getOrCreateVapidKeys(...args);
const addOrUpdatePushSubscription: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).addOrUpdatePushSubscription(...args);
const removePushSubscription: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).removePushSubscription(...args);
const sendPushToAllUiSessions: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).sendPushToAllUiSessions(...args);
const updateUiVisibility: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).updateUiVisibility(...args);
const isAnyUiVisible: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).isAnyUiVisible(...args);
const isUiVisible: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).isUiVisible(...args);
const ensurePushInitialized: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).ensurePushInitialized(...args);
const setPushInitialized: (...args: any[]) => any = (...args) =>
  (pushRuntime as any).setPushInitialized(...args);

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
const ENV_DESKTOP_NOTIFY = (() => {
  if (process.env.OPENCHAMBER_DESKTOP_NOTIFY === "true") return true;
  if (process.env.OPENCHAMBER_RUNTIME === "desktop") return true;
  const argv0 = typeof process.argv?.[0] === "string" ? process.argv[0] : "";
  const argv1 = typeof process.argv?.[1] === "string" ? process.argv[1] : "";
  return /openchamber-server/i.test(argv0) || /openchamber-server/i.test(argv1);
})();

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
const applyLoginShellEnvSnapshot: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).applyLoginShellEnvSnapshot(...args);
const getLoginShellEnvSnapshot: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).getLoginShellEnvSnapshot(...args);
const ensureOpencodeCliEnv: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).ensureOpencodeCliEnv(...args);
const applyOpencodeBinaryFromSettings: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).applyOpencodeBinaryFromSettings(...args);
const resolveOpencodeCliPath: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).resolveOpencodeCliPath(...args);
const isExecutable: (filePath: string) => boolean = (filePath) =>
  openCodeEnvRuntime.isExecutable(filePath);
const searchPathFor: (binaryName: string) => string | null = (binaryName) =>
  openCodeEnvRuntime.searchPathFor(binaryName);
const resolveGitBinaryForSpawn: () => string = () =>
  openCodeEnvRuntime.resolveGitBinaryForSpawn();
const resolveWslExecutablePath: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).resolveWslExecutablePath(...args);
const buildWslExecArgs: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).buildWslExecArgs(...args);
const resolveManagedOpenCodeLaunchSpec: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).resolveManagedOpenCodeLaunchSpec(...args);
const clearResolvedOpenCodeBinary: (...args: any[]) => any = (...args) =>
  (openCodeEnvRuntime as any).clearResolvedOpenCodeBinary(...args);

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
const getOpenCodeResolutionSnapshot: (...args: any[]) => any = (...args) =>
  (openCodeResolutionRuntime as any).getOpenCodeResolutionSnapshot(...args);

// ── EventBus ──────────────────────────────────────────────────────
const eventBus = createEventBus();

// ── OpenCodeDomain (typed wrapper around OpenCode runtime) ────────
let openCodeRuntime: any = null;
let openCodeDomain: any = null;

async function ensureOpenCodeDomain(): Promise<any> {
  if (openCodeDomain) return openCodeDomain;
  openCodeDomain = await (createOpenCodeDomain as any)({
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
  openCodeRuntime = openCodeDomain;
  return openCodeDomain;
}

function getOpenCodeRuntime(): any {
  return openCodeRuntime;
}

// ── SSE notification clients ──────────────────────────────────────
const notificationEmitterRuntime = createNotificationEmitterRuntime({
  process,
  getDesktopNotifyEnabled: () => ENV_DESKTOP_NOTIFY,
  desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
  getUiNotificationClients: () => uiNotificationClients,
  getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
});
const writeSseEvent: (...args: any[]) => any = (...args) =>
  (notificationEmitterRuntime as any).writeSseEvent(...args);
const emitDesktopNotification: (...args: any[]) => any = (...args) =>
  (notificationEmitterRuntime as any).emitDesktopNotification(...args);
const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
  sseClients: uiNotificationClients,
  wsClients: uiNotificationWsClients,
  writeSseEvent,
});
const broadcastUiNotification: (...args: any[]) => any = (...args) =>
  (notificationEmitterRuntime as any).broadcastUiNotification(...args);

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
  openCodeRuntime,
  ensureOpenCodeApiPrefix: () => {
    try {
      openCodeRuntime.getNetworkRuntime().ensureOpenCodeApiPrefix();
    } catch {
      /* best-effort */
    }
  },
  getUiNotificationClients: () => uiNotificationClients,
  getOpenCodePort: () => openCodeRuntime.getPort(),
  getLoginShellPath: () => {
    const snapshot = getLoginShellEnvSnapshot();
    return snapshot && typeof snapshot.PATH === "string" && snapshot.PATH.length > 0
      ? snapshot.PATH
      : null;
  },
});

const setupProxy: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).setupProxy(...args);
const waitForOpenCodePort: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).waitForOpenCodePort(...args);
const buildAugmentedPath: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).buildAugmentedPath(...args);
const buildManagedOpenCodePath: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).buildManagedOpenCodePath(...args);
const parseSseDataPayload: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).parseSseDataPayload(...args);
const fetchAgentsSnapshot: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).fetchAgentsSnapshot(...args);
const fetchProvidersSnapshot: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).fetchProvidersSnapshot(...args);
const fetchModelsSnapshot: (...args: any[]) => any = (...args) =>
  (serverUtilsRuntime as any).fetchModelsSnapshot(...args);

// ── Notification template & trigger runtimes ──────────────────────
const notificationTemplateRuntime = (createNotificationTemplateRuntime as any)({
  readSettingsFromDisk,
  persistSettings,
  openCodeRuntime,
  resolveGitBinaryForSpawn,
});
const createTimeoutSignal: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).createTimeoutSignal(...args);
const resolveNotificationTemplate: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).resolveNotificationTemplate(...args);
const shouldApplyResolvedTemplateMessage: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).shouldApplyResolvedTemplateMessage(...args);
const summarizeText: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).summarizeText(...args);
const extractTextFromParts: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).extractTextFromParts(...args);
const extractLastMessageText: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).extractLastMessageText(...args);
const fetchLastAssistantMessageText: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).fetchLastAssistantMessageText(...args);
const maybeCacheSessionInfoFromEvent: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).maybeCacheSessionInfoFromEvent(...args);
const buildTemplateVariables: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).buildTemplateVariables(...args);
const fetchFreeZenModels: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).fetchFreeZenModels(...args);
const resolveZenModel: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).resolveZenModel(...args);
const validateZenModelAtStartup: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).validateZenModelAtStartup(...args);
const getCachedZenModels: (...args: any[]) => any = (...args) =>
  (notificationTemplateRuntime as any).getCachedZenModels(...args);

const notificationTriggerRuntime = (createNotificationTriggerRuntime as any)({
  readSettingsFromDisk,
  prepareNotificationLastMessage,
  summarizeText,
  resolveZenModel,
  buildTemplateVariables,
  extractLastMessageText,
  fetchLastAssistantMessageText,
  resolveNotificationTemplate,
  shouldApplyResolvedTemplateMessage,
  emitDesktopNotification,
  broadcastUiNotification,
  sendPushToAllUiSessions,
  openCodeRuntime,
});
const maybeSendPushForTrigger: (...args: any[]) => any = (...args) =>
  (notificationTriggerRuntime as any).maybeSendPushForTrigger(...args);
const setAutoAcceptSession: (...args: any[]) => any = (...args) =>
  (notificationTriggerRuntime as any).setAutoAcceptSession(...args);

// ── Event stream (SSE/WS hub) ─────────────────────────────────────
const globalMessageStreamHub = createGlobalMessageStreamHub({
  openCodeRuntime,
});

globalMessageStreamHub.subscribeStatus((status: any) => {
  if (status.type === "connect") sessionRuntime.resetAllSessionActivityToIdle();
});

// ── Watcher ───────────────────────────────────────────────────────
const openCodeWatcherRuntime = (createOpenCodeWatcherRuntime as any)({
  waitForOpenCodePort: (...args: any[]) => waitForOpenCodePort(...args),
  openCodeRuntime,
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
  globalWatcherStartPromise = openCodeWatcherRuntime.start().catch((e) => {
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

// ── Bootstrap, startup pipeline, scheduled tasks ──────────
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
  (openCodeRuntime as any).refreshAfterConfigChange(...args);

const scheduledTasksRuntime = (createScheduledTasksRuntime as any)({
  projectConfigRuntime: createProjectConfigRuntime({
    fsPromises,
    path,
    projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
  }),
  listProjects: async () => {
    const settings = await readSettingsFromDiskMigrated();
    return sanitizeProjects(settings?.projects || []);
  },
  openCodeRuntime,
  waitForOpenCodeReady: openCodeRuntime.waitForReady,
  emitTaskRunEvent: (event: any) => {
    for (const client of uiOpenChamberEventClients) {
      try {
        writeSseEvent(client, {
          type: "openchamber:scheduled-task-ran",
          properties: {
            projectId: event.projectID,
            taskId: event.taskID,
            ranAt: event.ranAt,
            status: event.status,
            ...(event.sessionID ? { sessionId: event.sessionID } : {}),
          },
} as any);
      } catch {
        uiOpenChamberEventClients.delete(client);
      }
    }
  },
  logger: console,
});

const bootstrapOpenCodeAtStartup = async (): Promise<void> => {
  await openCodeRuntime.init();
  if (openCodeRuntime.getProcess() && !openCodeRuntime.isExternal()) {
    openCodeRuntime.startHealthMonitoring(HEALTH_CHECK_INTERVAL);
  }
  if (ENV_DESKTOP_NOTIFY) {
    void ensureGlobalWatcherStarted().catch((e) => {
      console.warn(
        `Global event watcher startup failed: ${e instanceof Error ? e.message : String(e)}`
      );
    });
  }
};

// ── Shutdown runtime ──────────────────────────────────────────────
const gracefulShutdownRuntime = (createGracefulShutdownRuntime as any)({
  process,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT,
  getExitOnShutdown: () => exitOnShutdown,
  getIsShuttingDown: () =>
    openCodeRuntime ? openCodeRuntime.getState().isShuttingDown : false,
  setIsShuttingDown: (value: boolean) => {
    if (openCodeRuntime) openCodeRuntime.setShuttingDown(value);
  },
  syncToHmrState,
  openCodeWatcherRuntime,
  sessionRuntime,
  getHealthCheckInterval: () =>
    openCodeRuntime ? openCodeRuntime.getState().healthCheckInterval : null,
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
    ENV_SKIP_OPENCODE_START || (openCodeRuntime && openCodeRuntime.isExternal()),
  openCodeRuntime,
  getOpenCodePort: () => (openCodeRuntime ? openCodeRuntime.getPort() : null),
  getOpenCodeProcess: () =>
    openCodeRuntime ? openCodeRuntime.getProcess() : null,
  setOpenCodeProcess: (value: any) => {
    if (openCodeRuntime) openCodeRuntime.getState().openCodeProcess = value;
  },
  killProcessOnPort: openCodeRuntime
    ? openCodeRuntime.killProcessOnPort
    : () => {},
  waitForPortRelease: openCodeRuntime
    ? openCodeRuntime.waitForPortRelease
    : async () => true,
  getServer: () => server,
  getUiAuthController: () => uiAuthController,
  setUiAuthController: (value: any) => {
    uiAuthController = value;
  },
  scheduledTasksRuntime,
  serverSessionMachineBridge,
  sessionActorRegistry,
  sessionEffectExecutor,
});
const gracefulShutdown: (...args: any[]) => any = (...args) =>
  (gracefulShutdownRuntime as any).gracefulShutdown(...args);

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
  if (typeof options.onDesktopNotification === "function")
    (notificationEmitterRuntime as any).setOnDesktopNotification(
      options.onDesktopNotification
    );

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
    runtimeName: process.env.OPENCHAMBER_RUNTIME || "web",
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
        desktopNotifyEnabled: ENV_DESKTOP_NOTIFY,
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
    projectConfigRuntime: createProjectConfigRuntime({
      fsPromises,
      path,
      projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
    }),
    scheduledTasksRuntime,
    getOpenChamberEventClients: () => uiOpenChamberEventClients,
    writeSseEvent,
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

  Sentry.setupExpressErrorHandler(app);

  try {
    await scheduledTasksRuntime.start();
  } catch (e) {
    console.warn(
      "[ScheduledTasks] Failed to start runtime:",
      e instanceof Error ? e.message : String(e)
    );
  }

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => startupPipelineResult.activePort,
    getOpenCodePort: () => openCodeRuntime.getPort(),
    isReady: () => openCodeRuntime.isReady(),
    restartOpenCode: () => openCodeRuntime.restart(),
    stop: (shutdownOptions: any = {}) =>
      gracefulShutdown({
        exitProcess: shutdownOptions.exitProcess ?? false,
      }),
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
