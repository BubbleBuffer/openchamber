import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SKILL_DIR,
  OPENCODE_CONFIG_DIR,
  SKILL_SCOPE,
  ensureDirs,
  parseMdFile,
  writeMdFile,
  readConfigLayers,
  readConfig,
  walkSkillMdFiles,
  addSkillFromMdFile,
  resolveSkillSearchDirectories,
  listSkillSupportingFiles,
  readSkillSupportingFile,
  writeSkillSupportingFile,
  deleteSkillSupportingFile,
  getAncestors,
  findWorktreeRoot,
} from "./shared.js";

import type { SkillItem, SkillScopeResult, SkillSources, SkillSupportingFile } from "./types.js";

export function ensureProjectSkillDir(workingDirectory: string): string {
  const projectSkillDir = path.join(workingDirectory, ".opencode", "skills");
  if (!fs.existsSync(projectSkillDir)) {
    fs.mkdirSync(projectSkillDir, { recursive: true });
  }
  const legacyProjectSkillDir = path.join(
    workingDirectory,
    ".opencode",
    "skill"
  );
  if (!fs.existsSync(legacyProjectSkillDir)) {
    fs.mkdirSync(legacyProjectSkillDir, { recursive: true });
  }
  return projectSkillDir;
}

export function getProjectSkillDir(
  workingDirectory: string,
  skillName: string
): string {
  const pluralPath = path.join(workingDirectory, ".opencode", "skills", skillName);
  const legacyPath = path.join(workingDirectory, ".opencode", "skill", skillName);
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

export function getProjectSkillPath(
  workingDirectory: string,
  skillName: string
): string {
  const pluralPath = path.join(
    workingDirectory,
    ".opencode",
    "skills",
    skillName,
    "SKILL.md"
  );
  const legacyPath = path.join(
    workingDirectory,
    ".opencode",
    "skill",
    skillName,
    "SKILL.md"
  );
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

export function getUserSkillDir(skillName: string): string {
  const pluralPath = path.join(SKILL_DIR, skillName);
  const legacyPath = path.join(OPENCODE_CONFIG_DIR, "skill", skillName);
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

export function getUserSkillPath(skillName: string): string {
  const pluralPath = path.join(SKILL_DIR, skillName, "SKILL.md");
  const legacyPath = path.join(
    OPENCODE_CONFIG_DIR,
    "skill",
    skillName,
    "SKILL.md"
  );
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

export function getClaudeSkillDir(
  workingDirectory: string,
  skillName: string
): string {
  return path.join(workingDirectory, ".claude", "skills", skillName);
}

export function getClaudeSkillPath(
  workingDirectory: string,
  skillName: string
): string {
  return path.join(getClaudeSkillDir(workingDirectory, skillName), "SKILL.md");
}

export function getUserAgentsSkillDir(skillName: string): string {
  return path.join(os.homedir(), ".agents", "skills", skillName);
}

export function getUserAgentsSkillPath(skillName: string): string {
  return path.join(getUserAgentsSkillDir(skillName), "SKILL.md");
}

export function getProjectAgentsSkillDir(
  workingDirectory: string,
  skillName: string
): string {
  return path.join(workingDirectory, ".agents", "skills", skillName);
}

export function getProjectAgentsSkillPath(
  workingDirectory: string,
  skillName: string
): string {
  return path.join(
    getProjectAgentsSkillDir(workingDirectory, skillName),
    "SKILL.md"
  );
}

export function getSkillScope(
  skillName: string,
  workingDirectory: string | null
): SkillScopeResult {
  const discovered = discoverSkills(workingDirectory).find(
    (skill) => skill.name === skillName
  );
  if (discovered?.path) {
    return {
      scope: discovered.scope || null,
      path: discovered.path,
      source: discovered.source || null,
    };
  }

  if (workingDirectory) {
    const projectPath = getProjectSkillPath(workingDirectory, skillName);
    if (fs.existsSync(projectPath)) {
      return { scope: SKILL_SCOPE.PROJECT, path: projectPath, source: "opencode" };
    }

    const claudePath = getClaudeSkillPath(workingDirectory, skillName);
    if (fs.existsSync(claudePath)) {
      return {
        scope: SKILL_SCOPE.PROJECT,
        path: claudePath,
        source: "claude",
      };
    }
  }

  const userPath = getUserSkillPath(skillName);
  if (fs.existsSync(userPath)) {
    return { scope: SKILL_SCOPE.USER, path: userPath, source: "opencode" };
  }

  return { scope: null, path: null, source: null };
}

export function getSkillWritePath(
  skillName: string,
  workingDirectory: string | null,
  requestedScope: typeof SKILL_SCOPE[keyof typeof SKILL_SCOPE] | null
): SkillScopeResult {
  const existing = getSkillScope(skillName, workingDirectory);
  if (existing.path) {
    return existing;
  }

  const scope = requestedScope || SKILL_SCOPE.USER;
  if (scope === SKILL_SCOPE.PROJECT && workingDirectory) {
    return {
      scope: SKILL_SCOPE.PROJECT,
      path: getProjectSkillPath(workingDirectory, skillName),
      source: "opencode",
    };
  }

  return {
    scope: SKILL_SCOPE.USER,
    path: getUserSkillPath(skillName),
    source: "opencode",
  };
}

export function discoverSkills(workingDirectory: string | null): SkillItem[] {
  const skills = new Map<
    string,
    { name: string; path: string; scope: string; source: string; description: string }
  >();

  for (const externalRootName of [".claude", ".agents"]) {
    const homeRoot = path.join(os.homedir(), externalRootName, "skills");
    const source = externalRootName === ".agents" ? "agents" : "claude";
    for (const skillMdPath of walkSkillMdFiles(homeRoot)) {
      addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.USER, source);
    }
  }

  if (workingDirectory) {
    const worktreeRoot =
      findWorktreeRoot(workingDirectory) || path.resolve(workingDirectory);
    const ancestors = getAncestors(workingDirectory, worktreeRoot);
    for (const ancestor of ancestors) {
      for (const externalRootName of [".claude", ".agents"]) {
        const source = externalRootName === ".agents" ? "agents" : "claude";
        const externalSkillsRoot = path.join(ancestor, externalRootName, "skills");
        for (const skillMdPath of walkSkillMdFiles(externalSkillsRoot)) {
          addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.PROJECT, source);
        }
      }
    }
  }

  const configDirectories = resolveSkillSearchDirectories(workingDirectory);
  const homeOpencodeDir = path.resolve(path.join(os.homedir(), ".opencode"));
  const customConfigDir = process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : null;
  for (const dir of configDirectories) {
    for (const subDir of ["skill", "skills"]) {
      const root = path.join(dir, subDir);
      for (const skillMdPath of walkSkillMdFiles(root)) {
        const isUserConfigDir =
          dir === OPENCODE_CONFIG_DIR ||
          dir === homeOpencodeDir ||
          (customConfigDir && dir === customConfigDir);
        const scope = isUserConfigDir ? SKILL_SCOPE.USER : SKILL_SCOPE.PROJECT;
        addSkillFromMdFile(skills, skillMdPath, scope, "opencode");
      }
    }
  }

  let configuredPaths: string[] = [];
  try {
    const config = readConfig(workingDirectory) as any;
    configuredPaths = Array.isArray(config?.skills?.paths)
      ? (config.skills.paths as string[])
      : [];
  } catch {
    configuredPaths = [];
  }
  for (const skillPath of configuredPaths) {
    if (typeof skillPath !== "string" || !skillPath.trim()) continue;
    const expanded = skillPath.startsWith("~/")
      ? path.join(os.homedir(), skillPath.slice(2))
      : skillPath;
    const resolved = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(workingDirectory || process.cwd(), expanded);
    for (const skillMdPath of walkSkillMdFiles(resolved)) {
      addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.PROJECT, "opencode");
    }
  }

  const cacheCandidates = [];
  if (process.env.XDG_CACHE_HOME) {
    cacheCandidates.push(path.join(process.env.XDG_CACHE_HOME, "opencode", "skills"));
  }
  cacheCandidates.push(path.join(os.homedir(), ".cache", "opencode", "skills"));
  cacheCandidates.push(
    path.join(os.homedir(), "Library", "Caches", "opencode", "skills")
  );

  for (const cacheRoot of cacheCandidates) {
    if (!fs.existsSync(cacheRoot)) continue;
    const entries = fs.readdirSync(cacheRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillRoot = path.join(cacheRoot, entry.name);
      for (const skillMdPath of walkSkillMdFiles(skillRoot)) {
        addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.USER, "opencode");
      }
    }
  }

  return Array.from(skills.values());
}

