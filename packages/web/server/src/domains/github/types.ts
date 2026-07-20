import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import type { GitHubAuthAccount as GitHubAuthAccountContract, GitHubUserSummary } from "../../contracts/github.js";

export type GitHubAuthUser = GitHubUserSummary;
export interface GitHubAuthEntry { accessToken: string; scope: string; tokenType: string; createdAt: number | null; user: GitHubAuthUser | null; current: boolean; accountId: string; }
export type GitHubAuthAccount = GitHubAuthAccountContract;

export interface StartDeviceFlowParams {
  clientId: string;
  scope: string;
}

export interface StartDeviceFlowResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface ExchangeDeviceCodeParams {
  clientId: string;
  deviceCode: string;
}

export interface ParsedGitHubRemote {
  owner: string;
  repo: string;
  url: string;
}

export interface ResolveGitHubPrStatusOptions {
  octokit: Octokit;
  directory: string;
  branch: string;
  remoteName?: string;
}

export interface ResolvedPrStatus {
  repo: { owner: string; repo: string } | null;
  pr: RestEndpointMethodTypes["pulls"]["get"]["response"]["data"] | null;
  defaultBranch?: string | null;
  resolvedRemoteName?: string | null;
}
