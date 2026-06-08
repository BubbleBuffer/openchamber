import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_FILE,
  AGENT_SCOPE,
  readConfigFile,
  readConfigLayers,
  getJsonEntrySource,
  getJsonWriteTarget,
  writeConfig,
} from "./shared.js";

import type { McpConfig, McpEntry } from "./types.js";

// ============== MCP CONFIG HELPERS ==============

/**
 * Validate MCP server name
 */
function validateMcpName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new Error("MCP server name is required");
  }
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/.test(name)) {
    throw new Error(
      "MCP server name must be lowercase alphanumeric with hyphens/underscores"
    );
  }
}

/**
 * List all MCP server configs from user-level opencode.json
 */
function resolveMcpScopeFromPath(
  layers: ReturnType<typeof readConfigLayers>,
  sourcePath: string | null
): string | null {
  if (!sourcePath) return null;
  return sourcePath === layers.paths.projectPath
    ? AGENT_SCOPE.PROJECT
    : AGENT_SCOPE.USER;
}

function ensureProjectMcpConfigPath(workingDirectory: string): string {
  const configDir = path.join(workingDirectory, ".opencode");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  return path.join(configDir, "opencode.json");
}

export function listMcpConfigs(workingDirectory: string | null): McpConfig[] {
  const layers = readConfigLayers(workingDirectory);
  const mcp = (layers?.mergedConfig?.mcp as Record<string, unknown>) || {};

  return Object.entries(mcp)
    .filter(
      ([, entry]) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
    )
    .map(([name, entry]) => {
      const source = getJsonEntrySource(layers, "mcp", name);
      return {
        name,
        ...buildMcpEntry(entry),
        scope: resolveMcpScopeFromPath(layers, source.path),
      } as McpConfig;
    });
}

/**
 * Get a single MCP server config by name
 */
export function getMcpConfig(
  name: string,
  workingDirectory: string | null
): McpConfig | null {
  const layers = readConfigLayers(workingDirectory);
  const entry = (layers?.mergedConfig?.mcp as Record<string, unknown>)?.[name];

  if (!entry) {
    return null;
  }
  const source = getJsonEntrySource(layers, "mcp", name);
  return {
    name,
    ...buildMcpEntry(entry),
    scope: resolveMcpScopeFromPath(layers, source.path),
  } as McpConfig;
}

/**
 * Create a new MCP server config entry
 */
export function createMcpConfig(
  name: string,
  mcpConfig: any,
  workingDirectory: string | null,
  scope: typeof AGENT_SCOPE[keyof typeof AGENT_SCOPE]
): void {
  validateMcpName(name);

  const layers = readConfigLayers(workingDirectory);
  const source = getJsonEntrySource(layers, "mcp", name);
  if (source.exists) {
    throw new Error(`MCP server "${name}" already exists`);
  }

  let targetPath = CONFIG_FILE;
  let config: Record<string, unknown> = {};

  if (scope === AGENT_SCOPE.PROJECT) {
    if (!workingDirectory) {
      throw new Error("Project scope requires working directory");
    }
    targetPath = ensureProjectMcpConfigPath(workingDirectory);
    config = fs.existsSync(targetPath) ? readConfigFile(targetPath) : {};
  } else {
    const jsonTarget = getJsonWriteTarget(layers, AGENT_SCOPE.USER);
    targetPath = jsonTarget.path || CONFIG_FILE;
    config = jsonTarget.config || {};
  }

  if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) {
    config.mcp = {};
  }

  const { name: _ignoredName, ...entryData } = mcpConfig;
  (config.mcp as Record<string, unknown>)[name] = buildMcpEntry(entryData);

  writeConfig(config, targetPath);
  console.log(`Created MCP server config: ${name}`);
}

/**
 * Update an existing MCP server config entry
 */
export function updateMcpConfig(
  name: string,
  updates: any,
  workingDirectory: string | null
): void {
  const layers = readConfigLayers(workingDirectory);
  const source = getJsonEntrySource(layers, "mcp", name);

  if (!source.exists) {
    throw new Error(`MCP server "${name}" not found`);
  }

  const targetPath = source.path || CONFIG_FILE;
  const config =
    (source.config as Record<string, unknown>) ||
    (fs.existsSync(targetPath) ? readConfigFile(targetPath) : {});

  if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) {
    config.mcp = {};
  }

  const existing = ((config.mcp as Record<string, unknown>)[name] as Partial<McpEntry>) || {};
  const { name: _ignoredName, ...updateData } = updates;

  (config.mcp as Record<string, unknown>)[name] = buildMcpEntry({
    ...existing,
    ...updateData,
  });

  writeConfig(config, targetPath);
  console.log(`Updated MCP server config: ${name}`);
}

/**
 * Delete an MCP server config entry
 */
