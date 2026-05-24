// packages/web/server/index.js
import './instrument.mjs';
import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import express from 'express';
import compression from 'compression';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import webPush from 'web-push';

import { createEventBus } from './lib/core/event-bus.js';
import { createOpenCodeRuntime } from './lib/opencode/runtime.js';

import { createUiAuth } from './lib/ui-auth/ui-auth.js';
import { createTunnelAuth } from './lib/opencode/auth/tunnel-auth.js';
import { createManagedTunnelConfigRuntime } from './lib/tunnels/managed-config.js';
import { createTunnelProviderRegistry } from './lib/tunnels/registry.js';
import { createCloudflareTunnelProvider } from './lib/tunnels/providers/cloudflare.js';
import { createRequestSecurityRuntime } from './lib/security/request-security.js';
import {
  TUNNEL_MODE_MANAGED_LOCAL,
  TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_MODE_QUICK,
  TUNNEL_PROVIDER_CLOUDFLARE,
  TunnelServiceError,
  isSupportedTunnelMode,
  normalizeOptionalPath,
  normalizeTunnelStartRequest,
  normalizeTunnelMode,
  normalizeTunnelProvider,
} from './lib/tunnels/types.js';
import { prepareNotificationLastMessage } from './lib/notifications/index.js';
import { registerTtsRoutes } from './lib/tts/routes.js';
import { detectSayTtsCapability } from './lib/tts/capability-runtime.js';
import { createTerminalRuntime } from './lib/terminal/runtime.js';
import {
  createGlobalUiEventBroadcaster,
  createGlobalMessageStreamHub,
  createMessageStreamWsRuntime,
} from './lib/event-stream/index.js';
import { createFsSearchRuntime as createFsSearchRuntimeFactory } from './lib/fs/search.js';
import { createOpenCodeEnvRuntime } from './lib/opencode/env/env-runtime.js';
import { resolveOpenCodeEnvConfig } from './lib/opencode/env/env-config.js';
import { createHmrStateRuntime } from './lib/opencode/network/hmr-state-runtime.js';
import { createProjectDirectoryRuntime } from './lib/opencode/resolution/project-directory-runtime.js';
import { createSettingsNormalizationRuntime } from './lib/opencode/settings/settings-normalization-runtime.js';
import { createSettingsHelpers } from './lib/opencode/settings/settings-helpers.js';
import { createThemeRuntime } from './lib/opencode/services/theme-runtime.js';
import { createFeatureRoutesRuntime } from './lib/opencode/routes/feature-routes-runtime.js';
import { parseServeCliOptions } from './lib/opencode/bootstrap/cli-options.js';
import {
  registerAuthAndAccessRoutes,
  registerCommonRequestMiddleware,
  registerServerStatusRoutes,
} from './lib/opencode/routes/core-routes.js';
import { registerOpenChamberRoutes } from './lib/opencode/routes/openchamber-routes.js';
import { createServerUtilsRuntime } from './lib/opencode/server-utils-runtime.js';
import { createStaticRoutesRuntime } from './lib/opencode/routes/static-routes-runtime.js';
import { createSettingsRuntime } from './lib/opencode/settings/settings-runtime.js';
import { createOpenCodeResolutionRuntime } from './lib/opencode/resolution/opencode-resolution-runtime.js';
import { createBootstrapRuntime } from './lib/opencode/bootstrap/bootstrap-runtime.js';
import { createSessionRuntime } from './lib/opencode/session/session-runtime.js';
import { createOpenCodeWatcherRuntime } from './lib/opencode/services/watcher.js';
import { createScheduledTasksRuntime } from './lib/scheduled-tasks/runtime.js';
import { createServerStartupRuntime } from './lib/opencode/bootstrap/server-startup-runtime.js';
import { createTunnelWiringRuntime } from './lib/opencode/network/tunnel-wiring-runtime.js';
import { createStartupPipelineRuntime } from './lib/opencode/bootstrap/startup-pipeline-runtime.js';
import { runCliEntryIfMain } from './lib/opencode/bootstrap/cli-entry-runtime.js';
import { registerNotificationRoutes } from './lib/notifications/routes.js';
import { createNotificationEmitterRuntime } from './lib/notifications/emitter-runtime.js';
import { createNotificationTriggerRuntime } from './lib/notifications/runtime.js';
import { createPushRuntime } from './lib/notifications/push-runtime.js';
import { createNotificationTemplateRuntime } from './lib/notifications/template-runtime.js';
import { createGracefulShutdownRuntime } from './lib/opencode/bootstrap/shutdown-runtime.js';
import { createProjectConfigRuntime } from './lib/projects/project-config.js';

// ── Constants ────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3000;
const DESKTOP_NOTIFY_PREFIX = '[OpenChamberDesktopNotify] ';
const HEALTH_CHECK_INTERVAL = 15000;
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_DEFAULT_MS = 30 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MIN_MS = 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MAX_MS = 24 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_DEFAULT_MS = 8 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_MIN_MS = 5 * 60 * 1000;
const TUNNEL_SESSION_TTL_MAX_MS = 30 * 24 * 60 * 60 * 1000;

// ── SSE compression bypass ────────────────────────────────────────
const SSE_PATH_PREFIXES = ['/api/event', '/api/global/event', '/api/notifications/stream', '/api/openchamber/events'];

function headerIncludesEventStream(value) {
  if (typeof value === 'string') return value.toLowerCase().includes('text/event-stream');
  if (Array.isArray(value)) return value.some((e) => typeof e === 'string' && e.toLowerCase().includes('text/event-stream'));
  return false;
}

