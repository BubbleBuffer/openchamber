import { describe, expect, it, vi } from "vitest";

import { createGracefulShutdownRuntime } from "./shutdown-runtime.js";

describe("graceful shutdown", () => {
  it("disposes the injected notification runtime", async () => {
    let shuttingDown = false;
    const notificationRuntime = { dispose: vi.fn() };
    const runtime = createGracefulShutdownRuntime({
      process,
      shutdownTimeoutMs: 1,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => shuttingDown,
      setIsShuttingDown: (value) => {
        shuttingDown = value;
      },
      syncToHmrState: vi.fn(),
      openCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
      notificationRuntime,
      scheduledTasksRuntime: { stop: vi.fn() },
      getHealthCheckInterval: () => null,
      clearHealthCheckInterval: vi.fn(),
      getTerminalRuntime: () => null,
      setTerminalRuntime: vi.fn(),
      getMessageStreamRuntime: () => null,
      setMessageStreamRuntime: vi.fn(),
      shouldSkipOpenCodeStop: () => true,
      getOpenCodeRuntime: () => null,
      killProcessOnPort: vi.fn(),
      waitForPortRelease: vi.fn(async () => true),
      getServer: () => null,
      getUiAuthController: () => null,
      setUiAuthController: vi.fn(),
      serverSessionMachineBridge: null,
      sessionActorRegistry: null,
      sessionEffectExecutor: null,
    });

    await runtime.gracefulShutdown({ exitProcess: false });
    await runtime.gracefulShutdown({ exitProcess: false });

    expect(notificationRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("shares the in-flight shutdown promise with concurrent callers", async () => {
    let shuttingDown = false;
    let resolveTerminalShutdown!: () => void;
    const terminalShutdown = new Promise<void>((resolve) => {
      resolveTerminalShutdown = resolve;
    });
    const runtime = createGracefulShutdownRuntime({
      process,
      shutdownTimeoutMs: 1,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => shuttingDown,
      setIsShuttingDown: (value) => {
        shuttingDown = value;
      },
      syncToHmrState: vi.fn(),
      openCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
      scheduledTasksRuntime: { stop: vi.fn() },
      getHealthCheckInterval: () => null,
      clearHealthCheckInterval: vi.fn(),
      getTerminalRuntime: () => ({ shutdown: () => terminalShutdown }),
      setTerminalRuntime: vi.fn(),
      getMessageStreamRuntime: () => null,
      setMessageStreamRuntime: vi.fn(),
      shouldSkipOpenCodeStop: () => true,
      getOpenCodeRuntime: () => null,
      killProcessOnPort: vi.fn(),
      waitForPortRelease: vi.fn(async () => true),
      getServer: () => null,
      getUiAuthController: () => null,
      setUiAuthController: vi.fn(),
      serverSessionMachineBridge: null,
      sessionActorRegistry: null,
      sessionEffectExecutor: null,
    });

    const first = runtime.gracefulShutdown({ exitProcess: false });
    const second = runtime.gracefulShutdown({ exitProcess: false });

    expect(second).toBe(first);
    resolveTerminalShutdown();
    await expect(first).resolves.toBeUndefined();
  });

  it("rejects concurrent callers and permits a failed shutdown to be retried", async () => {
    let shuttingDown = false;
    const shutdownError = new Error("port release failed");
    const waitForPortRelease = vi.fn()
      .mockRejectedValueOnce(shutdownError)
      .mockResolvedValue(true);
    const runtime = createGracefulShutdownRuntime({
      process,
      shutdownTimeoutMs: 1,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => shuttingDown,
      setIsShuttingDown: (value) => {
        shuttingDown = value;
      },
      syncToHmrState: vi.fn(),
      openCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
      scheduledTasksRuntime: { stop: vi.fn() },
      getHealthCheckInterval: () => null,
      clearHealthCheckInterval: vi.fn(),
      getTerminalRuntime: () => null,
      setTerminalRuntime: vi.fn(),
      getMessageStreamRuntime: () => null,
      setMessageStreamRuntime: vi.fn(),
      shouldSkipOpenCodeStop: () => false,
      getOpenCodeRuntime: () => ({
        getPort: () => 43123,
        getProcess: () => null,
      }),
      killProcessOnPort: vi.fn(),
      waitForPortRelease,
      getServer: () => null,
      getUiAuthController: () => null,
      setUiAuthController: vi.fn(),
      serverSessionMachineBridge: null,
      sessionActorRegistry: null,
      sessionEffectExecutor: null,
    });

    const first = runtime.gracefulShutdown({ exitProcess: false });
    const second = runtime.gracefulShutdown({ exitProcess: false });

    expect(second).toBe(first);
    await expect(first).rejects.toBe(shutdownError);
    await expect(second).rejects.toBe(shutdownError);
    expect(shuttingDown).toBe(false);

    await expect(runtime.gracefulShutdown({ exitProcess: false })).resolves.toBeUndefined();
    expect(waitForPortRelease).toHaveBeenCalledTimes(2);
  });
});
