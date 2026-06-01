# Stage 5a: Bootstrap + Settings + Route Infrastructure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Review

- **Status:** ISSUES_RESOLVED
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-06-01
- **Findings:**
  - Dead reference (`registerTtsRoutes` in `BootstrapDeps`): RESOLVED — `registerTtsRoutes` is a bridge function parameter injected from the old JS TTS module, not a TS domain. Same pattern as Stage 4's `openCodeRuntime: any` boundaries. Will be properly ported in Stage 5b/c.
  - Missing barrel (`bootstrap/index.ts`): RESOLVED — Step 7 added to Task 8 creating the barrel export.

**Goal:** Port all remaining modules that `packages/web/server/index.js` directly imports at module level, completing the bootstrap, settings, route registration, and server-utilities domains.

**Architecture:** TypeScript factories for settings (normalization, helpers, runtime, themes), server utilities (proxy, utilities), route infrastructure (core routes, feature routes, static routes, openchamber routes, PWA manifest), and bootstrap orchestration (bootstrap-runtime, startup-pipeline, shutdown, server-startup, CLI entry/options, lifecycle). Supporting sub-runtimes (env-runtime, env-config, network, auth, hmr-state, resolution) ported together since they form a tight dependency web. Tunnel wiring ported as a bridge module. Cut over index.js from `./lib/opencode/bootstrap/*` to `./dist/domains/bootstrap/*` and delete old JS.

**Tech Stack:** Node.js (http, fs, os, path, crypto, child_process), Express, ws, http-proxy-middleware, @opencode-ai/sdk

---

## File Map

```
packages/web/server/src/
  shared/
    types.ts (MODIFY — add bootstrap types + EventBus type)
  domains/
    core/
      event-bus.ts          — createEventBus (from lib/core/event-bus.js)
      events.ts             — EVENTS constants (from lib/core/events.js)
      index.ts              — barrel
    settings/
      types.ts              — SettingsNormalizationDeps, SettingsHelpersDeps, etc.
      normalization.ts      — createSettingsNormalizationRuntime
      helpers.ts            — createSettingsHelpers
      runtime.ts            — createSettingsRuntime
      themes.ts             — createThemeRuntime
      index.ts              — barrel
    server-utils/
      types.ts              — ServerUtilsDeps, ProxyDeps
      utils.ts              — createServerUtilsRuntime
      proxy.ts              — registerOpenCodeProxy, SSE helpers
      index.ts              — barrel
    bootstrap/
      types.ts              — BootstrapDeps, StartupPipelineDeps, ShutdownDeps, etc.
      cli-options.ts        — parseServeCliOptions
      cli-entry.ts          — runCliEntryIfMain
      server-startup.ts     — createServerStartupRuntime
      startup-pipeline.ts   — createStartupPipelineRuntime
      bootstrap-runtime.ts  — createBootstrapRuntime
      shutdown-runtime.ts   — createGracefulShutdownRuntime
      lifecycle.ts          — createOpenCodeLifecycleRuntime (wraps old JS)
      tunnel-wiring.ts      — createTunnelWiringRuntime (wraps old JS)
      index.ts              — barrel
    opencode-support/
      types.ts              — SupportDeps
      env-config.ts         — resolveOpenCodeEnvConfig
      env-runtime.ts        — createOpenCodeEnvRuntime (wraps old JS)
      network.ts            — createOpenCodeNetworkRuntime (wraps old JS)
      auth-state.ts         — createOpenCodeAuthStateRuntime (wraps old JS)
      hmr-state.ts          — createHmrStateRuntime
      opencode-resolution.ts — createOpenCodeResolutionRuntime
      project-directory.ts  — createProjectDirectoryRuntime
      index.ts              — barrel
```

New domain layout: `core/`, `settings/`, `server-utils/`, `bootstrap/`, `opencode-support/`.

---

### Task 1: Core Infrastructure — EventBus + Events types

**Files:**
- Create: `packages/web/server/src/domains/core/events.ts`
- Create: `packages/web/server/src/domains/core/event-bus.ts`
- Create: `packages/web/server/src/domains/core/index.ts`
- Modify: `packages/web/server/src/shared/types.ts` — add `EventBus` type

- [ ] **Step 1: Port EVENTS constants**

Read `packages/web/server/lib/core/events.js` and `packages/web/server/lib/core/event-bus.js` first.

Create `packages/web/server/src/domains/core/events.ts`:

```typescript
export const EVENTS = {
  OPENCODE_READY: "opencode:ready",
  OPENCODE_RESTARTING: "opencode:restarting",
  OPENCODE_RESTARTED: "opencode:restarted",
  OPENCODE_UNHEALTHY: "opencode:unhealthy",
  EVENT_RECEIVED: "event:received",
  SESSION_ACTIVITY_CHANGED: "session:activity-changed",
  SESSION_NEEDS_ATTENTION: "session:needs-attention",
  NOTIFICATION_SEND_UI: "notification:send-ui",
  NOTIFICATION_SEND_DESKTOP: "notification:send-desktop",
  NOTIFICATION_SEND_PUSH: "notification:send-push",
  TUNNEL_READY: "tunnel:ready",
  TUNNEL_CHANGED: "tunnel:changed",
  TUNNEL_ERROR: "tunnel:error",
  SERVER_PORT_BOUND: "server:port-bound",
} as const;

export type EventName = keyof typeof EVENTS;
```

- [ ] **Step 2: Write EventBus class**

Create `packages/web/server/src/domains/core/event-bus.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
type EventHandler = (payload: any) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private onceHandlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  once(event: string, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) this.onceHandlers.set(event, new Set());
    this.onceHandlers.get(event)!.add(handler);
  }

  emit(event: string, payload: any): void {
    const hs = this.handlers.get(event);
    if (hs) for (const h of hs) h(payload);
    const oh = this.onceHandlers.get(event);
    if (oh) {
      for (const h of oh) h(payload);
      oh.clear();
    }
  }

  removeAllFor(event: string): void {
    this.handlers.get(event)?.clear();
    this.onceHandlers.get(event)?.clear();
  }

  dispose(): void {
    this.handlers.clear();
    this.onceHandlers.clear();
  }
}

export function createEventBus(): EventBus {
  return new EventBus();
}
```

Add to `packages/web/server/src/shared/types.ts`:
```typescript
import type { EventBus } from "../domains/core/event-bus.js";
// re-export if needed, or add to ServerRuntime.domains
```

- [ ] **Step 3: Barrel**

Create `packages/web/server/src/domains/core/index.ts`:
```typescript
export { createEventBus, EventBus } from "./event-bus.js";
export { EVENTS } from "./events.js";
```

- [ ] **Step 4: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/core/ packages/web/server/src/shared/types.ts
git commit -m "feat(server): add core event-bus and events domain"
```

---

### Task 2: Settings Domain — Types

**Files:**
- Create: `packages/web/server/src/domains/settings/types.ts`

- [ ] **Step 1: Define all settings types**

Read `packages/web/server/lib/opencode/settings/settings-normalization-runtime.js`, `settings-helpers.js`, `settings-runtime.js`, and `services/theme-runtime.js` for exact signatures.

Create `packages/web/server/src/domains/settings/types.ts`:

```typescript
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
  normalizeSettingsPaths(input: object): { settings: object; changed: boolean };
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
  normalizeManagedRemoteTunnelHostname: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelHostname"];
  normalizeManagedRemoteTunnelPresets: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresets"];
  normalizeManagedRemoteTunnelPresetTokens: SettingsNormalizationRuntime["normalizeManagedRemoteTunnelPresetTokens"];
  syncManagedRemoteTunnelConfigWithPresets: (settings: object) => object;
  upsertManagedRemoteTunnelToken: (token: string) => void;
}

