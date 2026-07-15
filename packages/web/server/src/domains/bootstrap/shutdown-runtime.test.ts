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
});
