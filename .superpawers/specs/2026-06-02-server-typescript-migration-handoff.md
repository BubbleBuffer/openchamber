# Server TypeScript Modernization — Handoff Spec

> **Status:** 6 of 6 stages complete. Critical startup/shutdown path fully typed.
> **Branch:** `feature/server-typescript-modernization` (78 commits ahead of main)
> **Date:** 2026-06-02

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

## 4. What Remains (80 JS files, ~20K lines)

### 4.1 Immediate Action Required — Broken Dependencies (BLOCKERS)

These files are referenced via `require()` from TS but **do not exist on disk** (deleted alongside ported domains without migrating their consumers):

| Missing File | Referenced By | Fix Required |
|---|---|---|
| `lib/core/bounded-cache.js` | `domains/auth/tunnel-auth.ts`, `domains/notifications/push-runtime.ts`, `domains/notifications/template-runtime.ts`, `domains/notifications/trigger-runtime.ts`, `domains/routes/pwa-manifest.ts` | **Port to TS:** Create `domains/core/bounded-cache.ts` (factory `createBoundedMap`, `createBoundedSet`). Update all 5 consumers. |
| `lib/opencode/auth/auth.js` | `domains/routes/routes.ts:29` | **Already ported:** Exists as `domains/auth/provider-auth.ts`. Update `routes.ts` import to `require("../../../dist/domains/auth/index.js")` |
| `lib/opencode/bootstrap/lifecycle.js` | `domains/bootstrap/lifecycle.ts:6` | **Already ported:** Exists as `domains/opencode/lifecycle.ts`. Update `bootstrap/lifecycle.ts` bridge to import from `../opencode/lifecycle.js` |

### 4.2 High Priority — Bridged But Awaiting Full Port

These `lib/` files are referenced via `require()` from `feature-routes-runtime.ts`. They work at runtime but should be ported to proper TS domains:

**Route handlers** (7 files, ~2,300 lines total):
- `lib/opencode/routes/core-routes.js` — settings utility routes
- `lib/opencode/routes/routes.js` — OpenCode config/proxy routes
- `lib/opencode/routes/config-entity-routes.js` — agents, commands, MCP CRUD
- `lib/opencode/routes/project-icon-routes.js` — project icon management
- `lib/opencode/routes/skill-routes.js` — skill discovery/installation
- `lib/opencode/routes/pwa-manifest-routes.js` — not referenced (dead code — ported to TS already)
- `lib/opencode/index.js` — OpenCode service barrel

**Domain services** (3 files, ~1,450 lines total):
- `lib/fs/routes.js` — filesystem routes
- `lib/git/routes.js`, `lib/git/index.js` — git routes + barrel
- `lib/github/routes.js` — GitHub routes
- `lib/magic-prompts/routes.js` — magic prompts
- `lib/scheduled-tasks/routes.js` — scheduled tasks
- `lib/session-folders/routes.js` — session folders
- `lib/quota/routes.js`, `lib/quota/index.js` — quota providers
- `lib/skills-catalog/index.js` — skills catalog search/install

### 4.3 Medium Priority — Unported Feature Domains

These `lib/` directories have no TS equivalent yet. They are imported from `index.js` (direct imports, not `require()`):

| Directory | Files | Lines (est.) | Index.js Import |
|-----------|-------|------|------|
| `lib/tts/` | index.js, routes.js, service.js, capability-runtime.js, base-url.js, stt.js | ~800 | `import { registerTtsRoutes } from './lib/tts/routes.js'` |
| `lib/tunnels/` | index.js, types.js, registry.js, routes.js, managed-config.js, providers/cloudflare.js | ~600 | Multiple imports for tunnel provider, registry, types |
| `lib/ui-auth/` | ui-auth.js, ui-passkeys.js | ~500 | `import { createUiAuth } from './lib/ui-auth/ui-auth.js'` |
| `lib/security/` | request-security.js | ~100 | Direct import in index.js |
| `lib/cloudflare-tunnel.js` | — | ~50 | Direct import in index.js |
| `lib/package-manager.js` | — | ~50 | Direct import in index.js |
| `lib/opencode/env/env-runtime.js` | — | ~1095 | `import { createOpenCodeEnvRuntime } from './lib/opencode/env/env-runtime.js'` |

### 4.4 Low Priority — Already Ported, Can Be Deleted

These `lib/` files have a functional TS equivalent but are kept as dead code because the TS version isn't the canonical import yet (bridge wrappers still need them):

