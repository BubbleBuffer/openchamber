import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_FILE,
  OPENCODE_CONFIG_DIR,
  COMMAND_DIR,
  COMMAND_SCOPE,
  ensureDirs,
  parseMdFile,
  writeMdFile,
  readConfigLayers,
  writeConfig,
  getJsonEntrySource,
  getJsonWriteTarget,
  isPromptFileReference,
  resolvePromptFilePath,
  writePromptFile,
} from "./shared.js";

import type { CommandScopeResult, CommandSources } from "./types.js";

// ============== COMMAND SCOPE HELPERS ==============

/**
 * Ensure project-level command directory exists
 */
export function ensureProjectCommandDir(workingDirectory: string): string {
  const projectCommandDir = path.join(workingDirectory, ".opencode", "commands");
  if (!fs.existsSync(projectCommandDir)) {
    fs.mkdirSync(projectCommandDir, { recursive: true });
  }
  const legacyProjectCommandDir = path.join(
    workingDirectory,
    ".opencode",
    "command"
  );
  if (!fs.existsSync(legacyProjectCommandDir)) {
    fs.mkdirSync(legacyProjectCommandDir, { recursive: true });
  }
  return projectCommandDir;
}

/**
 * Get project-level command path
 */
export function getProjectCommandPath(
  workingDirectory: string,
  commandName: string
): string {
  const pluralPath = path.join(
    workingDirectory,
    ".opencode",
    "commands",
    `${commandName}.md`
  );
  const legacyPath = path.join(
    workingDirectory,
    ".opencode",
    "command",
    `${commandName}.md`
  );
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

/**
 * Get user-level command path
 */
export function getUserCommandPath(commandName: string): string {
  const pluralPath = path.join(COMMAND_DIR, `${commandName}.md`);
  const legacyPath = path.join(OPENCODE_CONFIG_DIR, "command", `${commandName}.md`);
  if (fs.existsSync(legacyPath) && !fs.existsSync(pluralPath)) return legacyPath;
  return pluralPath;
}

/**
 * Determine command scope based on where the .md file exists
 * Priority: project level > user level > null (built-in only)
 */
export function getCommandScope(
  commandName: string,
  workingDirectory: string | null
): CommandScopeResult {
  if (workingDirectory) {
    const projectPath = getProjectCommandPath(workingDirectory, commandName);
    if (fs.existsSync(projectPath)) {
      return { scope: COMMAND_SCOPE.PROJECT, path: projectPath };
    }
  }

  const userPath = getUserCommandPath(commandName);
  if (fs.existsSync(userPath)) {
    return { scope: COMMAND_SCOPE.USER, path: userPath };
  }

  return { scope: null, path: null };
}

/**
 * Get the path where a command should be written based on scope
 */
export function getCommandWritePath(
  commandName: string,
  workingDirectory: string | null,
  requestedScope: typeof COMMAND_SCOPE[keyof typeof COMMAND_SCOPE] | null
): CommandScopeResult {
  // For updates: check existing location first (project takes precedence)
  const existing = getCommandScope(commandName, workingDirectory);
  if (existing.path) {
    return existing;
  }

  // For new commands or built-in overrides: use requested scope or default to user
  const scope = requestedScope || COMMAND_SCOPE.USER;
  if (scope === COMMAND_SCOPE.PROJECT && workingDirectory) {
    return {
      scope: COMMAND_SCOPE.PROJECT,
      path: getProjectCommandPath(workingDirectory, commandName),
    };
  }

  return {
    scope: COMMAND_SCOPE.USER,
    path: getUserCommandPath(commandName),
  };
}

export function getCommandSources(
  commandName: string,
  workingDirectory: string | null
): CommandSources {
  const projectPath = workingDirectory
    ? getProjectCommandPath(workingDirectory, commandName)
    : null;
  const projectExists = !!(projectPath && fs.existsSync(projectPath));

  const userPath = getUserCommandPath(commandName);
  const userExists = fs.existsSync(userPath);

  const mdPath = projectExists ? projectPath : userExists ? userPath : null;
  const mdExists = !!mdPath;
  const mdScope = projectExists
    ? COMMAND_SCOPE.PROJECT
    : userExists
    ? COMMAND_SCOPE.USER
    : null;

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, "command", commandName);
  const jsonSection = jsonSource.section;
  const jsonPath =
    jsonSource.path ||
    layers.paths.customPath ||
    layers.paths.projectPath ||
    layers.paths.userPath;
  const jsonScope =
    jsonSource.path === layers.paths.projectPath
      ? COMMAND_SCOPE.PROJECT
      : COMMAND_SCOPE.USER;

  const sources: CommandSources = {
    md: {
      exists: mdExists,
      path: mdPath,
      scope: mdScope,
      fields: [],
    },
    json: {
      exists: jsonSource.exists,
      path: jsonPath,
      scope: jsonSource.exists ? jsonScope : null,
      fields: [],
    },
    projectMd: {
      exists: projectExists,
      path: projectPath,
    },
    userMd: {
      exists: userExists,
      path: userPath,
    },
  };

  if (mdExists && mdPath) {
    const { frontmatter, body } = parseMdFile(mdPath);
    sources.md.fields = Object.keys(frontmatter);
    if (body) {
      sources.md.fields.push("template");
    }
  }

  if (jsonSection) {
    sources.json.fields = Object.keys(jsonSection as Record<string, unknown>);
  }

  return sources;
}

