import { parseJsonObject, type ParseResult } from "./common.js";

export const GITHUB_ERROR_CODES = [
  "github_invalid_request", "github_unauthorized", "github_forbidden", "github_not_found",
  "github_not_connected", "github_repo_unavailable", "github_device_flow_failed", "github_upstream_error", "github_conflict", "github_internal_error",
] as const;
export type GitHubErrorCode = (typeof GITHUB_ERROR_CODES)[number];
export type GitHubErrorResponse = { error: "GitHub request failed"; code: GitHubErrorCode };
export const githubError = (code: GitHubErrorCode): GitHubErrorResponse => ({ error: "GitHub request failed", code });

export type GitHubUserSummary = { login: string | null; id?: number | null; avatarUrl?: string | null; name?: string | null; email?: string | null };
export type GitHubAuthAccount = { id: string; user: GitHubUserSummary; scope?: string; current?: boolean };
export type GitHubAuthStatus = { connected: boolean; user?: GitHubUserSummary | null; scope?: string; accounts?: GitHubAuthAccount[] };
export type GitHubDeviceFlowStart = { deviceCode: string; userCode: string; verificationUri: string; verificationUriComplete?: string; expiresIn: number; interval: number; scope?: string };
export type GitHubDeviceFlowComplete = { connected: true; user: GitHubUserSummary; scope?: string; accounts?: GitHubAuthAccount[] } | { connected: false; status?: string; error?: string };
export type GitHubAuthDisconnectResult = { removed: boolean };
export type GitHubRepoRef = { owner: string; repo: string; url?: string };
export type GitHubChecksSummary = { state: "success" | "failure" | "pending" | "unknown"; total: number; success: number; failure: number; pending: number };
export type GitHubPullRequest = { number: number; title: string; body?: string; url: string; state: "open" | "closed" | "merged"; draft: boolean; base: string; head: string; headSha?: string; mergeable?: boolean | null; mergeableState?: string | null };
export type GitHubIssueLabel = { name: string; color?: string };
export type GitHubIssueSummary = { number: number; title: string; url: string; state: "open" | "closed"; author?: GitHubUserSummary | null; labels?: GitHubIssueLabel[] };
export type GitHubIssue = GitHubIssueSummary & { body?: string; assignees?: GitHubUserSummary[]; createdAt?: string; updatedAt?: string };
export type GitHubIssueComment = { id: number; url: string; body: string; author?: GitHubUserSummary | null; createdAt?: string; updatedAt?: string };
export type GitHubCheckRun = { id?: number; name: string; app?: { name?: string; slug?: string }; status?: string; conclusion?: string | null; detailsUrl?: string; output?: { title?: string; summary?: string; text?: string }; job?: { runId?: number; jobId?: number; url?: string; name?: string; conclusion?: string | null; steps?: Array<{ name: string; status?: string; conclusion?: string | null; number?: number; startedAt?: string; completedAt?: string }> }; annotations?: Array<{ path?: string; startLine?: number; endLine?: number; level?: string; message: string; title?: string; rawDetails?: string }> };
export type GitHubPullRequestStatus = { connected: boolean; repo?: GitHubRepoRef | null; branch?: string; pr?: GitHubPullRequest | null; checks?: GitHubChecksSummary | null; canMerge?: boolean; defaultBranch?: string | null; resolvedRemoteName?: string | null };
export type GitHubPullRequestSummary = GitHubPullRequest & { author?: GitHubUserSummary | null; createdAt?: string; updatedAt?: string; headLabel?: string; headRepo?: { owner: string; repo: string; url: string; cloneUrl?: string; sshUrl?: string } | null };
export type GitHubPullRequestHeadRepo = NonNullable<GitHubPullRequestSummary["headRepo"]>;
export type GitHubPullRequestFile = NonNullable<GitHubPullRequestContextResult extends infer T ? T extends { files?: infer F } ? F : never : never>[number];
export type GitHubPullRequestReviewComment = GitHubIssueComment & { path?: string; line?: number | null; position?: number | null };
export type GitHubPullRequestsListResult = { connected: boolean; repo?: GitHubRepoRef | null; prs?: GitHubPullRequestSummary[]; page?: number; hasMore?: boolean };
export type GitHubPullRequestContextResult = { connected: boolean; repo?: GitHubRepoRef | null; pr?: GitHubPullRequestSummary | null; issueComments?: GitHubIssueComment[]; reviewComments?: Array<GitHubIssueComment & { path?: string; line?: number | null; position?: number | null }>; files?: Array<{ filename: string; status?: string; additions?: number; deletions?: number; changes?: number; patch?: string }>; diff?: string; checks?: GitHubChecksSummary | null; checkRuns?: GitHubCheckRun[] };
export type GitHubIssuesListResult = { connected: boolean; repo?: GitHubRepoRef | null; issues?: GitHubIssueSummary[]; page?: number; hasMore?: boolean };
export type GitHubIssueGetResult = { connected: boolean; repo?: GitHubRepoRef | null; issue?: GitHubIssue | null };
export type GitHubIssueCommentsResult = { connected: boolean; repo?: GitHubRepoRef | null; comments?: GitHubIssueComment[] };
export type GitHubPullRequestCreateInput = { directory: string; title: string; head: string; base: string; body?: string; draft?: boolean; remote?: string; headRemote?: string };
export type GitHubPullRequestUpdateInput = { directory: string; number: number; title: string; body?: string };
export type GitHubPullRequestMergeInput = { directory: string; number: number; method: "merge" | "squash" | "rebase" };
export type GitHubPullRequestReadyInput = { directory: string; number: number };
export type GitHubPullRequestMergeResult = { merged: boolean; message?: string };
export type GitHubPullRequestReadyResult = { ready: boolean };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const object = (value: unknown) => { const result = parseJsonObject(value); return result.ok ? result.value : null; };
const string = (value: unknown): value is string => typeof value === "string";
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optionalString = (value: unknown) => value === undefined || string(value);
const nullableString = (value: unknown) => value === null || string(value);
const optionalBoolean = (value: unknown) => value === undefined || typeof value === "boolean";
const required = (value: unknown): boolean => string(value) && value.trim().length > 0;
const user = (value: unknown): value is GitHubUserSummary => { const input = object(value); return !!input && nullableString(input.login) && ["id"].every((key) => input[key] === undefined || input[key] === null || number(input[key])) && ["avatarUrl", "name", "email"].every((key) => input[key] === undefined || nullableString(input[key])); };
const repo = (value: unknown): value is GitHubRepoRef => { const input = object(value); return !!input && required(input.owner) && required(input.repo) && optionalString(input.url); };
const accounts = (value: unknown) => value === undefined || (Array.isArray(value) && value.every((item) => { const input = object(item); return !!input && required(input.id) && user(input.user) && optionalString(input.scope) && optionalBoolean(input.current); }));
const checks = (value: unknown): value is GitHubChecksSummary => { const input = object(value); return !!input && ["success", "failure", "pending", "unknown"].includes(input.state as string) && ["total", "success", "failure", "pending"].every((key) => number(input[key])); };
const pr = (value: unknown): value is GitHubPullRequest => { const input = object(value); return !!input && number(input.number) && required(input.title) && required(input.url) && ["open", "closed", "merged"].includes(input.state as string) && typeof input.draft === "boolean" && optionalString(input.body) && optionalString(input.base) && optionalString(input.head) && optionalString(input.headSha) && (input.mergeable === undefined || input.mergeable === null || typeof input.mergeable === "boolean") && (input.mergeableState === undefined || nullableString(input.mergeableState)); };
const issueComment = (value: unknown): value is GitHubIssueComment => { const input = object(value); return !!input && number(input.id) && required(input.url) && string(input.body) && (input.author === undefined || input.author === null || user(input.author)) && optionalString(input.createdAt) && optionalString(input.updatedAt); };
const label = (value: unknown): boolean => { const input = object(value); return !!input && required(input.name) && optionalString(input.color); };
const issue = (value: unknown, detail = false): boolean => { const input = object(value); return !!input && number(input.number) && required(input.title) && required(input.url) && (input.state === "open" || input.state === "closed") && (input.author === undefined || input.author === null || user(input.author)) && (input.labels === undefined || (Array.isArray(input.labels) && input.labels.every(label))) && (!detail || (optionalString(input.body) && (input.assignees === undefined || (Array.isArray(input.assignees) && input.assignees.every(user))) && optionalString(input.createdAt) && optionalString(input.updatedAt))); };
const checkRun = (value: unknown): value is GitHubCheckRun => { const input = object(value); return !!input && required(input.name) && (input.id === undefined || number(input.id)) && optionalString(input.status) && (input.conclusion === undefined || nullableString(input.conclusion)) && optionalString(input.detailsUrl) && (input.annotations === undefined || (Array.isArray(input.annotations) && input.annotations.every((annotation) => { const item = object(annotation); return !!item && string(item.message); }))); };