function shouldSkipCompression(req, res) {
  if (headerIncludesEventStream(req.headers.accept)) return true;
  const pathname = req.path || req.url || '';
  if (pathname.startsWith('/api/terminal/') && pathname.endsWith('/stream')) return true;
  for (const prefix of SSE_PATH_PREFIXES) {
    if (pathname === prefix) return true;
  }
  return headerIncludesEventStream(res.getHeader('Content-Type'));
}

// ── Version detection ────────────────────────────────────────────
const OPENCHAMBER_VERSION = (() => {
  try {
    const pkgPath = path.resolve(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);
    return (pkg && typeof pkg.version === 'string' && pkg.version.trim()) || 'unknown';
  } catch { return 'unknown'; }
})();

const isEnvFlagEnabled = (value) => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const n = value.trim().toLowerCase();
  return n === '1' || n === 'true';
};

const PLAN_MODE_EXPERIMENT_ENABLED =
  isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE)
  || isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL);

const fsPromises = fs.promises;

// ── Settings normalization & helpers ────────────────────────────────
const settingsNormalizationRuntime = createSettingsNormalizationRuntime({
  os, path, processLike: process,
  tunnelBootstrapTtlDefaultMs: TUNNEL_BOOTSTRAP_TTL_DEFAULT_MS,
  tunnelBootstrapTtlMinMs: TUNNEL_BOOTSTRAP_TTL_MIN_MS,
  tunnelBootstrapTtlMaxMs: TUNNEL_BOOTSTRAP_TTL_MAX_MS,
  tunnelSessionTtlDefaultMs: TUNNEL_SESSION_TTL_DEFAULT_MS,
  tunnelSessionTtlMinMs: TUNNEL_SESSION_TTL_MIN_MS,
  tunnelSessionTtlMaxMs: TUNNEL_SESSION_TTL_MAX_MS,
});

const normalizeDirectoryPath = (...args) => settingsNormalizationRuntime.normalizeDirectoryPath(...args);
const normalizePathForPersistence = (...args) => settingsNormalizationRuntime.normalizePathForPersistence(...args);
const normalizeSettingsPaths = (...args) => settingsNormalizationRuntime.normalizeSettingsPaths(...args);
const normalizeTunnelBootstrapTtlMs = (...args) => settingsNormalizationRuntime.normalizeTunnelBootstrapTtlMs(...args);
const normalizeTunnelSessionTtlMs = (...args) => settingsNormalizationRuntime.normalizeTunnelSessionTtlMs(...args);
const normalizeManagedRemoteTunnelHostname = (...args) => settingsNormalizationRuntime.normalizeManagedRemoteTunnelHostname(...args);
const normalizeManagedRemoteTunnelPresets = (...args) => settingsNormalizationRuntime.normalizeManagedRemoteTunnelPresets(...args);
const normalizeManagedRemoteTunnelPresetTokens = (...args) => settingsNormalizationRuntime.normalizeManagedRemoteTunnelPresetTokens(...args);
const isUnsafeSkillRelativePath = (...args) => settingsNormalizationRuntime.isUnsafeSkillRelativePath(...args);
const sanitizeTypographySizesPartial = (...args) => settingsNormalizationRuntime.sanitizeTypographySizesPartial(...args);
const normalizeStringArray = (...args) => settingsNormalizationRuntime.normalizeStringArray(...args);
const sanitizeModelRefs = (...args) => settingsNormalizationRuntime.sanitizeModelRefs(...args);
const sanitizeSkillCatalogs = (...args) => settingsNormalizationRuntime.sanitizeSkillCatalogs(...args);
const sanitizeProjects = (...args) => settingsNormalizationRuntime.sanitizeProjects(...args);

// ── Paths & config ────────────────────────────────────────────────
const OPENCHAMBER_USER_CONFIG_ROOT = path.join(os.homedir(), '.config', 'openchamber');
const OPENCHAMBER_USER_THEMES_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'themes');
const OPENCHAMBER_PROJECTS_CONFIG_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'projects');
const MAX_THEME_JSON_BYTES = 512 * 1024;
const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'openchamber');
const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'settings.json');
const PUSH_SUBSCRIPTIONS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'push-subscriptions.json');
const CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'cloudflare-managed-remote-tunnels.json');
const CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'cloudflare-named-tunnels.json');
const CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION = 1;

// ── Theme, managed tunnel config, settings helpers ────────────────
const themeRuntime = createThemeRuntime({ fsPromises, path, themesDir: OPENCHAMBER_USER_THEMES_DIR, maxThemeJsonBytes: MAX_THEME_JSON_BYTES, logger: console });
const readCustomThemesFromDisk = (...args) => themeRuntime.readCustomThemesFromDisk(...args);

const managedTunnelConfigRuntime = createManagedTunnelConfigRuntime({
  fsPromises, path, normalizeManagedRemoteTunnelHostname, normalizeManagedRemoteTunnelPresets,
  constants: { CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH, CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH, CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION },
});
const syncManagedRemoteTunnelConfigWithPresets = (...args) => managedTunnelConfigRuntime.syncManagedRemoteTunnelConfigWithPresets(...args);
const upsertManagedRemoteTunnelToken = (...args) => managedTunnelConfigRuntime.upsertManagedRemoteTunnelToken(...args);
const resolveManagedRemoteTunnelToken = (...args) => managedTunnelConfigRuntime.resolveManagedRemoteTunnelToken(...args);
const readManagedRemoteTunnelConfigFromDisk = (...args) => managedTunnelConfigRuntime.readManagedRemoteTunnelConfigFromDisk(...args);

