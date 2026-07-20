import { describe, expect, it } from "vitest";
import {
  parseGitHubAuthStatusResponse,
  parseGitHubDeviceFlowCompleteResponse,
  parseGitHubErrorResponse,
  parseGitHubPullRequestContextResponse,
  parseGitHubPullRequestStatusResponse,
  parseGitHubPullRequestUpdateRequest,
  GITHUB_ROUTE_CONTRACTS,
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

  it("only accepts stable safe GitHub errors", () => {
    expect(parseGitHubErrorResponse({ error: "GitHub request failed", code: "github_unauthorized" }).ok).toBe(true);
    expect(parseGitHubErrorResponse({ error: "secret", code: "internal_error" }).ok).toBe(false);
  });

  it("owns every active GitHub route with named request and response parsers", () => {
    expect(Object.keys(GITHUB_ROUTE_CONTRACTS)).toHaveLength(16);
    expect(GITHUB_ROUTE_CONTRACTS["GET /api/github/pulls/context"].response).toBe(parseGitHubPullRequestContextResponse);
  });
});