export interface SettingsRuntime {
  readSettingsFromDisk(): Promise<object>;
  readSettingsFromDiskMigrated(): Promise<object>;
  writeSettingsToDisk(settings: object): Promise<void>;
  persistSettings(changes: object): Promise<object>;
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
```

- [ ] **Step 2: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/settings/types.ts
git commit -m "feat(server): add settings domain types"
```

---

### Task 3: Settings Domain — Normalization Runtime

**Files:**
- Create: `packages/web/server/src/domains/settings/normalization.ts`

- [ ] **Step 1: Port normalization runtime**

Read `packages/web/server/lib/opencode/settings/settings-normalization-runtime.js` fully. Port verbatim to TypeScript.

Create `packages/web/server/src/domains/settings/normalization.ts`:

```typescript
import type { SettingsNormalizationDeps, SettingsNormalizationRuntime } from "./types.js";

export function createSettingsNormalizationRuntime(
  deps: SettingsNormalizationDeps,
): SettingsNormalizationRuntime {
  const {
    os,
    path,
    processLike,
    tunnelBootstrapTtlDefaultMs,
    tunnelBootstrapTtlMinMs,
    tunnelBootstrapTtlMaxMs,
    tunnelSessionTtlDefaultMs,
    tunnelSessionTtlMinMs,
    tunnelSessionTtlMaxMs,
  } = deps;

  const home = os.homedir();

  function normalizeDirectoryPath(value: unknown): string | unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed.startsWith("~")) return path.join(home, trimmed.slice(1));
    if (trimmed && path.isAbsolute(trimmed)) return trimmed;
    return value;
  }

  function normalizePathForPersistence(value: unknown): string | unknown {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed.startsWith(home)) return `~${trimmed.slice(home.length)}`;
    return trimmed;
  }

  function normalizeSettingsPaths(input: object): { settings: object; changed: boolean } {
    // Port the full implementation — path normalization for every known path field
    // This must be a verbatim port of the old JS logic
    const settings = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    let changed = false;
    const pathFields = ["lastDirectory", "homeDirectory"];
    for (const field of pathFields) {
      if (typeof settings[field] === "string") {
        const normalized = normalizeDirectoryPath(settings[field]);
        if (normalized !== settings[field]) {
          settings[field] = normalized;
          changed = true;
        }
      }
    }
    if (Array.isArray(settings.projects)) {
      const projects = settings.projects as Array<Record<string, unknown>>;
      for (const project of projects) {
        if (typeof project.path === "string") {
          const normalized = normalizeDirectoryPath(project.path);
          if (normalized !== project.path) {
            project.path = normalized;
            changed = true;
          }
        }
      }
    }
    return { settings, changed };
  }

  function normalizeTunnelBootstrapTtlMs(value: number | null): number | null {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value)) return tunnelBootstrapTtlDefaultMs;
    return Math.min(Math.max(value, tunnelBootstrapTtlMinMs), tunnelBootstrapTtlMaxMs);
  }

  function normalizeTunnelSessionTtlMs(value: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return tunnelSessionTtlDefaultMs;
    return Math.min(Math.max(value, tunnelSessionTtlMinMs), tunnelSessionTtlMaxMs);
  }

  function normalizeManagedRemoteTunnelHostname(value: unknown): string | undefined {
    if (typeof value === "string" && value.trim()) return value.trim();
    return undefined;
  }

  function normalizeManagedRemoteTunnelPresets(
    value: unknown,
  ): Array<{ id: string; name: string; hostname: string }> | undefined {
    if (!Array.isArray(value)) return undefined;
    return value
      .filter(
        (p): p is Record<string, unknown> =>
          typeof p === "object" && p !== null && typeof p.id === "string" && typeof p.name === "string" && typeof p.hostname === "string",
      )
      .map((p) => ({ id: p.id as string, name: p.name as string, hostname: p.hostname as string }));
  }

  function normalizeManagedRemoteTunnelPresetTokens(value: unknown): Record<string, string> | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === "string") result[key] = val;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function isUnsafeSkillRelativePath(value: unknown): boolean {
    if (typeof value !== "string") return true;
    return value.includes("..") || path.isAbsolute(value);
  }

  function sanitizeTypographySizesPartial(input: unknown): Record<string, string> | undefined {
    if (typeof input !== "object" || input === null) return undefined;
    const validKeys = ["markdown", "code", "uiHeader", "uiLabel", "meta", "micro"];
    const result: Record<string, string> = {};
    const obj = input as Record<string, unknown>;
    for (const key of validKeys) {
      if (typeof obj[key] === "string") result[key] = obj[key] as string;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function normalizeStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input.filter((item): item is string => typeof item === "string");
  }

  function sanitizeModelRefs(
    input: unknown,
    limit: number,
  ): Array<{ providerID: string; modelID: string }> | undefined {
    if (!Array.isArray(input)) return undefined;
    const result = input
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && typeof item.providerID === "string" && typeof item.modelID === "string",
      )
      .slice(0, limit)
      .map((item) => ({ providerID: item.providerID as string, modelID: item.modelID as string }));
    return result.length > 0 ? result : undefined;
  }

  function sanitizeSkillCatalogs(
    input: unknown,
  ): Array<{ id: string; label: string; source: string; subpath?: string; gitIdentityId?: string }> | undefined {
    if (!Array.isArray(input)) return undefined;
    const result = input
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.label === "string" && typeof item.source === "string",
      )
      .map((item) => ({
        id: item.id as string,
        label: item.label as string,
        source: item.source as string,
        subpath: typeof item.subpath === "string" ? item.subpath : undefined,
        gitIdentityId: typeof item.gitIdentityId === "string" ? item.gitIdentityId : undefined,
      }));
    return result.length > 0 ? result : undefined;
  }

  function sanitizeProjects(input: unknown): Array<Record<string, unknown>> | undefined {
    if (!Array.isArray(input)) return undefined;
    const result = input
      .filter((item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).path === "string")
      .map((item) => {
        const p = item as Record<string, unknown>;
        const entry: Record<string, unknown> = { id: p.id, path: p.path };
        if (typeof p.label === "string") entry.label = p.label;
        if (typeof p.icon === "string") entry.icon = p.icon;
        if (typeof p.iconImage === "object" && p.iconImage !== null) entry.iconImage = p.iconImage;
        if (typeof p.iconBackground === "string" || p.iconBackground === null) entry.iconBackground = p.iconBackground;
        if (typeof p.color === "string") entry.color = p.color;
        if (typeof p.addedAt === "number") entry.addedAt = p.addedAt;
        if (typeof p.lastOpenedAt === "number") entry.lastOpenedAt = p.lastOpenedAt;
        if (typeof p.sidebarCollapsed === "boolean") entry.sidebarCollapsed = p.sidebarCollapsed;
        return entry;
      });
    return result.length > 0 ? result : undefined;
  }

  return {
    normalizeDirectoryPath,
    normalizePathForPersistence,
    normalizeSettingsPaths,
    normalizeTunnelBootstrapTtlMs,
    normalizeTunnelSessionTtlMs,
    normalizeManagedRemoteTunnelHostname,
    normalizeManagedRemoteTunnelPresets,
    normalizeManagedRemoteTunnelPresetTokens,
    isUnsafeSkillRelativePath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  };
}
```

- [ ] **Step 2: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/settings/normalization.ts
git commit -m "feat(server): add settings normalization runtime"
```

---

### Task 4: Settings Domain — Helpers, Runtime, Themes

**Files:**
- Create: `packages/web/server/src/domains/settings/helpers.ts`
- Create: `packages/web/server/src/domains/settings/runtime.ts`
- Create: `packages/web/server/src/domains/settings/themes.ts`
- Create: `packages/web/server/src/domains/settings/index.ts`

- [ ] **Step 1: Port helpers**

Read `packages/web/server/lib/opencode/settings/settings-helpers.js` fully. Port verbatim to TypeScript.

Create `packages/web/server/src/domains/settings/helpers.ts` — this is ~650 lines of validation/sanitization. Port every function exactly, changing only syntax (arrow functions → function declarations as needed, no behavioral changes).

Key functions to preserve:
- `normalizePwaAppName(value, fallback?)` → `string`
- `normalizePwaOrientation(value, fallback?)` → `string`
- `sanitizeSettingsUpdate(payload)` → `object` — the massive 400+ line sanitizer, port as-is
- `mergePersistedSettings(current, changes)` → `object`
- `formatSettingsResponse(settings)` → `object`

Use `/* eslint-disable @typescript-eslint/no-explicit-any */` at the top since the settings object is dynamically shaped.

- [ ] **Step 2: Port runtime**

Read `packages/web/server/lib/opencode/settings/settings-runtime.js` fully. Port verbatim to TypeScript.

Create `packages/web/server/src/domains/settings/runtime.ts` — this is ~825 lines:
- `readSettingsFromDisk()` — `fsPromises.readFile` + `JSON.parse`
- `readSettingsFromDiskMigrated()` — chains 7 migrations
- `writeSettingsToDisk(settings)` — atomic write (write to `.tmp` → rename)
- `persistSettings(changes)` — full read/sanitize/normalize/migrate/validate/write pipeline
- All internal helpers: `readJsonFile`, `writeJsonFile`, `uniqueStrings`, `mergeByKey`, `remapPlanPaths`, `mergeProjectConfigData`, `moveDirectoryContents`, migrations (lastDirectory, theme, collapsedProjects, notification defaults, named tunnel keys, path normalization, deterministic project IDs), `recoverOrphanProjectFiles`, `validateProjectEntries`

File-level eslint-disable for complexity and max-lines since this is a direct port.

- [ ] **Step 3: Port themes**

Read `packages/web/server/lib/opencode/services/theme-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/settings/themes.ts`:
- `normalizeThemeJson(raw)` → validates color fields, returns theme or null
- `readCustomThemesFromDisk()` → reads `.json` files from themes directory

- [ ] **Step 4: Barrel**

Create `packages/web/server/src/domains/settings/index.ts`:

```typescript
export { createSettingsNormalizationRuntime } from "./normalization.js";
export { createSettingsHelpers } from "./helpers.js";
export { createSettingsRuntime } from "./runtime.js";
export { createThemeRuntime } from "./themes.js";
export type * from "./types.js";
```

- [ ] **Step 5: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/settings/
git commit -m "feat(server): add settings helpers, runtime, and themes domain"
```

---

### Task 5: Server Utils Domain — Types, Utils, Proxy

**Files:**
- Create: `packages/web/server/src/domains/server-utils/types.ts`
- Create: `packages/web/server/src/domains/server-utils/utils.ts`
- Create: `packages/web/server/src/domains/server-utils/proxy.ts`
- Create: `packages/web/server/src/domains/server-utils/index.ts`

- [ ] **Step 1: Types**

Create `packages/web/server/src/domains/server-utils/types.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ServerUtilsRuntimeDeps {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  process: typeof import("process");
  openCodeReadyGraceMs: number;
  longRequestTimeoutMs: number;
  openCodeRuntime: any;
  getUiNotificationClients: () => Set<any>;
  getLoginShellPath: () => string | null;
}

export interface ServerUtilsRuntime {
  setOpenCodePort(port: number): void;
  waitForOpenCodePort(timeoutMs?: number): Promise<number>;
  buildAugmentedPath(): string;
  buildManagedOpenCodePath(): string;
  parseSseDataPayload(block: string): object | null;
  fetchAgentsSnapshot(): Promise<unknown[]>;
  fetchProvidersSnapshot(): Promise<unknown[]>;
  fetchModelsSnapshot(): Promise<unknown[]>;
  setupProxy(app: any): void;
}

export interface ProxyDeps {
  fs: typeof import("fs");
  os: typeof import("os");
  path: typeof import("path");
  OPEN_CODE_READY_GRACE_MS: number;
  openCodeRuntime: any;
}
```

- [ ] **Step 2: Port server-utils**

Read `packages/web/server/lib/opencode/server-utils-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/server-utils/utils.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerOpenCodeProxy } from "./proxy.js";
import type { ServerUtilsRuntime, ServerUtilsRuntimeDeps } from "./types.js";

export function createServerUtilsRuntime(
  deps: ServerUtilsRuntimeDeps,
): ServerUtilsRuntime {
  const {
    fs,
    os,
    path,
    process: proc,
    openCodeReadyGraceMs,
    longRequestTimeoutMs,
    openCodeRuntime,
    getUiNotificationClients,
    getLoginShellPath,
  } = deps;

  let openCodePort = 0;

  function setOpenCodePort(port: number): void {
    openCodePort = port;
  }

  async function waitForOpenCodePort(timeoutMs = 30000): Promise<number> {
    // Port the exact implementation — net.connect probe loop
    const net = await import("node:net");
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection(openCodePort, "127.0.0.1");
          socket.on("connect", () => { socket.destroy(); resolve(); });
          socket.on("error", reject);
          socket.setTimeout(1000, () => { socket.destroy(); reject(new Error("timeout")); });
        });
        return openCodePort;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`OpenCode port ${openCodePort} not reachable after ${timeoutMs}ms`);
  }

  function buildAugmentedPath(): string {
    const loginShellPath = getLoginShellPath();
    if (!loginShellPath) return proc.env.PATH || "";
    return `${loginShellPath}:${proc.env.PATH || ""}`;
  }

  function buildManagedOpenCodePath(): string {
    const managedPath = [];
    if (proc.env.HOME) managedPath.push(path.join(proc.env.HOME, ".local", "bin"));
    if (proc.env.HOME) managedPath.push(path.join(proc.env.HOME, ".npm-global", "bin"));
    if (proc.env.HOME) managedPath.push(path.join(proc.env.HOME, "node_modules", ".bin"));
    if (proc.env.XDG_DATA_HOME) managedPath.push(path.join(proc.env.XDG_DATA_HOME, "npm", "bin"));
    managedPath.push("/usr/local/bin");
    managedPath.push("/usr/bin");
    return managedPath.filter((p) => fs.existsSync(p)).join(path.delimiter);
  }

  function parseSseDataPayload(block: string): object | null {
    if (!block || typeof block !== "string") return null;
    try {
      const parsed = JSON.parse(block);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async function fetchAgentsSnapshot(): Promise<unknown[]> {
    try {
      const url = openCodeRuntime.getUrl("/agent", "");
      const headers = openCodeRuntime.getAuthHeaders();
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(longRequestTimeoutMs) });
      if (!res.ok) return [];
      return (await res.json()) as unknown[];
    } catch {
      return [];
    }
  }

  async function fetchProvidersSnapshot(): Promise<unknown[]> {
    try {
      const url = openCodeRuntime.getUrl("/config", "");
      const headers = openCodeRuntime.getAuthHeaders();
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(longRequestTimeoutMs) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as any)?.providers ?? [];
    } catch {
      return [];
    }
  }

  async function fetchModelsSnapshot(): Promise<unknown[]> {
    try {
      const url = openCodeRuntime.getUrl("/config", "");
      const headers = openCodeRuntime.getAuthHeaders();
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(longRequestTimeoutMs) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as any)?.models ?? [];
    } catch {
      return [];
    }
  }

  function setupProxy(app: any): void {
    registerOpenCodeProxy(app, {
      fs,
      os,
      path,
      OPEN_CODE_READY_GRACE_MS: openCodeReadyGraceMs,
      openCodeRuntime,
    });
  }

  return {
    setOpenCodePort,
    waitForOpenCodePort,
    buildAugmentedPath,
    buildManagedOpenCodePath,
    parseSseDataPayload,
    fetchAgentsSnapshot,
    fetchProvidersSnapshot,
    fetchModelsSnapshot,
    setupProxy,
  };
}
```

- [ ] **Step 3: Port proxy**

Read `packages/web/server/lib/opencode/network/proxy.js` fully (365 lines). Port verbatim.

Create `packages/web/server/src/domains/server-utils/proxy.ts`:

This is a 365-line file. Port exactly:
- `waitForSseDrain(res, signal?)` — waits for SSE response to drain
- `writeSseChunkWithBackpressure(res, value, signal)` → `boolean`
- `registerOpenCodeProxy(app, deps)` — registers:
  - Readiness gate middleware (503 while OpenCode not ready)
  - SSE proxy for `/api/global/event` and `/api/event`
  - Generic proxy via `http-proxy-middleware` for all other `/api` routes
  - Windows session merge logic

Import `createProxyMiddleware` from `http-proxy-middleware` and the three proxy header helpers from `../../../proxy-headers.js`.

Use `/* eslint-disable @typescript-eslint/no-explicit-any */` at file level.

- [ ] **Step 4: Barrel**

Create `packages/web/server/src/domains/server-utils/index.ts`:

```typescript
export { createServerUtilsRuntime } from "./utils.js";
export { registerOpenCodeProxy, waitForSseDrain, writeSseChunkWithBackpressure } from "./proxy.js";
export type * from "./types.js";
```

- [ ] **Step 5: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/server-utils/
git commit -m "feat(server): add server-utils domain (utils + proxy)"
```

---

### Task 6: OpenCode Support Domain — Env, Auth, HMR, Resolution

**Files:**
- Create: `packages/web/server/src/domains/opencode-support/types.ts`
- Create: `packages/web/server/src/domains/opencode-support/env-config.ts`
- Create: `packages/web/server/src/domains/opencode-support/env-runtime.ts`
- Create: `packages/web/server/src/domains/opencode-support/network.ts`
- Create: `packages/web/server/src/domains/opencode-support/auth-state.ts`
- Create: `packages/web/server/src/domains/opencode-support/hmr-state.ts`
- Create: `packages/web/server/src/domains/opencode-support/opencode-resolution.ts`
- Create: `packages/web/server/src/domains/opencode-support/project-directory.ts`
- Create: `packages/web/server/src/domains/opencode-support/index.ts`

- [ ] **Step 1: Types**

Create `packages/web/server/src/domains/opencode-support/types.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HmrState {
  openCodePort?: number;
  openCodeAuthPassword?: string | null;
  openCodeAuthSource?: string | null;
  openCodeWorkingDirectory?: string;
  isOpenCodeReady?: boolean;
  isShuttingDown?: boolean;
  openCodeApiPrefix?: string;
  resolvedOpencodeBinary?: string | null;
  resolvedOpencodeBinarySource?: string | null;
  useWslForOpencode?: boolean;
  resolvedWslBinary?: string | null;
  resolvedWslOpencodePath?: string | null;
  resolvedWslDistro?: string | null;
  userProvidedOpenCodePassword?: string | null;
  openCodeNotReadySince?: number;
}

export interface HmrStateRuntimeDeps {
  globalThisLike: typeof globalThis;
  os: typeof import("os");
  processLike: typeof import("process");
  stateKey: string;
}

export interface HmrStateRuntime {
  getOrCreateHmrState(): HmrState;
  ensureUserProvidedOpenCodePassword(hmrState: HmrState): void;
  getUserProvidedOpenCodePassword(hmrState: HmrState): string | null;
  resolveOpenCodeAuthFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any;
  syncStateFromRuntime(hmrState: HmrState, runtime: any): void;
  restoreRuntimeFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any;
}

export interface OpenCodeEnvConfigResult {
  configuredOpenCodePort: number | null;
  configuredOpenCodeHost: { origin: string; port: number } | null;
  effectivePort: number | null;
  configuredOpenCodeHostname: string;
}

export interface EnvRuntimeDeps {
  state: HmrState;
  normalizeDirectoryPath: (value: unknown) => string | unknown;
  readSettingsFromDiskMigrated: () => Promise<object>;
  ENV_CONFIGURED_OPENCODE_WSL_DISTRO: string | null;
}

export interface OpenCodeEnvRuntime {
  parseNullSeparatedEnvSnapshot(raw: string): object | null;
  isExecutable(filePath: string): boolean;
  searchPathFor(binaryName: string): string | null;
  prependToPath(dir: string): void;
  getWindowsShellEnvSnapshot(): object | null;
  getLoginShellEnvSnapshot(): object | null;
  applyLoginShellEnvSnapshot(): void;
  ensureOpencodeCliEnv(): void;
  applyOpencodeBinaryFromSettings(): Promise<void>;
  resolveOpencodeCliPath(): string | null;
  resolveGitBinaryForSpawn(): string;
  resolveWslExecutablePath(): string | null;
  buildWslExecArgs(args: string[], distro?: string): string[];
  resolveManagedOpenCodeLaunchSpec(binary: string): any | null;
  clearResolvedOpenCodeBinary(): void;
}

export interface NetworkRuntimeDeps {
  state: { openCodePort: number; openCodeBaseUrl: string; openCodeApiPrefix: string; openCodeApiPrefixDetected: boolean; openCodeApiDetectionTimer: any };
  getOpenCodeAuthHeaders: () => Record<string, string>;
}

export interface OpenCodeNetworkRuntime {
  waitForReady(url: string, timeoutMs?: number): Promise<boolean>;
  normalizeApiPrefix(prefix: string): string;
  setDetectedOpenCodeApiPrefix(): void;
  buildOpenCodeUrl(pathStr: string, prefixOverride?: string): string;
  ensureOpenCodeApiPrefix(): void;
  scheduleOpenCodeApiDetection(): void;
}

export interface AuthStateRuntimeDeps {
  crypto: typeof import("crypto");
  process: typeof import("process");
  getAuthPassword: () => string | null;
  setAuthPassword: (password: string | null) => void;
  getAuthSource: () => string | null;
  setAuthSource: (source: string | null) => void;
  getUserProvidedPassword: () => string | null;
  syncToHmrState: () => void;
}

export interface OpenCodeAuthStateRuntime {
  getOpenCodeAuthHeaders(): { Authorization: string };
  isOpenCodeConnectionSecure(): boolean;
  ensureLocalOpenCodeServerPassword(opts?: { rotateManaged?: boolean }): Promise<string>;
}

export interface ProjectDirectoryRuntimeDeps {
  fsPromises: typeof import("fs").promises;
  path: typeof import("path");
  normalizeDirectoryPath: (value: unknown) => string | unknown;
  readSettingsFromDiskMigrated: () => Promise<object>;
  getReadSettingsFromDiskMigrated: () => () => Promise<object>;
  sanitizeProjects: (input: unknown) => Array<Record<string, unknown>> | undefined;
}

export interface ProjectDirectoryRuntime {
  resolveDirectoryCandidate(value: string): string | null;
  validateDirectoryPath(candidate: string): Promise<{ ok: boolean; directory?: string; error?: string }>;
  resolveProjectDirectory(req: any): Promise<{ directory: string | null; error: string | null }>;
  resolveOptionalProjectDirectory(req: any): Promise<{ directory: string | null; error: string | null }>;
}

export interface OpenCodeResolutionDeps {
  path: typeof import("path");
  resolveOpencodeCliPath: () => string | null;
  applyOpencodeBinaryFromSettings: () => Promise<void>;
  ensureOpencodeCliEnv: () => void;
  resolveManagedOpenCodeLaunchSpec: (binary: string) => any | null;
  getResolvedState: () => { resolvedOpencodeBinary: string | null; resolvedOpencodeBinarySource: string | null; useWslForOpencode: boolean; resolvedWslDistro: string | null };
  setResolvedOpencodeBinarySource: (value: string) => void;
}

export interface OpenCodeResolutionRuntime {
  getOpenCodeResolutionSnapshot(settings: object): Promise<object>;
}
```

- [ ] **Step 2: Port env-config**

Read `packages/web/server/lib/opencode/env/env-config.js` fully (72 lines). Port verbatim.

Create `packages/web/server/src/domains/opencode-support/env-config.ts`:

```typescript
import type { OpenCodeEnvConfigResult } from "./types.js";

export function resolveOpenCodeEnvConfig(options: {
  env?: Record<string, string | undefined>;
  logger?: typeof console;
} = {}): OpenCodeEnvConfigResult {
  const env = options.env ?? {};
  const logger = options.logger ?? console;

  const configuredOpenCodePort = env.OPENCODE_PORT ? parseInt(env.OPENCODE_PORT, 10) || null : null;

  let configuredOpenCodeHost: { origin: string; port: number } | null = null;
  if (env.OPENCODE_HOST) {
    try {
      const url = new URL(env.OPENCODE_HOST.replace(/\/+$/, ""));
      configuredOpenCodeHost = {
        origin: url.origin,
        port: parseInt(url.port || (url.protocol === "https:" ? "443" : "80"), 10),
      };
    } catch {
      logger.warn(`Invalid OPENCODE_HOST: ${env.OPENCODE_HOST}`);
    }
  }

  const effectivePort = configuredOpenCodePort ?? configuredOpenCodeHost?.port ?? null;
  const configuredOpenCodeHostname = configuredOpenCodeHost?.origin ?? "http://127.0.0.1:4096";

  return { configuredOpenCodePort, configuredOpenCodeHost, effectivePort, configuredOpenCodeHostname };
}
```

- [ ] **Step 3: Port sub-runtimes as bridges**

For the remaining sub-runtimes (`env-runtime.ts`, `network.ts`, `auth-state.ts`), create **bridge wrappers** that dynamically import the old JS modules. These are internal to the old `runtime.js` and are only consumed by `lifecycle.js`. Porting them fully would require porting `lifecycle.js` (781 lines of process management), which is a Stage 6 concern.

**Strategy: Bridge wrappers only — no full port.** The sub-runtimes are internal implementation details of `createOpenCodeRuntime` and are not directly imported by `index.js`. The TS wrappers exist so that `createOpenCodeDomain` (Stage 4) can use them typed.

Create `packages/web/server/src/domains/opencode-support/env-runtime.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { EnvRuntimeDeps, OpenCodeEnvRuntime } from "./types.js";

export async function createOpenCodeEnvRuntime(deps: EnvRuntimeDeps): Promise<OpenCodeEnvRuntime> {
  const mod = await import("../../../lib/opencode/env/env-runtime.js");
  return mod.createOpenCodeEnvRuntime(deps) as OpenCodeEnvRuntime;
}
```

Create `packages/web/server/src/domains/opencode-support/network.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NetworkRuntimeDeps, OpenCodeNetworkRuntime } from "./types.js";