export function getSkillSources(
  skillName: string,
  workingDirectory: string | null,
  discoveredSkill: SkillItem | null = null
): SkillSources {
  const projectPath = workingDirectory
    ? getProjectSkillPath(workingDirectory, skillName)
    : null;
  const projectExists = !!(projectPath && fs.existsSync(projectPath));
  const projectDir = projectExists ? path.dirname(projectPath!) : null;

  const claudePath = workingDirectory
    ? getClaudeSkillPath(workingDirectory, skillName)
    : null;
  const claudeExists = !!(claudePath && fs.existsSync(claudePath));
  const claudeDir = claudeExists ? path.dirname(claudePath!) : null;

  const userPath = getUserSkillPath(skillName);
  const userExists = fs.existsSync(userPath);
  const userDir = userExists ? path.dirname(userPath) : null;

  const matchedDiscovered =
    discoveredSkill && discoveredSkill.name === skillName
      ? discoveredSkill
      : discoverSkills(workingDirectory).find((skill) => skill.name === skillName);

  let mdPath: string | null = null;
  let mdScope: string | null = null;
  let mdSource: string | null = null;
  let mdDir: string | null = null;

  if (projectExists) {
    mdPath = projectPath;
    mdScope = SKILL_SCOPE.PROJECT;
    mdSource = "opencode";
    mdDir = projectDir;
  } else if (claudeExists) {
    mdPath = claudePath;
    mdScope = SKILL_SCOPE.PROJECT;
    mdSource = "claude";
    mdDir = claudeDir;
  } else if (userExists) {
    mdPath = userPath;
    mdScope = SKILL_SCOPE.USER;
    mdSource = "opencode";
    mdDir = userDir;
  } else if (matchedDiscovered?.path) {
    mdPath = matchedDiscovered.path;
    mdScope = matchedDiscovered.scope || null;
    mdSource = matchedDiscovered.source || null;
    mdDir = path.dirname(matchedDiscovered.path);
  }

  const mdExists = !!mdPath;

  const sources: SkillSources = {
    md: {
      exists: mdExists,
      path: mdPath,
      dir: mdDir,
      scope: mdScope,
      source: mdSource,
      fields: [],
      supportingFiles: [] as SkillSupportingFile[],
    },
    projectMd: {
      exists: projectExists,
      path: projectPath,
      dir: projectDir,
    },
    claudeMd: {
      exists: claudeExists,
      path: claudePath,
      dir: claudeDir,
    },
    userMd: {
      exists: userExists,
      path: userPath,
      dir: userDir,
    },
  };

  if (mdExists && mdDir) {
    const { frontmatter, body } = parseMdFile(mdPath!);
    sources.md.fields = Object.keys(frontmatter);
    sources.md.description =
      (frontmatter.description as string) || "";
    sources.md.name = (frontmatter.name as string) || skillName;
    if (body) {
      sources.md.fields.push("instructions");
      sources.md.instructions = body;
    } else {
      sources.md.instructions = "";
    }
    sources.md.supportingFiles = listSkillSupportingFiles(mdDir);
  }

  return sources;
}

