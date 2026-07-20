/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  parseProjectIconDiscoverRequest,
  parseProjectIconUploadRequest,
  projectAssetsError,
} from "../../../contracts/project-assets.js";
import { registerProjectIconRoutes } from "./project-icon-routes.js";

function iconUploadRoute() {
  let route: ((req: any, res: any) => Promise<void>) | undefined;
  registerProjectIconRoutes({ put: (_path: string, handler: typeof route) => { route = handler; }, get() {}, delete() {}, post() {} } as never, {
    fsPromises: {} as never, path, crypto: {} as never, openchamberDataDir: "/tmp",
    sanitizeProjects: () => [], readSettingsFromDiskMigrated: async () => ({}), persistSettings: async () => ({}),
    createFsSearchRuntime: () => ({}), spawn: {} as never, resolveGitBinaryForSpawn: () => "git",
  });
  return route!;
}

function response() {
  return { statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
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
    await iconUploadRoute()({ params: { projectId: "project-id" }, body: { dataUrl: "data:image/gif;base64,AA==" } }, res);
    expect(res.statusCode).toBe(415);
    expect(res.body).toEqual(projectAssetsError("project_assets_unsupported_media", "Icon must be PNG, JPEG, or SVG"));
  });
});
