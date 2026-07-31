/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { skillsError } from "../../../contracts/skills.js";
import { readDiscoveredSkill, registerSkillRoutes } from "./skill-routes.js";

type Handler = (req: any, res: any) => unknown | Promise<unknown>;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

function createFixture(content = "---\nname: safe-skill\ndescription: Safe fixture\n---\n\nRead only.") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openchamber-skills-"));
  temporaryDirectories.push(directory);
  const skillDirectory = path.join(directory, "safe-skill");
  fs.mkdirSync(skillDirectory);
  const skillPath = path.join(skillDirectory, "SKILL.md");
  fs.writeFileSync(skillPath, content, "utf8");
  return { directory, skillPath };
}

function checksum(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function skillRoutes(overrides: Record<string, any> = {}) {
  const handlers = new Map<string, Handler>();
  const registered: string[] = [];
  const app = {
    get: (route: string, handler: Handler) => {
      registered.push(`GET ${route}`);
      handlers.set(`GET ${route}`, handler);
    },
    post: (route: string) => registered.push(`POST ${route}`),
    patch: (route: string) => registered.push(`PATCH ${route}`),
    put: (route: string) => registered.push(`PUT ${route}`),
    delete: (route: string) => registered.push(`DELETE ${route}`),
  };
  registerSkillRoutes(app as never, {
    fs,
    path,
    resolveOptionalProjectDirectory: async () => ({ directory: "/project" }),
    discoverSkills: () => [],
    ...overrides,
  });
  return {
    registered,
    route: (method: string, route: string) => handlers.get(`${method} ${route}`)!,
  };
}

describe("read-only installed skill routes", () => {
  it("registers only the installed list and detail GET routes", () => {
    expect(skillRoutes().registered).toEqual([
      "GET /api/config/skills",
      "GET /api/config/skills/:name",
    ]);
  });

  it("returns a safe coded failure when directory resolution fails", async () => {
    const { route } = skillRoutes({
      resolveOptionalProjectDirectory: async () => ({ error: "directory details" }),
    });
    const res = response();
    await route("GET", "/api/config/skills")({ query: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      skillsError("skills_invalid_request", "Invalid project directory"),
    );
  });

  it("lists discovered installed skills without reading their files", async () => {
    const { route } = skillRoutes({
      discoverSkills: () => [
        {
          name: "safe-skill",
          path: "/not-read/SKILL.md",
          scope: "user",
          source: "opencode",
          description: "Safe",
        },
      ],
    });
    const res = response();
    await route("GET", "/api/config/skills")({ query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      skills: [
        {
          name: "safe-skill",
          path: "/not-read/SKILL.md",
          scope: "user",
          source: "opencode",
          description: "Safe",
        },
      ],
    });
  });

  it("re-discovers by exact name, ignores browser paths, and never mutates the skill", async () => {
    const fixture = createFixture();
    const before = checksum(fixture.skillPath);
    let discoveries = 0;
    const { route } = skillRoutes({
      discoverSkills: () => {
        discoveries += 1;
        return [
          {
            name: "safe-skill",
            path: fixture.skillPath,
            scope: "project",
            source: "agents",
            description: "Safe fixture",
          },
        ];
      },
    });

    const res = response();
    await route("GET", "/api/config/skills/:name")(
      {
        params: { name: "safe-skill", path: "/etc/passwd" },
        query: { path: "/etc/passwd" },
      },
      res,
    );

    expect(discoveries).toBe(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      name: "safe-skill",
      path: fs.realpathSync(fixture.skillPath),
      scope: "project",
      source: "agents",
      instructions: "Read only.",
    });
    expect(checksum(fixture.skillPath)).toBe(before);
  });

  it("rejects non-SKILL files, symlinks, and oversized markdown", () => {
    const fixture = createFixture("too large");
    const wrongName = path.join(fixture.directory, "README.md");
    fs.writeFileSync(wrongName, "safe", "utf8");
    expect(
      readDiscoveredSkill(
        { name: "safe-skill", path: wrongName, scope: "user", source: "opencode" },
        { fs, path },
      ),
    ).toEqual({ ok: false, code: "skills_invalid_path" });

    expect(
      readDiscoveredSkill(
        {
          name: "safe-skill",
          path: fixture.skillPath,
          scope: "user",
          source: "opencode",
        },
        { fs, path },
        2,
      ),
    ).toEqual({ ok: false, code: "skills_invalid_path" });

    const symlinkDirectory = path.join(fixture.directory, "linked");
    fs.mkdirSync(symlinkDirectory);
    const symlinkPath = path.join(symlinkDirectory, "SKILL.md");
    fs.symlinkSync(fixture.skillPath, symlinkPath);
    expect(
      readDiscoveredSkill(
        { name: "safe-skill", path: symlinkPath, scope: "user", source: "opencode" },
        { fs, path },
      ),
    ).toEqual({ ok: false, code: "skills_invalid_path" });
  });

  it("does not leak discovery errors", async () => {
    const { route } = skillRoutes({
      discoverSkills: () => {
        throw new Error("secret path");
      },
    });
    const res = response();
    await route("GET", "/api/config/skills")({ query: {} }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(
      skillsError("skills_internal_error", "Failed to list skills"),
    );
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});
