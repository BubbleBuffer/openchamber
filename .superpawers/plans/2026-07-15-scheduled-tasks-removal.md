---
kind: plan
status: active
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - scheduled-tasks-removal
coverage: completes
created: 2026-07-15
updated: 2026-07-15
next_action: "Execute Task 1"
---

# Scheduled Tasks Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove scheduled tasks, their background orchestration, persistence, event stream, client UI, dependencies, tests, and active documentation while preserving foreground OpenCode workspace workflows.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`, chunk `scheduled-tasks-removal`

**Architecture:** Delete the feature as one vertical capability rather than retaining empty facades. First remove the browser UI and its dedicated SSE client while the server still compiles. Then remove the scheduler, routes, project-config persistence runtime, lifecycle wiring, dedicated SSE endpoint, stale event literals, and exclusive dependencies in one server-side cut. Finish with exhaustive absence audits and the full protected browser/server workflow suite.

**Tech Stack:** React, Zustand, TypeScript, Express, Vitest, Bun, OpenCode SDK, SSE

---

## Chunk Coverage

This plan completes `scheduled-tasks-removal`. It removes:

- scheduled-task dialogs, controls, client API, dialog state, event subscriber, and test mocks;
- the scheduler runtime, CRUD/run/status/SSE routes, startup/shutdown wiring, event types, prompts, and module documentation;
- the dedicated project-config runtime and schedule types, which have no non-scheduled consumers;
- the scheduled-task settings merge and client write-preservation branch;
- the `/api/openchamber/events` endpoint, reverse-proxy guidance, SSE compression exception, and scheduled-task event literals;
- exclusive `cron-parser` and `luxon` dependencies and lockfile entries.

The clean compatibility break does not require an on-disk migration. Normal config merges and writes stop copying `scheduledTasks`, so the obsolete key disappears when a config is next written; untouched files may retain inert user data until then.

This plan is reviewed and committed before Task 1 begins. Implementation checkpoints therefore expect a clean worktree after each task commit.

## Preservation Boundaries

Must remain:

- normal session creation, interactive prompting, commands, foreground tools, permissions, and streaming;
- projects, project IDs, worktrees, files, terminal, Git/GitHub, quota, models, agents, and settings;
- current `/api/event`, `/api/global/event`, and `/api/notifications/stream` transports;
- message-stream WebSocket routing, `data_stalled`/`data_resumed`, and real connection-liveness behavior;
- browser/PWA/mobile/theme/store performance behavior;
- historical `CHANGELOG.md` and completed `.superpawers` artifacts.

The obsolete scheduled-task SSE heartbeat source and its exact event literals are removed. Generic message-stream serialization remains tested with a live, non-scheduled event fixture. The integration liveness test continues to prove connection health and OpenCode restart recovery without asserting absence of an event type that no longer exists.

## File Structure

### Delete

- `packages/ui/src/components/session/ScheduledTasksDialog.tsx` — scheduled-task list/actions dialog.
- `packages/ui/src/components/session/ScheduledTaskEditorDialog.tsx` — schedule/editor form.
- `packages/ui/src/lib/scheduledTasksApi.ts` — dedicated client API and types.
- `packages/ui/src/lib/config/openchamberEvents.ts` — dedicated scheduled-task SSE client.
- `packages/web/server/src/domains/scheduled-tasks/` — complete scheduler domain, routes, types, tests, and documentation.
- `packages/web/server/src/domains/projects/project-config.ts` — scheduled-task-only project config persistence.
- `packages/web/server/src/domains/projects/project-config.test.ts` — scheduled-task persistence tests.
- `packages/web/server/src/domains/projects/types.ts` — scheduled-task-only project config types.
- `packages/web/server/src/types/luxon.d.ts` — declaration used only by the removed scheduler/project-config imports.

### Modify

