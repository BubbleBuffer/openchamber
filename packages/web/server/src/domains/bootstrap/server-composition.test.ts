import { describe, expect, it, vi } from "vitest";

import { createServerComposition } from "./server-composition.js";
import { createStartupPipelineRuntime } from "./startup-pipeline.js";

type FakeOpenCodeRuntime = {
  getPort: () => number;
  triggerHealthCheck: () => void;
};

function createPipelineRunOptions(overrides: Record<string, unknown> = {}) {
  const openCodeRuntimeRef: { current: FakeOpenCodeRuntime | null } = { current: null };
  const openCodeRuntime = new Proxy(openCodeRuntimeRef, {
    get(target, property) {
      if (property === "current") return target.current;
      const runtime = target.current;
      const value = (runtime as Record<PropertyKey, unknown> | null)?.[property];
      return typeof value === "function" ? value.bind(runtime) : value;
    },
  }) as unknown as FakeOpenCodeRuntime;
  const signals = { attached: false };
  const startupRuntime = {
    resolveBindHost: vi.fn(() => "127.0.0.1"),
    startListening: vi.fn(async () => ({ activePort: 32001 })),
    attachProcessHandlers: vi.fn(),
  };
  const terminalRuntime = { shutdown: vi.fn(async () => undefined) };
  const messageStreamRuntime = { close: vi.fn(async () => undefined) };
  const bootstrapOpenCodeAtStartup = vi.fn(async () => {
    openCodeRuntimeRef.current = {
      getPort: () => 43123,
      triggerHealthCheck: vi.fn(),
    };
  });

  const options = {
    app: {},
    server: {},
    express: {},
    fs: {},
    path: {},
    uiAuthController: {},
    buildAugmentedPath: vi.fn(() => "augmented-path"),
    searchPathFor: vi.fn(),
    isExecutable: vi.fn(),
    isRequestOriginAllowed: vi.fn(),
    rejectWebSocketUpgrade: vi.fn(),
    openCodeRuntime,
    globalEventHub: {},
    processForwardedEventPayload: vi.fn(),
    messageStreamWsClients: new Set(),
    triggerHealthCheck: vi.fn(),
    terminalHeartbeatIntervalMs: 15_000,
    terminalRebindWindowMs: 60_000,
    terminalMaxRebindsPerWindow: 128,
    setupProxy: vi.fn(),
    scheduleOpenCodeApiDetection: vi.fn(),
    bootstrapOpenCodeAtStartup,
    staticRoutesRuntime: { registerStaticRoutes: vi.fn() },
    process,
    crypto: {},
    readSettingsFromDiskMigrated: vi.fn(),
    gracefulShutdown: vi.fn(),
    getSignalsAttached: () => signals.attached,
    setSignalsAttached: (value: boolean) => {
      signals.attached = value;
    },
    syncToHmrState: vi.fn(),
    host: undefined,
    port: 0,
    attachSignals: false,
    ...overrides,
  };

  return {
    options,
    openCodeRuntime,
    openCodeRuntimeRef,
    startupRuntime,
    terminalRuntime,
    messageStreamRuntime,
    bootstrapOpenCodeAtStartup,
    signals,
  };
}

