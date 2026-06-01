/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HmrState, HmrStateRuntime, HmrStateRuntimeDeps } from "./types.js";

export function createHmrStateRuntime(deps: HmrStateRuntimeDeps): HmrStateRuntime {
  const { globalThisLike, os, processLike, stateKey } = deps;

  const g = globalThisLike as any;
  if (!g[stateKey]) {
    g[stateKey] = {
      openCodeProcess: null,
      openCodePort: null,
      openCodeWorkingDirectory: os.homedir(),
      isShuttingDown: false,
      signalsAttached: false,
      userProvidedOpenCodePassword: undefined,
      openCodeAuthPassword: null,
      openCodeAuthSource: null,
    };
  }
  const store = g[stateKey] as HmrState;

  function getOrCreateHmrState(): HmrState {
    return store;
  }

  function ensureUserProvidedOpenCodePassword(hmrState: HmrState): void {
    if (typeof hmrState.userProvidedOpenCodePassword !== "undefined") {
      return;
    }
    const initialPassword = typeof processLike.env.OPENCODE_SERVER_PASSWORD === "string"
      ? processLike.env.OPENCODE_SERVER_PASSWORD.trim()
      : "";
    hmrState.userProvidedOpenCodePassword = initialPassword || null;
  }

  function getUserProvidedOpenCodePassword(hmrState: HmrState): string | null {
    return typeof hmrState.userProvidedOpenCodePassword === "string" && hmrState.userProvidedOpenCodePassword.length > 0
      ? hmrState.userProvidedOpenCodePassword
      : null;
  }

  function resolveOpenCodeAuthFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any {
    const { hmrState, userProvidedOpenCodePassword } = args;
    return {
      openCodeAuthPassword:
        typeof hmrState.openCodeAuthPassword === "string" && hmrState.openCodeAuthPassword.length > 0
          ? hmrState.openCodeAuthPassword
          : userProvidedOpenCodePassword,
      openCodeAuthSource:
        typeof hmrState.openCodeAuthSource === "string" && hmrState.openCodeAuthSource.length > 0
          ? hmrState.openCodeAuthSource
          : (userProvidedOpenCodePassword ? "user-env" : null),
    };
  }

  function syncStateFromRuntime(hmrState: HmrState, runtime: any): void {
    hmrState.openCodeProcess = runtime.openCodeProcess;
    hmrState.openCodePort = runtime.openCodePort;
    hmrState.openCodeBaseUrl = runtime.openCodeBaseUrl;
    hmrState.isShuttingDown = runtime.isShuttingDown;
    hmrState.signalsAttached = runtime.signalsAttached;
    hmrState.openCodeWorkingDirectory = runtime.openCodeWorkingDirectory;
    hmrState.openCodeAuthPassword = runtime.openCodeAuthPassword;
    hmrState.openCodeAuthSource = runtime.openCodeAuthSource;
  }

  function restoreRuntimeFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any {
    const { hmrState, userProvidedOpenCodePassword } = args;
    const auth = resolveOpenCodeAuthFromState({ hmrState, userProvidedOpenCodePassword });
    return {
      openCodeProcess: hmrState.openCodeProcess,
      openCodePort: hmrState.openCodePort,
      openCodeBaseUrl: hmrState.openCodeBaseUrl ?? null,
      isShuttingDown: hmrState.isShuttingDown,
      signalsAttached: hmrState.signalsAttached,
      openCodeWorkingDirectory: hmrState.openCodeWorkingDirectory,
      openCodeAuthPassword: auth.openCodeAuthPassword,
      openCodeAuthSource: auth.openCodeAuthSource,
    };
  }

  return {
    getOrCreateHmrState,
    ensureUserProvidedOpenCodePassword,
    getUserProvidedOpenCodePassword,
    resolveOpenCodeAuthFromState,
    syncStateFromRuntime,
    restoreRuntimeFromState,
  };
}