---
kind: plan
status: completed
base_branch: feature/lint-integration-readiness
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - server-cli-decomposition
created: 2026-07-26
updated: 2026-07-26
next_action:
verification:
  - Final comprehensive: 46 server-domain test files/203 tests, type-check, full build, check:contracts, test:web 18 pass/2 skip, integration 53 pass/2 skip, docs:validate 7/7, diff-check all PASS under safe OPENCODE_SKIP_START=true OPENCODE_PORT=49998.
  - Lifecycle repair: 8 focused files/38 tests plus HMR external-vs-managed ownership and pending watcher cancellation, type-check, build:web-server, check:contracts, diff-check PASS.
  - scripts/verify.sh: inherited lint failure; base/current web lint both 343 errors/941 warnings, tests 36/4, session-state 0/5; no new errors, two existing complexity-category warnings in new files; build phase not reached after lint.
---

# Server Startup Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the OpenChamber server entrypoint a thin, explicit composition and lifecycle adapter while preserving its routes, startup ordering, OpenCode integration, authentication, streaming, shutdown, and externally managed OpenCode behavior.

**Design Reference:** Approved chat design summary: keep the OpenChamber server; decompose server startup/lifecycle responsibilities; treat externally managed OpenCode as a deployment option rather than removing the backend or its capabilities.

## Chunk Coverage

This plan covers only the server-startup portion of `server-cli-decomposition`. CLI parsing, command handlers, persistence helpers, and `packages/web/bin/cli.js` remain for a later plan in the same chunk.

## Approved Design Summary

- `packages/web/server/src/index.ts` remains the public `startWebUiServer` entrypoint and retains its existing controller shape.
- Domain route registrars, network contracts, authentication behavior, OpenCode proxy behavior, terminal/event-stream transports, and shutdown semantics remain unchanged.
- Runtime factories are assembled through an explicit bootstrap composition boundary; the late-bound OpenCode runtime reference and shared lifecycle state remain correct across repeated starts and stops.
- Externally managed OpenCode continues to work through the existing environment/configuration path; this plan does not remove process management or introduce a hosted control plane.
- Any stale/dead helper cleanup is limited to code made redundant by the extraction and requires direct reference evidence plus regression coverage.

### Task 1: Characterize the server entry boundary

- [x] **Outcome:** The current server startup contract and extraction seams have executable characterization coverage before composition code moves.

**Files and anchors:**
- Modify: `packages/web/server/src/__tests__/bootstrap.test.ts` — extend the `startWebUiServer` coverage for controller lifecycle, health response, sequential start-stop-start, repeated/concurrent stop, and externally managed OpenCode configuration without asserting implementation details.
- Modify: `packages/web/server/src/domains/bootstrap/shutdown-runtime.test.ts` — preserve and, where needed, make ordering and failed-then-retry assertions explicit around `createGracefulShutdownRuntime`.
- Create: `packages/web/server/src/domains/bootstrap/server-composition.test.ts` — test the new composition seam, including late-bound OpenCode references, stable module-lifetime callbacks, required dependency wiring, and state reset/reuse across sequential starts.
- Inspect: `packages/web/server/src/index.ts` — use the existing `main`, `ensureOpenCodeDomain`, `syncToHmrState`, `bootstrapOpenCodeAtStartup`, and module-state closures as characterization anchors.

**Constraints:**
- Tests must assert observable behavior or explicit dependency wiring, not line counts or private implementation names.
- Do not change route behavior, authentication policy, OpenCode process policy, or shutdown ordering while adding characterization coverage.
- The external-OpenCode characterization uses isolated module loading with environment variables set before importing the server entry, or a composition-level environment injection seam; it asserts configured host/port, skipped managed-process start, and no external-process stop without contacting a real external service.
- Never use process-name matching commands; existing PID-safe test helpers remain authoritative.

**Dependencies:**
- None.

**Proof:**
- Focused bootstrap, shutdown, and composition tests pass before extraction and demonstrate the current controller, startup, late-binding, repeated invocation, and retry behavior.
- `git diff --check` passes.

### Task 2: Extract runtime and lifecycle composition

- [x] **Outcome:** Inline runtime construction and event-bus/lifecycle assembly move behind one explicit bootstrap composition module without changing dependency order or shared-state semantics.

