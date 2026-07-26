import { describe, expect, it, vi } from "vitest";

import { createStartupPipelineRuntime } from "./startup-pipeline.js";
import { createServerStartupRuntime } from "./server-startup.js";

function createHarness() {
  const order: string[] = [];
  let bootstrapResolve!: () => void;
  const bootstrapPromise = new Promise<void>((resolve) => {
    bootstrapResolve = resolve;
  });
  const terminalRuntime = {
    shutdown: vi.fn(async () => {
      order.push("terminal.shutdown");
    }),
  };
  const messageStreamRuntime = {
    close: vi.fn(async () => {
      order.push("message.close");
    }),
  };
  const server = {
    close: vi.fn((callback: () => void) => {
      order.push("server.close");
      callback();
    }),
  };
  const openCodeRuntime = {
    getProcess: vi.fn((): { close: () => Promise<void> } | null => null),
    getPort: vi.fn((): number | null => null),
    isExternal: vi.fn(() => false),
    clearProcess: vi.fn(),
    killProcessOnPort: vi.fn(),
    waitForPortRelease: vi.fn(async () => true),
  };
  const handlersDisposer = vi.fn(() => {
    order.push("handlers.dispose");
  });
  const startupRuntime = {
    resolveBindHost: vi.fn(() => {
      order.push("bind-host");
      return "127.0.0.1";
    }),
    startListening: vi.fn(async () => {
      order.push("listen");
      return { activePort: 32001 };
    }),
    attachProcessHandlers: vi.fn(() => {
      order.push("handlers.attach");
      return handlersDisposer;
    }),
  };

  const createTerminalRuntime = vi.fn(() => {
      order.push("terminal.create");
      return terminalRuntime;
    });
  const createMessageStreamWsRuntime = vi.fn(() => {
      order.push("message.create");
      return messageStreamRuntime;
    });
  const createServerStartupRuntime = vi.fn(() => {
      order.push("startup-runtime.create");
      return startupRuntime;
    });
  const pipeline = createStartupPipelineRuntime({
    createTerminalRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  });

  return {
    order,
    pipeline,
    server,
    terminalRuntime,
    messageStreamRuntime,
    handlersDisposer,
    bootstrapResolve,
    bootstrapPromise,
    openCodeRuntime,
    startupRuntime,
    createTerminalRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  };
}

function createOptions(harness: ReturnType<typeof createHarness>) {
  return {
    app: {},
    server: harness.server,
    express: {},
    fs: {},
    path: {},
    uiAuthController: {},
    buildAugmentedPath: vi.fn(),
    searchPathFor: vi.fn(),
    isExecutable: vi.fn(),
    isRequestOriginAllowed: vi.fn(),
    rejectWebSocketUpgrade: vi.fn(),
    openCodeRuntime: harness.openCodeRuntime,
    globalEventHub: {},
    processForwardedEventPayload: vi.fn(),
    messageStreamWsClients: new Set(),
    triggerHealthCheck: vi.fn(),
    terminalHeartbeatIntervalMs: 15_000,
    terminalRebindWindowMs: 60_000,
    terminalMaxRebindsPerWindow: 128,
    setupProxy: vi.fn(() => {
      harness.order.push("proxy");
    }),
    scheduleOpenCodeApiDetection: vi.fn(() => {
      harness.order.push("api-detection");
    }),
    bootstrapOpenCodeAtStartup: vi.fn(() => {
      harness.order.push("opencode-bootstrap");
      return harness.bootstrapPromise;
    }),
    staticRoutesRuntime: {
      registerStaticRoutes: vi.fn(() => {
        harness.order.push("static-routes");
      }),
    },
    process,
    crypto: {},
    readSettingsFromDiskMigrated: vi.fn(),
    gracefulShutdown: vi.fn(),
    isOpenCodeProcessOwnedByRun: vi.fn(() => true),
    stopOpenCodeWatcher: vi.fn(),
    resetGlobalWatcherStartPromise: vi.fn(),
    getSignalsAttached: vi.fn(() => false),
    setSignalsAttached: vi.fn(),
    syncToHmrState: vi.fn(),
    host: undefined,
    port: 0,
    attachSignals: false,
  };
}

