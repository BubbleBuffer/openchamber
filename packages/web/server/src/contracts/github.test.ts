import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  parseGitHubAuthStatusResponse,
  parseGitHubDeviceFlowCompleteResponse,
  parseGitHubErrorResponse,
  parseGitHubPullRequestContextResponse,
  parseGitHubPullRequestStatusResponse,
  parseGitHubPullRequestUpdateRequest,
  parseGitHubIssueGetResponse,
  parseGitHubIssuesListResponse,
  GITHUB_ROUTE_CONTRACTS,
  githubError,
} from "./github.js";

describe("GitHub contracts", () => {
  it("preserves connected and disconnected auth discriminants with nullable users", () => {
    expect(parseGitHubAuthStatusResponse({ connected: false, accounts: [] })).toEqual({ ok: true, value: { connected: false, accounts: [] } });
    expect(parseGitHubAuthStatusResponse({ connected: true, user: null, scope: "repo", accounts: [] }).ok).toBe(true);
    expect(parseGitHubAuthStatusResponse({ connected: true, user: { login: 1 }, accounts: [] }).ok).toBe(false);
  });

  it("recognizes device-flow completion discriminants and malformed successes", () => {
    expect(parseGitHubDeviceFlowCompleteResponse({ connected: false, status: "authorization_pending", error: "Pending" }).ok).toBe(true);
    expect(parseGitHubDeviceFlowCompleteResponse({ connected: true, user: { login: "ada", id: null, avatarUrl: null, name: null, email: null } }).ok).toBe(true);
    expect(parseGitHubDeviceFlowCompleteResponse({ connected: true, user: null }).ok).toBe(false);
  });

  it("rejects malformed mutations and accepts optional PR body fields", () => {
    expect(parseGitHubPullRequestUpdateRequest({ directory: "/repo", number: 1, title: "Title" }).ok).toBe(true);
    expect(parseGitHubPullRequestUpdateRequest({ directory: "/repo", number: "1", title: "Title" }).ok).toBe(false);
  });

  it("preserves nullable status fields and partial check-run details", () => {
    expect(parseGitHubPullRequestStatusResponse({ connected: true, repo: null, branch: "topic", pr: null, checks: null, canMerge: false, defaultBranch: null, resolvedRemoteName: null }).ok).toBe(true);
    expect(parseGitHubPullRequestContextResponse({ connected: true, repo: { owner: "o", repo: "r" }, pr: null, checks: null, checkRuns: [{ name: "build", conclusion: null, annotations: [{ message: "partial" }] }] }).ok).toBe(true);
  });

  it("rejects malformed PR-context nested collections", () => {
    expect(parseGitHubPullRequestContextResponse({ connected: true, repo: { owner: "o", repo: "r" }, pr: null, issueComments: [{}] }).ok).toBe(false);
    expect(parseGitHubPullRequestContextResponse({ connected: true, repo: { owner: "o", repo: "r" }, pr: null, files: [{}] }).ok).toBe(false);
  });

  it("only accepts stable safe GitHub errors", () => {
    expect(parseGitHubErrorResponse({ error: "GitHub request failed", code: "github_unauthorized" }).ok).toBe(true);
    expect(parseGitHubErrorResponse({ error: "secret", code: "internal_error" }).ok).toBe(false);
  });

  it("uses safe stable errors for provider validation and mergeability failures", () => {
    expect(githubError("github_invalid_request")).toEqual({ error: "GitHub request failed", code: "github_invalid_request" });
    expect(githubError("github_conflict")).toEqual({ error: "GitHub request failed", code: "github_conflict" });
  });

  it("rejects malformed issue items while preserving optional issue state", () => {
    expect(parseGitHubIssuesListResponse({ connected: true, repo: { owner: "o", repo: "r" }, issues: [{}] }).ok).toBe(false);
    expect(parseGitHubIssueGetResponse({ connected: true, repo: { owner: "o", repo: "r" }, issue: {} }).ok).toBe(false);
    expect(parseGitHubIssueGetResponse({ connected: true, repo: { owner: "o", repo: "r" }, issue: { number: 1, title: "Issue", url: "https://example.test/1", state: "open", author: null, labels: [], body: "", assignees: [], createdAt: "2025-01-01", updatedAt: "2025-01-02" } }).ok).toBe(true);
  });

  it("owns every active GitHub route with named request and response parsers", () => {
    expect(Object.keys(GITHUB_ROUTE_CONTRACTS)).toHaveLength(16);
    expect(GITHUB_ROUTE_CONTRACTS["GET /api/github/pulls/context"].response).toBe(parseGitHubPullRequestContextResponse);
  });

  it("keeps GitHub wire DTOs out of the browser API type aggregate", async () => {
    const apiTypesPath = fileURLToPath(new URL("../../../src/ui/lib/api/types.ts", import.meta.url));
    const apiTypes = await readFile(apiTypesPath, "utf8");
    const wireTypeNames = [
      "GitHubUserSummary", "GitHubRepoRef", "GitHubChecksSummary", "GitHubCheckRun",
      "GitHubPullRequest", "GitHubPullRequestHeadRepo", "GitHubPullRequestSummary",
      "GitHubPullRequestFile", "GitHubPullRequestReviewComment", "GitHubPullRequestsListResult",
      "GitHubPullRequestContextResult", "GitHubPullRequestStatus", "GitHubPullRequestCreateInput",
      "GitHubPullRequestUpdateInput", "GitHubPullRequestMergeInput", "GitHubPullRequestReadyInput",
      "GitHubPullRequestReadyResult", "GitHubPullRequestMergeResult", "GitHubIssueLabel",
      "GitHubIssueSummary", "GitHubIssue", "GitHubIssueComment", "GitHubIssuesListResult",
      "GitHubIssueGetResult", "GitHubIssueCommentsResult", "GitHubAuthDisconnectResult", "GitHubAuthStatus", "GitHubAuthAccount",
      "GitHubDeviceFlowStart", "GitHubDeviceFlowComplete",
    ];

    expect(apiTypes).toMatch(/from ['"]@contracts\/github['"]/);
    for (const name of wireTypeNames) {
      expect(apiTypes).not.toMatch(new RegExp(`export (?:type|interface) ${name}(?:\\s*=|\\s*\\{)`));
    }
  });
});
