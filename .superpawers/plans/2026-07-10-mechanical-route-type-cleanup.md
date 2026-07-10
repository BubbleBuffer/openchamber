---
kind: plan
status: complete
parent_spec: .superpawers/specs/2026-07-09-lint-integration-readiness-design.md
covers_chunks:
  - mechanical-route-type-cleanup
created: 2026-07-10
updated: 2026-07-10
next_action: "Plan the remaining mechanical-route subset"
---

# Mechanical Route Type Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all current blocking lint errors from a safe four-file route slice without changing request handling.

**Design Reference:** `.superpawers/specs/2026-07-09-lint-integration-readiness-design.md`

**Architecture:** This plan changes only type annotations, local narrowed shapes, and lint-required cleanup in four live route modules. It deliberately avoids route dependency interfaces and other route modules whose `any` usages require upstream service contracts or adapters. The emitted request-handling logic remains unchanged; focused lint and server type-check are the primary behavioral safety gates.

**Tech Stack:** TypeScript, Express 5 types, ESLint, Bun.

---

## Chunk Coverage

This plan covers the safe, independently-verifiable subset of `mechanical-route-type-cleanup`:

- `domains/routes/core-routes.ts`: Express app/request/response/next annotations and an unknown-safe shutdown error value.
- `domains/routes/static-routes.ts`: the factory return shape.
- `domains/routes/openchamber-routes.ts`: a local persisted restart-options shape, unknown-safe abort checks, and existing local lint cleanup.
- `domains/git/routes.ts`: dynamic module-cache typing and removal of an unused no-dependency parameter.

It does **not** cover `domains/routes/routes.ts`, `feature-routes-runtime.ts`, `pwa-manifest.ts`, or the OpenCode route modules. Those files contain dependency-interface contracts or adapter casts requiring later chunks. It also does not cover warning-only complexity or max-lines findings.

## File Structure

- Modify: `packages/web/server/src/domains/routes/core-routes.ts` — type Express registration functions and middleware without changing handlers.
- Modify: `packages/web/server/src/domains/routes/static-routes.ts` — declare the runtime factory's existing returned object shape.
- Modify: `packages/web/server/src/domains/routes/openchamber-routes.ts` — contain persisted restart configuration and error narrowing in this route module.
- Modify: `packages/web/server/src/domains/git/routes.ts` — type its lazily-loaded Git module cache from the real module and remove its unused empty dependency API.
- No test files — every planned change is type-only or lint-only; no request handling, registration path, or emitted data changes.

### Task 1: Type Core and Static Route Registration

**Files:**
- Modify: `packages/web/server/src/domains/routes/core-routes.ts` — anchors `registerServerStatusRoutes`, `registerAuthAndAccessRoutes`, `registerSettingsUtilityRoutes`, and `registerCommonRequestMiddleware`.
- Modify: `packages/web/server/src/domains/routes/static-routes.ts` — anchor `createStaticRoutesRuntime`.

- [x] **Step 1: Establish the focused lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/routes/core-routes.ts" \
  "./server/src/domains/routes/static-routes.ts"
```

Expected: exit 1 with 50 `@typescript-eslint/no-explicit-any` errors (49 in `core-routes.ts`, 1 in `static-routes.ts`) and warning-only complexity findings.

- [x] **Step 2: Apply the type-only route signatures**

Add a type-only Express import to `core-routes.ts`. Type the `app` parameters as `Express`; type every handler and middleware argument as `Request`, `Response`, or `NextFunction` matching its existing position. Keep handler bodies and registration order unchanged.

```ts
// packages/web/server/src/domains/routes/core-routes.ts
import type { Express, NextFunction, Request, Response } from "express";
import type { CoreRoutesDeps, AuthRoutesDeps, SettingsUtilityRoutesDeps, CommonMiddlewareDeps } from "./types.js";

// ... existing code ...

export function registerServerStatusRoutes(app: Express, deps: CoreRoutesDeps): void {
  // ... existing destructuring ...
  app.get("/health", (_req: Request, res: Response) => {
    // ... existing response ...
  });
  app.post("/api/system/shutdown", (_req: Request, res: Response) => {
    res.json({ ok: true });
    gracefulShutdown({ exitProcess: true }).catch((error: unknown) => {
      console.error("Shutdown request failed:", error instanceof Error ? error.message : error);
    });
  });
}

