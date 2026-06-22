# JS-to-TS Port Typing Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden TypeScript typing across all JS→TS ported domains — fix critical runtime bugs, eliminate `any` leakage, add proper type annotations, and validate external data at boundaries.

**Architecture:** Work is organized in 8 phases by risk priority and domain. Phase 1 fixes two runtime-crashing bugs. Phase 2 fixes behavioral regressions introduced during port. Phases 3-5 address the three largest domains (git, github, quota) with systematic typing fixes. Phases 6-8 clean up services, routes, and skills-catalog.

**Tech Stack:** TypeScript with `strict: true`, `verbatimModuleSyntax`. `simple-git`, `@octokit/rest`, Express.

---

## Phase 1: Critical Runtime Bugs

### Task 1.1: Fix `createHash("uuid")` crash in package-manager.ts

**Files:**
- Modify: `packages/web/server/src/domains/package-manager/package-manager.ts` — replace `getOrCreateInstallId` with original logic

- [ ] **Step 1: Replace broken `getOrCreateInstallId` function (lines 48-66)**

Target state for the function:
```typescript
function getOrCreateInstallId(scope = "web"): string {
  const configDir = getOpenChamberConfigDir();
  const normalizedScope = sanitizeInstallScope(scope);
  const idPath = path.join(configDir, `install-id-${normalizedScope}`);

  try {
    const existing = readFileSync(idPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // Generate new id.
  }

  const installId = crypto.randomUUID();
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(idPath, `${installId}\n`, { encoding: "utf8", mode: 0o600 });
  return installId;
}
```

Anchor: `function getOrCreateInstallId` at line 48, replace entire function body through line 66.

- [ ] **Step 2: Fix imports** — remove `createHash` from line 2 import, add `crypto` import

Target state (lines 1-2):
```typescript
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
```

- [ ] **Step 3: Verify fix**

```bash
bun run type-check
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/package-manager/package-manager.ts
git commit -m "fix(package-manager): restore crypto.randomUUID() in getOrCreateInstallId"
```

### Task 1.2: Fix `require('child_process')` in ESM context

**Files:**
- Modify: `packages/web/server/src/domains/routes/openchamber-routes.ts` — replace `require()` with `await import()`

- [ ] **Step 1: Replace `require('child_process')` on line 63**

Target state (lines 62-63):
```typescript
      const { spawn: spawnChild } = await import("node:child_process");
```

Remove the `eslint-disable-next-line @typescript-eslint/no-var-requires` comment on line 62. Use the `node:` prefix for import.

- [ ] **Step 2: Verify fix**

```bash
bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/routes/openchamber-routes.ts
git commit -m "fix(routes): replace require() with await import() in ESM context"
```

---

## Phase 2: Behavioral Regressions

### Task 2.1: Fix `oauth: false` behavioral regression in mcp.ts

**Files:**
- Modify: `packages/web/server/src/domains/opencode/services/types.ts` — widen `McpEntry.oauth` type
- Modify: `packages/web/server/src/domains/opencode/services/mcp.ts` — restore original assignment

- [ ] **Step 1: Widen `McpEntry.oauth` type in types.ts**

Find the `McpEntry` interface (anchor: `export interface McpEntry`) and its `oauth` field at ~line 132. Target state:
```typescript
oauth?: false | {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
};
```

- [ ] **Step 2: Fix `buildMcpEntry` at line 265 in mcp.ts**

Target state for line 265:
```typescript
      entry.oauth = false;
```

Remove the `as unknown as McpEntry["oauth"]` cast wrapping.

