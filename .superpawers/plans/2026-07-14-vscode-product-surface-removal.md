---
kind: plan
status: complete
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - vscode-removal
coverage: partial
created: 2026-07-14
updated: 2026-07-14
next_action: "Write and execute the VS Code shared UI runtime cleanup plan"
---

# VS Code Product Surface Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the published VS Code extension product and every repository-level build, release, development, dependency, and active-documentation surface that exists only for it.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`

**Architecture:** Remove the extension workspace as one contraction, then make the root workspace describe and build only the remaining products. Preserve historical changelog entries and non-runtime editor concepts such as TextMate theme types, file icons, and "open in VS Code" application targets; shared UI runtime branches are intentionally removed by the immediately following plan.

**Tech Stack:** Bun workspaces and lockfile, TypeScript, Vite, Docker, GitHub Actions, Starlight documentation.

---

## Chunk Coverage

This plan covers the independently shippable first half of `vscode-removal`:

- delete `packages/vscode`, its bridge tests, extension assets, and package metadata;
- remove root build/dev/package/version/Docker/CI integration;
- remove active product and contributor documentation for the extension;
- regenerate the lockfile so extension-only dependencies are no longer owned by a workspace;
- prove the remaining web-focused workspace type-checks, builds, and validates its docs without invoking VS Code.

The chunk remains incomplete after this plan. A follow-up plan must remove VS Code-only runtime contracts, globals, branches, theme/layout code, CSS, mocks, and dead server update-scope handling from `packages/ui`, `packages/web`, and tests. Historical root `CHANGELOG.md` entries, Shiki's `@shikijs/vscode-textmate` dependency/name, file-type icons for `.vscode`, and "open in Visual Studio Code" application-launch targets are not extension compatibility surfaces and remain unless later dependency analysis shows they are unused.

The follow-up plan will be `.superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md`. It must include the remaining `appType === "vscode"` and scope normalization branches in `packages/web/server/src/domains/package-manager/package-manager.ts` alongside the UI/runtime cleanup.

## File Structure

- Delete `packages/vscode/` in full: the extension host, webview, duplicated Git/quota/filesystem/OpenCode implementations, bridge tests, package metadata, assets, and generated local outputs all belong to the removed product.
- Delete `.github/workflows/vscode-extension.yml`: extension Marketplace/Open VSX publishing has no surviving artifact.
- Delete `scripts/dev-vscode.mjs`: the extension development-host launcher has no surviving caller.
- Modify `package.json`: root build stops after the remaining product builds; extension scripts disappear.
- Modify `scripts/bump-version.mjs`: version updates target only surviving package manifests.
- Modify `Dockerfile`: dependency-layer setup stops copying the removed manifest.
- Regenerate `bun.lock`: Bun removes the workspace entry and dependencies no longer reachable from surviving workspaces.
- Modify `AGENTS.md`, `CONTRIBUTING.md`, and `README.md`: runtime maps, entrypoints, validation commands, setup, and product claims describe only active products.
- Modify `.github/ISSUE_TEMPLATE/bug_report.yml`: runtime choices no longer offer the deleted extension.
- Modify `packages/docs/content/docs/index.mdx`, `install.mdx`, `quickstart.mdx`, and `troubleshooting.mdx`: user documentation no longer advertises or troubleshoots the deleted extension.
- Modify `tests/perf/README.md`: performance-test boundary guidance stops naming the deleted runtime.
- Do not modify root `CHANGELOG.md` or old completed planning artifacts: those are historical records, not active product documentation.

### Task 1: Remove The Extension Workspace And Repository Integration

**Files:**
- Delete: `packages/vscode/` — the complete VS Code extension workspace and all files beneath it
- Delete: `.github/workflows/vscode-extension.yml` — Marketplace and Open VSX release workflow
- Delete: `scripts/dev-vscode.mjs` — Extension Development Host launcher
- Modify: `package.json` — root `build` script and `vscode:*` scripts
- Modify: `scripts/bump-version.mjs` — `PACKAGES` manifest list
- Modify: `Dockerfile` — dependency manifest copy layer
- Regenerate: `bun.lock` — workspace and transitive dependency graph