export function registerAuthAndAccessRoutes(app: Express, deps: AuthRoutesDeps): void {
  // ... existing routes use Request, Response, and NextFunction ...
}

export function registerSettingsUtilityRoutes(app: Express, deps: SettingsUtilityRoutesDeps): void {
  // ... existing routes use Request and Response ...
}

export function registerCommonRequestMiddleware(app: Express, deps: CommonMiddlewareDeps): void {
  // ... existing middleware uses Request, Response, and NextFunction ...
}
```

In `static-routes.ts`, retain the existing `Application` import and state the runtime's returned shape instead of `any`:

```ts
// ... existing imports ...

export function createStaticRoutesRuntime(
  deps: StaticRoutesDeps,
): { registerStaticRoutes: (app: Application) => void } {
  // ... existing implementation ...
}
```

- [x] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- packages/web/server/src/domains/routes/core-routes.ts packages/web/server/src/domains/routes/static-routes.ts
```

Expected: only the Express type import, function/handler annotations, unknown-safe shutdown error access, and static factory return type changed; route paths, handler bodies, and middleware order remain intact.

- [x] **Step 4: Verify the focused lint and server type-check pass**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/routes/core-routes.ts" \
  "./server/src/domains/routes/static-routes.ts"
```

Then run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Expected: focused lint exits 0 errors (warnings may remain); server type-check exits 0.

- [x] **Step 5: Commit Task 1**

```bash
git add packages/web/server/src/domains/routes/core-routes.ts packages/web/server/src/domains/routes/static-routes.ts
git commit -m "fix(lint): type core route registration"
```

### Task 2: Type Local OpenChamber and Git Route Escapes

**Files:**
- Modify: `packages/web/server/src/domains/routes/openchamber-routes.ts` — anchors `storedOptions`, the two model-metadata `catch` blocks, and empty cleanup catches.
- Modify: `packages/web/server/src/domains/git/routes.ts` — anchors `GitRoutesDeps`, `registerGitRoutes`, `gitLibraries`, and `/api/git/discover-credentials`.

- [x] **Step 1: Establish the focused lint baseline**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/routes/openchamber-routes.ts" \
  "./server/src/domains/git/routes.ts"
```

Expected: exit 1 with the existing `no-explicit-any`, unused destructured local, and empty-catch errors in `openchamber-routes.ts`, plus `no-explicit-any`, empty-object-type, and unused-parameter errors in `git/routes.ts`. Warning-only complexity/max-lines findings may remain.

- [x] **Step 2: Replace local casts with narrow local types and remove local lint debt**

In `openchamber-routes.ts`, add a module-local `RestartOptions` shape with `port`, `daemon`, optional `host`, and optional `uiPassword`. Declare `storedOptions` as that type, retaining the existing initial values and JSON read flow. Access `host` and `uiPassword` directly through the typed local value.

Add a module-local unknown-safe `isAbortError(error: unknown): boolean` helper that recognizes an object with `name === "AbortError"`, then use it for both model-metadata status-code decisions. Remove the unused `readSettingsFromDiskMigrated` destructure and replace both empty catches with brief comments that state the intentionally ignored best-effort failure.

```ts
// packages/web/server/src/domains/routes/openchamber-routes.ts
import type { Application, Request, Response } from "express";
// ... existing imports ...

type RestartOptions = {
  port: number;
  daemon: boolean;
  host?: string;
  uiPassword?: string;
};

const isAbortError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "name" in error &&
  (error as { name?: unknown }).name === "AbortError";

// ... existing route registration ...
let storedOptions: RestartOptions = { port: currentPort, daemon: true };
try {
  const content = await fs.promises.readFile(instanceFilePath, "utf8");
  storedOptions = JSON.parse(content) as RestartOptions;
} catch {
  // No prior instance configuration is available.
}
// ... access storedOptions.host and storedOptions.uiPassword directly ...
// ... use isAbortError(error) for both 504/502 choices ...
```

