import { describe, it, expect, vi } from "vitest";
import { startWebUiServer } from "../index.js";
import { createBootstrapRuntime } from "../domains/bootstrap/bootstrap-runtime.js";

describe("server bootstrap", () => {
  it("starts on a random port and returns controller", async () => {
    const controller = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    expect(controller).toBeDefined();
    expect(controller.expressApp).toBeDefined();
    expect(controller.httpServer).toBeDefined();
    expect(typeof controller.getPort()).toBe("number");
    expect(controller.getPort()).toBeGreaterThan(0);

    await controller.stop({ exitProcess: false });

    const port = controller.getPort();
    expect(port).toBeNull();
  });

  it("returns 200 from /health endpoint", async () => {
    const controller = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const port = controller.getPort();
    const url = `http://127.0.0.1:${port}/health`;

    try {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      const body = await response.json() as { status: string; timestamp: string };
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    } finally {
      await controller.stop({ exitProcess: false });
    }
  });

  it("getPort returns null after stop", async () => {
    const controller = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    await controller.stop({ exitProcess: false });
    expect(controller.getPort()).toBeNull();
  });

  it("supports sequential start-stop-start without losing the controller contract", async () => {
    const first = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    try {
      const firstPort = first.getPort();
      expect(firstPort).toBeGreaterThan(0);
      await first.stop({ exitProcess: false });
      expect(first.getPort()).toBeNull();

      const second = await startWebUiServer({
        port: 0,
        attachSignals: false,
        exitOnShutdown: false,
      });

      try {
        expect(second.getPort()).toBeGreaterThan(0);
        expect(second.expressApp).toBeDefined();
        expect(second.httpServer).toBeDefined();
        const sessionActivity = await fetch(`http://127.0.0.1:${second.getPort()}/api/session-activity`);
        expect(sessionActivity.status).toBe(200);
        const autoAccept = await fetch(`http://127.0.0.1:${second.getPort()}/api/notifications/auto-accept`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: "restart-regression", enabled: true }),
        });
        expect(autoAccept.status).toBe(200);
      } finally {
        await second.stop({ exitProcess: false });
      }
    } finally {
      await first.stop({ exitProcess: false });
    }
  });

  it("makes concurrent and repeated stops safe", async () => {
    const controller = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    const firstStop = controller.stop({ exitProcess: false });
    const secondStop = controller.stop({ exitProcess: false });

    await expect(Promise.all([firstStop, secondStop])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    await expect(controller.stop({ exitProcess: false })).resolves.toBeUndefined();
    expect(controller.getPort()).toBeNull();
  });

  it("rolls back a failed HTTP listen without stopping the existing server", async () => {
    const existing = await startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });
    const occupiedPort = existing.getPort();
    if (occupiedPort === null) throw new Error("existing server did not bind");

    try {
      await expect(
        startWebUiServer({
          port: occupiedPort,
          attachSignals: false,
          exitOnShutdown: false,
        }),
      ).rejects.toThrow();

      const response = await fetch(`http://127.0.0.1:${occupiedPort}/health`);
      expect(response.status).toBe(200);
    } finally {
      await existing.stop({ exitProcess: false });
    }
    expect(existing.httpServer.listening).toBe(false);
  });

  it("disposes UI auth when base route registration fails", () => {
    const dispose = vi.fn();
    const runtime = createBootstrapRuntime({
      createUiAuth: vi.fn(() => ({ enabled: false, dispose })),
      registerServerStatusRoutes: vi.fn(),
      registerCommonRequestMiddleware: vi.fn(),
      registerAuthAndAccessRoutes: vi.fn(),
      registerNotificationRoutes: vi.fn(() => {
        throw new Error("notification route registration failed");
      }),
      registerOpenChamberRoutes: vi.fn(),
      express: {} as never,
    });

    expect(() =>
      runtime.setupBaseRoutes({}, {
        process,
        express: {},
        gracefulShutdown: vi.fn(),
        getHealthSnapshot: vi.fn(),
        readSettingsFromDiskMigrated: vi.fn(),
        resolveZenModel: vi.fn(),
        ensurePushInitialized: vi.fn(),
        ensureGlobalWatcherStarted: vi.fn(),
        getOrCreateVapidKeys: vi.fn(),
        getUiSessionTokenFromRequest: vi.fn(),
        writeSettingsToDisk: vi.fn(),
        addOrUpdatePushSubscription: vi.fn(),
        removePushSubscription: vi.fn(),
        updateUiVisibility: vi.fn(),
        isUiVisible: vi.fn(),
        getUiNotificationClients: vi.fn(),
        writeSseEvent: vi.fn(),
        sessionRuntime: {
          getSessionActivitySnapshot: vi.fn(),
          getSessionStateSnapshot: vi.fn(),
          getSessionAttentionSnapshot: vi.fn(),
          getSessionState: vi.fn(),
          getSessionAttentionState: vi.fn(),
          markSessionViewed: vi.fn(),
          markSessionUnviewed: vi.fn(),
          markUserMessageSent: vi.fn(),
        },
        setPushInitialized: vi.fn(),
        fs: {},
        os: {},
        path: {},
        server: {},
        __dirname: ".",
        openchamberDataDir: ".",
        modelsDevApiUrl: "https://models.dev/api.json",
        modelsMetadataCacheTtl: 1000,
        fetchFreeZenModels: vi.fn(),
        getCachedZenModels: vi.fn(),
        setAutoAcceptSession: vi.fn(),
      }),
    ).toThrow("notification route registration failed");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not accumulate process handlers across restart and failed retry", async () => {
    const baseline = {
      sigterm: process.listenerCount("SIGTERM"),
      sigint: process.listenerCount("SIGINT"),
      sigquit: process.listenerCount("SIGQUIT"),
      rejection: process.listenerCount("unhandledRejection"),
      exception: process.listenerCount("uncaughtException"),
    };
    const controller = await startWebUiServer({
      port: 0,
      attachSignals: true,
      exitOnShutdown: false,
    });
    const occupiedPort = controller.getPort();
    if (occupiedPort === null) throw new Error("server did not bind");

    try {
      expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm + 1);
      expect(process.listenerCount("SIGINT")).toBe(baseline.sigint + 1);
      expect(process.listenerCount("SIGQUIT")).toBe(baseline.sigquit + 1);
      expect(process.listenerCount("unhandledRejection")).toBe(baseline.rejection + 1);
      expect(process.listenerCount("uncaughtException")).toBe(baseline.exception + 1);
      await expect(
        startWebUiServer({
          port: occupiedPort,
          attachSignals: true,
          exitOnShutdown: false,
        }),
      ).rejects.toThrow();
      expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm + 1);
      expect(process.listenerCount("unhandledRejection")).toBe(baseline.rejection + 1);
      await controller.stop({ exitProcess: false });
      expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm);
      expect(process.listenerCount("unhandledRejection")).toBe(baseline.rejection);

      const retry = await startWebUiServer({
        port: 0,
        attachSignals: true,
        exitOnShutdown: false,
      });
      try {
        expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm + 1);
        expect(process.listenerCount("unhandledRejection")).toBe(baseline.rejection + 1);
      } finally {
        await retry.stop({ exitProcess: false });
      }
      expect(process.listenerCount("SIGTERM")).toBe(baseline.sigterm);
      expect(process.listenerCount("unhandledRejection")).toBe(baseline.rejection);
    } finally {
      if (controller.getPort() !== null) {
        await controller.stop({ exitProcess: false });
      }
    }
  });

  it("uses configured external OpenCode without starting or stopping a managed process", async () => {
    vi.stubEnv("OPENCODE_HOST", "http://external.example.test:43123");
    vi.stubEnv("OPENCODE_PORT", "49999");
    vi.stubEnv("OPENCODE_SKIP_START", "true");

    const externalFetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/config") || url.endsWith("/agent")) {
        return new Response(JSON.stringify(url.endsWith("/agent") ? [] : {}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ healthy: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", externalFetch);

    let managedSpawn!: ReturnType<typeof vi.fn>;
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
      managedSpawn = vi.fn(() => {
        throw new Error("managed OpenCode process must not start in external mode");
      });
      return { ...actual, spawn: managedSpawn };
    });

    vi.resetModules();
    const isolatedServer = await import("../index.js");
    const controller = await isolatedServer.startWebUiServer({
      port: 0,
      attachSignals: false,
      exitOnShutdown: false,
    });

    try {
      await vi.waitFor(() => {
        expect(controller.getOpenCodePort()).toBe(43123);
        expect(controller.isReady()).toBe(true);
      });

      expect(managedSpawn).not.toHaveBeenCalled();
      expect(externalFetch).toHaveBeenCalledWith(
        "http://external.example.test:43123/config",
        expect.objectContaining({ method: "GET" }),
      );
      const fetchCountBeforeStop = externalFetch.mock.calls.length;

      await controller.stop({ exitProcess: false });
      expect(controller.getPort()).toBeNull();
      expect(externalFetch).toHaveBeenCalledTimes(fetchCountBeforeStop);
    } finally {
      if (controller.getPort() !== null) {
        await controller.stop({ exitProcess: false });
      }
      vi.doUnmock("node:child_process");
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
