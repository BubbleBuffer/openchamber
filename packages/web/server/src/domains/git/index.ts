// Re-export all git domain types
export type {
  GitCredentialEntry,
  GitCredential,
  GitProfile,
  GitProfilesData,
  GitIdentity,
  GitStatusOptions,
  GitStatusResult,
  GitDiffOptions,
  GitRangeDiffOptions,
  GitFileDiffResult,
  GitPullOptions,
  GitPushOptions,
  GitFetchOptions,
  GitCommitOptions,
  GitBranchResult,
  GitCreateBranchOptions,
  GitDeleteBranchOptions,
  GitWorktreeEntry,
  GitWorktreeBootstrapState,
  GitWorktreeCreateInput,
  GitWorktreeCreateResult,
  GitWorktreeRemoveInput,
  GitLogEntry,
  GitLogResult,
  GitLogOptions,
  GitRemoteEntry,
  GitRemoveRemoteOptions,
  GitRebaseOptions,
  GitMergeOptions,
  GitConflictDetails,
  GitStashOptions,
  GitWorktreeValidateResult,
  GitWorktreePreviewResult,
  GitWorktreeValidateDirResult,
  GitCanonicalizeStateResult,
  GitCommitFilesResult,
} from "./types.js";

export { discoverGitCredentials, getCredentialForHost } from "./credentials.js";
export {
  loadProfiles,
  saveProfiles,
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
} from "./identity-storage.js";

export * from "./service.js";
export * from "./routes.js";