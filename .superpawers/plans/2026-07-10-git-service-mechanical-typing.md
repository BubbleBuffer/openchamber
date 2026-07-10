---
kind: plan
status: active
parent_spec: .superpawers/specs/2026-07-09-lint-integration-readiness-design.md
covers_chunks:
  - git-service-typing
created: 2026-07-10
updated: 2026-07-10
next_action: "Execute Task 1"
---

# Git Service Mechanical Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 54 directly-inferable `any` annotations in Git service callbacks and private utility signatures without changing Git behavior or exported contracts.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`

**Architecture:** This is the first, deliberately mechanical subset of the `git-service-typing` chunk. It only adds scalar annotations where promise sources, array sources, or private helper bodies establish the type locally. It does not change `service.ts` exports, return-object shapes, worktree/project helper contracts, git option casts, or error adapters; those need separate plans because their type changes propagate to callers or encode runtime API contracts.

**Tech Stack:** TypeScript, `simple-git`, Node.js `fs/promises`, ESLint, Bun.

---

## Chunk Coverage

This plan covers a 54-error safe subset in `packages/web/server/src/domains/git/service.ts`:

- Promise callbacks whose source is statically `Promise<string>` (`git.raw()` and `fsp.readFile(..., "utf8")`).
- Callback parameters from local `string[]` values (`split`, parsed string arrays, branch arrays, and requested files).
- Callback parameters whose source is directly typed by `simple-git` (`status.files`, `getRemotes(true)`, default `git.log()` results).
- Private utility signatures where the implementation only accepts strings or booleans.
- The single local `runGitCommand(...).then()` callback that reads only `success`.

It does **not** cover:

- Any exported `Promise<boolean>` function that currently returns an object through `as any`, including `push`, `pull`, `fetch`, `commit`, branch mutation, rebase, or merge functions.
- `normalizePushResult(result: any)`, options casts, `@ts-ignore` comments, and error-object adapters in or near those exported contract boundaries.
- The signatures and return contracts of worktree/project/sandbox helpers (`ensureOpenCodeProjectId`, `queueWorktreeBootstrap`, `applyUpstreamConfiguration`, and related helpers). This plan may type only their internal callbacks whose immediate source establishes the value shape.
- `(mimeMap as any)[ext]` because changing its index contract is a separate local map-shape decision.
- Warnings (`complexity`, `max-lines`) and other non-`any` lint errors.

## File Structure

- Modify: `packages/web/server/src/domains/git/service.ts` — replace only the declared callback/parameter types named in Tasks 1–3.
- No test files — all planned changes are erased type annotations on already-typed values. The Git domain has no direct tests; strict server type-check and focused lint are the appropriate gates. Do not add behavior tests for this type-only slice.

### Task 1: Type String Promise Callbacks

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — anchors `resolveDefaultBranch`, `ensureOpenCodeProjectId`, `updateProjectSandboxes`, `getStatus`, `getRangeDiff`, `getRangeFiles`, `getLog`, `isLinkedWorktree`, and `renameBranch`.

- [ ] **Step 1: Establish the Task 1 focused baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js ./server/src/domains/git/service.ts
```

Expected: the full file remains lint-failing because later Git typing slices are intentionally excluded. Record the active `no-explicit-any` diagnostics at the Task 1 promise-callback anchors before editing: `resolveDefaultBranch`, the `fsp.readFile(..., "utf8")` callbacks in `ensureOpenCodeProjectId` and `updateProjectSandboxes`, and the `git.raw()` callbacks in the named exported functions.

- [ ] **Step 2: Replace only callbacks with statically known string results**

In each of the following semantic anchors, replace the explicit `any` parameter with `string`; retain the existing `String(value || "").trim()`, `.trim()`, and `JSON.parse(...)` bodies unchanged:

```ts
// ... existing git.raw(...) expression ...
.then((value: string) => String(value || "").trim())

// ... existing fsp.readFile(path, "utf8") expression ...
.then((raw: string) => JSON.parse(raw))

// ... existing linked-worktree expressions ...
.then((output: string) => output.trim())
```

Apply this only to these existing callbacks:

- `resolveDefaultBranch`: both `git.raw()` reads.
- `ensureOpenCodeProjectId`: the UTF-8 `fsp.readFile` value and its subsequent newline `map`/`sort` callbacks when their source is `string[]`.
- `updateProjectSandboxes`: the UTF-8 `fsp.readFile` JSON callback.
- `getStatus`: `selectBaseRefForUnpublished` and unpublished-count `git.raw()` callbacks.
- `getRangeDiff` and `getRangeFiles`: local-ref `git.raw()` callbacks.
- `getLog`: `resolvedFrom` verification callback and `rawLog` record/stat string callbacks.
- `isLinkedWorktree`: both `git.raw(...).then((output: ...))` callbacks.
- `renameBranch`: previous remote and merge `git.raw()` callbacks.

Do not simplify runtime expressions merely because the new type is `string`; annotations must be the only behavior-adjacent change.

- [ ] **Step 3: Inspect the Task 1 diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: changes are limited to callback parameter annotations at `git.raw()` and UTF-8 `fsp.readFile()` chains, plus `string` annotations on the associated newline-processing callbacks. No command arrays, fallbacks, string coercions, JSON parsing, or Git control flow change.

- [ ] **Step 4: Run server type-check and inspect lint progress**

Run:

```bash
bun run --cwd packages/web type-check:server
bunx eslint packages/web/server/src/domains/git/service.ts --format json > /tmp/git-service-lint-task-1.json || true
```

Then verify the JSON output contains no `@typescript-eslint/no-explicit-any` messages at the edited Task 1 anchors, while acknowledging excluded errors remain elsewhere in the file.

Expected: server type-check exits 0. The JSON inspection confirms the edited promise/string callback locations are clear; full-file ESLint still exits nonzero because later slices remain.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git string callbacks"
```

