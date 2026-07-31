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

  it("preserves shutdown ordering across injected resources", async () => {
    let shuttingDown = false;
    const order: string[] = [];
    const openCodeProcess = { close: vi.fn(async () => order.push("openCode.close")) };
    const server = {
      close: vi.fn((callback: () => void) => {
        order.push("server.close");
        callback();
      }),
    };
    const runtime = createGracefulShutdownRuntime({
      process,
      shutdownTimeoutMs: 1,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => shuttingDown,
      setIsShuttingDown: (value) => {
        shuttingDown = value;
      },
      syncToHmrState: vi.fn(() => order.push("sync")),
      openCodeWatcherRuntime: { stop: vi.fn(() => order.push("watcher.stop")) },
      sessionRuntime: { dispose: vi.fn(() => order.push("session.dispose")) },
      notificationRuntime: { dispose: vi.fn(() => order.push("notifications.dispose")) },
      getHealthCheckInterval: () => 42,
      clearHealthCheckInterval: vi.fn(() => order.push("health.clear")),
      getTerminalRuntime: () => ({
        shutdown: vi.fn(async () => order.push("terminal.shutdown")),
      }),
      setTerminalRuntime: vi.fn(() => order.push("terminal.clear")),
      getMessageStreamRuntime: () => ({
        close: vi.fn(async () => order.push("message.close")),
      }),
      setMessageStreamRuntime: vi.fn(() => order.push("message.clear")),
      shouldSkipOpenCodeStop: () => false,
      getOpenCodeRuntime: () => ({
        getPort: () => 43123,
        getProcess: () => openCodeProcess,
        clearProcess: vi.fn(() => order.push("openCode.clear")),
      }),
      killProcessOnPort: vi.fn(() => order.push("port.kill")),
      waitForPortRelease: vi.fn(async () => {
        order.push("port.release");
        return true;
      }),
      getServer: () => server,
      getUiAuthController: () => ({ dispose: vi.fn(() => order.push("auth.dispose")) }),
      setUiAuthController: vi.fn(),
      serverSessionMachineBridge: { stop: vi.fn(() => order.push("bridge.stop")) },
      sessionActorRegistry: { dispose: vi.fn(() => order.push("actors.dispose")) },
      sessionEffectExecutor: { dispose: vi.fn(() => order.push("effects.dispose")) },
    });

    await runtime.gracefulShutdown({ exitProcess: false });

    expect(order).toEqual([
      "sync",
      "watcher.stop",
      "session.dispose",
      "bridge.stop",
      "actors.dispose",
      "effects.dispose",
      "notifications.dispose",
      "health.clear",
      "terminal.shutdown",
      "terminal.clear",
      "message.close",
      "message.clear",
      "openCode.close",
      "openCode.clear",
      "port.kill",
      "port.release",
      "server.close",
      "auth.dispose",
    ]);
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
    let persistedShuttingDown = false;
    const syncStates: boolean[] = [];
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
      syncToHmrState: vi.fn(() => {
        syncStates.push(shuttingDown);
        persistedShuttingDown = shuttingDown;
      }),
      openCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
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
    expect(syncStates).toEqual([true, false]);
    expect(persistedShuttingDown).toBe(false);

    const recreatedServer = {
      close: vi.fn((callback: () => void) => callback()),
    };
    const recreatedRuntime = createGracefulShutdownRuntime({
      process,
      shutdownTimeoutMs: 1,
      getExitOnShutdown: () => false,
      getIsShuttingDown: () => persistedShuttingDown,
      setIsShuttingDown: (value) => {
        persistedShuttingDown = value;
      },
      syncToHmrState: vi.fn(),
      openCodeWatcherRuntime: { stop: vi.fn() },
      sessionRuntime: { dispose: vi.fn() },
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
      getServer: () => recreatedServer,
      getUiAuthController: () => null,
      setUiAuthController: vi.fn(),
      serverSessionMachineBridge: null,
      sessionActorRegistry: null,
      sessionEffectExecutor: null,
    });

    await expect(recreatedRuntime.gracefulShutdown({ exitProcess: false })).resolves.toBeUndefined();
    expect(recreatedServer.close).toHaveBeenCalledOnce();

    await expect(runtime.gracefulShutdown({ exitProcess: false })).resolves.toBeUndefined();
    expect(waitForPortRelease).toHaveBeenCalledTimes(2);
  });
});
