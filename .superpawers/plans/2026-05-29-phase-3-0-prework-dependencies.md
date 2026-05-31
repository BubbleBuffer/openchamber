# Phase 3.0 Prework And Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the Phase 3 working branch, install XState dependencies in the correct packages, and create the empty shared session-state workspace.

**Architecture:** This plan performs branch and package setup only. It must not introduce machine semantics, bridge behavior, or adapter migration.

**Tech Stack:** Git, Bun workspaces, TypeScript project references, XState v5, `@xstate/react`.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Dependency placement, branch reconciliation, package boundaries, and baseline verification are specific and consistent with the spec.

## Files

- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `tsconfig.json`
- Modify: `packages/ui/package.json`
- Modify: `packages/web/package.json`
- Create: `packages/session-state/package.json`
- Create: `packages/session-state/tsconfig.json`
- Create: `packages/session-state/DOCUMENTATION.md`
- Create: `packages/session-state/src/index.ts`

## Task 1: Reconcile Branch State

- [ ] **Step 1: Verify current branch and cleanliness**

Run: `git status --short --branch`

Expected: branch is `feature/chat-adapter-modularization-spec` or another user-approved isolated feature branch, with no dirty files unrelated to this work.

- [ ] **Step 2: Check whether the server import fix is present**

Inspect `packages/web/server/lib/opencode/runtime.js` and verify auth/network imports resolve to existing files after the current branch state.

Expected: either imports already target existing `auth` and `network` runtime files, or the only required change is the spec-described import-path fix.

- [ ] **Step 3: Rebase only if Phase 1b is missing**

Run: `test -f packages/web/server/lib/core/event-bus.js && test -f packages/web/server/lib/opencode/session/session-runtime.js`

Expected: command exits 0 on the current branch. If it fails, stop and ask the user whether to rebase onto `feature/phase-1b-runtime-extractions` before continuing.

## Task 2: Add Workspace Package Skeleton

- [ ] **Step 1: Create package manifest**

Create `packages/session-state/package.json`:

```json
{
  "name": "@openchamber/session-state",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit",
    "test": "bun test ./src/**/*.test.ts"
  },
  "dependencies": {
    "xstate": "^5.19.2"
  },
  "devDependencies": {
    "typescript": "^5.9.2"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/session-state/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create initial public barrel**

Create `packages/session-state/src/index.ts`:

```ts
export const SESSION_SNAPSHOT_VERSION = 1 as const
```

- [ ] **Step 4: Create module documentation**

Create `packages/session-state/DOCUMENTATION.md`:

```markdown
# session-state

## Purpose

`@openchamber/session-state` owns the runtime-agnostic session-domain state machine used by web server and UI runtime bridges.

## Boundaries

This package may import XState and TypeScript-only types. It must not import React, DOM APIs, Express, OpenCode SDK clients, EventBus instances, AbortController, timers, filesystem APIs, browser globals, Zustand stores, or server runtimes.

## Public Exports

The package exports canonical session machine types, actor-key helpers, snapshots, validation, selectors, invariants, snapshot restoration helpers, and fixture runner utilities.

## Failure Handling

Invalid domain events, invalid snapshot restoration input, invalid snapshots, duplicate actor identity, non-serializable data, and impossible transitions fail fast in development, test, and CI. Production fatal containment is actor-local and represented in the canonical snapshot.

## Contributing

Keep state semantics in this package. Bridges translate inputs and execute effects; they do not recreate lifecycle, retry, streaming, history, permission, question, or fatal recovery rules.
```

## Task 3: Wire Workspace Dependencies

- [ ] **Step 1: Add root TypeScript reference and path alias**

Modify `tsconfig.json` so `references` includes:

```json
{ "path": "./packages/session-state" }
```

Modify `compilerOptions.paths` so it includes:

```json
"@openchamber/session-state": ["packages/session-state/src/index.ts"],
"@openchamber/session-state/*": ["packages/session-state/src/*"]
```

- [ ] **Step 2: Add UI dependencies**

Modify `packages/ui/package.json` dependencies:

```json
"@openchamber/session-state": "workspace:*",
"@xstate/react": "^5.0.2"
```

- [ ] **Step 3: Add web dependency**

Modify `packages/web/package.json` dependencies:

```json
"@openchamber/session-state": "workspace:*"
```

- [ ] **Step 4: Install dependency lockfile changes**

Run: `bun install`

Expected: `bun.lock` updates with `xstate` and `@xstate/react`; no install errors.

## Task 4: Baseline Verification

- [ ] **Step 1: Verify the new package type-checks**

Run: `bun run --cwd packages/session-state type-check`

Expected: exits 0.

- [ ] **Step 2: Verify root type-check and lint**

Run: `bun run type-check`

Expected: exits 0.

Run: `bun run lint`

Expected: exits 0 with no lint errors.

- [ ] **Step 3: Verify existing chat tests still pass**

Run: `bun test packages/ui/src/components/chat/`

Expected: exits 0.

- [ ] **Step 4: Commit**

Run: `git add package.json bun.lock tsconfig.json packages/ui/package.json packages/web/package.json packages/session-state && git commit -m "chore: add session state workspace"`

Expected: commit succeeds.