| Dead lib/ File | TS Equivalent |
|---|---|
| `lib/opencode/routes/pwa-manifest-routes.js` | `dist/domains/routes/pwa-manifest.js` |
| `lib/opencode/routes/static-routes-runtime.js` | `dist/domains/routes/static-routes.js` |
| `lib/opencode/env/env-config.js` | `dist/domains/opencode-support/env-config.js` |
| `lib/opencode/network/hmr-state-runtime.js` | `dist/domains/opencode-support/hmr-state.js` |
| `lib/opencode/network/tunnel-wiring-runtime.js` | `dist/domains/bootstrap/tunnel-wiring.js` (bridge) |
| `lib/opencode/resolution/opencode-resolution-runtime.js` | `dist/domains/opencode-support/opencode-resolution.js` |
| `lib/opencode/resolution/project-directory-runtime.js` | `dist/domains/opencode-support/project-directory.js` |
| `lib/tunnels/tunnel-runtime.js` | superseded (no consumers) |
| `lib/opencode/runtime.test.js` | legacy test file |

### 4.5 Test Files (can port or discard)

- `lib/opencode/bootstrap/lifecycle.test.js`
- `lib/opencode/routes/core-routes.test.js`
- `lib/opencode/runtime.test.js`
- `lib/opencode/server-utils-runtime.test.js`
- `lib/opencode/services/watcher.test.js`
- `lib/opencode/session/session-runtime.test.js`
- `lib/projects/project-config.test.js`
- `lib/quota/providers/google/auth.test.js` (name guessed — verify)
- `lib/scheduled-tasks/runtime.test.js`
- `lib/tunnels/tunnel-runtime.test.js`

## 5. Remaining Cleanup Work (Stages 7+)

### Stage 7: Fix Blockers + Port Bounded Cache
1. Create `domains/core/bounded-cache.ts` — port `lib/core/bounded-cache.js` (LLM-optimized LRU with TTL)
2. Update 5 consumer files to import from `../core/bounded-cache.js`
3. Fix `routes/routes.ts:29` to import from `dist/domains/auth/index.js`
4. Fix `bootstrap/lifecycle.ts:6` to import from `../opencode/lifecycle.js`
5. Verify type-check, lint, build, tests

### Stage 8: Kill `feature-routes-runtime.ts` require() Bridges
Strategy: Port each referenced route handler domain to TS, then update `feature-routes-runtime.ts` to use TS imports. Do NOT port `feature-routes-runtime.ts` itself until ALL its consumers are ported — it's the hub of dynamic imports.

Order of porting (each is ~1-2 files, one domain):
1. `lib/opencode/routes/core-routes.js` → merge into `domains/routes/core-routes.ts`
2. `lib/opencode/routes/routes.js` → merge into `domains/routes/routes.ts`  
3. `lib/opencode/routes/config-entity-routes.js` → merge into `domains/routes/config-entity-routes.ts`
4. `lib/opencode/routes/project-icon-routes.js` → merge into `domains/routes/project-icon-routes.ts`
5. `lib/opencode/routes/skill-routes.js` → merge into `domains/routes/skill-routes.ts`
6. `lib/opencode/index.js` → merge services barrel into proper TS
7. `lib/fs/routes.js` → new `domains/fs/`
8. `lib/git/routes.js` + `lib/git/index.js` → new `domains/git/`
9. `lib/github/routes.js` → new `domains/github/`
10. `lib/magic-prompts/routes.js` → new `domains/magic-prompts/`
11. `lib/scheduled-tasks/routes.js` → new `domains/scheduled-tasks/`
12. `lib/session-folders/routes.js` → new `domains/session-folders/`
13. `lib/quota/routes.js` + `lib/quota/index.js` → new `domains/quota/`
14. `lib/skills-catalog/index.js` → new `domains/skills-catalog/`

After all 14 domains are ported, `feature-routes-runtime.ts` can be rewritten without any `require()` calls. Then delete all old `lib/opencode/routes/*` files.

### Stage 9: Port Remaining Feature Domains
1. TTS domain (`lib/tts/` → `domains/tts/`)
2. Tunnels domain (`lib/tunnels/` → `domains/tunnels/`)
3. UI Auth domain (`lib/ui-auth/` → `domains/ui-auth/`)
4. Security domain (`lib/security/` → `domains/security/`)
5. OpenCode env runtime (`lib/opencode/env/env-runtime.js` — 1095 lines, the largest remaining file)

### Stage 10: Rewrite `index.js` as Pure TypeScript
Once ALL lib/ imports are gone, rewrite `packages/web/server/index.js` as `src/index.ts` with no JS bridge. This is the final stage — true strangler completion.

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
