export interface SettingsNormalizationDeps {
  os: typeof import("os");
  path: typeof import("path");
  processLike: typeof process;
  tunnelBootstrapTtlDefaultMs: number;
  tunnelBootstrapTtlMinMs: number;
  tunnelBootstrapTtlMaxMs: number;
  tunnelSessionTtlDefaultMs: number;
  tunnelSessionTtlMinMs: number;
  tunnelSessionTtlMaxMs: number;
}

export interface SettingsNormalizationRuntime {
  normalizeDirectoryPath(value: unknown): string | unknown;
  normalizePathForPersistence(value: unknown): string | unknown;
  normalizeSettingsPaths(input: any): { settings: any; changed: boolean };
  normalizeTunnelBootstrapTtlMs(value: number | null): number | null;
  normalizeTunnelSessionTtlMs(value: number): number;
  normalizeManagedRemoteTunnelHostname(value: unknown): string | undefined;
  normalizeManagedRemoteTunnelPresets(value: unknown): Array<{ id: string; name: string; hostname: string }> | undefined;
  normalizeManagedRemoteTunnelPresetTokens(value: unknown): Record<string, string> | undefined;
  isUnsafeSkillRelativePath(value: unknown): boolean;
  sanitizeTypographySizesPartial(input: unknown): Record<string, string> | undefined;
  normalizeStringArray(input: unknown): string[];
  sanitizeModelRefs(input: unknown, limit: number): Array<{ providerID: string; modelID: string }> | undefined;
  sanitizeSkillCatalogs(input: unknown): Array<{ id: string; label: string; source: string; subpath?: string; gitIdentityId?: string }> | undefined;
  sanitizeProjects(input: unknown): Array<Record<string, unknown>> | undefined;
}

export interface SettingsHelpersDeps {
  normalizePathForPersistence: SettingsNormalizationRuntime["normalizePathForPersistence"];
  normalizeDirectoryPath: SettingsNormalizationRuntime["normalizeDirectoryPath"];
  normalizeTunnelBootstrapTtlMs: SettingsNormalizationRuntime["normalizeTunnelBootstrapTtlMs"];
  normalizeTunnelSessionTtlMs: SettingsNormalizationRuntime["normalizeTunnelSessionTtlMs"];
  normalizeTunnelProvider: (value: unknown) => string | undefined;
  normalizeTunnelMode: (value: unknown) => string | undefined;
  normalizeOptionalPath: (value: unknown) => string | null;
  normalizeManagedRemoteTunnelHostname: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelHostname"];
  normalizeManagedRemoteTunnelPresets: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresets"];
  normalizeManagedRemoteTunnelPresetTokens: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresetTokens"];
  sanitizeTypographySizesPartial: SettingsNormalizationRuntime["sanitizeTypographySizesPartial"];
  normalizeStringArray: SettingsNormalizationRuntime["normalizeStringArray"];
  sanitizeModelRefs: SettingsNormalizationRuntime["sanitizeModelRefs"];
  sanitizeSkillCatalogs: SettingsNormalizationRuntime["sanitizeSkillCatalogs"];
  sanitizeProjects: SettingsNormalizationRuntime["sanitizeProjects"];
}

export interface SettingsHelpers {
  normalizePwaAppName(value: unknown, fallback?: string): string;
  normalizePwaOrientation(value: unknown, fallback?: string): string;
  sanitizeSettingsUpdate(payload: object): any;
  mergePersistedSettings(current: any, changes: any): any;
  formatSettingsResponse(settings: any): any;
}

export interface SettingsRuntimeDeps {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  crypto: typeof import("crypto");
  SETTINGS_FILE_PATH: string;
  sanitizeProjects: SettingsNormalizationRuntime["sanitizeProjects"];
  sanitizeSettingsUpdate: SettingsHelpers["sanitizeSettingsUpdate"];
  mergePersistedSettings: SettingsHelpers["mergePersistedSettings"];
  normalizeSettingsPaths: SettingsNormalizationRuntime["normalizeSettingsPaths"];
  normalizeStringArray: SettingsNormalizationRuntime["normalizeStringArray"];
  formatSettingsResponse: SettingsHelpers["formatSettingsResponse"];
  resolveDirectoryCandidate: (value: string) => string | null;
  normalizeManagedRemoteTunnelHostname: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelHostname"];
  normalizeManagedRemoteTunnelPresets: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresets"];
  normalizeManagedRemoteTunnelPresetTokens: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresetTokens"];
  syncManagedRemoteTunnelConfigWithPresets: (settings: object) => object;
  upsertManagedRemoteTunnelToken: (token: { id: string; name: string; hostname: string; token: string }) => void;
}