const settingsHelpers = createSettingsHelpers({
  normalizePathForPersistence, normalizeDirectoryPath, normalizeTunnelBootstrapTtlMs,
  normalizeTunnelSessionTtlMs, normalizeTunnelProvider, normalizeTunnelMode, normalizeOptionalPath,
  normalizeManagedRemoteTunnelHostname, normalizeManagedRemoteTunnelPresets,
  normalizeManagedRemoteTunnelPresetTokens, sanitizeTypographySizesPartial,
  normalizeStringArray, sanitizeModelRefs, sanitizeSkillCatalogs, sanitizeProjects,
});
const normalizePwaAppName = (...args) => settingsHelpers.normalizePwaAppName(...args);
const normalizePwaOrientation = (...args) => settingsHelpers.normalizePwaOrientation(...args);
const sanitizeSettingsUpdate = (...args) => settingsHelpers.sanitizeSettingsUpdate(...args);
const mergePersistedSettings = (...args) => settingsHelpers.mergePersistedSettings(...args);
const formatSettingsResponse = (...args) => settingsHelpers.formatSettingsResponse(...args);

// ── Settings & project directory ──────────────────────────────────
const projectDirectoryRuntime = createProjectDirectoryRuntime({
  fsPromises, path, normalizeDirectoryPath,
  getReadSettingsFromDiskMigrated: () => readSettingsFromDiskMigrated, sanitizeProjects,
});
const resolveDirectoryCandidate = (...args) => projectDirectoryRuntime.resolveDirectoryCandidate(...args);
const validateDirectoryPath = (...args) => projectDirectoryRuntime.validateDirectoryPath(...args);
const resolveProjectDirectory = (...args) => projectDirectoryRuntime.resolveProjectDirectory(...args);
const resolveOptionalProjectDirectory = (...args) => projectDirectoryRuntime.resolveOptionalProjectDirectory(...args);

const settingsRuntime = createSettingsRuntime({
  fsPromises, path, crypto, SETTINGS_FILE_PATH, sanitizeProjects, sanitizeSettingsUpdate,
  mergePersistedSettings, normalizeSettingsPaths, normalizeStringArray, formatSettingsResponse,
  resolveDirectoryCandidate, normalizeManagedRemoteTunnelHostname, normalizeManagedRemoteTunnelPresets,
  normalizeManagedRemoteTunnelPresetTokens, syncManagedRemoteTunnelConfigWithPresets, upsertManagedRemoteTunnelToken,
});
const readSettingsFromDiskMigrated = (...args) => settingsRuntime.readSettingsFromDiskMigrated(...args);
const readSettingsFromDisk = (...args) => settingsRuntime.readSettingsFromDisk(...args);
const writeSettingsToDisk = (...args) => settingsRuntime.writeSettingsToDisk(...args);
const persistSettings = (...args) => settingsRuntime.persistSettings(...args);

// ── Request security ──────────────────────────────────────────────
const requestSecurityRuntime = createRequestSecurityRuntime({ readSettingsFromDiskMigrated });
const getUiSessionTokenFromRequest = (...args) => requestSecurityRuntime.getUiSessionTokenFromRequest(...args);
const rejectWebSocketUpgrade = (...args) => requestSecurityRuntime.rejectWebSocketUpgrade(...args);
const isRequestOriginAllowed = (...args) => requestSecurityRuntime.isRequestOriginAllowed(...args);

// ── Push runtime ──────────────────────────────────────────────────
const pushRuntime = createPushRuntime({
  fsPromises, path, webPush, PUSH_SUBSCRIPTIONS_FILE_PATH, readSettingsFromDiskMigrated, writeSettingsToDisk,
});
const getOrCreateVapidKeys = (...args) => pushRuntime.getOrCreateVapidKeys(...args);
const addOrUpdatePushSubscription = (...args) => pushRuntime.addOrUpdatePushSubscription(...args);
const removePushSubscription = (...args) => pushRuntime.removePushSubscription(...args);
const sendPushToAllUiSessions = (...args) => pushRuntime.sendPushToAllUiSessions(...args);
const updateUiVisibility = (...args) => pushRuntime.updateUiVisibility(...args);
const isAnyUiVisible = (...args) => pushRuntime.isAnyUiVisible(...args);
const isUiVisible = (...args) => pushRuntime.isUiVisible(...args);
const ensurePushInitialized = (...args) => pushRuntime.ensurePushInitialized(...args);
const setPushInitialized = (...args) => pushRuntime.setPushInitialized(...args);

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

const ENV_SKIP_OPENCODE_START = process.env.OPENCODE_SKIP_START === 'true' || process.env.OPENCHAMBER_SKIP_OPENCODE_START === 'true';
const ENV_DESKTOP_NOTIFY = (() => {
  if (process.env.OPENCHAMBER_DESKTOP_NOTIFY === 'true') return true;
  if (process.env.OPENCHAMBER_RUNTIME === 'desktop') return true;
  const argv0 = typeof process.argv?.[0] === 'string' ? process.argv[0] : '';
  const argv1 = typeof process.argv?.[1] === 'string' ? process.argv[1] : '';
  return /openchamber-server/i.test(argv0) || /openchamber-server/i.test(argv1);
})();

const ENV_CONFIGURED_OPENCODE_WSL_DISTRO =
  typeof process.env.OPENCODE_WSL_DISTRO === 'string' && process.env.OPENCODE_WSL_DISTRO.trim().length > 0
    ? process.env.OPENCODE_WSL_DISTRO.trim()
    : (typeof process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO === 'string' && process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim().length > 0
        ? process.env.OPENCHAMBER_OPENCODE_WSL_DISTRO.trim() : null);

