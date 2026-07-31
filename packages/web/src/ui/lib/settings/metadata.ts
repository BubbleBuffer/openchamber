import type { SidebarSection } from '@/constants/sidebar';

export type SettingsPageSlug =
  | 'home'
  | 'projects'
  | 'providers'
  | 'usage'
  | 'agents'
  | 'commands'
  | 'mcp'
  | 'skills.installed'
  | 'git'
  | 'appearance'
  | 'chat'
  | 'shortcuts'
  | 'sessions'
  | 'notifications';

export type SettingsPageGroup =
  | 'appearance'
  | 'projects'
  | 'general'
  | 'opencode'
  | 'git'
  | 'skills'
  | 'usage'
  | 'advanced';

export interface SettingsPageMeta {
  slug: SettingsPageSlug;
  title: string;
  group: SettingsPageGroup;
  kind: 'single' | 'split';
  description?: string;
  keywords?: string[];
}

export const SETTINGS_GROUP_LABELS: Record<SettingsPageGroup, string> = {
  appearance: 'Appearance',
  projects: 'Projects',
  general: 'General',
  opencode: 'OpenCode',
  git: 'Git',
  skills: 'Skills',
  usage: 'Usage',
  advanced: 'Advanced',
};

export const SETTINGS_PAGE_METADATA: readonly SettingsPageMeta[] = [
  {
    slug: 'home',
    title: 'Settings',
    group: 'general',
    kind: 'single',
    description: 'Search and jump to common pages.',
    keywords: ['search', 'settings'],
  },
  {
    slug: 'projects',
    title: 'Projects',
    group: 'projects',
    kind: 'split',
    keywords: ['project', 'projects', 'worktree', 'worktrees', 'repo', 'repository', 'directory'],
  },
  {
    slug: 'providers',
    title: 'Providers',
    group: 'opencode',
    kind: 'split',
    keywords: ['provider', 'providers', 'models', 'model', 'api key', 'api keys', 'openai', 'anthropic', 'ollama', 'credentials'],
  },
  {
    slug: 'usage',
    title: 'Usage',
    group: 'usage',
    kind: 'split',
    keywords: ['quota', 'billing', 'tokens', 'usage', 'limits'],
  },
  {
    slug: 'agents',
    title: 'Agents',
    group: 'opencode',
    kind: 'split',
    keywords: ['agent', 'agents', 'prompts', 'tools', 'permissions'],
  },
  {
    slug: 'commands',
    title: 'Commands',
    group: 'opencode',
    kind: 'split',
    keywords: ['command', 'commands', 'slash', 'macros', 'automation'],
  },
  {
    slug: 'mcp',
    title: 'MCP',
    group: 'opencode',
    kind: 'split',
    keywords: ['mcp', 'model context protocol', 'servers', 'tools', 'remote', 'stdio'],
  },
  {
    slug: 'skills.installed',
    title: 'Skills',
    group: 'skills',
    kind: 'split',
    keywords: ['skill', 'skills', 'instructions', 'installed'],
  },
  {
    slug: 'git',
    title: 'Git',
    group: 'git',
    kind: 'single',
    keywords: ['git', 'github', 'identity', 'identities', 'ssh', 'profiles', 'credentials', 'keys', 'commit', 'gitmoji', 'oauth', 'prs', 'issues'],
  },
  {
    slug: 'appearance',
    title: 'Appearance',
    group: 'appearance',
    kind: 'single',
    keywords: ['theme', 'font', 'spacing', 'padding', 'corner radius', 'radius', 'input bar', 'terminal', 'pwa', 'install name', 'app shortcuts'],
  },
  {
    slug: 'chat',
    title: 'Chat',
    group: 'general',
    kind: 'single',
    keywords: ['tools', 'diff', 'reasoning', 'dotfiles', 'draft', 'queue', 'output'],
  },
  {
    slug: 'shortcuts',
    title: 'Shortcuts',
    group: 'general',
    kind: 'single',
    keywords: ['keyboard', 'hotkeys', 'shortcuts', 'bindings'],
  },
  {
    slug: 'sessions',
    title: 'Sessions',
    group: 'general',
    kind: 'single',
    keywords: ['defaults', 'default agent', 'default model', 'retention', 'memory', 'limits', 'zen'],
  },
  { slug: 'notifications', title: 'Notifications', group: 'general', kind: 'single', keywords: ['alerts', 'native', 'summary', 'summarization'], },
] as const;

export const LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG: Record<SidebarSection, SettingsPageSlug> = {
  sessions: 'sessions',
  agents: 'agents',
  commands: 'commands',
  mcp: 'mcp',
  skills: 'skills.installed',
  providers: 'providers',
  usage: 'usage',
  'git-identities': 'git',
  settings: 'home',
};

export function getSettingsPageMeta(slug: string): SettingsPageMeta | null {
  const normalized = slug.trim().toLowerCase();
  return (SETTINGS_PAGE_METADATA as readonly SettingsPageMeta[]).find((page) => page.slug === normalized) ?? null;
}

export function resolveSettingsSlug(value: string | null | undefined): SettingsPageSlug {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized) {
    return 'home';
  }

  // Preserve old deep links and persisted navigation without retaining the
  // removed catalog/marketplace surface.
  if (normalized === 'skills.catalog') {
    return 'skills.installed';
  }

  const legacy = (LEGACY_SIDEBAR_SECTION_TO_SETTINGS_SLUG as Record<string, SettingsPageSlug>)[normalized];
  if (legacy) {
    return legacy;
  }

  const direct = getSettingsPageMeta(normalized);
  if (direct) {
    return direct.slug;
  }

  return 'home';
}
