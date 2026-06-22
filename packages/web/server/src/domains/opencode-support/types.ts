/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HmrState {
  openCodeProcess?: any;
  openCodePort?: number | null;
  openCodeBaseUrl?: string | null;
  openCodeWorkingDirectory?: string;
  isOpenCodeReady?: boolean;
  isShuttingDown?: boolean;
  openCodeApiPrefix?: string;
  resolvedOpencodeBinary?: string | null;
  resolvedOpencodeBinarySource?: string | null;
  useWslForOpencode?: boolean;
  resolvedWslBinary?: string | null;
  resolvedWslOpencodePath?: string | null;
  resolvedWslDistro?: string | null;
  userProvidedOpenCodePassword?: string | null;
  openCodeAuthPassword?: string | null;
  openCodeAuthSource?: string | null;
  openCodeNotReadySince?: number;
  signalsAttached?: boolean;
}

export interface HmrStateRuntimeDeps {
  globalThisLike: typeof globalThis;
  os: typeof import("os");
  processLike: typeof import("process");
  stateKey: string;
}

export interface HmrStateRuntime {
  getOrCreateHmrState(): HmrState;
  ensureUserProvidedOpenCodePassword(hmrState: HmrState): void;
  getUserProvidedOpenCodePassword(hmrState: HmrState): string | null;
  resolveOpenCodeAuthFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any;
  syncStateFromRuntime(hmrState: HmrState, runtime: any): void;
  restoreRuntimeFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any;
}

export interface OpenCodeEnvConfigResult {
  configuredOpenCodePort: number | null;
  configuredOpenCodeHost: { origin: string; port: number } | null;
  effectivePort: number | null;
  configuredOpenCodeHostname: string;
}

export interface EnvRuntimeState {
  cachedLoginShellEnvSnapshot?: Record<string, string> | null;
  useWslForOpencode?: boolean;
  resolvedWslBinary?: string | null;
  resolvedWslOpencodePath?: string | null;
  resolvedWslDistro?: string | null;
  resolvedOpencodeBinary?: string | null;
  resolvedOpencodeBinarySource?: string | null;
  resolvedGitBinary?: string;
  resolvedNodeBinary?: string | null;
  resolvedBunBinary?: string | null;
}

export interface EnvRuntimeDeps {
  state: EnvRuntimeState;
  normalizeDirectoryPath: (value: unknown) => string | unknown;
  readSettingsFromDiskMigrated: () => Promise<object>;
  ENV_CONFIGURED_OPENCODE_WSL_DISTRO: string | null;
}

export interface OpenCodeEnvRuntime {
  isExecutable(filePath: string): boolean;
  searchPathFor(binaryName: string): string | null;
  getLoginShellEnvSnapshot(): Record<string, string> | null;
  applyLoginShellEnvSnapshot(): void;
  ensureOpencodeCliEnv(): string | null;
  applyOpencodeBinaryFromSettings(): Promise<string | null>;
  resolveOpencodeCliPath(): string | null;
  resolveGitBinaryForSpawn(): string;
  resolveWslExecutablePath(): string | null;
  buildWslExecArgs(args: string[], distro?: string): string[];
  resolveManagedOpenCodeLaunchSpec(binary: string | null): { binary: string; args: string[]; wrapperType: string | null } | null;
  clearResolvedOpenCodeBinary(): void;
}

export interface NetworkRuntimeDeps {
  state: { openCodePort: number; openCodeBaseUrl: string; openCodeApiPrefix: string; openCodeApiPrefixDetected: boolean; openCodeApiDetectionTimer: any };
  getOpenCodeAuthHeaders: () => Record<string, string>;
}

export interface OpenCodeNetworkRuntime {
  waitForReady(url: string, timeoutMs?: number): Promise<boolean>;
  normalizeApiPrefix(prefix: string): string;
  setDetectedOpenCodeApiPrefix(): void;
  buildOpenCodeUrl(pathStr: string, prefixOverride?: string): string;
  ensureOpenCodeApiPrefix(): void;
  scheduleOpenCodeApiDetection(): void;
}

export interface AuthStateRuntimeDeps {
  crypto: typeof import("crypto");
  process: typeof import("process");
  getAuthPassword: () => string | null;
  setAuthPassword: (password: string | null) => void;
  getAuthSource: () => string | null;
  setAuthSource: (source: string | null) => void;
  getUserProvidedPassword: () => string | null;
  syncToHmrState: () => void;
}

export interface OpenCodeAuthStateRuntime {
  getOpenCodeAuthHeaders(): { Authorization: string };
  isOpenCodeConnectionSecure(): boolean;
  ensureLocalOpenCodeServerPassword(opts?: { rotateManaged?: boolean }): Promise<string>;
}

export interface ProjectDirectoryRuntimeDeps {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  normalizeDirectoryPath: (value: unknown) => string | unknown;
  readSettingsFromDiskMigrated: () => Promise<object>;
  getReadSettingsFromDiskMigrated: () => () => Promise<object>;
  sanitizeProjects: (input: unknown) => Array<Record<string, unknown>> | undefined;
}

export interface ProjectDirectoryRuntime {
  resolveDirectoryCandidate(value: string): string | null;
  validateDirectoryPath(candidate: string): Promise<{ ok: boolean; directory: string | null; error: string | null }>;
  resolveProjectDirectory(req: any): Promise<{ directory: string | null; error: string | null }>;
  resolveOptionalProjectDirectory(req: any): Promise<{ directory: string | null; error: string | null }>;
}

export interface OpenCodeResolutionDeps {
  path: typeof import("path");
  resolveOpencodeCliPath: () => string | null;
  applyOpencodeBinaryFromSettings: () => Promise<void>;
  ensureOpencodeCliEnv: () => void;
  resolveManagedOpenCodeLaunchSpec: (binary: string) => any | null;
  getResolvedState: () => { resolvedOpencodeBinary: string | null; resolvedOpencodeBinarySource: string | null; useWslForOpencode: boolean; resolvedWslDistro: string | null; resolvedWslBinary?: string | null; resolvedWslOpencodePath?: string | null; resolvedNodeBinary?: string | null; resolvedBunBinary?: string | null };
  setResolvedOpencodeBinarySource: (value: string) => void;
}

export interface OpenCodeResolutionRuntime {
  getOpenCodeResolutionSnapshot(settings: object): Promise<object>;
}

export interface OpenCodeWatcherDeps {
  waitForOpenCodePort: () => Promise<void>;
  getOpenCodeRuntime: () => { getUrl(path: string, query: string): string; getAuthHeaders(): Record<string, string> };
  onPayload: (payload: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
  upstreamStallTimeoutMs?: number;
  upstreamReconnectDelayMs?: number;
  globalEventHub?: {
    subscribeEvent(cb: (event: { payload: unknown }) => void): () => void;
    subscribeStatus(cb: (status: { type: string; error?: unknown }) => void): () => void;
    start(): void;
  } | null;
}

export interface OpenCodeWatcherRuntime {
  start(): Promise<void>;
  stop(): void;
}