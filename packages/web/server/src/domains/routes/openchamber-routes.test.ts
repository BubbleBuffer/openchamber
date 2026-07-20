import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOpenChamberRoutes } from "./openchamber-routes.js";

const originalFetch = globalThis.fetch;
const appWith = (fetchFreeZenModels: () => Promise<unknown>) => {
  const app = express();
  registerOpenChamberRoutes(app, {
    modelsDevApiUrl: "https://models.example/api.json", modelsMetadataCacheTtl: 0,
    fetchFreeZenModels, getCachedZenModels: () => null,
  } as never);
  return app;
};

afterEach(() => { globalThis.fetch = originalFetch; });

describe("OpenChamber system routes", () => {
  it("preserves a model metadata timeout as a coded 504", async () => {
    globalThis.fetch = vi.fn(async () => { const error = new Error("slow"); error.name = "AbortError"; throw error; }) as typeof fetch;
    const response = await request(appWith(async () => [])).get("/api/openchamber/models-metadata");
    expect(response.status).toBe(504);
    expect(response.body).toEqual({ error: "Failed to retrieve model metadata", code: "upstream_timeout" });
  });

  it("does not expose upstream exception text and keeps Zen malformed payloads opaque", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("credential=secret"); }) as typeof fetch;
    const metadata = await request(appWith(async () => [{ id: "zen" }])).get("/api/openchamber/models-metadata");
    expect(metadata.status).toBe(502);
    expect(metadata.body).toEqual({ error: "Failed to retrieve model metadata", code: "upstream_error" });
    const zen = await request(appWith(async () => [{ id: "zen" }])).get("/api/zen/models");
    expect(zen.status).toBe(200);
    expect(zen.body).toEqual({ models: [{ id: "zen" }] });
  });

  it("rejects invalid successful model metadata and Zen payloads", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ zen: { models: "invalid" } }) })) as unknown as typeof fetch;
    const metadata = await request(appWith(async () => "invalid" as never)).get("/api/openchamber/models-metadata");
    expect(metadata.status).toBe(502);
    expect(metadata.body).toEqual({ error: "Failed to retrieve model metadata", code: "upstream_error" });
    const zen = await request(appWith(async () => "invalid" as never)).get("/api/zen/models");
    expect(zen.status).toBe(502);
    expect(zen.body).toEqual({ error: "Failed to retrieve zen models", code: "upstream_error" });
  });
});
