export { registerGitHubRoutes } from "./routes.js";
export type { GitHubRoutesDeps } from "./routes.js";

export type {
  GitHubAuthUser,
  GitHubAuthEntry,
  GitHubAuthAccount,
  StartDeviceFlowParams,
  StartDeviceFlowResult,
  ExchangeDeviceCodeParams,
  ParsedGitHubRemote,
  ResolveGitHubPrStatusOptions,
  ResolvedPrStatus,
} from "./types.js";

export {
  getGitHubAuth,
  getGitHubAuthAccounts,
  setGitHubAuth,
  activateGitHubAuth,
  clearGitHubAuth,
  getGitHubClientId,
  getGitHubScopes,
  GITHUB_AUTH_FILE,
} from "./auth.js";

export { startDeviceFlow, exchangeDeviceCode } from "./device-flow.js";
export { getOctokitOrNull } from "./octokit.js";
export { parseGitHubRemoteUrl, resolveGitHubRepoFromDirectory } from "./repo.js";
export { resolveGitHubPrStatus } from "./pr-status.js";