// ── HMR state (survives Vite reloads to prevent zombie processes) ─
const hmrStateRuntime = createHmrStateRuntime({
  globalThisLike: globalThis, os, processLike: process, stateKey: '__openchamberHmrState',
});
const hmrState = hmrStateRuntime.getOrCreateHmrState();
hmrStateRuntime.ensureUserProvidedOpenCodePassword(hmrState);

let openCodeRuntime = null;

const signalsAttachedRef = { current: false };

const syncToHmrState = () => {
  if (!openCodeRuntime) return;
  const s = openCodeRuntime.getState();
  hmrStateRuntime.syncStateFromRuntime(hmrState, {
    openCodeProcess: s.openCodeProcess,
    openCodePort: s.openCodePort,
    openCodeBaseUrl: s.openCodeBaseUrl,
    isShuttingDown: s.isShuttingDown,
    signalsAttached: signalsAttachedRef.current,
    openCodeWorkingDirectory: s.openCodeWorkingDirectory,
    openCodeAuthPassword: s.openCodeAuthPassword,
    openCodeAuthSource: s.openCodeAuthSource,
  });
};

const syncFromHmrState = () => {
  if (!openCodeRuntime) return;
  const s = openCodeRuntime.getState();
  const restored = hmrStateRuntime.restoreRuntimeFromState({ hmrState, userProvidedOpenCodePassword });
  s.openCodeProcess = restored.openCodeProcess;
  s.openCodePort = restored.openCodePort;
  s.openCodeBaseUrl = restored.openCodeBaseUrl;
  s.isShuttingDown = restored.isShuttingDown;
  s.openCodeWorkingDirectory = restored.openCodeWorkingDirectory;
  s.openCodeAuthPassword = restored.openCodeAuthPassword;
  s.openCodeAuthSource = restored.openCodeAuthSource;
  signalsAttachedRef.current = restored.signalsAttached;
};

let server = null;
let expressApp = null;
let uiAuthController = null;
let activeTunnelController = null;
let terminalRuntime = null;
let messageStreamRuntime = null;
let exitOnShutdown = true;
let runtimeManagedRemoteTunnelHostname = '';
let runtimeManagedRemoteTunnelToken = '';

// ── Env runtime (binary resolution) ──────────────────────────────
const userProvidedOpenCodePassword = hmrStateRuntime.getUserProvidedOpenCodePassword(hmrState);

const openCodeEnvState = {};
const openCodeEnvRuntime = createOpenCodeEnvRuntime({
  state: openCodeEnvState,
  normalizeDirectoryPath,
  readSettingsFromDiskMigrated,
  ENV_CONFIGURED_OPENCODE_WSL_DISTRO,
});
const applyLoginShellEnvSnapshot = (...args) => openCodeEnvRuntime.applyLoginShellEnvSnapshot(...args);
const getLoginShellEnvSnapshot = (...args) => openCodeEnvRuntime.getLoginShellEnvSnapshot(...args);
const ensureOpencodeCliEnv = (...args) => openCodeEnvRuntime.ensureOpencodeCliEnv(...args);
const applyOpencodeBinaryFromSettings = (...args) => openCodeEnvRuntime.applyOpencodeBinaryFromSettings(...args);
const resolveOpencodeCliPath = (...args) => openCodeEnvRuntime.resolveOpencodeCliPath(...args);
const isExecutable = (...args) => openCodeEnvRuntime.isExecutable(...args);
const searchPathFor = (...args) => openCodeEnvRuntime.searchPathFor(...args);
const resolveGitBinaryForSpawn = (...args) => openCodeEnvRuntime.resolveGitBinaryForSpawn(...args);
const resolveWslExecutablePath = (...args) => openCodeEnvRuntime.resolveWslExecutablePath(...args);
const buildWslExecArgs = (...args) => openCodeEnvRuntime.buildWslExecArgs(...args);
const resolveManagedOpenCodeLaunchSpec = (...args) => openCodeEnvRuntime.resolveManagedOpenCodeLaunchSpec(...args);
const clearResolvedOpenCodeBinary = (...args) => openCodeEnvRuntime.clearResolvedOpenCodeBinary(...args);

applyLoginShellEnvSnapshot();

// ── Resolution runtime ────────────────────────────────────────────
const openCodeResolutionRuntime = createOpenCodeResolutionRuntime({
  path, resolveOpencodeCliPath, applyOpencodeBinaryFromSettings,
  ensureOpencodeCliEnv, resolveManagedOpenCodeLaunchSpec,
  getResolvedState: () => ({
    resolvedOpencodeBinary: openCodeEnvState.resolvedOpencodeBinary || null,
    resolvedOpencodeBinarySource: openCodeEnvState.resolvedOpencodeBinarySource || null,
    useWslForOpencode: openCodeEnvState.useWslForOpencode,
    resolvedWslBinary: openCodeEnvState.resolvedWslBinary,
    resolvedWslOpencodePath: openCodeEnvState.resolvedWslOpencodePath,
    resolvedWslDistro: openCodeEnvState.resolvedWslDistro,
    resolvedNodeBinary: openCodeEnvState.resolvedNodeBinary,
    resolvedBunBinary: openCodeEnvState.resolvedBunBinary,
  }),
  setResolvedOpencodeBinarySource: (value) => { openCodeEnvState.resolvedOpencodeBinarySource = value; },
});
const getOpenCodeResolutionSnapshot = (...args) => openCodeResolutionRuntime.getOpenCodeResolutionSnapshot(...args);

