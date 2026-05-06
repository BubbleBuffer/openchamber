export {
  AGENT_DIR,
  COMMAND_DIR,
  SKILL_DIR,
  CONFIG_FILE,
  AGENT_SCOPE,
  COMMAND_SCOPE,
  SKILL_SCOPE,
  readConfig,
  writeConfig,
  readSkillSupportingFile,
  writeSkillSupportingFile,
  deleteSkillSupportingFile,
} from './shared.js';

export {
  getAgentScope,
  getAgentPermissionSource,
  getAgentSources,
  getAgentConfig,
  createAgent,
  updateAgent,
  deleteAgent,
} from './services/agents.js';

export {
  getCommandScope,
  getCommandSources,
  createCommand,
  updateCommand,
  deleteCommand,
} from './services/commands.js';

export {
  getSkillSources,
  getSkillScope,
  discoverSkills,
  createSkill,
  updateSkill,
  deleteSkill,
} from './services/skills.js';

export {
  getProviderSources,
  removeProviderConfig,
} from './services/providers.js';

export {
  readAuthFile,
  writeAuthFile,
  removeProviderAuth,
  getProviderAuth,
  listProviderAuths,
  AUTH_FILE,
  OPENCODE_DATA_DIR,
} from './auth/auth.js';

export { createUiAuth } from '../ui-auth/ui-auth.js';

export {
  listMcpConfigs,
  getMcpConfig,
  createMcpConfig,
  updateMcpConfig,
  deleteMcpConfig,
} from './services/mcp.js';