- `packages/ui/src/components/session/SessionSidebar.tsx` — remove event subscription/dialog wiring; retain session refresh/order behavior.
- `packages/ui/src/components/session/sidebar/SidebarHeader.tsx` — remove calendar action/prop; retain responsive header controls.
- `packages/ui/src/stores/useDialogStore.ts` and `.test.ts` — remove only scheduled-task state/action/tests.
- `tests/react/helpers/sessionSidebarMocks.tsx` — remove deleted event/dialog mocks.
- `packages/ui/src/lib/config/openchamberConfig.ts` — remove scheduled-task server-owned key handling only.
- `packages/web/server/src/index.ts` — remove scheduler construction/start/wiring and scheduled SSE prefix.
- `packages/web/server/src/shared/types.ts` — remove only `/api/openchamber/events` from SSE prefixes.
- `packages/web/server/src/domains/routes/feature-routes-runtime.ts` — remove scheduled route registration/dependency.
- `packages/web/server/src/domains/bootstrap/types.ts`, `shutdown-runtime.ts`, and `shutdown-runtime.test.ts` — remove scheduler shutdown dependency only.
- `packages/web/server/src/domains/projects/index.ts` — retain only project-ID exports.
- `packages/web/server/src/domains/settings/runtime.ts` — remove scheduled-task merge behavior.
- `packages/web/server/src/domains/event-stream/runtime.ts` — remove the unused scheduled-event client set/getter/disposal residue.
- `packages/web/server/src/domains/event-stream/protocol.test.ts` — replace scheduled heartbeat serialization fixture with a generic event.
- `packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts` — remove the vacuous scheduled-heartbeat timer test; retain ready/status/event routing tests.
- `tests/web/liveness-fix.test.ts` and `tests/README.md` — remove the deleted heartbeat negative assertion while retaining connection health, restart, and stall/resume coverage.
- `docs/REVERSE_PROXY.md` — remove the deleted endpoint from proxy requirements/examples.
- `packages/docs/content/docs/reverse-proxy.mdx` — remove the deleted endpoint from the published website source.
- `packages/web/package.json` and `bun.lock` — remove exclusive schedule dependencies.
- `packages/web/server/src/domains/projects/project-id.test.ts` — add deterministic project-ID preservation coverage.
- `packages/web/server/src/domains/opencode/routes/routes.test.ts` — add project-list/directory registration preservation coverage.
- `packages/web/server/src/domains/git/routes.test.ts` — add worktree discovery route preservation coverage.
- `packages/web/server/src/domains/settings/runtime.test.ts` — prove project migration drops the obsolete key while preserving live project/worktree metadata.
- `packages/ui/src/lib/config/openchamberConfig.test.ts` — prove ordinary client config writes drop the obsolete key while preserving live config.

---

### Task 1: Remove Scheduled Tasks From The Browser Client

**Files:**
- Delete: `packages/ui/src/components/session/ScheduledTasksDialog.tsx`
- Delete: `packages/ui/src/components/session/ScheduledTaskEditorDialog.tsx`
- Delete: `packages/ui/src/lib/scheduledTasksApi.ts`
- Delete: `packages/ui/src/lib/config/openchamberEvents.ts`
- Modify: `packages/ui/src/components/session/SessionSidebar.tsx`
- Modify: `packages/ui/src/components/session/sidebar/SidebarHeader.tsx`
- Modify: `packages/ui/src/stores/useDialogStore.ts`
- Modify: `packages/ui/src/stores/useDialogStore.test.ts`
- Modify: `tests/react/helpers/sessionSidebarMocks.tsx`
- Modify: `packages/ui/src/lib/config/openchamberConfig.ts`
- Create: `packages/ui/src/lib/config/openchamberConfig.test.ts`

- [ ] **Step 1: Record the current client feature surface**

Run:

```bash
rg -n 'ScheduledTask|scheduledTasks|scheduled-task|subscribeOpenchamberEvents' packages/ui/src tests/react
bun run test:stores
bun run test:react
```

Expected: references are confined to the listed deletion/edit targets and the existing retained client suites pass before deletion.

- [ ] **Step 2: Delete the dedicated UI and API/event modules**

Delete all four whole-file targets. In `SessionSidebar`, remove:

- `ScheduledTasksDialog` and `subscribeOpenchamberEvents` imports;
- the scheduled dialog store selector;
- the event effect that refreshes sessions on `scheduled-task-ran`;
- `openScheduledTasksDialog` prop wiring;
- the dialog render.

