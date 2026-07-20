---
kind: plan
status: completed
base_branch: feature/web-pwa-maintainability
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - web-product-consolidation
coverage: completes
created: 2026-07-15
updated: 2026-07-20
closed: 2026-07-20
verification:
  - Clean-dist type-check and canonical build artifacts passed.
  - Protected tests passed, including integration coverage.
  - Both tarballs passed clean install/import/CLI verification.
  - Docker and release dry-runs passed.
  - Lint had no increases or new categories.
---

# Web Product Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fold the private source-only UI workspace into the web product so the browser, PWA build, server, CLI, package, and root commands have one obvious owner.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`, chunk `web-product-consolidation`

---

## Dependency Audit Decision

`packages/ui` has no current independent responsibility:

- it is private, has no exports or publish artifact, and its build is only `tsc --noEmit`;
- the sole runtime consumer is `packages/web`, whose Vite and TypeScript aliases compile `packages/ui/src` directly into `packages/web/dist`;
- React and performance tests consume the same source through aliases, not through an independently built package;
- no server, CLI, documentation runtime, `@openchamber/session-state`, or external package imports it.

The package is therefore folded into `packages/web/src/ui`. This subdirectory avoids collisions between the two existing `main.tsx` files and keeps browser presentation/state code distinct from the web entry, service worker, and transport adapters without preserving a workspace boundary.

`@openchamber/session-state` remains an independent workspace with its existing runtime-free dependency boundary. `packages/web/server` retains its server-only tsconfig and must not import browser code.

The generic `window.__OPENCHAMBER_RUNTIME_APIS__` bridge is moved intact with the browser code. Removing that compatibility global and splitting the bulk contract types belongs to the following `domain-network-contracts` chunk; this plan must not combine that behavioral refactor with the package move.

## Execution Defaults

- Execute tasks sequentially on `feature/web-pwa-maintainability`.
- Use TDD for changed scripts/config contracts where focused tests add value; preserve existing behavior during the source move.
- Stage only reviewed paths, inspect the staged move/diff, and commit each task.
- Never use process-name matching. Integration cleanup remains PID-file/watchdog/reaper only.
- Historical `CHANGELOG.md` and completed `.superpawers` artifacts retain their old paths as history.

### Task 1: Atomically Fold The UI Workspace Into Web

- [x] **Outcome:** `packages/ui` no longer exists; its source lives under `packages/web/src/ui`; web development, type-check, build, store, React, and performance workflows resolve the moved source from one workspace.

**Files and anchors:**
- Move: `packages/ui/src/` -> `packages/web/src/ui/` — preserve the full components, stores, sync, hooks, contexts, assets, styles, types, tests, and browser libraries tree.
- Delete: `packages/ui/package.json`, `packages/ui/tsconfig.json`, and generated/ignored residue under `packages/ui` after tracked files move.
- Modify: `packages/web/src/main.tsx` and `packages/web/src/api/*.ts` — replace every `@openchamber/ui/...` import with the internal `@/...` alias; retain initialization order so APIs are registered before importing `@/main`.
- Modify: `packages/web/vite.config.ts` — remove the `@openchamber/ui` alias; map `@` to `packages/web/src/ui` and keep `@web` mapped to `packages/web/src`.
- Modify: `packages/web/tsconfig.json` — `@/*` maps only to `src/ui/*`, `@web/*`/`@openchamber/web/*` remain web-entry aliases, remove `@openchamber/ui/*`, and include only in-workspace `src`.
- Modify: root `tsconfig.json` — remove dead UI and desktop project references/aliases; retain only web and session-state references and active aliases.
- Modify: `packages/web/package.json` — merge all dependencies/devDependencies needed by the moved source, add `test:stores` for `src/ui/stores`, preserve server runtime dependencies and published `files`; use the UI workspace's currently resolved browser version where a conflict changes runtime behavior (notably `ghostty-web` `^0.4.0`).
- Modify: root `package.json` — remove separate UI dev/build/type-check/lint scripts, make root build web-only, reduce root dev to server+web watchers, and route `test:stores` through `packages/web`.
- Modify: `tests/tsconfig.json`, `tests/react/vitest.config.ts`, `tests/perf/vitest.config.ts` — point `@` to `packages/web/src/ui` and remove `@openchamber/ui` aliases.
- Modify: `Dockerfile` — remove the deleted UI workspace manifest copy; preserve web/session-state/tests manifests and runtime contents.
- Modify: `scripts/bump-version.mjs` — replace the deleted UI manifest with the independently published session-state manifest so versions remain synchronized.
- Modify: `bun.lock` — regenerate after workspace/dependency consolidation.

