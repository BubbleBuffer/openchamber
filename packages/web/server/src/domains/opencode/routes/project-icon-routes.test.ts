/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  parseProjectIconDiscoverRequest,
  parseProjectIconUploadRequest,
  projectAssetsError,
} from "../../../contracts/project-assets.js";
import { registerProjectIconRoutes } from "./project-icon-routes.js";

function routes(options: { project?: any; persistSettings?: () => Promise<any> } = {}) {
  const handlers = new Map<string, (req: any, res: any) => Promise<void>>();
  registerProjectIconRoutes({
    put: (route: string, handler: any) => handlers.set(`PUT ${route}`, handler), get: (route: string, handler: any) => handlers.set(`GET ${route}`, handler),
    delete: (route: string, handler: any) => handlers.set(`DELETE ${route}`, handler), post: (route: string, handler: any) => handlers.set(`POST ${route}`, handler),
  } as never, {
    fsPromises: { mkdir: async () => {}, writeFile: async () => {}, unlink: async () => {}, readFile: async () => Buffer.from("icon") } as never,
    path, crypto: { createHash: () => ({ update: () => ({ digest: () => "hash" }) }) } as never, openchamberDataDir: "/tmp",
    sanitizeProjects: (projects: unknown) => Array.isArray(projects) ? projects : [],
    readSettingsFromDiskMigrated: async () => ({ projects: [options.project ?? { id: "project-id", path: "/project" }] }),
    persistSettings: options.persistSettings ?? (async () => ({ projects: [{ id: "project-id", path: "/project" }] })),
    createFsSearchRuntime: () => ({ searchFilesystemFiles: async () => [] }), spawn: {} as never, resolveGitBinaryForSpawn: () => "git",
  });
  return handlers;
}

function response() {
  return { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, setHeader(name: string, value: string) { this.headers[name] = value; }, send(body: unknown) { this.body = body; return this; } };
}

describe("project icon route contract ownership", () => {
  it("rejects malformed input and exposes the stable unsupported-media error used by 415 responses", () => {
    expect(parseProjectIconUploadRequest({ dataUrl: "data:image/gif;base64,AA==" }).ok).toBe(true);
    expect(parseProjectIconUploadRequest({ dataUrl: null }).ok).toBe(false);
    expect(parseProjectIconDiscoverRequest({ force: null }).ok).toBe(false);
    expect(projectAssetsError("project_assets_unsupported_media", "Unsupported favicon format")).toEqual({
      error: "Unsupported favicon format",
      code: "project_assets_unsupported_media",
    });
  });

  it("returns a coded 415 before touching icon storage for unsupported upload media", async () => {
    const res = response();
    await routes().get("PUT /api/projects/:projectId/icon")!({ params: { projectId: "project-id" }, body: { dataUrl: "data:image/gif;base64,AA==" } }, res);
    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual(projectAssetsError("project_assets_unsupported_media", "Icon must be PNG, JPEG, or SVG"));
  });

  it("defaults an absent discovery body to force false and rejects malformed present bodies", async () => {
    const project = { id: "project-id", path: "/project", iconImage: { mime: "image/png", updatedAt: 1, source: "custom" } };
    const discover = routes({ project }).get("POST /api/projects/:projectId/icon/discover")!;
    const absent = response();
    await discover({ params: { projectId: "project-id" }, body: undefined }, absent);
    expect(absent.statusCode).toBe(200);
    expect(absent.body).toMatchObject({ skipped: true, reason: "custom-icon-present" });

    const malformed = response();
    await discover({ params: { projectId: "project-id" }, body: { force: "yes" } }, malformed);
    expect(malformed.statusCode).toBe(400);
  });

  it("validates constructed JSON success responses before sending them", async () => {
    const valid = response();
    await routes().get("PUT /api/projects/:projectId/icon")!({ params: { projectId: "project-id" }, body: { dataUrl: "data:image/png;base64,aGVsbG8=" } }, valid);
    expect(valid.statusCode).toBe(200);

    const malformed = response();
    await routes({ persistSettings: async () => ({ projects: [{ id: 1 }] }) }).get("PUT /api/projects/:projectId/icon")!({ params: { projectId: "project-id" }, body: { dataUrl: "data:image/png;base64,aGVsbG8=" } }, malformed);
    expect(malformed.statusCode).toBe(500);
    expect(malformed.body).toEqual(projectAssetsError("project_assets_internal_error", "Failed to upload project icon"));
  });

  it("preserves validated raw icon content types and delete mutation responses", async () => {
    const get = response();
    await routes().get("GET /api/projects/:projectId/icon")!({ params: { projectId: "project-id" }, query: {} }, get);
    expect(get.statusCode).toBe(200);
    expect(get.headers["Content-Type"]).toBe("image/png");
    expect(get.body).toEqual(Buffer.from("icon"));

    const deleted = response();
    await routes().get("DELETE /api/projects/:projectId/icon")!({ params: { projectId: "project-id" } }, deleted);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.body).toMatchObject({ project: { id: "project-id" } });
  });
});