export function parseGitHubAuthStatusResponse(value: unknown): ParseResult<GitHubAuthStatus> { const input = object(value); if (!input || typeof input.connected !== "boolean" || !accounts(input.accounts)) return invalid("invalid GitHub auth status"); return input.connected ? (input.user === null || user(input.user)) && optionalString(input.scope) ? { ok: true, value: input as GitHubAuthStatus } : invalid("invalid GitHub auth status") : { ok: true, value: input as GitHubAuthStatus }; }
export function parseGitHubDeviceFlowStartResponse(value: unknown): ParseResult<GitHubDeviceFlowStart> { const input = object(value); return input && ["deviceCode", "userCode", "verificationUri"].every((key) => required(input[key])) && ["expiresIn", "interval"].every((key) => number(input[key])) && optionalString(input.verificationUriComplete) && optionalString(input.scope) ? { ok: true, value: input as GitHubDeviceFlowStart } : invalid("invalid GitHub device flow start"); }
export function parseGitHubDeviceFlowCompleteResponse(value: unknown): ParseResult<GitHubDeviceFlowComplete> { const input = object(value); if (!input || typeof input.connected !== "boolean") return invalid("invalid GitHub device flow completion"); return input.connected ? user(input.user) && optionalString(input.scope) && accounts(input.accounts) ? { ok: true, value: input as GitHubDeviceFlowComplete } : invalid("invalid GitHub device flow completion") : optionalString(input.status) && optionalString(input.error) ? { ok: true, value: input as GitHubDeviceFlowComplete } : invalid("invalid GitHub device flow completion"); }
export function parseGitHubAuthDisconnectResponse(value: unknown): ParseResult<GitHubAuthDisconnectResult> { const input = object(value); return input && typeof input.removed === "boolean" ? { ok: true, value: input as GitHubAuthDisconnectResult } : invalid("invalid GitHub disconnect response"); }
export function parseGitHubUserResponse(value: unknown): ParseResult<GitHubUserSummary> { return user(value) ? { ok: true, value } : invalid("invalid GitHub user"); }
export function parseGitHubPullRequestStatusResponse(value: unknown): ParseResult<GitHubPullRequestStatus> { const input = object(value); if (!input || typeof input.connected !== "boolean") return invalid("invalid GitHub PR status"); return !input.connected ? { ok: true, value: input as GitHubPullRequestStatus } : (input.repo === null || repo(input.repo)) && optionalString(input.branch) && (input.pr === null || pr(input.pr)) && (input.checks === null || checks(input.checks)) && typeof input.canMerge === "boolean" && (input.defaultBranch === undefined || nullableString(input.defaultBranch)) && (input.resolvedRemoteName === undefined || nullableString(input.resolvedRemoteName)) ? { ok: true, value: input as GitHubPullRequestStatus } : invalid("invalid GitHub PR status"); }
export const parseGitHubPullRequestResponse = (value: unknown): ParseResult<GitHubPullRequest> => pr(value) ? { ok: true, value } : invalid("invalid GitHub pull request");
export function parseGitHubPullRequestMergeResponse(value: unknown): ParseResult<GitHubPullRequestMergeResult> { const input = object(value); return input && typeof input.merged === "boolean" && optionalString(input.message) ? { ok: true, value: input as GitHubPullRequestMergeResult } : invalid("invalid GitHub merge result"); }
export function parseGitHubPullRequestReadyResponse(value: unknown): ParseResult<GitHubPullRequestReadyResult> { const input = object(value); return input && typeof input.ready === "boolean" ? { ok: true, value: input as GitHubPullRequestReadyResult } : invalid("invalid GitHub ready result"); }
export function parseGitHubPullRequestsListResponse(value: unknown): ParseResult<GitHubPullRequestsListResult> { const input = object(value); return input && typeof input.connected === "boolean" && (!input.connected || ((input.repo === null || repo(input.repo)) && Array.isArray(input.prs) && input.prs.every(pr))) ? { ok: true, value: input as GitHubPullRequestsListResult } : invalid("invalid GitHub PR list"); }
export function parseGitHubPullRequestContextResponse(value: unknown): ParseResult<GitHubPullRequestContextResult> { const input = object(value); const valid = input && typeof input.connected === "boolean" && (!input.connected || ((input.repo === null || repo(input.repo)) && (input.pr === null || pr(input.pr)) && (input.checks === undefined || input.checks === null || checks(input.checks)) && (input.checkRuns === undefined || (Array.isArray(input.checkRuns) && input.checkRuns.every(checkRun))))); return valid ? { ok: true, value: input as GitHubPullRequestContextResult } : invalid("invalid GitHub PR context"); }
export function parseGitHubIssuesListResponse(value: unknown): ParseResult<GitHubIssuesListResult> { const input = object(value); return input && typeof input.connected === "boolean" && (!input.connected || ((input.repo === null || repo(input.repo)) && Array.isArray(input.issues) && input.issues.every((item) => issue(item)))) ? { ok: true, value: input as GitHubIssuesListResult } : invalid("invalid GitHub issue list"); }
export function parseGitHubIssueGetResponse(value: unknown): ParseResult<GitHubIssueGetResult> { const input = object(value); return input && typeof input.connected === "boolean" && (!input.connected || ((input.repo === null || repo(input.repo)) && (input.issue === null || issue(input.issue, true)))) ? { ok: true, value: input as GitHubIssueGetResult } : invalid("invalid GitHub issue"); }
export function parseGitHubIssueCommentsResponse(value: unknown): ParseResult<GitHubIssueCommentsResult> { const input = object(value); return input && typeof input.connected === "boolean" && (!input.connected || ((input.repo === null || repo(input.repo)) && Array.isArray(input.comments) && input.comments.every(issueComment))) ? { ok: true, value: input as GitHubIssueCommentsResult } : invalid("invalid GitHub comments"); }
export function parseGitHubErrorResponse(value: unknown): ParseResult<GitHubErrorResponse> { const input = object(value); return input && input.error === "GitHub request failed" && typeof input.code === "string" && (GITHUB_ERROR_CODES as readonly string[]).includes(input.code) ? { ok: true, value: input as GitHubErrorResponse } : invalid("invalid GitHub error"); }

