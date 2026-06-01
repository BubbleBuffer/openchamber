/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CoreRoutesDeps {
  process: typeof import("process");
  openchamberVersion: string;
  runtimeName: string;
  serverStartedAt: string;
  gracefulShutdown: (opts?: any) => Promise<void>;
  getHealthSnapshot: () => any;
}

export interface AuthRoutesDeps {
  tunnelAuthController: any;
  uiAuthController: any;
  readSettingsFromDiskMigrated: () => Promise<object>;
  normalizeTunnelSessionTtlMs: (value: number) => number;
}

export interface SettingsUtilityRoutesDeps {
  readCustomThemesFromDisk: () => Promise<object[]>;
  refreshOpenCodeAfterConfigChange: (reason: string, options?: any) => Promise<void>;
  clientReloadDelayMs: number;
}

export interface CommonMiddlewareDeps {
  express: typeof import("express");
}

export interface OpenCodeRoutesDeps {
  crypto: typeof import("crypto");
  clientReloadDelayMs: number;
  getOpenCodeResolutionSnapshot: (settings: object) => Promise<object>;
  formatSettingsResponse: (settings: object) => object;
  readSettingsFromDisk: () => Promise<object>;
  readSettingsFromDiskMigrated: () => Promise<object>;
  persistSettings: (changes: object) => Promise<object>;
  sanitizeProjects: (input: unknown) => Array<Record<string, unknown>> | undefined;
  validateDirectoryPath: (candidate: string) => Promise<{ ok: boolean; directory?: string; error?: string }>;
  resolveProjectDirectory: (req: any) => Promise<{ directory: string | null; error: string | null }>;
  getProviderSources: (providerId: string, directory: string | null) => any;
  removeProviderConfig: (providerId: string, directory: string | null, scope: string) => boolean;
  refreshOpenCodeAfterConfigChange: (reason: string, options?: any) => Promise<void>;
}

export interface FeatureRoutesDeps {
  clientReloadDelayMs: number;
}

export interface StaticRoutesDeps {
  fs: typeof import("fs");
  path: typeof import("path");
  process: typeof import("process");
  __dirname: string;
  express: typeof import("express");
  resolveProjectDirectory: (req: any) => Promise<{ directory: string | null; error: string | null }>;
  openCodeRuntime: any;
  readSettingsFromDiskMigrated: () => Promise<object>;
  normalizePwaAppName: (value: unknown, fallback?: string) => string;
  normalizePwaOrientation: (value: unknown, fallback?: string) => string;
}

export interface PwaManifestDeps {
  process: typeof import("process");
  resolveProjectDirectory: (req: any) => Promise<{ directory: string | null; error: string | null }>;
  openCodeRuntime: any;
  readSettingsFromDiskMigrated: () => Promise<object>;
  normalizePwaAppName: (value: unknown, fallback?: string) => string;
  normalizePwaOrientation: (value: unknown, fallback?: string) => string;
}

export interface OpenChamberRoutesDeps {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  process: typeof import("process");
  server: any;
  __dirname: string;
  openchamberDataDir: string;
  modelsDevApiUrl: string;
  modelsMetadataCacheTtl: number;
  readSettingsFromDiskMigrated: () => Promise<object>;
  fetchFreeZenModels: () => Promise<unknown[]>;
  getCachedZenModels: () => { models: unknown[] } | null;
}