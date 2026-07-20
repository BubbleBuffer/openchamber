import type { GitHubAPI } from "@/lib/api/types";
import {
  parseGitHubAuthStatusResponse, parseGitHubDeviceFlowCompleteResponse, parseGitHubDeviceFlowStartResponse,
  parseGitHubErrorResponse, parseGitHubIssueCommentsResponse, parseGitHubIssueGetResponse,
  parseGitHubIssuesListResponse, parseGitHubPullRequestContextResponse, parseGitHubPullRequestMergeResponse,
  parseGitHubPullRequestReadyResponse, parseGitHubPullRequestResponse, parseGitHubPullRequestStatusResponse,
  parseGitHubPullRequestsListResponse, parseGitHubUserResponse,
  type GitHubPullRequestCreateInput, type GitHubPullRequestMergeInput, type GitHubPullRequestReadyInput, type GitHubPullRequestUpdateInput,
} from "@contracts/github";
import type { ParseResult } from "@contracts/common";

const read = async (response: Response) => response.json().catch(() => undefined);
const decode = async <T>(response: Response, parser: (value: unknown) => ParseResult<T>, fallback: string): Promise<T> => {
  const payload = await read(response);
  const error = parseGitHubErrorResponse(payload);
  if (!response.ok) throw new Error(error.ok ? error.value.code : fallback);
  const parsed = parser(payload);
  if (!parsed.ok) throw new Error(fallback);
  return parsed.value;
};
const json = (body: unknown) => ({ "Content-Type": "application/json", Accept: "application/json", body: JSON.stringify(body) });

export const createWebGitHubAPI = (): GitHubAPI => ({
  authStatus: () => fetch("/api/github/auth/status", { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubAuthStatusResponse, "Failed to load GitHub status")),
  authStart: () => fetch("/api/github/auth/start", { method: "POST", ...json({}) }).then((res) => decode(res, parseGitHubDeviceFlowStartResponse, "Failed to start GitHub auth")),
  authComplete: (deviceCode: string) => fetch("/api/github/auth/complete", { method: "POST", ...json({ deviceCode }) }).then((res) => decode(res, parseGitHubDeviceFlowCompleteResponse, "Failed to complete GitHub auth")),
  async authDisconnect() {
    const response = await fetch("/api/github/auth", { method: "DELETE", headers: { Accept: "application/json" } });
    const payload = await read(response);
    const error = parseGitHubErrorResponse(payload);
    if (!response.ok || !payload || typeof payload.removed !== "boolean") throw new Error(error.ok ? error.value.code : "Failed to disconnect GitHub");
    return { removed: payload.removed };
  },
  authActivate: (accountId: string) => fetch("/api/github/auth/activate", { method: "POST", ...json({ accountId }) }).then((res) => decode(res, parseGitHubAuthStatusResponse, "Failed to activate GitHub account")),
  me: () => fetch("/api/github/me", { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubUserResponse, "Failed to fetch GitHub user")),
  prStatus(directory, branch, remote) {
    const params = new URLSearchParams({ directory, branch, ...(remote ? { remote } : {}) });
    return fetch(`/api/github/pr/status?${params}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubPullRequestStatusResponse, "Failed to load PR status"));
  },
  prCreate: (payload: GitHubPullRequestCreateInput) => fetch("/api/github/pr/create", { method: "POST", ...json(payload) }).then((res) => decode(res, parseGitHubPullRequestResponse, "Failed to create PR")),
  prUpdate: (payload: GitHubPullRequestUpdateInput) => fetch("/api/github/pr/update", { method: "POST", ...json(payload) }).then((res) => decode(res, parseGitHubPullRequestResponse, "Failed to update PR")),
  prMerge: (payload: GitHubPullRequestMergeInput) => fetch("/api/github/pr/merge", { method: "POST", ...json(payload) }).then((res) => decode(res, parseGitHubPullRequestMergeResponse, "Failed to merge PR")),
  prReady: (payload: GitHubPullRequestReadyInput) => fetch("/api/github/pr/ready", { method: "POST", ...json(payload) }).then((res) => decode(res, parseGitHubPullRequestReadyResponse, "Failed to mark PR ready")),
  prsList(directory, options) { const page = options?.page ?? 1; return fetch(`/api/github/pulls/list?directory=${encodeURIComponent(directory)}&page=${page}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubPullRequestsListResponse, "Failed to load pull requests")); },
  prContext(directory, number, options) { const params = new URLSearchParams({ directory, number: String(number), ...(options?.includeDiff ? { diff: "1" } : {}), ...(options?.includeCheckDetails ? { checkDetails: "1" } : {}) }); return fetch(`/api/github/pulls/context?${params}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubPullRequestContextResponse, "Failed to load pull request context")); },
  issuesList(directory, options) { const page = options?.page ?? 1; return fetch(`/api/github/issues/list?directory=${encodeURIComponent(directory)}&page=${page}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubIssuesListResponse, "Failed to load issues")); },
  issueGet(directory, number) { return fetch(`/api/github/issues/get?directory=${encodeURIComponent(directory)}&number=${number}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubIssueGetResponse, "Failed to load issue")); },
  issueComments(directory, number) { return fetch(`/api/github/issues/comments?directory=${encodeURIComponent(directory)}&number=${number}`, { headers: { Accept: "application/json" } }).then((res) => decode(res, parseGitHubIssueCommentsResponse, "Failed to load issue comments")); },
});