export function createCommand(
  commandName: string,
  config: Record<string, unknown>,
  workingDirectory: string | null,
  scope: typeof COMMAND_SCOPE[keyof typeof COMMAND_SCOPE]
): void {
  ensureDirs();

  const projectPath = workingDirectory
    ? getProjectCommandPath(workingDirectory, commandName)
    : null;
  const userPath = getUserCommandPath(commandName);

  if (projectPath && fs.existsSync(projectPath)) {
    throw new Error(
      `Command ${commandName} already exists as project-level .md file`
    );
  }

  if (fs.existsSync(userPath)) {
    throw new Error(
      `Command ${commandName} already exists as user-level .md file`
    );
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, "command", commandName);
  if (jsonSource.exists) {
    throw new Error(`Command ${commandName} already exists in opencode.json`);
  }

  let targetPath: string;
  let targetScope: typeof COMMAND_SCOPE[keyof typeof COMMAND_SCOPE];

  if (scope === COMMAND_SCOPE.PROJECT && workingDirectory) {
    ensureProjectCommandDir(workingDirectory);
    targetPath = projectPath!;
    targetScope = COMMAND_SCOPE.PROJECT;
  } else {
    targetPath = userPath;
    targetScope = COMMAND_SCOPE.USER;
  }

  const { template, scope: _scopeFromConfig, ...frontmatter } = config;
  void _scopeFromConfig;

  writeMdFile(targetPath, frontmatter, (template as string) || "");
  console.log(
    `Created new command: ${commandName} (scope: ${targetScope}, path: ${targetPath})`
  );
}

