---
kind: plan
status: active
parent_spec: .superpawers/specs/2026-07-09-lint-integration-readiness-design.md
covers_chunks:
  - local-safe-any-cleanup
created: 2026-07-10
updated: 2026-07-10
next_action: "Execute Task 1"
---

# Local Safe `any` Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the small, directly-derivable `any` usages across seven server-side helpers without changing any runtime behavior.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`

**Architecture:** This plan targets only those `any` usages whose replacement types are derivable directly from local context — narrow object shapes for parsed JSON-like values, module types for dynamic imports, SDK/runtime narrowing for opaque adapter interfaces. It deliberately avoids dependency interfaces (handled in later chunks) and the intentionally permissive `tanstack-react-virtual.ts` test mock. Every change is a type annotation or cast with identical emitted runtime code; focused lint and server type-check are the primary behavioral safety gates.

**Tech Stack:** TypeScript, ESLint, Bun.

---

## Chunk Coverage

This plan covers the entire `local-safe-any-cleanup` chunk as defined by the parent spec. It addresses 19 active `@typescript-eslint/no-explicit-any` errors across 7 small files:

- `opencode-support/watcher.ts` (4 errors) — replace error-field access on `unknown` with safe narrowing.
- `quota/providers/zhipuai.ts` (2 errors) — type config record access through `Record<string, unknown>`.
- `fs/routes.ts` (1 error) — remove redundant dynamic-import cast.
- `scheduled-tasks/runtime.ts` (1 error) — replace `(client.session as any)` with SDK-shaped cast.
- `opencode/services/mcp.ts` (2 errors) — type config destructuring cast.
- `settings/themes.ts` (8 errors) — replace per-field `as any` casts on parsed JSON with a single local `Record<string, unknown>` cast and `unknown` narrowing.
- `event-stream/runtime.ts` (1 error) — type the watcher runtime from its declared interface.

It does **not** cover the 19 individually-suppressed `any`s in `event-stream/runtime.ts` (those need an upstream type design first), the deferred `domains/routes/routes.ts` route module, the `tanstack-react-virtual.ts` mock, the client-side `packages/web/src/api/notifications.ts` (out of scope — chunk targets server-side helpers only), or any remaining `no-unused-vars`, `Function`, or other non-`any` lint debt.

## File Structure

- Modify: `packages/web/server/src/domains/opencode-support/watcher.ts` — narrow the unknown error shape with a local helper.
- Modify: `packages/web/server/src/domains/quota/providers/zhipuai.ts` — type the merged-config access through `Record<string, unknown>`.
- Modify: `packages/web/server/src/domains/fs/routes.ts` — drop the `as any` cast on the dynamic import.
- Modify: `packages/web/server/src/domains/scheduled-tasks/runtime.ts` — narrow `client.session` with a small SDK-shaped interface.
- Modify: `packages/web/server/src/domains/opencode/services/mcp.ts` — type the destructure cast as `Partial<McpEntry> & Record<string, unknown>`.
- Modify: `packages/web/server/src/domains/settings/themes.ts` — consolidate parsed-JSON casts and narrow the `ENOENT` error.
- Modify: `packages/web/server/src/domains/event-stream/runtime.ts` — type the watcher variable from its declared interface and remove the inline disable comment.
- No test files — every planned change is type-only or lint-only; no runtime behavior, no request handling, no emitted JavaScript changes.

### Task 1: Narrow Watcher and Config-Provider Errors

**Files:**
- Modify: `packages/web/server/src/domains/opencode-support/watcher.ts` — anchors `subscribeStatus` callback and `reader.onError` callback.
- Modify: `packages/web/server/src/domains/quota/providers/zhipuai.ts` — anchor `getApiKey` config-options read.
- Modify: `packages/web/server/src/domains/event-stream/runtime.ts` — anchor `ensureGlobalWatcherStarted` watcher variable.

- [ ] **Step 1: Establish the focused three-file lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/opencode-support/watcher.ts" \
  "./server/src/domains/quota/providers/zhipuai.ts" \
  "./server/src/domains/event-stream/runtime.ts"
