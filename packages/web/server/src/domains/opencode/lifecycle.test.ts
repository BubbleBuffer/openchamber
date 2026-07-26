import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  spawnSync: vi.fn(),
}));

import { createOpenCodeLifecycleRuntime } from "./lifecycle.js";

describe("OpenCode lifecycle", () => {
  it("clears restored external ownership before managed startup", async () => {
    let externalFlagAtSpawn: boolean | undefined;
    const lifecycleEvents: string[] = [];
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      exitCode: null,
      signalCode: null,
      pid: 1234,
      kill: vi.fn(),
    });
    spawnMock.mockImplementationOnce(() => {
      lifecycleEvents.push("spawn");
      externalFlagAtSpawn = state.isExternalOpenCode;
      queueMicrotask(() => {
        child.stdout.emit(
          "data",
          Buffer.from("opencode server listening on http://127.0.0.1:4096\n"),
        );
      });
      return child;
    });

    const state = {
      openCodeProcess: null as object | null,
      openCodePort: null as number | null,
      openCodeBaseUrl: null,
      openCodeWorkingDirectory: "/tmp",
      isOpenCodeReady: false,
      isRestartingOpenCode: false,
      isExternalOpenCode: false as boolean,
      isShuttingDown: false,
      openCodeNotReadySince: 0,
      lastOpenCodeError: null,
      openCodeApiPrefix: "",
      openCodeApiPrefixDetected: true,
      openCodeApiDetectionTimer: null,
      currentRestartPromise: null,
      healthCheckInterval: null,
      expressApp: null,
      useWslForOpencode: false,
    };
    const syncToHmrState = vi.fn(() => {
      lifecycleEvents.push("sync");
    });
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/global/health")) {
        return { ok: false } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    });

    const runtime = createOpenCodeLifecycleRuntime({
      state,
      env: {
        ENV_SKIP_OPENCODE_START: false,
        ENV_EFFECTIVE_PORT: 4096,
        ENV_CONFIGURED_OPENCODE_HOST: null,
        ENV_CONFIGURED_OPENCODE_PORT: 4096,
        ENV_CONFIGURED_OPENCODE_HOSTNAME: "127.0.0.1",
      },
      syncToHmrState,
      syncFromHmrState: () => {
        state.isExternalOpenCode = true;
      },
      getOpenCodeAuthHeaders: () => ({}),
      buildOpenCodeUrl: (path: string) => `http://127.0.0.1:4096${path}`,
      waitForReady: vi.fn(async () => true),
      normalizeApiPrefix: () => "",
      applyOpencodeBinaryFromSettings: vi.fn(async () => undefined),
      ensureOpencodeCliEnv: vi.fn(),
      ensureLocalOpenCodeServerPassword: vi.fn(async () => "password"),
      buildWslExecArgs: vi.fn(),
      resolveWslExecutablePath: vi.fn(),
      resolveManagedOpenCodeLaunchSpec: vi.fn(),
      setOpenCodePort: (port: number) => {
        state.openCodePort = port;
      },
      setDetectedOpenCodeApiPrefix: vi.fn(),
      setupProxy: vi.fn(),
      ensureOpenCodeApiPrefix: vi.fn(),
      clearResolvedOpenCodeBinary: vi.fn(),
      buildAugmentedPath: vi.fn(() => process.env.PATH),
      buildManagedOpenCodePath: vi.fn(() => process.env.PATH),
    });

    vi.stubGlobal("fetch", fetchMock);
    try {
      await runtime.bootstrapOpenCodeAtStartup();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(state.openCodeProcess).not.toBeNull();
    expect(externalFlagAtSpawn).toBe(false);
    expect(lifecycleEvents.indexOf("sync")).toBeLessThan(lifecycleEvents.indexOf("spawn"));
    expect(state.isExternalOpenCode).toBe(false);
    expect(syncToHmrState).toHaveBeenCalled();
  });
});
