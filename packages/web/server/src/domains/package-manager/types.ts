export interface PackageManagerInfo {
  packageManager: string;
  reason: string;
  packagePath: string | null;
  packageManagerCommand: string | null;
  globalNodeModulesRoot: string | null;
}

export interface UpdateResult {
  available: boolean;
  version?: string;
  currentVersion: string;
  body?: string;
  nextSuggestedCheckInSec?: number;
  packageManager: string;
  updateCommand: string;
  error?: string;
}

export type ChangelogResult = string | undefined;

export interface CheckForUpdatesOptions {
  appType?: string;
  deviceClass?: string;
  platform?: string;
  arch?: string;
  instanceMode?: string;
  currentVersion?: string;
  reportUsage?: boolean;
}

export interface ExecuteUpdateOptions {
  silent?: boolean;
}

export interface ExecuteUpdateResult {
  success: boolean;
  exitCode: number | null;
}
