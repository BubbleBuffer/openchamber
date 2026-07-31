import type { Express } from "express";
import type { FeatureRoutesDeps } from "./types.js";
import type { QuotaProviderRegistry } from "../quota/types.js";
import { registerQuotaRoutes } from "../quota/routes.js";
import { registerSessionFoldersRoutes } from "../session-folders/routes.js";
import { registerFsRoutes } from "../fs/routes.js";
import { registerGitHubRoutes } from "../github/routes.js";
import { registerGitRoutes } from "../git/routes.js";
import { registerConfigEntityRoutes } from "../opencode/routes/config-entity-routes.js";
import { registerSettingsUtilityRoutes } from "../opencode/routes/core-routes.js";
import { registerProjectIconRoutes } from "../opencode/routes/project-icon-routes.js";
import { registerSkillRoutes } from "../opencode/routes/skill-routes.js";
import { registerOpenCodeRoutes } from "../opencode/routes/routes.js";

import {
  getProviderSources, removeProviderConfig,
  getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent,
  getCommandSources, createCommand, updateCommand, deleteCommand,
  listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig,
  discoverSkills,
} from "../opencode/services/index.js";

type FeatureRouteDependencies =
  & Omit<
    Parameters<typeof registerSettingsUtilityRoutes>[1],
    "clientReloadDelayMs"
  >
  & Omit<
    Parameters<typeof registerOpenCodeRoutes>[1],
    "clientReloadDelayMs" | "getProviderSources" | "removeProviderConfig"
  >
  & Parameters<typeof registerProjectIconRoutes>[1]
  & Pick<
    Parameters<typeof registerConfigEntityRoutes>[1],
    "resolveProjectDirectory" | "resolveOptionalProjectDirectory" | "refreshOpenCodeAfterConfigChange"
  >
  & Omit<Parameters<typeof registerSkillRoutes>[1], "discoverSkills">
  & Parameters<typeof registerSessionFoldersRoutes>[1]
  & Parameters<typeof registerFsRoutes>[1];

export function createFeatureRoutesRuntime(deps: FeatureRoutesDeps) {
  const {
    clientReloadDelayMs,
  } = deps;

  let quotaProviders: QuotaProviderRegistry | null = null;
  const getQuotaProviders = async (): Promise<QuotaProviderRegistry> => {
    if (!quotaProviders) {
      const mod = await import("../quota/providers/index.js");
      quotaProviders = mod;
    }
    return quotaProviders;
  };

  const registerRoutes = async (
    app: Express,
    routeDependencies: FeatureRouteDependencies,
  ): Promise<void> => {
    const {
      crypto,
      fs,
      os,
      path,
      fsPromises,
      spawn,
      resolveGitBinaryForSpawn,
      createFsSearchRuntime,
      openchamberDataDir,
      openchamberUserConfigRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
      readCustomThemesFromDisk,
      refreshOpenCodeAfterConfigChange,
      getOpenCodeResolutionSnapshot,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      buildAugmentedPath,
    } = routeDependencies;

    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
    });

    registerOpenCodeRoutes(app, {
      crypto,
      clientReloadDelayMs,
      getOpenCodeResolutionSnapshot,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      validateDirectoryPath,
      resolveProjectDirectory,
      getProviderSources,
      removeProviderConfig,
      refreshOpenCodeAfterConfigChange,
    });

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      sanitizeProjects,
      readSettingsFromDiskMigrated,
      persistSettings,
      createFsSearchRuntime,
      spawn,
      resolveGitBinaryForSpawn,
    });

    registerConfigEntityRoutes(app, {
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      getAgentSources,
      getAgentConfig,
      createAgent,
      updateAgent,
      deleteAgent,
      getCommandSources,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
    });

    registerSkillRoutes(app, {
      fs,
      path,
      resolveOptionalProjectDirectory,
      discoverSkills,
    });

    registerQuotaRoutes(app, { getQuotaProviders });
    registerGitHubRoutes(app);
    registerGitRoutes(app);
    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
    });
    registerFsRoutes(app, {
      os,
      path,
      fsPromises,
      spawn,
      crypto,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      buildAugmentedPath,
      resolveGitBinaryForSpawn,
      openchamberUserConfigRoot,
    });
  };

  return {
    registerRoutes,
  };
}