In `SidebarHeader`, remove `RiCalendarScheduleLine`, the callback prop, destructuring, and calendar button. Preserve all project/session controls and existing mobile/desktop form-factor behavior.

- [ ] **Step 3: Remove scheduled dialog state and config compatibility**

Remove only `isScheduledTasksDialogOpen` and `setScheduledTasksDialogOpen` from `useDialogStore` and its tests. Remove corresponding sidebar test mocks.

In `openchamberConfig.ts`, keep `version` as the server-owned key, but remove `scheduledTasks` from the comment/copy logic and strip it from both the cloned existing object and incoming/merged config before generic spreads. `updateOpenChamberConfig` must not reintroduce the key after reading old disk data. Add focused tests through direct write, `updateOpenChamberConfig`, and `saveWorktreeSetupCommands`, proving ordinary config updates drop the obsolete key while preserving `version`, live config fields, project path, and setup-worktree commands. All browser preference persistence remains unchanged.

- [ ] **Step 4: Verify and commit the client deletion**

Run:

```bash
if rg -n 'ScheduledTask|scheduledTasks|scheduled-task|subscribeOpenchamberEvents|openScheduledTasksDialog|isScheduledTasksDialogOpen|setScheduledTasksDialogOpen' packages/ui/src tests/react; then exit 1; fi
bun run test:stores
bun run test:react
bun run test:perf
bun test packages/ui/src/lib/config/openchamberConfig.test.ts
bun run type-check
git diff --check
git diff -- packages/ui/src tests/react
```

Expected: no client feature references remain; store, responsive React, performance, and type contracts pass.

```bash
git add -A -- packages/ui/src/components/session/ScheduledTasksDialog.tsx packages/ui/src/components/session/ScheduledTaskEditorDialog.tsx packages/ui/src/lib/scheduledTasksApi.ts packages/ui/src/lib/config/openchamberEvents.ts packages/ui/src/components/session/SessionSidebar.tsx packages/ui/src/components/session/sidebar/SidebarHeader.tsx packages/ui/src/stores/useDialogStore.ts packages/ui/src/stores/useDialogStore.test.ts tests/react/helpers/sessionSidebarMocks.tsx packages/ui/src/lib/config/openchamberConfig.ts packages/ui/src/lib/config/openchamberConfig.test.ts
git diff --cached --check
git diff --cached -- packages/ui/src/components/session packages/ui/src/lib packages/ui/src/stores tests/react/helpers/sessionSidebarMocks.tsx
git commit -m "refactor: remove scheduled tasks ui"
```

---

### Task 2: Remove Scheduler, Persistence, Routes, Events, And Dependencies

**Files:**
- Delete: `packages/web/server/src/domains/scheduled-tasks/`
- Delete: `packages/web/server/src/domains/projects/project-config.ts`
- Delete: `packages/web/server/src/domains/projects/project-config.test.ts`
- Delete: `packages/web/server/src/domains/projects/types.ts`
- Delete: `packages/web/server/src/types/luxon.d.ts`
- Modify: `packages/web/server/src/index.ts`
- Modify: `packages/web/server/src/shared/types.ts`
- Modify: `packages/web/server/src/domains/routes/feature-routes-runtime.ts`
- Modify: `packages/web/server/src/domains/bootstrap/types.ts`
- Modify: `packages/web/server/src/domains/bootstrap/shutdown-runtime.ts`
- Modify: `packages/web/server/src/domains/bootstrap/shutdown-runtime.test.ts`
- Modify: `packages/web/server/src/domains/projects/index.ts`
- Modify: `packages/web/server/src/domains/settings/runtime.ts`
- Create: `packages/web/server/src/domains/settings/runtime.test.ts`
- Modify: `packages/web/server/src/domains/event-stream/runtime.ts`
- Modify: `packages/web/server/src/domains/event-stream/protocol.test.ts`
- Modify: `packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts`
- Modify: `tests/web/liveness-fix.test.ts`
- Modify: `tests/README.md`
- Modify: `docs/REVERSE_PROXY.md`
- Modify: `packages/docs/content/docs/reverse-proxy.mdx`
- Modify: `packages/web/package.json`
- Modify: `bun.lock` (generated)
- Create: `packages/web/server/src/domains/projects/project-id.test.ts`
- Create: `packages/web/server/src/domains/opencode/routes/routes.test.ts`
- Create: `packages/web/server/src/domains/git/routes.test.ts`