export interface SettingsRuntime {
  readSettingsFromDisk(): Promise<any>;
  readSettingsFromDiskMigrated(): Promise<any>;
  writeSettingsToDisk(settings: any): Promise<void>;
  persistSettings(changes: any): Promise<any>;
}

export interface ThemeRuntimeDeps {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  themesDir: string;
  maxThemeJsonBytes: number;
  logger: typeof console;
}

export interface ThemeRuntime {
  normalizeThemeJson(raw: unknown): object | null;
  readCustomThemesFromDisk(): Promise<object[]>;
}

export interface SettingsDomainDeps {
  normalization: SettingsNormalizationDeps;
  helpers: SettingsHelpersDeps;
  runtime: Omit<SettingsRuntimeDeps, "normalizeSettingsPaths" | "sanitizeSettingsUpdate" | "mergePersistedSettings" | "formatSettingsResponse" | "sanitizeProjects" | "normalizeManagedRemoteTunnelHostname" | "normalizeManagedRemoteTunnelPresets" | "normalizeManagedRemoteTunnelPresetTokens" | "normalizeStringArray" | "resolveDirectoryCandidate" | "syncManagedRemoteTunnelConfigWithPresets" | "upsertManagedRemoteTunnelToken">;
  themes: ThemeRuntimeDeps;
}

export interface SettingsDomain {
  normalization: SettingsNormalizationRuntime;
  helpers: SettingsHelpers;
  runtime: SettingsRuntime;
  themes: ThemeRuntime;
  normalizeDirectoryPath: SettingsNormalizationRuntime["normalizeDirectoryPath"];
  normalizePathForPersistence: SettingsNormalizationRuntime["normalizePathForPersistence"];
  normalizeSettingsPaths: SettingsNormalizationRuntime["normalizeSettingsPaths"];
  normalizeTunnelBootstrapTtlMs: SettingsNormalizationRuntime["normalizeTunnelBootstrapTtlMs"];
  normalizeTunnelSessionTtlMs: SettingsNormalizationRuntime["normalizeTunnelSessionTtlMs"];
  normalizeManagedRemoteTunnelHostname: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelHostname"];
  normalizeManagedRemoteTunnelPresets: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresets"];
  normalizeManagedRemoteTunnelPresetTokens: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresetTokens"];
  isUnsafeSkillRelativePath: SettingsNormalizationRuntime["isUnsafeSkillRelativePath"];
  sanitizeTypographySizesPartial: SettingsNormalizationRuntime["sanitizeTypographySizesPartial"];
  normalizeStringArray: SettingsNormalizationRuntime["normalizeStringArray"];
  sanitizeModelRefs: SettingsNormalizationRuntime["sanitizeModelRefs"];
  sanitizeSkillCatalogs: SettingsNormalizationRuntime["sanitizeSkillCatalogs"];
  sanitizeProjects: SettingsNormalizationRuntime["sanitizeProjects"];
  normalizePwaAppName: SettingsHelpers["normalizePwaAppName"];
  normalizePwaOrientation: SettingsHelpers["normalizePwaOrientation"];
  sanitizeSettingsUpdate: SettingsHelpers["sanitizeSettingsUpdate"];
  mergePersistedSettings: SettingsHelpers["mergePersistedSettings"];
  formatSettingsResponse: SettingsHelpers["formatSettingsResponse"];
  readSettingsFromDisk: SettingsRuntime["readSettingsFromDisk"];
  readSettingsFromDiskMigrated: SettingsRuntime["readSettingsFromDiskMigrated"];
  writeSettingsToDisk: SettingsRuntime["writeSettingsToDisk"];
  persistSettings: SettingsRuntime["persistSettings"];
  readCustomThemesFromDisk: ThemeRuntime["readCustomThemesFromDisk"];
}