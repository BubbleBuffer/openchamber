import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "yaml";
import { parse as parseJsonc } from "jsonc-parser";

import type {
  ConfigLayers,
  JsonEntrySource,
} from "./types.js";

// ============== PATH CONSTANTS ==============

export const OPENCODE_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
export const AGENT_DIR = path.join(OPENCODE_CONFIG_DIR, "agents");
export const COMMAND_DIR = path.join(OPENCODE_CONFIG_DIR, "commands");
export const CONFIG_FILE = path.join(OPENCODE_CONFIG_DIR, "config.json");
export const CUSTOM_CONFIG_FILE = process.env.OPENCODE_CONFIG
  ? path.resolve(process.env.OPENCODE_CONFIG)
  : null;
export const PROMPT_FILE_PATTERN = /^\{file:(.+)\}$/i;

// ============== SCOPE TYPE CONSTANTS ==============

export const AGENT_SCOPE = {
  USER: "user",
  PROJECT: "project",
} as const;

export const COMMAND_SCOPE = {
  USER: "user",
  PROJECT: "project",
} as const;

export const SKILL_SCOPE = {
  USER: "user",
  PROJECT: "project",
} as const;

// ============== DIRECTORY OPERATIONS ==============

export function ensureDirs(): void {
  if (!fs.existsSync(OPENCODE_CONFIG_DIR)) {
    fs.mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(AGENT_DIR)) {
    fs.mkdirSync(AGENT_DIR, { recursive: true });
  }
  if (!fs.existsSync(COMMAND_DIR)) {
    fs.mkdirSync(COMMAND_DIR, { recursive: true });
  }
}

// ============== MARKDOWN FILE OPERATIONS ==============

export function parseMdFile(filePath: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const content = fs.readFileSync(filePath, "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content.trim() };
  }

  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = yaml.parse(match[1]) || {};
  } catch (error) {
    console.warn(
      `Failed to parse markdown frontmatter ${filePath}, treating as empty:`,
      error
    );
    frontmatter = {};
  }

  const body = match[2].trim();
  return { frontmatter, body };
}

