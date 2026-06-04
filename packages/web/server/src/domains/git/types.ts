export interface GitCredentialEntry {
  host: string;
  username: string;
}

export interface GitCredential {
  username: string;
  token: string;
}

export interface GitProfile {
  id: string;
  name: string;
  userName: string;
  userEmail: string;
  authType?: string;
  sshKey?: string | null;
  host?: string | null;
  color?: string;
  icon?: string;
}

export interface GitProfilesData {
  profiles: GitProfile[];
}

export interface GitIdentity {
  userName: string | null;
  userEmail: string | null;
  sshCommand: string | null;
}

export interface GitStatusOptions {
  mode?: "light";
}

export interface GitStatusResult {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  files: Array<{ path: string; index: string; working_dir: string }>;
  isClean: boolean;
  diffStats?: Record<string, { insertions: number; deletions: number }>;
  mergeInProgress: { head: string; message: string } | null;
  rebaseInProgress: { headName: string; onto: string } | null;
}

export interface GitDiffOptions {
  path?: string;
  staged?: boolean;
  contextLines?: number;
}

export interface GitRangeDiffOptions {
  base: string;
  head: string;
  path?: string;
  contextLines?: number;
}

export interface GitFileDiffResult {
  original: string;
  modified: string;
  path: string;
  isBinary: boolean;
}

export interface GitPullOptions {
  remote?: string;
  branch?: string;
  options?: Record<string, unknown>;
}

export interface GitPushOptions {
  remote?: string;
  branch?: string;
  options?: string[] | Record<string, unknown>;
}

export interface GitFetchOptions {
  remote?: string;
  branch?: string;
  options?: Record<string, unknown>;
}

export interface GitCommitOptions {
  addAll?: boolean;
  files?: string[];
}

export interface GitBranchResult {
  all: string[];
  current: string;
  branches: Record<string, { current: boolean; name: string; commit: string; label: string }>;
}

export interface GitCreateBranchOptions {
  startPoint?: string;
}

export interface GitDeleteBranchOptions {
  force?: boolean;
}

export interface GitWorktreeEntry {
  head: string;
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeBootstrapState {
  status: "pending" | "ready" | "failed";
  error: string | null;
  updatedAt: number;
}

export interface GitWorktreeCreateInput {
  mode?: "new" | "existing";
  worktreeName?: string;
  name?: string;
  branchName?: string;
  startRef?: string;
  existingBranch?: string;
  setUpstream?: boolean;
  upstreamRemote?: string;
  upstreamBranch?: string;
  ensureRemoteName?: string;
  ensureRemoteUrl?: string;
  startCommand?: string;
}

export interface GitWorktreeCreateResult {
  head: string;
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeRemoveInput {
  directory: string;
  deleteLocalBranch?: boolean;
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitLogResult {
  all: GitLogEntry[];
  latest: GitLogEntry | null;
  total: number;
}

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export interface GitRemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitRemoveRemoteOptions {
  remote: string;
}

export interface GitRebaseOptions {
  onto: string;
}

export interface GitMergeOptions {
  branch: string;
}

export interface GitConflictDetails {
  statusPorcelain: string;
  unmergedFiles: string[];
  diff: string;
  headInfo: string;
  operation: string;
}

export interface GitStashOptions {
  includeUntracked?: boolean;
  message?: string;
}

export interface GitWorktreeValidateResult {
  ok: boolean;
  errors: Array<{ code: string; message: string }>;
  resolved: {
    mode: string;
    localBranch: string | null;
  };
}

export interface GitWorktreePreviewResult {
  name: string;
  branch: string;
  path: string;
}

export interface GitWorktreeValidateDirResult {
  valid: boolean;
  insideWorktreeRoot: boolean;
  resolvedWorktreeRoot: string | null;
  resolvedCwd: string | null;
}

export interface GitCanonicalizeStateResult {
  worktreeRoot: string | null;
  cwd: string | null;
  branch: string | null;
  headState: "branch" | "detached" | "unborn";
  worktreeStatus: string;
  legacy: boolean;
  degraded: boolean;
  attentionReason: "merge" | "rebase" | "cherry-pick" | "revert" | "bisect" | null;
}

export interface GitCommitFilesResult {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    isBinary: boolean;
    changeType: string;
  }>;
}