**Constraints:**
- This is a path/package ownership move, not a component, store, sync, API, theme, or PWA redesign.
- Perform the tracked move exactly with `git mv packages/ui/src packages/web/src/ui`. After inspecting ignored files, remove only the known generated `packages/ui/node_modules` residue and the now-obsolete `packages/ui/package.json`/`tsconfig.json`; do not broadly clean workspace directories.
- Preserve `packages/web/src/main.tsx`, `packages/web/src/sw.ts`, `packages/web/src/api`, `packages/web/public`, `packages/web/server`, and `packages/web/bin` at their current product-level locations.
- Preserve all `@/` imports inside moved code by changing the alias once; do not mass-rewrite them to relative paths.
- Browser-only dependencies belong in web `devDependencies` because the published package serves prebuilt `dist`; dependencies also used by the shipped server/CLI remain in `dependencies`.
- Every dependency key formerly owned by `packages/ui` must remain declared exactly once in `packages/web` dependencies or devDependencies unless a source/import audit proves it unused. Broad dependency deletion belongs to `dependency-documentation-convergence`.
- Root dependency cleanup and removal of `patch-package` are out of scope. Preserve the root `ghostty-web@0.3.0` patch owner while web explicitly retains the moved UI's `^0.4.0` behavior.
- Do not modify `packages/session-state` source or dependency manifest.

**Dependencies:** Approved and completed shell/scheduled-task removals; plan commit.

**Proof:**
- `packages/ui` and `@openchamber/ui` active references are absent; lockfile has no UI workspace key.
- Frozen install is stable and the moved source resolves from `packages/web/src/ui`.
- Root type-check, root build, store suite, React suite, and performance benchmarks pass.
- Vite still builds the PWA/service worker into `packages/web/dist`; server build remains isolated.
- From `packages/web`, dependency resolution reports `ghostty-web` 0.4.x; root resolution remains 0.3.0 and `patches/ghostty-web+0.3.0.patch` remains applied/owned only by the root package.
- The staged diff is recognized primarily as moves plus focused config/manifest changes, not accidental source rewrites.
- Before commit, staged `git diff --check`, `git diff --summary --find-renames`, and `git diff --name-status --find-renames` show the complete move and only the reviewed config/manifest changes.

### Task 2: Make The Published Product Independently Installable

- [x] **Outcome:** `@openchamber/session-state` remains a separate runtime-independent workspace but becomes a built/published dependency, and a clean external install of locally packed session-state plus web artifacts can import the server and resolve the CLI's real compiled entrypoints.

**Files and anchors:**
- Modify: `packages/session-state/package.json` — synchronize version with the root/web package, make it publishable, add build/type artifact metadata, `files`, exports, and public scoped publish config while preserving its dependency boundary.
- Create: `packages/session-state/tsconfig.build.json` — emit ESM JavaScript, declarations/maps, and source maps from `src` to `dist` without changing the existing no-emit development/type-check config.
- Modify: root `package.json` — add direct `build:session-state`; canonical `build` emits session-state, browser/PWA `dist`, and server `dist`; canonical `start:web` builds required artifacts before starting; `pack:session-state` and `pack:web` both use npm packing from their package directories.
- Modify: `packages/web/tsconfig.json`, `packages/web/tsconfig.server.json`, and `packages/web/vite.config.ts` — development/type-check/build resolve `@openchamber/session-state` to its source workspace while emitted server imports remain the public package name.
- Modify: `packages/web/bin/cli.js` — daemon spawn resolves `server/dist/main.js`; foreground import resolves `server/dist/index.js`; preserve CLI validation, flags, and lifecycle behavior.
- Test: add a focused CLI/server-entry test under `packages/web/bin/` that proves both compiled paths exist after build and the foreground module exports `startWebUiServer` without starting a server process.
- Modify: `.github/workflows/release.yml` — build/pack/publish session-state before web, honor the existing dry-run gate for both, upload both tarballs when applicable, and preserve release finalization/Discord/website behavior.
- Modify: `Dockerfile` — builder runs the canonical full build; runtime copies `packages/session-state/package.json` and `dist` so the installed workspace link resolves, plus compiled `packages/web/server/dist` and browser `dist`; preserve production dependencies and ordinary Git SSH tooling.
- Modify: `scripts/bump-version.mjs` — ensure root, session-state, and web versions are updated together (if not already completed in Task 1).

