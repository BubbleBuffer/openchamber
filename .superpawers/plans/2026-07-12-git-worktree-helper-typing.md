---
kind: plan
status: complete
parent_spec: .superpawers/specs/2026-07-09-lint-integration-readiness-design.md
covers_chunks:
  - git-service-typing
created: 2026-07-12
updated: 2026-07-12
next_action: "Plan Git public result adapter and error-boundary typing"
---

# Git Worktree Helper Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the internal worktree-helper `any` contracts in the Git service with local concrete types without changing Git, filesystem, JSON, SQLite, or bootstrap behavior.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`

**Architecture:** Keep all new types private to `service.ts`: porcelain worktree entries, normalized project-sandbox state, deferred bootstrap arguments, and upstream configuration arguments. Type helper parameters and callbacks from their existing internal call sites and the equivalent typed VS Code implementation; retain the existing runtime normalization at the JSON boundary instead of treating parsed JSON as trusted.

**Tech Stack:** TypeScript strict mode, Node.js filesystem/process APIs, `simple-git`, ESLint, Bun.

---

## Chunk Coverage

This plan covers the 44 active `@typescript-eslint/no-explicit-any` diagnostics in the module-private worktree helper region between `ensureOpenCodeProjectId` and `applyUpstreamConfiguration` in `packages/web/server/src/domains/git/service.ts`.

It does not cover exported Git service result adapters, `Promise<boolean>`/object return mismatches, `as any` return or options casts, error adapters, the MIME-map index cast, HTTP/bridge payload validation, SQLite `require` typing, public wire types in `git/types.ts`, UI or VS Code type sharing, or complexity/max-lines debt. The parent `git-service-typing` chunk remains `planned` after this plan because those areas remain.

## File Structure

- Modify: `packages/web/server/src/domains/git/service.ts` — add private structural types and replace only worktree-helper `any` contracts.
- Modify: `.superpawers/plans/2026-07-12-git-worktree-helper-typing.md` — mark the plan complete after verification.

No test file is added. The Git domain has no helper-level test harness, and these changes are erased annotations plus private interfaces with no runtime logic changes. Type-checking and focused lint validation are the appropriate gates.

### Task 1: Type Context, Name, and Branch Resolution Helpers

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — add `WorktreeListEntry` beside the private worktree helpers; type anchors `parseWorktreePorcelain`, `listWorktreeEntries`, `ensureOpenCodeProjectId`, `resolveWorktreeNameCandidates`, `resolveCandidateDirectory`, `resolveBranchForExistingMode`, and `findBranchInUse`.

- [x] **Step 1: Record the focused lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js --format json "./server/src/domains/git/service.ts" > /tmp/git-worktree-helper-lint.json || true
node -e '
const fs = require("node:fs")
const [{ messages }] = JSON.parse(fs.readFileSync("/tmp/git-worktree-helper-lint.json", "utf8"))
const source = fs.readFileSync("server/src/domains/git/service.ts", "utf8").split("\n")
const first = source.findIndex((line) => line.includes("const ensureOpenCodeProjectId")) + 1
const last = source.findIndex((line) => line.includes("export async function isGitRepository")) + 1
const matches = messages.filter((message) => message.ruleId === "@typescript-eslint/no-explicit-any" && message.line >= first && message.line < last)
console.log(`worktree-helper any baseline: ${matches.length}`)
if (matches.length !== 44) process.exit(1)
'
```

Expected: `worktree-helper any baseline: 44`. The full file remains lint-failing outside this region.

- [x] **Step 2: Add local porcelain typing and concrete scalar helper contracts**

At the `parseWorktreePorcelain` anchor, declare a private shape that preserves the current optional fields, then use it in that parser and `listWorktreeEntries`:

```ts
type WorktreeListEntry = {
  worktree?: string
  head?: string
  branchRef?: string
  branch?: string
}

const parseWorktreePorcelain = (raw: string): WorktreeListEntry[] => {
  // ... change the `current` accumulator annotation to `WorktreeListEntry | null` ...
  // ... retain parsing and optional-worktree filtering exactly ...
}

