/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { registerQuotaRoutes } from "./routes.js";

describe("quota route contracts", () => {
  it("inventories the public quota routes", () => {
    const routes = new Map<string, any>();
    registerQuotaRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); } } as never, { getQuotaProviders: vi.fn() });
    expect([...routes.keys()]).toEqual(["GET /api/quota/providers", "GET /api/quota/:providerId"]);
  });

  it("returns a safe coded error for malformed provider requests", async () => {
    const routes = new Map<string, any>();
    registerQuotaRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); } } as never, { getQuotaProviders: vi.fn() });
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes.get("GET /api/quota/:providerId")({ params: { providerId: " " } }, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: "Quota request failed", code: "quota_invalid_request" });
  });

  it("sanitizes provider failures and rejects malformed constructed responses", async () => {
    const routes = new Map<string, any>();
    const getQuotaProviders = vi.fn(async () => ({
      listConfiguredQuotaProviders: () => ["claude"],
      fetchQuotaForProvider: async (id: string) => id === "claude"
        ? { providerId: "claude", providerName: "Claude", ok: false, configured: true, usage: null, error: "upstream token=secret", fetchedAt: 1 }
        : { providerId: "bad", providerName: "Bad", ok: true, configured: true, usage: null, fetchedAt: "nope" },
    }));
    registerQuotaRoutes({ get(path: string, handler: any) { routes.set(`GET ${path}`, handler); } } as never, { getQuotaProviders: getQuotaProviders as never });
    const providerFailure = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes.get("GET /api/quota/:providerId")({ params: { providerId: "claude" } }, providerFailure);
    expect(providerFailure.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Quota provider failed", errorCode: "quota_provider_error" }));
    const malformed = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes.get("GET /api/quota/:providerId")({ params: { providerId: "bad" } }, malformed);
    expect(malformed.status).toHaveBeenCalledWith(500);
    expect(malformed.json).toHaveBeenCalledWith({ error: "Quota request failed", code: "quota_internal_error" });
  });
});