- [x] **Step 1: Record the removal contract before deleting files**

Run:

```bash
test -d packages/vscode
test -f .github/workflows/vscode-extension.yml
test -f scripts/dev-vscode.mjs
rg -n 'vscode:(dev|build|package|type-check)|packages/vscode' package.json Dockerfile scripts/bump-version.mjs .github/workflows
```

Expected: all three removed surfaces exist and the search reports the root build/script, Docker, versioning, and workflow references this task will eliminate.

- [x] **Step 2: Delete the extension-owned files**

Delete `packages/vscode/`, `.github/workflows/vscode-extension.yml`, and `scripts/dev-vscode.mjs` in full. Do not preserve bridge interfaces, copied Git/quota implementations, source tests, extension changelog, screenshots, icons, VSIX metadata, or generated `dist` output elsewhere.

- [x] **Step 3: Simplify surviving repository integration**

Apply these anchored target states:

```jsonc
// package.json, scripts
{
  "scripts": {
    // ... existing scripts ...
    "build": "bun run build:ui && bun run build:web && bun run build:electron"
    // remove vscode:dev, vscode:build, vscode:package, vscode:type-check
    // ... existing scripts ...
  }
}
```

```js
// scripts/bump-version.mjs, PACKAGES
const PACKAGES = [
  'package.json',
  // ... surviving package manifests in their existing order ...
  // no packages/vscode/package.json
];
```

```dockerfile
# Dockerfile, dependency manifest COPY block
COPY package.json bun.lock ./
COPY packages/session-state/package.json ./packages/session-state/
COPY packages/ui/package.json ./packages/ui/
COPY packages/web/package.json ./packages/web/
COPY packages/electron/package.json ./packages/electron/
COPY tests/package.json ./tests/
# no packages/vscode/package.json
```

This intentionally corrects the pre-existing stale `packages/desktop/package.json` copy to the current `packages/electron/package.json` while editing the same dependency manifest block. Do not remove the generic `.vscode/` IDE-settings ignores, Shiki/TextMate dependencies, quota-provider HTTP compatibility headers, or application targets that launch Visual Studio Code.

- [x] **Step 4: Regenerate the Bun lockfile**

Run: `bun install`

Expected: install succeeds; `bun.lock` no longer contains the `packages/vscode` workspace entry, `openchamber@workspace:packages/vscode`, `@types/vscode`, `@vscode/vsce`, or `@vscode/vsce-sign` entries. Dependencies still required by surviving workspaces remain even if their package names contain `vscode`; specifically, Shiki's `@shikijs/vscode-textmate` remains.

- [x] **Step 5: Inspect the focused diff and generated lockfile**

Run:

```bash
git diff -- package.json scripts/bump-version.mjs Dockerfile bun.lock .github/workflows/vscode-extension.yml scripts/dev-vscode.mjs packages/vscode
rg -n 'packages/vscode|openchamber@workspace:packages/vscode|vscode:(dev|build|package|type-check)|"@types/vscode"|"@vscode/vsce' package.json Dockerfile scripts bun.lock .github/workflows
rg -n '"@shikijs/vscode-textmate"' bun.lock
```

Expected: the diff contains only the planned deletion/integration changes; the first search returns no extension workspace, command, or extension-only dependency references; the second search confirms the surviving Shiki/TextMate dependency.

- [x] **Step 6: Verify dependency and build entrypoint integrity**

Run:

```bash
bun install --frozen-lockfile
bun run type-check
bun run build
docker build --target builder -t openchamber-vscode-removal-check .
```

Expected: frozen install, root type-check, root build, and the Docker builder target pass; neither build starts an extension or webview build.

- [x] **Step 7: Commit the product deletion**

```bash
git add -A -- package.json scripts/bump-version.mjs Dockerfile bun.lock .github/workflows/vscode-extension.yml scripts/dev-vscode.mjs packages/vscode
git commit -m "refactor: remove vscode extension product"
```