const listWorktreeEntries = async (directory: string): Promise<WorktreeListEntry[]> => {
  // ... existing runGitCommandOrThrow call ...
  return parseWorktreePorcelain(rawResult.stdout)
}
```

At the `ensureOpenCodeProjectId`, `resolveWorktreeNameCandidates`, `resolveCandidateDirectory`, `resolveBranchForExistingMode`, and `findBranchInUse` anchors, apply these concrete types while preserving every body expression and return value:

```ts
const ensureOpenCodeProjectId = async (primaryWorktree: string): Promise<string> => {
  // ... existing body ...
}

const resolveWorktreeNameCandidates = (baseName: string): string[] => {
  // ... retain Array.from behavior; use `(_, index) =>` exactly as the typed VS Code
  // sibling does so Array.from contextually infers both callback parameter types ...
}

const resolveCandidateDirectory = async (
  worktreeRoot: string,
  preferredName: string,
  explicitBranchName: string,
  primaryWorktree: string
) => {
  // ... existing candidate loop and Git commands ...
}

const resolveBranchForExistingMode = async (
  primaryWorktree: string,
  existingBranch: string,
  preferredBranchName: string
) => {
  // ... existing local/remote branch resolution ...
}

const findBranchInUse = async (primaryWorktree: string, localBranchName: string) => {
  // ... `entry` infers WorktreeListEntry; retain matching expressions ...
}
```

Do not make `WorktreeListEntry.worktree` required: the server parser currently models it as optional and downstream guards depend on that representation. Do not change `resolveWorktreeProjectContext`, command arrays, string coercions, or helper return bodies.

- [x] **Step 3: Inspect the task diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: private type declarations and annotations only. No changes to Git command arrays, filesystem calls, return objects, or branch/worktree control flow.

- [x] **Step 4: Run type and focused lint validation**

Run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Then rerun the Step 1 lint probe. Expected: the region count is reduced by the Task 1 anchors; remaining diagnostics belong only to the later storage and bootstrap tasks.

- [x] **Step 5: Commit the typed resolution helpers**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git worktree resolution helpers"
```

### Task 2: Type Project Sandbox Persistence Contracts

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — add private `ProjectSandboxState`; type anchors `loadProjectStartCommand`, `getProjectStoragePath`, `syncSandboxesToOpenCodeDb`, `updateProjectSandboxes`, `syncProjectSandboxAdd`, and `syncProjectSandboxRemove`.

- [x] **Step 1: Reconfirm remaining storage-region diagnostics**

Run the Step 1 focused lint probe. Inspect messages belonging to `loadProjectStartCommand`, `getProjectStoragePath`, `syncSandboxesToOpenCodeDb`, `updateProjectSandboxes`, `syncProjectSandboxAdd`, and `syncProjectSandboxRemove`.

Expected: active diagnostics remain on their parameter and updater contracts before this task; no new error category is introduced.

- [x] **Step 2: Add a local normalized sandbox-state interface and apply it at helper boundaries**

Declare the private normalized shape near the other worktree helper types:

```ts
type ProjectSandboxState = {
  id: string
  worktree: string
  vcs: string
  sandboxes: string[]
  time: { created: number; updated: number }
}
```

Apply it only after preserving the current dynamic JSON boundary and its normalization:

```ts
const loadProjectStartCommand = async (projectID: string): Promise<string> => {
  // ... preserve current read, JSON parse, `typeof parsed?.commands?.start` check, and catch fallback ...
}

const getProjectStoragePath = (projectID: string): string => {
  // ... existing path.join body ...
}

const syncSandboxesToOpenCodeDb = (projectID: string, sandboxes: string[]): void => {
  // ... preserve synchronous require, SQL, JSON.stringify, close, and catch behavior ...
}

const updateProjectSandboxes = async (
  projectID: string,
  primaryWorktree: string,
  updater: (project: ProjectSandboxState) => void
) => {
  // ... existing mkdir and `now` ...
  const base: ProjectSandboxState = {
    id: projectID,
    worktree: primaryWorktree,
    vcs: "git",
    sandboxes: [],
    time: { created: now, updated: now },
  }

  const parsed: unknown = await fsp.readFile(storagePath, "utf8")
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => null)
  const current = parsed && typeof parsed === "object" ? { ...base, ...parsed } : base

  // ... retain the current String, Array.isArray, Number.isFinite, Set, writeFile,
  // updater(current), and SQLite-sync statements exactly ...
}

const syncProjectSandboxAdd = async (
  projectID: string,
  primaryWorktree: string,
  sandboxPath: string
) => {
  // ... preserve sandbox normalization and in-place `project.sandboxes.push` updater ...
}

const syncProjectSandboxRemove = async (
  projectID: string,
  primaryWorktree: string,
  sandboxPath: string
) => {
  // ... preserve sandbox normalization and in-place `project.sandboxes = filter(...)` updater ...
}
```

