import { parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const GIT_ERROR_CODES = ["git_invalid_request", "git_not_repository", "git_not_found", "git_conflict", "git_unauthorized", "git_forbidden", "git_unavailable", "git_internal_error"] as const;
export type GitErrorCode = (typeof GIT_ERROR_CODES)[number];
export type GitErrorResponse = { error: string; code: GitErrorCode };
export const gitError = (code: GitErrorCode): GitErrorResponse => ({ error: code === "git_invalid_request" ? "Invalid git request" : "Git operation failed", code });

export type GitStatusFile = { path: string; index: string; working_dir: string };
export type GitMergeInProgress = { head: string; message: string };
export type GitRebaseInProgress = { headName: string; onto: string };
export type GitAttentionReason = "merge" | "rebase" | "cherry-pick" | "revert" | "bisect" | null;
export type GitStatusResponse = { current: string | null; tracking: string | null; ahead: number; behind: number; files: GitStatusFile[]; isClean: boolean; diffStats?: Record<string, { insertions: number; deletions: number }>; mergeInProgress: GitMergeInProgress | null; rebaseInProgress: GitRebaseInProgress | null; attentionReason?: GitAttentionReason };
export type GitStatusQuery = { directory: string; mode?: "light" };
export type GitDiffRequest = { path: string; staged?: boolean; contextLines?: number };
export type GitDiffResponse = { diff: string };
export type GitFileDiffResponse = { original: string; modified: string; path: string; isBinary: boolean };
export type GitFileDiffRequest = { path: string; staged?: boolean };
export type GitBranchDetails = { current: boolean; name: string; commit: string; label: string; tracking?: string; ahead?: number; behind?: number };
export type GitBranchResponse = { all: string[]; current: string | null; branches: Record<string, GitBranchDetails> };
export type GitSuccessResponse = { success: boolean };
export type GitBranchMutationResponse = GitSuccessResponse & { branch: string };
export type GitDeleteBranchRequest = { branch: string; force?: boolean };
export type GitDeleteRemoteBranchRequest = { branch: string; remote?: string };
export type GitRemoveRemoteRequest = { remote: string };
export type GitCommitRequest = { message: string; addAll?: boolean; files?: string[] };
export type GitCommitSummary = { changes: number; insertions: number; deletions: number };
export type GitCommitResponse = GitSuccessResponse & { commit: string; branch: string; summary: GitCommitSummary };
export type GitCommitFilesResponse = { files: Array<{ path: string; insertions: number; deletions: number; isBinary: boolean; changeType: string }> };
export type GitPushRequest = { remote?: string; branch?: string; options?: string[] | Record<string, unknown> };
export type GitPushResponse = GitSuccessResponse & { pushed: Array<{ local: string; remote: string }>; repo: string; ref: unknown };
export type GitPullRequest = { remote?: string; branch?: string; options?: Record<string, unknown> };
export type GitPullResponse = GitSuccessResponse & { summary: GitCommitSummary; files: string[]; insertions: number; deletions: number };
export type GitFetchRequest = { remote?: string; branch?: string; options?: Record<string, unknown> };
export type GitRemote = { name: string; fetchUrl: string; pushUrl: string };
export type GitLogEntry = { hash: string; date: string; message: string; refs: string; body: string; author_name: string; author_email: string; filesChanged: number; insertions: number; deletions: number };
export type GitLogResponse = { all: GitLogEntry[]; latest: GitLogEntry | null; total: number };
export type GitLogQuery = { maxCount?: number; from?: string; to?: string; file?: string };
export type GitIdentityProfile = { id: string; name: string; userName: string; userEmail: string; authType?: "ssh" | "token"; sshKey?: string | null; host?: string | null; color?: string | null; icon?: string | null };
export type GitIdentitySummary = { userName: string | null; userEmail: string | null; sshCommand: string | null };
export type GitWorktreeInfo = { head: string; name: string; branch: string; path: string };
export type GitWorktreeCreateRequest = { mode?: "new" | "existing"; worktreeName?: string; name?: string; branchName?: string; startRef?: string; existingBranch?: string; setUpstream?: boolean; upstreamRemote?: string; upstreamBranch?: string; ensureRemoteName?: string; ensureRemoteUrl?: string; startCommand?: string };
export type GitWorktreeValidationResult = { ok: boolean; errors: Array<{ code: string; message: string }>; resolved: { mode: "new" | "existing"; localBranch: string | null } };
export type GitWorktreeBootstrapStatus = { status: "pending" | "ready" | "failed"; error: string | null; updatedAt: number };
export type GitWorktreeRemoveRequest = { directory: string; deleteLocalBranch?: boolean };
export type GitConflictDetails = { statusPorcelain: string; unmergedFiles: string[]; diff: string; headInfo: string; operation: string };
export type GitOperationResponse = GitSuccessResponse & { conflict?: boolean; conflictFiles?: string[] };
export type GitCanonicalizeWorktreeResponse = { worktreeRoot: string | null; cwd: string | null; branch: string | null; headState: "branch" | "detached" | "unborn"; worktreeStatus: "ready" | "missing" | "invalid" | "not-a-repo"; legacy: boolean; degraded: boolean; attentionReason?: GitAttentionReason };
export type GitBatchCheckResponse = { results: Record<string, boolean> };
export type GitBatchItemResult = { directory: string; ok: true; isGitRepository: boolean } | { directory: string; ok: false; error: GitErrorResponse };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const required = (value: unknown, name: string): ParseResult<string> => { const parsed = parseJsonString(value); return parsed.ok && parsed.value.trim() ? { ok: true, value: parsed.value.trim() } : invalid(`${name} is required`); };
const optionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === "string";
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const optionalBoolean = (value: unknown): value is boolean | undefined => value === undefined || typeof value === "boolean";
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const object = (value: unknown): Record<string, unknown> | null => { const parsed = parseJsonObject(value); return parsed.ok ? parsed.value : null; };

export function parseGitStatusQuery(value: unknown): ParseResult<GitStatusQuery> { const input = object(value); const directory = input && required(input.directory, "directory"); if (!input || !directory?.ok || (input.mode !== undefined && input.mode !== "light")) return invalid("invalid git status query"); return { ok: true, value: { directory: directory.value, ...(input.mode === "light" ? { mode: "light" } : {}) } }; }
export function parseGitStatusResponse(value: unknown): ParseResult<GitStatusResponse> {
  const input = object(value); if (!input || !nullableString(input.current) || !nullableString(input.tracking) || typeof input.ahead !== "number" || typeof input.behind !== "number" || !Array.isArray(input.files) || typeof input.isClean !== "boolean" || !nullableObject(input.mergeInProgress, ["head", "message"]) || !nullableObject(input.rebaseInProgress, ["headName", "onto"]) || !attention(input.attentionReason)) return invalid("invalid git status response");
  const files: GitStatusFile[] = []; for (const file of input.files) { const item = object(file); if (!item || typeof item.path !== "string" || typeof item.index !== "string" || typeof item.working_dir !== "string") return invalid("invalid git status file"); files.push({ path: item.path, index: item.index, working_dir: item.working_dir }); }
  if (input.diffStats !== undefined && !diffStats(input.diffStats)) return invalid("invalid git diff stats");
  return { ok: true, value: { current: input.current, tracking: input.tracking, ahead: input.ahead, behind: input.behind, files, isClean: input.isClean, mergeInProgress: input.mergeInProgress as GitMergeInProgress | null, rebaseInProgress: input.rebaseInProgress as GitRebaseInProgress | null, ...(input.diffStats === undefined ? {} : { diffStats: input.diffStats as GitStatusResponse["diffStats"] }), ...(input.attentionReason === undefined ? {} : { attentionReason: input.attentionReason as GitAttentionReason }) } };
}
const nullableObject = (value: unknown, fields: string[]) => value === null || (object(value) !== null && fields.every((field) => typeof object(value)![field] === "string"));
const attention = (value: unknown) => value === undefined || value === null || ["merge", "rebase", "cherry-pick", "revert", "bisect"].includes(value as string);
const diffStats = (value: unknown) => { const input = object(value); return input !== null && Object.values(input).every((entry) => { const stat = object(entry); return stat !== null && typeof stat.insertions === "number" && typeof stat.deletions === "number"; }); };
export function parseGitDiffRequest(value: unknown): ParseResult<GitDiffRequest> { const input = object(value); const path = input && required(input.path, "path"); if (!input || !path?.ok || !optionalBoolean(input.staged) || (input.contextLines !== undefined && (typeof input.contextLines !== "number" || !Number.isFinite(input.contextLines)))) return invalid("invalid git diff request"); return { ok: true, value: { path: path.value, ...(input.staged === undefined ? {} : { staged: input.staged }), ...(input.contextLines === undefined ? {} : { contextLines: input.contextLines as number }) } }; }
export function parseGitDiffResponse(value: unknown): ParseResult<GitDiffResponse> { const input = object(value); return input && typeof input.diff === "string" ? { ok: true, value: { diff: input.diff } } : invalid("invalid git diff response"); }
export function parseGitFileDiffResponse(value: unknown): ParseResult<GitFileDiffResponse> { const input = object(value); return input && ["original", "modified", "path"].every((key) => typeof input[key] === "string") && typeof input.isBinary === "boolean" ? { ok: true, value: input as GitFileDiffResponse } : invalid("invalid git file diff response"); }
export function parseGitSuccessResponse(value: unknown): ParseResult<GitSuccessResponse> { const input = object(value); return input && typeof input.success === "boolean" ? { ok: true, value: { success: input.success } } : invalid("invalid git success response"); }
export function parseGitBatchCheckRequest(value: unknown): ParseResult<{ directories: string[] }> { const input = object(value); return input && stringArray(input.directories) && input.directories.length > 0 && input.directories.length <= 50 && input.directories.every((directory) => directory.trim()) ? { ok: true, value: { directories: input.directories.map((directory) => directory.trim()) } } : invalid("invalid git batch request"); }
export function parseGitBatchCheckResponse(value: unknown): ParseResult<GitBatchCheckResponse> { const input = object(value); const results = input && object(input.results); return input && results && Object.values(results).every((result) => typeof result === "boolean") ? { ok: true, value: { results: results as Record<string, boolean> } } : invalid("invalid git batch response"); }
export function parseGitBranchResponse(value: unknown): ParseResult<GitBranchResponse> { const input = object(value); const branches = input && object(input.branches); if (!input || !stringArray(input.all) || !nullableString(input.current) || !branches) return invalid("invalid git branch response"); for (const detail of Object.values(branches)) { const branch = object(detail); if (!branch || typeof branch.current !== "boolean" || !["name", "commit", "label"].every((key) => typeof branch[key] === "string") || !optionalString(branch.tracking) || (branch.ahead !== undefined && typeof branch.ahead !== "number") || (branch.behind !== undefined && typeof branch.behind !== "number")) return invalid("invalid git branch response"); } return { ok: true, value: input as GitBranchResponse }; }
export function parseGitWorktreesResponse(value: unknown): ParseResult<GitWorktreeInfo[]> { if (!Array.isArray(value)) return invalid("invalid git worktrees response"); const worktrees: GitWorktreeInfo[] = []; for (const entry of value) { const worktree = object(entry); if (!worktree || !["head", "name", "branch", "path"].every((key) => typeof worktree[key] === "string")) return invalid("invalid git worktree response"); worktrees.push(worktree as GitWorktreeInfo); } return { ok: true, value: worktrees }; }
export function parseGitErrorResponse(value: unknown): ParseResult<GitErrorResponse> { const input = object(value); return input && typeof input.error === "string" && typeof input.code === "string" && (GIT_ERROR_CODES as readonly string[]).includes(input.code) ? { ok: true, value: input as GitErrorResponse } : invalid("invalid git error response"); }
export function parseGitWorktreeCreateRequest(value: unknown): ParseResult<GitWorktreeCreateRequest> { const input = object(value); if (!input || (input.mode !== undefined && input.mode !== "new" && input.mode !== "existing") || !["worktreeName", "name", "branchName", "startRef", "existingBranch", "upstreamRemote", "upstreamBranch", "ensureRemoteName", "ensureRemoteUrl", "startCommand"].every((key) => optionalString(input[key])) || !optionalBoolean(input.setUpstream)) return invalid("invalid git worktree request"); return { ok: true, value: input as GitWorktreeCreateRequest }; }
export function parseGitWorktreeRemoveRequest(value: unknown): ParseResult<GitWorktreeRemoveRequest> { const input = object(value); const directory = input && required(input.directory, "directory"); return input && directory?.ok && optionalBoolean(input.deleteLocalBranch) ? { ok: true, value: { directory: directory.value, ...(input.deleteLocalBranch === undefined ? {} : { deleteLocalBranch: input.deleteLocalBranch }) } } : invalid("invalid git worktree remove request"); }
