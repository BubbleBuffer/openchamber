import { describe, it, expect } from "vitest";
import { startWebUiServer } from "../index.js";

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
});