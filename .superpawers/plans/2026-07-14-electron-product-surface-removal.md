---
kind: plan
status: complete
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - electron-removal
coverage: partial
created: 2026-07-14
updated: 2026-07-14
next_action: "Write and execute the Electron shared UI and server runtime cleanup plan"
---

# Electron Product Surface Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Electron/native desktop product, its build and release machinery, and active product guidance while preserving the web/PWA server, CLI, npm release, and currently compiling shared UI compatibility paths.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`

**Architecture:** Remove the self-contained native package and repository integration first, then contract the release workflow to the npm/web artifact. Shared UI and server desktop branches remain temporarily unreachable so this plan has a small, buildable boundary; the immediately following plan removes those compatibility paths and completes the chunk.

**Tech Stack:** Bun workspaces and lockfile, TypeScript, Vite/PWA, Docker, GitHub Actions, YAML, Markdown.

---

## Chunk Coverage

This plan covers the independently shippable first half of `electron-removal`:

- delete `packages/electron`, including the main process, preload shim, SSH manager, native tests, build scripts, icons, and entitlements;
- remove root Electron build/dev/type/lint/version/Docker integration;
- delete obsolete native release-smoke tooling and both stale Tauri and Electron macOS release jobs;
- retain the GitHub release, npm package build/publish, release notes, Discord notification, and website refresh workflow;
- remove active native desktop product and contributor guidance;
- regenerate the lockfile so Electron runtime, builder, updater, signing, and packaging dependencies disappear;
- prove the remaining root build produces only the web/PWA product.

The parent chunk remains incomplete after this plan. `.superpawers/plans/2026-07-14-electron-shared-runtime-removal.md` must then remove the shared UI/server desktop contract: `__TAURI__`, `__OPENCHAMBER_ELECTRON__`, boot/host/SSH state and UI, native update/filesystem/window/menu/notification branches, remote-instance settings, desktop-only server callbacks/env/settings, Tauri dependencies, mocks, and documentation. That follow-up must preserve PWA detection/install/update/notifications, browser file APIs, generic device form-factor language, web update APIs, and the protected product workflows.

Historical root `CHANGELOG.md` entries and completed planning artifacts remain unchanged. The generic `electron-to-chromium` Browserslist dependency may remain after lockfile regeneration because its name describes browser compatibility data rather than a maintained Electron product.

## File Structure

