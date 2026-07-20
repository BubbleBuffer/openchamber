import type { WorktreeMetadata } from '@/types/worktree';
import type { DiagnosticsAPI, EditorAPI } from '../../../api/browser-platform';
import type { FilesAPI } from '../../../api/files';
import type { GitAPI } from '../../../api/git';
import type { GitHubAPI } from '../../../api/github';
import type { NotificationsAPI } from '../../../api/notifications';
import type { PermissionsAPI } from '../../../api/permissions';
import type { PushAPI } from '../../../api/push';
import type { SettingsAPI } from '../../../api/settings';
import type { TerminalAPI } from '../../../api/terminal';
import type { ToolsAPI } from '../../../api/tools';

export type * from '../../../api/browser-platform';
export type * from '../../../api/files';
export type * from '../../../api/git';
export type * from '../../../api/github';
export type * from '../../../api/notifications';
export type * from '../../../api/permissions';
export type * from '../../../api/push';
export type * from '../../../api/settings';
export type * from '../../../api/terminal';
export type * from '../../../api/tools';
export type * from '@contracts/github';
export type * from '@contracts/git';
export type * from '@contracts/skills';
export type { ProjectEntry } from '@contracts/settings';

export type { TerminalCreateRequest as CreateTerminalOptions, TerminalSessionResponse as TerminalSession, TerminalTransportCapability } from '@contracts/terminal';
export type {
  GitStatusResponse as GitStatus,
  GitDiffRequest as GetGitDiffOptions,
  GitFileDiffRequest as GetGitFileDiffOptions,
  GitBranchResponse as GitBranch,
  GitCommitResponse as GitCommitResult,
  GitPushResponse as GitPushResult,
  GitPullResponse as GitPullResult,
  GitOperationResponse as GitMergeResult,
  GitOperationResponse as GitRebaseResult,
  GitConflictDetails as MergeConflictDetails,
  GitCredentialEntry as DiscoveredGitCredential,
  GitWorktreeCreateRequest as CreateGitWorktreePayload,
  GitWorktreeInfo as GitWorktreeCreateResult,
  GitWorktreePreviewResult,
  GitWorktreeRemoveRequest as RemoveGitWorktreePayload,
  GitDeleteBranchRequest as GitDeleteBranchPayload,
  GitDeleteRemoteBranchRequest as GitDeleteRemoteBranchPayload,
  GitRemoveRemoteRequest as GitRemoveRemotePayload,
  GitGeneratedCommitMessage as GeneratedCommitMessage,
  GitGeneratedPullRequestDescription as GeneratedPullRequestDescription,
} from '@contracts/git';
export type CommitFileEntry = import('@contracts/git').GitCommitFilesResponse['files'][number];
export type GitWorktreeValidationError = import('@contracts/git').GitWorktreeValidationResult['errors'][number];
export type { AppSettings as SettingsPayload } from '@contracts/settings';
export type { TerminalStreamEvent } from '@/lib/terminal/terminalApi';
export type { SkillsError as SkillsInstallError } from '@contracts/skills';

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
