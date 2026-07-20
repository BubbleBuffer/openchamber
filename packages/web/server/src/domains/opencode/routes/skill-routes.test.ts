/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "node:path";
import * as os from "node:os";
import { describe, expect, it } from "vitest";
import { skillsError } from "../../../contracts/skills.js";
import { registerSkillRoutes } from "./skill-routes.js";

type Handler = (req: any, res: any) => unknown | Promise<unknown>;

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

function skillRoutes(overrides: Record<string, any> = {}) {
  const handlers = new Map<string, Handler>();
  const app = {
    get: (route: string, handler: Handler) => handlers.set(`GET ${route}`, handler),
    post: (route: string, handler: Handler) => handlers.set(`POST ${route}`, handler),
    patch: (route: string, handler: Handler) => handlers.set(`PATCH ${route}`, handler),
    put: (route: string, handler: Handler) => handlers.set(`PUT ${route}`, handler),
    delete: (route: string, handler: Handler) => handlers.set(`DELETE ${route}`, handler),
  };
  registerSkillRoutes(app as never, {
    fs: { existsSync: () => false } as never,
    path,
    os,
    resolveProjectDirectory: async () => ({ directory: "/project" }),
    resolveOptionalProjectDirectory: async () => ({ directory: "/project" }),
    readSettingsFromDisk: async () => ({ skillCatalogs: [] }),
    sanitizeSkillCatalogs: () => [],
    isUnsafeSkillRelativePath: () => false,
    refreshOpenCodeAfterConfigChange: async () => {},
    clientReloadDelayMs: 0,
    openCodeRuntime: {} as never,
    getOpenCodePort: () => null,
    getSkillSources: () => ({ md: { exists: true, dir: "/skills/safe-skill", path: "/skills/safe-skill/SKILL.md", fields: [], supportingFiles: [], scope: "user", source: "opencode" } }),
    discoverSkills: () => [],
    createSkill: () => {},
    updateSkill: () => {},
    deleteSkill: () => {},
    readSkillSupportingFile: () => "contents",
    writeSkillSupportingFile: () => {},
    deleteSkillSupportingFile: () => {},
    SKILL_SCOPE: { USER: "user", PROJECT: "project" },
    SKILL_DIR: "/user-skills",
    getCuratedSkillsSources: () => [],
    getCacheKey: () => "cache-key",
    getCachedScan: () => null,
    setCachedScan: () => {},
    parseSkillRepoSource: () => ({ ok: true, normalizedRepo: "owner/repo" }),
    scanSkillsRepository: async () => ({ ok: true, items: [] }),
    installSkillsFromRepository: async () => ({ ok: true, installed: [], skipped: [] }),
    scanClawdHubPage: async () => ({ ok: true, items: [] }),
    installSkillsFromClawdHub: async () => ({ ok: true, installed: [], skipped: [] }),
    isClawdHubSource: () => false,
    getProfiles: () => [],
    getProfile: () => null,
    ...overrides,
  });
  return (method: string, route: string) => handlers.get(`${method} ${route}`)!;
}

const installRequest = { source: "https://github.com/owner/repo", scope: "user", selections: [{ skillDir: "skills/safe-skill" }] };

describe("active skill route contract ownership", () => {
  it("returns a coded SkillsFailure when catalog directory resolution fails", async () => {
    const route = skillRoutes({ resolveOptionalProjectDirectory: async () => ({ error: "directory details" }) })("GET", "/api/config/skills/catalog");
    const res = response();
    await route({ query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(skillsError("skills_invalid_request", "Invalid project directory"));
  });

  it("does not leak unexpected installed-list or CRUD errors", async () => {
    const cases: Array<[string, string, any, Record<string, any>]> = [
      ["GET", "/api/config/skills", { query: {} }, { discoverSkills: () => { throw new Error("list secret"); } }],
      ["POST", "/api/config/skills/:name", { params: { name: "safe-skill" }, body: {}, query: {} }, { createSkill: () => { throw new Error("create secret"); } }],
      ["PATCH", "/api/config/skills/:name", { params: { name: "safe-skill" }, body: {}, query: {} }, { updateSkill: () => { throw new Error("update secret"); } }],
      ["DELETE", "/api/config/skills/:name", { params: { name: "safe-skill" }, query: {} }, { deleteSkill: () => { throw new Error("delete secret"); } }],
    ];
    for (const [method, pathName, req, overrides] of cases) {
      const res = response();
      await skillRoutes(overrides)(method, pathName)(req, res);
      expect(res.statusCode).toBe(500);
      expect(res.body).toMatchObject({ ok: false, error: { code: "skills_internal_error" } });
      expect(JSON.stringify(res.body)).not.toContain("secret");
    }
  });

  it("uses stable coded failures for invalid and unresolved supporting files", async () => {
    const invalid = response();
    await skillRoutes()("GET", "/api/config/skills/:name/files/*filePath")({ params: { name: "safe-skill", filePath: "../secret.md" }, query: {} }, invalid);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toEqual(skillsError("skills_invalid_path", "Invalid skill file path"));

    const unresolved = response();
    await skillRoutes({ resolveProjectDirectory: async () => ({ error: "directory secret" }) })("PUT", "/api/config/skills/:name/files/*filePath")({ params: { name: "safe-skill", filePath: "notes/setup.md" }, body: { content: "text" }, query: {} }, unresolved);
    expect(unresolved.statusCode).toBe(400);
    expect(unresolved.body).toEqual(skillsError("skills_invalid_request", "Invalid project directory"));
  });

  it("preserves install conflicts and authentication identities in coded failures", async () => {
    const conflict = response();
    await skillRoutes({ installSkillsFromRepository: async () => ({ ok: false, error: { kind: "conflicts", conflicts: [{ skillName: "safe-skill", scope: "user", source: "opencode" }] } }) })("POST", "/api/config/skills/install")({ body: installRequest, query: {} }, conflict);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.body).toMatchObject(skillsError("skills_conflict", "Skill installation conflicts with an existing skill", { kind: "conflicts", conflicts: [{ skillName: "safe-skill", scope: "user", source: "opencode" }] }));

    const auth = response();
    await skillRoutes({ installSkillsFromRepository: async () => ({ ok: false, error: { kind: "authRequired" } }), getProfiles: () => [{ id: "work", name: "Work key" }] })("POST", "/api/config/skills/install")({ body: installRequest, query: {} }, auth);
    expect(auth.statusCode).toBe(401);
    expect(auth.body).toEqual({ ok: false, error: { code: "skills_auth_required", kind: "authRequired", message: "Skill provider authentication is required", conflicts: [], identities: [{ id: "work", name: "Work key" }] } });
  });

  it("turns an invalid constructed success response into a safe non-2xx failure", async () => {
    const res = response();
    await skillRoutes({ discoverSkills: () => [{ name: "bad", path: "/skills/bad", scope: "invalid", source: "opencode" }] })("GET", "/api/config/skills")({ query: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(skillsError("skills_internal_error", "Failed to list skills"));
  });
});