export async function createOpenCodeNetworkRuntime(deps: NetworkRuntimeDeps): Promise<OpenCodeNetworkRuntime> {
  const mod = await import("../../../lib/opencode/network.js");
  return mod.createOpenCodeNetworkRuntime(deps) as OpenCodeNetworkRuntime;
}
```

Create `packages/web/server/src/domains/opencode-support/auth-state.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuthStateRuntimeDeps, OpenCodeAuthStateRuntime } from "./types.js";

export async function createOpenCodeAuthStateRuntime(deps: AuthStateRuntimeDeps): Promise<OpenCodeAuthStateRuntime> {
  const mod = await import("../../../lib/opencode/auth.js");
  return mod.createOpenCodeAuthStateRuntime(deps) as OpenCodeAuthStateRuntime;
}
```

- [ ] **Step 4: Port hmr-state**

Read `packages/web/server/lib/opencode/network/hmr-state-runtime.js` fully (85 lines). Port verbatim — this is a simple module with a global weak-value map for HMR state persistence.

Create `packages/web/server/src/domains/opencode-support/hmr-state.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HmrState, HmrStateRuntime, HmrStateRuntimeDeps } from "./types.js";

export function createHmrStateRuntime(deps: HmrStateRuntimeDeps): HmrStateRuntime {
  const { globalThisLike, os, processLike, stateKey } = deps;

  const g = globalThisLike as any;
  if (!g.__OPENCHAMBER_HMR_STATE__) {
    g.__OPENCHAMBER_HMR_STATE__ = new Map();
  }
  const store = g.__OPENCHAMBER_HMR_STATE__ as Map<string, HmrState>;

  function getOrCreateHmrState(): HmrState {
    if (!store.has(stateKey)) {
      store.set(stateKey, {});
    }
    return store.get(stateKey)!;
  }

  function ensureUserProvidedOpenCodePassword(hmrState: HmrState): void {
    if (!hmrState.userProvidedOpenCodePassword && processLike.env.OPENCODE_UI_PASSWORD) {
      hmrState.userProvidedOpenCodePassword = processLike.env.OPENCODE_UI_PASSWORD;
    }
    if (!hmrState.userProvidedOpenCodePassword && processLike.env.OPENCHAMBER_UI_PASSWORD) {
      hmrState.userProvidedOpenCodePassword = processLike.env.OPENCHAMBER_UI_PASSWORD;
    }
  }

  function getUserProvidedOpenCodePassword(hmrState: HmrState): string | null {
    return hmrState.userProvidedOpenCodePassword ?? null;
  }

  function resolveOpenCodeAuthFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any {
    const { hmrState, userProvidedOpenCodePassword } = args;
    return {
      password: hmrState.openCodeAuthPassword ?? userProvidedOpenCodePassword ?? null,
      source: hmrState.openCodeAuthSource ?? null,
    };
  }

  function syncStateFromRuntime(hmrState: HmrState, runtimeState: any): void {
    hmrState.openCodePort = runtimeState.openCodePort;
    hmrState.openCodeAuthPassword = runtimeState.openCodeAuthPassword;
    hmrState.openCodeAuthSource = runtimeState.openCodeAuthSource;
    hmrState.openCodeWorkingDirectory = runtimeState.openCodeWorkingDirectory;
    hmrState.isOpenCodeReady = runtimeState.isOpenCodeReady;
    hmrState.isShuttingDown = runtimeState.isShuttingDown;
    hmrState.openCodeApiPrefix = runtimeState.openCodeApiPrefix;
    hmrState.openCodeNotReadySince = runtimeState.openCodeNotReadySince;
  }

  function restoreRuntimeFromState(args: { hmrState: HmrState; userProvidedOpenCodePassword: string | null }): any {
    const { hmrState, userProvidedOpenCodePassword } = args;
    return {
      openCodePort: hmrState.openCodePort ?? 0,
      openCodeAuthPassword: hmrState.openCodeAuthPassword ?? userProvidedOpenCodePassword ?? null,
      openCodeAuthSource: hmrState.openCodeAuthSource ?? null,
      openCodeWorkingDirectory: hmrState.openCodeWorkingDirectory ?? processLike.cwd(),
      isOpenCodeReady: hmrState.isOpenCodeReady ?? false,
      isShuttingDown: hmrState.isShuttingDown ?? false,
      openCodeApiPrefix: hmrState.openCodeApiPrefix ?? "",
      resolvedOpencodeBinary: hmrState.resolvedOpencodeBinary ?? null,
      resolvedOpencodeBinarySource: hmrState.resolvedOpencodeBinarySource ?? null,
      useWslForOpencode: hmrState.useWslForOpencode ?? false,
      resolvedWslBinary: hmrState.resolvedWslBinary ?? null,
      resolvedWslOpencodePath: hmrState.resolvedWslOpencodePath ?? null,
      resolvedWslDistro: hmrState.resolvedWslDistro ?? null,
      openCodeNotReadySince: hmrState.openCodeNotReadySince ?? 0,
    };
  }

  return {
    getOrCreateHmrState,
    ensureUserProvidedOpenCodePassword,
    getUserProvidedOpenCodePassword,
    resolveOpenCodeAuthFromState,
    syncStateFromRuntime,
    restoreRuntimeFromState,
  };
}
```

- [ ] **Step 5: Port resolution runtimes**

Read `opencode-resolution-runtime.js` and `project-directory-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/opencode-support/opencode-resolution.ts` and `project-directory.ts` — full ports of both files.

- [ ] **Step 6: Barrel**

Create `packages/web/server/src/domains/opencode-support/index.ts`:

```typescript
export { resolveOpenCodeEnvConfig } from "./env-config.js";
export { createOpenCodeEnvRuntime } from "./env-runtime.js";
export { createOpenCodeNetworkRuntime } from "./network.js";
export { createOpenCodeAuthStateRuntime } from "./auth-state.js";
export { createHmrStateRuntime } from "./hmr-state.js";
export { createOpenCodeResolutionRuntime } from "./opencode-resolution.js";
export { createProjectDirectoryRuntime } from "./project-directory.js";
export type * from "./types.js";
```

- [ ] **Step 7: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/web/server/src/domains/opencode-support/
git commit -m "feat(server): add opencode-support domain (env, auth, hmr, resolution)"
```

