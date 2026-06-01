import type { Express } from "express";

export interface OpenCodeDomainDeps {
  eventBus: any;
  env: {
    ENV_CONFIGURED_OPENCODE_PORT?: string;
    ENV_CONFIGURED_OPENCODE_HOST?: string;
    ENV_EFFECTIVE_PORT?: string;
    ENV_SKIP_OPENCODE_START?: boolean;
    [key: string]: any;
  };
  syncToHmrState: () => void;
  syncFromHmrState: () => any;
  applyOpencodeBinaryFromSettings: (settings: any) => string | null;
  ensureOpencodeCliEnv: () => void;
  buildWslExecArgs?: (...args: any[]) => string[];
  resolveWslExecutablePath?: (bin: string) => string;
  resolveManagedOpenCodeLaunchSpec: (opts: any) => any;
  clearResolvedOpenCodeBinary: () => void;
  normalizeApiPrefix: (prefix: string) => string;
  userProvidedPassword: string | null;
  getBuildAugmentedPath?: () => string;
  getBuildManagedOpenCodePath?: () => string;
  getServerUtilsRuntime?: () => any;
}

export interface OpenCodeDomain {
  runtime: any;
  getUrl(path?: string, search?: string): string;
  getAuthHeaders(): Record<string, string>;
  isReady(): boolean;
  isRestarting(): boolean;
  getPort(): number | null;
  setApp(app: Express): void;
  init(): Promise<void>;
  restart(): Promise<void>;
  startHealthMonitoring(intervalMs: number): void;
  stopHealthMonitoring(): void;
  triggerHealthCheck(): void;
  waitForReady(timeoutMs?: number, intervalMs?: number): Promise<void>;
  waitForAgentPresence(agentName: string, timeoutMs?: number, intervalMs?: number): Promise<void>;
  setShuttingDown(value: boolean): void;
  getIsShuttingDown(): boolean;
  isExternal(): boolean;
  getProcess(): any;
  clearProcess(): void;
  getOpenCodeAuthSource(): string | null;
  isConnectionSecure(): boolean;
  getLastError(): Error | null;
  getNotReadySince(): number | null;
  getHealthCheckInterval(): ReturnType<typeof setInterval> | null;
  getWorkingDirectory(): string | null;
  setWorkingDirectory(dir: string): void;
  getAuthPassword(): string | null;
  getState(): any;
  killProcessOnPort(port: number): void;
  waitForPortRelease(port: number, timeoutMs?: number): Promise<boolean>;
  syncFromHmrState(restored?: any): void;
  refreshAfterConfigChange(reason?: string, options?: any): Promise<void>;
}