**Constraints:**
- Preserve `@openchamber/session-state` as a real independent package; do not bundle/copy/rewrite it into web server output.
- Published session-state must contain compiled `dist` only and must not acquire React, DOM, Express, filesystem, OpenCode SDK, Zustand, or server dependencies.
- Replace web's `workspace:*` dependency with the exact synchronized session-state version. Bun still links the matching local workspace during development, while both npm and local pack paths emit an ordinary registry-resolvable semver without rewrite assumptions. `scripts/bump-version.mjs` must update the package versions and this dependency together.
- The npm registry currently returns 404 for `@openchamber/session-state`, so no conflicting public package was found; do not perform a live publish from this branch.
- External verification uses temporary directories/tarballs under `/tmp/opencode` and must clean only paths it creates. It must not run an OpenCode process or use process-name matching.
- Preserve release dry-run semantics and npm token isolation. A release cannot publish web unless session-state publish/availability succeeds.

**Dependencies:** Task 1.

**Proof:**
- Session-state build emits importable `dist/index.js` and declarations; its package dry run contains only intended metadata/output and version matches web/root.
- Canonical root/release/Docker builds assert `packages/session-state/dist/index.js`, `packages/web/server/dist/index.js`, `packages/web/server/dist/main.js`, and `packages/web/dist/index.html` exist before package/start stages.
- Web server build retains bare `@openchamber/session-state` imports and both npm-packed manifests contain the exact synchronized semver with no `workspace:*` or `0.0.0`, proving normal npm dependency resolution rather than hidden bundling.
- Docker's runtime workspace link resolves the copied session-state package and compiled module; the container does not rely on builder-only source paths.
- A clean temporary npm project installs both locally-produced tarballs, imports `@openchamber/session-state` and `@openchamber/web`, verifies `startWebUiServer` is exported, and runs the installed CLI help/entry contract without starting a server.
- Release YAML structure/value assertions prove ordered build/pack/publish, dry-run behavior, both tarball uploads, and unchanged finalization notifications.
- Session-state tests/type-check and all server bootstrap/session-machine tests pass.

### Task 3: Converge Active Tooling And Documentation

- [x] **Outcome:** All active developer tooling and guidance name the web product as the UI owner, generated assets/themes target the moved paths, and the published web package remains complete.

**Files and anchors:**
- Modify: `AGENTS.md` — runtime map, new-code placement, stack, entrypoints, sync docs, typography, stores/components paths now point to `packages/web/src/ui`; preserve architecture, mobile, performance, and process-safety rules.
- Modify: `CONTRIBUTING.md` — replace the shared-UI package section/tree/theme paths with the single web product and root commands.
- Modify: `scripts/generate-file-type-sprite.mjs` — icon source/output target `packages/web/src/ui`.
- Modify: `scripts/convert-vscode-theme.cjs` and `scripts/port-opencode-theme.ts` — generated theme/default output paths target `packages/web/src/ui/lib/theme/themes` while preserving converter behavior.
- Modify: `.opencode/skills/theme-system/SKILL.md` and `.opencode/skills/mobile-first-ui/SKILL.md` — active skill paths point to the moved UI owner while preserving all design/mobile rules.
- Modify: `packages/web/server/src/domains/github/DOCUMENTATION.md` — active browser component/type paths point to the moved source.
- Modify moved active docs/comments under `packages/web/src/ui`, including `sync/DOCUMENTATION.md`, `stores/DOCUMENTATION.md`, `assets/icons/file-types/README.md`, source header comments, and benchmark invocation notes.
- Modify: `tests/perf/README.md` and `docs/CUSTOM_THEMES.md` — active commands/examples use moved paths.
- Modify: `.superpawers/OVERVIEW.md` only in its active status/path block; preserve historical entries.
- Test: existing icon generator, theme scripts' argument/help behavior, docs validation, and package dry-run evidence.

