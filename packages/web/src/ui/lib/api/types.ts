import type { WorktreeMetadata } from '@/types/worktree';
import type { AppSettings } from '@contracts/settings';
import type {
  TerminalCreateRequest as ContractTerminalCreateRequest,
  TerminalSessionResponse as ContractTerminalSessionResponse,
  TerminalTransportCapability as ContractTerminalTransportCapability,
} from '@contracts/terminal';
import type {
  SkillsCatalogItem as ContractSkillsCatalogItem,
  SkillsCatalogResponse as ContractSkillsCatalogResponse,
  SkillsCatalogSource as ContractSkillsCatalogSource,
  SkillsCatalogSourceResponse as ContractSkillsCatalogSourceResponse,
  SkillsInstallRequest as ContractSkillsInstallRequest,
  SkillsInstallResponse as ContractSkillsInstallResponse,
  SkillsError as ContractSkillsError,
  SkillsRepoScanRequest as ContractSkillsRepoScanRequest,
  SkillsRepoScanResponse as ContractSkillsRepoScanResponse,
} from '@contracts/skills';
import type {
  GitHubAuthStatus,
  GitHubAuthDisconnectResult,
  GitHubDeviceFlowComplete,
  GitHubDeviceFlowStart,
  GitHubIssueCommentsResult,
  GitHubIssueGetResult,
  GitHubIssuesListResult,
  GitHubPullRequest,
  GitHubPullRequestContextResult,
  GitHubPullRequestCreateInput,
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestReadyInput,
  GitHubPullRequestReadyResult,
  GitHubPullRequestStatus,
  GitHubPullRequestUpdateInput,
  GitHubPullRequestsListResult,
  GitHubUserSummary,
} from '@contracts/github';
import type {
  GitBranchResponse,
  GitBranchDetails,
  GitCommitFilesResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitConflictDetails,
  GitCredentialEntry,
  GitDeleteBranchRequest,
  GitDeleteRemoteBranchRequest,
  GitDiffRequest,
  GitDiffResponse,
  GitFileDiffRequest,
  GitFileDiffResponse,
  GitGeneratedCommitMessage,
  GitGeneratedPullRequestDescription,
  GitIdentityAuthType,
  GitIdentityProfile,
  GitIdentitySummary,
  GitLogQuery,
  GitLogEntry,
  GitLogResponse,
  GitOperationResponse,
  GitPullResponse,
  GitPushResponse,
  GitRemote,
  GitRemoveRemoteRequest,
  GitStatusResponse,
  GitStatusFile,
  GitMergeInProgress,
  GitRebaseInProgress,
  GitWorktreeBootstrapStatus,
  GitWorktreeCreateRequest,
  GitWorktreeInfo,
  GitWorktreeRemoveRequest,
  GitWorktreeValidationResult,
} from '@contracts/git';
export type { ProjectEntry } from '@contracts/settings';
export type {
  GitHubAuthAccount,
  GitHubAuthDisconnectResult,
  GitHubAuthStatus,
  GitHubCheckRun,
  GitHubChecksSummary,
  GitHubDeviceFlowComplete,
  GitHubDeviceFlowStart,
  GitHubIssue,
  GitHubIssueComment,
  GitHubIssueCommentsResult,
  GitHubIssueGetResult,
  GitHubIssueLabel,
  GitHubIssuesListResult,
  GitHubIssueSummary,
  GitHubPullRequest,
  GitHubPullRequestContextResult,
  GitHubPullRequestCreateInput,
  GitHubPullRequestFile,
  GitHubPullRequestHeadRepo,
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestReadyInput,
  GitHubPullRequestReadyResult,
  GitHubPullRequestReviewComment,
  GitHubPullRequestStatus,
  GitHubPullRequestSummary,
  GitHubPullRequestUpdateInput,
  GitHubPullRequestsListResult,
  GitHubRepoRef,
  GitHubUserSummary,
} from '@contracts/github';

export type RuntimePlatform = 'web';

export interface RuntimeDescriptor {
  platform: RuntimePlatform;
  label?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  cause?: unknown;
}

export interface Subscription {

  close: () => void;
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export type TerminalTransportCapability = ContractTerminalTransportCapability;
export type TerminalSession = ContractTerminalSessionResponse;

export interface TerminalStreamEvent {
  type: 'connected' | 'data' | 'exit' | 'reconnecting';
  data?: string;
  exitCode?: number;
  signal?: number | null;
  attempt?: number;
  maxAttempts?: number;