const request = <T>(value: unknown, fields: Record<string, "string" | "number" | "boolean" | "method">): ParseResult<T> => { const input = object(value); return input && Object.entries(fields).every(([key, type]) => type === "string" ? required(input[key]) : type === "number" ? number(input[key]) && input[key] > 0 : type === "boolean" ? typeof input[key] === "boolean" : ["merge", "squash", "rebase"].includes(input[key] as string)) ? { ok: true, value: input as T } : invalid("invalid GitHub request"); };
export const parseGitHubPullRequestCreateRequest = (value: unknown) => request<GitHubPullRequestCreateInput>(value, { directory: "string", title: "string", head: "string", base: "string" });
export const parseGitHubPullRequestUpdateRequest = (value: unknown) => request<GitHubPullRequestUpdateInput>(value, { directory: "string", number: "number", title: "string" });
export const parseGitHubPullRequestMergeRequest = (value: unknown) => request<GitHubPullRequestMergeInput>(value, { directory: "string", number: "number", method: "method" });
export const parseGitHubPullRequestReadyRequest = (value: unknown) => request<GitHubPullRequestReadyInput>(value, { directory: "string", number: "number" });
export const parseGitHubAuthActivateRequest = (value: unknown) => request<{ accountId: string }>(value, { accountId: "string" });
export const parseGitHubDeviceFlowCompleteRequest = (value: unknown) => request<{ deviceCode: string }>(value, { deviceCode: "string" });