interface SkillConfig {
  instructions?: string;
  scope?: string;
  source?: string;
  supportingFiles?: Array<{ path: string; content?: string; delete?: boolean }>;
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export function createSkill(
  skillName: string,
  config: SkillConfig,
  workingDirectory: string | null,
  scope: typeof SKILL_SCOPE[keyof typeof SKILL_SCOPE]
): void {
  ensureDirs();

  if (
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(skillName) ||
    skillName.length > 64
  ) {
    throw new Error(
      `Invalid skill name "${skillName}". Must be 1-64 lowercase alphanumeric characters with hyphens, cannot start or end with hyphen.`
    );
  }

  const existing = getSkillScope(skillName, workingDirectory);
  if (existing.path) {
    throw new Error(`Skill ${skillName} already exists at ${existing.path}`);
  }

  let targetDir: string;
  let targetPath: string;
  let targetScope: typeof SKILL_SCOPE[keyof typeof SKILL_SCOPE];

  const requestedScope =
    scope === SKILL_SCOPE.PROJECT ? SKILL_SCOPE.PROJECT : SKILL_SCOPE.USER;
  const requestedSource = config?.source === "agents" ? "agents" : "opencode";

  if (requestedScope === SKILL_SCOPE.PROJECT && workingDirectory) {
    ensureProjectSkillDir(workingDirectory);
    if (requestedSource === "agents") {
      targetDir = getProjectAgentsSkillDir(workingDirectory, skillName);
      targetPath = getProjectAgentsSkillPath(workingDirectory, skillName);
    } else {
      targetDir = getProjectSkillDir(workingDirectory, skillName);
      targetPath = getProjectSkillPath(workingDirectory, skillName);
    }
    targetScope = SKILL_SCOPE.PROJECT;
  } else {
    if (requestedSource === "agents") {
      targetDir = getUserAgentsSkillDir(skillName);
      targetPath = getUserAgentsSkillPath(skillName);
    } else {
      targetDir = getUserSkillDir(skillName);
      targetPath = getUserSkillPath(skillName);
    }
    targetScope = SKILL_SCOPE.USER;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const {
    instructions,
    scope: _scopeFromConfig,
    source: _sourceFromConfig,
    supportingFiles,
    ...frontmatter
  } = config;
  void _scopeFromConfig;
  void _sourceFromConfig;

  if (!frontmatter.name) {
    frontmatter.name = skillName;
  }
  if (!frontmatter.description) {
    throw new Error("Skill description is required");
  }

  writeMdFile(targetPath, frontmatter, instructions || "");

  if (supportingFiles && Array.isArray(supportingFiles)) {
    for (const file of supportingFiles) {
      if (file.path && file.content !== undefined) {
        writeSkillSupportingFile(targetDir, file.path, file.content);
      }
    }
  }

  console.log(
    `Created new skill: ${skillName} (scope: ${targetScope}, path: ${targetPath})`
  );
}

interface SkillUpdateConfig {
  scope?: string;
  instructions?: unknown;
  supportingFiles?: Array<{ path: string; content?: string; delete?: boolean }>;
  [key: string]: unknown;
}

export function updateSkill(
  skillName: string,
  updates: SkillUpdateConfig,
  workingDirectory: string | null
): void {
  ensureDirs();

  const existing = getSkillScope(skillName, workingDirectory);
  if (!existing.path) {
    throw new Error(`Skill "${skillName}" not found`);
  }

  const mdPath = existing.path;
  const mdDir = path.dirname(mdPath);
  const mdData = parseMdFile(mdPath);

  let mdModified = false;

  for (const [field, value] of Object.entries(updates)) {
    if (field === "scope") {
      continue;
    }

    if (field === "instructions") {
      const normalizedValue =
        typeof value === "string" ? value : value == null ? "" : String(value);
      mdData.body = normalizedValue;
      mdModified = true;
      continue;
    }

    if (field === "supportingFiles") {
      if (Array.isArray(value)) {
        for (const file of value as Array<{ path: string; content?: string; delete?: boolean }>) {
          if (file.delete && file.path) {
            deleteSkillSupportingFile(mdDir, file.path);
          } else if (file.path && file.content !== undefined) {
            writeSkillSupportingFile(mdDir, file.path, file.content);
          }
        }
      }
      continue;
    }

    mdData.frontmatter[field] = value;
    mdModified = true;
  }

  if (mdModified) {
    writeMdFile(mdPath, mdData.frontmatter, mdData.body);
  }

  console.log(`Updated skill: ${skillName} (path: ${mdPath})`);
}

export function deleteSkill(skillName: string, workingDirectory: string | null): void {
  let deleted = false;

  if (workingDirectory) {
    const projectDir = getProjectSkillDir(workingDirectory, skillName);
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      console.log(
        `Deleted project-level skill directory: ${projectDir}`
      );
      deleted = true;
    }

    const claudeDir = getClaudeSkillDir(workingDirectory, skillName);
    if (fs.existsSync(claudeDir)) {
      fs.rmSync(claudeDir, { recursive: true, force: true });
      console.log(`Deleted claude-compat skill directory: ${claudeDir}`);
      deleted = true;
    }

    const projectAgentsDir = getProjectAgentsSkillDir(
      workingDirectory,
      skillName
    );
    if (fs.existsSync(projectAgentsDir)) {
      fs.rmSync(projectAgentsDir, { recursive: true, force: true });
      console.log(
        `Deleted project-level agents skill directory: ${projectAgentsDir}`
      );
      deleted = true;
    }
  }

  const userDir = getUserSkillDir(skillName);
  if (fs.existsSync(userDir)) {
    fs.rmSync(userDir, { recursive: true, force: true });
    console.log(`Deleted user-level skill directory: ${userDir}`);
    deleted = true;
  }

  const userAgentsDir = getUserAgentsSkillDir(skillName);
  if (fs.existsSync(userAgentsDir)) {
    fs.rmSync(userAgentsDir, { recursive: true, force: true });
    console.log(`Deleted user-level agents skill directory: ${userAgentsDir}`);
    deleted = true;
  }

  if (!deleted) {
    throw new Error(`Skill "${skillName}" not found`);
  }
}
