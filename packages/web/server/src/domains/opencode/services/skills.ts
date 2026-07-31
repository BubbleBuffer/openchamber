import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  OPENCODE_CONFIG_DIR,
  SKILL_SCOPE,
  readConfig,
  walkSkillMdFiles,
  addSkillFromMdFile,
  resolveSkillSearchDirectories,
  getAncestors,
  findWorktreeRoot,
} from "./shared.js";
import type { SkillItem } from "./types.js";
import { createSkillDiscoveryCache } from "./skill-discovery-cache.js";

/** Discover the effective OpenCode-compatible skills without mutating them. */
function discoverSkillsUncached(workingDirectory: string | null): SkillItem[] {
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
  for (const directory of configDirectories) {
    for (const subDirectory of ["skill", "skills"]) {
      for (const skillMdPath of walkSkillMdFiles(path.join(directory, subDirectory))) {
        const isUserConfigDirectory =
          directory === OPENCODE_CONFIG_DIR ||
          directory === homeOpencodeDir ||
          (customConfigDir !== null && directory === customConfigDir);
        addSkillFromMdFile(
          skills,
          skillMdPath,
          isUserConfigDirectory ? SKILL_SCOPE.USER : SKILL_SCOPE.PROJECT,
          "opencode",
        );
      }
    }
  }

  let configuredPaths: string[] = [];
  try {
    const config = readConfig(workingDirectory);
    const skillsConfig = (config as Record<string, unknown>)?.skills as
      | Record<string, unknown>
      | undefined;
    configuredPaths = Array.isArray(skillsConfig?.paths)
      ? (skillsConfig.paths as string[])
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

  const cacheCandidates = process.env.XDG_CACHE_HOME
    ? [
        path.join(process.env.XDG_CACHE_HOME, "opencode", "skills"),
        path.join(os.homedir(), ".cache", "opencode", "skills"),
        path.join(os.homedir(), "Library", "Caches", "opencode", "skills"),
      ]
    : [
        path.join(os.homedir(), ".cache", "opencode", "skills"),
        path.join(os.homedir(), "Library", "Caches", "opencode", "skills"),
      ];

  for (const cacheRoot of cacheCandidates) {
    if (!fs.existsSync(cacheRoot)) continue;
    for (const entry of fs.readdirSync(cacheRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const skillMdPath of walkSkillMdFiles(path.join(cacheRoot, entry.name))) {
        addSkillFromMdFile(skills, skillMdPath, SKILL_SCOPE.USER, "opencode");
      }
    }
  }

  return Array.from(skills.values());
}

const skillDiscoveryCache = createSkillDiscoveryCache(discoverSkillsUncached);

/**
 * Listing and immediately opening a skill are normally one UI burst. Reuse
 * that directory-scoped scan briefly instead of synchronously walking and
 * parsing every configured skill root twice.
 */
export function discoverSkills(workingDirectory: string | null): SkillItem[] {
  return skillDiscoveryCache.get(workingDirectory);
}