export function deleteMcpConfig(
  name: string,
  workingDirectory: string | null
): void {
  const layers = readConfigLayers(workingDirectory);
  const source = getJsonEntrySource(layers, "mcp", name);
  const targetPath = source.path || CONFIG_FILE;
  const config =
    (source.config as Record<string, unknown>) ||
    (fs.existsSync(targetPath) ? readConfigFile(targetPath) : {});

  if (
    !config.mcp ||
    typeof config.mcp !== "object" ||
    ((config.mcp as Record<string, unknown>)[name] as unknown) === undefined
  ) {
    throw new Error(`MCP server "${name}" not found`);
  }

  delete (config.mcp as Record<string, unknown>)[name];

  if (Object.keys(config.mcp as Record<string, unknown>).length === 0) {
    delete config.mcp;
  }

  writeConfig(config, targetPath);
  console.log(`Deleted MCP server config: ${name}`);
}

/**
 * Build a clean MCP entry object, omitting undefined/null values
 */
function buildMcpEntry(data: unknown): Partial<McpEntry> {
  const entry: Partial<McpEntry> & Record<string, unknown> =
    data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>) }
      : {};

  delete entry.name;
  delete entry.scope;

  // type is required
  entry.type = (data as Record<string, unknown>)?.type === "remote" ? "remote" : "local";

  if (entry.type === "local") {
    // command must be a non-empty array of strings
    if (Array.isArray((data as Record<string, unknown>)?.command) && ((data as Record<string, unknown>)?.command as unknown[]).length > 0) {
      entry.command = ((data as Record<string, unknown>)?.command as unknown[]).map(String);
    } else {
      delete entry.command;
    }

    delete entry.url;
    delete entry.headers;
    delete entry.oauth;
    delete entry.timeout;
  } else {
    // remote: url required
    if (
      typeof (data as Record<string, unknown>)?.url === "string"
    ) {
      entry.url = ((data as Record<string, unknown>)?.url as string).trim();
    } else {
      delete entry.url;
    }

    delete entry.command;

    if (
      (data as Record<string, unknown>)?.headers &&
      typeof (data as Record<string, unknown>)?.headers === "object" &&
      !Array.isArray((data as Record<string, unknown>)?.headers)
    ) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        (data as Record<string, unknown>)?.headers as Record<string, unknown>
      )) {
        if (k && v !== undefined && v !== null) {
          cleaned[k] = String(v);
        }
      }
      if (Object.keys(cleaned).length > 0) {
        entry.headers = cleaned;
      } else {
        delete entry.headers;
      }
    } else if ((data as Record<string, unknown>)?.headers === undefined) {
      delete entry.headers;
    }

    if ((data as Record<string, unknown>)?.oauth === false) {
      entry.oauth = { oauth: false } as unknown as McpEntry["oauth"];
    } else if (
      (data as Record<string, unknown>)?.oauth &&
      typeof (data as Record<string, unknown>)?.oauth === "object" &&
      !Array.isArray((data as Record<string, unknown>)?.oauth)
    ) {
      const oauthData = (data as Record<string, unknown>)?.oauth as Record<
        string,
        unknown
      >;
      const oauth: NonNullable<McpEntry["oauth"]> = {};
      if (typeof oauthData?.clientId === "string" && oauthData.clientId.trim()) {
        oauth.clientId = oauthData.clientId.trim();
      }
      if (
        typeof oauthData?.clientSecret === "string" &&
        oauthData.clientSecret.trim()
      ) {
        oauth.clientSecret = oauthData.clientSecret.trim();
      }
      if (typeof oauthData?.scope === "string" && oauthData.scope.trim()) {
        oauth.scope = oauthData.scope.trim();
      }
      if (
        typeof oauthData?.redirectUri === "string" &&
        oauthData.redirectUri.trim()
      ) {
        oauth.redirectUri = oauthData.redirectUri.trim();
      }
      if (Object.keys(oauth).length > 0) {
        entry.oauth = oauth;
      } else {
        delete entry.oauth;
      }
    } else if ((data as Record<string, unknown>)?.oauth === undefined) {
      delete entry.oauth;
    }

    if (
      typeof (data as Record<string, unknown>)?.timeout === "number" &&
      Number.isFinite((data as Record<string, unknown>)?.timeout) &&
      ((data as Record<string, unknown>)?.timeout as number) > 0
    ) {
      entry.timeout = (data as Record<string, unknown>)?.timeout as number;
    } else if (
      (data as Record<string, unknown>)?.timeout === undefined ||
      (data as Record<string, unknown>)?.timeout === null ||
      (data as Record<string, unknown>)?.timeout === ""
    ) {
      delete entry.timeout;
    }
  }

  // environment: flat Record<string, string>
  if (
    (data as Record<string, unknown>)?.environment &&
    typeof (data as Record<string, unknown>)?.environment === "object" &&
    !Array.isArray((data as Record<string, unknown>)?.environment)
  ) {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      (data as Record<string, unknown>)?.environment as Record<string, unknown>
    )) {
      if (k && v !== undefined && v !== null) {
        cleaned[k] = String(v);
      }
    }
    if (Object.keys(cleaned).length > 0) {
      entry.environment = cleaned;
    } else {
      delete entry.environment;
    }
  } else if ((data as Record<string, unknown>)?.environment === undefined) {
    delete entry.environment;
  }

  // enabled defaults to true
  entry.enabled = (data as Record<string, unknown>)?.enabled !== false;

  return entry;
}