// ── Server utils runtime (Express helpers, not OpenCode state) ────
const serverUtilsRuntime = createServerUtilsRuntime({
  fs, os, path, process,
  openCodeReadyGraceMs: OPEN_CODE_READY_GRACE_MS,
  longRequestTimeoutMs: LONG_REQUEST_TIMEOUT_MS,
  openCodeRuntime,
  getUiNotificationClients: () => uiNotificationClients,
  getLoginShellPath: () => {
    const snapshot = getLoginShellEnvSnapshot();
    return (snapshot && typeof snapshot.PATH === 'string' && snapshot.PATH.length > 0) ? snapshot.PATH : null;
  },
});

const setupProxy = (...args) => serverUtilsRuntime.setupProxy(...args);
const waitForOpenCodePort = (...args) => serverUtilsRuntime.waitForOpenCodePort(...args);
const buildAugmentedPath = (...args) => serverUtilsRuntime.buildAugmentedPath(...args);
const buildManagedOpenCodePath = (...args) => serverUtilsRuntime.buildManagedOpenCodePath(...args);
const parseSseDataPayload = (...args) => serverUtilsRuntime.parseSseDataPayload(...args);
const fetchAgentsSnapshot = (...args) => serverUtilsRuntime.fetchAgentsSnapshot(...args);
const fetchProvidersSnapshot = (...args) => serverUtilsRuntime.fetchProvidersSnapshot(...args);
const fetchModelsSnapshot = (...args) => serverUtilsRuntime.fetchModelsSnapshot(...args);

// ── Tunnel provider ───────────────────────────────────────────────
const tunnelProviderRegistry = createTunnelProviderRegistry([createCloudflareTunnelProvider()]);
tunnelProviderRegistry.seal();
const tunnelAuthController = createTunnelAuth();

// ── EventBus ──────────────────────────────────────────────────────
const eventBus = createEventBus();

// ── OpenCodeRuntime (owns all OpenCode state) ─────────────────────
openCodeRuntime = createOpenCodeRuntime({
  eventBus,
  config: {
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
    buildAugmentedPath: (env, dir) => buildAugmentedPath(env, dir),
    buildManagedOpenCodePath: (env) => buildManagedOpenCodePath(env),
    clearResolvedOpenCodeBinary,
    normalizeApiPrefix: (p) => { const trimmed = (p || '').trim(); return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed; },
    userProvidedPassword: userProvidedOpenCodePassword,
    setupProxy: (app) => {
      if (app && serverUtilsRuntime) {
        serverUtilsRuntime.setupProxy(app);
      }
    },
  },
});

// ── SSE notification clients ──────────────────────────────────────
const uiNotificationClients = new Set();
const uiNotificationWsClients = new Set();
const uiOpenChamberEventClients = new Set();

const notificationEmitterRuntime = createNotificationEmitterRuntime({
  process,
  getDesktopNotifyEnabled: () => ENV_DESKTOP_NOTIFY,
  desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
  getUiNotificationClients: () => uiNotificationClients,
  getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
});
const writeSseEvent = (...args) => notificationEmitterRuntime.writeSseEvent(...args);
const emitDesktopNotification = (...args) => notificationEmitterRuntime.emitDesktopNotification(...args);
const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
  sseClients: uiNotificationClients, wsClients: uiNotificationWsClients, writeSseEvent,
});
const broadcastUiNotification = (...args) => notificationEmitterRuntime.broadcastUiNotification(...args);

// ── Session runtime ───────────────────────────────────────────────
const sessionRuntime = createSessionRuntime({
  writeSseEvent,
  getNotificationClients: () => uiNotificationClients,
  broadcastEvent: broadcastGlobalUiEvent,
});
sessionRuntime.resetAllSessionActivityToIdle();

// ── Notification template & trigger runtimes ──────────────────────
const notificationTemplateRuntime = createNotificationTemplateRuntime({
  readSettingsFromDisk,
  persistSettings,
  openCodeRuntime,
  resolveGitBinaryForSpawn,
});
const createTimeoutSignal = (...args) => notificationTemplateRuntime.createTimeoutSignal(...args);
const resolveNotificationTemplate = (...args) => notificationTemplateRuntime.resolveNotificationTemplate(...args);
const shouldApplyResolvedTemplateMessage = (...args) => notificationTemplateRuntime.shouldApplyResolvedTemplateMessage(...args);
const summarizeText = (...args) => notificationTemplateRuntime.summarizeText(...args);
const extractTextFromParts = (...args) => notificationTemplateRuntime.extractTextFromParts(...args);
const extractLastMessageText = (...args) => notificationTemplateRuntime.extractLastMessageText(...args);
const fetchLastAssistantMessageText = (...args) => notificationTemplateRuntime.fetchLastAssistantMessageText(...args);
const maybeCacheSessionInfoFromEvent = (...args) => notificationTemplateRuntime.maybeCacheSessionInfoFromEvent(...args);
const buildTemplateVariables = (...args) => notificationTemplateRuntime.buildTemplateVariables(...args);
const fetchFreeZenModels = (...args) => notificationTemplateRuntime.fetchFreeZenModels(...args);
const resolveZenModel = (...args) => notificationTemplateRuntime.resolveZenModel(...args);
const validateZenModelAtStartup = (...args) => notificationTemplateRuntime.validateZenModelAtStartup(...args);
const getCachedZenModels = (...args) => notificationTemplateRuntime.getCachedZenModels(...args);

