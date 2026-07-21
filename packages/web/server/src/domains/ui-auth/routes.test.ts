import { describe, expect, it } from "vitest";

import { registerAuthAndAccessRoutes } from "../opencode/routes/core-routes.js";

type RouteHandler = (req: Record<string, unknown>, res: ReturnType<typeof createResponse>) => unknown | Promise<unknown>;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}

describe("UI auth HTTP routes", () => {
  it("returns a coded safe failure when session creation throws", async () => {
    const routes = new Map<string, RouteHandler>();
    const app = {
      get(path: string, handler: RouteHandler) { routes.set(`GET ${path}`, handler); },
      post(path: string, handler: RouteHandler) { routes.set(`POST ${path}`, handler); },
      delete(path: string, handler: RouteHandler) { routes.set(`DELETE ${path}`, handler); },
      use() {},
    };
    registerAuthAndAccessRoutes(app as never, {
      tunnelAuthController: { classifyRequestScope: () => "local" },
      uiAuthController: {
        handleSessionCreate: async () => { throw new Error("token secret leaked"); },
      },
      readSettingsFromDiskMigrated: async () => ({}),
      normalizeTunnelSessionTtlMs: () => 0,
    });

    const response = createResponse();
    await routes.get("POST /auth/session")!({}, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error", code: "internal_error" });
  });
});
