import type {
  AppSettings,
  PersistedSettings,
} from "../../contracts/settings.js";

export type SettingsRecord = Record<string, unknown>;
export type AppSettingsRecord = AppSettings & SettingsRecord;
export type PersistedSettingsRecord = PersistedSettings & SettingsRecord;

export interface SettingsNormalizationDeps {
  os: typeof import("os");
  path: typeof import("path");
  processLike: typeof process;
}

export interface SettingsNormalizationRuntime {
  normalizeDirectoryPath(value: unknown): string | unknown;
  normalizePathForPersistence(value: unknown): string | unknown;
  normalizeSettingsPaths(input: object): { settings: object; changed: boolean };
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
  sanitizeTypographySizesPartial: SettingsNormalizationRuntime["sanitizeTypographySizesPartial"];
  normalizeStringArray: SettingsNormalizationRuntime["normalizeStringArray"];
  sanitizeModelRefs: SettingsNormalizationRuntime["sanitizeModelRefs"];
  sanitizeSkillCatalogs: SettingsNormalizationRuntime["sanitizeSkillCatalogs"];
  sanitizeProjects: SettingsNormalizationRuntime["sanitizeProjects"];
}

export interface SettingsHelpers {
  normalizePwaAppName(value: unknown, fallback?: string): string;
  normalizePwaOrientation(value: unknown, fallback?: string): string;
  sanitizeSettingsUpdate(payload: object): object;
  mergePersistedSettings(current: object, changes: object): object;
  formatSettingsResponse(settings: object): object;
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
}

export interface SettingsRuntime {
  readSettingsFromDisk(): Promise<PersistedSettingsRecord>;
  readSettingsFromDiskMigrated(): Promise<PersistedSettingsRecord>;
  writeSettingsToDisk(settings: object): Promise<void>;
  persistSettings<T extends object | void = AppSettingsRecord>(changes: object): Promise<T>;
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
  runtime: Omit<SettingsRuntimeDeps, "normalizeSettingsPaths" | "sanitizeSettingsUpdate" | "mergePersistedSettings" | "formatSettingsResponse" | "sanitizeProjects" | "normalizeStringArray" | "resolveDirectoryCandidate">;
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