### Task 2: Type Local Arrays and Private Binary Utilities

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — anchors `listWindowsGitInstallCandidates`, `resolveGitBinary`, `updateProjectSandboxes`, `syncProjectSandboxRemove`, `accumulateStats`, `getRangeFiles`, image/binary helpers, `commit`, `getBranches`, `filterActiveRemoteBranches`, and `getConflictDetails`.

- [ ] **Step 1: Establish the Task 2 focused baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js ./server/src/domains/git/service.ts
```

Expected: Task 1's edited callback diagnostics are absent. The Task 2 anchors still report their existing `no-explicit-any` errors, along with errors from explicitly excluded Git service boundaries.

- [ ] **Step 2: Type only locally-proven arrays and private scalar helpers**

Preserve all bodies and add the following annotations where the immediate source establishes the shape:

```ts
// process.env values remain potentially absent at runtime.
.map((value: string | undefined) => (typeof value === "string" ? value.trim() : ""))

// The preceding map/filter produces candidate strings.
.filter((candidate: string) => isExecutableFile(candidate))
.find((candidate: string) => candidate.toLowerCase().endsWith(".exe"))

// JSON-derived sandboxes remain opaque until string-coerced.
.map((entry: unknown) => String(entry || "").trim())

const accumulateStats = (raw: string): void => {
  // ... existing split/map/forEach logic using (line: string) ...
};

function isImageFile(filePath: string) { /* ... existing body ... */ }
function getImageMimeType(filePath: string) { /* ... existing body ... */ }
const parseIsBinaryFromNumstat = (raw: string) => { /* ... existing body ... */ };
const looksBinaryBySniff = async (absolutePath: string) => { /* ... existing body ... */ };
const isBinaryDiff = async (directoryPath: string, filePath: string, staged: boolean) => { /* ... existing body ... */ };
```

Apply `string` annotations only to callbacks directly following a `string[]` source, including newline splits, branch lists, `requestedFiles`, and active remote branches. Apply `unknown` only to JSON-derived sandbox entries that are immediately normalized through `String(...)`.

In `updateProjectSandboxes`, type both existing `current.sandboxes.map(...)` callbacks as `(entry: unknown) => String(entry || "").trim()`. In `syncProjectSandboxRemove`, type the existing normalized `project.sandboxes.filter(...)` callback as `(entry: string) => entry !== sandbox`. Do not change either helper's signature, persisted JSON shape, or update control flow.

For `isBinaryDiff`, type its existing `runGitCommand(...).then(...)` callback as `(result: { success: boolean }) => result.success`; do not modify `runGitCommand` itself. Keep `(mimeMap as any)[ext]` unchanged; it is explicitly out of scope.

Do not add type predicates, change `.filter(Boolean)`, remove defensive `typeof` checks, or simplify coercions. The runtime operations and their ordering must remain byte-for-byte equivalent apart from erased annotations.

- [ ] **Step 3: Inspect the Task 2 diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: only parameter annotations at local array callbacks/private helpers change. The image MIME map access, Git commands, binary-detection branches, and worktree code are untouched.

- [ ] **Step 4: Run server type-check and inspect lint progress**

Run:

```bash
bun run --cwd packages/web type-check:server
bunx eslint packages/web/server/src/domains/git/service.ts --format json > /tmp/git-service-lint-task-2.json || true
```

Verify the JSON output has no `no-explicit-any` messages at the edited local array and private-helper anchors. Do not require full-file lint success.

Expected: server type-check exits 0; excluded worktree, error, options, map-index, and return-contract diagnostics remain the only `any` categories outside completed work.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git utility callbacks"
```

### Task 3: Type Direct `simple-git` Response Callbacks

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — anchors `getStatus`, `push`, `commit`, `getLog`, and `getRemotes`.

- [ ] **Step 1: Establish the Task 3 focused baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js ./server/src/domains/git/service.ts
```

Expected: only direct callback annotations whose source is already typed by `simple-git` remain from this plan's scope. The adjacent return-object casts, `@ts-ignore`, options casts, and `normalizePushResult(result: any)` remain explicitly deferred.

- [ ] **Step 2: Rely on existing `simple-git` inference at direct response callbacks**

Remove `: any` from callback parameters when their array source is a direct, typed `simple-git` response. Do not add an explicit annotation unless inference fails; if it does, import the exact type from `simple-git` rather than inventing a local approximation.

```ts
// StatusResult.files is FileStatusResult[].
status.files.map(async (file) => {
  // ... existing body ...
});

