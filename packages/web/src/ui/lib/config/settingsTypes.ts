import type { ProjectEntry } from '@/lib/api/types';

export type SkillCatalogConfig = {
  id: string;
  label: string;
  source: string;
  subpath?: string;
  gitIdentityId?: string;
};

export type AppSettings = {
  themeId?: string;
  useSystemTheme?: boolean;
  themeVariant?: 'light' | 'dark';
  lightThemeId?: string;
  darkThemeId?: string;
  splashBgLight?: string;
  splashFgLight?: string;
  splashBgDark?: string;
  splashFgDark?: string;
  lastDirectory?: string;
  homeDirectory?: string;
  // Optional absolute path to `opencode` binary.
  opencodeBinary?: string;
  projects?: ProjectEntry[];
  activeProjectId?: string;
  pinnedDirectories?: string[];
  showReasoningTraces?: boolean;
  showDeletionDialog?: boolean;
  nativeNotificationsEnabled?: boolean;
  notificationMode?: 'always' | 'hidden-only';
  notifyOnSubtasks?: boolean;

  // Event toggles (which events trigger notifications)
  notifyOnCompletion?: boolean;
  notifyOnError?: boolean;
  notifyOnQuestion?: boolean;

  // Per-event notification templates
  notificationTemplates?: {
    completion: { title: string; message: string };
    error: { title: string; message: string };
    question: { title: string; message: string };
    subtask: { title: string; message: string };
  };

  // Summarization settings
  summarizeLastMessage?: boolean;
  summaryThreshold?: number;
  summaryLength?: number;
  maxLastMessageLength?: number;

  usageAutoRefresh?: boolean;
  usageRefreshIntervalMs?: number;
  usageDisplayMode?: 'usage' | 'remaining';
  usageDropdownProviders?: string[];
  usageSelectedModels?: Record<string, string[]>;
  usageCollapsedFamilies?: Record<string, string[]>;
  usageExpandedFamilies?: Record<string, string[]>;
  usageModelGroups?: Record<string, {
    customGroups?: Array<{id: string; label: string; models: string[]; order: number}>;
    modelAssignments?: Record<string, string>;
    renamedGroups?: Record<string, string>;
  }>;
  autoDeleteEnabled?: boolean;
  autoDeleteAfterDays?: number;
  sessionRetentionAction?: 'archive' | 'delete';
  defaultModel?: string;
  defaultVariant?: string;
  defaultAgent?: string;
  defaultGitIdentityId?: string;
  autoCreateWorktree?: boolean;
  queueModeEnabled?: boolean;
  gitmojiEnabled?: boolean;
  defaultFileViewerPreview?: boolean;
  zenModel?: string;
  gitProviderId?: string;
  gitModelId?: string;
  pwaAppName?: string;
  pwaOrientation?: 'system' | 'portrait' | 'landscape';
  inputSpellcheckEnabled?: boolean;
  showToolFileIcons?: boolean;
  showExpandedBashTools?: boolean;
  showExpandedEditTools?: boolean;
  timeFormatPreference?: 'auto' | '12h' | '24h';
  weekStartPreference?: 'auto' | 'sunday' | 'monday';
  chatRenderMode?: 'sorted' | 'live';
  messageStreamTransport?: 'auto' | 'ws' | 'sse';
  activityRenderMode?: 'collapsed' | 'summary';
  mermaidRenderingMode?: 'svg' | 'ascii';
  userMessageRenderingMode?: 'markdown' | 'plain';
  stickyUserHeader?: boolean;
  fontSize?: number;
  terminalFontSize?: number;
  padding?: number;
  cornerRadius?: number;
  inputBarOffset?: number;

  favoriteModels?: Array<{ providerID: string; modelID: string }>;
  recentModels?: Array<{ providerID: string; modelID: string }>;
  diffLayoutPreference?: 'dynamic' | 'inline' | 'side-by-side';
  diffViewMode?: 'single' | 'stacked';
  gitChangesViewMode?: 'flat' | 'tree';
  directoryShowHidden?: boolean;
  filesViewShowGitignored?: boolean;

  // Message limit — controls fetch, trim, and Load More chunk size (default: 200)
  messageLimit?: number;

  // User-added skills catalogs
  skillCatalogs?: SkillCatalogConfig[];
  // Opt-in to send anonymous usage reports for update checks (default: true)
  reportUsage?: boolean;
};
