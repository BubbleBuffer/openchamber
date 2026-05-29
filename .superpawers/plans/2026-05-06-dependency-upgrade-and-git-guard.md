# Dependency Upgrade + Git Repo Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade all OpenChamber dependencies to latest versions and add a git repo guard to the `/api/git/branches` endpoint.

**Architecture:** Two independent workstreams: (1) phased dependency upgrade with per-phase verification, (2) targeted route-level guard matching the existing `/api/git/status` pattern.

**Tech Stack:** Bun, npm registry, simple-git, Express 5

---

## File Structure

| File | Change |
|------|--------|
| `package.json` | Bump all dependency versions |
| `packages/ui/package.json` | Bump all dependency versions |
| `packages/web/package.json` | Bump all dependency versions |
| `packages/electron/package.json` | Bump all dependency versions |
| `packages/vscode/package.json` | Bump all dependency versions |
| `packages/web/server/lib/git/routes.js` | Add repo guard to `/api/git/branches` |

---

## Workstream 1: Dependency Upgrade

### Strategy

Upgrade in phases to isolate breakage:

1. **Phase 1 — Safe minors/patches**: Everything except known-breaking majors
2. **Phase 2 — Verify**: `bun install`, `bun run type-check`, `bun run lint`, `bun run build`
3. **Phase 3 — Pinned overrides**: Review pinned versions for newer releases
4. **Phase 4 — Final verification**: Full build + dev smoke test

### Task 1: Phase 1 — Upgrade safe dependencies

**Files:**
- Modify: `package.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/web/package.json`
- Modify: `packages/electron/package.json`
- Modify: `packages/vscode/package.json`

Run the following command to upgrade all deps that use `^` or `~` ranges (these accept any newer minor/patch):

```bash
bun update
```

This updates within semver ranges already declared. For packages where we want to bump the _range floor_ to the actual latest, run:

```bash
bunx npm-check-updates -u --target minor
```

Review the diff. Manually revert any changes to:
- `@codemirror/language` (pinned `6.12.2`) — do not change
- `@codemirror/view` (pinned `6.39.13`) — do not change
- `ghostty-web` (pinned `0.3.0` in root/web) — do not change unless confirmed compatible
- `node-pty` (pinned `1.2.0-beta.12`) — do not change
- `@pierre/diffs` (pinned `1.1.0-beta.13`) — do not change
- `@simplewebauthn/browser` and `@simplewebauthn/server` (pinned `13.3.0`) — do not change
- `typescript` (pinned `~5.8.3`) — do not change to 6.x

- [ ] **Step 1: Run `bun update`**

```bash
cd /home/breadcat/Projects/openchamber && bun update
```

Expected: Updated lockfile, packages upgraded within their ranges.

- [ ] **Step 2: Run `bunx npm-check-updates -u --target minor` to bump range floors**

```bash
cd /home/breadcat/Projects/openchamber && bunx npm-check-updates -u --target minor
```

Expected: `package.json` files updated with newer minimum versions.

- [ ] **Step 3: Review and revert pinned overrides**

Check the diff and revert any changes to pinned packages listed above:

```bash
git diff -- package.json packages/*/package.json
```

Manually restore pinned versions if npm-check-updates touched them.

- [ ] **Step 4: Run `bun install`**

```bash
bun install
```

Expected: Clean install with updated resolutions.

- [ ] **Step 5: Verify type-check**

```bash
bun run type-check
```

Expected: PASS (0 errors)

- [ ] **Step 6: Verify lint**

```bash
bun run lint
```

Expected: PASS (0 errors)

- [ ] **Step 7: Verify build**

```bash
bun run build
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add package.json packages/*/package.json bun.lock
git commit -m "chore: upgrade safe dependencies (minor/patch)"
```

### Task 2: Phase 2 — Upgrade Sentry SDK

The `util.getSystemErrorMap` error (JAVASCRIPT-REACT-2, 15 events) is caused by `@sentry/node-core@10.51.0` incompatibility with the runtime. Upgrading may resolve it.

**Files:**
- Modify: `packages/ui/package.json` (has `@sentry/react`)
- Modify: `packages/web/package.json` (has `@sentry/node`, `@sentry/vite-plugin`)

- [ ] **Step 1: Check latest Sentry versions**

```bash
bunx npm-check-updates -f "@sentry/*" -u --target latest
```

- [ ] **Step 2: Run `bun install`**

```bash
bun install
```

- [ ] **Step 3: Verify type-check**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 4: Verify build**

```bash
bun run build
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/web/package.json bun.lock
git commit -m "chore: upgrade @sentry packages to latest"
```

### Task 3: Phase 3 — Upgrade pinned dependencies (investigate)

Some pinned versions may have newer stable releases. Investigate each one.

- [ ] **Step 1: Check ghostty-web**

```bash
npm view ghostty-web versions --json 2>/dev/null | tail -5
```

