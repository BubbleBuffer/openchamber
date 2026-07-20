import { describe, expect, it } from "vitest";

import { registerNotificationRoutes } from "./routes.js";
import { parseNotificationSseEvent } from "../../contracts/notifications.js";

type RouteHandler = (req: unknown, res: unknown) => unknown | Promise<unknown>;

const createRouteRegistry = () => {
  const routes = new Map<string, RouteHandler>();

  const app = {
    get(path: string, handler: RouteHandler) {
      routes.set(`GET ${path}`, handler);
    },
    post(path: string, handler: RouteHandler) {
      routes.set(`POST ${path}`, handler);
    },
    put(path: string, handler: RouteHandler) {
      routes.set(`PUT ${path}`, handler);
    },
    delete(path: string, handler: RouteHandler) {
      routes.set(`DELETE ${path}`, handler);
    },
  };

  return {
    app: app as unknown as Parameters<typeof registerNotificationRoutes>[0],
    getRoute(method: string, path: string): RouteHandler | undefined {
      return routes.get(`${method} ${path}`);
    },
  };
};

const createMockRequest = () => {
  const listeners = new Map<string, () => void>();

  return {
    headers: {},
    on(event: string, handler: () => void) {
      listeners.set(event, handler);
      return this;
    },
    emit(event: string) {
      const handler = listeners.get(event);
      if (typeof handler === "function") {
        handler();
      }
    },
  };
};

const createMockResponse = () => {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body = "";
  let flushed = false;

  return {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    flushHeaders() {
      flushed = true;
    },
    write(chunk: string) {
      body += String(chunk);
      return true;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body += JSON.stringify(payload);
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get flushed() {
      return flushed;
    },
  };
};

describe("notifications SSE routes", () => {
  it("returns a coded unauthorized response for every protected push route", async () => {
    const { app, getRoute } = createRouteRegistry();
    registerNotificationRoutes(app, { ensurePushInitialized: async () => {}, uiAuthController: { ensureSessionToken: async () => null }, getUiSessionTokenFromRequest: () => "forged" } as never);
    for (const [method, path] of [["POST", "/api/push/subscribe"], ["DELETE", "/api/push/subscribe"], ["POST", "/api/push/visibility"], ["GET", "/api/push/visibility"], ["GET", "/api/notifications/stream"]] as const) {
      const res = createMockResponse();
      await getRoute(method, path)?.({ ...createMockRequest(), body: {} }, res);
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body)).toEqual({ error: "UI authentication required", code: "ui_auth_unauthorized" });
    }
  });

  it("serves notification SSE with nginx-safe headers", async () => {
    const { app, getRoute } = createRouteRegistry();
    const clients = new Set<unknown>();

    registerNotificationRoutes(app, {
      uiAuthController: {
        ensureSessionToken: async () => "ui-token",
      },
      getUiSessionTokenFromRequest: () => "ui-token",
      getUiNotificationClients: () => clients,
      writeSseEvent(res: { write: (chunk: string) => boolean }, payload: unknown) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      },
    } as never);

    const handler = getRoute("GET", "/api/notifications/stream");
    expect(handler).toBeDefined();
    if (!handler) return;

    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.getHeader("content-type")).toContain("text/event-stream");
    expect(res.getHeader("cache-control")).toBe("no-cache, no-transform");
    expect(res.getHeader("connection")).toBe("keep-alive");
    expect(res.getHeader("x-accel-buffering")).toBe("no");
    expect(res.flushed).toBe(true);
    const payload = JSON.parse(res.body.replace(/^data:\s*/, "").trim());
    expect(parseNotificationSseEvent(payload)).toEqual({ ok: true, value: { type: "openchamber:notification-stream-ready", properties: {} } });
    expect(clients.has(res)).toBe(true);

    req.emit("close");
    expect(clients.has(res)).toBe(false);
  });

  it("returns a safe stable error when push initialization throws", async () => {
    const { app, getRoute } = createRouteRegistry();
    registerNotificationRoutes(app, {
      ensurePushInitialized: async () => { throw new Error("token=secret"); },
    } as never);

    const handler = getRoute("GET", "/api/push/vapid-public-key");
    const res = createMockResponse();
    await handler?.(createMockRequest(), res);

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error", code: "internal_error" });
  });
});
