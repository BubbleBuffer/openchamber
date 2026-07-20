import { describe, expect, it, vi } from "vitest";
import path from "node:path";

import { registerFsRoutes, workspaceResolutionFailure } from "./routes.js";
import { parseFsPathRequest } from "../../contracts/files.js";

describe("workspace resolver failures", () => {
  it("classifies resolver denials as forbidden while malformed paths remain invalid requests", () => {
    expect(workspaceResolutionFailure("Path is outside of active workspace")).toEqual({
      status: 403,
      body: { error: "Path is outside of active workspace", code: "fs_forbidden" },
    });
    expect(workspaceResolutionFailure("Active workspace is required")).toEqual({
      status: 403,
      body: { error: "Active workspace is required", code: "fs_forbidden" },
    });
    expect(parseFsPathRequest({ path: "   " }).ok).toBe(false);
  });
});

describe("filesystem route registration", () => {
  it("does not register reveal while retaining raw/download access", () => {
    const routes = new Map<string, unknown>();
    const app = {
      get: (route: string, handler: unknown) => routes.set(`GET ${route}`, handler),
      post: (route: string, handler: unknown) => routes.set(`POST ${route}`, handler),
    };

    registerFsRoutes(app as never, {
      os: { homedir: () => "/workspace" } as never,
      path,
      fsPromises: {} as never,
      spawn: vi.fn() as never,
      crypto: { randomUUID: () => "job-id" } as never,
      normalizeDirectoryPath: (value) => value,
      resolveProjectDirectory: async () => ({ directory: "/workspace" }),
      buildAugmentedPath: () => "",
      resolveGitBinaryForSpawn: () => "git",
      openchamberUserConfigRoot: "/config/openchamber",
    });

    expect(routes.has("POST /api/fs/reveal")).toBe(false);
    expect(routes.has("GET /api/fs/raw")).toBe(true);
  });
});