```

Expected: exit 1 with 7 active `@typescript-eslint/no-explicit-any` errors (4 in `watcher.ts`, 2 in `zhipuai.ts`, 1 in `event-stream/runtime.ts`).

- [ ] **Step 2: Apply the local narrowing without behavior changes**

In `watcher.ts`, add a module-local `unknownMessage(err: unknown): string | undefined` helper that returns the nested or top-level `message` string when present. Replace the status-callback expression `(status.error as any)?.error?.message ?? (status.error as any)?.message ?? status.error` with `unknownMessage(status.error) ?? status.error` (preserving the original `status.error` fallback), and the `onError` expression `(error as any)?.error?.message ?? (error as any)?.message ?? error` with `unknownMessage(error) ?? error`.

In `zhipuai.ts`, within the existing `for (const alias of aliases)` loop, replace the inner `(config as any)?.options?.apiKey` and `(config as any).options.apiKey` accesses with a safe narrowing that preserves the original truthiness check: extract `const options = config?.options;` and replace both access lines with `if (options && typeof options === "object" && "apiKey" in options && options.apiKey) return options.apiKey as string;`. The trailing `&& options.apiKey` preserves the original falsy-string skip semantics; the loop continues to the next alias when the key is missing or empty.

In `event-stream/runtime.ts`, add `import type { OpenCodeWatcherRuntime } from "../opencode-support/types.js";` to the existing type-only imports. Replace `waitForOpenCodePort: null as any,` (line 295) with `waitForOpenCodePort: async () => {},` so the value satisfies the required `() => Promise<void>` dep shape. Also replace `const watcher: any = createOpenCodeWatcherRuntime({...})` with `const watcher: OpenCodeWatcherRuntime = createOpenCodeWatcherRuntime({...})` and remove **only** the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment directly above it (line 293). Do **not** remove the other disable comment further down — it still protects an out-of-scope suppressed `any` and must stay.

- [ ] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- packages/web/server/src/domains/opencode-support/watcher.ts packages/web/server/src/domains/quota/providers/zhipuai.ts packages/web/server/src/domains/event-stream/runtime.ts
```

Expected: only the new helper, narrowed reads, watcher type, and removed disable comment changed. No console strings, no log ordering, no SDK call signatures changed.

- [ ] **Step 4: Verify the focused lint and server type-check pass**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/opencode-support/watcher.ts" \
  "./server/src/domains/quota/providers/zhipuai.ts" \
  "./server/src/domains/event-stream/runtime.ts"
```

Then run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Expected: focused lint exits 0 errors (warnings may remain); server type-check exits 0.

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/web/server/src/domains/opencode-support/watcher.ts packages/web/server/src/domains/quota/providers/zhipuai.ts packages/web/server/src/domains/event-stream/runtime.ts
git commit -m "fix(lint): type local error and config helpers"
```

### Task 2: Type Local FS, Scheduled-Tasks, and MCP Escapes

**Files:**
- Modify: `packages/web/server/src/domains/fs/routes.ts` — anchor `resolveWorkspacePathFromWorktrees` dynamic import.
- Modify: `packages/web/server/src/domains/scheduled-tasks/runtime.ts` — anchor `client.session` command invocation.
- Modify: `packages/web/server/src/domains/opencode/services/mcp.ts` — anchor `createMcpConfig` and `updateMcpConfig` destructures.

- [ ] **Step 1: Establish the focused three-file lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/fs/routes.ts" \
  "./server/src/domains/scheduled-tasks/runtime.ts" \
  "./server/src/domains/opencode/services/mcp.ts"
```

Expected: exit 1 with 4 active `@typescript-eslint/no-explicit-any` errors (1 in `fs/routes.ts`, 1 in `scheduled-tasks/runtime.ts`, 2 in `opencode/services/mcp.ts`).

- [ ] **Step 2: Apply the local type narrowing**

In `fs/routes.ts`, drop the `as any` from `await import("../git/index.js" as any)` so the import resolves directly to `typeof import("../git/index.js")`. The existing destructure pattern `(await import("../git/index.js")) as { getWorktrees: (dir: string) => Promise<Array<{ path?: string; worktree?: string }>> }` becomes a typed alias instead of a cast.

In `scheduled-tasks/runtime.ts`, the SDK already exports a fully-typed `command` method on `Session2` that matches the existing call shape. Simply remove the `as any` cast: change `(client.session as any).command(...)` to `client.session.command(...)`. No inline cast or interface is needed.

In `mcp.ts`, replace the two destructure casts as separate edits. First (line 128): change `const { name: _ignoredName, ...entryData } = mcpConfig as any;` to `const { name: _ignoredName, ...entryData } = mcpConfig as Partial<McpEntry> & Record<string, unknown>;`. Second (line 160): change `const { name: _ignoredName, ...updateData } = updates as any;` to `const { name: _ignoredName, ...updateData } = updates as Partial<McpEntry> & Record<string, unknown>;`. If `@typescript-eslint/no-unused-vars` fires on either underscore-prefixed `name` binding, replace that destructure with `const { name, ...entryData } = ...; void name;` to document intentional discard.

- [ ] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- packages/web/server/src/domains/fs/routes.ts packages/web/server/src/domains/scheduled-tasks/runtime.ts packages/web/server/src/domains/opencode/services/mcp.ts
```

Expected: only import narrowing, inline SDK-shape, and destructure cast annotations changed. No call signatures, no control flow, no JSON.stringify paths changed.

- [ ] **Step 4: Verify the focused lint and server type-check pass**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/fs/routes.ts" \
  "./server/src/domains/scheduled-tasks/runtime.ts" \
  "./server/src/domains/opencode/services/mcp.ts"
```

Then run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Expected: focused lint exits 0 errors (warnings may remain); server type-check exits 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/web/server/src/domains/fs/routes.ts packages/web/server/src/domains/scheduled-tasks/runtime.ts packages/web/server/src/domains/opencode/services/mcp.ts
git commit -m "fix(lint): type local fs/scheduled-tasks/mcp helpers"
```