export function writeMdFile(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string
): void {
  try {
    const cleanedFrontmatter = Object.fromEntries(
      Object.entries(frontmatter).filter(([, value]) => value != null)
    );
    const yamlStr = yaml.stringify(cleanedFrontmatter);
    const content = `---\n${yamlStr}---\n\n${body}`;
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Successfully wrote markdown file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write markdown file ${filePath}:`, error);
    throw new Error("Failed to write agent markdown file");
  }
}

// ============== CONFIG FILE OPERATIONS ==============

export function getProjectConfigCandidates(workingDirectory: string | null): string[] {
  if (!workingDirectory) return [];
  return [
    path.join(workingDirectory, "opencode.json"),
    path.join(workingDirectory, "opencode.jsonc"),
    path.join(workingDirectory, ".opencode", "opencode.json"),
    path.join(workingDirectory, ".opencode", "opencode.jsonc"),
  ];
}

export function getProjectConfigPath(workingDirectory: string | null): string | null {
  if (!workingDirectory) return null;

  const candidates = getProjectConfigCandidates(workingDirectory);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function getConfigPaths(workingDirectory: string | null): {
  userPaths: string[];
  projectPath: string | null;
  customPath: string | null;
} {
  return {
    userPaths: [
      path.join(OPENCODE_CONFIG_DIR, "config.json"),
      path.join(OPENCODE_CONFIG_DIR, "opencode.json"),
      path.join(OPENCODE_CONFIG_DIR, "opencode.jsonc"),
    ],
    projectPath: getProjectConfigPath(workingDirectory),
    customPath: CUSTOM_CONFIG_FILE,
  };
}

export function getPrimaryUserConfigPath(userPaths: string[]): string {
  for (const userPath of userPaths) {
    if (fs.existsSync(userPath)) {
      return userPath;
    }
  }

  return CONFIG_FILE;
}

export function readConfigFile(filePath: string | null): Record<string, unknown> {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const normalized = content.trim();
    if (!normalized) {
      return {};
    }
    return parseJsonc(normalized, [], { allowTrailingComma: true }) as Record<string, unknown>;
  } catch (error) {
    console.error(`Failed to read config file: ${filePath}`, error);
    throw new Error("Failed to read OpenCode configuration");
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeConfigs(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key in result) {
      const baseValue = result[key];
      if (isPlainObject(baseValue) && isPlainObject(value)) {
        result[key] = mergeConfigs(baseValue, value);
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function readConfigLayers(workingDirectory: string | null): ConfigLayers {
  const { userPaths, projectPath, customPath } = getConfigPaths(workingDirectory);
  const userPath = getPrimaryUserConfigPath(userPaths);
  const userConfig = readConfigFile(userPath);
  const projectConfig = readConfigFile(projectPath);
  const customConfig = readConfigFile(customPath);
  const mergedConfig = mergeConfigs(
    mergeConfigs(userConfig, projectConfig),
    customConfig
  );

  return {
    userConfig,
    projectConfig,
    customConfig,
    mergedConfig,
    paths: { userPath, projectPath, customPath },
  };
}

export function readConfig(workingDirectory: string | null): Record<string, unknown> {
  return readConfigLayers(workingDirectory).mergedConfig;
}

export function getConfigForPath(
  layers: ConfigLayers,
  targetPath: string | null
): Record<string, unknown> {
  if (!targetPath) {
    return layers.userConfig;
  }
  if (layers.paths.customPath && targetPath === layers.paths.customPath) {
    return layers.customConfig;
  }
  if (layers.paths.projectPath && targetPath === layers.paths.projectPath) {
    return layers.projectConfig;
  }
  return layers.userConfig;
}

export function writeConfig(
  config: Record<string, unknown>,
  filePath: string = CONFIG_FILE
): void {
  try {
    if (fs.existsSync(filePath)) {
      const backupFile = `${filePath}.openchamber.backup`;
      fs.copyFileSync(filePath, backupFile);
      console.log(`Created config backup: ${backupFile}`);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
    console.log(`Successfully wrote config file: ${filePath}`);
  } catch (error) {
    console.error(`Failed to write config file: ${filePath}`, error);
    throw new Error("Failed to write OpenCode configuration");
  }
}

export function getJsonEntrySource(
  layers: ConfigLayers,
  sectionKey: string,
  entryName: string
): JsonEntrySource {
  const { userConfig, projectConfig, customConfig, paths } = layers;
  const customSection = (customConfig as Record<string, Record<string, unknown>>)?.[sectionKey]?.[entryName];
  if (customSection !== undefined) {
    return {
      section: customSection,
      config: customConfig as Record<string, unknown>,
      path: paths.customPath,
      exists: true,
    };
  }

  const projectSection = (projectConfig as Record<string, Record<string, unknown>>)?.[sectionKey]?.[entryName];
  if (projectSection !== undefined) {
    return {
      section: projectSection,
      config: projectConfig as Record<string, unknown>,
      path: paths.projectPath,
      exists: true,
    };
  }

  const userSection = (userConfig as Record<string, Record<string, unknown>>)?.[sectionKey]?.[entryName];
  if (userSection !== undefined) {
    return {
      section: userSection,
      config: userConfig as Record<string, unknown>,
      path: paths.userPath,
      exists: true,
    };
  }

  return { section: null, config: null, path: null, exists: false };
}

export function getJsonWriteTarget(
  layers: ConfigLayers,
  preferredScope: typeof AGENT_SCOPE[keyof typeof AGENT_SCOPE]
): { config: Record<string, unknown> | null; path: string | null } {
  const { userConfig, projectConfig, customConfig, paths } = layers;
  if (paths.customPath) {
    return { config: customConfig as Record<string, unknown>, path: paths.customPath };
  }
  if (preferredScope === AGENT_SCOPE.PROJECT && paths.projectPath) {
    return { config: projectConfig as Record<string, unknown>, path: paths.projectPath };
  }
  return { config: userConfig as Record<string, unknown>, path: paths.userPath };
}

// ============== GIT/WORKTREE HELPERS ==============

export function getAncestors(startDir: string | null, stopDir: string | null): string[] {
  if (!startDir) return [];
  const result: string[] = [];
  let current = path.resolve(startDir);
  const resolvedStop = stopDir ? path.resolve(stopDir) : null;

  while (true) {
    result.push(current);
    if (resolvedStop && current === resolvedStop) {
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return result;
}

export function findWorktreeRoot(startDir: string | null): string | null {
  if (!startDir) return null;
  let current = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

// ============== PROMPT FILE HELPERS ==============

export function isPromptFileReference(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return PROMPT_FILE_PATTERN.test(value.trim());
}

export function resolvePromptFilePath(reference: string): string | null {
  const match =
    typeof reference === "string" ? reference.trim().match(PROMPT_FILE_PATTERN) : null;
  if (!match) {
    return null;
  }
  let target = match[1].trim();
  if (!target) {
    return null;
  }

  if (target.startsWith("./")) {
    target = target.slice(2);
    target = path.join(OPENCODE_CONFIG_DIR, target);
  } else if (!path.isAbsolute(target)) {
    target = path.join(OPENCODE_CONFIG_DIR, target);
  }

  return target;
}

export function writePromptFile(filePath: string, content: string | null): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content ?? "", "utf8");
  console.log(`Updated prompt file: ${filePath}`);
}

// ============== SKILL FILE OPERATIONS ==============

const MAX_DISCOVERED_SKILL_BYTES = 1024 * 1024;
const MAX_SKILL_FRONTMATTER_BYTES = 64 * 1024;

export function walkSkillMdFiles(rootDir: string | null): string[] {
  if (!rootDir || !fs.existsSync(rootDir)) return [];

  const results: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        results.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return results;
}

export function addSkillFromMdFile(
  skillsMap: Map<string, { name: string; path: string; scope: string; source: string; description: string }>,
  skillMdPath: string,
  scope: string,
  source: string
): void {
  let frontmatter: Record<string, unknown>;
  try {
    const stat = fs.statSync(skillMdPath);
    if (!stat.isFile() || stat.size > MAX_DISCOVERED_SKILL_BYTES) return;

    const length = Math.min(stat.size, MAX_SKILL_FRONTMATTER_BYTES);
    const buffer = Buffer.alloc(length);
    const descriptor = fs.openSync(skillMdPath, "r");
    try {
      fs.readSync(descriptor, buffer, 0, length, 0);
    } finally {
      fs.closeSync(descriptor);
    }

    const prefix = buffer.toString("utf8");
    const match = prefix.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!match) return;
    const parsed = yaml.parse(match[1]);
    frontmatter = parsed && typeof parsed === "object"
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return;
  }

  const name =
    typeof frontmatter.name === "string"
      ? frontmatter.name.trim()
      : "";
  const description =
    typeof frontmatter.description === "string"
      ? frontmatter.description
      : "";

  if (!name) {
    return;
  }

  skillsMap.set(name, {
    name,
    path: skillMdPath,
    scope,
    source,
    description,
  });
}

export function resolveSkillSearchDirectories(workingDirectory: string | null): string[] {
  const directories: string[] = [];
  const pushDir = (dir: string | null): void => {
    if (!dir) return;
    const resolved = path.resolve(dir);
    if (!directories.includes(resolved)) {
      directories.push(resolved);
    }
  };

  pushDir(OPENCODE_CONFIG_DIR);

  if (workingDirectory) {
    const worktreeRoot = findWorktreeRoot(workingDirectory) || path.resolve(workingDirectory);
    const projectDirs = getAncestors(workingDirectory, worktreeRoot).map((dir) =>
      path.join(dir, ".opencode")
    );
    projectDirs.forEach(pushDir);
  }

  pushDir(path.join(os.homedir(), ".opencode"));

  const customConfigDir = process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : null;
  pushDir(customConfigDir);

  return directories;
}
