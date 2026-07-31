import type { Express, Request, Response } from "express";
import {
  parseSkillDetailResponse,
  parseSkillNameRequest,
  parseSkillsListResponse,
  skillsError,
  type InstalledSkill,
  type SkillScope,
  type SkillSource,
} from "../../../contracts/skills.js";

const MAX_SKILL_MARKDOWN_BYTES = 1024 * 1024;

interface FileSystem {
  lstatSync(path: string): { isFile(): boolean };
  realpathSync(path: string): string;
  statSync(path: string): { isFile(): boolean; size: number };
  readFileSync(path: string, encoding: "utf8"): string;
}

interface PathModule {
  basename(path: string): string;
  resolve(path: string): string;
}

interface DiscoveredSkill {
  name: string;
  path: string;
  scope: string;
  source: string;
  description?: string;
}

interface SkillRoutesDeps {
  fs: FileSystem;
  path: PathModule;
  resolveOptionalProjectDirectory: (
    req: Request,
  ) => Promise<{ directory?: string | null; error?: string }>;
  discoverSkills: (directory: string | null) => DiscoveredSkill[];
}

type SafeReadResult =
  | { ok: true; path: string; instructions: string }
  | { ok: false; code: "skills_invalid_path" | "skills_not_found" };

function isScope(value: string): value is SkillScope {
  return value === "user" || value === "project";
}

function isSource(value: string): value is SkillSource {
  return value === "opencode" || value === "claude" || value === "agents";
}

function toInstalledSkill(skill: DiscoveredSkill): InstalledSkill | null {
  if (!isScope(skill.scope) || !isSource(skill.source)) {
    return null;
  }

  return {
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    scope: skill.scope,
    source: skill.source,
    path: skill.path,
  };
}

function instructionsFromMarkdown(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match?.[1] ?? content).trim();
}

/**
 * Read only a path produced by trusted discovery. The route never accepts a
 * path from the browser and re-runs discovery for every detail request.
 */
export function readDiscoveredSkill(
  discovered: DiscoveredSkill,
  dependencies: Pick<SkillRoutesDeps, "fs" | "path">,
  maxBytes = MAX_SKILL_MARKDOWN_BYTES,
): SafeReadResult {
  const { fs, path } = dependencies;

  try {
    if (path.basename(discovered.path) !== "SKILL.md") {
      return { ok: false, code: "skills_invalid_path" };
    }

    const directStat = fs.lstatSync(discovered.path);
    if (!directStat.isFile()) {
      return { ok: false, code: "skills_invalid_path" };
    }

    const canonicalPath = fs.realpathSync(discovered.path);
    if (
      path.basename(canonicalPath) !== "SKILL.md" ||
      path.resolve(discovered.path) !== path.resolve(canonicalPath)
    ) {
      return { ok: false, code: "skills_invalid_path" };
    }

    const canonicalStat = fs.statSync(canonicalPath);
    if (!canonicalStat.isFile() || canonicalStat.size > maxBytes) {
      return { ok: false, code: "skills_invalid_path" };
    }

    return {
      ok: true,
      path: canonicalPath,
      instructions: instructionsFromMarkdown(fs.readFileSync(canonicalPath, "utf8")),
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    return {
      ok: false,
      code: code === "ENOENT" ? "skills_not_found" : "skills_invalid_path",
    };
  }
}

export function registerSkillRoutes(
  app: Express,
  dependencies: SkillRoutesDeps,
): void {
  const { resolveOptionalProjectDirectory, discoverSkills } = dependencies;

  const resolveDirectory = async (
    req: Request,
    res: Response,
  ): Promise<string | null | undefined> => {
    const result = await resolveOptionalProjectDirectory(req);
    if (result.error) {
      res
        .status(400)
        .json(skillsError("skills_invalid_request", "Invalid project directory"));
      return undefined;
    }
    return result.directory ?? null;
  };

  app.get("/api/config/skills", async (req: Request, res: Response) => {
    const directory = await resolveDirectory(req, res);
    if (directory === undefined) return;

    try {
      const skills = discoverSkills(directory).map(toInstalledSkill);
      if (skills.some((skill) => skill === null)) {
        res
          .status(500)
          .json(skillsError("skills_internal_error", "Failed to list skills"));
        return;
      }

      const response = { skills: skills as InstalledSkill[] };
      if (!parseSkillsListResponse(response).ok) {
        res
          .status(500)
          .json(skillsError("skills_internal_error", "Failed to list skills"));
        return;
      }
      res.json(response);
    } catch {
      res
        .status(500)
        .json(skillsError("skills_internal_error", "Failed to list skills"));
    }
  });

  app.get("/api/config/skills/:name", async (req: Request, res: Response) => {
    const parsedName = parseSkillNameRequest(req.params.name);
    if (!parsedName.ok) {
      res
        .status(400)
        .json(skillsError("skills_invalid_name", "Invalid skill name"));
      return;
    }

    const directory = await resolveDirectory(req, res);
    if (directory === undefined) return;

    try {
      const discovered = discoverSkills(directory).find(
        (skill) => skill.name === parsedName.value.name,
      );
      const skill = discovered ? toInstalledSkill(discovered) : null;
      if (!discovered || !skill) {
        res.status(404).json(skillsError("skills_not_found", "Skill not found"));
        return;
      }

      const read = readDiscoveredSkill(discovered, dependencies);
      if (!read.ok) {
        const status = read.code === "skills_not_found" ? 404 : 400;
        const message =
          read.code === "skills_not_found"
            ? "Skill not found"
            : "Skill file is not safe to read";
        res.status(status).json(skillsError(read.code, message));
        return;
      }

      const response = {
        ...skill,
        path: read.path,
        instructions: read.instructions,
      };
      if (!parseSkillDetailResponse(response).ok) {
        res
          .status(500)
          .json(skillsError("skills_internal_error", "Failed to read skill"));
        return;
      }
      res.json(response);
    } catch {
      res
        .status(500)
        .json(skillsError("skills_internal_error", "Failed to read skill"));
    }
  });
}
