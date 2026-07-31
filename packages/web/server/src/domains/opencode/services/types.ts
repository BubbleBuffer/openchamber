// Type-only interfaces for OpenCode services

export interface AgentLookupCache {
  userAgentIndexByName: Map<string, string>;
  userAgentLookupByName: Map<string, string | null>;
  userAgentIndexReady: boolean;
}

export interface AgentScopeResult {
  scope: string | null;
  path: string | null;
}

export interface AgentSources {
  md: {
    exists: boolean;
    path: string | null;
    scope: string | null;
    fields: string[];
  };
  json: {
    exists: boolean;
    path: string | null;
    scope: string | null;
    fields: string[];
  };
  projectMd: {
    exists: boolean;
    path: string | null;
  };
  userMd: {
    exists: boolean;
    path: string | null;
  };
}

export interface AgentConfigResult {
  source: 'md' | 'json' | 'none';
  scope: string | null;
  config: Record<string, unknown>;
}

export interface AgentPermissionSource {
  source: 'md' | 'json' | null;
  scope: string | null;
  path: string | null;
}

export interface CommandScopeResult {
  scope: string | null;
  path: string | null;
}

export interface CommandSources {
  md: {
    exists: boolean;
    path: string | null;
    scope: string | null;
    fields: string[];
  };
  json: {
    exists: boolean;
    path: string | null;
    scope: string | null;
    fields: string[];
  };
  projectMd: {
    exists: boolean;
    path: string | null;
  };
  userMd: {
    exists: boolean;
    path: string | null;
  };
}

export interface SkillItem {
  name: string;
  path: string;
  scope: string;
  source: string;
  description: string;
}

export interface McpEntry {
  type: 'remote' | 'local';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  oauth?: false | {
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    redirectUri?: string;
  };
  timeout?: number;
  environment?: Record<string, string>;
  enabled: boolean;
}

export interface McpConfig {
  name: string;
  scope: string | null;
  type?: 'remote' | 'local';
  command?: string[];
  url?: string;
  headers?: Record<string, string>;
  oauth?: {
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    redirectUri?: string;
  };
  timeout?: number;
  environment?: Record<string, string>;
  enabled?: boolean;
}

export interface ProviderSources {
  sources: {
    auth: { exists: boolean };
    user: { exists: boolean; path: string | null };
    project: { exists: boolean; path: string | null };
    custom: { exists: boolean; path: string | null };
  };
}

export interface ConfigLayers {
  userConfig: Record<string, unknown>;
  projectConfig: Record<string, unknown>;
  customConfig: Record<string, unknown>;
  mergedConfig: Record<string, unknown>;
  paths: {
    userPath: string | null;
    projectPath: string | null;
    customPath: string | null;
  };
}

export interface JsonEntrySource {
  section: unknown;
  config: Record<string, unknown> | null;
  path: string | null;
  exists: boolean;
}