const notificationTriggerRuntime = createNotificationTriggerRuntime({
  readSettingsFromDisk,
  prepareNotificationLastMessage,
  summarizeText, resolveZenModel, buildTemplateVariables, extractLastMessageText,
  fetchLastAssistantMessageText, resolveNotificationTemplate, shouldApplyResolvedTemplateMessage,
  emitDesktopNotification, broadcastUiNotification, sendPushToAllUiSessions,
  openCodeRuntime,
});
const maybeSendPushForTrigger = (...args) => notificationTriggerRuntime.maybeSendPushForTrigger(...args);
const setAutoAcceptSession = (...args) => notificationTriggerRuntime.setAutoAcceptSession(...args);

// ── Event stream (SSE/WS hub) ─────────────────────────────────────
const globalMessageStreamHub = createGlobalMessageStreamHub({
  openCodeRuntime,
});

globalMessageStreamHub.subscribeStatus((status) => {
  if (status.type === 'connect') sessionRuntime.resetAllSessionActivityToIdle();
});

// ── Watcher ───────────────────────────────────────────────────────
const openCodeWatcherRuntime = createOpenCodeWatcherRuntime({
  waitForOpenCodePort: (...args) => waitForOpenCodePort(...args),
  openCodeRuntime,
  parseSseDataPayload,
  globalEventHub: globalMessageStreamHub,
  onPayload: (payload) => {
    maybeCacheSessionInfoFromEvent(payload);
    void maybeSendPushForTrigger(payload);
    sessionRuntime.processOpenCodeSsePayload(payload);
  },
});
let globalWatcherStartPromise = null;
const ensureGlobalWatcherStarted = async () => {
  if (globalWatcherStartPromise) return globalWatcherStartPromise;
  globalWatcherStartPromise = openCodeWatcherRuntime.start().catch((error) => {
    globalWatcherStartPromise = null;
    throw error;
  });
  return globalWatcherStartPromise;
};

// ── Synthetic event forwarding ────────────────────────────────────
const processForwardedEventPayload = (payload, emitSyntheticEvent) => {
  if (!payload || typeof payload !== 'object' || typeof emitSyntheticEvent !== 'function') return;
  maybeCacheSessionInfoFromEvent(payload);
  if (payload.type !== 'session.status') return;
  const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
  const info = properties.info && typeof properties.info === 'object' ? properties.info : {};
  const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
  const status = typeof info.type === 'string' ? info.type.trim() : '';
  if (!sessionId || !status) return;
  emitSyntheticEvent({
    type: 'openchamber:session-status',
    properties: { sessionId, status, timestamp: Date.now(), metadata: { attempt: typeof info.attempt === 'number' ? info.attempt : undefined, message: typeof info.message === 'string' ? info.message : undefined, next: typeof info.next === 'number' ? info.next : undefined }, needsAttention: false },
  });
  emitSyntheticEvent({
    type: 'openchamber:session-activity',
    properties: { sessionId, phase: status === 'busy' || status === 'retry' ? 'busy' : 'idle' },
  });
};

// ── Bootstrap, tunnel, startup pipeline, scheduled tasks ──────────
const bootstrapRuntime = createBootstrapRuntime({
  createUiAuth, registerServerStatusRoutes, registerCommonRequestMiddleware,
  registerAuthAndAccessRoutes, registerTtsRoutes, registerNotificationRoutes,
  registerOpenChamberRoutes, express,
});

const tunnelWiringRuntime = createTunnelWiringRuntime({
  crypto, URL, tunnelProviderRegistry, tunnelAuthController,
  readSettingsFromDiskMigrated, readManagedRemoteTunnelConfigFromDisk,
  normalizeTunnelProvider, normalizeTunnelMode, normalizeOptionalPath,
  normalizeManagedRemoteTunnelHostname, normalizeTunnelBootstrapTtlMs,
  normalizeTunnelSessionTtlMs, isSupportedTunnelMode,
  upsertManagedRemoteTunnelToken, resolveManagedRemoteTunnelToken,
  TUNNEL_MODE_QUICK, TUNNEL_MODE_MANAGED_LOCAL, TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_PROVIDER_CLOUDFLARE, TunnelServiceError,
  getActiveTunnelController: () => activeTunnelController,
  setActiveTunnelController: (value) => { activeTunnelController = value; },
  getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname,
  setRuntimeManagedRemoteTunnelHostname: (value) => { runtimeManagedRemoteTunnelHostname = value; },
  getRuntimeManagedRemoteTunnelToken: () => runtimeManagedRemoteTunnelToken,
  setRuntimeManagedRemoteTunnelToken: (value) => { runtimeManagedRemoteTunnelToken = value; },
});

const startupPipelineRuntime = createStartupPipelineRuntime({
  createTerminalRuntime, createMessageStreamWsRuntime, createServerStartupRuntime,
});

const refreshOpenCodeAfterConfigChange = (...args) => openCodeRuntime.refreshAfterConfigChange(...args);

const scheduledTasksRuntime = createScheduledTasksRuntime({
  projectConfigRuntime: createProjectConfigRuntime({ fsPromises, path, projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR }),
  listProjects: async () => { const settings = await readSettingsFromDiskMigrated(); return sanitizeProjects(settings?.projects || []); },
  openCodeRuntime,
  waitForOpenCodeReady: openCodeRuntime.waitForReady,
  emitTaskRunEvent: (event) => { /* SSE emission logic unchanged */ },
  logger: console,
});

const bootstrapOpenCodeAtStartup = async (...args) => {
  await openCodeRuntime.init();
  if (openCodeRuntime.getProcess() && !openCodeRuntime.isExternal()) {
    openCodeRuntime.startHealthMonitoring(HEALTH_CHECK_INTERVAL);
  }
  if (ENV_DESKTOP_NOTIFY) {
    void ensureGlobalWatcherStarted().catch((error) => {
      console.warn(`Global event watcher startup failed: ${error?.message || error}`);
    });
  }
};