export function updateCommand(
  commandName: string,
  updates: Record<string, unknown>,
  workingDirectory: string | null
): void {
  ensureDirs();

  const { scope, path: mdPath } = getCommandWritePath(
    commandName,
    workingDirectory,
    null
  );
  const mdExists = mdPath && fs.existsSync(mdPath);

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, "command", commandName);
  const jsonSection = jsonSource.section as Record<string, unknown> | null;
  const hasJsonFields =
    jsonSource.exists && jsonSection && Object.keys(jsonSection).length > 0;
  const jsonTarget = jsonSource.exists
    ? { config: jsonSource.config, path: jsonSource.path }
    : getJsonWriteTarget(
        layers,
        workingDirectory ? COMMAND_SCOPE.PROJECT : COMMAND_SCOPE.USER
      );
  let config = (jsonTarget.config as Record<string, unknown>) || {};

  const isBuiltinOverride = !mdExists && !hasJsonFields;

  let targetPath = mdPath;
  let targetScope = scope;

  if (!mdExists && isBuiltinOverride) {
    targetPath = getUserCommandPath(commandName);
    targetScope = COMMAND_SCOPE.USER;
  }

  const mdData = mdExists
    ? parseMdFile(mdPath!)
    : isBuiltinOverride
    ? { frontmatter: {} as Record<string, unknown>, body: "" }
    : null;

  let mdModified = false;
  let jsonModified = false;
  const creatingNewMd = isBuiltinOverride;

  for (const [field, value] of Object.entries(updates)) {
    if (field === "template") {
      const normalizedValue =
        typeof value === "string" ? value : value == null ? "" : String(value);

      if (mdExists || creatingNewMd) {
        if (mdData) {
          mdData.body = normalizedValue;
          mdModified = true;
        }
        continue;
      } else if (isPromptFileReference(jsonSection?.template)) {
        const templateFilePath = resolvePromptFilePath(
          jsonSection!.template as string
        );
        if (!templateFilePath) {
          throw new Error(
            `Invalid template file reference for command ${commandName}`
          );
        }
        writePromptFile(templateFilePath, normalizedValue);
        continue;
      } else if (isPromptFileReference(normalizedValue)) {
        if (!config.command) config.command = {};
        if (!config.command) config.command = {};
        if (!config.command) config.command = {} as Record<string, unknown>;
        if (!((config.command as Record<string, unknown>)[commandName])) {
          (config.command as Record<string, unknown>)[commandName] = {};
        }
        (
          (config.command as Record<string, unknown>)[commandName] as Record<
            string,
            unknown
          >
        ).template = normalizedValue;
        jsonModified = true;
        continue;
      }

      if (!config.command) config.command = {};
      if (!config.command) config.command = {};
      if (!config.command) config.command = {} as Record<string, unknown>;
      if (!((config.command as Record<string, unknown>)[commandName])) {
        (config.command as Record<string, unknown>)[commandName] = {};
      }
      (
        (config.command as Record<string, unknown>)[commandName] as Record<
          string,
          unknown
        >
      ).template = normalizedValue;
      jsonModified = true;
      continue;
    }

    const inMd = mdData?.frontmatter?.[field] !== undefined;
    const inJson = jsonSection?.[field] !== undefined;

    if (inJson) {
      if (!config.command) config.command = {};
      if (!config.command) config.command = {};
      if (!config.command) config.command = {} as Record<string, unknown>;
      if (!((config.command as Record<string, unknown>)[commandName])) {
        (config.command as Record<string, unknown>)[commandName] = {};
      }
      (
        (config.command as Record<string, unknown>)[commandName] as Record<
          string,
          unknown
        >
      )[field] = value;
      jsonModified = true;
    } else if (inMd || creatingNewMd) {
      if (mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      }
    } else {
      if ((mdExists || creatingNewMd) && mdData) {
        mdData.frontmatter[field] = value;
        mdModified = true;
      } else {
        if (!config.command) config.command = {};
        if (!config.command) config.command = {};
        if (!config.command) config.command = {} as Record<string, unknown>;
        if (!((config.command as Record<string, unknown>)[commandName])) {
          (config.command as Record<string, unknown>)[commandName] = {};
        }
        (
          (config.command as Record<string, unknown>)[commandName] as Record<
            string,
            unknown
          >
        )[field] = value;
        jsonModified = true;
      }
    }
  }

  if (mdModified && mdData) {
    writeMdFile(targetPath!, mdData.frontmatter, mdData.body);
  }

  if (jsonModified) {
    writeConfig(config, jsonTarget.path || CONFIG_FILE);
  }

  console.log(
    `Updated command: ${commandName} (scope: ${targetScope}, md: ${mdModified}, json: ${jsonModified})`
  );
}

export function deleteCommand(
  commandName: string,
  workingDirectory: string | null
): void {
  let deleted = false;

  if (workingDirectory) {
    const projectPath = getProjectCommandPath(workingDirectory, commandName);
    if (fs.existsSync(projectPath)) {
      fs.unlinkSync(projectPath);
      console.log(
        `Deleted project-level command .md file: ${projectPath}`
      );
      deleted = true;
    }
  }

  const userPath = getUserCommandPath(commandName);
  if (fs.existsSync(userPath)) {
    fs.unlinkSync(userPath);
    console.log(`Deleted user-level command .md file: ${userPath}`);
    deleted = true;
  }

  const layers = readConfigLayers(workingDirectory);
  const jsonSource = getJsonEntrySource(layers, "command", commandName);
  if (jsonSource.exists && jsonSource.config && jsonSource.path) {
    if (!((jsonSource.config as Record<string, unknown>)?.command)) {
      (jsonSource.config as Record<string, unknown>).command = {};
    }
    delete (
      (jsonSource.config as Record<string, unknown>).command as Record<
        string,
        unknown
      >
    )[commandName];
    writeConfig(jsonSource.config as Record<string, unknown>, jsonSource.path);
    console.log(`Removed command from opencode.json: ${commandName}`);
    deleted = true;
  }

  if (!deleted) {
    throw new Error(`Command "${commandName}" not found`);
  }
}