### Task 2: Remove Active VS Code Product Documentation

**Files:**
- Modify: `AGENTS.md` — runtime map, code-placement guidance, entrypoints, and validation table
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml` — supported runtime dropdown
- Modify: `CONTRIBUTING.md` — development instructions and package tree
- Modify: `README.md` — screenshot, feature description, install instructions, and product details
- Modify: `packages/docs/content/docs/index.mdx` — documentation scope description
- Modify: `packages/docs/content/docs/install.mdx` — supported install targets
- Modify: `packages/docs/content/docs/quickstart.mdx` — supported first-run choices
- Modify: `packages/docs/content/docs/troubleshooting.mdx` — active troubleshooting topics
- Modify: `tests/perf/README.md` — active performance-test boundary guidance

- [x] **Step 1: Capture active documentation references**

Run:

```bash
rg -n -i 'packages/vscode|vs[[:space:]-]?code|visual studio code|vscode:|extension webview' AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs tests/perf/README.md .github/ISSUE_TEMPLATE/bug_report.yml
```

Expected: matches identify only active extension product claims and commands that this task will remove.

- [x] **Step 2: Update engineering and contributor documentation**

Apply these target-state rules:

- `AGENTS.md` runtime map lists shared UI, web app/server, and Electron only at this intermediate stage; remove VS Code bridge placement, extension/webview entrypoints, the cross-runtime parity claim that names VS Code, and `vscode:build` validation rows.
- `CONTRIBUTING.md` removes the VS Code Extension development section and `packages/vscode/` package-tree entry without rewriting unrelated setup instructions.
- Do not add a compatibility note or hypothetical future-extension guidance here; the durable spec already establishes network contracts as the only future integration point.

- [x] **Step 3: Update user-facing product documentation**

Apply these target-state rules:

- `README.md` removes the extension screenshot, feature section, Marketplace install subsection, and extension details disclosure while preserving web/PWA and currently surviving Electron instructions.
- `packages/docs/content/docs/index.mdx` describes the currently surviving web and desktop surfaces only.
- `packages/docs/content/docs/install.mdx` removes the extension from its description, option list, and install section.
- `packages/docs/content/docs/quickstart.mdx` removes editor-native VS Code as a product choice.
- `packages/docs/content/docs/troubleshooting.mdx` removes extension connection troubleshooting.
- `tests/perf/README.md` keeps its process-boundary rule but no longer names VS Code as a runtime that could be imported.
- `.github/ISSUE_TEMPLATE/bug_report.yml` removes `VS Code extension` from the runtime dropdown while preserving the remaining choices.
- `scripts/convert-vscode-theme.cjs` remains unchanged: it is an offline importer for third-party theme JSON, not an extension runtime or compatibility facade.
- Preserve root `CHANGELOG.md` unchanged because prior extension releases are historical facts.

- [x] **Step 4: Inspect the documentation diff**

Run:

```bash
git diff -- AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs/index.mdx packages/docs/content/docs/install.mdx packages/docs/content/docs/quickstart.mdx packages/docs/content/docs/troubleshooting.mdx tests/perf/README.md .github/ISSUE_TEMPLATE/bug_report.yml
rg -n -i 'packages/vscode|vs[[:space:]-]?code|visual studio code|vscode:|extension webview' AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs tests/perf/README.md .github/ISSUE_TEMPLATE/bug_report.yml
```

Expected: active product references return zero matches and the diff does not alter unrelated product claims or historical changelog entries.

- [x] **Step 5: Validate the documentation site**

Run: `bun run docs:validate`

Expected: documentation frontmatter and internal navigation validation pass.

- [x] **Step 6: Commit the documentation contraction**

```bash
git add AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs/index.mdx packages/docs/content/docs/install.mdx packages/docs/content/docs/quickstart.mdx packages/docs/content/docs/troubleshooting.mdx tests/perf/README.md .github/ISSUE_TEMPLATE/bug_report.yml
git commit -m "docs: remove vscode extension guidance"
```

### Task 3: Verify The Intermediate Web-Focused Workspace

**Files:**
- Modify: `.superpawers/plans/2026-07-14-vscode-product-surface-removal.md` — task completion and handoff status

- [x] **Step 1: Run extension-surface absence checks**

Run:

```bash
test ! -e packages/vscode
test ! -e .github/workflows/vscode-extension.yml
test ! -e scripts/dev-vscode.mjs
rg -n 'packages/vscode|openchamber@workspace:packages/vscode|vscode:(dev|build|package|type-check)|"@types/vscode"|"@vscode/vsce' package.json Dockerfile scripts bun.lock .github/workflows AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs
rg -n -i 'vs[[:space:]-]?code|visual studio code|vscode:|extension webview' AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs tests/perf/README.md .github/ISSUE_TEMPLATE/bug_report.yml
rg -n '"@shikijs/vscode-textmate"' bun.lock
```

Expected: all absence assertions pass; the first two searches return no matches; the final search confirms the retained Shiki/TextMate dependency. These searches intentionally exclude root `CHANGELOG.md`, old completed planning artifacts, generic `.vscode` editor configuration, `scripts/convert-vscode-theme.cjs`, quota-provider protocol headers, file-type icons, and application-launch targets.

- [x] **Step 2: Run maintained root checks affected by this plan**

Run:

```bash
bun install --frozen-lockfile
bun run type-check
bun run build
bun run docs:validate
docker build --target builder -t openchamber-vscode-removal-check .
```

Expected: every command passes and no command invokes a VS Code extension or webview build. Do not claim root lint is clean: the approved spec records inherited lint debt for later chunks.

- [x] **Step 3: Run lint against the recorded inherited baseline**

Run: `bun run lint`

Expected: exit non-zero with the same inherited findings recorded before this plan for surviving workspaces: web 379 errors/237 warnings, tests 40 errors/5 warnings, UI 44 errors/787 warnings, session-state 0 errors/5 warnings, and Electron 0 findings. The removed VS Code workspace's 113 warnings disappear, and no new finding appears. Save the exact output for the verifier; any changed surviving-workspace count must be investigated before continuing.

- [x] **Step 4: Inspect repository state**

Run:

```bash
git status --short
git diff --check
git log --oneline -5
```

Expected: only this plan's tracking update remains uncommitted; whitespace validation passes; the two implementation commits are present.

- [x] **Step 5: Close this partial plan and identify the next action**

Update this file's frontmatter to:

```yaml
status: complete
updated: 2026-07-14
next_action: "Write and execute the VS Code shared UI runtime cleanup plan"
```

Mark all task checkboxes complete. Do not mark the parent spec's `vscode-removal` chunk complete; its shared UI/runtime cleanup remains.

- [x] **Step 6: Commit plan completion metadata**

```bash
git add .superpawers/plans/2026-07-14-vscode-product-surface-removal.md
git commit -m "docs: complete vscode product removal plan"
```

## Verification Record

- Extension workspace, workflow, and development script are absent; no active extension workspace/script/lockfile/documentation references remain. Shiki TextMate is retained.
- `bun install --frozen-lockfile`, `bun run type-check` for all surviving workspaces/server, `bun run build` (with no VS Code/webview build), and `bun run docs:validate` passed; docs validation covered 7 pages and 7 links.
- `bun run lint` exited 1 with the exact inherited surviving counts: web 379 errors/237 warnings; tests 40/5; UI 44/787; session-state 0/5; Electron 0. The removed VS Code 113 warnings are absent and no new findings were introduced.
- `git diff --check` passed. Implementation commits were `153f5ebe`, `a1338c6c`, and `76692599`.
- Docker verification was explicitly probed but unavailable because `docker: command not found`; Dockerfile static review was completed and approved. This remains an environment-limited residual verification item for Docker-capable CI, not a pass.
- The parent spec `vscode-removal` chunk remains planned/incomplete until `.superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md` is executed.