type RouteParser = (value: unknown) => ParseResult<unknown>;
const emptyRequest = (value: unknown): ParseResult<Record<string, never>> => value === undefined || object(value) !== null ? { ok: true, value: {} } : invalid("invalid GitHub request");
const directoryRequest = (value: unknown) => request<{ directory: string }>(value, { directory: "string" });
const directoryNumberRequest = (value: unknown) => request<{ directory: string; number: number }>(value, { directory: "string", number: "number" });
const directoryBranchRequest = (value: unknown) => request<{ directory: string; branch: string }>(value, { directory: "string", branch: "string" });
export const GITHUB_ROUTE_CONTRACTS: Record<string, { request: RouteParser; response: RouteParser }> = {
  "GET /api/github/auth/status": { request: emptyRequest, response: parseGitHubAuthStatusResponse },
  "POST /api/github/auth/start": { request: emptyRequest, response: parseGitHubDeviceFlowStartResponse },
  "POST /api/github/auth/complete": { request: parseGitHubDeviceFlowCompleteRequest, response: parseGitHubDeviceFlowCompleteResponse },
  "POST /api/github/auth/activate": { request: parseGitHubAuthActivateRequest, response: parseGitHubAuthStatusResponse },
  "DELETE /api/github/auth": { request: emptyRequest, response: parseGitHubAuthDisconnectResponse },
  "GET /api/github/me": { request: emptyRequest, response: parseGitHubUserResponse },
  "GET /api/github/pr/status": { request: directoryBranchRequest, response: parseGitHubPullRequestStatusResponse },
  "POST /api/github/pr/create": { request: parseGitHubPullRequestCreateRequest, response: parseGitHubPullRequestResponse },
  "POST /api/github/pr/update": { request: parseGitHubPullRequestUpdateRequest, response: parseGitHubPullRequestResponse },
  "POST /api/github/pr/merge": { request: parseGitHubPullRequestMergeRequest, response: parseGitHubPullRequestMergeResponse },
  "POST /api/github/pr/ready": { request: parseGitHubPullRequestReadyRequest, response: parseGitHubPullRequestReadyResponse },
  "GET /api/github/issues/list": { request: directoryRequest, response: parseGitHubIssuesListResponse },
  "GET /api/github/issues/get": { request: directoryNumberRequest, response: parseGitHubIssueGetResponse },
  "GET /api/github/issues/comments": { request: directoryNumberRequest, response: parseGitHubIssueCommentsResponse },
  "GET /api/github/pulls/list": { request: directoryRequest, response: parseGitHubPullRequestsListResponse },
  "GET /api/github/pulls/context": { request: directoryNumberRequest, response: parseGitHubPullRequestContextResponse },
};