---

### Task 7: Bootstrap Domain — Types + CLI

**Files:**
- Create: `packages/web/server/src/domains/bootstrap/types.ts`
- Create: `packages/web/server/src/domains/bootstrap/cli-options.ts`
- Create: `packages/web/server/src/domains/bootstrap/cli-entry.ts`

- [ ] **Step 1: Types**

Create `packages/web/server/src/domains/bootstrap/types.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ServerStartupDeps {
  process: typeof import("process");
  crypto: typeof import("crypto");
  server: any;
  normalizeTunnelBootstrapTtlMs: (value: number | null) => number | null;
  readSettingsFromDiskMigrated: () => Promise<object>;
  tunnelAuthController: any;
  startTunnelWithNormalizedRequest: (request: any) => Promise<any>;
  gracefulShutdown: (opts?: any) => Promise<void>;
  getSignalsAttached: () => boolean;
  setSignalsAttached: (value: boolean) => void;
  syncToHmrState: () => void;
  TUNNEL_MODE_QUICK: string;
  TUNNEL_MODE_MANAGED_LOCAL: string;
  TUNNEL_MODE_MANAGED_REMOTE: string;
}

export interface ServerStartupRuntime {
  resolveBindHost(host?: string): string;
  startListeningAndMaybeTunnel(opts: {
    port: number;
    bindHost: string;
    startupTunnelRequest?: any;
    onTunnelReady?: (url: string, connectUrl: string) => void;
  }): Promise<{ activePort: number }>;
  attachProcessHandlers(opts: { attachSignals?: boolean }): void;
}

export interface StartupPipelineDeps {
  createTerminalRuntime: Function;
  createMessageStreamWsRuntime: Function;
  createServerStartupRuntime: Function;
}

export interface StartupPipelineRuntime {
  run(opts: any): Promise<{ terminalRuntime: any; messageStreamRuntime: any }>;
}

export interface BootstrapDeps {
  createUiAuth: Function;
  registerServerStatusRoutes: Function;
  registerCommonRequestMiddleware: Function;
  registerAuthAndAccessRoutes: Function;
  registerTtsRoutes: Function;
  registerNotificationRoutes: Function;
  registerOpenChamberRoutes: Function;
  express: typeof import("express");
}

export interface BootstrapRuntime {
  setupBaseRoutes(app: any, options: any): { uiAuthController: any };
}

export interface ShutdownDeps {
  process: typeof import("process");
  shutdownTimeoutMs: number;
  getExitOnShutdown: () => boolean;
  getIsShuttingDown: () => boolean;
  setIsShuttingDown: (value: boolean) => void;
  syncToHmrState: () => void;
  openCodeWatcherRuntime: any;
  sessionRuntime: any;
  notificationRuntime?: any;
  scheduledTasksRuntime?: any;
  getHealthCheckInterval: () => number | null;
  clearHealthCheckInterval: (value: number) => void;
  getTerminalRuntime: () => any;
  setTerminalRuntime: (value: any) => void;
  getMessageStreamRuntime: () => any;
  setMessageStreamRuntime: (value: any) => void;
  shouldSkipOpenCodeStop: () => boolean;
  openCodeRuntime: any;
  killProcessOnPort: (port: number) => void;
  waitForPortRelease: (port: number, ms: number) => Promise<boolean>;
  getServer: () => any;
  getUiAuthController: () => any;
  setUiAuthController: (value: any) => void;
  getActiveTunnelController: () => any;
  setActiveTunnelController: (value: any) => void;
  tunnelAuthController: any;
  serverSessionMachineBridge: any;
  sessionActorRegistry: any;
  sessionEffectExecutor: any;
}

export interface ShutdownRuntime {
  gracefulShutdown(opts?: { exitProcess?: boolean }): Promise<void>;
}

export interface LifecycleDeps {
  state: any;
  env: any;
  syncToHmrState: () => void;
  syncFromHmrState: () => void;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  buildOpenCodeUrl: (pathStr: string, prefixOverride?: string) => string;
  waitForReady: (url: string, timeoutMs?: number) => Promise<boolean>;
  normalizeApiPrefix: (prefix: string) => string;
  applyOpencodeBinaryFromSettings: () => Promise<void>;
  ensureOpencodeCliEnv: () => void;
  ensureLocalOpenCodeServerPassword: (opts?: { rotateManaged?: boolean }) => Promise<string>;
  buildWslExecArgs: (args: string[], distro?: string) => string[];
  resolveWslExecutablePath: () => string | null;
  resolveManagedOpenCodeLaunchSpec: (binary: string) => any | null;
  setOpenCodePort: (port: number) => void;
  setDetectedOpenCodeApiPrefix: (prefix: string) => void;
  setupProxy: (app: any) => void;
  ensureOpenCodeApiPrefix: () => void;
  clearResolvedOpenCodeBinary: () => void;
  buildAugmentedPath: () => string;
  buildManagedOpenCodePath: () => string;
}

export interface OpenCodeLifecycleRuntime {
  killProcessOnPort(port: number): void;
  startOpenCode(): Promise<any>;
  restartOpenCode(): Promise<void>;
  waitForOpenCodeReady(timeoutMs?: number, intervalMs?: number): Promise<void>;
  waitForAgentPresence(agentName: string, timeoutMs?: number, intervalMs?: number): Promise<void>;
  refreshOpenCodeAfterConfigChange(reason: string, options?: any): Promise<void>;
  bootstrapOpenCodeAtStartup(): Promise<void>;
  startHealthMonitoring(healthCheckIntervalMs: number): void;
  triggerHealthCheck(): Promise<void>;
  waitForPortRelease(port: number, timeoutMs?: number, hostname?: string): Promise<boolean>;
}

export interface ParseServeCliOptionsResult {
  port: number;
  host: string | undefined;
  uiPassword: string | null;
  tryCfTunnel: boolean;
  tunnelProvider: string | undefined;
  tunnelMode: string | undefined;
  tunnelConfigPath: string | null;
  tunnelToken: string | undefined;
  tunnelHostname: string | undefined;
}

export interface CliOptionsDeps {
  argv?: string[];
  env?: Record<string, string | undefined>;
  defaultPort: number;
  cloudflareProvider: string;
  managedLocalMode: string;
}

export interface CliEntryDeps {
  process: typeof import("process");
  currentFilename: string;
  parseServeCliOptions: (deps: CliOptionsDeps) => ParseServeCliOptionsResult;
  defaultPort: number;
  cloudflareProvider: string;
  managedLocalMode: string;
  setExitOnShutdown: (value: boolean) => void;
  startServer: Function;
}

export interface BootstrapDomain {
  parseServeCliOptions(deps: CliOptionsDeps): ParseServeCliOptionsResult;
  runCliEntryIfMain(deps: CliEntryDeps): void;
  createStartupPipelineRuntime(deps: StartupPipelineDeps): StartupPipelineRuntime;
  createServerStartupRuntime(deps: ServerStartupDeps): ServerStartupRuntime;
  createBootstrapRuntime(deps: BootstrapDeps): BootstrapRuntime;
  createGracefulShutdownRuntime(deps: ShutdownDeps): ShutdownRuntime;
  createOpenCodeLifecycleRuntime(deps: LifecycleDeps): OpenCodeLifecycleRuntime;
}
```