- [ ] **Step 1: Prove the server ownership boundary before deletion**

Run:

```bash
rg -n 'createProjectConfigRuntime|projectConfigRuntime|ProjectConfigRuntime|resolveProjectConfigPath' packages/web/server/src
rg -n "from ['\"](luxon|cron-parser)['\"]" packages/web/server/src
rg -n '/api/openchamber/events|openchamber:(scheduled-task-ran|event-stream-ready|heartbeat)' packages/web/server/src packages/web/src packages/ui/src tests docs
```

Expected: project-config runtime/types and both dependencies are used only by scheduled-task construction/routes/runtime/tests; the dedicated OpenChamber SSE endpoint has no non-scheduled client.

- [ ] **Step 2: Delete the scheduler and its project persistence owner**

Delete the complete `scheduled-tasks` domain, the scheduled-task-only `project-config` implementation/test/types, and `types/luxon.d.ts`. Reduce `domains/projects/index.ts` to its retained project-ID export(s); do not change project listing, worktrees, or normal project APIs.

In `index.ts`, remove:

- the scheduler import and construction block;
- scheduled run-event emission and event-client dependency;
- scheduler startup, shutdown, and feature-route dependency wiring;
- `/api/openchamber/events` from the local SSE compression prefix list.

Remove `uiOpenChamberEventClients`, `OPENCHAMBER_PROJECTS_CONFIG_DIR`, `projectConfigRuntime`, and `getOpenChamberEventClients` from `index.ts` and feature-route dependencies. In the otherwise legacy `createEventStreamRuntime`, remove only its unused `uiOpenChamberEventClients` bounded set, getter, and disposal call. Remove the matching route registration and shutdown dependency/type/mock.

- [ ] **Step 3: Remove the dedicated event protocol residue**

Remove `/api/openchamber/events` from `shared/types.ts` SSE prefixes and from both active reverse-proxy sources: `docs/REVERSE_PROXY.md` and `packages/docs/content/docs/reverse-proxy.mdx`.

In `settings/runtime.ts`, strip `scheduledTasks` from cloned old and new project-config objects before generic spreads, then retain the existing explicit merges for setup-worktree, notes, todos, actions, and plan files. Add `runtime.test.ts` coverage proving project migration does not copy the obsolete key while preserving `setup-worktree`, project notes/actions/todos, and plan-file metadata.

In `protocol.test.ts`, retain generic event-frame serialization coverage using a neutral event fixture such as `{ type: "session.updated", properties: {} }`; do not keep the deleted heartbeat literal. Remove only the vacuous heartbeat-specific test from `global-ws-bridge.test.ts`.

In `global-ws-bridge.test.ts`, remove the vacuous heartbeat test, `capturedEvents`, its event-capture mock state, and the heartbeat-removal suite-title clause while retaining frame/status assertions. In `tests/web/liveness-fix.test.ts`, remove `WsEventFrame`, `isEventFrame`, and the title/assertion for the deleted heartbeat event; retain global WS readiness, OpenCode kill/restart recovery, health, and any `data_stalled`/`data_resumed` shape checks. Update the active row in `tests/README.md` accordingly. Historical specs/changelogs remain unchanged.

Add focused preservation tests:

- `project-id.test.ts` proves trailing slash and Windows separator normalization produce stable IDs, distinct paths remain distinct, and blank input remains empty.
- `routes.test.ts` captures `POST /api/opencode/directory`, supplies validated paths and existing/new project lists, and proves new projects receive `createProjectIdFromPath`, existing projects are not duplicated, and `projects`/`activeProjectId`/`lastDirectory` are persisted.
- `git/routes.test.ts` captures `GET /api/git/worktrees`, mocks the lazy Git module, and proves the route forwards the validated directory to `getWorktrees` and returns its result. It must not execute a real Git process.

- [ ] **Step 4: Remove exclusive dependencies and regenerate the lockfile**

Remove `cron-parser` and `luxon` from `packages/web/package.json`, then run `bun install` to regenerate `bun.lock`.

Run:

```bash
bun -e 'const lock = await Bun.file("bun.lock").text(); if (/cron-parser|luxon/.test(lock)) process.exit(1)'
bun install --frozen-lockfile
```

Expected: neither package remains owned by the workspace/lockfile and the frozen install makes no changes.

- [ ] **Step 5: Run focused server and protected workflow tests**

Run:

```bash
bun run --cwd packages/web test -- server/src/domains/bootstrap/shutdown-runtime.test.ts server/src/domains/event-stream/protocol.test.ts server/src/domains/event-stream/global-ws-bridge.test.ts server/src/domains/notifications/routes.test.ts server/src/domains/notifications/emitter.test.ts server/src/__tests__/bootstrap.test.ts server/src/domains/projects/project-id.test.ts server/src/domains/opencode/routes/routes.test.ts server/src/domains/git/routes.test.ts server/src/domains/settings/runtime.test.ts
bun run build:web-server
bun run type-check
bun run test:web
git diff --check
```

Expected: shutdown lifecycle, generic event serialization, WS status routing, bootstrap, server compile, and web integration pass without scheduler ownership.

- [ ] **Step 6: Audit and commit the server deletion**

Run:

```bash
if rg -n 'ScheduledTask|scheduledTasks|scheduled-task|createScheduledTasksRuntime|scheduledTasksRuntime|uiOpenChamberEventClients|OPENCHAMBER_PROJECTS_CONFIG_DIR|projectConfigRuntime|getOpenChamberEventClients|openchamber:(scheduled-task-ran|event-stream-ready|heartbeat)|/api/openchamber/events|cron-parser|luxon' packages/web/server/src packages/web/src packages/ui/src packages/docs tests docs package.json packages/web/package.json --glob '!**/.superpawers/**'; then exit 1; fi
git diff -- packages/web/server/src packages/web/package.json bun.lock tests/web/liveness-fix.test.ts tests/README.md docs/REVERSE_PROXY.md packages/docs/content/docs/reverse-proxy.mdx
```

Expected: zero active runtime, test, dependency, route, event, and documentation residue. Historical `CHANGELOG.md` and `.superpawers` files are intentionally outside the audit.

```bash
git add -A -- packages/web/server/src/domains/scheduled-tasks packages/web/server/src/domains/projects/project-config.ts packages/web/server/src/domains/projects/project-config.test.ts packages/web/server/src/domains/projects/types.ts packages/web/server/src/types/luxon.d.ts packages/web/server/src/index.ts packages/web/server/src/shared/types.ts packages/web/server/src/domains/routes/feature-routes-runtime.ts packages/web/server/src/domains/bootstrap/types.ts packages/web/server/src/domains/bootstrap/shutdown-runtime.ts packages/web/server/src/domains/bootstrap/shutdown-runtime.test.ts packages/web/server/src/domains/projects/index.ts packages/web/server/src/domains/projects/project-id.test.ts packages/web/server/src/domains/opencode/routes/routes.test.ts packages/web/server/src/domains/git/routes.test.ts packages/web/server/src/domains/settings/runtime.ts packages/web/server/src/domains/settings/runtime.test.ts packages/web/server/src/domains/event-stream/runtime.ts packages/web/server/src/domains/event-stream/protocol.test.ts packages/web/server/src/domains/event-stream/global-ws-bridge.test.ts tests/web/liveness-fix.test.ts tests/README.md docs/REVERSE_PROXY.md packages/docs/content/docs/reverse-proxy.mdx packages/web/package.json bun.lock
git diff --cached --check
git diff --cached -- packages/web/server/src packages/web/package.json bun.lock tests/web/liveness-fix.test.ts tests/README.md docs/REVERSE_PROXY.md packages/docs/content/docs/reverse-proxy.mdx
git commit -m "refactor: remove scheduled tasks runtime"
```

---

### Task 3: Verify And Close The Scheduled Tasks Chunk

**Files:**
- Modify: `.superpawers/plans/2026-07-15-scheduled-tasks-removal.md`
- Modify: `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`
- Modify: `.superpawers/OVERVIEW.md` only if its active validation block changes during fresh verification

- [ ] **Step 1: Run exhaustive absence and preservation audits**

