# Server TypeScript Modernization — Handoff Spec

> **Status:** Stages 1-8 complete. TTS + Cloudflare tunnels deleted (not ported). Main blockers resolved; all route handlers ported.
> **Branch:** `feature/server-typescript-modernization` (85+ commits ahead of main)
> **Date:** 2026-06-02 (updated 2026-06-03)
> **Commits since handoff:** 12+

## 1. What We Built

**79 new TS files (25K lines)** across 12 domain directories under `packages/web/server/src/domains/`:

| Domain | Files | Purpose |
|--------|-------|---------|
| `core/` | event-bus.ts, events.ts, index.ts | Typed EventBus, event constants |
| `settings/` | types.ts, normalization.ts (~430 lines), helpers.ts (~480 lines, 80-field sanitizer), runtime.ts (~915 lines, 7 migrations), themes.ts (~167 lines), index.ts | Settings CRUD, disk I/O, migration pipeline, theme validation |
| `server-utils/` | types.ts, utils.ts (~175 lines), proxy.ts (~365 lines), index.ts | Port management, SSE helper, proxy middleware |
| `opencode-support/` | types.ts, env-config.ts (~72 lines), env-runtime.ts (bridge), network.ts (~98 lines), auth-state.ts (bridge), hmr-state.ts (~85 lines), opencode-resolution.ts (~71 lines), project-directory.ts (~124 lines), index.ts | Env config parsing, HMR state, OpenCode binary resolution |
| `bootstrap/` | types.ts, lifecycle.ts (bridge), server-startup.ts (~138 lines), startup-pipeline.ts (~126 lines), bootstrap-runtime.ts (~130 lines), shutdown-runtime.ts (~147 lines), tunnel-wiring.ts (bridge), cli-options.ts (~128 lines), cli-entry.ts (~43 lines), index.ts | Server listen/tunnel/signal handling, graceful shutdown, CLI | 
| `routes/` | types.ts, core-routes.ts (~284 lines), routes.ts (~298 lines), feature-routes-runtime.ts (~240 lines, ~10 require() bridges), openchamber-routes.ts (~313 lines), static-routes.ts (~63 lines), pwa-manifest.ts (~258 lines), index.ts | All HTTP route registration, auth middleware |
| `terminal/` | types.ts, protocol.ts (24 tests), protocol.test.ts, replay-buffer.ts (6 tests), replay-buffer.test.ts, pty.ts, sessions.ts, ws-server.ts, routes.ts, runtime.ts, index.ts | WebSocket terminal I/O, PTY management, replay buffer |
| `event-stream/` | types.ts, protocol.ts (7 tests), protocol.test.ts, upstream-reader.ts (3 tests), upstream-reader.test.ts, global-hub.ts, ui-event-broadcaster.ts, error-broadcast.ts (4 tests), error-broadcast.test.ts, global-ws-bridge.ts, directory-ws-bridge.ts, runtime.ts, index.ts | WebSocket SSE fan-out, per-directory isolation, stall recovery |
| `sessions/` | types.ts, event-normalizer.ts (~1154 lines, 26 payload types, 7 tests), event-normalizer.test.ts, actor-registry.ts, effect-executor.ts (6 tests), effect-executor.test.ts, snapshot-publisher.ts, machine-bridge.ts, session-runtime.ts, index.ts | XState v5 session machine actors, SSE→event normalizer, effect execution |
| `opencode/` | types.ts, runtime.ts (bridge wrapper, ~40 methods), open-code-runtime.ts (~215 lines), lifecycle.ts (~781 lines), index.ts | OpenCode process lifecycle: spawn, restart, health, port management |
| `auth/` | types.ts, provider-auth.ts (~81 lines), tunnel-auth.ts (~590 lines), opencode-auth-state.ts (~88 lines), index.ts | Auth persistence, tunnel sessions/bootstrap tokens, password generation |
| `notifications/` | types.ts, emitter.ts (~75 lines), message.ts (~70 lines), runtime.ts (~46 lines), template-runtime.ts (~459 lines), trigger-runtime.ts (~540 lines), push-runtime.ts (~326 lines), routes.ts (~356 lines), index.ts | Web push, desktop notifications, SSE broadcasts, notification templates |