describe("startup pipeline", () => {
  it("owns and disposes exactly one process-handler set per run", () => {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
    const fakeProcess = {
      env: {},
      on(event: string, handler: (...args: unknown[]) => void) {
        const listeners = handlers.get(event) ?? new Set();
        listeners.add(handler);
        handlers.set(event, listeners);
        return this;
      },
      off(event: string, handler: (...args: unknown[]) => void) {
        handlers.get(event)?.delete(handler);
        return this;
      },
      listenerCount(event: string) {
        return handlers.get(event)?.size ?? 0;
      },
    } as unknown as typeof process;
    let signalsAttached = false;
    const runtime = createServerStartupRuntime({
      process: fakeProcess,
      crypto: {} as never,
      server: {},
      readSettingsFromDiskMigrated: vi.fn(),
      gracefulShutdown: vi.fn(async () => undefined),
      getSignalsAttached: () => signalsAttached,
      setSignalsAttached: (value) => {
        signalsAttached = value;
      },
      syncToHmrState: vi.fn(),
    });

    const firstDisposer = runtime.attachProcessHandlers({ attachSignals: true });
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(1);
    expect(fakeProcess.listenerCount("SIGINT")).toBe(1);
    expect(fakeProcess.listenerCount("SIGQUIT")).toBe(1);
    expect(fakeProcess.listenerCount("unhandledRejection")).toBe(1);
    expect(fakeProcess.listenerCount("uncaughtException")).toBe(1);
    expect(signalsAttached).toBe(true);

    firstDisposer();
    firstDisposer();
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(0);
    expect(fakeProcess.listenerCount("SIGINT")).toBe(0);
    expect(fakeProcess.listenerCount("SIGQUIT")).toBe(0);
    expect(fakeProcess.listenerCount("unhandledRejection")).toBe(0);
    expect(fakeProcess.listenerCount("uncaughtException")).toBe(0);
    expect(signalsAttached).toBe(false);

    const secondDisposer = runtime.attachProcessHandlers({ attachSignals: true });
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(1);
    secondDisposer();
    expect(fakeProcess.listenerCount("SIGTERM")).toBe(0);
    expect(signalsAttached).toBe(false);
  });

  it("preserves startup order and returns per-run handler ownership", async () => {
    const harness = createHarness();
    const resultPromise = harness.pipeline.run(createOptions(harness));

    const result = await resultPromise;
    expect(harness.order).toEqual([
      "terminal.create",
      "message.create",
      "proxy",
      "api-detection",
      "opencode-bootstrap",
      "static-routes",
      "startup-runtime.create",
      "bind-host",
      "listen",
      "handlers.attach",
    ]);
    expect(result.disposeProcessHandlers).toBe(harness.handlersDisposer);
    harness.bootstrapResolve();
    await harness.bootstrapPromise;
  });

  it("rolls back created resources and observes bootstrap failure", async () => {
    const harness = createHarness();
    const bootstrapFailure = new Error("OpenCode bootstrap failed");
    const options = createOptions(harness);
    options.bootstrapOpenCodeAtStartup = vi.fn(() => {
      harness.order.push("opencode-bootstrap");
      return Promise.reject(bootstrapFailure);
    });
    options.staticRoutesRuntime.registerStaticRoutes = vi.fn(() => {
      harness.order.push("static-routes");
      throw bootstrapFailure;
    });

    await expect(harness.pipeline.run(options)).rejects.toBe(bootstrapFailure);
    expect(harness.terminalRuntime.shutdown).toHaveBeenCalledOnce();
    expect(harness.messageStreamRuntime.close).toHaveBeenCalledOnce();
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.order).toContain("terminal.shutdown");
    expect(harness.order).toContain("message.close");
  });

  it("cleans a managed OpenCode process that appears after rollback begins", async () => {
    const harness = createHarness();
    const managedProcess = { close: vi.fn(async () => undefined) };
    let releaseBootstrap!: () => void;
    let currentProcess: typeof managedProcess | null = null;
    harness.openCodeRuntime.getProcess.mockImplementation(() => currentProcess);
    harness.openCodeRuntime.getPort.mockReturnValue(43123);
    const options = createOptions(harness);
    options.bootstrapOpenCodeAtStartup = vi.fn(
      () => new Promise<void>((resolve) => {
        releaseBootstrap = () => {
          currentProcess = managedProcess;
          resolve();
        };
      }),
    );
    options.staticRoutesRuntime.registerStaticRoutes = vi.fn(() => {
      throw new Error("static routes failed");
    });

    await expect(harness.pipeline.run(options)).rejects.toThrow("static routes failed");
    expect(managedProcess.close).not.toHaveBeenCalled();
    releaseBootstrap();
    await vi.waitFor(() => {
      expect(managedProcess.close).toHaveBeenCalledOnce();
      expect(harness.openCodeRuntime.clearProcess).toHaveBeenCalledOnce();
    });
  });

  it("does not close an HMR-reused OpenCode process during rollback", async () => {
    const harness = createHarness();
    const reusedProcess = { close: vi.fn(async () => undefined) };
    let releaseBootstrap!: () => void;
    let currentProcess: typeof reusedProcess | null = null;
    harness.openCodeRuntime.getProcess.mockImplementation(() => currentProcess);
    const options = createOptions(harness);
    options.isOpenCodeProcessOwnedByRun = vi.fn(() => false);
    options.stopOpenCodeWatcher = vi.fn();
    options.resetGlobalWatcherStartPromise = vi.fn();
    options.bootstrapOpenCodeAtStartup = vi.fn(
      () => new Promise<void>((resolve) => {
        releaseBootstrap = () => {
          currentProcess = reusedProcess;
          resolve();
        };
      }),
    );
    options.staticRoutesRuntime.registerStaticRoutes = vi.fn(() => {
      throw new Error("static routes failed");
    });

    await expect(harness.pipeline.run(options)).rejects.toThrow("static routes failed");
    releaseBootstrap();
    await vi.waitFor(() => expect(options.isOpenCodeProcessOwnedByRun).toHaveBeenCalledOnce());
    expect(reusedProcess.close).not.toHaveBeenCalled();
    expect(options.stopOpenCodeWatcher).toHaveBeenCalled();
    expect(options.resetGlobalWatcherStartPromise).toHaveBeenCalled();
  });

  it("does not kill a restored external OpenCode process during rollback", async () => {
    const harness = createHarness();
    const externalProcess = { close: vi.fn(async () => undefined) };
    harness.openCodeRuntime.getProcess.mockReturnValue(externalProcess);
    harness.openCodeRuntime.getPort.mockReturnValue(4096);
    harness.openCodeRuntime.isExternal.mockReturnValue(true);
    const options = createOptions(harness);
    options.staticRoutesRuntime.registerStaticRoutes = vi.fn(() => {
      throw new Error("static routes failed");
    });

    await expect(harness.pipeline.run(options)).rejects.toThrow("static routes failed");
    expect(externalProcess.close).not.toHaveBeenCalled();
    expect(harness.openCodeRuntime.killProcessOnPort).not.toHaveBeenCalled();
  });

  it.each([
    ["terminal creation", "terminal"],
    ["message-stream creation", "message"],
    ["proxy setup", "proxy"],
    ["API detection scheduling", "api-detection"],
    ["static route registration", "static-routes"],
    ["startup runtime creation", "startup-create"],
    ["bind-host resolution", "bind-host"],
    ["HTTP listen", "listen"],
    ["process-handler attachment", "handlers.attach"],
  ])("rolls back when %s fails", async (_stage, failureStage) => {
    const harness = createHarness();
    const failure = new Error(`${failureStage} failed`);
    const options = createOptions(harness);

    if (failureStage === "terminal") {
      harness.createTerminalRuntime.mockImplementationOnce(() => {
        throw failure;
      });
    } else if (failureStage === "message") {
      harness.createMessageStreamWsRuntime.mockImplementationOnce(() => {
        throw failure;
      });
    } else if (failureStage === "proxy") {
      options.setupProxy = vi.fn(() => {
        throw failure;
      });
    } else if (failureStage === "api-detection") {
      options.scheduleOpenCodeApiDetection = vi.fn(() => {
        throw failure;
      });
    } else if (failureStage === "static-routes") {
      options.staticRoutesRuntime.registerStaticRoutes = vi.fn(() => {
        throw failure;
      });
    } else if (failureStage === "startup-create") {
      harness.createServerStartupRuntime.mockImplementationOnce(() => {
        throw failure;
      });
    } else if (failureStage === "bind-host") {
      harness.startupRuntime.resolveBindHost.mockImplementationOnce(() => {
        throw failure;
      });
    } else if (failureStage === "listen") {
      harness.startupRuntime.startListening.mockImplementationOnce(async () => {
        throw failure;
      });
    } else {
      harness.startupRuntime.attachProcessHandlers.mockImplementationOnce(() => {
        throw failure;
      });
    }

    await expect(harness.pipeline.run(options)).rejects.toBe(failure);
    expect(harness.server.close).toHaveBeenCalledOnce();
    if (failureStage !== "terminal") {
      expect(harness.terminalRuntime.shutdown).toHaveBeenCalledOnce();
    }
    if (["static-routes", "startup-create", "bind-host", "listen", "handlers.attach"].includes(failureStage)) {
      expect(harness.messageStreamRuntime.close).toHaveBeenCalledOnce();
    }
  });
});
