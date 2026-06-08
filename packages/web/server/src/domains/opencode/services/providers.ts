import {
  CONFIG_FILE,
  readConfigLayers,
  getConfigForPath,
  writeConfig,
} from "./shared.js";

import type { ProviderSources } from "./types.js";

function isPlainObjectCheck(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function getProviderSources(
  providerId: string,
  workingDirectory: string | null
): ProviderSources {
  const layers = readConfigLayers(workingDirectory);
  const { userConfig, projectConfig, customConfig, paths } = layers;

  const customProviders = isPlainObjectCheck(customConfig?.provider)
    ? (customConfig.provider as Record<string, unknown>)
    : {};
  const customProvidersAlias = isPlainObjectCheck(customConfig?.providers)
    ? (customConfig.providers as Record<string, unknown>)
    : {};
  const projectProviders = isPlainObjectCheck(projectConfig?.provider)
    ? (projectConfig.provider as Record<string, unknown>)
    : {};
  const projectProvidersAlias = isPlainObjectCheck(projectConfig?.providers)
    ? (projectConfig.providers as Record<string, unknown>)
    : {};
  const userProviders = isPlainObjectCheck(userConfig?.provider)
    ? (userConfig.provider as Record<string, unknown>)
    : {};
  const userProvidersAlias = isPlainObjectCheck(userConfig?.providers)
    ? (userConfig.providers as Record<string, unknown>)
    : {};

  const customExists =
    Object.prototype.hasOwnProperty.call(customProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(customProvidersAlias, providerId);
  const projectExists =
    Object.prototype.hasOwnProperty.call(projectProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(projectProvidersAlias, providerId);
  const userExists =
    Object.prototype.hasOwnProperty.call(userProviders, providerId) ||
    Object.prototype.hasOwnProperty.call(userProvidersAlias, providerId);

  return {
    sources: {
      auth: { exists: false },
      user: { exists: userExists, path: paths.userPath },
      project: { exists: projectExists, path: paths.projectPath || null },
      custom: { exists: customExists, path: paths.customPath },
    },
  };
}

export function removeProviderConfig(
  providerId: string,
  workingDirectory: string | null,
  scope = "user"
): boolean {
  if (!providerId || typeof providerId !== "string") {
    throw new Error("Provider ID is required");
  }

  const layers = readConfigLayers(workingDirectory);
  let targetPath = layers.paths.userPath;

  if (scope === "project") {
    if (!workingDirectory) {
      throw new Error("Working directory is required for project scope");
    }
    targetPath = layers.paths.projectPath || targetPath;
  } else if (scope === "custom") {
    if (!layers.paths.customPath) {
      return false;
    }
    targetPath = layers.paths.customPath;
  }

  const targetConfig = getConfigForPath(layers, targetPath);
  const providerConfig = isPlainObjectCheck(targetConfig.provider)
    ? (targetConfig.provider as Record<string, unknown>)
    : {};
  const providersConfig = isPlainObjectCheck(targetConfig.providers)
    ? (targetConfig.providers as Record<string, unknown>)
    : {};
  const removedProvider = Object.prototype.hasOwnProperty.call(providerConfig, providerId);
  const removedProviders = Object.prototype.hasOwnProperty.call(providersConfig, providerId);

  if (!removedProvider && !removedProviders) {
    return false;
  }

  if (removedProvider) {
    delete providerConfig[providerId];
    if (Object.keys(providerConfig).length === 0) {
      delete targetConfig.provider;
    } else {
      targetConfig.provider = providerConfig;
    }
  }

  if (removedProviders) {
    delete providersConfig[providerId];
    if (Object.keys(providersConfig).length === 0) {
      delete targetConfig.providers;
    } else {
      targetConfig.providers = providersConfig;
    }
  }

  writeConfig(targetConfig, targetPath || CONFIG_FILE);
  console.log(`Removed provider ${providerId} from config: ${targetPath}`);
  return true;
}