The `parsed: unknown` annotation is required so parsed JSON remains untrusted until the existing runtime `parsed && typeof parsed === "object"` check narrows it to a spreadable object in the conditional expression. Keep that exact conditional/spread structure, then retain the existing `Array.isArray` and numeric normalization code. Do not add schema validation, change JSON spread order, replace the in-place updater API, alter SQLite failure handling, or move the existing `eslint-disable-next-line @typescript-eslint/no-require-imports` directive.

- [x] **Step 3: Inspect the task diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: only local interface declarations, concrete annotations, and `unknown` at the JSON parse boundary. The JSON/file/SQLite runtime statements and persistence semantics remain unchanged.

- [x] **Step 4: Run type and focused lint validation**

Run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Then rerun the Step 1 lint probe. Expected: storage-helper diagnostics are gone; remaining diagnostics belong only to Task 3 and deferred Git-service work.

- [x] **Step 5: Commit the typed sandbox helpers**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git worktree sandbox helpers"
```

### Task 3: Type Bootstrap, Remote, and Upstream Helper Contracts

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — add private `WorktreeBootstrapArgs` and `UpstreamConfigurationArgs`; type anchors `queueWorktreeBootstrap`, `ensureRemoteWithUrl`, `fetchRemoteBranchRef`, `checkRemoteBranchExists`, `setBranchTrackingFallback`, and `applyUpstreamConfiguration`.

- [x] **Step 1: Reconfirm remaining bootstrap-region diagnostics**

Run the Step 1 focused lint probe and inspect the messages for the bootstrap/remote/upstream helpers.

Expected: only these planned contract diagnostics remain within the worktree-helper region before this task.

- [x] **Step 2: Introduce private bootstrap and upstream argument shapes**

Add the following private interfaces near `ProjectSandboxState`:

```ts
type WorktreeBootstrapArgs = {
  directory: string
  projectID: string
  primaryWorktree: string
  localBranch: string
  setUpstream: boolean
  upstreamRemote: string
  upstreamBranch: string
  ensureRemoteName: string
  ensureRemoteUrl: string
  startCommand: string | undefined
}

type UpstreamConfigurationArgs = {
  primaryWorktree: string
  worktreeDirectory: string
  localBranch: string
  setUpstream: boolean
  upstreamRemote: string
  upstreamBranch: string
  ensureRemoteName?: string
  ensureRemoteUrl?: string
}
```

Apply the corresponding concrete contracts without changing expressions or scheduling:

```ts
const queueWorktreeBootstrap = (args: WorktreeBootstrapArgs): void => {
  // ... preserve current destructuring, setTimeout(..., 0), nested run(), catches,
  // bootstrap state updates, and fire-and-forget `void run()` ...
}

const ensureRemoteWithUrl = async (
  primaryWorktree: string,
  remoteName: string,
  remoteUrl: string
) => {
  // ... retain String(...).trim guards and exact Git commands ...
}

const fetchRemoteBranchRef = async (
  primaryWorktree: string,
  remoteName: string,
  branchName: string
) => {
  // ... retain guard, refspec, and fetch command ...
}

const checkRemoteBranchExists = async (
  primaryWorktree: string,
  remoteName: string,
  branchName: string,
  remoteUrl = ""
) => {
  // ... retain guard and `{ success, found }` result branches ...
}