If `0.4.0+` exists and is stable, update `packages/ui/package.json` from `0.4.0` range (it already uses `^0.4.0` there). Root `package.json` still has `0.3.0` pinned — update to match if compatible.

- [ ] **Step 2: Check @simplewebauthn**

```bash
npm view @simplewebauthn/browser version && npm view @simplewebauthn/server version
```

If `>13.3.0`, test upgrade. These were pinned for API compatibility — check changelogs for breaking changes first.

- [ ] **Step 3: Check @pierre/diffs**

```bash
npm view @pierre/diffs version
```

If a stable (non-beta) release exists, upgrade.

- [ ] **Step 4: Run verification**

```bash
bun install && bun run type-check && bun run lint && bun run build
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add package.json packages/*/package.json bun.lock
git commit -m "chore: upgrade previously-pinned dependencies"
```

### Task 4: Phase 4 — Upgrade Bun and tooling

- [ ] **Step 1: Check latest Bun version**

```bash
curl -fsSL https://bun.sh/versions | head -5
```

Current: `bun@1.3.5` in `packageManager`. If newer stable available, update.

- [ ] **Step 2: Update packageManager field if newer**

Edit `package.json` `packageManager` field to new version if applicable.

- [ ] **Step 3: Run `bun install`**

```bash
bun install
```

- [ ] **Step 4: Final full verification**

```bash
bun run type-check && bun run lint && bun run build
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: update Bun version"
```

---

## Workstream 2: Git Repo Guard

### Task 5: Add repo guard to `/api/git/branches` route

**Files:**
- Modify: `packages/web/server/lib/git/routes.js:560-574`

The `/api/git/status` endpoint already has the correct pattern — an upfront `isGitRepository()` check that returns a clean empty response for non-git directories. Apply the same pattern to `/api/git/branches`.

Current code at `routes.js:560-574`:

```javascript
app.get('/api/git/branches', async (req, res) => {
    const { getBranches } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const branches = await getBranches(directory);
      res.json(branches);
    } catch (error) {
      console.error('Failed to get branches:', error);
      res.status(500).json({ error: error.message || 'Failed to get branches' });
    }
});
```

- [ ] **Step 1: Write the test**

Create or add to the existing test file for git routes. Check existing test patterns in `packages/web/`:

```bash
find packages/web -name "*.test.*" -o -name "*.spec.*" | head -10
```

The test should verify that when `isGitRepository` returns `false`, the `/api/git/branches` endpoint returns an empty branches response (200) instead of a 500 error.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/` or the project's test command
Expected: FAIL — the endpoint currently returns 500 for non-git directories.

- [ ] **Step 3: Implement the guard**

Change `routes.js:560-574` to:

```javascript
app.get('/api/git/branches', async (req, res) => {
    const { getBranches, isGitRepository } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const isRepo = await isGitRepository(directory);
      if (!isRepo) {
        return res.json({ all: [], current: null, branches: {} });
      }

      const branches = await getBranches(directory);
      res.json(branches);
    } catch (error) {
      console.error('Failed to get branches:', error);
      res.status(500).json({ error: error.message || 'Failed to get branches' });
    }
});
```

Key changes:
1. Add `isGitRepository` to the destructured imports from `getGitLibraries()`
2. Add the `isRepo` check before calling `getBranches()`
3. Return `{ all: [], current: null, branches: {} }` matching the shape `getBranches` would return

This matches the exact pattern used in `/api/git/status` at `routes.js:188-223`.

- [ ] **Step 4: Add secondary catch guard**

Also add a regex catch in the catch block (defense-in-depth, matching `/api/git/status` pattern):

```javascript
    } catch (error) {
      const errorText = extractGitErrorText(error);
      if (/not a git repository/i.test(errorText)) {
        return res.json({ all: [], current: null, branches: {} });
      }
      console.error('Failed to get branches:', error);
      res.status(500).json({ error: error.message || 'Failed to get branches' });
    }
```

Check if `extractGitErrorText` is already imported in the route scope. If not, add it to the destructured imports.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test packages/web/`
Expected: PASS

- [ ] **Step 6: Verify type-check and lint**

```bash
bun run type-check && bun run lint
```

Expected: Both PASS

- [ ] **Step 7: Commit**

```bash
git add packages/web/server/lib/git/routes.js
git commit -m "fix: add git repo guard to /api/git/branches endpoint

Matches the pattern used by /api/git/status: check isGitRepository()
before calling getBranches(), with a secondary regex catch for
'not a git repository' errors.

Fixes JAVASCRIPT-REACT-9"
```

---

## Summary

| Task | Description | Risk |
|------|-------------|------|
| 1 | Safe minor/patch upgrades | Low — semver-compatible |
| 2 | Sentry SDK upgrade | Medium — may fix `getSystemErrorMap` issue |
| 3 | Pinned dependency review | Medium — needs per-package investigation |
| 4 | Bun and tooling upgrade | Low — backward-compatible |
| 5 | Git repo guard | Low — matches existing proven pattern |