- [ ] **Step 2: Port CLI options**

Read `packages/web/server/lib/opencode/bootstrap/cli-options.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/cli-options.ts` — exact port of the CLI argument parser.

- [ ] **Step 3: Port CLI entry**

Read `packages/web/server/lib/opencode/bootstrap/cli-entry-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/cli-entry.ts`:

```typescript
import type { CliEntryDeps } from "./types.js";

export function runCliEntryIfMain(deps: CliEntryDeps): void {
  const { process: proc, currentFilename, parseServeCliOptions, defaultPort, cloudflareProvider, managedLocalMode, setExitOnShutdown, startServer } = deps;

  if (proc.argv[1] === currentFilename) {
    const options = parseServeCliOptions({
      argv: proc.argv.slice(2),
      env: proc.env as Record<string, string | undefined>,
      defaultPort,
      cloudflareProvider,
      managedLocalMode,
    });
    setExitOnShutdown(true);
    startServer(options);
  }
}
```

- [ ] **Step 4: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/bootstrap/
git commit -m "feat(server): add bootstrap domain types + CLI modules"
```

---

### Task 8: Bootstrap Domain — Lifecycle + Shutdown + Startup

**Files:**
- Create: `packages/web/server/src/domains/bootstrap/lifecycle.ts`
- Create: `packages/web/server/src/domains/bootstrap/shutdown-runtime.ts`
- Create: `packages/web/server/src/domains/bootstrap/server-startup.ts`
- Create: `packages/web/server/src/domains/bootstrap/startup-pipeline.ts`
- Create: `packages/web/server/src/domains/bootstrap/bootstrap-runtime.ts`
- Create: `packages/web/server/src/domains/bootstrap/tunnel-wiring.ts`

- [ ] **Step 1: Bridge lifecycle**

Create `packages/web/server/src/domains/bootstrap/lifecycle.ts` — bridge wrapper around old JS:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { LifecycleDeps, OpenCodeLifecycleRuntime } from "./types.js";

export async function createOpenCodeLifecycleRuntime(deps: LifecycleDeps): Promise<OpenCodeLifecycleRuntime> {
  // The old lifecycle.js is 781 lines of complex process management
  // Bridge it for now — full port in Stage 6
  const mod = await import("../../../lib/opencode/bootstrap/lifecycle.js");
  return mod.createOpenCodeLifecycleRuntime(deps) as OpenCodeLifecycleRuntime;
}
```