- [ ] **Step 3: Verify fix**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/opencode/services/types.ts packages/web/server/src/domains/opencode/services/mcp.ts
git commit -m "fix(mcp): restore oauth: false behavior, widen McpEntry.oauth type"
```

### Task 2.2: Export `isPlainObject` from shared.ts, deduplicate in providers.ts

**Files:**
- Modify: `packages/web/server/src/domains/opencode/services/shared.ts` — add `export` keyword
- Modify: `packages/web/server/src/domains/opencode/services/providers.ts` — import instead of redefining

- [ ] **Step 1: Add `export` to `isPlainObject` in shared.ts line 174**

Target state:
```typescript
export function isPlainObject(value: unknown): value is Record<string, unknown> {
```

- [ ] **Step 2: In providers.ts, remove local `isPlainObjectCheck` and import from shared.ts**

Find the local `isPlainObjectCheck` definition (around line 10 in providers.ts). Remove it. Add `isPlainObject` to the existing import from `./shared.js`.

- [ ] **Step 3: Verify fix**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/opencode/services/shared.ts packages/web/server/src/domains/opencode/services/providers.ts
git commit -m "fix(services): export isPlainObject, deduplicate in providers.ts"
```

### Task 2.3: Fix `registerGitRoutes(app, {})` calling convention

**Files:**
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts` — match original call style

- [ ] **Step 1: Change `registerGitRoutes(app, {})` to `registerGitRoutes(app)` on line 197**

If the TypeScript type for `registerGitRoutes` requires a second parameter, make that parameter optional in the function's own signature (in the git routes file) instead of passing an empty object.

Check what `registerGitRoutes` signature looks like:

```bash
grep -n "export.*function registerGitRoutes\|registerGitRoutes.*(" packages/web/server/src/domains/github/routes.ts
```

If it has a required second param, make it optional (`deps?: GitRoutesDeps`). Then:
```typescript
registerGitRoutes(app);
```

- [ ] **Step 2: Verify fix**

```bash
bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/routes/feature-routes-runtime.ts
# also add github routes if modified
git commit -m "fix(routes): restore registerGitRoutes calling convention"
```

---

## Phase 3: Git Domain — `service.ts` Typing

**Execution order:** 3.1 → 3.2 (catch blocks, mechanical) → 3.3 (internal helpers, foundation) → 3.4 → 3.5 → 3.6 (exported functions, layered on typed helpers).

### Task 3.1: Remove `as any` from `createGit` and type it properly

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — lines 331-349

- [ ] **Step 1: Type the `simpleGit()` options object and remove `as any`**

The issue is that `unsafe` and `spawnOptions` properties don't match `simple-git` types. The fix uses a typed options object:

Target state (replace lines 331-349):
```typescript
const createGit = async (directory?: string): Promise<SimpleGit> => {
  const env = await buildGitEnv();
  const spawnOptions: Record<string, unknown> = { windowsHide: true };
  const binary = getGitBinary();
  const hasCustomBinary = typeof binary === "string" && binary.trim() && binary !== "git" && binary !== "git.exe";

  const options: Parameters<typeof simpleGit>[0] = {
    binary: binary || undefined,
    ...(hasCustomBinary ? { unsafe: { allowUnsafeCustomBinary: true } } : {}),
  };

  if (!directory) {
    return simpleGit({ ...options });
  }

  return simpleGit({
    ...options,
    baseDir: normalizeDirectoryPath(directory),
  });
};
```

Remove both `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments.

- [ ] **Step 2: Update all internal helpers that accept `git` parameter**

Search for all internal (non-exported) functions that take a `git` parameter typed `any`. Type them as `SimpleGit`:

```typescript
// Replace patterns like:
// function resolveDefaultBranch(git: any) { ... }
// With:
function resolveDefaultBranch(git: SimpleGit): Promise<string | null> { ... }
```

Internal helpers using `git: any`:
- `resolveDefaultBranch` (~line 51)
- `getBranchDiff` (~line 80 area — verify exact name/location)
- Any others found with grep `git: any`

- [ ] **Step 3: Verify fix**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): remove as any from createGit, type SimpleGit params"
```

### Task 3.4: Type exported function parameters in service.ts (batch 1 — first 15 functions)

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — lines 1154-2220

**Constraint:** This is a large file. Work incrementally — type one function, verify, move to next.

- [ ] **Step 1: Type functions 1-15**

Apply these type annotations to exported functions. Replace `any` with the appropriate type from `types.ts`:

| Function | Parameter changes | Return type |
|----------|------------------|-------------|
| `isGitRepository` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `getGlobalIdentity` | — (no params) | `Promise<GitIdentity \| null>` |
| `getRemoteUrl` | `directory: any` → `directory: string`, `remoteName: any` → `remoteName: string` | `Promise<string \| null>` |
| `getCurrentIdentity` | `directory: any` → `directory: string` | `Promise<GitIdentity \| null>` |
| `hasLocalIdentity` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `setLocalIdentity` | `directory: any` → `directory: string`, parameterize the identity param | `Promise<boolean>` |
| `getStatus` | `directory: any` → `directory: string`, `options: any` → `options: GitStatusOptions` | `Promise<GitStatusResult>` |
| `getDiff` | `directory: any` → `directory: string`, options → `GitDiffOptions` | `Promise<string>` |
| `getRangeDiff` | `directory: any` → `directory: string`, options → `GitRangeDiffOptions` | `Promise<string>` |
| `getRangeFiles` | `directory: any` → `directory: string`, options → `GitRangeDiffOptions` | `Promise<string[]>` |
| `getFileDiff` | `directory: any` → `directory: string`, options → `{ path: string; staged?: boolean; contextLines?: number }` | `Promise<GitFileDiffResult>` |
| `revertFile` | `directory: any` → `directory: string`, options → `{ path: string; staged?: boolean }` | `Promise<void>` |
| `collectDiffs` | `directory: any` → `directory: string`, `files: any` → `files: string[]` | `Promise<Array<{path: string; diff: string}>>` |
| `pull` | `directory: any` → `directory: string`, `options: any` → `options: GitPullOptions` | `Promise<boolean>` |
| `push` | `directory: any` → `directory: string`, `options: any` → `options: GitPushOptions` | `Promise<boolean>` |

After typing, check each function body for internal casts referencing the parameters. Remove `as any` casts that are no longer needed (e.g., `directory` no longer needs `as string` if typed `string`).

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): type exported function params (batch 1, 15 functions)"
```

### Task 3.5: Type exported function parameters in service.ts (batch 2 — functions 16-30)

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — lines 2048-2852

- [ ] **Step 1: Type functions 16-30**

