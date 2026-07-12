---
kind: plan
status: active
parent_spec: .superpawers/specs/2026-07-09-lint-integration-readiness-design.md
covers_chunks:
  - git-service-typing
created: 2026-07-12
updated: 2026-07-12
next_action: "Execute Task 1"
---

# Git Simple Success Result Typing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six Git service `Promise<boolean>` declarations that already return `{ success: true }` with one explicit exported result type, removing their `as any` casts without changing HTTP responses.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`

**Architecture:** Define the shared success-only wire shape once in the Git domain type module and re-export it through the existing barrel. Apply that type only to operations whose every successful return is already `{ success: true }`; routes continue to forward each result unchanged through `res.json(result)`.

**Tech Stack:** TypeScript strict mode, Express, simple-git, ESLint, Bun.

---

## Chunk Coverage

This plan covers the success-only result contract for `deleteRemoteBranch`, `fetch`, `deleteBranch`, `removeRemote`, `abortRebase`, and `abortMerge` in `packages/web/server/src/domains/git/service.ts`. Each is exported, currently declares `Promise<boolean>`, and already returns precisely `{ success: true }` on success.

This plan does not cover branch-bearing results (`createBranch`, `checkoutBranch`, `renameBranch`), rich pull/push/commit results, conflict-reporting rebase/merge results, `as any` option casts, `@ts-ignore` directives, error-boundary narrowing, or any route/client behavior changes. The parent `git-service-typing` chunk remains `planned` after this plan.

## File Structure

- Modify: `packages/web/server/src/domains/git/types.ts` — define the public `GitSuccessResult` result shape.
- Modify: `packages/web/server/src/domains/git/index.ts` — re-export `GitSuccessResult` alongside existing Git domain types.
- Modify: `packages/web/server/src/domains/git/service.ts` — import `GitSuccessResult`, change the six declared return types, and remove only their success-return `as any` casts.
- Modify: `.superpawers/plans/2026-07-12-git-simple-success-result-typing.md` — mark the plan complete after verification.

No test file is added. These functions already emit the target JSON shape and every server route forwards it directly with `res.json(result)`. Strict type-checking plus focused lint probes prove the declarations and casts align; no runtime logic changes are permitted.

### Task 1: Define and Re-export the Success Result Contract

**Files:**
- Modify: `packages/web/server/src/domains/git/types.ts` — add `GitSuccessResult` next to the other Git operation result types.
- Modify: `packages/web/server/src/domains/git/index.ts` — add `GitSuccessResult` to the explicit `export type` list.
- Modify: `packages/web/server/src/domains/git/service.ts` — add `GitSuccessResult` to the existing type import from `./types.js`.

- [ ] **Step 1: Record the six-return lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js --format json "./server/src/domains/git/service.ts" > /tmp/git-success-result-lint.json || true
node -e '
const fs = require("node:fs")
const [{ messages }] = JSON.parse(fs.readFileSync("/tmp/git-success-result-lint.json", "utf8"))
const source = fs.readFileSync("server/src/domains/git/service.ts", "utf8").split("\n")
const names = ["deleteRemoteBranch", "fetch", "deleteBranch", "removeRemote", "abortRebase", "abortMerge"]
const ranges = names.map((name) => {
  const start = source.findIndex((line) => line.includes(`export async function ${name}(`))
  if (start < 0) throw new Error(`Missing ${name}`)
  const end = source.findIndex((line, index) => index > start && line.startsWith("export async function "))
  return { name, start: start + 1, end: end < 0 ? source.length : end + 1 }
})
const matches = messages.filter((message) => message.ruleId === "@typescript-eslint/no-explicit-any" && ranges.some(({ start, end }) => message.line >= start && message.line < end))
console.log(`success-result any baseline: ${matches.length}`)
if (matches.length !== 6) process.exit(1)
'
```

Expected: `success-result any baseline: 6`, one `as any` return cast in each named function. The full file remains lint-failing for deferred Git service work.

- [ ] **Step 2: Add the single public result shape and follow the established type-barrel pattern**

In `types.ts`, insert this interface immediately after `GitDeleteBranchOptions` and before `GitWorktreeEntry`, which begins the worktree-only type group:

```ts
export interface GitSuccessResult {
  success: boolean;
}
```

In `index.ts`, add `GitSuccessResult` to the existing `export type { ... } from "./types.js"` list. In `service.ts`, add it to the existing `import type { ... } from "./types.js"` list. Do not add a second barrel, a local duplicate type, or a type alias that permits additional fields.

- [ ] **Step 3: Inspect the contract-only diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/types.ts packages/web/server/src/domains/git/index.ts packages/web/server/src/domains/git/service.ts
```

Expected: one exported interface and its two type-only references. No route or runtime expressions change in this task.

- [ ] **Step 4: Run server type-check**

Run:

```bash
bun run --cwd packages/web type-check:server
```

Expected: exit 0. The new result type is available to the service through the existing type import and to domain consumers through the existing barrel.

- [ ] **Step 5: Commit the shared result contract**

```bash
git add packages/web/server/src/domains/git/types.ts packages/web/server/src/domains/git/index.ts packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): define git success result contract"
```

### Task 2: Align Success-Only Service Return Types

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — update the declared result type and success return in six exported functions.
- Reference only: `packages/web/server/src/domains/git/routes.ts` — confirm each route continues to pass the unchanged value directly to `res.json(result)`.

- [ ] **Step 1: Confirm route forwarding and current success shapes**

Inspect these semantic anchors in `service.ts` and their direct routes:

| Service function | Service success anchor | Route anchor |
| --- | --- | --- |
| `deleteRemoteBranch` | `return { success: true } as any` | `DELETE /api/git/remote-branches` |
| `fetch` | `return { success: true } as any` | `POST /api/git/fetch` |
| `deleteBranch` | `return { success: true } as any` | `DELETE /api/git/branches` |
| `removeRemote` | `return { success: true } as any` | `DELETE /api/git/remotes` |
| `abortRebase` | `return { success: true } as any` | `POST /api/git/rebase/abort` |
| `abortMerge` | `return { success: true } as any` | `POST /api/git/merge/abort` |

Expected: every route uses `const result = await ...; res.json(result);` with no transformation. Do not modify routes.

- [ ] **Step 2: Replace the six false boolean declarations and their casts**

At each of the six named exported function anchors, apply this exact local pattern:

```ts
// Before
export async function example(/* existing parameters */): Promise<boolean> {
  // ... existing behavior ...
  return { success: true } as any;
}

// After
export async function example(/* preserve existing parameters */): Promise<GitSuccessResult> {
  // ... existing behavior ...
  return { success: true };
}
```

Apply it to only these functions: `deleteRemoteBranch`, `fetch`, `deleteBranch`, `removeRemote`, `abortRebase`, and `abortMerge`. Preserve all parameters, defaults, `try`/`catch` blocks, Git command arrays, error logging, and return object values exactly. Do not alter the adjacent `git.fetch as any` options cast in `fetch`; it belongs to the deferred options-boundary work. Do not change `createBranch`, `checkoutBranch`, `renameBranch`, `pull`, `push`, `commit`, `rebase`, `merge`, `continueRebase`, or `continueMerge`.

- [ ] **Step 3: Inspect the route-neutral service diff**

Run:

```bash
git diff -- packages/web/server/src/domains/git/service.ts packages/web/server/src/domains/git/routes.ts
```

Expected: exactly six return annotations and six `as any` removals in `service.ts`; `routes.ts` has no diff. The existing runtime JSON remains `{ "success": true }`.

- [ ] **Step 4: Run type and focused lint validation**

Run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Then rerun the Task 1 lint probe. Expected: it reports `success-result any baseline: 0`; all remaining `no-explicit-any` diagnostics are deferred categories outside the six function ranges.

- [ ] **Step 5: Commit the aligned service contracts**

```bash
git add packages/web/server/src/domains/git/service.ts
git commit -m "fix(lint): type git success-only operations"
```

### Task 3: Verify the Public Result Subset and Complete Plan Metadata

**Files:**
- Modify: `packages/web/server/src/domains/git/service.ts` — verification only.
- Modify: `packages/web/server/src/domains/git/types.ts` — verification only.
- Modify: `packages/web/server/src/domains/git/index.ts` — verification only.
- Modify: `.superpawers/plans/2026-07-12-git-simple-success-result-typing.md` — complete metadata and checkboxes.
- Modify: `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md` — leave `git-service-typing` at `Status: planned`.

- [ ] **Step 1: Inspect the implementation diff against the cleanup baseline**

Run:

```bash
git diff --stat 7f82984c..HEAD -- packages/web/server/src/domains/git/types.ts packages/web/server/src/domains/git/index.ts packages/web/server/src/domains/git/service.ts
git diff 7f82984c..HEAD -- packages/web/server/src/domains/git/types.ts packages/web/server/src/domains/git/index.ts packages/web/server/src/domains/git/service.ts
```

Expected: this plan's changes define one shared result type, re-export it, and replace only six matching `Promise<boolean>` annotations and success-return casts. No route, command, error, or JSON response behavior changes.

- [ ] **Step 2: Run server and repository type-checks**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
```

Expected: both commands exit 0.

- [ ] **Step 3: Assert the six success-only function ranges are free of active `any` diagnostics**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js --format json "./server/src/domains/git/service.ts" > /tmp/git-success-result-lint.json || true
node -e '
const fs = require("node:fs")
const [{ messages }] = JSON.parse(fs.readFileSync("/tmp/git-success-result-lint.json", "utf8"))
const source = fs.readFileSync("server/src/domains/git/service.ts", "utf8").split("\n")
const names = ["deleteRemoteBranch", "fetch", "deleteBranch", "removeRemote", "abortRebase", "abortMerge"]
const ranges = names.map((name) => {
  const start = source.findIndex((line) => line.includes(`export async function ${name}(`))
  if (start < 0) throw new Error(`Missing ${name}`)
  const end = source.findIndex((line, index) => index > start && line.startsWith("export async function "))
  return { name, start: start + 1, end: end < 0 ? source.length : end + 1 }
})
const remaining = messages.filter((message) => message.ruleId === "@typescript-eslint/no-explicit-any" && ranges.some(({ start, end }) => message.line >= start && message.line < end))
if (remaining.length) {
  console.error("Remaining success-result any diagnostics:")
  for (const message of remaining) console.error(`${message.line}:${message.column}`)
  process.exit(1)
}
console.log("PASS: no active no-explicit-any diagnostics in success-only result functions")
'
```

Expected: `PASS: no active no-explicit-any diagnostics in success-only result functions`. This deliberately does not require full-file or repository lint to pass because public rich-result, options-boundary, and error-boundary debt remains.

- [ ] **Step 4: Complete plan tracking without closing the parent chunk**

Update this plan's frontmatter:

```yaml
status: complete
updated: 2026-07-12
next_action: "Plan Git branch-result and rich-result adapter typing"
```

Check every completed checkbox in this plan. In `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`, leave `### Chunk: git-service-typing` at `Status: planned`: branch-bearing, rich, conflict, options-boundary, and error-boundary work still belong to it.

- [ ] **Step 5: Commit the verified plan completion**

```bash
git add .superpawers/plans/2026-07-12-git-simple-success-result-typing.md
git commit -m "docs: complete git success result typing plan"
```