// getRemotes(true) is RemoteWithRefs[].
remotes.find((entry) => entry.name === "origin");
remotes.map((remote) => ({
  name: remote.name,
  fetchUrl: remote.refs.fetch,
  pushUrl: remote.refs.push,
}));

// Default git.log() entries retain their inferred log fields.
baseLog.all.map((entry) => ({
  // ... existing field projection ...
}));
```

Apply this only to:

- `getStatus`: both `status.files.map(...)` projections.
- `push`: `remotes.find(...)` fallback selection.
- `commit`: `status.files.map(...)` used for `fileStatusByPath`.
- `getLog`: `baseLog.all.map(...)` merged log projection.
- `getRemotes`: `remotes.map(...)` API projection.

Do not type or alter `normalizePushResult(result: any)`, options passed to `git.push`, any `return ... as any`, or nearby `@ts-ignore` comments. Those represent the deferred exported-contract slice.

- [ ] **Step 3: Inspect the Task 3 diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts
```

Expected: only removed `: any` annotations from direct `simple-git` callback parameters. No import is added unless compilation demonstrates inference is insufficient; no public function signature, response-object shape, or push/commit behavior changes.

- [ ] **Step 4: Run server and repository type-checks, then inspect focused lint**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
bunx eslint packages/web/server/src/domains/git/service.ts --format json > /tmp/git-service-lint-task-3.json || true
```

Expected: both type-check commands exit 0. The JSON output has no `no-explicit-any` messages at every Task 3 direct-response callback anchor. Full-file lint remains nonzero only for deferred categories and unrelated blocking lint debt.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): infer git response callbacks"
```

### Task 4: Verify This Git Typing Subset and Record Its Completion

**Files:**
- Modify: `.superpawers/plans/2026-07-10-git-service-mechanical-typing.md` — mark this subset plan complete after all gates pass.

- [ ] **Step 1: Inspect the complete Git service subset diff**

Run:

```bash
git diff 7f82984c..HEAD -- packages/web/server/src/domains/git/service.ts
```

Expected: the changes from this plan are erased annotations only: scalar callback types, private utility parameter types, and direct `simple-git` inference. No exported service signatures, Git command arrays, return-object shapes, error-handling branches, options casts, or worktree/project helpers change.

- [ ] **Step 2: Run final type-check gates**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
```

Expected: both commands exit 0.

- [ ] **Step 3: Verify all selected annotations are removed without claiming full lint cleanliness**

Run:

```bash
bunx eslint packages/web/server/src/domains/git/service.ts --format json > /tmp/git-service-lint-final.json || true
python3 -c '
import json
messages = json.load(open("/tmp/git-service-lint-final.json"))[0]["messages"]
unexpected = [m for m in messages if m.get("ruleId") == "@typescript-eslint/no-explicit-any" and m["line"] in {56, 68, 169, 192, 208, 210, 682, 695, 697, 940, 946, 958, 986, 1313, 1317, 1319, 1346, 1417, 1430, 1450, 1517, 1613, 1659, 1674, 1682, 1687, 1703, 1710, 1715, 1733, 1748, 2005, 2114, 2123, 2124, 2130, 2183, 2187, 2216, 2725, 2765, 2770, 2771, 2782, 2801, 2832, 2833, 3069, 3073, 3113, 3339}]
if unexpected:
    locations = ", ".join("{}:{}".format(m["line"], m["column"]) for m in unexpected)
    raise SystemExit("Selected no-explicit-any locations remain: " + locations)
print("Selected Git service annotations are clear.")
'
```

Expected: the script exits 0. Full-file ESLint is expected to retain errors from deferred worktree helpers, exported return contracts, options casts, error adapters, MIME-map indexing, and unrelated non-`any` lint rules.

The selected-line set is valid only because Tasks 1–3 replace same-line annotations without adding or removing surrounding lines. If an implementation changes line structure, regenerate the set from the post-edit ESLint JSON rather than trusting these historical locations.

- [ ] **Step 4: Mark only this subset plan complete**

Leave the parent spec's `git-service-typing` chunk as `Status: planned`: this plan excludes the worktree-helper and exported-contract portions of that chunk. Set this plan's frontmatter to `status: complete`, retain `updated: 2026-07-10`, set `next_action: "Plan the Git worktree helper typing subset"`, and check off all plan steps.

- [ ] **Step 5: Commit completion metadata**

```bash
git add .superpawers/plans/2026-07-10-git-service-mechanical-typing.md
git commit -m "docs: complete git service mechanical typing plan"
```

## Execution Handoff

Plan complete and saved to `.superpawers/plans/2026-07-10-git-service-mechanical-typing.md`. It covers a subset of chunk: `git-service-typing`. Next step: `subagent-driven-development`.