**Files and anchors:**
- Create: `packages/web/server/src/domains/bootstrap/server-composition.ts` — own the runtime factory assembly currently spanning `index.ts` settings normalization through `gracefulShutdownRuntime`, including the OpenCode late-binding proxy, notification/session/event-stream wiring, health/watchers, and lifecycle callbacks; return a typed composition object consumed by the entrypoint.
- Create: `packages/web/server/src/domains/bootstrap/server-composition.types.ts` only if the existing `bootstrap/types.ts` cannot express the returned composition without widening unrelated domain contracts; keep public types focused on composition dependencies and controller state.
- Modify: `packages/web/server/src/index.ts` — replace the inline factory block and event-bus subscriptions with the composition factory while preserving module-level state accessors needed by shutdown, HMR, notification clients, and repeated `main` calls.
- Modify: `packages/web/server/src/domains/bootstrap/index.ts` — export the composition factory only if the existing bootstrap export boundary is the local precedent.
- Modify: `packages/web/server/src/domains/bootstrap/server-composition.test.ts` — cover dependency order, late-bound OpenCode calls after initialization, shared client sets, and failure-safe construction.

**Constraints:**
- Preserve the current creation order, lazy `ensureOpenCodeDomain()` behavior, OpenCode proxy identity, event-bus subscriptions, environment resolution, settings paths, notification clients, and lifecycle state.
- The returned composition has explicit `state` ownership for `signalsAttached`, `server`, `expressApp`, `uiAuthController`, `terminalRuntime`, `messageStreamRuntime`, `exitOnShutdown`, and `globalWatcherStartPromise`; it exposes `openCodeRuntime`, `ensureOpenCodeDomain`, `bootstrapOpenCodeAtStartup`, `syncToHmrState`, `syncFromHmrState`, `gracefulShutdown`, and the existing runtime/route-pipeline objects consumed by `main`.
- `main` receives one composition instance per server lifecycle; lazy domain initialization remains memoized within that instance, callbacks keep stable references to the composition state, and a completed stop clears only per-run resources while preserving HMR state and the late-bound proxy contract for the next supported start.
- Do not move route registration into domain code or create a second route registry; `bootstrapRuntime`, `featureRoutesRuntime`, and `startupPipelineRuntime` remain the route/startup owners.
- Do not replace explicit dependency objects with hidden global imports or a service locator.
- Keep externally managed OpenCode support and `OPENCODE_SKIP_START` behavior unchanged.

**Dependencies:**
- Task 1.

**Proof:**
- `server-composition.test.ts` proves the extracted factory wires required dependencies and preserves late binding.
- Existing domain contract, route, event-stream, OpenCode, terminal, and shutdown tests remain green.
- `bun run type-check` and `bun run build:web-server` pass.

### Task 3: Make server startup and shutdown orchestration thin

- [x] **Outcome:** `startWebUiServer` coordinates configuration, app creation, base/feature/static route registration, startup pipeline, Sentry setup, controller return, and shutdown through explicit composition results rather than owning domain construction details.

**Files and anchors:**
- Modify: `packages/web/server/src/index.ts` — narrow `main` and the exported helpers around app creation, `bootstrapRuntime.setupBaseRoutes`, `featureRoutesRuntime.registerRoutes`, `staticRoutesRuntime`, `startupPipelineRuntime.run`, and the returned `WebUiServerController`.
- Modify: `packages/web/server/src/domains/bootstrap/bootstrap-runtime.ts` and `startup-pipeline.ts` only where their existing dependency types need to accept the extracted composition result without changing route or startup order.
- Modify: `packages/web/server/src/domains/bootstrap/types.ts` — define explicit composition/startup result types instead of adding new broad `any` bridges.
- Modify: `packages/web/server/src/shared/types.ts` — preserve and, if necessary, make the controller/config types explicit for `startWebUiServer`, `getPort`, `getOpenCodePort`, `isReady`, `restartOpenCode`, and `stop`.
- Modify: `packages/web/server/src/__tests__/bootstrap.test.ts` — add mandatory failure-injection regressions for route-registration, OpenCode/startup-stage, and HTTP-listen failures.
- Modify: `packages/web/server/src/domains/bootstrap/startup-pipeline.ts` — preserve the exact current stage sequence while adding a rollback boundary that tracks created terminal/message-stream/server resources and the nonblocking OpenCode bootstrap promise.
- Create: `packages/web/server/src/domains/bootstrap/startup-pipeline.test.ts` — add an observable order test for every startup stage and failure-injection tests for each stage.
- Modify: `packages/web/server/src/domains/bootstrap/server-startup.ts` and `packages/web/server/src/domains/bootstrap/types.ts` — make process-handler ownership per server run, return a disposer for signal/unhandled-rejection/uncaught-exception listeners, and keep normal-stop disposal and HMR signal state coherent.