- [ ] **Step 2: Port server-startup**

Read `packages/web/server/lib/opencode/bootstrap/server-startup-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/server-startup.ts` — full port (138 lines). This is the module that calls `server.listen()`, sends IPC to parent, starts tunnels, and attaches signal handlers.

- [ ] **Step 3: Port startup-pipeline**

Read `packages/web/server/lib/opencode/bootstrap/startup-pipeline-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/startup-pipeline.ts` — full port (126 lines). This orchestrates the full startup sequence: create terminal, create message stream WS, setup proxy, bootstrap OpenCode, register static routes, start listening, attach signal handlers.

- [ ] **Step 4: Port bootstrap-runtime**

Read `packages/web/server/lib/opencode/bootstrap/bootstrap-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/bootstrap-runtime.ts` — full port (130 lines). Registers all base routes via injected route registration functions.

- [ ] **Step 5: Port shutdown-runtime**

Read `packages/web/server/lib/opencode/bootstrap/shutdown-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/shutdown-runtime.ts` — full port (147 lines). The graceful shutdown sequence: stop watcher, dispose sessions, stop bridge, dispose registry/executor, dispose notifications/tasks, clear health check, shutdown terminal, close message stream, kill OpenCode, close server, dispose auth, stop tunnel, exit process.

**IMPORTANT:** The shutdown order must match the old JS exactly. Every step in the same order. Use the same timeout values (10s for server close, 5s for port release).