- Delete `packages/electron/` in full: all native shell implementation, SSH lifecycle, IPC security, updater, menus, dialogs, notifications, tests, assets, and packaging configuration belong to the removed product.
- Delete `.github/workflows/build-macos-arm64-dmg.yml`: both the stale Tauri job and Electron job produce removed native artifacts.
- Modify `.github/workflows/release.yml`: retain only release creation, npm publishing, final publication, Discord notification, and website refresh; remove native build/manifest jobs and native-only workflow environment.
- Delete `scripts/test-release-build.sh`: it is a stale native macOS/Tauri smoke script with no web/PWA release responsibility.
- Modify `package.json`: root metadata and commands describe and build the web/PWA UI, server, and CLI only.
- Modify `scripts/bump-version.mjs`: version updates target only surviving published/workspace manifests.
- Modify `Dockerfile` and `.dockerignore`: dependency-layer setup copies only surviving workspace manifests and no stale Tauri paths remain in Docker configuration.
- Regenerate `bun.lock`: remove native workspace ownership and unreachable Electron packaging dependencies.
- Modify `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, and `tests/perf/README.md`: active product, development, issue, and test guidance no longer claims a native desktop runtime.
- Modify `.superpawers/OVERVIEW.md`: correct only its active validation-status line; preserve historical program records.

### Task 1: Remove The Native Workspace And Root Integration

**Files:**
- Delete: `packages/electron/` — complete Electron workspace and all files beneath it
- Delete: `scripts/test-release-build.sh` — obsolete native release smoke script
- Modify: `package.json` — description and root scripts
- Modify: `scripts/bump-version.mjs` — `PACKAGES` manifest list
- Modify: `Dockerfile` — dependency manifest copy layer
- Modify: `.dockerignore` — stale `packages/desktop/src-tauri` and `packages/desktop/target` entries
- Regenerate: `bun.lock` — workspace and dependency graph

- [x] **Step 1: Record the native product contract before deletion**

Run:

```bash
test -d packages/electron
test -f scripts/test-release-build.sh
rg -n 'build:electron|type-check:electron|lint:electron|electron:(dev|build)|release:test|packages/electron|packages/desktop|tauri' package.json Dockerfile .dockerignore scripts/bump-version.mjs scripts/test-release-build.sh
rg -n '"packages/electron"|@openchamber/electron|"electron"|electron-builder|electron-updater|electron-context-menu|electron-log|@electron/rebuild' bun.lock
```

Expected: both deletion targets exist; the first search identifies only the root/native integration being removed; the lockfile search shows the Electron workspace and product-owned runtime/build dependencies.

- [x] **Step 2: Capture the fresh inherited lint baseline**

Run: `bun run lint`

Expected: lint remains nonzero. Record the exact per-workspace errors and warnings in the implementer report before deleting the Electron workspace. The completed VS Code chunk most recently verified session-state 0 errors/5 warnings, web 379/237, tests 37/5, UI 43/766, and Electron 0/0; these current counts supersede the program-start counts in the spec because the completed VS Code contraction reduced test/UI findings. The fresh run is authoritative for this plan's final comparison.

- [x] **Step 3: Delete native-owned implementation and smoke tooling**

Delete `packages/electron/` and `scripts/test-release-build.sh` in full. Do not preserve the native main/preload/SSH code, IPC gate, tests, package scripts, icons, entitlements, generated-output ignores, release helper, or obsolete Tauri smoke logic elsewhere.

- [x] **Step 4: Simplify root metadata, scripts, versioning, and Docker manifests**

Apply these anchored target states:

```jsonc
// package.json
{
  "description": "OpenChamber monorepo workspace for the web/PWA UI, server, and CLI",
  "scripts": {
    // ... existing surviving scripts ...
    "build": "bun run build:ui && bun run build:web"
    // remove build:electron, type-check:electron, lint:electron,
    // electron:dev, electron:build, release:test,
    // release:test:intel, and release:test:arm
  }
}
```

```js
// scripts/bump-version.mjs, PACKAGES
const PACKAGES = [
  'package.json',
  'packages/ui/package.json',
  'packages/web/package.json',
];
```

```dockerfile
# Dockerfile, dependency manifest COPY block
COPY package.json bun.lock ./
COPY packages/session-state/package.json ./packages/session-state/
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/
COPY tests/package.json ./tests/
```

Delete only the stale `packages/desktop/src-tauri` and `packages/desktop/target` entries from `.dockerignore`. Preserve generic build/output, IDE, data, and workspace ignores.

Preserve `release:prepare`, all root web development/build/test commands, the generic `packages/*` workspace glob, and the Docker runtime's `openssh-client`: browser/server Git SSH support is not the removed Electron SSH manager.

- [x] **Step 5: Regenerate and audit the Bun lockfile**

Run: `bun install`

Then run:

```bash
bun -e 'import fs from "node:fs"; const lock = fs.readFileSync("bun.lock", "utf8"); const keys = [...lock.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]); const forbidden = keys.filter((name) => name === "packages/electron" || name.includes("@openchamber/electron") || /(^|\/)(?:@electron\/|electron(?!-to-chromium)|app-builder-(?:bin|lib)|builder-util(?:-runtime)?|dmg-builder|dmg-license)/.test(name)); if (forbidden.length) throw new Error(`removed Electron dependencies remain: ${forbidden.join(", ")}`);'
rg -n '"electron-to-chromium"' bun.lock || true
```

Expected: install succeeds; the first command finds no removed workspace, `@electron/*` package, Electron-prefixed runtime/helper package (including `electron-dl` and `electron-is-dev`), builder, updater, signer, DMG, publisher, or installer entry. The optional second search may return surviving Browserslist compatibility data or no match; either result is acceptable and must not be treated as product residue.

- [x] **Step 6: Inspect the focused deletion diff**

Run:

```bash
git diff -- package.json scripts/bump-version.mjs scripts/test-release-build.sh Dockerfile .dockerignore bun.lock packages/electron
rg -n 'build:electron|type-check:electron|lint:electron|electron:(dev|build)|release:test|packages/electron|packages/desktop' package.json Dockerfile .dockerignore scripts/bump-version.mjs scripts
```

Expected: the diff contains only planned native product/integration removal and the search returns no active root/tooling references.

- [x] **Step 7: Verify the surviving dependency and build entrypoints**

Run:

```bash
bun install --frozen-lockfile
bun run type-check
bun run build
docker build --target builder -t openchamber-electron-removal-check .
```

Expected: frozen install, type-check, and root build pass; the build invokes only UI and web/PWA work. The Docker builder target should pass when Docker is available. If Docker is unavailable, record the exact environment error and require static Dockerfile review plus Docker-capable CI before release; do not report a Docker pass.

- [x] **Step 8: Commit the native workspace contraction**

```bash
git add -A -- package.json scripts/bump-version.mjs scripts/test-release-build.sh Dockerfile .dockerignore bun.lock packages/electron
git commit -m "refactor: remove electron desktop product"
```

### Task 2: Contract Release Automation To Web And Npm

**Files:**
- Delete: `.github/workflows/build-macos-arm64-dmg.yml` — obsolete manual Tauri/Electron DMG workflow
- Modify: `.github/workflows/release.yml` — native build/manifest jobs and final dependencies

- [x] **Step 1: Capture current release job ownership**

Run:

```bash
test -f .github/workflows/build-macos-arm64-dmg.yml
rg -n '^  [a-zA-Z0-9_-]+:|packages/(desktop|electron)|Tauri|Electron|tauri|electron-builder|latest-mac|\.dmg|\.tar\.gz\.sig' .github/workflows/release.yml .github/workflows/build-macos-arm64-dmg.yml
```

Expected: the manual workflow exists; release jobs include `create-release`, stale Tauri build/manifest jobs, `publish-npm`, Electron build/manifest jobs, and `finalize-release`.

- [x] **Step 2: Delete the obsolete manual native workflow**

Delete `.github/workflows/build-macos-arm64-dmg.yml` in full. Both jobs build removed native products, so no partial workflow remains.

- [x] **Step 3: Remove native jobs from the release workflow**

In `.github/workflows/release.yml`:

- remove the top-level native-only `CARGO_INCREMENTAL` and `RUST_BACKTRACE` environment block;
- preserve `create-release` unchanged;
- delete `build-desktop-macos` in full;
- preserve `publish-npm`, including frozen install, root build, npm tarball upload, and publish behavior;
- delete `combine-manifests` in full;
- delete `build-desktop-electron-macos` in full;
- delete `combine-electron-manifests` in full;
- set `finalize-release.needs` to `[create-release, publish-npm]`;
- preserve final release publication, Discord notification, and optional website refresh unchanged.

The resulting job graph must contain exactly `create-release`, `publish-npm`, and `finalize-release`.

- [x] **Step 4: Parse and assert the release workflow graph**

Run:

```bash
bun -e 'import fs from "node:fs"; import YAML from "yaml"; const workflow = YAML.parse(fs.readFileSync(".github/workflows/release.yml", "utf8")); const jobs = Object.keys(workflow.jobs).sort(); const expected = ["create-release", "finalize-release", "publish-npm"]; if (JSON.stringify(jobs) !== JSON.stringify(expected)) throw new Error(`unexpected jobs: ${jobs.join(",")}`); if (workflow.env?.CARGO_INCREMENTAL !== undefined || workflow.env?.RUST_BACKTRACE !== undefined) throw new Error("native release env remains"); const create = workflow.jobs["create-release"]; const publish = workflow.jobs["publish-npm"]; const finalize = workflow.jobs["finalize-release"]; if (publish.needs !== "create-release") throw new Error(`unexpected publish needs: ${JSON.stringify(publish.needs)}`); if (JSON.stringify(finalize.needs) !== JSON.stringify(["create-release", "publish-npm"])) throw new Error(`unexpected finalize needs: ${JSON.stringify(finalize.needs)}`); const step = (job, name) => { const found = job.steps.find((item) => item.name === name); if (!found) throw new Error(`missing step: ${name}`); return found; }; const changelog = step(create, "Extract changelog for release"); if (!String(changelog.run).includes("CHANGELOG.md") || !String(changelog.run).includes("artifacts/release-notes.md")) throw new Error("changelog extraction changed"); const draft = step(create, "Create GitHub Release"); if (draft.with?.draft !== true || draft.with?.body_path !== "artifacts/release-notes.md") throw new Error("draft release wiring changed"); if (step(publish, "Install dependencies").run !== "bun install --frozen-lockfile" || step(publish, "Build packages").run !== "bun run build") throw new Error("install/build commands changed"); const pack = step(publish, "Create npm tarball"); if (pack["working-directory"] !== "packages/web" || pack.run !== "npm pack") throw new Error("npm pack wiring changed"); const upload = step(publish, "Upload npm tarball to release"); if (upload.with?.files !== "packages/web/*.tgz") throw new Error("tarball upload wiring changed"); const npmPublish = step(publish, "Publish to npm"); if (!String(npmPublish.if).includes("dry_run") || npmPublish["working-directory"] !== "packages/web" || npmPublish.run !== "npm publish --access public" || !String(npmPublish.env?.NODE_AUTH_TOKEN).includes("NPM_TOKEN")) throw new Error("npm publish wiring changed"); const release = step(finalize, "Publish release"); if (release.with?.draft !== false) throw new Error("release publication changed"); const discord = step(finalize, "Send release to Discord"); if (!String(finalize.env?.DISCORD_WEBHOOK_URL).includes("DISCORD_WEBHOOK_URL") || !String(discord.if).includes("DISCORD_WEBHOOK_URL") || !String(discord.run).includes("fetch(process.env.DISCORD_WEBHOOK_URL")) throw new Error("Discord wiring changed"); const website = step(finalize, "Trigger openchamber-website site refresh (optional)"); if (!String(website.env?.WEBSITE_TOKEN).includes("OPENCHAMBER_WEBSITE_REPO_TOKEN") || !String(website.run).includes("/dispatches") || !String(website.run).includes("site_refresh_requested")) throw new Error("website refresh wiring changed");'
rg -n 'packages/(desktop|electron)|build-desktop|combine-(electron-)?manifests|Tauri|Electron|tauri|electron-builder|latest-mac|\.dmg|\.tar\.gz\.sig' .github/workflows/release.yml
test ! -e .github/workflows/build-macos-arm64-dmg.yml
```

Expected: YAML parsing, exact job/dependency assertions, native environment removal, changelog extraction paths, draft creation/body path, frozen install/build, npm pack/upload/publish commands and dry-run/token wiring, final publication, Discord webhook dispatch, and optional website refresh wiring all pass; the search returns no native artifact references; the standalone workflow is absent.

- [x] **Step 5: Inspect and commit the release contraction**

Run: `git diff -- .github/workflows/release.yml .github/workflows/build-macos-arm64-dmg.yml`

Expected: only native jobs/environment/dependencies are removed; npm publishing, release-note extraction, draft publication, Discord notification, and website refresh remain.

```bash
git add -A -- .github/workflows/release.yml .github/workflows/build-macos-arm64-dmg.yml
git commit -m "ci: remove native desktop releases"
```

### Task 3: Remove Active Native Desktop Guidance

**Files:**
- Modify: `README.md` — native product features, install instructions, details, and framework credit
- Modify: `AGENTS.md` — runtime map, architecture, placement, stack, entrypoint, and validation rows
- Modify: `CONTRIBUTING.md` — development instructions and package tree
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml` — runtime choices
- Modify: `tests/perf/README.md` — process-boundary guidance
- Modify: `.superpawers/OVERVIEW.md` — active validation status only

- [x] **Step 1: Capture active native product claims**

Run:

```bash
rg -n -i 'packages/electron|electron:|electron|tauri|desktop \(macos\)|desktop app|native macos|remote instances over ssh|ssh port forwarding' README.md AGENTS.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/bug_report.yml tests/perf/README.md
rg -n 'electron|vscode|bun run type-check|bun run lint' .superpawers/OVERVIEW.md
```

Expected: matches identify the active native product, engineering, contributor, issue, performance, and stale validation guidance being removed. Generic browser form-factor wording such as desktop browser widths is not a native product claim.

- [x] **Step 2: Update user-facing product guidance**

Apply these exact scope rules to `README.md`:

- delete the `Desktop (macOS)` feature section;
- remove native `Open In`, host switching, SSH Remote Instances, and SSH port-forwarding claims from the Custom Themes marketing list;
- delete the Desktop download subsection from Quick Start so CLI Web/PWA is the sole install path;
- delete the detailed `Desktop (macOS)` disclosure;
- remove the Tauri framework acknowledgment;
- preserve browser/PWA, CLI, systemd, Docker, ordinary Git-over-SSH, device-form-factor, historical, and protected-domain documentation.

Do not rewrite unrelated stale feature claims in this contraction unless they are native-shell claims.

- [x] **Step 3: Update engineering, contributor, issue, and test guidance**

Apply these target-state rules:

- `AGENTS.md` runtime map lists only Shared UI and Web app/server; remove the Electron architecture paragraph, desktop IPC placement, Electron stack/entrypoint, Electron dev/build rows, and removed native release-smoke command. Preserve all process-safety rules and web/server architecture guidance unchanged.
- `CONTRIBUTING.md` removes the Desktop (Electron) dev section and `packages/electron` package-tree entry.
- `.github/ISSUE_TEMPLATE/bug_report.yml` replaces native runtime choices with `Desktop browser (Web/PWA)`, `Mobile browser (Web/PWA)`, and `Not sure`.
- `tests/perf/README.md` keeps the process-boundary rule as `Keep mocks at process boundaries; do not import real OpenCode processes from perf tests.`
- `.superpawers/OVERVIEW.md` changes only the active validation status line so it no longer calls deleted runtimes clean; preserve historical references elsewhere.
- Root `CHANGELOG.md`, completed/superseded plans, and the active maintainability spec remain unchanged.

- [x] **Step 4: Audit and inspect active-documentation changes**

Run:

```bash
git diff -- README.md AGENTS.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/bug_report.yml tests/perf/README.md .superpawers/OVERVIEW.md
rg -n -i 'packages/electron|electron:|electron|tauri|desktop \(macos\)|desktop app|native macos|remote instances over ssh|ssh port forwarding' README.md AGENTS.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/bug_report.yml tests/perf/README.md
```

Expected: the search returns no active native product claims; the diff preserves browser/PWA and test-process guidance and does not alter historical records.

- [x] **Step 5: Validate docs and commit guidance changes**

Run:

```bash
bun run docs:validate
git diff --check
```

Expected: documentation validation and whitespace checks pass.

```bash
git add README.md AGENTS.md CONTRIBUTING.md .github/ISSUE_TEMPLATE/bug_report.yml tests/perf/README.md .superpawers/OVERVIEW.md
git commit -m "docs: remove native desktop guidance"
```

### Task 4: Verify And Close The Partial Product Plan

**Files:**
- Modify: `.superpawers/plans/2026-07-14-electron-product-surface-removal.md` — completion state and verification record

- [x] **Step 1: Run native product-surface absence checks**

Run:

```bash
test ! -e packages/electron
test ! -e scripts/test-release-build.sh
test ! -e .github/workflows/build-macos-arm64-dmg.yml
rg -n 'build:electron|type-check:electron|lint:electron|electron:(dev|build)|release:test|packages/electron|packages/desktop' package.json Dockerfile .dockerignore scripts .github/workflows/release.yml AGENTS.md CONTRIBUTING.md README.md
bun -e 'import fs from "node:fs"; const lock = fs.readFileSync("bun.lock", "utf8"); const keys = [...lock.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]); const forbidden = keys.filter((name) => name === "packages/electron" || name.includes("@openchamber/electron") || /(^|\/)(?:@electron\/|electron(?!-to-chromium)|app-builder-(?:bin|lib)|builder-util(?:-runtime)?|dmg-builder|dmg-license)/.test(name)); if (forbidden.length) throw new Error(`removed Electron dependencies remain: ${forbidden.join(", ")}`);'
rg -n '"electron-to-chromium"' bun.lock || true
```

Expected: all absence assertions pass; active product/tool searches and the lockfile rejection command find no native product or dependency residue. The optional final search may confirm retained generic browser compatibility data or return no match.

These checks intentionally exclude shared UI/server desktop compatibility code, root `CHANGELOG.md`, completed planning artifacts, the active spec/plan, browser device-form-factor language, ordinary Git SSH behavior, and `@tauri-apps/api`; those compatibility paths belong to the follow-up plan.

- [x] **Step 2: Verify release workflow structure**

Run:

```bash
bun -e 'import fs from "node:fs"; import YAML from "yaml"; const workflow = YAML.parse(fs.readFileSync(".github/workflows/release.yml", "utf8")); const jobs = Object.keys(workflow.jobs).sort(); const expected = ["create-release", "finalize-release", "publish-npm"]; if (JSON.stringify(jobs) !== JSON.stringify(expected)) throw new Error(`unexpected jobs: ${jobs.join(",")}`); if (workflow.env?.CARGO_INCREMENTAL !== undefined || workflow.env?.RUST_BACKTRACE !== undefined) throw new Error("native release env remains"); const create = workflow.jobs["create-release"]; const publish = workflow.jobs["publish-npm"]; const finalize = workflow.jobs["finalize-release"]; if (publish.needs !== "create-release") throw new Error(`unexpected publish needs: ${JSON.stringify(publish.needs)}`); if (JSON.stringify(finalize.needs) !== JSON.stringify(["create-release", "publish-npm"])) throw new Error(`unexpected finalize needs: ${JSON.stringify(finalize.needs)}`); const step = (job, name) => { const found = job.steps.find((item) => item.name === name); if (!found) throw new Error(`missing step: ${name}`); return found; }; const changelog = step(create, "Extract changelog for release"); if (!String(changelog.run).includes("CHANGELOG.md") || !String(changelog.run).includes("artifacts/release-notes.md")) throw new Error("changelog extraction changed"); const draft = step(create, "Create GitHub Release"); if (draft.with?.draft !== true || draft.with?.body_path !== "artifacts/release-notes.md") throw new Error("draft release wiring changed"); if (step(publish, "Install dependencies").run !== "bun install --frozen-lockfile" || step(publish, "Build packages").run !== "bun run build") throw new Error("install/build commands changed"); const pack = step(publish, "Create npm tarball"); if (pack["working-directory"] !== "packages/web" || pack.run !== "npm pack") throw new Error("npm pack wiring changed"); const upload = step(publish, "Upload npm tarball to release"); if (upload.with?.files !== "packages/web/*.tgz") throw new Error("tarball upload wiring changed"); const npmPublish = step(publish, "Publish to npm"); if (!String(npmPublish.if).includes("dry_run") || npmPublish["working-directory"] !== "packages/web" || npmPublish.run !== "npm publish --access public" || !String(npmPublish.env?.NODE_AUTH_TOKEN).includes("NPM_TOKEN")) throw new Error("npm publish wiring changed"); const release = step(finalize, "Publish release"); if (release.with?.draft !== false) throw new Error("release publication changed"); const discord = step(finalize, "Send release to Discord"); if (!String(finalize.env?.DISCORD_WEBHOOK_URL).includes("DISCORD_WEBHOOK_URL") || !String(discord.if).includes("DISCORD_WEBHOOK_URL") || !String(discord.run).includes("fetch(process.env.DISCORD_WEBHOOK_URL")) throw new Error("Discord wiring changed"); const website = step(finalize, "Trigger openchamber-website site refresh (optional)"); if (!String(website.env?.WEBSITE_TOKEN).includes("OPENCHAMBER_WEBSITE_REPO_TOKEN") || !String(website.run).includes("/dispatches") || !String(website.run).includes("site_refresh_requested")) throw new Error("website refresh wiring changed");'
rg -n 'packages/(desktop|electron)|build-desktop|combine-(electron-)?manifests|Tauri|Electron|tauri|electron-builder|latest-mac|\.dmg|\.tar\.gz\.sig' .github/workflows/release.yml
```

Expected: the complete release behavior assertion passes and the search returns no native release references.

- [x] **Step 3: Run maintained workspace checks**

Run:

```bash
bun install --frozen-lockfile
bun run type-check
bun run build
bun run test:react
bun run test:web
bun run docs:validate
scripts/verify.sh
```

Expected: frozen install, type-check, root UI/web build, React tests, web tests, and docs validation pass. `scripts/verify.sh` is expected to remain nonzero only because of inherited lint debt; its type-check and build phases must pass and no Electron workspace may run.

- [x] **Step 4: Compare lint against the inherited baseline**

Run: `bun run lint`

Expected: Electron is no longer a workspace. Compare every surviving workspace against the fresh Task 1 Step 2 output; no count may increase and no new lint category may appear. The latest verified reference before this plan is session-state 0 errors/5 warnings, web 379/237, tests 37/5, and UI 43/766.

- [x] **Step 5: Probe Docker and inspect repository state**

Run:

```bash
docker build --target builder -t openchamber-electron-removal-check .
git status --short
git diff --check
git log --oneline -5
```

Expected: Docker passes when available; otherwise record the exact missing-environment error and retain the Docker-capable CI follow-up. The worktree is clean before the tracking update, whitespace validation passes, and all three implementation commits are present.

- [x] **Step 6: Close only this partial plan**

Update this file's frontmatter to:

```yaml
status: complete
updated: 2026-07-14
next_action: "Write and execute the Electron shared UI and server runtime cleanup plan"
```

Mark all checkboxes complete and append a concise verification record with exact test/lint results and any Docker limitation. Do not change the parent spec's `electron-removal` status; it remains planned until the shared-runtime follow-up passes.

- [x] **Step 7: Check planning state and commit completion metadata**

Run:

```bash
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js plan .superpawers/plans/2026-07-14-electron-product-surface-removal.md
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js spec .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
```

Expected: this plan reports complete with all tasks checked; `electron-removal` remains planned and is partially covered by this plan.

```bash
git add .superpawers/plans/2026-07-14-electron-product-surface-removal.md
git commit -m "docs: complete electron product removal plan"
```

## Verification Record

- Product paths are absent; active root/tool/doc references and the lock audit are clean.
- Release workflow is exactly `create-release`, `publish-npm`, and `finalize-release`, with preserved behavior assertions.
- Frozen install passed: 1268 installs/1341 packages, with no changes.
- Type-check passed for all surviving workspaces/server; root build passed UI+web only.
- React: 59 passed. Web: 19 passed, 1 skipped. Docs: 7 pages/7 links.
- `scripts/verify.sh` exited 1 only due to inherited lint; type-check/build passed.
- Lint is exactly unchanged: session-state 0 errors/5 warnings; web 379/237; tests 37/5; UI 43/766.
- Docker unavailable exactly: `docker: command not found`; no Docker pass is claimed. Docker-capable CI is required before release.
- Worktree and `git diff --check` were clean before tracking.
