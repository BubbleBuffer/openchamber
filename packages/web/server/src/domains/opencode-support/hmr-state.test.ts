import { describe, expect, it } from "vitest";
import os from "node:os";

import { createHmrStateRuntime } from "./hmr-state.js";

describe("HMR OpenCode state", () => {
  it("persists and restores external OpenCode ownership", () => {
    const runtime = createHmrStateRuntime({
      globalThisLike: {} as typeof globalThis,
      os,
      processLike: process,
      stateKey: "__testOpenChamberHmrState",
    });
    const hmrState = runtime.getOrCreateHmrState();

    runtime.syncStateFromRuntime(hmrState, {
      openCodeProcess: null,
      openCodePort: 4096,
      openCodeBaseUrl: null,
      isExternalOpenCode: true,
      isShuttingDown: false,
      signalsAttached: false,
      openCodeWorkingDirectory: "/tmp",
      openCodeAuthPassword: null,
      openCodeAuthSource: null,
    });

    const restored = runtime.restoreRuntimeFromState({
      hmrState,
      userProvidedOpenCodePassword: null,
    });

    expect(hmrState.isExternalOpenCode).toBe(true);
    expect(restored.isExternalOpenCode).toBe(true);
  });
});
