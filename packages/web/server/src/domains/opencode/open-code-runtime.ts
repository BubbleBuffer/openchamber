/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";

import { createOpenCodeLifecycleRuntime } from "./lifecycle.js";
import { createOpenCodeAuthStateRuntime } from "../opencode-support/index.js";
import { createOpenCodeNetworkRuntime } from "../opencode-support/index.js";

interface OpenCodeState {
  openCodeProcess: any;
  openCodePort: number | null;
  openCodeBaseUrl: string | null;
  openCodeWorkingDirectory: string;
  isOpenCodeReady: boolean;
  isRestartingOpenCode: boolean;
  isExternalOpenCode: boolean;
  isShuttingDown: boolean;
  openCodeNotReadySince: number;
  lastOpenCodeError: any;
  openCodeApiPrefix: string;
  openCodeApiPrefixDetected: boolean;
  openCodeApiDetectionTimer: any;
  openCodeAuthPassword: string | null;
  openCodeAuthSource: string | null;
  currentRestartPromise: any;
  healthCheckInterval: any;
  expressApp: any;
  useWslForOpencode: boolean;
  resolvedWslBinary: string | null;
  resolvedWslOpencodePath: string | null;
  resolvedWslDistro: string | null;
}

interface OpenCodeRuntimeConfig {
  env: any;
  syncToHmrState: () => void;
  syncFromHmrState: () => void;
  applyOpencodeBinaryFromSettings: any;
  ensureOpencodeCliEnv: any;
  buildWslExecArgs: any;
  resolveWslExecutablePath: any;
  resolveManagedOpenCodeLaunchSpec: any;
  buildAugmentedPath: any;
  buildManagedOpenCodePath: any;
  clearResolvedOpenCodeBinary: any;
  normalizeApiPrefix: any;
  userProvidedPassword?: string;
  setupProxy: any;
  workingDirectory?: string;
}

export function createOpenCodeRuntime({
  config,
}: {
  eventBus: any;
  config: OpenCodeRuntimeConfig;
}): any {
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
  const state: OpenCodeState = {
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
    openCodeApiPrefix: "",
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

  // ── Auth module ─────────────────────────────────────────────────
  const authRuntime = createOpenCodeAuthStateRuntime({
    crypto,
    process,
    getAuthPassword: () => state.openCodeAuthPassword,
    setAuthPassword: (value) => {
      state.openCodeAuthPassword = value;
    },
    getAuthSource: () => state.openCodeAuthSource,
    setAuthSource: (value) => {
      state.openCodeAuthSource = value;
    },
    getUserProvidedPassword: () => userProvidedPassword ?? null,
    syncToHmrState,
  });

  // ── Network module ─────────────────────────────────────────────
  // The state object uses getters/setters that satisfy NetworkRuntimeDeps.
  // Cast through `as any` to avoid mismatch between nullable internal types
  // and the non-nullable interface types.
  const networkState = {
    get openCodePort() {
      return state.openCodePort as number;
    },
    set openCodePort(value: any) {
      state.openCodePort = value;
    },
    get openCodeBaseUrl() {
      return state.openCodeBaseUrl as string;
    },
    set openCodeBaseUrl(value: any) {
      state.openCodeBaseUrl = value;
    },
    get openCodeApiPrefix() {
      return state.openCodeApiPrefix as string;
    },
    set openCodeApiPrefix(value: any) {
      state.openCodeApiPrefix = value;
    },
    get openCodeApiPrefixDetected() {
      return state.openCodeApiPrefixDetected as boolean;
    },
    set openCodeApiPrefixDetected(value: any) {
      state.openCodeApiPrefixDetected = value;
    },
    get openCodeApiDetectionTimer() {
      return state.openCodeApiDetectionTimer;
    },
    set openCodeApiDetectionTimer(value: any) {
      state.openCodeApiDetectionTimer = value;
    },
  };

  const networkRuntime = createOpenCodeNetworkRuntime({
    state: networkState as any,
    getOpenCodeAuthHeaders: () => authRuntime.getOpenCodeAuthHeaders(),
  });

  // ── setOpenCodePort (provided to lifecycle as a dep) ───────────
  const setOpenCodePort = (port: any) => {
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
    state.openCodeApiPrefix = "";
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

    throw new Error("Timed out waiting for OpenCode port");
  };

  // ── Lifecycle module ───────────────────────────────────────────
  const lifecycleRuntime = createOpenCodeLifecycleRuntime({
    state,
    env,
    syncToHmrState,
    syncFromHmrState,
    getOpenCodeAuthHeaders: () => authRuntime.getOpenCodeAuthHeaders(),
    buildOpenCodeUrl: (path: any, prefix: any) =>
      networkRuntime.buildOpenCodeUrl(path, prefix),
    waitForReady: networkRuntime.waitForReady,
    normalizeApiPrefix: normalizeApiPrefix,
    applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv,
    ensureLocalOpenCodeServerPassword: () => authRuntime.ensureLocalOpenCodeServerPassword(),
    buildWslExecArgs,
    resolveWslExecutablePath,
    resolveManagedOpenCodeLaunchSpec,
    setOpenCodePort,
    setDetectedOpenCodeApiPrefix,
    setupProxy: setupProxy || (() => ({})),
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

    // Accessors
    getUrl: (path: any, prefixOverride: any) =>
      networkRuntime.buildOpenCodeUrl(path, prefixOverride),
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
    getIsShuttingDown: () => state.isShuttingDown,
    getHealthCheckInterval: () => state.healthCheckInterval,
    getWorkingDirectory: () => state.openCodeWorkingDirectory,
    getAuthPassword: () => state.openCodeAuthPassword,

    // Health
    startHealthMonitoring: (intervalMs: any) =>
      lifecycleRuntime.startHealthMonitoring(intervalMs),
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

    // State mutation
    setApp: (app: any) => {
      state.expressApp = app;
    },
    setShuttingDown: (value: any) => {
      state.isShuttingDown = value;
    },
    setWorkingDirectory: (dir: any) => {
      state.openCodeWorkingDirectory = dir;
    },
    syncFromHmrState: (restored: any) => {
      if (restored.openCodeProcess !== undefined)
        state.openCodeProcess = restored.openCodeProcess;
      if (restored.openCodePort !== undefined)
        state.openCodePort = restored.openCodePort;
      if (restored.openCodeBaseUrl !== undefined)
        state.openCodeBaseUrl = restored.openCodeBaseUrl;
      if (restored.isShuttingDown !== undefined)
        state.isShuttingDown = restored.isShuttingDown;
      if (restored.openCodeWorkingDirectory !== undefined)
        state.openCodeWorkingDirectory = restored.openCodeWorkingDirectory;
      if (restored.openCodeAuthPassword !== undefined)
        state.openCodeAuthPassword = restored.openCodeAuthPassword;
      if (restored.openCodeAuthSource !== undefined)
        state.openCodeAuthSource = restored.openCodeAuthSource;
    },
    clearProcess: () => {
      state.openCodeProcess = null;
    },

    // Internal access
    getLifecycleRuntime: () => lifecycleRuntime,
    getAuthRuntime: () => authRuntime,
    getNetworkRuntime: () => networkRuntime,
    getState: () => state,
  };
}
