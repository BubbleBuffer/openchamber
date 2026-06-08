import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

export interface GitHubAuthUser {
  login: string | null;
  avatarUrl: string | null;
  id: number | null;
  name: string | null;
  email: string | null;
}

export interface GitHubAuthEntry {
  accessToken: string;
  scope: string;
  tokenType: string;
  createdAt: number | null;
  user: GitHubAuthUser | null;
  current: boolean;
  accountId: string;
}

export interface GitHubAuthAccount {
  id: string;
  user: GitHubAuthUser;
  scope: string;
  current: boolean;
}

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