import type { Application } from "express";
import type { FeatureRoutesDeps } from "./types.js";
import type { QuotaProviderRegistry } from "../quota/types.js";
import { registerQuotaRoutes } from "../quota/routes.js";
import { registerMagicPromptRoutes } from "../magic-prompts/routes.js";
import { registerSessionFoldersRoutes } from "../session-folders/routes.js";
import { registerFsRoutes } from "../fs/routes.js";
import { registerGitHubRoutes } from "../github/routes.js";
import { registerGitRoutes } from "../git/routes.js";
import { registerConfigEntityRoutes } from "../opencode/routes/config-entity-routes.js";
import { registerSettingsUtilityRoutes } from "../opencode/routes/core-routes.js";
import { registerProjectIconRoutes } from "../opencode/routes/project-icon-routes.js";
import { registerScheduledTaskRoutes } from "../scheduled-tasks/routes.js";
import { registerSkillRoutes } from "../opencode/routes/skill-routes.js";
import { registerOpenCodeRoutes } from "../opencode/routes/routes.js";

import {
  getProviderSources, removeProviderConfig,
  getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent,
  getCommandSources, createCommand, updateCommand, deleteCommand,
  listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig,
  getSkillSources, discoverSkills, createSkill, updateSkill, deleteSkill,
  readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile,
  SKILL_SCOPE, SKILL_DIR,
} from "../opencode/services/index.js";

import {
  getCuratedSkillsSources, getCacheKey, getCachedScan, setCachedScan,
  parseSkillRepoSource, scanSkillsRepository, installSkillsFromRepository,
  scanClawdHubPage, installSkillsFromClawdHub, isClawdHubSource,
} from "../skills-catalog/index.js";

import { getProfiles, getProfile } from "../git/index.js";

export function createFeatureRoutesRuntime(deps: FeatureRoutesDeps): any {
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

  const registerRoutes = async (app: Application, routeDependencies: any): Promise<void> => {
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
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      openCodeRuntime,
      getOpenCodePort,
      buildAugmentedPath,
      projectConfigRuntime,
      scheduledTasksRuntime,
      getOpenChamberEventClients,
      writeSseEvent,
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

    registerScheduledTaskRoutes(app, {
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      projectConfigRuntime,
      scheduledTasksRuntime,
      getOpenChamberEventClients,
      writeSseEvent,
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
      os,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      readSettingsFromDisk,
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      openCodeRuntime,
      getOpenCodePort,
      getSkillSources,
      discoverSkills,
      createSkill,
      updateSkill,
      deleteSkill,
      readSkillSupportingFile,
      writeSkillSupportingFile,
      deleteSkillSupportingFile,
      SKILL_SCOPE,
      SKILL_DIR,
      getCuratedSkillsSources,
      getCacheKey,
      getCachedScan,
      setCachedScan,
      parseSkillRepoSource,
      scanSkillsRepository,
      installSkillsFromRepository,
      scanClawdHubPage,
      installSkillsFromClawdHub,
      isClawdHubSource,
      getProfiles,
      getProfile,
    });

    registerQuotaRoutes(app, { getQuotaProviders });
    registerGitHubRoutes(app);
    registerGitRoutes(app);
    registerMagicPromptRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
    });
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
