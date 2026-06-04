# Server TypeScript Migration — Remaining Stages (9.2-10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the last ~15 remaining JS files and their test files from `packages/web/server/lib/` to `packages/web/server/src/domains/`, kill all `require()` bridges in `feature-routes-runtime.ts`, delete dead JS, and rewrite `index.js` as pure TypeScript.

**Architecture:** Three new TS domains (opencode-services, skills-catalog, package-manager), one deletion sweep, one final entrypoint rewrite. Domains follow the simple pattern used by `git`/`github` (exported functions, no runtime factory) — this is an intentional deviation from the spec's factory-pattern mandate, consistent with how prior Stage 8 ports (`lib/fs/`, `lib/github/`, `lib/git/`) were actually implemented.

**Tech Stack:** TypeScript (ESM, verbatimModuleSyntax, `.js` extensions), Express, Bun runtime, vitest.

**Spec references:** `.superpawers/specs/2026-05-31-server-typescript-modernization-design.md`, `.superpawers/specs/2026-06-02-server-typescript-migration-handoff.md`

---

## Current State

From the handoff spec: Stages 1-8 complete. Stage 9.1 (quota) complete. Stage 9.3 (git) complete. Stage 9.4 (github) complete.

`packages/web/server/index.js` (860 lines) wires everything with closures — still `import`s from `./dist/domains/` for typed domains plus `require()` for unported ones.

`feature-routes-runtime.ts` has 7 `require()` bridges to old JS:
- **Line 67:** `require('../../../lib/opencode/index.js')` → `getProviderSources`, `removeProviderConfig`
- **Line 114:** `require('../../../lib/opencode/index.js')` → `getAgentSources`, `getAgentConfig`, `createAgent`, `updateAgent`, `deleteAgent`
- **Line 116:** `require('../../../lib/opencode/index.js')` → `getCommandSources`, `createCommand`, `updateCommand`, `deleteCommand`
- **Line 118:** `require('../../../lib/opencode/index.js')` → `listMcpConfigs`, `getMcpConfig`, `createMcpConfig`, `updateMcpConfig`, `deleteMcpConfig`
- **Line 142:** `require('../../../lib/opencode/index.js')` → `getSkillSources`, `discoverSkills`, `createSkill`, `updateSkill`, `deleteSkill`
- **Line 144:** `require('../../../lib/opencode/index.js')` → `readSkillSupportingFile`, `writeSkillSupportingFile`, `deleteSkillSupportingFile`
- **Line 146:** `require('../../../lib/opencode/index.js')` → `SKILL_SCOPE`, `SKILL_DIR`
- **Line 149-153:** Three `require('../../../lib/skills-catalog/index.js')` calls → 10 symbols (`getCuratedSkillsSources`, `getCacheKey`, `getCachedScan`, `setCachedScan`, `parseSkillRepoSource`, `scanSkillsRepository`, `installSkillsFromRepository`, `scanClawdHubPage`, `installSkillsFromClawdHub`, `isClawdHubSource`)

Additionally, `src/domains/routes/openchamber-routes.ts` has:
- Lines 26, 67: `require('../../../lib/package-manager.js')` → `checkForUpdates`, `getUpdateCommand`, `detectPackageManagerDetails`

---

## Task 1: Delete Dead JS Files

**Goal:** Remove JS files whose TS ports already exist. No new code — pure deletion.

**Files to delete:**
- `packages/web/server/lib/opencode/routes/openchamber-routes.js` (ported to `src/domains/routes/openchamber-routes.ts`)
- `packages/web/server/lib/opencode/routes/pwa-manifest-routes.js` (ported to `src/domains/routes/pwa-manifest.ts`) — **last consumer of `bounded-cache.js` shim**
- `packages/web/server/lib/opencode/routes/feature-routes-runtime.js` (ported to `src/domains/routes/feature-routes-runtime.ts`)
- `packages/web/server/lib/opencode/routes/static-routes-runtime.js` (ported to `src/domains/routes/static-routes.ts`)
- `packages/web/server/lib/opencode/network/hmr-state-runtime.js` (ported to `src/domains/opencode-support/hmr-state.ts`)
- `packages/web/server/lib/core/bounded-cache.js` (re-export shim, only consumer was `pwa-manifest-routes.js`)

