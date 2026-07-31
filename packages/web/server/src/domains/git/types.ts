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

export type GitStatusResult = GitStatusResponse;

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

export type GitBranchResult = GitBranchResponse;

export interface GitCreateBranchOptions {
  startPoint?: string;
}

export interface GitDeleteBranchOptions {
  force?: boolean;
}

export type GitSuccessResult = GitSuccessResponse;

export type GitWorktreeEntry = GitWorktreeInfo;

export type GitWorktreeBootstrapState = GitWorktreeBootstrapStatus;

export type GitWorktreeCreateInput = GitWorktreeCreateRequest;

export type GitWorktreeCreateResult = GitWorktreeInfo;

export type GitWorktreeRemoveInput = GitWorktreeRemoveRequest;

export type GitLogEntry = GitLogEntryContract;

export type GitLogResult = GitLogResponse;

export interface GitLogOptions {
  maxCount?: number;
  from?: string;
  to?: string;
  file?: string;
}

export type GitRemoteEntry = GitRemote;

export interface GitRemoveRemoteOptions {
  remote: string;
}

export interface GitRebaseOptions {
  onto: string;
}

export interface GitMergeOptions {
  branch: string;
}

export type GitConflictDetails = GitConflictDetailsContract;

export interface GitStashOptions {
  includeUntracked?: boolean;
  message?: string;
}

export type GitWorktreeValidateResult = GitWorktreeValidationResult;

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

export type GitCanonicalizeStateResult = GitCanonicalizeWorktreeResponse;

export interface GitCommitFilesResult {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    isBinary: boolean;
    changeType: string;
  }>;
}
import type {
  GitBranchResponse,
  GitCanonicalizeWorktreeResponse,
  GitConflictDetails as GitConflictDetailsContract,
  GitLogEntry as GitLogEntryContract,
  GitLogResponse,
  GitRemote,
  GitStatusResponse,
  GitSuccessResponse,
  GitWorktreeBootstrapStatus,
  GitWorktreeCreateRequest,
  GitWorktreeInfo,
  GitWorktreeRemoveRequest,
  GitWorktreeValidationResult,
} from "../../contracts/git.js";