const setBranchTrackingFallback = async (
  worktreeDirectory: string,
  localBranch: string,
  upstream: { remote: string; branch: string }
) => {
  // ... retain both config command arrays ...
}

const applyUpstreamConfiguration = async (args: UpstreamConfigurationArgs) => {
  // ... retain destructuring, setUpstream guard, remote setup, fetch fallback,
  // and branch tracking configuration exactly ...
}
```

Because `GitWorktreeCreateInput.startCommand` is optional while `runWorktreeStartScripts` currently accepts `string`, pass `startCommand ?? ""` at that call site. This preserves the existing `String(startCommand || "")` result for `undefined` without changing scheduling or command execution. Do not change any other caller-built values, optional-field defaults, `String()` normalization, remote URL behavior, command arrays, catches, return behavior, or `normalizeUpstreamTarget`.

- [x] **Step 3: Inspect the task diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: interface declarations and erased parameter annotations only; worktree bootstrap scheduling and remote/upstream behavior are unchanged.

- [x] **Step 4: Run type and focused lint validation**

Run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Then rerun the Step 1 lint probe. Expected: it reports zero active `no-explicit-any` diagnostics between `ensureOpenCodeProjectId` and `isGitRepository`.

- [x] **Step 5: Commit the typed bootstrap helpers**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git worktree bootstrap helpers"
```

### Task 4: Verify the Helper Subset and Complete Plan Metadata

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — verification only.
- Modify: `.superpawers/plans/2026-07-12-git-worktree-helper-typing.md` — complete metadata and checkboxes.
- Modify: `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md` — leave `git-service-typing` as `Status: planned`.

- [x] **Step 1: Inspect the implementation diff against the pre-cleanup baseline**

Run:

```bash
git diff --stat 7f82984c..HEAD -- packages/web/server/src/domains/git/service.ts
git diff 7f82984c..HEAD -- packages/web/server/src/domains/git/service.ts
```

Expected: the helper region changes only private type declarations, annotation replacements, and the safe `unknown` JSON-boundary type. No public API, command, persistence, or scheduling behavior changes.

- [x] **Step 2: Run server and repository type-checks**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
```

Expected: both commands exit 0.

- [x] **Step 3: Assert the entire semantic helper region is free of active `any` lint diagnostics**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js --format json "./server/src/domains/git/service.ts" > /tmp/git-worktree-helper-lint.json || true
node -e '
const fs = require("node:fs")
const [{ messages }] = JSON.parse(fs.readFileSync("/tmp/git-worktree-helper-lint.json", "utf8"))
const source = fs.readFileSync("server/src/domains/git/service.ts", "utf8").split("\n")
const first = source.findIndex((line) => line.includes("const ensureOpenCodeProjectId")) + 1
const last = source.findIndex((line) => line.includes("export async function isGitRepository")) + 1
if (!first || !last || last <= first) throw new Error("Could not resolve worktree-helper source bounds")
const remaining = messages.filter((message) => message.ruleId === "@typescript-eslint/no-explicit-any" && message.line >= first && message.line < last)
if (remaining.length) {
  console.error("Remaining worktree-helper any diagnostics:")
  for (const message of remaining) console.error(`${message.line}:${message.column}`)
  process.exit(1)
}
console.log("PASS: no active no-explicit-any diagnostics in worktree-helper region")
'
```

Expected: `PASS: no active no-explicit-any diagnostics in worktree-helper region`. This intentionally does not require whole-file lint to pass: deferred public result adapters and non-`any` lint debt remain outside the semantic bounds.

- [x] **Step 4: Complete plan tracking without closing the parent chunk**

Update this plan's frontmatter:

```yaml
status: complete
updated: 2026-07-12
next_action: "Plan Git public result adapter and error-boundary typing"
```

Check every completed checkbox in this plan. In `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`, leave `### Chunk: git-service-typing` at `Status: planned`: public result adapters, options casts, error boundaries, and remaining helper-adjacent debt still belong to it.

- [x] **Step 5: Commit the verified plan completion**

```bash
git add .superpawers/plans/2026-07-12-git-worktree-helper-typing.md
git commit -m "docs: complete git worktree helper typing plan"
```