- [ ] **Step 6: Port tunnel-wiring**

Read `packages/web/server/lib/opencode/network/tunnel-wiring-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/bootstrap/tunnel-wiring.ts` — full port (94 lines). Creates tunnel service, tunnel routes runtime, registers tunnel routes, returns tunnel context.

- [ ] **Step 7: Create barrel**

Create `packages/web/server/src/domains/bootstrap/index.ts`:

```typescript
export { parseServeCliOptions } from "./cli-options.js";
export { runCliEntryIfMain } from "./cli-entry.js";
export { createServerStartupRuntime } from "./server-startup.js";
export { createStartupPipelineRuntime } from "./startup-pipeline.js";
export { createBootstrapRuntime } from "./bootstrap-runtime.js";
export { createGracefulShutdownRuntime } from "./shutdown-runtime.js";
export { createOpenCodeLifecycleRuntime } from "./lifecycle.js";
export { createTunnelWiringRuntime } from "./tunnel-wiring.js";
export type * from "./types.js";
```

- [ ] **Step 8: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/web/server/src/domains/bootstrap/
git commit -m "feat(server): add bootstrap domain (lifecycle, shutdown, startup, tunnel-wiring)"
```

---

### Task 9: Route Infrastructure Domain

**Files:**
- Create: `packages/web/server/src/domains/routes/types.ts`
- Create: `packages/web/server/src/domains/routes/core-routes.ts`
- Create: `packages/web/server/src/domains/routes/routes.ts`
- Create: `packages/web/server/src/domains/routes/feature-routes-runtime.ts`
- Create: `packages/web/server/src/domains/routes/openchamber-routes.ts`
- Create: `packages/web/server/src/domains/routes/static-routes.ts`
- Create: `packages/web/server/src/domains/routes/pwa-manifest.ts`
- Create: `packages/web/server/src/domains/routes/index.ts`

- [ ] **Step 1: Types**

Create `packages/web/server/src/domains/routes/types.ts` with interfaces for all route registration dependencies.

- [ ] **Step 2: Port core-routes**

Read `packages/web/server/lib/opencode/routes/core-routes.js` fully. Port verbatim.

Create `packages/web/server/src/domains/routes/core-routes.ts` — full port (284 lines). Four register functions:
- `registerServerStatusRoutes(app, deps)` — GET /health, POST /api/system/shutdown, GET /api/system/info
- `registerAuthAndAccessRoutes(app, deps)` — all auth routes (session, passkey, reset, connect) + API auth guard
- `registerSettingsUtilityRoutes(app, deps)` — GET /api/config/themes, POST /api/config/reload
- `registerCommonRequestMiddleware(app, deps)` — JSON body parser + request logger

- [ ] **Step 3: Port routes.js (OpenCode routes)**

Read `packages/web/server/lib/opencode/routes/routes.js` fully. Port verbatim.

Create `packages/web/server/src/domains/routes/routes.ts` — full port (298 lines). Register function:
- `registerOpenCodeRoutes(app, deps)` — settings, MCP auth pending, provider source/auth, directory

- [ ] **Step 4: Port feature-routes-runtime**

Read `packages/web/server/lib/opencode/routes/feature-routes-runtime.js` fully. Port verbatim.

Create `packages/web/server/src/domains/routes/feature-routes-runtime.ts` — full port (240 lines). Factory:
- `createFeatureRoutesRuntime(deps)` → `registerRoutes(app, routeDependencies)`
- Registers all 12 sub-route domains (settings, opencode, project-icon, scheduled-tasks, config-entities, skills, quota, github, git, magic-prompts, session-folders, fs)

- [ ] **Step 5: Port openchamber-routes**

Read `packages/web/server/lib/opencode/routes/openchamber-routes.js` fully. Port verbatim.

Create `packages/web/server/src/domains/routes/openchamber-routes.ts` — full port (313 lines). Routes:
- GET /api/openchamber/update-check, POST /api/openchamber/update-install
- GET /api/openchamber/models-metadata, GET /api/zen/models

- [ ] **Step 6: Port static-routes + pwa-manifest**

Read both files fully. Port verbatim.

Create `packages/web/server/src/domains/routes/static-routes.ts` and `pwa-manifest.ts`.

- [ ] **Step 7: Barrel**

Create `packages/web/server/src/domains/routes/index.ts`:

```typescript
export { registerServerStatusRoutes, registerAuthAndAccessRoutes, registerSettingsUtilityRoutes, registerCommonRequestMiddleware } from "./core-routes.js";
export { registerOpenCodeRoutes } from "./routes.js";
export { createFeatureRoutesRuntime } from "./feature-routes-runtime.js";
export { registerOpenChamberRoutes } from "./openchamber-routes.js";
export { createStaticRoutesRuntime } from "./static-routes.js";
export { registerPwaManifestRoute } from "./pwa-manifest.js";
export type * from "./types.js";
```

- [ ] **Step 8: Verify**

Run: `cd packages/web && npx tsc --noEmit -p tsconfig.server.json`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/web/server/src/domains/routes/
git commit -m "feat(server): add route infrastructure domain"
```

