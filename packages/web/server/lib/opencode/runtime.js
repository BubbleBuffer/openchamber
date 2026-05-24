// packages/web/server/lib/opencode/runtime.js
import { createOpenCodeLifecycleRuntime } from './bootstrap/lifecycle.js';
import { createOpenCodeAuthStateRuntime } from './auth.js';
import { createOpenCodeNetworkRuntime } from './network.js';
import crypto from 'node:crypto';

export function createOpenCodeRuntime({ eventBus, config }) {
  const {
    env,
    syncToHmrState,
    syncFromHmrState,
    applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv,
    buildWslExecArgs,
    resolveWslExecutablePath,
    resolveManagedOpenCodeLaunchSpec,
    buildAugmentedPath,
    buildManagedOpenCodePath,
    clearResolvedOpenCodeBinary,
    normalizeApiPrefix,
    userProvidedPassword,
    setupProxy,
  } = config;

  // ── Internal state — plain object, single owner ─────────────────
  const state = {
    openCodeProcess: null,
    openCodePort: null,
    openCodeBaseUrl: null,
    openCodeWorkingDirectory: config.workingDirectory || process.cwd(),
    isOpenCodeReady: false,
    isRestartingOpenCode: false,
    isExternalOpenCode: false,
    isShuttingDown: false,
    openCodeNotReadySince: 0,
    lastOpenCodeError: null,
    openCodeApiPrefix: '',
    openCodeApiPrefixDetected: true,
    openCodeApiDetectionTimer: null,
    openCodeAuthPassword: null,
    openCodeAuthSource: null,
    currentRestartPromise: null,
    healthCheckInterval: null,
    expressApp: null,
    useWslForOpencode: false,
    resolvedWslBinary: null,
    resolvedWslOpencodePath: null,
    resolvedWslDistro: null,
  };

  // ── Auth module ────────────────────────────────────────────────
  const authRuntime = createOpenCodeAuthStateRuntime({
    crypto,
    process,
    getAuthPassword: () => state.openCodeAuthPassword,
    setAuthPassword: (value) => { state.openCodeAuthPassword = value; },
    getAuthSource: () => state.openCodeAuthSource,
    setAuthSource: (value) => { state.openCodeAuthSource = value; },
    getUserProvidedPassword: () => userProvidedPassword ?? null,
    syncToHmrState,
  });

  // ── Network module ─────────────────────────────────────────────
  const networkRuntime = createOpenCodeNetworkRuntime({
    state: {
      get openCodePort() { return state.openCodePort; },
      set openCodePort(value) { state.openCodePort = value; },
      get openCodeBaseUrl() { return state.openCodeBaseUrl; },
      set openCodeBaseUrl(value) { state.openCodeBaseUrl = value; },
      get openCodeApiPrefix() { return state.openCodeApiPrefix; },
      set openCodeApiPrefix(value) { state.openCodeApiPrefix = value; },
      get openCodeApiPrefixDetected() { return state.openCodeApiPrefixDetected; },
      set openCodeApiPrefixDetected(value) { state.openCodeApiPrefixDetected = value; },
      get openCodeApiDetectionTimer() { return state.openCodeApiDetectionTimer; },
      set openCodeApiDetectionTimer(value) { state.openCodeApiDetectionTimer = value; },
    },
    getOpenCodeAuthHeaders: () => authRuntime.getOpenCodeAuthHeaders(),
  });

  // ── setOpenCodePort (provided to lifecycle as a dep) ───────────
  const setOpenCodePort = (port) => {
    if (!Number.isFinite(port) || port <= 0) return;

    const numericPort = Math.trunc(port);
    const portChanged = state.openCodePort !== numericPort;

    if (portChanged || state.openCodePort === null) {
      state.openCodePort = numericPort;
      syncToHmrState();
      console.log(`Detected OpenCode port: ${numericPort}`);
      if (portChanged) {
        state.isOpenCodeReady = false;
      }
      state.openCodeNotReadySince = Date.now();
    }
    state.lastOpenCodeError = null;
  };

  // ── setDetectedOpenCodeApiPrefix (provided to lifecycle as a dep)
  const setDetectedOpenCodeApiPrefix = () => {
    state.openCodeApiPrefix = '';
    state.openCodeApiPrefixDetected = true;
    if (state.openCodeApiDetectionTimer) {
      clearTimeout(state.openCodeApiDetectionTimer);
      state.openCodeApiDetectionTimer = null;
    }
  };

  // ── Local waitForOpenCodePort (not exported from lifecycle) ────
  const waitForOpenCodePort = async (timeoutMs = 15000) => {
    if (state.openCodePort !== null) {
      return state.openCodePort;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (state.openCodePort !== null) {
        return state.openCodePort;
      }
    }

    throw new Error('Timed out waiting for OpenCode port');
  };

  // ── Lifecycle module ───────────────────────────────────────────
  const lifecycleRuntime = createOpenCodeLifecycleRuntime({
    state,
    env,
    syncToHmrState,
    syncFromHmrState,
    getOpenCodeAuthHeaders: () => authRuntime.getOpenCodeAuthHeaders(),
    buildOpenCodeUrl: (path, prefix) => networkRuntime.buildOpenCodeUrl(path, prefix),
    waitForReady: networkRuntime.waitForReady,
    normalizeApiPrefix: normalizeApiPrefix,
    applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv,
    ensureLocalOpenCodeServerPassword: authRuntime.ensureLocalOpenCodeServerPassword,
    buildWslExecArgs,
    resolveWslExecutablePath,
    resolveManagedOpenCodeLaunchSpec,
    setOpenCodePort,
    setDetectedOpenCodeApiPrefix,
    setupProxy: setupProxy || (() => {}),
    ensureOpenCodeApiPrefix: networkRuntime.ensureOpenCodeApiPrefix,
    clearResolvedOpenCodeBinary,
    buildAugmentedPath,
    buildManagedOpenCodePath,
  });

  // ── Public API ─────────────────────────────────────────────────
  return {
    // Lifecycle entry points
    init: lifecycleRuntime.bootstrapOpenCodeAtStartup,
    restart: lifecycleRuntime.restartOpenCode,
    refreshAfterConfigChange: lifecycleRuntime.refreshOpenCodeAfterConfigChange,

    // Accessors (replace buildOpenCodeUrl / getOpenCodeAuthHeaders everywhere)
    getUrl: (path, prefixOverride) => networkRuntime.buildOpenCodeUrl(path, prefixOverride),
    getAuthHeaders: () => authRuntime.getOpenCodeAuthHeaders(),
    isReady: () => state.isOpenCodeReady,
    isRestarting: () => state.isRestartingOpenCode,
    getPort: () => state.openCodePort,
    getBaseUrl: () => state.openCodeBaseUrl,
    getProcess: () => state.openCodeProcess,
    isExternal: () => state.isExternalOpenCode,
    getOpenCodeAuthSource: () => state.openCodeAuthSource,
    getLastError: () => state.lastOpenCodeError,
    isConnectionSecure: () => authRuntime.isOpenCodeConnectionSecure(),
    getNotReadySince: () => state.openCodeNotReadySince,

    // Health
    startHealthMonitoring: (intervalMs) => lifecycleRuntime.startHealthMonitoring(intervalMs),
    stopHealthMonitoring: () => {
      if (state.healthCheckInterval) {
        clearInterval(state.healthCheckInterval);
        state.healthCheckInterval = null;
      }
    },
    triggerHealthCheck: lifecycleRuntime.triggerHealthCheck,

    // Readiness waiting
    waitForReady: lifecycleRuntime.waitForOpenCodeReady,
    waitForAgentPresence: lifecycleRuntime.waitForAgentPresence,
    waitForPort: waitForOpenCodePort,

    // Port management
    killProcessOnPort: lifecycleRuntime.killProcessOnPort,
    waitForPortRelease: lifecycleRuntime.waitForPortRelease,

    // State mutation (for index.js wiring — shutdown, env resolution)
    setApp: (app) => { state.expressApp = app; },
    setShuttingDown: (value) => { state.isShuttingDown = value; },
    setWorkingDirectory: (dir) => { state.openCodeWorkingDirectory = dir; },

    // Internal access (needed during index.js rewrite for gradual migration)
    getState: () => state,
    getLifecycleRuntime: () => lifecycleRuntime,
    getAuthRuntime: () => authRuntime,
    getNetworkRuntime: () => networkRuntime,
  };
}
