/* eslint-disable @typescript-eslint/no-explicit-any */

import type { OpenCodeDomainDeps, OpenCodeDomain } from "./types.js";

export async function createOpenCodeDomain(deps: OpenCodeDomainDeps): Promise<OpenCodeDomain> {
  const { eventBus } = deps;

  const config = {
    env: deps.env,
    syncToHmrState: deps.syncToHmrState,
    syncFromHmrState: deps.syncFromHmrState,
    applyOpencodeBinaryFromSettings: deps.applyOpencodeBinaryFromSettings,
    ensureOpencodeCliEnv: deps.ensureOpencodeCliEnv,
    buildWslExecArgs: deps.buildWslExecArgs,
    resolveWslExecutablePath: deps.resolveWslExecutablePath,
    resolveManagedOpenCodeLaunchSpec: deps.resolveManagedOpenCodeLaunchSpec,
    clearResolvedOpenCodeBinary: deps.clearResolvedOpenCodeBinary,
    normalizeApiPrefix: deps.normalizeApiPrefix,
    userProvidedPassword: deps.userProvidedPassword,
    buildAugmentedPath: deps.getBuildAugmentedPath ? deps.getBuildAugmentedPath() : "",
    buildManagedOpenCodePath: deps.getBuildManagedOpenCodePath ? deps.getBuildManagedOpenCodePath() : "",
    setupProxy: (app: any) => {
      const sr = deps.getServerUtilsRuntime?.();
      if (sr && app) sr.setupProxy(app);
    },
  };

  // @ts-expect-error — old JS runtime, fully typed wrapper will come in Stage 5/6
  const { createOpenCodeRuntime } = await import("../../lib/opencode/runtime.js");
  const runtime = createOpenCodeRuntime({ eventBus, config });

  return {
    runtime,

    getUrl(path?: string, search?: string) { return runtime.getUrl(path, search); },
    getAuthHeaders() { return runtime.getAuthHeaders(); },
    isReady() { return runtime.isReady(); },
    isRestarting() { return runtime.isRestarting(); },
    getPort() { return runtime.getPort(); },
    setApp(app) { runtime.setApp(app); },
    async init() { return runtime.init(); },
    async restart() { return runtime.restart(); },
    startHealthMonitoring(ms: number) { runtime.startHealthMonitoring(ms); },
    stopHealthMonitoring() { runtime.stopHealthMonitoring(); },
    triggerHealthCheck() { runtime.triggerHealthCheck(); },
    async waitForReady(t?: number, i?: number) { return runtime.waitForReady(t, i); },
    async waitForAgentPresence(name: string, t?: number, i?: number) { return runtime.waitForAgentPresence(name, t, i); },
    setShuttingDown(v: boolean) { runtime.setShuttingDown(v); },
    getIsShuttingDown() { return runtime.getIsShuttingDown(); },
    isExternal() { return runtime.isExternal(); },
    getProcess() { return runtime.getProcess(); },
    clearProcess() { runtime.clearProcess(); },
    getOpenCodeAuthSource() { return runtime.getOpenCodeAuthSource(); },
    isConnectionSecure() { return runtime.isConnectionSecure(); },
    getLastError() { return runtime.getLastError(); },
    getNotReadySince() { return runtime.getNotReadySince(); },
    getHealthCheckInterval() { return runtime.getHealthCheckInterval(); },
    getWorkingDirectory() { return runtime.getWorkingDirectory(); },
    setWorkingDirectory(dir: string) { runtime.setWorkingDirectory(dir); },
    getAuthPassword() { return runtime.getAuthPassword(); },
    getState() { return runtime.getState(); },
    killProcessOnPort(port: number) { runtime.killProcessOnPort?.(port); },
    async waitForPortRelease(port: number, t?: number) { return runtime.waitForPortRelease?.(port, t); },
    syncFromHmrState(r?: any) { runtime.syncFromHmrState?.(r); },
    async refreshAfterConfigChange(reason?: string, opts?: any) { return runtime.refreshAfterConfigChange?.(reason, opts); },
  };
}