// ── Shutdown runtime ──────────────────────────────────────────────
const gracefulShutdownRuntime = createGracefulShutdownRuntime({
  process, shutdownTimeoutMs: SHUTDOWN_TIMEOUT,
  getExitOnShutdown: () => exitOnShutdown,
  getIsShuttingDown: () => openCodeRuntime ? openCodeRuntime.getState().isShuttingDown : false,
  setIsShuttingDown: (value) => { if (openCodeRuntime) openCodeRuntime.setShuttingDown(value); },
  syncToHmrState,
  openCodeWatcherRuntime, sessionRuntime,
  getHealthCheckInterval: () => openCodeRuntime ? openCodeRuntime.getState().healthCheckInterval : null,
  clearHealthCheckInterval: (value) => clearInterval(value),
  getTerminalRuntime: () => terminalRuntime,
  setTerminalRuntime: (value) => { terminalRuntime = value; },
  getMessageStreamRuntime: () => messageStreamRuntime,
  setMessageStreamRuntime: (value) => { messageStreamRuntime = value; },
  shouldSkipOpenCodeStop: () => ENV_SKIP_OPENCODE_START || (openCodeRuntime && openCodeRuntime.isExternal()),
  openCodeRuntime,
  killProcessOnPort: () => openCodeRuntime ? openCodeRuntime.killProcessOnPort : () => {},
  waitForPortRelease: () => openCodeRuntime ? openCodeRuntime.waitForPortRelease : async () => true,
  getServer: () => server,
  getUiAuthController: () => uiAuthController,
  setUiAuthController: (value) => { uiAuthController = value; },
  getActiveTunnelController: () => activeTunnelController,
  setActiveTunnelController: (value) => { activeTunnelController = value; },
  tunnelAuthController,
  scheduledTasksRuntime,
});
const gracefulShutdown = (...args) => gracefulShutdownRuntime.gracefulShutdown(...args);

// ── EventBus subscriptions ────────────────────────────────────────
eventBus.on('opencode:ready', () => {
  console.log('[event-bus] OpenCode server is ready');
});
eventBus.on('opencode:restarting', () => {
  console.log('[event-bus] OpenCode server restarting');
});
eventBus.on('opencode:restarted', () => {
  console.log('[event-bus] OpenCode server restarted');
});
eventBus.on('opencode:unhealthy', () => {
  console.log('[event-bus] OpenCode server health check failed');
});