**Verification:**
- [ ] Delete all 6 files
- [ ] Search for any remaining imports of these files: `rg "opencode/routes/openchamber-routes\.js|opencode/routes/pwa-manifest-routes\.js|opencode/routes/feature-routes-runtime\.js|opencode/routes/static-routes-runtime\.js|opencode/network/hmr-state-runtime\.js|core/bounded-cache\.js" packages/web/server/ --include "*.ts" --include "*.js"`
- [ ] Verify type-check passes: `npx tsc -p packages/web/tsconfig.server.json`
- [ ] Commit

---

## Task 2: Port OpenCode Services + Skills-Catalog Domains

**Goal:** Port both `lib/opencode/` services (7 files) and `lib/skills-catalog/` (10 files) to TS domains. Then replace ALL remaining `require()` bridges in `feature-routes-runtime.ts` with typed ES imports — eliminating every last `require('../../../lib/...')` in one coordinated edit.

**Why combined:** Both domains' require() bridges live in the same file (`feature-routes-runtime.ts`). Porting them together avoids merge conflicts on the bridge-killing edit.

### Part A: OpenCode Services

Create under `packages/web/server/src/domains/opencode/services/`:

| New TS file | From JS |
|---|---|
| `types.ts` | (new — type-only interfaces for agents, commands, MCP, skills) |
| `shared.ts` | `lib/opencode/shared.js` (542 lines) — all constants + 28 helpers |
| `providers.ts` | `lib/opencode/services/providers.js` (96 lines) |
| `mcp.ts` | `lib/opencode/services/mcp.js` (278 lines) |
| `commands.ts` | `lib/opencode/services/commands.js` (339 lines) |
| `agents.ts` | `lib/opencode/services/agents.js` (634 lines) |
| `skills.ts` | `lib/opencode/services/skills.js` (480 lines) |
| `index.ts` | `lib/opencode/index.js` (66 lines barrel) |

Pattern — simple domain (exported functions, like `git`):

**`types.ts`** — Type-only interfaces (NO runtime values/constants):
```ts
export interface AgentConfig { /* ... */ }
export interface CommandConfig { /* ... */ }
export interface McpConfig { /* ... */ }
export interface SkillConfig { /* ... */ }
export interface AgentSources { /* ... */ }
export interface AgentScope { scope: string; path: string; }
```

**`shared.ts`** — All 28 exports + runtime constants ported verbatim (constants like `AGENT_DIR`, `SKILL_DIR`, `AGENT_SCOPE`, etc. live here — NOT in types.ts):
```ts
export function ensureDirs(): void { /* ... */ }
export function parseMdFile(filePath: string): { frontmatter: Record<string, unknown>; body: string } | null { /* ... */ }
// ... all 28 exports from the JS
```

**`providers.ts`, `mcp.ts`, `commands.ts`, `agents.ts`, `skills.ts`** — Ported verbatim from JS, adding types. Import from `./shared.js`:
```ts
import { CONFIG_FILE, AGENT_DIR, AGENT_SCOPE, ensureDirs, parseMdFile, writeMdFile, readConfigLayers, readConfigFile, writeConfig, getJsonEntrySource, getJsonWriteTarget, isPromptFileReference, resolvePromptFilePath, writePromptFile } from "./shared.js";

export function ensureProjectAgentDir(workingDirectory: string): string { /* ... */ }
// ... all exports
```

**`index.ts`** — Barrel (no dead auth/ui-auth exports from old JS):
```ts
export { AGENT_DIR, COMMAND_DIR, SKILL_DIR, CONFIG_FILE, AGENT_SCOPE, COMMAND_SCOPE, SKILL_SCOPE, readConfig, writeConfig, readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile } from "./shared.js";
export { getAgentScope, getAgentPermissionSource, getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent } from "./agents.js";
export { getCommandScope, getCommandSources, createCommand, updateCommand, deleteCommand } from "./commands.js";
export { getSkillSources, getSkillScope, discoverSkills, createSkill, updateSkill, deleteSkill } from "./skills.js";
export { getProviderSources, removeProviderConfig } from "./providers.js";
export { listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig } from "./mcp.js";
export type * from "./types.js";
```

### Part B: Skills-Catalog

Create under `packages/web/server/src/domains/skills-catalog/`:

| New TS file | Source JS | Notes |
|---|---|---|
| `types.ts` | (new) | Type-only: `ParseResult`, `ScanResult`, `SkillItem`, `InstallResult`, `ClawdHubSkillItem` |
| `cache.ts` | `lib/skills-catalog/cache.js` (29 lines) | `getCacheKey`, `getCachedScan`, `setCachedScan`, `clearCache` |
| `curated-sources.ts` | `lib/skills-catalog/curated-sources.js` (21 lines) | `CURATED_SKILLS_SOURCES`, `getCuratedSkillsSources` |
| `source.ts` | `lib/skills-catalog/source.js` (85 lines) | `parseSkillRepoSource` |
| `git.ts` | `lib/skills-catalog/git.js` (77 lines) | `runGit`, `assertGitAvailable`, `looksLikeAuthError` |
| `scan.ts` | `lib/skills-catalog/scan.js` (221 lines) | `scanSkillsRepository` |
| `install.ts` | `lib/skills-catalog/install.js` (294 lines) | `installSkillsFromRepository` |
| `clawdhub/api.ts` | `lib/skills-catalog/clawdhub/api.js` (158 lines) | `fetchClawdHubSkills`, `downloadClawdHubSkill`, etc. |
| `clawdhub/scan.ts` | `lib/skills-catalog/clawdhub/scan.js` (113 lines) | `scanClawdHub`, `scanClawdHubPage` |
| `clawdhub/install.ts` | `lib/skills-catalog/clawdhub/install.js` (238 lines) | `installSkillsFromClawdHub` |
| `clawdhub/index.ts` | `lib/skills-catalog/clawdhub/index.js` (30 lines) | Barrel + `isClawdHubSource`, constants |
| `index.ts` | `lib/skills-catalog/index.js` (42 lines) | Barrel re-export |

Pattern — simple domain (exported functions). `types.ts` is type-only. No de-duplication of internal helpers needed during port (JS duplication works fine). Barrel:
```ts
export { getCuratedSkillsSources, CURATED_SKILLS_SOURCES } from "./curated-sources.js";
export { getCacheKey, getCachedScan, setCachedScan, clearCache } from "./cache.js";
export { parseSkillRepoSource } from "./source.js";
export { scanSkillsRepository } from "./scan.js";
export { installSkillsFromRepository } from "./install.js";
export { scanClawdHub, scanClawdHubPage, installSkillsFromClawdHub, fetchClawdHubSkills, fetchClawdHubSkillVersion, fetchClawdHubSkillInfo, downloadClawdHubSkill, isClawdHubSource, CLAWDHUB_SOURCE_ID, CLAWDHUB_SOURCE_STRING } from "./clawdhub/index.js";
export type * from "./types.js";
```

### Part C: Kill All require() Bridges in feature-routes-runtime.ts

Replace ALL remaining `require('../../../lib/...')` calls (lines 67-155) with typed imports:

```ts
import {
  getProviderSources, removeProviderConfig,
  getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent,
  getCommandSources, createCommand, updateCommand, deleteCommand,
  listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig,
  getSkillSources, discoverSkills, createSkill, updateSkill, deleteSkill,
  readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile,
  SKILL_SCOPE, SKILL_DIR,
} from "../opencode/services/index.js";

import {
  getCuratedSkillsSources, getCacheKey, getCachedScan, setCachedScan,
  parseSkillRepoSource, scanSkillsRepository, installSkillsFromRepository,
  scanClawdHubPage, installSkillsFromClawdHub, isClawdHubSource,
} from "../skills-catalog/index.js";
```

Remove ALL eslint-disable comments for the old require() lines (expected ~8 `// eslint-disable-next-line` comments to remove).

### Delete Old JS

**OpenCode:**
- `lib/opencode/services/agents.js`, `commands.js`, `mcp.js`, `providers.js`, `skills.js`
- `lib/opencode/shared.js`
- `lib/opencode/index.js`
- `lib/opencode/services/watcher.test.js`, `lib/opencode/runtime.test.js`, `lib/opencode/server-utils-runtime.test.js`, `lib/opencode/session/session-runtime.test.js`, `lib/opencode/routes/core-routes.test.js`
- If `lib/opencode/` is now empty, delete the directory