| Function | Parameter changes | Return type |
|----------|------------------|-------------|
| `deleteRemoteBranch` | `directory: any` → `directory: string`, options | `Promise<boolean>` |
| `fetch` | `directory: any` → `directory: string`, `options: any` → `options: GitFetchOptions` | `Promise<boolean>` |
| `commit` | `directory: any` → `directory: string`, `message: any` → `message: string`, `options: any` → `options: GitCommitOptions` | `Promise<boolean>` |
| `getBranches` | `directory: any` → `directory: string` | `Promise<GitBranchResult>` |
| `createBranch` | `directory: any` → `directory: string`, `branch: any` → `branch: string`, options | `Promise<boolean>` |
| `checkoutBranch` | `directory: any` → `directory: string`, `branch: any` → `branch: string` | `Promise<boolean>` |
| `getWorktrees` | `directory: any` → `directory: string` | `Promise<GitWorktreeEntry[]>` |
| `validateWorktreeCreate` | `directory: any` → `directory: string`, `input: any` → `input: GitWorktreeCreateInput` | `Promise<GitWorktreeValidateResult>` |
| `previewWorktreeCreate` | `directory: any` → `directory: string`, `input: any` → `input: GitWorktreeCreateInput` | `Promise<GitWorktreePreviewResult>` |
| `createWorktree` | `directory: any` → `directory: string`, `input: any` → `input: GitWorktreeCreateInput` | `Promise<GitWorktreeCreateResult>` |
| `getWorktreeBootstrapStatus` | `directory: any` → `directory: string` | `Promise<GitWorktreeBootstrapState>` |
| `removeWorktree` | `directory: any` → `directory: string`, `input: any` → `input: GitWorktreeRemoveInput` | `Promise<boolean>` |
| `deleteBranch` | `directory: any` → `directory: string`, options | `Promise<boolean>` |
| `getLog` | `directory: any` → `directory: string`, `options: any` → `options: GitLogOptions` | `Promise<GitLogResult>` |
| `isLinkedWorktree` | `directory: any` → `directory: string` | `Promise<boolean>` |

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): type exported function params (batch 2, 15 functions)"
```

### Task 3.6: Type exported function parameters in service.ts (batch 3 — functions 31-45)

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — lines 2816-3394

- [ ] **Step 1: Type functions 31-45**

| Function | Parameter changes | Return type |
|----------|------------------|-------------|
| `validateWorktreeDirectory` | `directory: any` → `directory: string` | `Promise<GitWorktreeValidateDirResult>` |
| `canonicalizeWorktreeState` | `directory: any` → `directory: string` | `Promise<GitCanonicalizeStateResult>` |
| `getCommitFiles` | `directory: any` → `directory: string`, `ref: any` → `ref: string` | `Promise<GitCommitFilesResult>` |
| `renameBranch` | `directory: any` → `directory: string`, `old: any` → `old: string`, `newName: any` → `newName: string` | `Promise<boolean>` |
| `getRemotes` | `directory: any` → `directory: string` | `Promise<GitRemoteEntry[]>` |
| `removeRemote` | `directory: any` → `directory: string`, `name: any` → `name: string`, `options: any` → `options: GitRemoveRemoteOptions` | `Promise<boolean>` |
| `rebase` | `directory: any` → `directory: string`, `options: any` → `options: GitRebaseOptions` | `Promise<boolean>` |
| `abortRebase` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `merge` | `directory: any` → `directory: string`, `options: any` → `options: GitMergeOptions` | `Promise<{ success: boolean; conflicts?: string[] }>` |
| `abortMerge` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `continueRebase` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `continueMerge` | `directory: any` → `directory: string` | `Promise<boolean>` |
| `getConflictDetails` | `directory: any` → `directory: string` | `Promise<GitConflictDetails>` |
| `stash` | `directory: any` → `directory: string`, `options: any` → `options: GitStashOptions` | `Promise<{ success: boolean }>` |
| `stashPop` | `directory: any` → `directory: string` | `Promise<{ success: boolean }>` |

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): type exported function params (batch 3, final 15 functions)"
```

### Task 3.3: Type core internal helpers in service.ts

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — internal helper functions (lines 50-700 area)

- [ ] **Step 1: Type foundational internal helpers**

Replace `any` with proper types in these key helpers:

| Helper | Current | Target |
|--------|---------|--------|
| `resolveDefaultBranch(git: any)` | `any` | `SimpleGit` |
| `toBootstrapStateKey(directory: any)` | `any` | `string` |
| `setWorktreeBootstrapState(directory: any, status: any, error: any)` | `any` × 3 | `string`, `string`, `string \| null` |
| `clearWorktreeBootstrapState(directory: any)` | `any` | `string` |
| `isExecutableFile(candidate: any)` | `any` | `string` |
| `normalizeGitExecutableCandidate(candidate: any)` | `any` | `string` |
| `escapeSshKeyPath(sshKeyPath: any)` | `any` | `string` |
| `buildSshCommand(sshKeyPath: any)` | `any` | `string` |
| `normalizeDirectoryPath(value: any)` | `any` | `string` |
| `cleanBranchName(branch: any)` | `any` | `string` |
| `pickRandom(values: any)` | `any` | `readonly T[]` (generic) |
| `slugWorktreeName(value: any)` | `any` | `string` |
| `parseWorktreePorcelain(raw: any)` | `any` | `string` |
| `canonicalPath(input: any)` | `any` | `string` |
| `normalizeStartRef(value: any)` | `any` | `string` |
| `parseRemoteBranchRef(value: any)` | `any` | `string` |
| `resolveRemoteBranchRef(...)` | `any` params | `string` params |
| `parseGitErrorText(error: any)` | `any` | `unknown` |