Plus foundation files: `src/shared/types.ts`, `src/shared/errors.ts`, `src/shared/lifecycle.ts`, `src/runtime/*.ts`, `src/app/*.ts`, `src/index.ts`, `src/main.ts`.

**`packages/web/server/index.js`** (the old entrypoint) now has **zero** `lib/` imports — it only imports from `./dist/domains/` and a few top-level `./lib/` paths for domains not yet migrated (tts, fs, etc.).

## 2. Verification Baseline

```bash
bun run type-check          # PASS (all 7 packages + server TS)
bun run build:web-server    # PASS (dist/ output with .js + .d.ts + sourcemaps)
bun test server/src/domains/  # 57 tests PASS, 0 failures
```

Pre-existing conditions on the branch:
- Root `bun run lint`: 82 errors, 120 warnings (all pre-existing from unported code + complexity violations; no new errors from Stage 5b/6)
- `packages/web lint on server/src/domains/auth|notifications`: 0 errors, 14 warnings (complexity only)

## 3. Architecture: How Things Wire Together

### Entrypoint chain
```
packages/web/server/index.js (860 lines, JS, touched but not rewritten)
  ├── imports from ./dist/domains/* for all typed domains
  ├── imports from ./lib/tts/*, ./lib/fs/*, ./lib/tunnels/*, etc. for unported domains
  └── main() function wires everything with closures, lazy accessors, and module-level state
```

### Domain factory pattern (established for all TS domains)
```typescript
// types.ts — all interfaces + constants, no implementations
export interface FooDomainDeps { ... }
export interface FooDomain { shutdown(): Promise<void> }

// runtime.ts — factory + setup
export function createFooDomain(deps: FooDomainDeps): FooDomain { ... }

// index.ts — barrel re-export
export { createFooDomain } from "./runtime.js"
export type * from "./types.js"
```

### Dependency injection
Every domain factory receives a typed `deps` interface. No singletons, no global `require()`. Dependencies flow explicitly through `index.js → domain factory`.

### Bridge pattern (used where old JS isn't ported yet)
When a factory depends on old JS, the TS wrapper dynamically `require()`s it:
```typescript
// feature-routes-runtime.ts
const { registerFsRoutes } = require("../../../lib/fs/routes.js") as any;
```
These are documented and known to be cleaned up when the target domain gets ported.

## 4. What Remains (~64 JS files in lib/)

### 4.1 Stage 7 (COMPLETED): Fix Blockers + Port Bounded Cache
- `lib/core/bounded-cache.js` → ported to `src/domains/core/bounded-cache.ts` (LRU+TTL Map/Set, 29 tests)
- `lib/core/bounded-cache.js` re-export shim kept for 2 remaining JS consumers (`git/service.js`, `pwa-manifest-routes.js`)
- All 6 TS consumer `require()` calls → typed ES imports
- `routes/routes.ts` broken auth import fixed
- `bootstrap/lifecycle.ts` broken lifecycle import fixed
- `auth/types.ts` TunnelAuthDeps cleaned

### 4.2 TTS + Cloudflare Tunnels (DELETED — Spec divergence)
- `summarizeText` extracted to `core/summarize.ts` (kept for notifications)
- TTS domain deleted: `src/domains/tts/`, all frontend voice hooks/components (14 files), VS Code stubs
- Cloudflare tunnels deleted: `src/domains/tunnels/`, `lib/cloudflare-tunnel.js`, `tunnel-auth.ts`, `tunnel-wiring.ts`, all bootstrap/settings/routes tunnel wiring, TunnelSettings UI, Electron quit-checks, CLI tunnel subcommand
- Vestigial cleanup: `TUNNEL_*` events removed, `TunnelError` class removed, `index.d.ts` tunnel fields purged
- Commit: `0a7879f4` (43 files, -7608 lines)

### 4.3 Stage 8 (COMPLETED): Kill require() Bridges
All 12 `require()` calls in `feature-routes-runtime.ts` replaced with typed ES imports. Ported route files:

| Route file | New TS location | Lines |
|---|---|---|
| `lib/quota/routes.js` | `src/domains/quota/routes.ts` | 38 |
| `lib/magic-prompts/routes.js` | `src/domains/magic-prompts/routes.ts` | 65 |
| `lib/magic-prompts/runtime.js` | `src/domains/magic-prompts/runtime.ts` | 120 |
| `lib/session-folders/routes.js` | `src/domains/session-folders/routes.ts` | 72 |
| `lib/scheduled-tasks/routes.js` | `src/domains/scheduled-tasks/routes.ts` | 230 |
| `lib/fs/routes.js` | `src/domains/fs/routes.ts` | 835 |
| `lib/github/routes.js` | `src/domains/github/routes.ts` | 1350 |
| `lib/git/routes.js` | `src/domains/git/routes.ts` | 990 |
| `lib/opencode/routes/config-entity-routes.js` | `src/domains/opencode/routes/config-entity-routes.ts` | 375 |
| `lib/opencode/routes/core-routes.js` | `src/domains/opencode/routes/core-routes.ts` | 290 |
| `lib/opencode/routes/project-icon-routes.js` | `src/domains/opencode/routes/project-icon-routes.ts` | 400 |
| `lib/opencode/routes/skill-routes.js` | `src/domains/opencode/routes/skill-routes.ts` | 710 |
| `lib/opencode/routes/routes.js` | `src/domains/opencode/routes/routes.ts` | 300 |

All 12 old lib/ JS files deleted. Stale file cleanup: `lib/fs/routes.js`, `lib/scheduled-tasks/routes.js`, `lib/security/request-security.js` removed (already ported). Commit: `d5e219a9`.

### 4.4 Remaining lib/ JS Files (Stages 9-10)

These contain the **core domain logic** — not just route wrappers. The route registration is ported, but the underlying implementations still live in lib/:

| Category | Files | Lines (est.) |
|---|---|---|
| **Quota providers** | `lib/quota/index.js`, `lib/quota/utils/*` (4), `lib/quota/providers/*` (16) | ~3,500 |
| **Skills catalog** | `lib/skills-catalog/index.js`, `source.js`, `scan.js`, `install.js`, `git.js`, `curated-sources.js`, `cache.js`, `clawdhub/*` (4) | ~1,500 |
| **Git domain** | `lib/git/credentials.js`, `identity-storage.js`, `service.js`, `index.js` | ~800 |
| **GitHub domain** | `lib/github/auth.js`, `device-flow.js`, `octokit.js`, `pr-status.js`, `repo/index.js`, `index.js` | ~1,200 |
| **Opencode runtime** | `lib/opencode/services/agents.js`, `commands.js`, `mcp.js`, `providers.js`, `skills.js`, `lib/opencode/shared.js`, `lib/opencode/index.js` | ~1,000 |
| **Opencode routes (unported)** | `lib/opencode/routes/openchamber-routes.js`, `pwa-manifest-routes.js`, `feature-routes-runtime.js`, `static-routes-runtime.js` | ~1,500 |
| **Env runtime** | `lib/opencode/env/env-runtime.js` (fully rewritten in TS at `src/domains/opencode-support/env-runtime.ts` — 1123 lines) | already done |
| **Misc** | `lib/core/bounded-cache.js` (kept as shim for JS consumers), `lib/package-manager.js`, `lib/opencode/network/hmr-state-runtime.js` | ~200 |
| **Test files** | `lib/*/runtime.test.js`, `lib/git/routes.test.js`, etc. (7 files) | ~1,500 |

### 4.5 Already Ported to TS (committed in `b86ff47e`)
These domains are fully in `src/domains/`, wired into `index.js` via `dist/` imports:
- `fs/` (search), `projects/` (config, with tests), `scheduled-tasks/` (runtime), `security/`, `ui-auth/`, `opencode-support/` (env, watcher, network), `tunnels/` (deleted instead)

## 5. Remaining Cleanup Work (Stages 9-10)

### Stage 9: Port Remaining Domain Logic