  runtime?: 'node' | 'bun';
  ptyBackend?: string;
}

export type CreateTerminalOptions = ContractTerminalCreateRequest;

export interface TerminalStreamOptions {
  retry?: Partial<RetryPolicy>;
  connectionTimeoutMs?: number;
}

export interface ResizeTerminalPayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalHandlers {
  onEvent: (event: TerminalStreamEvent) => void;
  onError?: (error: Error, fatal?: boolean) => void;
}

export interface ForceKillOptions {
  sessionId?: string;
  cwd?: string;
}

export interface TerminalAPI {
  createSession(options: CreateTerminalOptions): Promise<TerminalSession>;
  connect(sessionId: string, handlers: TerminalHandlers, options?: TerminalStreamOptions): Subscription;
  sendInput(sessionId: string, input: string): Promise<void>;
  resize(payload: ResizeTerminalPayload): Promise<void>;
  close(sessionId: string): Promise<void>;
  restartSession?(currentSessionId: string, options: CreateTerminalOptions): Promise<TerminalSession>;
  forceKill?(options: ForceKillOptions): Promise<void>;
}

export type GitStatus = GitStatusResponse;
export type GetGitDiffOptions = GitDiffRequest;
export type GetGitFileDiffOptions = GitFileDiffRequest;
export type GitBranch = GitBranchResponse;
export type GitCommitResult = GitCommitResponse;
export type GitPushResult = GitPushResponse;
export type GitPullResult = GitPullResponse;
export type GitMergeResult = GitOperationResponse;
export type GitRebaseResult = GitOperationResponse;
export type MergeConflictDetails = GitConflictDetails;
export type DiscoveredGitCredential = GitCredentialEntry;
export type CreateGitWorktreePayload = GitWorktreeCreateRequest;
export type GitWorktreeCreateResult = GitWorktreeInfo;
export type GitWorktreePreviewResult = import('@contracts/git').GitWorktreePreviewResult;
export type RemoveGitWorktreePayload = GitWorktreeRemoveRequest;
export type GitDeleteBranchPayload = GitDeleteBranchRequest;
export type GitDeleteRemoteBranchPayload = GitDeleteRemoteBranchRequest;
export type GitRemoveRemotePayload = GitRemoveRemoteRequest;
export type CreateGitCommitOptions = Omit<GitCommitRequest, 'message'>;
export type GitLogOptions = Omit<GitLogQuery, 'directory'>;
export type GeneratedCommitMessage = GitGeneratedCommitMessage;
export type GeneratedPullRequestDescription = GitGeneratedPullRequestDescription;
export type CommitFileEntry = GitCommitFilesResponse['files'][number];
export type GitWorktreeValidationError = GitWorktreeValidationResult['errors'][number];
export type { GitBranchDetails, GitDiffResponse, GitFileDiffResponse, GitIdentityAuthType, GitIdentityProfile, GitIdentitySummary, GitLogEntry, GitLogResponse, GitMergeInProgress, GitRebaseInProgress, GitRemote, GitStatusFile, GitWorktreeBootstrapStatus, GitWorktreeInfo, GitWorktreeValidationResult, GitCommitFilesResponse };

export interface GitWorktreeAPI {
  list(directory: string): Promise<GitWorktreeInfo[]>;
  validate?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeValidationResult>;
  bootstrapStatus?(directory: string): Promise<GitWorktreeBootstrapStatus>;
  preview?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreePreviewResult>;
  create?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  remove?(directory: string, payload: RemoveGitWorktreePayload): Promise<{ success: boolean }>;
}

export interface GitAPI {
  checkIsGitRepository(directory: string): Promise<boolean>;
  getGitStatus(directory: string, options?: { mode?: 'light' }): Promise<GitStatus>;
  getGitDiff(directory: string, options: GetGitDiffOptions): Promise<GitDiffResponse>;
  getGitFileDiff(directory: string, options: GetGitFileDiffOptions): Promise<GitFileDiffResponse>;
  revertGitFile(directory: string, filePath: string): Promise<void>;
  isLinkedWorktree(directory: string): Promise<boolean>;
  getGitBranches(directory: string): Promise<GitBranch>;
  deleteGitBranch(directory: string, payload: GitDeleteBranchPayload): Promise<{ success: boolean }>;
  deleteRemoteBranch(directory: string, payload: GitDeleteRemoteBranchPayload): Promise<{ success: boolean }>;
  removeRemote(directory: string, payload: GitRemoveRemotePayload): Promise<{ success: boolean }>;
  generateCommitMessage(directory: string, files: string[], options?: { zenModel?: string; providerId?: string; modelId?: string }): Promise<{ message: GeneratedCommitMessage }>;
  generatePullRequestDescription(
    directory: string,
    payload: { base: string; head: string; context?: string; zenModel?: string; providerId?: string; modelId?: string }
  ): Promise<GeneratedPullRequestDescription>;
  listGitWorktrees(directory: string): Promise<GitWorktreeInfo[]>;
  validateGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeValidationResult>;
  getGitWorktreeBootstrapStatus?(directory: string): Promise<GitWorktreeBootstrapStatus>;
  previewGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreePreviewResult>;
  createGitWorktree?(directory: string, payload: CreateGitWorktreePayload): Promise<GitWorktreeCreateResult>;
  deleteGitWorktree?(directory: string, payload: RemoveGitWorktreePayload): Promise<{ success: boolean }>;
  createGitCommit(directory: string, message: string, options?: CreateGitCommitOptions): Promise<GitCommitResult>;
  gitPush(directory: string, options?: { remote?: string; branch?: string; options?: string[] | Record<string, unknown> }): Promise<GitPushResult>;
  gitPull(directory: string, options?: { remote?: string; branch?: string }): Promise<GitPullResult>;
  gitFetch(directory: string, options?: { remote?: string; branch?: string }): Promise<{ success: boolean }>;
  checkoutBranch(directory: string, branch: string): Promise<{ success: boolean; branch: string }>;
  createBranch(directory: string, name: string, startPoint?: string): Promise<{ success: boolean; branch: string }>;
  renameBranch(directory: string, oldName: string, newName: string): Promise<{ success: boolean; branch: string }>;
  getGitLog(directory: string, options?: GitLogOptions): Promise<GitLogResponse>;
  getCommitFiles(directory: string, hash: string): Promise<GitCommitFilesResponse>;
  getCurrentGitIdentity(directory: string): Promise<GitIdentitySummary | null>;
  hasLocalIdentity?(directory: string): Promise<boolean>;
  setGitIdentity(directory: string, profileId: string): Promise<{ success: boolean; profile: GitIdentityProfile }>;
  getGitIdentities(): Promise<GitIdentityProfile[]>;
  createGitIdentity(profile: GitIdentityProfile): Promise<GitIdentityProfile>;
  updateGitIdentity(id: string, updates: GitIdentityProfile): Promise<GitIdentityProfile>;
  deleteGitIdentity(id: string): Promise<void>;
  discoverGitCredentials?(): Promise<DiscoveredGitCredential[]>;
  getGlobalGitIdentity?(): Promise<GitIdentitySummary | null>;
  getRemoteUrl?(directory: string, remote?: string): Promise<string | null>;
  getRemotes(directory: string): Promise<GitRemote[]>;
  rebase(directory: string, options: { onto: string }): Promise<GitRebaseResult>;
  abortRebase(directory: string): Promise<{ success: boolean }>;
  continueRebase(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }>;
  merge(directory: string, options: { branch: string }): Promise<GitMergeResult>;
  abortMerge(directory: string): Promise<{ success: boolean }>;
  continueMerge(directory: string): Promise<{ success: boolean; conflict: boolean; conflictFiles?: string[] }>;
  stash(directory: string, options?: { message?: string; includeUntracked?: boolean }): Promise<{ success: boolean }>;
  stashPop(directory: string): Promise<{ success: boolean }>;
  getConflictDetails(directory: string): Promise<MergeConflictDetails>;
  /** Phase 1: validate that a cwd is inside a worktreeRoot */
  validateWorktreeDirectory?(directory: string, worktreeRoot: string): Promise<{
    valid: boolean;
    insideWorktreeRoot: boolean;
    resolvedWorktreeRoot: string | null;
    resolvedCwd: string | null;
  }>;
  /** Phase 1: canonicalize a directory to full worktree state */
  canonicalizeWorktreeState?(directory: string): Promise<{
    worktreeRoot: string | null;
    cwd: string | null;
    branch: string | null;
    headState: 'branch' | 'detached' | 'unborn';
    worktreeStatus: 'ready' | 'missing' | 'invalid' | 'not-a-repo';
    legacy: boolean;
    degraded: boolean;
    attentionReason?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null;
  }>;
  worktree?: GitWorktreeAPI;
}

export interface FileListEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
}

