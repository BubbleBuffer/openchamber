import type { WorktreeMetadata } from '@/types/worktree';
import type {
  DiagnosticsAPI,
  EditorAPI,
  FilesAPI,
  GitAPI,
  GitHubAPI,
  NotificationsAPI,
  PermissionsAPI,
  PushAPI,
  SettingsAPI,
  TerminalAPI,
  ToolsAPI,
} from '../../../api/domain-apis';

export type * from '../../../api/domain-apis';
export type * from '@contracts/github';
export type * from '@contracts/git';
export type * from '@contracts/skills';
export type { ProjectEntry } from '@contracts/settings';

/** Aggregate browser runtime bridge; domain API contracts live beside browser adapters. */
export interface RuntimeDescriptor { platform: 'web'; label?: string; }
export interface Subscription { close: () => void; }
export interface RuntimeAPIs {
  runtime: RuntimeDescriptor;
  terminal: TerminalAPI;
  git: GitAPI;
  files: FilesAPI;
  settings: SettingsAPI;
  permissions: PermissionsAPI;
  notifications: NotificationsAPI;
  github?: GitHubAPI;
  push?: PushAPI;
  diagnostics?: DiagnosticsAPI;
  tools: ToolsAPI;
  editor?: EditorAPI;
  worktrees?: WorktreeMetadata[];
}
export type RuntimeAPISelector<TValue> = (apis: RuntimeAPIs) => TValue;
