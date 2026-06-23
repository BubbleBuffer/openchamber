import { describe, expect, it } from "vitest";

import { registerScheduledTaskRoutes } from "./routes.js";

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
    app: app as unknown as Parameters<typeof registerScheduledTaskRoutes>[0],
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

describe("scheduled-tasks SSE routes", () => {
  it("serves OpenChamber SSE with nginx-safe headers", async () => {
    const { app, getRoute } = createRouteRegistry();
    const clients = new Set<unknown>();

    registerScheduledTaskRoutes(app, {
      readSettingsFromDiskMigrated: async () => ({ projects: [] }),
      sanitizeProjects: () => [],
      projectConfigRuntime: {
        listScheduledTasks: async () => [],
        upsertScheduledTask: async () => ({ task: { id: "t" }, created: true }),
        deleteScheduledTask: async () => ({ deleted: true }),
      },
      scheduledTasksRuntime: {
        syncProject: async () => undefined,
        runNow: async () => ({ ok: true }),
      },
      getOpenChamberEventClients: () => clients,
      writeSseEvent(res: { write: (chunk: string) => boolean }, payload: unknown) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      },
    } as never);

    const handler = getRoute("GET", "/api/openchamber/events");
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
    expect(res.body).toContain("openchamber:event-stream-ready");
    expect(clients.has(res)).toBe(true);

    req.emit("close");
    expect(clients.has(res)).toBe(false);
  });
});