In `git/routes.ts`, remove the unused empty `GitRoutesDeps` interface and optional `_deps` parameter because the only call site invokes `registerGitRoutes(app)`. Type the cache from the actual module, use that cache for credential discovery, and remove the cast and suppression.

```ts
// packages/web/server/src/domains/git/routes.ts
import type { Express, Request, Response } from "express";

export function registerGitRoutes(app: Express): void {
  let gitLibraries: typeof import("./index.js") | null = null;

  const getGitLibraries = async (): Promise<typeof import("./index.js")> => {
    if (!gitLibraries) {
      gitLibraries = await import("./index.js");
    }
    return gitLibraries;
  };

  // ... existing routes ...
  app.get("/api/git/discover-credentials", async (_req: Request, res: Response) => {
    try {
      const { discoverGitCredentials } = await getGitLibraries();
      const credentials = discoverGitCredentials();
      res.json(credentials);
    // ... existing error response ...
    }
  });
}
```

- [x] **Step 3: Inspect the focused diff**

Run:

```bash
git diff -- packages/web/server/src/domains/routes/openchamber-routes.ts packages/web/server/src/domains/git/routes.ts
```

Expected: only local type declarations/narrowing, direct typed property access, removal of unused/empty constructs, and typed dynamic module cache changes. No endpoint paths, response payloads, commands, or update/restart control flow changes.

- [x] **Step 4: Verify the focused lint and server type-check pass**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/routes/openchamber-routes.ts" \
  "./server/src/domains/git/routes.ts"
```

Then run from the repository root:

```bash
bun run --cwd packages/web type-check:server
```

Expected: focused lint exits 0 errors (warnings may remain); server type-check exits 0.

- [x] **Step 5: Commit Task 2**

```bash
git add packages/web/server/src/domains/routes/openchamber-routes.ts packages/web/server/src/domains/git/routes.ts
git commit -m "fix(lint): type local route runtime escapes"
```

### Task 3: Verify the Claimed Chunk and Record Its Completion

**Files:**
- Modify: `.superpawers/plans/2026-07-10-mechanical-route-type-cleanup.md` — after verification, mark this subset plan complete, update `next_action`, and check off completed steps.

- [x] **Step 1: Run the full four-file focused lint gate**

Run from `packages/web`:

```bash
npx eslint --config ../../eslint.config.js \
  "./server/src/domains/routes/core-routes.ts" \
  "./server/src/domains/routes/static-routes.ts" \
  "./server/src/domains/routes/openchamber-routes.ts" \
  "./server/src/domains/git/routes.ts"
```

Expected: exit 0 with 0 errors. Existing complexity and max-lines warnings may remain.

- [x] **Step 2: Run the server and repository type-check gates**

Run:

```bash
bun run --cwd packages/web type-check:server
bun run type-check
```

Expected: both commands exit 0.

- [x] **Step 3: Confirm no route-registration behavior changed**

Run:

```bash
git diff 7f82984c..HEAD -- packages/web/server/src/domains/routes/core-routes.ts packages/web/server/src/domains/routes/static-routes.ts packages/web/server/src/domains/routes/openchamber-routes.ts packages/web/server/src/domains/git/routes.ts
```

Expected: all differences are type annotations, local narrowing helpers/shapes, or removal of unused lint debt; route paths, HTTP methods, response payloads, and handler ordering are unchanged. Do not add a behavior-specific test unless this inspection finds a runtime edit.

- [x] **Step 4: Mark this subset plan complete**

Leave `mechanical-route-type-cleanup` in the parent spec as `Status: planned`: deferred route modules still belong to that chunk. Set this plan frontmatter to `status: complete`, `updated: 2026-07-10`, and `next_action: "Plan the remaining mechanical-route subset"`; check off all plan steps.

- [x] **Step 5: Commit completion metadata**

```bash
git add .superpawers/plans/2026-07-10-mechanical-route-type-cleanup.md
git commit -m "docs: complete mechanical route type cleanup subset plan"
```

## Execution Handoff

Plan complete and saved to `.superpawers/plans/2026-07-10-mechanical-route-type-cleanup.md`. It covers chunk: `mechanical-route-type-cleanup`. Next step: `subagent-driven-development`.