**Constraints:**
- Preserve historical paths in `CHANGELOG.md`, completed/superseded plans/specs, and historical overview sections.
- Preserve editor-theme provenance (`vscode`/TextMate names), file icon IDs, and the offline theme converter; only ownership paths change.
- Do not generate or commit new icon/theme output unless a source/output change actually alters deterministic generated files.
- The npm package remains `@openchamber/web`; its tarball must contain `dist`, `server`, `bin`, `public`, package metadata, and no dependency on or path to `packages/ui`. Task 2 owns external installability.
- The active-reference audit scope is `.opencode/skills`, root `AGENTS.md`/`CONTRIBUTING.md`/`README.md`, root configs/manifests, `scripts`, `docs`, `packages/web`, `packages/docs`, and `tests`. Exclude `CHANGELOG.md`, `.superpawers` historical/completed artifacts, `node_modules`, `dist`, coverage, and generated package tarballs.

**Dependencies:** Tasks 1 and 2.

**Proof:**
- Active code/config/scripts/docs outside historical artifacts contain no `packages/ui` or `@openchamber/ui` references.
- Icon sprite generation succeeds deterministically and its diff is empty.
- Theme converter/porter help/default-path checks resolve to the moved directory.
- Docs validation passes.
- Package dry runs after build list required artifacts and no UI workspace/source dependency.
- Root commands documented in active guidance match actual scripts.

### Task 4: Verify And Close Web Product Consolidation

- [x] **Outcome:** The final workspace has one web product, independent session-state, docs, and tests; all protected local/remote browser workflows pass; the plan and parent chunk are closed with fresh evidence.

**Files and anchors:**
- Modify: `.superpawers/plans/2026-07-15-web-product-consolidation.md` — completion state and exact verification record.
- Modify: `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md` — only `web-product-consolidation` becomes complete.
- Modify: `.superpawers/OVERVIEW.md` only if fresh active verification counts/topology need correction.

**Constraints:**
- Final package directories may include only current products/support (`web`, `session-state`, `docs`); no hypothetical UI workspace.
- `packages/session-state/package.json` must retain its current runtime-independent dependency boundary and focused tests.
- Local loopback and remote/self-hosted modes continue using the same web bundle/server routes; no runtime platform fork may be introduced.
- `scripts/verify.sh` may remain nonzero only for inherited lint debt. No surviving workspace may exceed the fresh pre-task baseline: session-state 0 errors/5 warnings, tests 37/5, and the consolidated web workspace no more than the combined prior web+UI baseline of 414 errors/937 warnings with no new rule category. Absorbing the UI package must not hide its lint debt.

**Dependencies:** Tasks 1, 2, and 3 approved.

**Proof:**
- Exhaustive active-reference/workspace/lock audits show no `packages/ui`, `@openchamber/ui`, stale root scripts, aliases, Docker copies, or generated path owners.
- Frozen install, type-check, root build, server build, store, React, performance, web, full integration, docs, and package dry-run pass.
- Canonical root commands `bun run dev`, `bun run build`, `bun run pack:web`, and `bun run start:web` are present and documented; noninteractive proof runs build/package/start entry contracts rather than leaving long-running dev/server processes.
- Focused server/session tests include session-state machine tests, web server bootstrap/shutdown/session-domain tests, local-loopback integration, remote/self-hosted auth/proxy behavior, and the full PID-safe integration suite.
- PWA/service-worker tests and build output remain present; local/remote auth, filesystem, terminal, Git/worktrees, GitHub, quota, models/tools/permissions/settings, session/chat, and liveness suites remain green.
- Fresh lint is categorized against the combined prior web+UI baseline with no increased rule count attributable to the move.
- Plan-management reports this plan complete and only `web-product-consolidation` newly complete; worktree/diff are clean before the tracking commit.

## Verification Record

Verified 2026-07-20:

- UI is folded into web; `@openchamber/session-state` is separately built, publishable, and exactly version `1.9.11`.
- Clean-dist type-check and canonical build artifacts passed. Tests: session-state 78; stores 238; React 63; web 18 + 2 skipped; integration 53 + 2 skipped; event-stream 17; performance 5; docs 7/7.
- Both tarballs passed packaging plus clean install/import/CLI checks; Docker and release dry-runs passed.
- `scripts/verify.sh` remained nonzero only for inherited lint. Current errors/warnings: session-state 0/5, web 406/937, tests 36/4; no increases or new rule categories.
- Verification-discovered fixes: WebSocket/auth and directory-scope fixes `fd0b88fe`, `183dd19c`, `e602fc9b`; clean type-check fix `57f5e608`.
- Final worktree was clean. Live npm publish was not performed; Ghostty dual-versioning and legacy HeroUI remain future dependency cleanup, not chunk failures.