These are the deep domain implementations still in lib/ (not route wrappers — those are done). Port each to `src/domains/<name>/` following the established factory pattern:

**Priority order:**

1. **Quota domain** (20 lib/ files, ~3,500 lines)
   - `lib/quota/index.js` → factory entry point
   - `lib/quota/utils/*` → `src/domains/quota/utils/`
   - `lib/quota/providers/*` (16 provider files) → `src/domains/quota/providers/`
   - Already has `routes.ts` ported; wire into barrel

2. **Skills catalog** (10 lib/ files, ~1,500 lines)
   - `lib/skills-catalog/index.js`, `source.js`, `scan.js`, `install.js`, `git.js`, `curated-sources.js`, `cache.js`
   - `lib/skills-catalog/clawdhub/*` (4 files)

3. **Git domain** (4 lib/ files, ~800 lines)
   - `lib/git/credentials.js`, `identity-storage.js`, `service.js`, `index.js`
   - Already has `routes.ts` ported; wire into barrel
   - `service.js` is the last consumer of `lib/core/bounded-cache.js` shim — porting it lets us delete the shim

4. **GitHub domain** (5 lib/ files, ~1,200 lines)
   - `lib/github/auth.js`, `device-flow.js`, `octokit.js`, `pr-status.js`, `repo/index.js`, `index.js`
   - Already has `routes.ts` ported; wire into barrel

5. **Opencode services** (7 lib/ files, ~1,000 lines)
   - `lib/opencode/services/agents.js`, `commands.js`, `mcp.js`, `providers.js`, `skills.js`
   - `lib/opencode/shared.js`, `lib/opencode/index.js`

6. **Opencode unported routes** (4 lib/ files, ~1,500 lines)
   - `lib/opencode/routes/openchamber-routes.js`, `pwa-manifest-routes.js`, `feature-routes-runtime.js`, `static-routes-runtime.js`
   - Note: `pwa-manifest-routes.js` is the last remaining consumer of `lib/core/bounded-cache.js` along with `git/service.js`

7. **Misc remaining** — `lib/package-manager.js`, `lib/opencode/network/hmr-state-runtime.js`

**Verification:** After each domain port, verify `npx tsc -p packages/web/tsconfig.server.json` and `bun test`, delete old lib/ files, commit.

### Stage 10: Rewrite `index.js` as Pure TypeScript

Once lib/ domain logic is fully ported, rewrite `packages/web/server/index.js` as `src/index.ts`:
- Replace all remaining `./lib/` imports with `./dist/domains/` paths  
- Replace module-level mutable state with domain factory closures
- Eliminate the `opencode-proxy.js` / `sse-routes.js` top-level files (fold into domains)
- Delete the JS entrypoint

After Stage 10, `packages/web/server/lib/` should be empty (only DOCUMENTATION.md files remaining).

## 6. Key Patterns to Maintain

- **verbatimModuleSyntax: true** — `import type` for types, `.js` extensions on relative imports
- **node: prefix** for Node built-ins
- **Factory pattern** — every domain exports `createXxxDomain(deps): XxxDomain`
- **eslint-disable for legacy deprecations** — `require()` of old JS, `any` types at boundaries, empty catch blocks in ported code use file-level or per-line disables
- **No hex colors** — theme tokens only (see theme-system skill)
- **Test with `bun test`** — vitest compatible, use `import { describe, expect, it } from "vitest"`

## 7. Build/Verify Commands

```bash
# TypeScript checking (server only)
npx tsc --noEmit -p packages/web/tsconfig.server.json

# Full project type-check (all packages)
bun run type-check

# Build server (JS + declarations + sourcemaps)
bun run build:web-server

# Run domain tests
cd packages/web && bun test server/src/domains/

# Lint new domain files
cd packages/web && npx eslint server/src/domains/<name>/

# Full verification
bun run type-check && bun run lint && bun run build:web-server && cd packages/web && bun test server/src/domains/
```

## 8. Git Commands

```bash
# See all changes on branch
git log --oneline main..HEAD

# See files changed
git diff --stat main...HEAD

# See remaining lib/ files
find packages/web/server/lib -name "*.js" | sort
```