describe("server composition characterization", () => {
  it.each([
    { label: "restored external", isExternalOpenCode: true, shouldKill: false },
    { label: "restored managed", isExternalOpenCode: false, shouldKill: true },
  ])("does not kill port 4096 for $label OpenCode state", async ({ isExternalOpenCode, shouldKill }) => {
    const openCodeState = {
      openCodeProcess: null,
      openCodePort: 4096,
      openCodeBaseUrl: null,
      isExternalOpenCode: false,
      isShuttingDown: false,
      healthCheckInterval: null,
      openCodeWorkingDirectory: "/tmp",
      openCodeAuthPassword: null,
      openCodeAuthSource: null,
    };
    const openCodeDomain = {
      getState: vi.fn(() => openCodeState),
      getPort: vi.fn(() => openCodeState.openCodePort),
      getProcess: vi.fn(() => openCodeState.openCodeProcess),
      isExternal: vi.fn(() => openCodeState.isExternalOpenCode),
      setShuttingDown: vi.fn((value: boolean) => {
        openCodeState.isShuttingDown = value;
      }),
      getIsShuttingDown: vi.fn(() => openCodeState.isShuttingDown),
      clearProcess: vi.fn(),
      killProcessOnPort: vi.fn(),
      waitForPortRelease: vi.fn(async () => true),
    };
    const globalThisLike = {
      __openchamberHmrState: {
        openCodeProcess: null,
        openCodePort: 4096,
        openCodeBaseUrl: null,
        isExternalOpenCode,
        isShuttingDown: false,
        openCodeWorkingDirectory: "/tmp",
        openCodeAuthPassword: null,
        openCodeAuthSource: null,
      },
    } as unknown as typeof globalThis;
    const composition = createServerComposition({
      createOpenCodeDomain: vi.fn(async () => openCodeDomain) as unknown as typeof import("../opencode/index.js").createOpenCodeDomain,
      processLike: process,
      env: {},
      globalThisLike,
    });

    await composition.ensureOpenCodeDomain();
    composition.syncFromHmrState();
    await composition.gracefulShutdown({ exitProcess: false });

    if (shouldKill) {
      expect(openCodeDomain.killProcessOnPort).toHaveBeenCalledWith(4096);
    } else {
      expect(openCodeDomain.killProcessOnPort).not.toHaveBeenCalled();
    }
  });

  it("owns one late-bound OpenCode proxy and memoizes lazy domain creation", async () => {
    const openCodeDomain = {
      getPort: vi.fn(() => 43123),
      triggerHealthCheck: vi.fn(),
      getState: vi.fn(() => ({
        isShuttingDown: false,
        healthCheckInterval: null,
      })),
    };
    const createOpenCodeDomain = vi.fn(async () => openCodeDomain);
    const composition = createServerComposition({
      createOpenCodeDomain:
        createOpenCodeDomain as unknown as typeof import("../opencode/index.js").createOpenCodeDomain,
      processLike: process,
      env: {},
    });

    expect(composition.state).toMatchObject({
      signalsAttached: false,
      server: null,
      expressApp: null,
      uiAuthController: null,
      terminalRuntime: null,
      messageStreamRuntime: null,
      exitOnShutdown: true,
      globalWatcherStartPromise: null,
    });
    expect(composition.openCodeRuntime).toBe(composition.openCodeRuntime);
    expect(composition.openCodeRuntime.current).toBeNull();
    expect(createOpenCodeDomain).not.toHaveBeenCalled();

    const firstDomain = await composition.ensureOpenCodeDomain();
    const secondDomain = await composition.ensureOpenCodeDomain();

    expect(firstDomain).toBe(openCodeDomain);
    expect(secondDomain).toBe(firstDomain);
    expect(createOpenCodeDomain).toHaveBeenCalledOnce();
    expect(composition.openCodeRuntime.current).toBe(openCodeDomain);
    expect(composition.openCodeRuntime.getPort()).toBe(43123);
    expect(composition.triggerHealthCheck).toEqual(expect.any(Function));
    composition.triggerHealthCheck();
    expect(openCodeDomain.triggerHealthCheck).toHaveBeenCalledOnce();
  });

  it("does not publish a failed lazy domain and permits a retry", async () => {
    const openCodeDomain = {
      getPort: vi.fn(() => 43124),
    };
    let attempts = 0;
    const createOpenCodeDomain = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("domain construction failed");
      return openCodeDomain;
    });
    const composition = createServerComposition({
      createOpenCodeDomain:
        createOpenCodeDomain as unknown as typeof import("../opencode/index.js").createOpenCodeDomain,
      processLike: process,
      env: {},
    });

    await expect(composition.ensureOpenCodeDomain()).rejects.toThrow("domain construction failed");
    expect(composition.openCodeRuntime.current).toBeNull();

    await expect(composition.ensureOpenCodeDomain()).resolves.toBe(openCodeDomain);
    expect(createOpenCodeDomain).toHaveBeenCalledTimes(2);
    expect(composition.openCodeRuntime.getPort()).toBe(43124);
  });

  it("keeps late-bound OpenCode references and stable lifecycle callbacks", async () => {
    const harness = createPipelineRunOptions();
    const createTerminalRuntime = vi.fn(() => harness.terminalRuntime);
    const createMessageStreamWsRuntime = vi.fn(() => harness.messageStreamRuntime);
    const createServerStartupRuntime = vi.fn((
      deps: Record<string, unknown>,
    ) => {
      void deps;
      return harness.startupRuntime;
    });
    const pipeline = createStartupPipelineRuntime({
      createTerminalRuntime,
      createMessageStreamWsRuntime,
      createServerStartupRuntime,
    });

    await pipeline.run(harness.options);

    expect(createMessageStreamWsRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ openCodeRuntime: harness.openCodeRuntime }),
    );
    expect(harness.bootstrapOpenCodeAtStartup).toHaveBeenCalledOnce();
    expect(harness.openCodeRuntime.getPort()).toBe(43123);

    const startupDeps = createServerStartupRuntime.mock.calls[0]?.[0] as unknown as {
      getSignalsAttached: () => boolean;
      setSignalsAttached: (value: boolean) => void;
    };
    expect(startupDeps.getSignalsAttached()).toBe(false);
    startupDeps.setSignalsAttached(true);
    expect(harness.signals.attached).toBe(true);
    expect(startupDeps.getSignalsAttached()).toBe(true);
  });

  it("wires required dependencies and can be reused for sequential runs", async () => {
    const harness = createPipelineRunOptions();
    const terminalRuntimes = [
      { shutdown: vi.fn(async () => undefined) },
      { shutdown: vi.fn(async () => undefined) },
    ];
    const messageRuntimes = [
      { close: vi.fn(async () => undefined) },
      { close: vi.fn(async () => undefined) },
    ];
    const createTerminalRuntime = vi
      .fn()
      .mockReturnValueOnce(terminalRuntimes[0])
      .mockReturnValueOnce(terminalRuntimes[1]);
    const createMessageStreamWsRuntime = vi
      .fn()
      .mockReturnValueOnce(messageRuntimes[0])
      .mockReturnValueOnce(messageRuntimes[1]);
    const createServerStartupRuntime = vi.fn(() => harness.startupRuntime);
    const pipeline = createStartupPipelineRuntime({
      createTerminalRuntime,
      createMessageStreamWsRuntime,
      createServerStartupRuntime,
    });

    const firstResult = await pipeline.run(harness.options);
    const secondResult = await pipeline.run({ ...harness.options, app: {}, server: {}, port: 0 });

    expect(createTerminalRuntime).toHaveBeenCalledTimes(2);
    expect(createMessageStreamWsRuntime).toHaveBeenCalledTimes(2);
    expect(createServerStartupRuntime).toHaveBeenCalledTimes(2);
    expect(firstResult.terminalRuntime).toBe(terminalRuntimes[0]);
    expect(firstResult.messageStreamRuntime).toBe(messageRuntimes[0]);
    expect(secondResult.terminalRuntime).toBe(terminalRuntimes[1]);
    expect(secondResult.messageStreamRuntime).toBe(messageRuntimes[1]);
    expect(createMessageStreamWsRuntime.mock.calls[0]?.[0].openCodeRuntime).toBe(
      harness.openCodeRuntime,
    );
    expect(createMessageStreamWsRuntime.mock.calls[1]?.[0].openCodeRuntime).toBe(
      harness.openCodeRuntime,
    );
    expect(harness.bootstrapOpenCodeAtStartup).toHaveBeenCalledTimes(2);
  });
});
