/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, expect, it } from "vitest";

import { createProjectIdFromPath } from "../../projects/project-id.js";
import { registerOpenCodeRoutes } from "./routes.js";

type RouteHandler = (req: any, res: any) => unknown | Promise<unknown>;

function createRouteRegistry() {
  const routes = new Map<string, RouteHandler>();
  const app = {
    get(path: string, handler: RouteHandler) { routes.set(`GET ${path}`, handler); },
    post(path: string, handler: RouteHandler) { routes.set(`POST ${path}`, handler); },
    put(path: string, handler: RouteHandler) { routes.set(`PUT ${path}`, handler); },
    delete(path: string, handler: RouteHandler) { routes.set(`DELETE ${path}`, handler); },
  };
  return { app: app as never, getRoute: (method: string, path: string) => routes.get(`${method} ${path}`) };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}

function registerDirectoryRoute(options: {
  settings: any;
  validatedPath: string;
  persistSettings: (changes: any) => Promise<any>;
}) {
  const registry = createRouteRegistry();
  registerOpenCodeRoutes(registry.app, {
    crypto: {} as never,
    clientReloadDelayMs: 0,
    getOpenCodeResolutionSnapshot: async () => ({}),
    formatSettingsResponse: (settings) => settings,
    readSettingsFromDisk: async () => options.settings,
    readSettingsFromDiskMigrated: async () => options.settings,
    persistSettings: options.persistSettings,
    sanitizeProjects: (projects) => Array.isArray(projects) ? projects : [],
    validateDirectoryPath: async () => ({ ok: true, directory: options.validatedPath }),
    resolveProjectDirectory: async () => ({}),
    getProviderSources: () => ({ sources: {} }),
    removeProviderConfig: () => false,
    refreshOpenCodeAfterConfigChange: async () => {},
  });
  return registry.getRoute("POST", "/api/opencode/directory")!;
}

describe("OpenCode directory route", () => {
  it("registers a new project from the validated path and persists active directory state", async () => {
    const settings = { projects: [{ id: "existing", path: "/workspace/existing" }] };
    let persisted: any;
    const route = registerDirectoryRoute({
      settings,
      validatedPath: "/workspace/new-project",
      persistSettings: async (changes) => {
        persisted = changes;
        return changes;
      },
    });

    const response = createResponse();
    await route({ body: { path: "/untrusted/input" } }, response);

    expect(response.statusCode).toBe(200);
    expect(persisted.projects).toHaveLength(2);
    expect(persisted.projects[1]).toMatchObject({
      id: createProjectIdFromPath("/workspace/new-project"),
      path: "/workspace/new-project",
    });
    expect(persisted.activeProjectId).toBe(createProjectIdFromPath("/workspace/new-project"));
    expect(persisted.lastDirectory).toBe("/workspace/new-project");
  });

  it("does not duplicate an existing project", async () => {
    const existing = { id: "existing", path: "/workspace/existing" };
    const settings = { projects: [existing] };
    let persisted: any;
    const route = registerDirectoryRoute({
      settings,
      validatedPath: existing.path,
      persistSettings: async (changes) => {
        persisted = changes;
        return changes;
      },
    });

    await route({ body: { path: existing.path } }, createResponse());

    expect(persisted.projects).toEqual([existing]);
    expect(persisted.activeProjectId).toBe(existing.id);
    expect(persisted.lastDirectory).toBe(existing.path);
  });
});