### Task 3: Replace Per-Field Casts in `settings/themes.ts`

**Files:**
- Modify: `packages/web/server/src/domains/settings/themes.ts` — anchors `normalizeThemeJson`, `readCustomThemesFromDisk` metadata access, and ENOENT detection.

- [ ] **Step 1: Establish the focused lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js ./server/src/domains/settings/themes.ts
```

Expected: exit 1 with 8 active `@typescript-eslint/no-explicit-any` errors at lines 14:30, 14:62, 14:99, 15:28, 15:58, 15:93, 136:37, and 152:59.

- [ ] **Step 2: Consolidate JSON parsing and narrow the ENOENT check**

Replace the two metadata/colors lines that currently use three per-field `(raw as any)` casts each with a single typed alias at the top of `normalizeThemeJson`:

```ts
const r = (raw ?? {}) as Record<string, unknown>;
const metadata = r.metadata && typeof r.metadata === "object" ? r.metadata as Record<string, unknown> : null;
const colors = r.colors && typeof r.colors === "object" ? r.colors as Record<string, unknown> : null;
```

The downstream accesses (`metadata.id`, `metadata.name`, `metadata.variant`, `metadata.description`, `metadata.version`, `metadata.tags`, `colors.primary`, etc.) keep their existing `unknown`/`isNonEmptyString` guards unchanged. No semantic change.

Replace `(normalized as any).metadata?.id` with `(normalized as { metadata?: { id?: string } }).metadata?.id`.

Replace `(error as any).code === "ENOENT"` with the same unknown-safe narrowing pattern used elsewhere in this codebase: `typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT"`.

- [ ] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- packages/web/server/src/domains/settings/themes.ts
```

Expected: only the JSON-cast consolidation, the `normalized` typed alias, and the ENOENT unknown-narrowing changed. No validator behavior, no return object shape, no required-field list, no tag filter logic changed.

- [ ] **Step 4: Verify the focused lint and server type-check pass**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js ./server/src/domains/settings/themes.ts
```

Then run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Expected: focused lint exits 0 errors (warning-only complexity findings may remain); server type-check exits 0.

- [ ] **Step 5: Commit Task 3**

```bash
git add packages/web/server/src/domains/settings/themes.ts
git commit -m "fix(lint): type themes parsed JSON access"
```

### Task 4: Verify the Claimed Chunk and Record Its Completion

**Files:**
- Modify: `.superpawers/plans/2026-07-10-local-safe-any-cleanup.md` — after verification, mark this plan complete, update `next_action`, and check off completed steps.

- [ ] **Step 1: Run the full seven-file focused lint gate**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/opencode-support/watcher.ts" \
  "./server/src/domains/quota/providers/zhipuai.ts" \
  "./server/src/domains/event-stream/runtime.ts" \
  "./server/src/domains/fs/routes.ts" \
  "./server/src/domains/scheduled-tasks/runtime.ts" \
  "./server/src/domains/opencode/services/mcp.ts" \
  "./server/src/domains/settings/themes.ts"
```

Expected: exit 0 with 0 `no-explicit-any` errors across the seven files. Pre-existing complexity and max-lines warnings may remain.

- [ ] **Step 2: Run the server and repository type-check gates**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
```

Expected: both commands exit 0.

- [ ] **Step 3: Confirm no runtime behavior changed**

Run:

```bash
git diff 7f82984c..HEAD -- packages/web/server/src/domains/opencode-support/watcher.ts packages/web/server/src/domains/quota/providers/zhipuai.ts packages/web/server/src/domains/event-stream/runtime.ts packages/web/server/src/domains/fs/routes.ts packages/web/server/src/domains/scheduled-tasks/runtime.ts packages/web/server/src/domains/opencode/services/mcp.ts packages/web/server/src/domains/settings/themes.ts
```

Expected: all differences are type annotations, local narrowing helpers/shapes, or removal of inline disable comments. No function bodies, control flow, command strings, response objects, or error handling changed. Do not add a behavior-specific test unless this inspection finds a runtime edit.

- [ ] **Step 4: Mark this plan complete and update spec tracking**

Set this plan frontmatter to `status: complete`, `updated: 2026-07-10`, and `next_action: "Plan the next uncovered chunk (git-service-typing)"`; check off all plan steps.

In `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`, set the `local-safe-any-cleanup` chunk to `Status: complete` and update the file's frontmatter `updated` date.

- [ ] **Step 5: Commit completion metadata**

```bash
git add .superpawers/specs/2026-07-09-lint-integration-readiness-design.md .superpawers/plans/2026-07-10-local-safe-any-cleanup.md
git commit -m "docs: complete local safe any cleanup plan"
```

## Execution Handoff

Plan complete and saved to `.superpawers/plans/2026-07-10-local-safe-any-cleanup.md`. It covers chunk: `local-safe-any-cleanup`. Next step: `subagent-driven-development`.