**Constraints:**
- Preserve the complete startup sequence: normalize options; validate the Zen model without blocking; create Express and compression; assign the HTTP server; await `ensureOpenCodeDomain`; set the OpenCode app; register base routes; register feature routes; create static routes; create terminal runtime; create event-stream WebSocket runtime; configure the proxy; schedule API detection; invoke nonblocking OpenCode bootstrap; register static routes; create server-startup runtime; resolve bind host; await HTTP listen; attach process handlers; install Sentry error handling; return the controller.
- Preserve compression bypass for event/notification/terminal SSE and content-type detection.
- Preserve signal attachment controls, `exitOnShutdown`, HMR synchronization, repeated invocation behavior, and controller `getPort()` becoming `null` after stop.
- On any route-registration, OpenCode/startup-stage, or listen failure, roll back only resources already created: close the HTTP server if created/listening, shut down terminal runtime if created, close message-stream runtime if created, stop OpenCode only when this run owns a managed process, and dispose startup handlers/listeners installed by this run. Cleanup failures are logged/retained as secondary diagnostics while the original startup error is rethrown. The nonblocking OpenCode bootstrap promise is observed during rollback so it cannot become an unhandled rejection.
- `attachProcessHandlers` owns exactly the listeners it installs and returns an idempotent disposer; normal `stop()` invokes that disposer before clearing per-run state, while HMR signal state is updated only for handlers that remain installed. Sequential start-stop-start and failed-start-retry tests prove no listener accumulation and no duplicate shutdown invocation.

**Dependencies:**
- Task 2.

**Proof:**
- Bootstrap tests cover random-port startup, `/health`, sequential and concurrent lifecycle behavior, external OpenCode mode, and startup failure cleanup. Startup-pipeline tests prove the complete order and each rollback boundary.
- Route inventory and representative server route tests pass, including authentication, OpenCode, terminal, event-stream, notifications, filesystem, Git, and GitHub seams.
- `bun run type-check`, `bun run build:web-server`, and the focused server test command pass.

### Task 4: Consolidate only extraction-proven helpers and document the boundary

- [x] **Outcome:** Duplicate startup helper logic made redundant by the extraction is removed or redirected, and the server composition boundary is documented without deleting unrelated runtime experiments or CLI code.

**Files and anchors:**
- Modify: `packages/web/server/src/app/middleware.ts` and `packages/web/server/src/index.ts` — consolidate the live SSE compression filter through one owner only after behavior equivalence is tested; do not retain two active implementations.
- Do not modify: `packages/web/server/src/runtime/env.ts` or `packages/web/server/src/main.ts`; environment/data-directory authority and compiled server CLI entry behavior are outside this server-only plan and remain for the later CLI plan.
- Modify: `packages/web/server/src/domains/bootstrap/DOCUMENTATION.md` if present, otherwise create it — document composition ownership, startup ordering, late-bound OpenCode dependency, externally managed OpenCode mode, and cleanup responsibilities.
- Test: `packages/web/server/src/domains/bootstrap/server-composition.test.ts` and `packages/web/server/src/app/middleware.test.ts` — cover compression filtering only if that helper is consolidated.

**Constraints:**
- Delete no `runtime/*`, `app/*`, CLI, or compatibility module solely because it appears unused; first establish no import/reference path and keep unrelated cleanup for its own plan.
- Preserve public exports used by `server/main.ts`, compiled server entrypoints, tests, and package consumers.
- Documentation must distinguish OpenChamber server lifecycle from the managed OpenCode subprocess/external OpenCode connection.

**Dependencies:**
- Task 3.

**Proof:**
- Reference/import audit demonstrates no active duplicate owner remains for any consolidated helper.
- Focused middleware/composition tests, route inventory, docs validation, type-check, server build, and diff checks pass.

## Verification Ladder

- Focused first: `PATH="/home/breadcat/.bun/bin:$PATH" bun run --cwd packages/web test -- server/src/__tests__/bootstrap.test.ts server/src/domains/bootstrap/server-composition.test.ts server/src/domains/bootstrap/shutdown-runtime.test.ts server/src/domains/bootstrap/startup-pipeline.test.ts`.
- Affected server tests: `PATH="/home/breadcat/.bun/bin:$PATH" bun run --cwd packages/web test -- server/src/contracts server/src/domains/bootstrap server/src/domains/routes server/src/domains/security server/src/domains/opencode server/src/domains/event-stream server/src/domains/terminal server/src/domains/notifications`.
- Package checks: `PATH="/home/breadcat/.bun/bin:$PATH" bun run type-check`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run build:web-server`, and `PATH="/home/breadcat/.bun/bin:$PATH" bun run check:contracts`.
- Repository checks at the chunk boundary: `PATH="/home/breadcat/.bun/bin:$PATH" bun run build`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:web`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run test:integration`, `PATH="/home/breadcat/.bun/bin:$PATH" bun run docs:validate`, and `scripts/verify.sh`; compare inherited lint debt rather than expanding this plan to unrelated cleanup.

## Review Decision

**Review: yes.** The extracted composition sits on a high-impact startup/lifecycle boundary with late-bound OpenCode dependencies, shared mutable state, and partial-failure cleanup. An independent reviewer should inspect the final bounded diff for lost wiring, changed ordering, and cleanup regressions after focused verification; this risk is material enough to justify the reviewer’s preparation cost.
