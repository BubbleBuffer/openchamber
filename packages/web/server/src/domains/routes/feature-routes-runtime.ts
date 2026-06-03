/* eslint-disable @typescript-eslint/no-explicit-any */
import type { FeatureRoutesDeps } from "./types.js";
import { registerQuotaRoutes } from "../quota/routes.js";
import { registerMagicPromptRoutes } from "../magic-prompts/routes.js";
import { registerSessionFoldersRoutes } from "../session-folders/routes.js";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerFsRoutes } = require('../../../lib/fs/routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerGitHubRoutes } = require('../../../lib/github/routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerGitRoutes } = require('../../../lib/git/routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerConfigEntityRoutes } = require('../../../lib/opencode/routes/config-entity-routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerSettingsUtilityRoutes } = require('../../../lib/opencode/routes/core-routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerProjectIconRoutes } = require('../../../lib/opencode/routes/project-icon-routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerScheduledTaskRoutes } = require('../../../lib/scheduled-tasks/routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerSkillRoutes } = require('../../../lib/opencode/routes/skill-routes.js') as any;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { registerOpenCodeRoutes } = require('../../../lib/opencode/routes/routes.js') as any;

export function createFeatureRoutesRuntime(deps: FeatureRoutesDeps): any {
  const {
    clientReloadDelayMs,
  } = deps;

  let quotaProviders: any = null;
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      quotaProviders = require('../../../lib/quota/index.js') as any;
    }
    return quotaProviders;
  };

  const registerRoutes = async (app: any, routeDependencies: any): Promise<void> => {
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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getProviderSources, removeProviderConfig } = require('../../../lib/opencode/index.js') as any;

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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent } = require('../../../lib/opencode/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCommandSources, createCommand, updateCommand, deleteCommand } = require('../../../lib/opencode/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig } = require('../../../lib/opencode/index.js') as any;

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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSkillSources, discoverSkills, createSkill, updateSkill, deleteSkill } = require('../../../lib/opencode/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile } = require('../../../lib/opencode/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SKILL_SCOPE, SKILL_DIR } = require('../../../lib/opencode/index.js') as any;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCuratedSkillsSources, getCacheKey, getCachedScan, setCachedScan } = require('../../../lib/skills-catalog/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseSkillRepoSource, scanSkillsRepository, installSkillsFromRepository } = require('../../../lib/skills-catalog/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { scanClawdHubPage, installSkillsFromClawdHub, isClawdHubSource } = require('../../../lib/skills-catalog/index.js') as any;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getProfiles, getProfile } = require('../../../lib/git/index.js') as any;

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