**Skills-Catalog:**
- `lib/skills-catalog/index.js`, `cache.js`, `curated-sources.js`, `source.js`, `git.js`, `scan.js`, `install.js`
- `lib/skills-catalog/clawdhub/api.js`, `index.js`, `install.js`, `scan.js`
- Keep `lib/skills-catalog/DOCUMENTATION.md` per spec (only DOCUMENTATION.md files remain in lib/)

### Verification

- [ ] Port all opencode-services files (8 TS files)
- [ ] Port all skills-catalog files (12 TS files)
- [ ] Update `feature-routes-runtime.ts` — replace ALL require() bridges with the two typed imports above
- [ ] Run `npx tsc -p packages/web/tsconfig.server.json` — must pass
- [ ] Run `bun run type-check` from repo root — must pass
- [ ] Delete all old JS files listed above
- [ ] Check for any remaining `lib/` imports in src: `rg "lib/" packages/web/server/src/domains/ --include "*.ts"` — should return nothing
- [ ] Per-domain lint: `cd packages/web && npx eslint server/src/domains/opencode/ server/src/domains/skills-catalog/` — zero new errors
- [ ] Commit

---

## Task 3: Port Package-Manager

**Goal:** Port `lib/package-manager.js` (758 lines) to `src/domains/package-manager/`. Replace the `require()` in `openchamber-routes.ts`.

### Files to Create

Under `packages/web/server/src/domains/package-manager/`:

| File | Content |
|---|---|
| `types.ts` | Types: `PackageManagerInfo`, `UpdateResult`, `ChangelogResult`, `PackageManagerDeps` |
| `package-manager.ts` | All 8 exports ported verbatim: `detectPackageManagerDetails`, `detectPackageManager`, `getUpdateCommand`, `getCurrentVersion`, `getLatestVersion`, `fetchChangelogNotes`, `checkForUpdates`, `executeUpdate` |
| `index.ts` | Barrel re-export |

### Pattern

Simple domain pattern (exported functions, no factory):

**`package-manager.ts`** — Ported verbatim with types. Imports:
```ts
import type { PackageManagerInfo, UpdateResult, PackageManagerDeps } from "./types.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
```

### Update openchamber-routes.ts

Read `packages/web/server/src/domains/routes/openchamber-routes.ts` and replace the `require('../../../lib/package-manager.js')` calls (around lines 26, 67) with:
```ts
import { checkForUpdates, getUpdateCommand, detectPackageManagerDetails } from "../package-manager/index.js";
```

Remove associated eslint-disable comments.

### Update CLI

Check `packages/web/bin/cli.js` for imports of `package-manager.js` and update to `dist/domains/package-manager/index.js` if building, or to `../server/src/domains/package-manager/index.ts` if running from source.

### Delete Old JS

- Delete `packages/web/server/lib/package-manager.js`

### Verification

- [ ] Port package-manager.ts
- [ ] Update openchamber-routes.ts require() → typed import
- [ ] Update cli.js import if needed
- [ ] Run `npx tsc -p packages/web/tsconfig.server.json` — must pass
- [ ] Run `bun run type-check` — must pass
- [ ] Commit

---

## Task 4: Stage 10 — Rewrite index.js as Pure TypeScript

**Goal:** Replace `packages/web/server/index.js` with `packages/web/server/src/index.ts`. No more `lib/` imports.

### What Changes

The current `index.js` (860 lines) already imports mostly from `./dist/domains/`. By this point, all remaining `lib/` imports should be gone (all domains ported). The rewrite to `src/index.ts` involves:

1. **Move the content:** Copy `index.js` → `src/index.ts`, then:
   - Replace all `import ... from './dist/domains/...'` with `import ... from './domains/...'` 
   - Remove the `./dist/` prefix since we're now in the src tree
   - Add types to module-level state variables
   - Add types to function parameters and returns (or use `any` pragmatically where it's an Express handler callback)
   - Add `@ts-expect-error` or `any` casts for any Express middleware patterns that don't type well

2. **Verify the electron import:** `packages/electron/main.mjs` imports `@openchamber/web/server/index.js`. Verify this resolves to the compiled `dist/index.js`. If `packages/web/package.json` exports need updating, update them.

3. **Verify CLI import:** `packages/web/bin/cli.js` may import from `server/index.js`. Update to reference compiled output or `server/src/index.ts` as appropriate.

4. **Delete `lib/opencode/` directory entirely** if empty.

5. **Delete remaining old test files** that reference deleted lib/ paths:
   - `lib/git/routes.test.js`
   - `lib/scheduled-tasks/runtime.test.js`
   - Any remaining `.test.js` under `lib/`

### Key imports to convert

```ts
// BEFORE (in index.js)
import { createFeatureRoutesRuntime } from './dist/domains/routes/index.js';

// AFTER (in src/index.ts)
import { createFeatureRoutesRuntime } from './domains/routes/index.js';
```

### Special considerations

- **`__dirname`**: In `index.js` it comes from the built path (`server/`). In `src/index.ts` it's `server/src/`. Paths that use `__dirname` need to account for one more `../` layer. OR use `import.meta.dirname` (Bun/E22) and adjust for the src→dist offset. The simplest approach: use `path.join(import.meta.dirname, '..')` to get the same base as the old `__dirname`.
- **`OPENCHAMBER_DATA_DIR`**: This is defined relative to `__dirname` in index.js. Ensure the path resolves the same in `src/index.ts`.
- **Dynamic imports**: Any `await import(...)` calls in index.js should remain, just with updated paths.

### Verification

- [ ] Create `src/index.ts` with all content ported from `index.js`
- [ ] Verify all `./dist/domains/` imports changed to `./domains/`
- [ ] Verify all `./lib/` imports are gone (all should be `./domains/` now)
- [ ] Run `npx tsc -p packages/web/tsconfig.server.json` — must pass (index.ts is now under `server/src/`)
- [ ] Run `bun run build:web-server` — must produce `dist/index.js` + `dist/index.d.ts`
- [ ] Run `bun run type-check` — must pass
- [ ] Verify `packages/electron/main.mjs` still imports correctly
- [ ] Verify `packages/web/bin/cli.js` still imports correctly
- [ ] Delete the old `packages/web/server/index.js`
- [ ] Delete remaining `lib/` directories that are now empty
- [ ] Run `find packages/web/server/lib -name "*.js" | sort` — should be empty or near-empty
- [ ] Commit

---

## Task 5: Final Verification

**Goal:** Full door-to-door verification of the entire migration.

- [ ] Run `bun run type-check` — must pass with zero errors
- [ ] Run `bun run build:web-server` — must produce clean dist output
- [ ] Run `cd packages/web && bun test server/src/domains/` — all existing tests pass
- [ ] Run `bun run lint` — check no NEW errors from migrated code (pre-existing errors from before migration are OK)
- [ ] Per-domain lint checks: `cd packages/web && npx eslint server/src/domains/opencode/ server/src/domains/skills-catalog/ server/src/domains/package-manager/` — should introduce zero new errors
- [ ] Run `npx tsc -p packages/web/tsconfig.server.json` — must pass
- [ ] Verify `find packages/web/server/lib -name "*.js" | wc -l` approaches zero
- [ ] Verify the git diff is clean (no unintended changes)
- [ ] Run `scripts/verify.sh` if available

---

## Dependencies Between Tasks

```
Task 1 (delete dead JS) ──► independent, can run first
Task 2 (opencode services + skills-catalog) ──► independent of Task 1, ports both domains + kills all require() bridges
Task 3 (package-manager) ──► independent of Tasks 1, 2 (different files)
Task 4 (Stage 10) ──► depends on Tasks 2, 3 being complete (no more require() bridges)
Task 5 (verification) ──► depends on all others

Tasks 1 and 3 can run in parallel. Task 2 is the largest single unit — ports ~20 files in one shot.
Task 4 must run after 2+3 because index.js should have zero lib/ imports by then.
```

## Key Conventions (from AGENTS.md)

- `verbatimModuleSyntax: true` — `import type` for types, `.js` extensions on relative imports
- `node:` prefix for Node built-ins
- No hex colors — theme tokens only (not applicable to server code)
- Test with `bun test` or `vitest` — `import { describe, expect, it } from "vitest"`
- Each domain port follows: `types.ts` → implementation file(s) → `index.ts` barrel
- Preserve `eslint-disable` comments for legacy deprecation patterns where needed