Use `SimpleGit` for git instances. Use `string` for paths/names/refs.

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): type core internal helpers in service.ts"
```

### Task 3.2: Replace `catch (error: any)` with `unknown` in service.ts

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — 46 catch blocks

- [ ] **Step 1: Locate all `catch (error: any)` blocks**

Use grep to find every occurrence (line numbers shift as we edit):
```bash
grep -n "catch (error: any)" packages/web/server/src/domains/git/service.ts
```

- [ ] **Step 2: Replace `catch (error: any)` with `catch (e)` everywhere**

Do a global search-and-replace: `catch (error: any)` → `catch (e)`.

- [ ] **Step 3: Apply uniform error extraction pattern**

Every catch block that accesses properties on the caught error (`.code`, `.stderr`, `.message`, `.stdout`) needs narrowing. Apply this uniform pattern to each catch body:

```typescript
catch (e) {
  const err = parseGitErrorText(e);
  // replace direct e?.code / e?.stderr / e?.message access with err properties
}
```

The existing `parseGitErrorText` (already defined in the file, accepts `unknown`) returns an object with `{ message: string; stderr: string; code: string | null }`. Use `err.message`, `err.stderr`, `err.code` instead of direct `e` property access.

For blocks that do `throw err` or `return false` after logging, no further changes needed — just the `catch(e)` suffices.

For blocks that use `catch {` (no binding, 3 occurrences at ~line 1193, 1237, 1147), leave them untouched — they are already correct.

- [ ] **Step 4: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(git): replace catch(error: any) with unknown in service.ts"
```

---

## Phase 4: GitHub Domain Typing

### Task 4.1: Type `octokit` parameters with Octokit from @octokit/rest

**Files:**
- Modify: `packages/web/server/src/domains/github/pr-status.ts` — type all `octokit: any` params
- Modify: `packages/web/server/src/domains/github/types.ts` — fix `ResolveGitHubPrStatusOptions.octokit`

- [ ] **Step 1: Add Octokit import to pr-status.ts**

Add to line 1 area:
```typescript
import type { Octokit } from "@octokit/rest";
```

- [ ] **Step 2: Replace all `octokit: any` with `octokit: Octokit`**

Functions to update (line numbers from review):
- `getRepoDefaultBranch` — line 151 (`octokit: any` → `octokit: Octokit`)
- `getRepoMetadata` — line 178
- `expandRepoNetwork` — line 236
- `safeListPulls` — line 294
- `searchFallbackPr` — line 331
- `findFirstMatchingPr` — line 409
- `resolveGitHubPrStatus` — line 460

- [ ] **Step 3: Fix `types.ts:52` — `ResolveGitHubPrStatusOptions.octokit: any`**

```typescript
import type { Octokit } from "@octokit/rest";
// ...
interface ResolveGitHubPrStatusOptions {
  octokit: Octokit;  // was: any
  // ...
}
```

- [ ] **Step 4: Fix `types.ts:59` — `ResolvedPrStatus.pr: any`**

Use Octokit response types:
```typescript
import type { RestEndpointMethodTypes } from "@octokit/rest";
// ...
interface ResolvedPrStatus {
  repo: { owner: string; repo: string } | null;
  pr: RestEndpointMethodTypes["pulls"]["get"]["response"]["data"] | null;
  // ...
}
```

If this import doesn't work (depends on @octokit/rest version), check what's available:
```bash
grep -r "octokit" packages/web/server/package.json
```

- [ ] **Step 5: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/github/pr-status.ts packages/web/server/src/domains/github/types.ts
git commit -m "fix(github): type octokit params with @octokit/rest Octokit type"
```

### Task 4.2: Type PR data instead of `any` in pr-status.ts

**Files:**
- Modify: `packages/web/server/src/domains/github/pr-status.ts`

- [ ] **Step 1: Type `repoMetadataCache` properly**

Line 7 target state:
```typescript
type RepoData = Awaited<ReturnType<Octokit["rest"]["repos"]["get"]>>["data"];
const repoMetadataCache = new Map<string, { data: RepoData | null; fetchedAt: number }>();
```

- [ ] **Step 2: Fix `getRepoMetadata` return type (line 178)**

Change `Promise<any>` to `Promise<RepoData | null>`.

- [ ] **Step 3: Fix `safeListPulls` return type (line 294)**

```typescript
type PullRequestData = Awaited<ReturnType<Octokit["rest"]["pulls"]["list"]>>["data"];
const safeListPulls = async (octokit: Octokit, options: Record<string, unknown>): Promise<PullRequestData> => {
```

- [ ] **Step 4: Fix inner `pr: any` usages within helper functions**

For `findFirstMatchingPr` (line 409), `searchFallbackPr` (line 331), and `expandRepoNetwork` (line 236) — when they access `pr` data, use the `PullRequestData[number]` type or a narrower interface for the fields they actually access (`number`, `title`, `html_url`, `head`, `base`, `labels`).

- [ ] **Step 5: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/github/pr-status.ts
git commit -m "fix(github): type PR data with Octokit response types"
```

### Task 4.3: Remove `as any` from dynamic imports in github routes.ts

**Files:**
- Modify: `packages/web/server/src/domains/github/routes.ts` — 10 occurrences

- [ ] **Step 1: Replace all `await import("./index.js") as any` with typed imports**

Lines: 10, 494, 675, 753, 797, 850, 916, 987, 1035, 1119

For the first occurrence (line 10), which is in a lazy getter:
```typescript
// Before:
return await import("./index.js") as any;

// After:
return await import("./index.js");
```

For the other occurrences (line 494, etc.), which store in a local variable:
```typescript
// Before:
const ghLib = await import("./index.js") as any;

// After:
const ghLib = await import("./index.js");
```

Similarly for line 532 (`../git/index.js`).

- [ ] **Step 2: Check if any code accesses properties that need the cast**

Search for `ghLib.` usages after each import. If TypeScript errors appear because it doesn't know the module's exports, add a `satisfies` type or type the variable explicitly:

```typescript
const ghLib: typeof import("./index.js") = await import("./index.js");
```

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/github/routes.ts
git commit -m "fix(github): remove as any from dynamic imports in routes.ts"
```

### Task 4.4: Fix `as unknown as Promise<...>` in device-flow.ts

**Files:**
- Modify: `packages/web/server/src/domains/github/device-flow.ts` — lines 27-41

- [ ] **Step 1: Replace double-unsafe cast with validated response**

Target state for the `startDeviceFlow` function:
```typescript
export async function startDeviceFlow({ clientId, scope }: StartDeviceFlowParams): Promise<StartDeviceFlowResult> {
  const result = await postForm(DEVICE_CODE_URL, {
    client_id: clientId,
    scope,
  });

  if (
    typeof result.device_code !== "string" ||
    typeof result.user_code !== "string" ||
    typeof result.verification_uri !== "string"
  ) {
    throw new Error("Invalid device flow response from GitHub");
  }

  return result as StartDeviceFlowResult;
}
```

- [ ] **Step 2: Fix the error object construction (line 29)**

Replace `const error: any = new Error(...)`:
```typescript
const message = String(payload?.error_description ?? payload?.error ?? response.statusText);
const error = Object.assign(new Error(message), {
  status: response.status,
  payload,
});
throw error;
```

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/github/device-flow.ts
git commit -m "fix(github): remove unsafe casts in device-flow.ts"
```

---

## Phase 5: Quota Providers — Systematic Fixes

### Task 5.1: Add return type annotations to all `fetchQuota` functions

**Files:**
- Modify: 15 provider files under `packages/web/server/src/domains/quota/providers/`

- [ ] **Step 1: Add `: Promise<QuotaProviderResult>` to every `fetchQuota` and `fetchQuotaAddon` and `fetchGoogleQuota`**

Files and export names:
| File | Function | Line |
|------|----------|------|
| `openai.ts` | `fetchQuota` | 16 |
| `claude.ts` | `fetchQuota` | 17 |
| `codex.ts` | `fetchQuota` | 17 |
| `copilot.ts` | `fetchQuota` | 47 |
| `copilot.ts` | `fetchQuotaAddon` | 105 |
| `kimi.ts` | `fetchQuota` | 17 |
| `nanogpt.ts` | `fetchQuota` | 19 |
| `openrouter.ts` | `fetchQuota` | 17 |
| `zai.ts` | `fetchQuota` | 17 |
| `zhipuai.ts` | `fetchQuota` | 43 |
| `zhipuai-coding-plan.ts` | `fetchQuota` | 17 |
| `minimax-coding-plan.ts` | `fetchQuota` | 17 |
| `minimax-cn-coding-plan.ts` | `fetchQuota` | 17 |
| `ollama-cloud.ts` | `fetchQuota` | 63 |
| `google/index.ts` | `fetchGoogleQuota` | 35 |

Target pattern for each:
```typescript
export const fetchQuota = async (): Promise<QuotaProviderResult> => {
```

Ensure each file already imports `QuotaProviderResult` from the right path. If not, add the import.

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/
git commit -m "fix(quota): add return type annotations to all fetchQuota functions"
```

### Task 5.2: Replace scalar `as number`/`as string` casts with transformers

**Files:**
- Modify: `openai.ts`, `codex.ts`, `nanogpt.ts`, `minimax-coding-plan.ts`, `minimax-cn-coding-plan.ts`, `google/transforms.ts`, `google/auth.ts`

- [ ] **Step 1: Fix openai.ts lines 51-52 and 57-59, 64-66 (pre-edit line numbers)**

Replace chained `as Record<string, unknown>` casts with `asObject`. Locate with: `grep -n "as Record<string, unknown>" openai.ts`

Replace chained `as Record<string, unknown>` casts with `asObject`:
```typescript
// Before (lines 51-52):
const primary = (payload?.rate_limit as Record<string, unknown>)?.primary_window as Record<string, unknown> | undefined;
const secondary = (payload?.rate_limit as Record<string, unknown>)?.secondary_window as Record<string, unknown> | undefined;

// After:
const rateLimit = asObject(payload?.rate_limit);
const primary = rateLimit ? asObject(rateLimit.primary_window) : null;
const secondary = rateLimit ? asObject(rateLimit.secondary_window) : null;
```

Replace `as number` casts with `toNumber`:
```typescript
// Before (line 57):
usedPercent: (primary.used_percent as number) ?? null,

// After:
usedPercent: toNumber(primary?.used_percent),
```

Apply the same pattern to lines 58-59 (windowSeconds, resetAt) and 64-66 (secondary window).

- [ ] **Step 2: Fix codex.ts — same pattern as openai.ts (pre-edit lines)**

Same chained casts at lines 59-60. Locate with: `grep -n "as Record<string, unknown>" codex.ts`. Apply same fix: use `asObject` for nested descent and `toNumber` for scalar fields.

- [ ] **Step 3: Fix nanogpt.ts line 67, 89 (pre-edit lines)**

Locate with `grep -n "as Record<string, unknown>" nanogpt.ts`.

```typescript
// Before:
const limit = toNumber(daily?.limit ?? (daily?.limits as Record<string, unknown>)?.daily);

// After:
const dailyLimits = asObject(daily?.limits);
const limit = toNumber(daily?.limit) ?? toNumber(dailyLimits?.daily);
```

- [ ] **Step 4: Fix minimax-coding-plan.ts lines 56-62 and minimax-cn-coding-plan.ts lines 56-62**

Replace `(baseResp.status_code as number)` with `toNumber(baseResp.status_code)` and `(baseResp.status_msg as string)` with `typeof baseResp.status_msg === "string" ? baseResp.status_msg : ""`.

- [ ] **Step 5: Fix google/transforms.ts line 97**

Replace `new Date(quotaInfo.resetTime as string).getTime()` with `toTimestamp(quotaInfo?.resetTime)`.

- [ ] **Step 6: Fix google/auth.ts line 75 — `(account.refreshToken as string)`**

Replace with `asNonEmptyString(account["refreshToken"])`.

- [ ] **Step 7: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/
git commit -m "fix(quota): replace scalar casts with transformers (toNumber, asObject, toTimestamp)"
```

### Task 5.3: Fix zhipuai.ts — remove eslint-disable and as any

**Files:**
- Modify: `packages/web/server/src/domains/quota/providers/zhipuai.ts`

- [ ] **Step 1: Remove `/* eslint-disable @typescript-eslint/no-explicit-any */` from line 1**

- [ ] **Step 2: Replace `(mergedConfig as any)?.provider?.[alias]` on line 27**

```typescript
// Before:
const providerConfig = (mergedConfig as any)?.provider?.[alias];

// After:
const mergedConfigObj = asObject(mergedConfig);
const providerConfig = mergedConfigObj?.provider as Record<string, unknown> | undefined;
if (providerConfig && typeof providerConfig[alias] === "object") {
  // use it
}
```

Or simpler — just cast to Record instead of any:
```typescript
const providerConfig = (mergedConfig as Record<string, unknown>)?.provider as Record<string, unknown> | undefined;
const config = typeof providerConfig?.[alias] === "object" ? (providerConfig[alias] as Record<string, unknown>) : {};
```

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/quota/providers/zhipuai.ts
git commit -m "fix(quota): remove eslint-disable and as any in zhipuai.ts"
```

---

## Phase 6: OpenCode Services Typing

### Task 6.1: Type `any` params on MCP public API

**Files:**
- Modify: `packages/web/server/src/domains/opencode/services/mcp.ts` — lines 97, 140

- [ ] **Step 1: Type `createMcpConfig` mcpConfig param (line 97)**

```typescript
// Before:
export function createMcpConfig(
  name: string,
  mcpConfig: any,
  workingDirectory: string | null,
  scope: typeof AGENT_SCOPE[keyof typeof AGENT_SCOPE]
): void {

// After:
export function createMcpConfig(
  name: string,
  mcpConfig: Partial<McpEntry>,
  workingDirectory: string | null,
  scope: typeof AGENT_SCOPE[keyof typeof AGENT_SCOPE]
): void {
```

- [ ] **Step 2: Type `updateMcpConfig` updates param (line 140)**

```typescript
// Before:
export function updateMcpConfig(
  name: string,
  updates: any,
  workingDirectory: string | null
): void {

// After:
export function updateMcpConfig(
  name: string,
  updates: Partial<McpEntry>,
  workingDirectory: string | null
): void {
```

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/opencode/services/mcp.ts
git commit -m "fix(mcp): type public API params with Partial<McpEntry>"
```

### Task 6.2: Remove `as any` casts from agents.ts and skills.ts

**Files:**
- Modify: `packages/web/server/src/domains/opencode/services/agents.ts` — 9 occurrences
- Modify: `packages/web/server/src/domains/opencode/services/skills.ts` — 1 occurrence

- [ ] **Step 1: Fix agents.ts `as any` casts (lines 248, 261, 271, 298, 665, 680, 687, 688, 843)**

Pattern: `(layers.projectConfig as any)?.agent?.[agentName]?.permission`

All 9 occurrences follow the same pattern. Use consistent `Record<string, unknown>` chaining for each:

```typescript
// Before:
const permission = (layers.projectConfig as any)?.agent?.[agentName]?.permission;

// After:
const agentEntry = (layers.projectConfig as Record<string, unknown>)?.agent as Record<string, unknown> | undefined;
const permission = agentEntry?.[agentName] as Record<string, unknown> | undefined;
```

Where the same `layers.projectConfig` is accessed multiple times in one function, extract to a local:
```typescript
const projectConfig = layers.projectConfig as Record<string, unknown>;
```

Apply this pattern to all 9 occurrences. Do not use `as any` anywhere.

- [ ] **Step 2: Fix skills.ts line 247**

```typescript
// Before:
const configuredPaths = (readConfig(workingDirectory) as any)?.skills?.paths;

// After:
const config = readConfig(workingDirectory);
const skillsConfig = (config as Record<string, unknown>)?.skills as Record<string, unknown> | undefined;
const configuredPaths = skillsConfig?.paths as string[] | undefined;
```

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/opencode/services/agents.ts packages/web/server/src/domains/opencode/services/skills.ts
git commit -m "fix(services): replace as any casts with Record<string, unknown> access"
```

### Task 6.3: Remove triplicated dead guards from agents.ts and commands.ts

**Files:**
- Modify: `packages/web/server/src/domains/opencode/services/agents.ts` — ~8 locations
- Modify: `packages/web/server/src/domains/opencode/services/commands.ts` — ~8 locations

- [ ] **Step 1: Identify and fix all occurrences**

Search pattern: three consecutive lines of `if (!config.agent) config.agent = {};`

Search:
```bash
grep -n "if (!config\.\(agent\|command\))" packages/web/server/src/domains/opencode/services/agents.ts packages/web/server/src/domains/opencode/services/commands.ts
```

For each group of 3 identical guards, keep only the first one and delete the other two.

- [ ] **Step 2: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/src/domains/opencode/services/agents.ts packages/web/server/src/domains/opencode/services/commands.ts
git commit -m "fix(services): remove triplicated dead initialization guards"
```

---

## Phase 7: Routes + Express Typing

### Task 7.1: Remove `as any` casts from feature-routes-runtime.ts skill functions

**Files:**
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts` — lines 37-42

- [ ] **Step 1: Type the aliased skill/git functions properly**

Remove the `as any` casts and the `_` prefix aliasing. Use the direct function names:

```typescript
// Before (line 37-42):
const _parseSkillRepoSource = parseSkillRepoSource as any;
const _scanSkillsRepository = scanSkillsRepository as any;
// etc.

// After:
// Delete the aliases entirely. Use the direct imports in the route registration call below.
registerSkillRoutes(app, {
  parseSkillRepoSource,
  scanSkillsRepository,
  installSkillsFromRepository,
  scanClawdHubPage,
  installSkillsFromClawdHub,
  // ...
});
```

- [ ] **Step 2: Remove `as any` aliases and pass direct imports**

The `as any` casts on these variables are cargo-culted from the JS migration — there is no genuine type mismatch. Delete the `_`-prefixed aliases entirely and pass the directly-imported functions to the route registration call. If TypeScript reports a type error, widen the deps interface in `skill-routes.ts` rather than casting.

- [ ] **Step 3: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/src/domains/routes/feature-routes-runtime.ts
git commit -m "fix(routes): remove as any casts from feature-routes-runtime skill functions"
```

### Task 7.2: Use Express types in route handlers

**Files:**
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts` — `app: any`, `res: any`, `_req: any`
- Modify: `packages/web/server/src/domains/routes/static-routes.ts` — same
- Modify: `packages/web/server/src/domains/routes/openchamber-routes.ts` — same
- Modify: `packages/web/server/src/index.ts` — `app: any`

- [ ] **Step 1: Add Express type imports to each file**

```typescript
import type { Application, Request, Response } from "express";
```

- [ ] **Step 2: Replace `any` with Express types in declarations**

| Pattern | Replacement |
|---------|-------------|
| `app: any` | `app: Application` |
| `_req: any` | `_req: Request` |
| `req: any` | `req: Request` |
| `res: any` | `res: Response` |

Apply to all route handler function signatures across the 4 files. For inline callbacks like `app.post('/path', async (_req: any, res: any) => {`, replace both params.

- [ ] **Step 3: Fix Set<any> and catch blocks in index.ts**

In index.ts:
- `uiNotificationClients: Set<any>` → `Set<Response>` (line 69)
- `uiNotificationWsClients: Set<any>` → `Set<Response>` (line 70-71)
- `uiOpenChamberEventClients: Set<any>` → `Set<Response>`

For **try/catch blocks** (index.ts line 1001 `catch (error: any)`): replace with `catch (e)` and use `e instanceof Error ? e.message : String(e)` for error message extraction.

For **promise `.catch()` chains** (index.ts lines 617, 713 `.catch((error: any) =>`): replace `(error: any)` → `(e)` in the lambda parameter. Do NOT change `.catch(...)` syntax. Only remove the `any` type annotation from the callback parameter.

- [ ] **Step 4: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/routes/ packages/web/server/src/index.ts
git commit -m "fix(routes): use Express types instead of any for app/req/res"
```

---

## Phase 8: Skills-Catalog Cleanup + Index.ts Improvements

### Task 8.1: Add validation to ClawdHub API response parsing

**Files:**
- Modify: `packages/web/server/src/domains/skills-catalog/clawdhub/api.ts`

- [ ] **Step 1: Add a type guard for the paginated response shape**

In `fetchClawdHubSkills` (around line 79), replace:
```typescript
const data = (await response.json()) as { nextCursor?, next_cursor?, next?, cursor?, items? };
```
With:
```typescript
const raw = await response.json();
if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
  return { items: [], nextCursor: null };
}
const data = raw as Record<string, unknown>;
const items = Array.isArray(data.items) ? data.items : [];
const nextCursor = (typeof data.nextCursor === "string" && data.nextCursor) ||
  (typeof data.next_cursor === "string" && data.next_cursor) ||
  (typeof data.next === "string" && data.next) ||
  (typeof data.cursor === "string" && data.cursor) ||
  null;
return { items, nextCursor };
```

- [ ] **Step 2: Add validation in `fetchClawdHubSkillVersion` (around line 114)**

Replace:
```typescript
const skillData = (await skillResponse.json()) as { skill?, latestVersion? };
```
With:
```typescript
const raw = await skillResponse.json();
const data = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
```

- [ ] **Step 3: Update return types to reflect validated shapes**

Update `fetchClawdHubSkills` return type:
```typescript
// Before:
export async function fetchClawdHubSkills(...): Promise<{ items: unknown[]; nextCursor: string | null }> {
// After:
export async function fetchClawdHubSkills(...): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
```

Update `fetchClawdHubSkillVersion` return type:
```typescript
// Before:
export async function fetchClawdHubSkillVersion(...): Promise<unknown> {
// After:
export async function fetchClawdHubSkillVersion(...): Promise<Record<string, unknown>> {
```

These use `Record<string, unknown>` rather than a specific interface because the API response shapes are defined by an external service. The existing `ClawdHubApiItem` interface in the codebase is used by callers for the item-level type; the response wrapper itself is generic.

- [ ] **Step 4: Update callers in clawdhub/scan.ts to remove `as` casts**

In `scanClawdHubPage` (line 84), replace `items = (pageResult.items as ClawdHubApiItem[]) || []` with a proper validation. Either validate `items` elements at the boundary, or add a `mapClawdHubItem` that accepts `unknown` and returns `ClawdHubApiItem | null`.

- [ ] **Step 5: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/domains/skills-catalog/clawdhub/
git commit -m "fix(skills-catalog): add validation to ClawdHub API response parsing"
```

### Task 8.2: Move duplicated types from scan.ts/install.ts to types.ts

**Files:**
- Modify: `packages/web/server/src/domains/skills-catalog/types.ts` — add shared types
- Modify: `packages/web/server/src/domains/skills-catalog/scan.ts` — import instead of define
- Modify: `packages/web/server/src/domains/skills-catalog/install.ts` — import instead of define

- [ ] **Step 1: Add shared clone types to types.ts**

```typescript
export interface CloneRepoOptions {
  url: string;
  targetDir: string;
  branch?: string;
  depth?: number;
  subpath?: string | null;
  repoLock?: Promise<void>;
}

export interface CloneSuccess { ok: true; targetDir: string; }
export interface CloneFailure { ok: false; error: string; }
export type CloneResult = CloneSuccess | CloneFailure;
```

- [ ] **Step 2: Remove duplicate definitions from scan.ts (~line 56-76) and install.ts (~line 110-130)**

Replace with:
```typescript
import type { CloneRepoOptions, CloneSuccess, CloneFailure, CloneResult } from "./types.js";
```

- [ ] **Step 3: Remove dead `void effectiveSubpath` from install.ts line 292**

The `effectiveSubpath` variable is computed but never used — `void effectiveSubpath` suppresses the "unused variable" lint. Delete both the computation and the `void` line. Do not pass `effectiveSubpath` to any caller; it was dead code in the original JS and remains dead.

- [ ] **Step 4: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/src/domains/skills-catalog/
git commit -m "fix(skills-catalog): move duplicated Clone types to types.ts, remove dead code"
```

### Task 8.3: Improve index.ts `any` wrappers (incremental)

**Files:**
- Modify: `packages/web/server/src/index.ts`

**Note:** The `(...args: any[]) => any` wrapper pattern spans 50+ methods. Fully fixing this is a separate project. This task makes targeted improvements.

- [ ] **Step 1: Fix the `Set<any>` declarations (lines 69-71)**

```typescript
// Before:
const uiNotificationClients: Set<any> = new Set();
const uiNotificationWsClients: Set<any> = new Set();
const uiOpenChamberEventClients: Set<any> = new Set();

// After:
import type { Response } from "express";
const uiNotificationClients: Set<Response> = new Set();
const uiNotificationWsClients: Set<Response> = new Set();
const uiOpenChamberEventClients: Set<Response> = new Set();
```

- [ ] **Step 2: Fix `catch (error: any)` blocks (lines 617, 713, 1001)**

Replace with `catch (e)` and use `e instanceof Error ? e.message : String(e)` for error message extraction.

- [ ] **Step 3: Remove unused `EVENTS` import (line 17)**

- [ ] **Step 4: For 3-5 `(...args: any[]) => any` wrappers, apply specific types**

Pick the simplest wrappers (those where the typed runtime method signature is already available). Example:

```typescript
// Before:
const isGitRepository: (...args: any[]) => any = (...args) =>
  (gitRuntime as any).isGitRepository(...args);

// After:
const isGitRepository: (directory: string) => Promise<boolean> = (directory) =>
  gitRuntime.isGitRepository(directory);
```

Start with the most commonly called methods: `isGitRepository`, `getStatus`, `getRemotes`, `getCurrentIdentity`, `commit`.

- [ ] **Step 5: Verify**

```bash
bun run type-check
bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/src/index.ts
git commit -m "fix(index): improve typing in index.ts — express types, catch blocks, 5 method wrappers"
```

---

## Verification

After all phases complete, run the full verification suite:

```bash
bun run type-check
bun run lint
scripts/verify.sh
```

Expected: All pass with no new errors.