Run:

```bash
test ! -d packages/web/server/src/domains/scheduled-tasks
test ! -e packages/web/server/src/domains/projects/project-config.ts
test ! -e packages/web/server/src/domains/projects/types.ts
test ! -e packages/ui/src/components/session/ScheduledTasksDialog.tsx
test ! -e packages/ui/src/components/session/ScheduledTaskEditorDialog.tsx
test ! -e packages/ui/src/lib/scheduledTasksApi.ts
test ! -e packages/ui/src/lib/config/openchamberEvents.ts
if rg -ni 'scheduled[- ]?tasks?|scheduledTasks|ScheduledTask|uiOpenChamberEventClients|OPENCHAMBER_PROJECTS_CONFIG_DIR|projectConfigRuntime|getOpenChamberEventClients|openchamber:(scheduled-task-ran|event-stream-ready|heartbeat)|/api/openchamber/events|cron-parser|luxon' packages/ui packages/web/src packages/web/server/src packages/docs tests docs package.json packages/web/package.json bun.lock; then exit 1; fi
bun -e 'const lock = await Bun.file("bun.lock").text(); if (/cron-parser|luxon/.test(lock)) process.exit(1)'
rg -n '"/api/event"|"/api/global/event"|"/api/notifications/stream"' packages/web/server/src/shared/types.ts
rg -n 'data_stalled|data_resumed' packages/web/server/src/domains/event-stream tests/web/liveness-fix.test.ts
rg -n 'session\.create|prompt_async|session\.command' packages/ui/src packages/web/server/src tests/opencode
test -f packages/web/server/src/domains/projects/project-id.test.ts
test -f packages/web/server/src/domains/opencode/routes/routes.test.ts
test -f packages/web/server/src/domains/git/routes.test.ts
test -f packages/web/server/src/domains/settings/runtime.test.ts
test -f packages/ui/src/lib/config/openchamberConfig.test.ts
```

Expected: no active scheduled capability or dependency remains; retained SSE transports, stall/resume protocol, and foreground session/tool paths remain.

- [ ] **Step 2: Run full chunk-boundary verification**

Run:

```bash
bun install --frozen-lockfile
bun run type-check
bun run build
bun run test:stores
bun run test:react
bun run test:perf
bun run test:web
bun run test:integration
bun run build:web-server
bun run docs:validate
scripts/verify.sh
```

Expected: install, type-check, build, stores, React, performance, web, integration, server build, and docs pass. `scripts/verify.sh` may remain nonzero only because of inherited lint debt; its type-check/build phases must pass. Integration cleanup uses the existing PID-file/watchdog/reaper only. Never use process-name matching.

- [ ] **Step 3: Compare lint with the inherited baseline**

Run: `bun run lint`

Expected: no surviving workspace exceeds the verified pre-chunk baseline: session-state 0 errors/5 warnings, web 378/236, tests 37/5, UI 41/722. This fresh baseline follows the completed VS Code/Electron contractions and supersedes the parent spec's original program-start aggregate. Reductions are expected from deleting large files; no new rule category is allowed.

- [ ] **Step 4: Inspect repository state before tracking updates**

Run:

```bash
git status --short
git diff --check
git log --oneline -20
```

Expected: clean worktree after implementation commits, no whitespace errors, and both task commits present.

- [ ] **Step 5: Close plan and parent chunk**

Set this plan to `status: complete`, check every step, record exact fresh verification evidence, and set `next_action` to selecting the next uncovered maintainability chunk.

In the parent spec, change only `scheduled-tasks-removal` from `Status: planned` to `Status: complete`. Update `.superpawers/OVERVIEW.md` only when fresh active validation counts differ; preserve its historical text.

- [ ] **Step 6: Validate planning state and commit tracking**

Run:

```bash
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js plan .superpawers/plans/2026-07-15-scheduled-tasks-removal.md
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js spec .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
git diff --check
```

Expected: plan complete with every task checked, `scheduled-tasks-removal` complete, and sibling chunks unchanged.

```bash
git add .superpawers/plans/2026-07-15-scheduled-tasks-removal.md .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md .superpawers/OVERVIEW.md
git commit -m "docs: complete scheduled tasks removal"
```