export interface DirectoryListResult {
  directory: string;
  entries: FileListEntry[];
}

export interface FileSearchQuery {
  directory: string;
  query: string;
  maxResults?: number;
  includeHidden?: boolean;
  respectGitignore?: boolean;
}

export interface FileSearchResult {
  path: string;
  score?: number;
  preview?: string[];
}

export interface CommandExecResult {
  command: string;
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface ListDirectoryOptions {
  respectGitignore?: boolean;
}

export interface FilesAPI {
  listDirectory(path: string, options?: ListDirectoryOptions): Promise<DirectoryListResult>;
  search(payload: FileSearchQuery): Promise<FileSearchResult[]>;
  createDirectory(path: string): Promise<{ success: boolean; path: string }>;
  statFile?(path: string): Promise<{ path: string; isFile: boolean; size: number; mtimeMs?: number }>;
  readFile?(path: string): Promise<{ content: string; path: string }>;
  readFileBinary?(path: string): Promise<{ dataUrl: string; path: string }>;
  writeFile?(path: string, content: string): Promise<{ success: boolean; path: string }>;
  delete?(path: string): Promise<{ success: boolean }>;
  rename?(oldPath: string, newPath: string): Promise<{ success: boolean; path: string }>;
  execCommands?(commands: string[], cwd: string): Promise<{ success: boolean; results: CommandExecResult[] }>;
  downloadFile?(path: string): Promise<void>;
}

export type SettingsPayload = AppSettings;

export interface SettingsLoadResult {
  settings: SettingsPayload;
  source: 'web';
}

export interface SettingsAPI {
  load(): Promise<SettingsLoadResult>;
  save(changes: Partial<SettingsPayload>): Promise<SettingsPayload>;