// ═══════════════════════════════════════════════════════════════════
// main() — the actual server boot
// ═══════════════════════════════════════════════════════════════════
async function main(options = {}) {
  const port = Number.isFinite(options.port) && options.port >= 0 ? Math.trunc(options.port) : DEFAULT_PORT;
  const host = typeof options.host === 'string' && options.host.length > 0 ? options.host : undefined;
  const tryCfTunnel = options.tryCfTunnel === true;
  const shouldUseCanonicalTunnelConfig = typeof options.tunnelMode === 'string' || typeof options.tunnelProvider === 'string' || options.tunnelConfigPath === null || typeof options.tunnelConfigPath === 'string' || typeof options.tunnelToken === 'string' || typeof options.tunnelHostname === 'string';
  const startupTunnelRequest = shouldUseCanonicalTunnelConfig
    ? normalizeTunnelStartRequest({
        provider: normalizeTunnelProvider(options.tunnelProvider),
        mode: options.tunnelMode,
        configPath: normalizeOptionalPath(options.tunnelConfigPath),
        token: typeof options.tunnelToken === 'string' ? options.tunnelToken.trim() : '',
        hostname: normalizeManagedRemoteTunnelHostname(options.tunnelHostname),
      })
    : (tryCfTunnel ? { provider: TUNNEL_PROVIDER_CLOUDFLARE, mode: TUNNEL_MODE_QUICK } : null);
  const attachSignals = options.attachSignals !== false;
  const onTunnelReady = typeof options.onTunnelReady === 'function' ? options.onTunnelReady : null;
  if (typeof options.exitOnShutdown === 'boolean') exitOnShutdown = options.exitOnShutdown;
  if (typeof options.onDesktopNotification === 'function') notificationEmitterRuntime.setOnDesktopNotification(options.onDesktopNotification);

  console.log(`Starting OpenChamber on port ${port === 0 ? 'auto' : port}`);

  const sayTTSCapability = await detectSayTtsCapability(process);
  void validateZenModelAtStartup();

  const app = express();
  const serverStartedAt = new Date().toISOString();
  app.set('trust proxy', true);
  app.use(compression({ filter: (req, res) => shouldSkipCompression(req, res) ? false : compression.filter(req, res), threshold: 1024 }));
  expressApp = app;
  server = http.createServer(app);

  openCodeRuntime.setApp(app);

  const uiPassword = typeof options.uiPassword === 'string' ? options.uiPassword : null;
  const bootstrapResult = bootstrapRuntime.setupBaseRoutes(app, {
    process, openchamberVersion: OPENCHAMBER_VERSION,
    runtimeName: process.env.OPENCHAMBER_RUNTIME || 'web',
    serverStartedAt, gracefulShutdown,
    getHealthSnapshot: () => {
      const launchSpec = openCodeEnvState.resolvedOpencodeBinary && !openCodeEnvState.useWslForOpencode
        ? resolveManagedOpenCodeLaunchSpec(openCodeEnvState.resolvedOpencodeBinary) : null;
      return {
        openCodePort: openCodeRuntime.getPort(),
        openCodeRunning: Boolean(openCodeRuntime.getPort() && openCodeRuntime.isReady() && !openCodeRuntime.isRestarting()),
        openCodeSecureConnection: openCodeRuntime.isConnectionSecure(),
        openCodeAuthSource: openCodeRuntime.getOpenCodeAuthSource() || null,
        openCodeApiPrefix: '', openCodeApiPrefixDetected: true,
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
        desktopNotifyEnabled: ENV_DESKTOP_NOTIFY,
        planModeExperimentalEnabled: PLAN_MODE_EXPERIMENT_ENABLED,
      };
    },
    uiPassword, tunnelAuthController, readSettingsFromDiskMigrated,
    normalizeTunnelSessionTtlMs, resolveZenModel, sayTTSCapability,
    ensurePushInitialized, ensureGlobalWatcherStarted, getOrCreateVapidKeys,
    getUiSessionTokenFromRequest, writeSettingsToDisk, addOrUpdatePushSubscription,
    removePushSubscription, updateUiVisibility, isUiVisible,
    getUiNotificationClients: () => uiNotificationClients,
    writeSseEvent, sessionRuntime, setPushInitialized,
    fs, os, path, server, __dirname,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    modelsDevApiUrl: MODELS_DEV_API_URL,
    modelsMetadataCacheTtl: MODELS_METADATA_CACHE_TTL,
    fetchFreeZenModels, getCachedZenModels, setAutoAcceptSession,
  });
  uiAuthController = bootstrapResult.uiAuthController;

  const tunnelRuntimeContext = tunnelWiringRuntime.initialize(app, port);
  const { tunnelService, startTunnelWithNormalizedRequest } = tunnelRuntimeContext;

  const featureRoutesRuntime = createFeatureRoutesRuntime({ clientReloadDelayMs: CLIENT_RELOAD_DELAY_MS });
  await featureRoutesRuntime.registerRoutes(app, {
    crypto, fs, os, path, fsPromises, spawn,
    resolveGitBinaryForSpawn,
    createFsSearchRuntime: createFsSearchRuntimeFactory,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
    normalizeDirectoryPath, resolveProjectDirectory,
    resolveOptionalProjectDirectory, validateDirectoryPath,
    readCustomThemesFromDisk, refreshOpenCodeAfterConfigChange,
    getOpenCodeResolutionSnapshot, formatSettingsResponse,
    readSettingsFromDisk, readSettingsFromDiskMigrated, persistSettings,
    sanitizeProjects, sanitizeSkillCatalogs, isUnsafeSkillRelativePath,
    openCodeRuntime,
    getOpenCodePort: () => openCodeRuntime.getPort(),
    buildAugmentedPath,
    projectConfigRuntime: createProjectConfigRuntime({ fsPromises, path, projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR }),
    scheduledTasksRuntime,
    getOpenChamberEventClients: () => uiOpenChamberEventClients,
    writeSseEvent,
  });

  const staticRoutesRuntime = createStaticRoutesRuntime({
    fs, path, process, __dirname, express,
    resolveProjectDirectory,
    openCodeRuntime,
    readSettingsFromDiskMigrated,
    normalizePwaAppName, normalizePwaOrientation,
  });

  const startupPipelineResult = await startupPipelineRuntime.run({
    app, server, express, fs, path, uiAuthController,
    buildAugmentedPath, searchPathFor, isExecutable,
    isRequestOriginAllowed, rejectWebSocketUpgrade,
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
    staticRoutesRuntime, process, crypto,
    normalizeTunnelBootstrapTtlMs, readSettingsFromDiskMigrated,
    tunnelAuthController, startTunnelWithNormalizedRequest,
    gracefulShutdown,
    getSignalsAttached: () => signalsAttachedRef.current,
    setSignalsAttached: (value) => { signalsAttachedRef.current = value; },
    syncToHmrState,
    TUNNEL_MODE_QUICK, TUNNEL_MODE_MANAGED_LOCAL, TUNNEL_MODE_MANAGED_REMOTE,
    host, port, startupTunnelRequest, onTunnelReady,
    tunnelRuntimeContext, attachSignals,
  });
  terminalRuntime = startupPipelineResult.terminalRuntime;
  messageStreamRuntime = startupPipelineResult.messageStreamRuntime;

  Sentry.setupExpressErrorHandler(app);

  try { await scheduledTasksRuntime.start(); } catch (error) {
    console.warn('[ScheduledTasks] Failed to start runtime:', error?.message || error);
  }

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => tunnelRuntimeContext.getActivePort(),
    getOpenCodePort: () => openCodeRuntime.getPort(),
    getTunnelUrl: () => tunnelService.getPublicUrl(),
    isReady: () => openCodeRuntime.isReady(),
    restartOpenCode: () => openCodeRuntime.restart(),
    stop: (shutdownOptions = {}) => gracefulShutdown({ exitProcess: shutdownOptions.exitProcess ?? false }),
  };
}

// ── CLI entry ──────────────────────────────────────────────────────
runCliEntryIfMain({
  process, currentFilename: __filename, parseServeCliOptions,
  defaultPort: DEFAULT_PORT, cloudflareProvider: TUNNEL_PROVIDER_CLOUDFLARE,
  managedLocalMode: TUNNEL_MODE_MANAGED_LOCAL,
  setExitOnShutdown: (value) => { exitOnShutdown = value; },
  startServer: main,
});

const restartOpenCode = () => openCodeRuntime.restart();
export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseServeCliOptions as parseArgs };
