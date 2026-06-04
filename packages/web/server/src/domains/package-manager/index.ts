export {
  detectPackageManagerDetails,
  detectPackageManager,
  getUpdateCommand,
  getCurrentVersion,
  getLatestVersion,
  fetchChangelogNotes,
  checkForUpdates,
  executeUpdate,
} from "./package-manager.js";
export type {
  PackageManagerInfo,
  UpdateResult,
  ChangelogResult,
  CheckForUpdatesOptions,
  ExecuteUpdateOptions,
  ExecuteUpdateResult,
} from "./types.js";