  restartOpenCode?: () => Promise<{ restarted: boolean }>;
}

export type PermissionsAPI = Record<string, never>;

export interface NotificationPayload {
  title?: string;
  body?: string;

  tag?: string;
}

export interface NotificationsAPI {
  notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean>;
  canNotify?: () => boolean | Promise<boolean>;
}

export interface DiagnosticsAPI {
  downloadLogs(): Promise<{ fileName: string; content: string }>;
}

export interface ToolsAPI {

  getAvailableTools(): Promise<string[]>;
}

export interface EditorAPI {
  openFile(path: string, line?: number, column?: number): Promise<void>;
  openDiff(
    original: string,
    modified: string,
    label?: string,
    options?: { line?: number; patch?: string },
  ): Promise<void>;
}

export interface PushSubscribePayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  origin?: string;
}

export interface PushUnsubscribePayload {
  endpoint: string;
}

export interface PushAPI {
  getVapidPublicKey(): Promise<{ publicKey: string } | null>;
  subscribe(payload: PushSubscribePayload): Promise<{ ok: true } | null>;
  unsubscribe(payload: PushUnsubscribePayload): Promise<{ ok: true } | null>;
  setVisibility(payload: { visible: boolean }): Promise<{ ok: true } | null>;
}

export interface GitHubAPI {
  authStatus(): Promise<GitHubAuthStatus>;
  authStart(): Promise<GitHubDeviceFlowStart>;
  authComplete(deviceCode: string): Promise<GitHubDeviceFlowComplete>;
  authDisconnect(): Promise<GitHubAuthDisconnectResult>;
  authActivate(accountId: string): Promise<GitHubAuthStatus>;
  me?(): Promise<GitHubUserSummary>;

  prStatus(directory: string, branch: string, remote?: string): Promise<GitHubPullRequestStatus>;
  prCreate(payload: GitHubPullRequestCreateInput): Promise<GitHubPullRequest>;
  prUpdate(payload: GitHubPullRequestUpdateInput): Promise<GitHubPullRequest>;
  prMerge(payload: GitHubPullRequestMergeInput): Promise<GitHubPullRequestMergeResult>;
  prReady(payload: GitHubPullRequestReadyInput): Promise<GitHubPullRequestReadyResult>;

  prsList(directory: string, options?: { page?: number }): Promise<GitHubPullRequestsListResult>;
  prContext(
    directory: string,
    number: number,
    options?: { includeDiff?: boolean; includeCheckDetails?: boolean }
  ): Promise<GitHubPullRequestContextResult>;

  issuesList(directory: string, options?: { page?: number }): Promise<GitHubIssuesListResult>;
  issueGet(directory: string, number: number): Promise<GitHubIssueGetResult>;
  issueComments(directory: string, number: number): Promise<GitHubIssueCommentsResult>;
}

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

// ============== Skills Catalog Types ==============
// Transport shapes are owned by the runtime-neutral skills contract.
export type SkillsCatalogSourceId = string;
export type SkillsCatalogSourceType = 'github' | 'clawdhub';
export type SkillsCatalogSource = ContractSkillsCatalogSource;
export type SkillsCatalogItem = ContractSkillsCatalogItem;
export type SkillsCatalogResponse = ContractSkillsCatalogResponse;
export type SkillsCatalogSourceResponse = ContractSkillsCatalogSourceResponse;
export type SkillsRepoScanRequest = ContractSkillsRepoScanRequest;
export type SkillsRepoScanResponse = ContractSkillsRepoScanResponse;
export type SkillsInstallRequest = ContractSkillsInstallRequest;
export type SkillsInstallResponse = ContractSkillsInstallResponse;
export type SkillsRepoScanError = ContractSkillsError;
export type SkillsInstallError = ContractSkillsError;
export type SkillsInstallSelection = SkillsInstallRequest['selections'][number];
