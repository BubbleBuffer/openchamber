/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ServerStartupDeps {
  process: typeof import("process");
  crypto: typeof import("crypto");
  server: any;
  normalizeTunnelBootstrapTtlMs: (value: number | null) => number | null;
  readSettingsFromDiskMigrated: () => Promise<object>;
  tunnelAuthController: any;
  startTunnelWithNormalizedRequest: (request: any) => Promise<any>;
  gracefulShutdown: (opts?: any) => Promise<void>;
  getSignalsAttached: () => boolean;
  setSignalsAttached: (value: boolean) => void;
  syncToHmrState: () => void;
  TUNNEL_MODE_QUICK: string;
  TUNNEL_MODE_MANAGED_LOCAL: string;
  TUNNEL_MODE_MANAGED_REMOTE: string;
}

export interface ServerStartupRuntime {
  resolveBindHost(host?: string): string;
  startListeningAndMaybeTunnel(opts: {
    port: number;
    bindHost: string;
    startupTunnelRequest?: any;
    onTunnelReady?: (url: string, connectUrl: string) => void;
  }): Promise<{ activePort: number }>;
  attachProcessHandlers(opts: { attachSignals?: boolean }): void;
}

export interface StartupPipelineDeps {
  createTerminalRuntime: Function;
  createMessageStreamWsRuntime: Function;
  createServerStartupRuntime: Function;
}

export interface StartupPipelineRuntime {
  run(opts: any): Promise<{ terminalRuntime: any; messageStreamRuntime: any }>;
}

export interface BootstrapDeps {
  createUiAuth: Function;
  registerServerStatusRoutes: Function;
  registerCommonRequestMiddleware: Function;
  registerAuthAndAccessRoutes: Function;
  registerNotificationRoutes: Function;
  registerOpenChamberRoutes: Function;
  express: typeof import("express");
}

export interface BootstrapRuntime {
  setupBaseRoutes(app: any, options: any): { uiAuthController: any };
}

export interface ShutdownDeps {
  process: typeof import("process");
  shutdownTimeoutMs: number;
  getExitOnShutdown: () => boolean;
  getIsShuttingDown: () => boolean;
  setIsShuttingDown: (value: boolean) => void;
  syncToHmrState: () => void;
  openCodeWatcherRuntime: any;
  sessionRuntime: any;
  notificationRuntime?: any;
  scheduledTasksRuntime?: any;
  getHealthCheckInterval: () => number | null;
  clearHealthCheckInterval: (value: number) => void;
  getTerminalRuntime: () => any;
  setTerminalRuntime: (value: any) => void;
  getMessageStreamRuntime: () => any;
  setMessageStreamRuntime: (value: any) => void;
  shouldSkipOpenCodeStop: () => boolean;
  openCodeRuntime: any;
  killProcessOnPort: (port: number) => void;
  waitForPortRelease: (port: number, ms: number) => Promise<boolean>;
  getServer: () => any;
  getUiAuthController: () => any;
  setUiAuthController: (value: any) => void;
  getActiveTunnelController: () => any;
  setActiveTunnelController: (value: any) => void;
  tunnelAuthController: any;
  serverSessionMachineBridge: any;
  sessionActorRegistry: any;
  sessionEffectExecutor: any;
}

export interface ShutdownRuntime {
  gracefulShutdown(opts?: { exitProcess?: boolean }): Promise<void>;
}

export interface LifecycleDeps {
  state: any;
  env: any;
  syncToHmrState: () => void;
  syncFromHmrState: () => void;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  buildOpenCodeUrl: (pathStr: string, prefixOverride?: string) => string;
  waitForReady: (url: string, timeoutMs?: number) => Promise<boolean>;
  normalizeApiPrefix: (prefix: string) => string;
  applyOpencodeBinaryFromSettings: () => Promise<void>;
  ensureOpencodeCliEnv: () => void;
  ensureLocalOpenCodeServerPassword: (opts?: { rotateManaged?: boolean }) => Promise<string>;
  buildWslExecArgs: (args: string[], distro?: string) => string[];
  resolveWslExecutablePath: () => string | null;
  resolveManagedOpenCodeLaunchSpec: (binary: string) => any | null;
  setOpenCodePort: (port: number) => void;
  setDetectedOpenCodeApiPrefix: (prefix: string) => void;
  setupProxy: (app: any) => void;
  ensureOpenCodeApiPrefix: () => void;
  clearResolvedOpenCodeBinary: () => void;
  buildAugmentedPath: () => string;
  buildManagedOpenCodePath: () => string;
}

export interface OpenCodeLifecycleRuntime {
  killProcessOnPort(port: number): void;
  startOpenCode(): Promise<any>;
  restartOpenCode(): Promise<void>;
  waitForOpenCodeReady(timeoutMs?: number, intervalMs?: number): Promise<void>;
  waitForAgentPresence(agentName: string, timeoutMs?: number, intervalMs?: number): Promise<void>;
  refreshOpenCodeAfterConfigChange(reason: string, options?: any): Promise<void>;
  bootstrapOpenCodeAtStartup(): Promise<void>;
  startHealthMonitoring(healthCheckIntervalMs: number): void;
  triggerHealthCheck(): Promise<void>;
  waitForPortRelease(port: number, timeoutMs?: number, hostname?: string): Promise<boolean>;
}

export interface ParseServeCliOptionsResult {
  port: number;
  host: string | undefined;
  uiPassword: string | null;
  tryCfTunnel: boolean;
  tunnelProvider: string | undefined;
  tunnelMode: string | undefined;
  tunnelConfigPath: string | null;
  tunnelToken: string | undefined;
  tunnelHostname: string | undefined;
}

export interface CliOptionsDeps {
  argv?: string[];
  env?: Record<string, string | undefined>;
  defaultPort: number;
  cloudflareProvider: string;
  managedLocalMode: string;
}

export interface CliEntryDeps {
  process: typeof import("process");
  currentFilename: string;
  parseServeCliOptions: (deps: CliOptionsDeps) => ParseServeCliOptionsResult;
  defaultPort: number;
  cloudflareProvider: string;
  managedLocalMode: string;
  setExitOnShutdown: (value: boolean) => void;
  startServer: Function;
}

export interface BootstrapDomain {
  parseServeCliOptions(deps: CliOptionsDeps): ParseServeCliOptionsResult;
  runCliEntryIfMain(deps: CliEntryDeps): void;
  createStartupPipelineRuntime(deps: StartupPipelineDeps): StartupPipelineRuntime;
  createServerStartupRuntime(deps: ServerStartupDeps): ServerStartupRuntime;
  createBootstrapRuntime(deps: BootstrapDeps): BootstrapRuntime;
  createGracefulShutdownRuntime(deps: ShutdownDeps): ShutdownRuntime;
  createOpenCodeLifecycleRuntime(deps: LifecycleDeps): OpenCodeLifecycleRuntime;
}