---

### Task 10: Cut Over index.js to TypeScript Domains

**Files:**
- Modify: `packages/web/server/index.js` — replace all remaining `./lib/` imports with `./dist/domains/` imports
- Modify: `packages/web/server/src/index.ts` — update imports

- [ ] **Step 1: Replace imports in index.js**

Read `packages/web/server/index.js` and replace these imports:

| Old import | New import |
|------------|------------|
| `./lib/core/event-bus.js` → `createEventBus` | `./dist/domains/core/index.js` → `createEventBus` |
| `./lib/core/events.js` → `EVENTS` | `./dist/domains/core/index.js` → `EVENTS` |
| `./lib/opencode/settings/settings-normalization-runtime.js` → `createSettingsNormalizationRuntime` | `./dist/domains/settings/index.js` → `createSettingsNormalizationRuntime` |
| `./lib/opencode/settings/settings-helpers.js` → `createSettingsHelpers` | same settings barrel |
| `./lib/opencode/settings/settings-runtime.js` → `createSettingsRuntime` | same settings barrel |
| `./lib/opencode/services/theme-runtime.js` → `createThemeRuntime` | same settings barrel |
| `./lib/opencode/server-utils-runtime.js` → `createServerUtilsRuntime` | `./dist/domains/server-utils/index.js` → `createServerUtilsRuntime` |
| `./lib/opencode/network/proxy.js` → `registerOpenCodeProxy` | same server-utils barrel |
| `./lib/opencode/routes/core-routes.js` → 4 exports | `./dist/domains/routes/index.js` |
| `./lib/opencode/routes/routes.js` → `registerOpenCodeRoutes` | same routes barrel |
| `./lib/opencode/routes/feature-routes-runtime.js` → `createFeatureRoutesRuntime` | same routes barrel |
| `./lib/opencode/routes/openchamber-routes.js` → `registerOpenChamberRoutes` | same routes barrel |
| `./lib/opencode/routes/static-routes-runtime.js` → `createStaticRoutesRuntime` | same routes barrel |
| `./lib/opencode/bootstrap/cli-options.js` → `parseServeCliOptions` | `./dist/domains/bootstrap/index.js` |
| `./lib/opencode/bootstrap/cli-entry-runtime.js` → `runCliEntryIfMain` | same bootstrap barrel |
| `./lib/opencode/bootstrap/server-startup-runtime.js` → `createServerStartupRuntime` | same bootstrap barrel |
| `./lib/opencode/bootstrap/startup-pipeline-runtime.js` → `createStartupPipelineRuntime` | same bootstrap barrel |
| `./lib/opencode/bootstrap/bootstrap-runtime.js` → `createBootstrapRuntime` | same bootstrap barrel |
| `./lib/opencode/bootstrap/shutdown-runtime.js` → `createGracefulShutdownRuntime` | same bootstrap barrel |
| `./lib/opencode/network/tunnel-wiring-runtime.js` → `createTunnelWiringRuntime` | same bootstrap barrel |
| `./lib/opencode/env/env-config.js` → `resolveOpenCodeEnvConfig` | `./dist/domains/opencode-support/index.js` |
| `./lib/opencode/network/hmr-state-runtime.js` → `createHmrStateRuntime` | same opencode-support barrel |
| `./lib/opencode/resolution/opencode-resolution-runtime.js` → `createOpenCodeResolutionRuntime` | same opencode-support barrel |
| `./lib/opencode/resolution/project-directory-runtime.js` → `createProjectDirectoryRuntime` | same opencode-support barrel |

- [ ] **Step 2: Delete deleted-domain JS files**

Delete these directories:
```
packages/web/server/lib/opencode/settings/          (deleted)
packages/web/server/lib/opencode/bootstrap/         (deleted)
packages/web/server/lib/opencode/routes/            (kept for now — routes references old JS)
packages/web/server/lib/opencode/network/           (kept for now — tunnel-wiring-runtime.js still referenced by tunnel provider)
packages/web/server/lib/opencode/env/               (kept for now — lifecycle.js bridge)
packages/web/server/lib/opencode/services/theme-runtime.js  (deleted)
packages/web/server/lib/opencode/server-utils-runtime.js    (deleted)
packages/web/server/lib/core/                                  (deleted)
packages/web/server/lib/opencode/network/proxy.js             (deleted)
```

```
git rm -rf packages/web/server/lib/opencode/settings/
git rm packages/web/server/lib/opencode/services/theme-runtime.js
git rm packages/web/server/lib/opencode/server-utils-runtime.js
git rm -rf packages/web/server/lib/core/
git rm packages/web/server/lib/opencode/network/proxy.js
git rm -rf packages/web/server/lib/opencode/bootstrap/
```

- [ ] **Step 3: Add domains to ServerRuntime.domains**

In `packages/web/server/src/shared/types.ts`, update `ServerRuntime.domains`:

```typescript
domains: {
  terminal: any;
  eventStream: any;
  opencode: any;
  sessions: any;
  core: { eventBus: any };
  settings: any;
  serverUtils: any;
  bootstrap: any;
  routes: any;
  opencodeSupport: any;
}
```

- [ ] **Step 4: Build and verify**

Run: `bun run build:web-server`
Expected: PASS

Run: `bun run type-check`
Expected: PASS

Run: `bun run lint`
Expected: 0 errors, pre-existing warnings only

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/index.js packages/web/server/src/index.ts packages/web/server/src/shared/types.ts
git commit -m "feat(server): cut over bootstrap, settings, routes, server-utils to TypeScript domains"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Full type-check**

Run: `bun run type-check`
Expected: ALL PASS

- [ ] **Step 2: Full lint**

Run: `bun run lint`
Expected: 0 errors

- [ ] **Step 3: Build server**

Run: `bun run build:web-server`
Expected: PASS, `dist/` populated

- [ ] **Step 4: Run all domain tests**

Run: `cd packages/web && bun test server/src/domains/`
Expected: All pass

- [ ] **Step 5: Commit final verification**

```bash
git add -A
git commit -m "chore(server): final Stage 5a verification"
```

---

## Acceptance Criteria

- All imports in `index.js` that previously referenced `./lib/opencode/bootstrap/`, `./lib/opencode/settings/`, `./lib/opencode/server-utils-runtime.js`, `./lib/opencode/network/proxy.js`, `./lib/core/`, `./lib/opencode/env/env-config.js`, `./lib/opencode/network/hmr-state-runtime.js`, `./lib/opencode/resolution/`, `./lib/opencode/services/theme-runtime.js`, and `./lib/opencode/routes/` now reference `./dist/domains/` equivalents
- `bun run type-check` passes
- `bun run lint` passes (0 errors)
- `bun run build:web-server` passes
- All existing domain tests pass
- Bootstrap JS files deleted from `lib/opencode/bootstrap/`
- Settings JS files deleted from `lib/opencode/settings/`
- Event bus JS files deleted from `lib/core/`
- Theme runtime JS deleted from `lib/opencode/services/theme-runtime.js`
- Server utils JS deleted from `lib/opencode/server-utils-runtime.js`
- Proxy JS deleted from `lib/opencode/network/proxy.js`
