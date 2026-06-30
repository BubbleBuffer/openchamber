# Codebase Cleanup Exhaustive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the durable cleanup work from `.superpawers/specs/2026-06-28-cleanup-handoff-design.md` in a safe, test-driven sequence that reduces render fanout, improves store coverage, fixes brittle runtime seams, and establishes deferred coverage for the largest remaining UI component.

**Architecture:** This is an umbrella plan for seven independent cleanup recommendations. Work is split into small PR-sized tasks with strict boundaries: hot-path UI subscription narrowing first, sync-store reference preservation second, isolated test coverage and Electron seam extraction in parallel-safe tracks, then larger store splitting and `SessionSidebar` coverage after coupling is reduced.

**Tech Stack:** React + TypeScript + Zustand, `useSyncExternalStore`, Bun tests, Vitest React tests, Node `node:test` for Electron, Express/OpenCode integration tests.

---

## Scope And Ordering

This plan intentionally covers multiple subsystems because the user requested a larger exhaustive pass. Execution should still be one task at a time. Do not collapse unrelated tasks into one implementation step.

**Recommended order:**

1. Task 0: pre-flight and branch hygiene.
2. Task 1: `MobileSessionStatusBar` broad status subscription reduction.
3. Task 2: agent-manager broad status subscription reduction.
4. Task 3: `SessionSidebar` redundant status subscription reduction.
5. Task 4: `Header` current-session lookup reduction.
6. Task 5: `use-sync.ts` `evict()` targeted cloning.
7. Task 6: `useGlobalSessionsStore` unit coverage.
8. Task 7: Electron remote IPC gate extraction.
9. Task 8: integration liveness baseline investigation and documentation/fix.
10. Task 9: measured `useUIStore` split, first slice only. **[Completed 2026-06-30 via `.superpawers/plans/2026-06-30-model-preferences-store-migration.md`.]**
11. Task 10: `SessionSidebar` test harness and first coverage slice.
12. Task 11: final verification and vault hygiene.

**Parallel-safe tracks after Task 0:**

- Tasks 1-4 are one UI/performance track and should stay sequential.
- Task 5 is independent after Task 0.
- Task 6 is independent after Task 0.
- Task 7 is independent after Task 0.
- Task 8 is independent after Task 0.
- ~~Task 9 should wait until Tasks 1-5 finish.~~ Superseded by the executed migration plan.
- Task 10 should wait until Tasks 1, 3, and preferably 9 finish. **Task 9 is complete; Task 10 may proceed.**

**Global constraints:**

- Do not touch pre-existing dirty files unless a task explicitly names them.
- Do not use `pgrep`, `pkill`, `killall`, or process-name matching in code, tests, scripts, commands, or subagent prompts.
- Do not add dependencies.
- Do not modify the sibling `../opencode` repo.
- Do not commit unless the user explicitly asks for commits. The execution workflow may inspect diffs and stage later, but this plan does not require commits.
- For every behavioral change, write the failing test first, run it, implement the minimum source change, then run the focused and relevant suite commands.

---

## Files By Responsibility

**Hot-path UI subscription cleanup:**

- Modify: `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx` — remove broad status-map dependency where only current-session status is needed; stabilize grouping inputs.
- Modify: `packages/ui/src/components/views/agent-manager/AgentGroupDetail.tsx` — replace broad status-map read with leaf status reads or a narrow derived hook.
- Modify: `packages/ui/src/components/views/agent-manager/AgentManagerSidebar.tsx` — same pattern for busy group derivation.
- Modify: `packages/ui/src/components/session/SessionSidebar.tsx` — remove redundant `useAllSessionStatuses()` subscription and prop threading.
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` only if the parent prop type still exposes broad status data.
- Modify: `packages/ui/src/components/layout/Header.tsx` — replace full live session aggregation for current session with `useSession(currentSessionId)` / `useGlobalSessionStatus(currentSessionId)` where behavior is equivalent.
- Test: `tests/react/mobile-session-status-bar.test.tsx` — commit-count and visible behavior coverage for the narrowed mobile status bar.
- Test: agent-manager React test file, preferably existing if present, otherwise `tests/react/agent-manager-status.test.tsx` — focused busy-status recomputation behavior.

**Sync eviction reference preservation:**

- Modify: `packages/ui/src/sync/use-sync.ts` — clone only mutated publish branches and pass direct references for other branches that `dropSessionCaches` needs to delete from.
- Test: `packages/ui/src/sync/use-sync.test.ts` — regression coverage for reference identity and cache deletion.

**Store coverage and store split:**

- Test: `packages/ui/src/stores/useGlobalSessionsStore.test.ts` — direct unit coverage for the singleton store wrapper around global session helpers and OpenCode client boundary.
- Create: `packages/ui/src/stores/useModelPreferencesStore.ts` — first measured split from `useUIStore`, containing model preference state and actions only.
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove model preference fields after consumers are migrated.
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx`, `packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx`, and `packages/ui/src/hooks/useModelLists.ts` — import model preference selectors from the new narrow store.
- Test: `packages/ui/src/stores/useModelPreferencesStore.test.ts` — mirror simple singleton store test style.
- Modify tests only if existing consumer tests import `useUIStore` for model preferences.

**Electron IPC gate:**

- Create: `packages/electron/src/ipc-gate.mjs` — pure remote-safe command set and local-sender / command-safety helpers.
- Modify: `packages/electron/main.mjs` — import and use the extracted gate with `state.localOrigin` passed explicitly.
- Modify: `packages/electron/__tests__/remote-ipc-gate.test.mjs` — replace regex source-contract tests for the command set with direct helper tests.
- Leave unchanged: `packages/electron/__tests__/preload-contract.test.mjs` except for verification.
- Modify: `packages/electron/package.json` only if `type-check` must include `src/ipc-gate.mjs`; prefer adding `node --check ./src/ipc-gate.mjs` to the existing script if the task touches package scripts.

**Integration liveness:**

- Modify after evidence only: `tests/web/liveness-fix.test.ts` — document skipped `data_stalled` assertion or widen cold import timeout with a comment if measured.
- Modify only if needed: `tests/vitest.config.ts` or `tests/helpers/openchamber-process.ts` — avoid unless evidence proves timeout cannot be handled locally.

**SessionSidebar coverage:**

- Create: `tests/react/helpers/sessionSidebarMocks.tsx` — hoisted state and mocks for the sidebar surface.
- Create: `tests/react/session-sidebar.test.tsx` — first render-path coverage: empty state, single session, multi-select, search.

---

## Task 0: Pre-Flight And Baseline Hygiene

**Files:**

- Read: `.superpawers/specs/2026-06-28-cleanup-handoff-design.md`
- Read: `packages/ui/src/sync/DOCUMENTATION.md`
- Read: `AGENTS.md`
- Read from vault: `summaries/2026-06-28-test-bench-catchup-complete.md`, if present
- Inspect only: git status and current branch

- [ ] **Step 1: Confirm branch and dirty-file boundaries**

Run: `git status --short --branch`

Expected: branch is suitable for cleanup work, and dirty files match the handoff's pre-existing dirty-file warning unless the user has made newer changes. Do not revert or modify unrelated dirty files.

- [ ] **Step 2: Read required context**

Read the handoff spec, sync documentation golden-rule section, and repo AGENTS instructions.

Expected: implementation notes explicitly preserve these constraints: no process-name matching, no new deps, targeted cloning, narrow selectors, mobile-first behavior.

- [ ] **Step 3: Record baseline test expectations**

Run only if the environment is ready and the user wants baseline time spent: `bun run test:stores`, `bun run test:react`, `bun run test:perf`.

Expected: use output as baseline; do not fix unrelated baseline failures inside Task 0.

- [ ] **Step 4: Inspect diff before starting first implementation task**

Run: `git diff --stat`

Expected: no planned task file has unrelated user edits. If a planned file is dirty before the task, read it carefully and avoid overwriting user changes.

---

## Task 1: MobileSessionStatusBar Status Subscription Narrowing

**Files:**

- Modify: `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx` — anchors: imports from `@/sync/sync-context`, local hooks `useSessionGrouping`, `useSessionHelpers`, `useProjectStatus`, component body around `const sessionStatus = useAllSessionStatuses()`.
- Create or modify: `tests/react/mobile-session-status-bar.test.tsx` — render/profiler coverage for status updates.

**Target behavior:**

- The collapsed current-session status path must not subscribe to the full `useAllSessionStatuses()` map.
- Current-session-only UI should use `useGlobalSessionStatus(currentSessionId)`.
- Expanded list/project views may still need aggregate status while expanded, but the collapsed view must not pay the full grouping/sorting cost for unrelated status changes.
- `useSessionGrouping` must avoid rebuilding `new Set(sessions.map(...))` inside per-session filters when `sessions` has not structurally changed.

- [ ] **Step 1: Write failing render-fanout test**

Create `tests/react/mobile-session-status-bar.test.tsx` using the existing `createCommitCollector` pattern from `tests/react/helpers/renderMetrics.tsx`.

Target test structure:

```tsx
// imports: React, describe/it/expect/vi/beforeEach/act from vitest stack used by tests/react,
// renderWithApp, createCommitCollector/createProfiledElement/expectNoUpdateCommits,
// MobileSessionStatusBar, and store/sync test helpers or local mocks.

describe("MobileSessionStatusBar", () => {
  beforeEach(() => {
    // reset mocked stores; seed mobile UI: isMobile=true, showMobileSessionStatusBar=true,
    // collapsed=true, currentSessionId="session-current".
    // seed sessions with at least session-current and session-other.
  })

  it("does not commit collapsed bar updates for unrelated session status changes", () => {
    const collector = createCommitCollector("MobileSessionStatusBar")
    renderWithApp(createProfiledElement(
      "MobileSessionStatusBar",
      collector,
      <MobileSessionStatusBar />,
    ))

    collector.reset()

    act(() => {
      // update only session-other status in the mocked live status source.
    })

    expectNoUpdateCommits(collector.commits)
  })
})
```

Expected before source change: FAIL because `MobileSessionStatusBar` subscribes to `useAllSessionStatuses()` and recomputes grouping for any status-map update.

- [ ] **Step 2: Run focused failing test**

Run: `bun run --cwd tests/react test mobile-session-status-bar.test.tsx`

Expected: FAIL for unrelated status update committing or for the test exposing missing helper mocks.

- [ ] **Step 3: Apply target-state implementation**

In `MobileSessionStatusBar.tsx`, change the sync-context import and component body from broad status by default to current-session status plus aggregate status only where needed.

Target-state sketch:

```tsx
import { useSessions, useAllSessionStatuses, useGlobalSessionStatus } from '@/sync/sync-context';

// ... existing code ...

export const MobileSessionStatusBar: React.FC<MobileSessionStatusBarProps> = ({
  onSessionSwitch,
}) => {
  // ... existing selectors ...
  const sessions = useSessions();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSessionStatus = useGlobalSessionStatus(currentSessionId ?? "");
  const isMobileSessionStatusBarCollapsed = useUIStore((state) => state.isMobileSessionStatusBarCollapsed);

  const aggregateSessionStatus = useAllSessionStatuses();

  // use a React.useMemo helper to produce a stable current-only status map:
  const currentOnlyStatus = React.useMemo(() => {
    if (!currentSessionId || !currentSessionStatus) return undefined;
    return { [currentSessionId]: currentSessionStatus };
  }, [currentSessionId, currentSessionStatus]);

  const statusForGrouping = isMobileSessionStatusBarCollapsed ? currentOnlyStatus : aggregateSessionStatus;

  const { sessions: sortedSessions, totalRunning, totalUnread, totalCount } = useSessionGrouping(
    sessions,
    statusForGrouping,
  );
  const { getSessionAgentName, getSessionTitle, needsAttention } = useSessionHelpers(
    agents,
    statusForGrouping,
  );
  const getProjectStatus = useProjectStatus(sessions, statusForGrouping, currentSessionId);

  // ... existing code ...
}
```

Important implementation correction: React hooks cannot be called conditionally. The sketch above still calls `useAllSessionStatuses()` unconditionally, which may preserve some fanout. If the failing test still observes unrelated commits, split the expanded panel into a child component that owns aggregate subscriptions and render it only when expanded. Preferred final target:

```tsx
export const MobileSessionStatusBar = (...) => {
  const currentSessionStatus = useGlobalSessionStatus(currentSessionId ?? "");
  // collapsed chrome uses currentSessionStatus only.
  // expanded drawer/list child renders only when expanded and calls useAllSessionStatuses() inside that child.
}
```

- [ ] **Step 4: Stabilize `useSessionGrouping` internals**

In local hook `useSessionGrouping`, replace repeated set creation inside the top-level filter with one memoized set.

Target-state sketch:

```tsx
function useSessionGrouping(sessions: Session[], sessionStatus: Record<string, { type: string }> | undefined) {
  const unseenCounts = useNotificationStore((s) => s.index.session.unseenCount);

  const allSessionIds = React.useMemo(() => new Set(sessions.map((s) => s.id)), [sessions]);

  const parentChildMap = React.useMemo(() => {
    const map = new Map<string, Session[]>();
    sessions.forEach((session) => {
      const parentID = (session as { parentID?: string }).parentID;
      if (parentID && allSessionIds.has(parentID)) {
        map.set(parentID, [...(map.get(parentID) || []), session]);
      }
    });
    return map;
  }, [sessions, allSessionIds]);

  const processedSessions = React.useMemo(() => {
    const topLevel = sessions.filter((session) => {
      const parentID = (session as { parentID?: string }).parentID;
      return !parentID || !allSessionIds.has(parentID);
    });
    // ... preserve existing running/viewed sorting logic ...
  }, [sessions, allSessionIds, getStatusType, hasRunningChildren, getRunningChildrenCount, getChildIndicators, unseenCounts]);
}
```

- [ ] **Step 5: Inspect diff**

Run: `git diff -- packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx tests/react/mobile-session-status-bar.test.tsx`

Expected: diff only changes mobile status bar subscription boundaries and the new focused test.

- [ ] **Step 6: Run focused and relevant suites**

Run: `bun run --cwd tests/react test mobile-session-status-bar.test.tsx`

Expected: PASS.

Run: `bun run test:react`

Expected: PASS or only documented pre-existing failures unrelated to these files.

Run: `bun run test:perf`

Expected: PASS, no chat-input bench regression.

---

## Task 2: Agent Manager Status Subscription Narrowing

**Files:**

- Modify: `packages/ui/src/components/views/agent-manager/AgentGroupDetail.tsx` — anchor: `const allStatuses = useAllSessionStatuses()` and `groupBusy` derivation.
- Modify: `packages/ui/src/components/views/agent-manager/AgentManagerSidebar.tsx` — anchor: `const allStatuses = useAllSessionStatuses()` and `busyGroups` derivation.
- Test: existing agent-manager React tests if present, otherwise create `tests/react/agent-manager-status.test.tsx`.

**Target behavior:**

- Components should only re-render for statuses belonging to sessions they display.
- Avoid full status-map subscriptions in manager shell components.

- [ ] **Step 1: Write failing test for irrelevant status changes**

Create or extend an agent-manager test using `createCommitCollector`.

Test cases:

- `AgentGroupDetail` with sessions `a1`, `a2` does not commit when status for `outside` changes.
- `AgentManagerSidebar` with group sessions `a1`, `a2` does not mark a group busy because an unrelated session is busy.

Expected before source change: FAIL because both components subscribe to the full status map.

- [ ] **Step 2: Run focused failing test**

Run: `bun run --cwd tests/react test agent-manager-status.test.tsx`

Expected: FAIL until source is narrowed.

- [ ] **Step 3: Extract narrow group-status read if needed**

Because hooks cannot be called inside loops whose length may change without care, prefer a small child component or local hook with stable group session IDs.

Target-state sketch:

```tsx
import { useGlobalSessionStatus } from '@/sync/sync-context';

function useAnySessionBusy(sessionIds: string[]): boolean {
  // If sessionIds count is dynamic, do not call hooks in a map directly.
  // Preferred: render a child row per group/session that owns one useGlobalSessionStatus call,
  // or keep the broad selector until a proper narrow selector is added to sync-context.
}
```

If direct per-id hooks are not safe for dynamic groups, implement a new selector hook in `packages/ui/src/sync/sync-context.tsx`:

```tsx
export function useAnyGlobalSessionBusy(sessionIds: readonly string[]): boolean {
  const signature = React.useMemo(() => [...sessionIds].sort().join("\0"), [sessionIds]);
  return useLiveSyncSelector(
    useCallback((states) => {
      const ids = new Set(signature ? signature.split("\0") : []);
      for (const id of ids) {
        const status = findLiveSessionStatus(states, id);
        if (status?.type === "busy" || status?.type === "retry") return true;
      }
      return false;
    }, [signature]),
  );
}
```

Use this only if it preserves hook order and avoids broad map allocation.

- [ ] **Step 4: Replace broad status-map usage**

Target-state sketch for each component:

```tsx
// ... existing imports ...
import { useAnyGlobalSessionBusy } from '@/sync/sync-context';

// AgentGroupDetail
const groupSessionIds = React.useMemo(() => group.sessions.map((session) => session.id), [group.sessions]);
const groupBusy = useAnyGlobalSessionBusy(groupSessionIds);

// AgentManagerSidebar
// For each rendered group item, move busy derivation into a child GroupRow component
// so each row can call useAnyGlobalSessionBusy(groupSessionIds) with that group's IDs.
```

- [ ] **Step 5: Add sync hook unit coverage if a new hook is introduced**

If `useAnyGlobalSessionBusy` is added, extend sync-context tests or live-aggregate tests to assert:

- returns `true` when any listed session has `busy` or `retry` status.
- returns `false` for unrelated busy statuses.
- does not allocate/return a full status map.

- [ ] **Step 6: Inspect diff and run tests**

Run: `git diff -- packages/ui/src/components/views/agent-manager/AgentGroupDetail.tsx packages/ui/src/components/views/agent-manager/AgentManagerSidebar.tsx packages/ui/src/sync/sync-context.tsx tests/react/agent-manager-status.test.tsx`

Run: `bun run --cwd tests/react test agent-manager-status.test.tsx`

Run: `bun run test:react`

Expected: focused and suite tests pass.

---

## Task 3: SessionSidebar Redundant Status Subscription Removal

**Files:**

- Modify: `packages/ui/src/components/session/SessionSidebar.tsx` — anchors: `useAllLiveSessions()`, `useAllSessionStatuses()`, `liveSessionStatuses`, and `SessionNodeItem` prop wiring.
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` only if the prop type includes parent-passed broad status.
- Test: extend Task 10 later if full sidebar tests are too coupled; for this task prefer a narrow component or store test if available.

**Target behavior:**

- Keep `useAllLiveSessions()` temporarily if it is needed for live/global session merge.
- Remove parent subscription to `useAllSessionStatuses()` if children already read their own status with `useGlobalSessionStatus(session.id)`.
- Do not change visible sidebar grouping, sorting, selection, or status pills.

- [ ] **Step 1: Write failing or characterization test**

If a full sidebar test harness is not yet practical, write a minimal test around `SessionNodeItem` or extracted render helper to assert a session row still displays busy/retry state from `useGlobalSessionStatus(session.id)` without a parent `liveSessionStatuses` prop.

Expected before source change: either FAIL because prop is required or PASS as a characterization. If it passes, proceed with removal and keep the test as regression coverage.

- [ ] **Step 2: Remove broad status parent subscription**

Target-state sketch:

```tsx
// SessionSidebar.tsx
import { useAllLiveSessions } from '@/sync/sync-context';

// ... existing component ...
const liveSessions = useAllLiveSessions();
// delete: const liveSessionStatuses = useAllSessionStatuses();

// ... renderSessionNode / SessionNodeItem props ...
<SessionNodeItem
  // preserve existing props
  session={session}
  // delete liveSessionStatuses={liveSessionStatuses}
/>
```

If `SessionNodeItem` has a prop type for `liveSessionStatuses`, delete it and keep its existing internal `useGlobalSessionStatus(session.id)` call.

- [ ] **Step 3: Inspect diff**

Run: `git diff -- packages/ui/src/components/session/SessionSidebar.tsx packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`

Expected: only status-map prop plumbing is removed.

- [ ] **Step 4: Run focused React tests**

Run: `bun run test:react`

Expected: PASS or only unrelated known failures.

---

## Task 4: Header Current-Session Live Lookup Narrowing

**Files:**

- Modify: `packages/ui/src/components/layout/Header.tsx` — anchors: `const liveSessions = useAllLiveSessions()` and `currentSessionLive` memo.
- Test: existing Header/layout React test if present, otherwise add focused test only if mocking surface is manageable.

**Target behavior:**

- `Header` must not subscribe to all live sessions only to find the current session.
- Current-session display should use `useSession(currentSessionId)` and/or `useGlobalSessionStatus(currentSessionId)`.
- Preserve fallback behavior for sessions not yet visible in global active sessions.

- [ ] **Step 1: Characterize current fallback chain**

Read `Header.tsx` around `currentSessionLive`. Note all fallback sources and what fields are displayed.

Expected: plan the replacement without changing display priority except replacing broad aggregate with narrower current-session lookup.

- [ ] **Step 2: Write focused test if feasible**

Test should seed current session in the sync store only and assert header shows its title/status without `useAllLiveSessions()` broad subscription.

Expected before source change: test either fails because mocking exposes broad usage, or passes as a characterization.

- [ ] **Step 3: Apply target-state implementation**

Target-state sketch:

```tsx
import { useSession, useGlobalSessionStatus } from '@/sync/sync-context';

// ... existing component ...
const currentSessionLive = useSession(currentSessionId ?? undefined);
const currentSessionStatus = useGlobalSessionStatus(currentSessionId ?? "");

const currentSession = React.useMemo(() => {
  if (!currentSessionId) return undefined;
  return currentSessionLive
    ?? globalActiveSessions.find((session) => session.id === currentSessionId)
    ?? getAllSyncSessions().find((session) => session.id === currentSessionId);
}, [currentSessionId, currentSessionLive, globalActiveSessions]);
```

Do not remove an existing fallback unless a test proves it is redundant.

- [ ] **Step 4: Verify**

Run: `git diff -- packages/ui/src/components/layout/Header.tsx`

Run: `bun run test:react`

Run: `bun run test:perf`

Expected: no React/perf regression.

---

## Task 5: use-sync evict() Targeted Cloning

**Files:**

- Modify: `packages/ui/src/sync/use-sync.ts` — anchor: `const evict = useCallback((dir: string, sessionIDs: string[]) => { ... })`.
- Test: `packages/ui/src/sync/use-sync.test.ts`.

**Important correction to the handoff:** `dropSessionCaches()` in `packages/ui/src/sync/session-cache.ts` deletes from all session-keyed collections: `message`, `part`, `todo`, `session_diff`, `session_status`, `permission`, and `question`. Therefore the fix must not pass an object missing those collections unless `dropSessionCaches()` is changed. The minimal safe fix is to clone `message` and `part`, pass direct references for the other collections, call `dropSessionCaches()`, and publish only the cloned branches plus the directly referenced branches if required by current `setState` semantics.

**Target behavior:**

- `message` and `part` references change after an eviction.
- `session_status`, `session_diff`, `todo`, `permission`, and `question` are not eagerly spread just to create new references.
- Evicted keys are still deleted from all collections.
- Unrelated subscriber fanout is reduced; no runtime undefined access is introduced.

- [ ] **Step 1: Write failing reference-identity test**

Create `packages/ui/src/sync/use-sync.test.ts` using the colocated `bun:test` style from nearby sync/store tests.

Target test scenarios:

- Seed a child directory store with `message`, `part`, `session_status`, `session_diff`, `todo`, `permission`, and `question` entries for sessions `s1` and `s2`.
- Trigger eviction for `s1` by exercising `useSync().loadMore` / `syncSession` enough to exceed `SESSION_CACHE_LIMIT`, or by exposing the smallest public path that calls `touch()` and `evict()`.
- Assert `message` and `part` references changed.
- Assert `session_status`, `session_diff`, `todo`, `permission`, and `question` references are preserved if implementation intentionally mutates them in place.
- Assert `s1` entries are gone and `s2` entries remain.

Expected before source change: FAIL because all seven references are cloned.

- [ ] **Step 2: Run focused failing test**

Run: `bun test packages/ui/src/sync/use-sync.test.ts`

Expected: FAIL on reference preservation.

- [ ] **Step 3: Apply target-state implementation**

Target-state sketch:

```ts
const current = dirStore.getState()
const draft = {
  message: { ...current.message },
  part: { ...current.part },
  session_status: current.session_status,
  session_diff: current.session_diff,
  todo: current.todo,
  permission: current.permission,
  question: current.question,
}

dropSessionCaches(draft, sessionIDs)

dirStore.setState({
  message: draft.message,
  part: draft.part,
  session_status: draft.session_status,
  session_diff: draft.session_diff,
  todo: draft.todo,
  permission: draft.permission,
  question: draft.question,
})
```

If preserving references while deleting keys causes selector notification gaps for per-key selectors, adjust the test and implementation to clone only collections that actually contain an evicted key, not all collections unconditionally. That alternative target is:

```ts
const draft = {
  message: { ...current.message },
  part: { ...current.part },
  session_status: sessionIDs.some((id) => id in current.session_status) ? { ...current.session_status } : current.session_status,
  session_diff: sessionIDs.some((id) => id in current.session_diff) ? { ...current.session_diff } : current.session_diff,
  todo: sessionIDs.some((id) => id in current.todo) ? { ...current.todo } : current.todo,
  permission: sessionIDs.some((id) => id in current.permission) ? { ...current.permission } : current.permission,
  question: sessionIDs.some((id) => id in current.question) ? { ...current.question } : current.question,
}
```

Choose the alternative only if tests prove subscribers must be notified when those collections actually lose data.

- [ ] **Step 4: Inspect diff**

Run: `git diff -- packages/ui/src/sync/use-sync.ts packages/ui/src/sync/use-sync.test.ts`

Expected: source diff is limited to `evict()` and tests.

- [ ] **Step 5: Verify**

Run: `bun test packages/ui/src/sync/use-sync.test.ts`

Run: `bun run test:stores`

Run: `bun run --cwd tests test:integration`

Expected: focused and stores pass; integration may skip if no OpenCode binary but must not fail when binary is present.

---

## Task 6: useGlobalSessionsStore Unit Coverage

**Files:**

- Create: `packages/ui/src/stores/useGlobalSessionsStore.test.ts`.
- Read: `packages/ui/src/stores/useGlobalSessionsStore.ts`.
- Read: `packages/ui/src/stores/globalSessions.ts` and `packages/ui/src/stores/globalSessions.test.ts`.
- Pattern references: `packages/ui/src/stores/useCommandsStore.test.ts`, `packages/ui/src/stores/useMultiRunStore.test.ts`, `packages/ui/src/stores/useUIStore.test.ts`.

**Target behavior:**

- The singleton store has direct coverage for cache hit, cache miss/fetch, invalidation or refresh, error propagation, aggregate equivalence, derived `sessionsByDirectory`, and mutation helpers.
- Mock the OpenCode client boundary with existing `mock.module()` patterns.

- [ ] **Step 1: Write store tests**

Create test cases:

- `applySnapshot sets active, archived, hasLoaded, status, and sessionsByDirectory`.
- `applySnapshot preserves list references or suppresses updates for same session signatures`.
- `upsertSession inserts/replaces active sessions`.
- `upsertSession moves archived sessions to archived list`.
- `removeSessions removes ids from both lists`.
- `archiveSessions moves active sessions to archived with archived timestamp`.
- `loadSessions returns cached state when already loaded and ready`.
- `loadSessions fetches active and archived pages on cache miss`.
- `refreshGlobalSessions fetches even when already loaded`.
- `loadSessions sets error status and returns error result on SDK/list failure`.
- `concurrent loadSessions calls dedupe in-flight work` if the public behavior exposes same promise or single fetch count.

Expected before production change: tests may pass because this is coverage-only. If a test fails, treat it as either a discovered bug or an overly strict assertion and verify against source before changing production code.

- [ ] **Step 2: Mock client/list boundary**

Use `mock.module()` before importing the store under test.

Target-state sketch:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test"

const listGlobalSessionPages = mock(async () => [])
const getSdkClient = mock(() => ({ experimental: { session: { list: mock(async () => []) } } }))

mock.module("@/lib/opencode/client", () => ({
  opencodeClient: { getSdkClient },
}))

mock.module("@/stores/globalSessions", async () => {
  const actual = await import("./globalSessions")
  return {
    ...actual,
    listGlobalSessionPages,
  }
})

const { useGlobalSessionsStore, ensureGlobalSessionsLoaded, refreshGlobalSessions } = await import("./useGlobalSessionsStore")

beforeEach(() => {
  listGlobalSessionPages.mockClear()
  getSdkClient.mockClear()
  useGlobalSessionsStore.setState({
    activeSessions: [],
    archivedSessions: [],
    sessionsByDirectory: new Map(),
    hasLoaded: false,
    status: "idle",
  }, false)
})
```

Adjust imports to match existing Bun alias support in nearby tests.

- [ ] **Step 3: Run focused test**

Run: `bun test packages/ui/src/stores/useGlobalSessionsStore.test.ts`

Expected: PASS after assertion alignment; no production source changes unless a real bug is found.

- [ ] **Step 4: Run store suite**

Run: `bun run test:stores`

Expected: one more store test file runs and passes.

---

## Task 7: Electron Remote IPC Gate Extraction

**Files:**

- Create: `packages/electron/src/ipc-gate.mjs`.
- Modify: `packages/electron/main.mjs` — anchors: `isLocalSender`, `COMMANDS_SAFE_FOR_REMOTE`, `ipcMain.handle('openchamber:invoke', ...)`, `ipcMain.handle('openchamber:dialog:open', ...)`.
- Modify: `packages/electron/__tests__/remote-ipc-gate.test.mjs`.
- Optionally modify: `packages/electron/package.json` `type-check` script to include `src/ipc-gate.mjs`.

**Target behavior:**

- Remote-safe command allowlist is a directly importable module, not a regex-parsed source block.
- Local-sender detection is pure with `localOrigin` passed explicitly.
- `main.mjs` keeps the same rejection behavior and error message.

- [ ] **Step 1: Write failing direct tests**

Replace `remote-ipc-gate.test.mjs` source parsing with direct imports from `../src/ipc-gate.mjs`.

Test cases:

- safe commands include exactly the known low-risk commands: `desktop_hosts_get`, `desktop_host_probe`, `desktop_new_window`, `desktop_new_window_at_url`, `desktop_set_window_title`, `desktop_set_window_theme`, `desktop_is_window_fullscreen`, `desktop_start_window_drag`, `desktop_get_app_version`, `desktop_get_lan_address`.
- unsafe commands are not safe: `desktop_read_file`, `desktop_save_markdown_file`, `desktop_open_path`, `desktop_reveal_path`, `desktop_open_in_app`, `desktop_open_file_in_app`, `desktop_notify`, `desktop_check_for_updates`, `desktop_install_update`, `desktop_ssh_start`.
- `isLocalSender` returns true for `file://`, `about:blank`, `localhost`, `127.0.0.1`, `::1`, and exact `localOrigin` match.
- `isLocalSender` returns false for remote HTTPS, LAN IP without origin match, missing sender, malformed URL.
- `assertIpcAvailableForOrigin` or equivalent throws `IPC not available for this origin` for unsafe remote commands.

Expected before source change: FAIL because `src/ipc-gate.mjs` does not exist.

- [ ] **Step 2: Create `ipc-gate.mjs`**

Complete intended file content:

```js
export const COMMANDS_SAFE_FOR_REMOTE = new Set([
  'desktop_hosts_get',
  'desktop_host_probe',
  'desktop_new_window',
  'desktop_new_window_at_url',
  'desktop_set_window_title',
  'desktop_set_window_theme',
  'desktop_is_window_fullscreen',
  'desktop_start_window_drag',
  'desktop_get_app_version',
  'desktop_get_lan_address',
]);

export const isIpcCommandRemoteSafe = (command) => COMMANDS_SAFE_FOR_REMOTE.has(command);

export const isLocalSender = (webContents, localOrigin = null) => {
  try {
    const raw = typeof webContents?.getURL === 'function' ? webContents.getURL() : '';
    if (!raw) return false;
    if (raw.startsWith('file://') || raw === 'about:blank') return true;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    if (localOrigin) {
      try {
        return url.origin === new URL(localOrigin).origin;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
};

export const assertIpcAvailableForOrigin = (webContents, command, localOrigin = null) => {
  if (!isLocalSender(webContents, localOrigin) && !isIpcCommandRemoteSafe(command)) {
    throw new Error('IPC not available for this origin');
  }
};
```

- [ ] **Step 3: Wire `main.mjs` to the helper**

Target-state sketch:

```js
import {
  COMMANDS_SAFE_FOR_REMOTE,
  assertIpcAvailableForOrigin,
  isLocalSender,
} from './src/ipc-gate.mjs';

// delete local COMMANDS_SAFE_FOR_REMOTE and local isLocalSender implementation.

ipcMain.handle('openchamber:invoke', async (event, command, args) => {
  try {
    assertIpcAvailableForOrigin(event.sender, command, state.localOrigin);
  } catch (error) {
    log.warn(`[ipc] rejected ${command} from non-local origin: ${typeof event.sender?.getURL === 'function' ? event.sender.getURL() : 'unknown'}`);
    throw error;
  }
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  return handleInvoke(browserWindow, command, args);
});

ipcMain.handle('openchamber:dialog:open', async (event, options) => {
  if (!isLocalSender(event.sender, state.localOrigin)) {
    log.warn(`[ipc] rejected dialog:open from non-local origin: ${typeof event.sender?.getURL === 'function' ? event.sender.getURL() : 'unknown'}`);
    throw new Error('IPC not available for this origin');
  }
  // ... preserve existing dialog handling ...
});
```

- [ ] **Step 4: Include new module in Electron syntax check if needed**

Preferred package script update:

```json
"type-check": "node --check ./main.mjs && node --check ./preload.mjs && node --check ./src/ipc-gate.mjs"
```

Only touch `packages/electron/package.json` if the worktree does not already contain unrelated package edits in that file.

- [ ] **Step 5: Verify**

Run: `node --test packages/electron/__tests__/remote-ipc-gate.test.mjs`

Run: `node --test packages/electron/__tests__/preload-contract.test.mjs`

Run: `bun run --cwd packages/electron type-check`

Run: `bun run type-check`

Expected: all pass.

---

## Task 8: Integration Liveness Baseline Investigation

**Files:**

- Inspect: `tests/web/liveness-fix.test.ts`.
- Inspect: `tests/helpers/opencode-process.ts` and `tests/helpers/opencode-watchdog.cjs` only for pid-file cleanup constraints.
- Modify only after evidence: `tests/web/liveness-fix.test.ts`.

**Target behavior:**

- Clarify that the real-OpenCode `data_stalled` assertion cannot be made because keepalives reset the upstream stall timer and process shutdown ends the stream before the timer fires.
- Fix or document cold import timeout in a way that does not hide semantic failures.
- No process-name matching.

- [ ] **Step 1: Re-read the current test state**

Confirm whether the strong `data_stalled` assertion is already skipped and whether the active test observes rather than requires `data_stalled`.

Expected: if already skipped, do not unskip without a controllable upstream fixture.

- [ ] **Step 2: Gather timing evidence**

Run: `bun run --cwd tests test:web -- --reporter=verbose`

Expected: record whether first-file `beforeAll` exceeds the current explicit timeout.

If timing evidence is needed, temporarily instrument `tests/web/liveness-fix.test.ts` around `await import("@openchamber/web")` with a `Date.now()` log, run once, and remove the instrumentation before committing or finalizing.

- [ ] **Step 3: Choose minimal fix**

If `data_stalled` is already skipped with a clear reason, leave it skipped and optionally improve the comment.

If cold import exceeds the local `beforeAll` timeout but remains under the suite `hookTimeout`, change only the explicit hook timeout and add a comment.

Target-state sketch:

```ts
beforeAll(async () => {
  // First cold import of @openchamber/web loads the full server ESM graph and can
  // exceed 30s on a fresh cache. Keep this aligned with tests/vitest.config.ts hookTimeout.
  // ... existing setup ...
}, 60_000)
```

- [ ] **Step 4: Verify without process-name matching**

Run: `bun run --cwd tests test:web`

Run: `RUN_SLOW_TESTS=1 bun run --cwd tests test:web`

Expected: web tests complete or only explicitly skipped tests are skipped. Do not run name-based process cleanup checks.

---

## Task 9: useUIStore Measured Split, First Slice Only

**Status (2026-06-30):** ✅ Completed via
`.superpawers/plans/2026-06-30-model-preferences-store-migration.md`. The simple
first-slice split described below was superseded by that dedicated migration plan
because model preference fields are persisted in `ui-store` and have additional
consumers beyond the original three UI files. The migration plan introduced a
persisted `useModelPreferencesStore`, a module-load copy-in helper, consumer
migration across all six UI call sites, desktop settings sync migration, and a
`ui-store` v9 -> v10 migration step that deletes the legacy keys. No further
work is required for this task.

**Original files (now superseded):**

- Create: `packages/ui/src/stores/useModelPreferencesStore.ts`.
- Create: `packages/ui/src/stores/useModelPreferencesStore.test.ts`.
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx`.
- Modify: `packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx`.
- Modify: `packages/ui/src/hooks/useModelLists.ts`.
- Modify: `packages/ui/src/stores/useUIStore.ts` only after consumers are migrated.

**Target behavior:**

- Move model preference state out of the broad persisted UI store into a narrow store.
- First slice includes only: `favoriteModels`, `recentModels`, `hiddenModels`, `collapsedModelProviders`, `recentEfforts`, and their methods.
- No persistence migration in this slice unless existing source proves these fields are currently persisted. If they are persisted, stop and ask for storage migration scope.

- [ ] **Step 1: Confirm fields and persistence**

Read `useUIStore.ts` `partialize` and migrations. Confirm model preference fields are not persisted.

Expected: if not persisted, proceed. If persisted, stop and design a storage migration before implementation.

- [ ] **Step 2: Write new store tests**

Create `useModelPreferencesStore.test.ts` covering:

- `toggleFavoriteModel` adds/removes.
- `isFavoriteModel` reads current set.
- `toggleHiddenModel`, `hideAllModels`, `showAllModels`, `isHiddenModel`.
- `toggleModelProviderCollapsed`.
- `addRecentModel` dedupes and orders recent models.
- `addRecentEffort` dedupes and orders efforts per model.

Expected before source: FAIL because new store does not exist.

- [ ] **Step 3: Create `useModelPreferencesStore.ts`**

Target-state sketch:

```ts
import { create } from "zustand";

type ModelPreferencesState = {
  favoriteModels: string[];
  recentModels: string[];
  hiddenModels: string[];
  collapsedModelProviders: string[];
  recentEfforts: Record<string, string[]>;
  toggleFavoriteModel: (modelId: string) => void;
  isFavoriteModel: (modelId: string) => boolean;
  toggleHiddenModel: (modelId: string) => void;
  isHiddenModel: (modelId: string) => boolean;
  hideAllModels: (modelIds: string[]) => void;
  showAllModels: () => void;
  toggleModelProviderCollapsed: (providerId: string) => void;
  addRecentModel: (modelId: string) => void;
  addRecentEffort: (modelId: string, effort: string) => void;
};

export const useModelPreferencesStore = create<ModelPreferencesState>((set, get) => ({
  // copy exact initial values and method behavior from useUIStore.ts
}));
```

Do not invent behavior; copy existing method semantics exactly.

- [ ] **Step 4: Migrate consumers**

For each consumer, replace selectors like:

```ts
const favoriteModels = useUIStore((state) => state.favoriteModels);
```

with:

```ts
const favoriteModels = useModelPreferencesStore((state) => state.favoriteModels);
```

Update imports in `ModelControls.tsx`, `UnifiedControlsDrawer.tsx`, and `useModelLists.ts`.

- [ ] **Step 5: Remove fields from useUIStore after consumer migration**

Remove only model preference fields and methods. Keep all unrelated UI fields intact.

- [ ] **Step 6: Verify**

Run: `bun test packages/ui/src/stores/useModelPreferencesStore.test.ts`

Run: `bun test packages/ui/src/stores/useUIStore.test.ts`

Run: `bun run test:stores`

Run: `bun run test:react`

Run: `bun run type-check`

Expected: all pass. If consumer tests depend on model preferences living in `useUIStore`, update those tests to seed `useModelPreferencesStore` instead.

> Implementation outcome (2026-06-30): all green. `useModelPreferencesStore.test.ts` 37 pass, `useUIStore.test.ts` 2 pass, `test:stores` 122 pass, `test:react` 67 pass, `type-check` all packages pass. `useUIStore` legacy surface removed; `ui-store` envelope now runs v9 -> v10 cleanup migration on load. See `.superpawers/plans/2026-06-30-model-preferences-store-migration.md` for the executed plan.

---

## Task 10: SessionSidebar Test Harness And First Coverage Slice

**Files:**

- Create: `tests/react/helpers/sessionSidebarMocks.tsx`.
- Create: `tests/react/session-sidebar.test.tsx`.
- Read: `packages/ui/src/components/session/SessionSidebar.tsx`.
- Read: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`.
- Pattern references: `tests/react/helpers/chatInputMocks.tsx`, `tests/react/helpers/render.tsx`, `tests/react/helpers/stores.ts`, `tests/react/helpers/fixtures.ts`.

**Prerequisites:**

- Task 3 should be complete so `SessionSidebar` no longer passes broad status maps into rows.
- Task 9 is preferred but not strictly required if tests can seed `useUIStore` safely.

**Target behavior:**

- Create a reusable sidebar mock harness with hoisted mutable state and reset helpers.
- Cover high-signal render paths without testing every child component: empty state, single project/session, multi-select, search.

- [ ] **Step 1: Create mock helper skeleton**

Create `tests/react/helpers/sessionSidebarMocks.tsx` following `chatInputMocks.tsx` ordering.

Exports:

```ts
export const sessionSidebarTestState = mockState;
export function resetSessionSidebarState(): void;
export function makeSidebarSession(overrides?: Partial<Session>): Session;
export function makeSidebarProject(overrides?: Partial<ProjectEntry>): ProjectEntry;
export function seedSidebarProjects(projects: ProjectEntry[]): void;
export function seedSidebarSessions(sessions: Session[]): void;
export function seedSidebarSingleSession(): { project: ProjectEntry; session: Session };
export function seedSidebarMultiSelect(): { sessions: Session[] };
export function seedSidebarSearchFixture(): { matching: Session; nonMatching: Session };
```

Mock modules:

- `@/lib/desktop/desktop` shell detection and desktop APIs.
- `@/lib/session/sessionEvents`.
- `@/lib/opencode/client`.
- `@/stores/useGlobalSessionsStore`.
- `@/sync/sync-context`.
- `@/sync/session-ui-store`.
- `@/stores/projects/useProjectsStore`.
- `@/stores/files/useDirectoryStore`.
- `@/stores/session/useSessionFoldersStore`.
- `@/stores/session/useSessionMultiSelectStore`.
- `@/stores/git/useGitStore`.
- `@/stores/github/useGitHubAuthStore`.
- `@/stores/github/useGitHubPrStatusStore`.
- `@/stores/useUpdateStore`.
- `@/stores/useUIStore`.
- `@/stores/useDialogStore`.
- `@/hooks/useRuntimeAPIs`.
- `@/hooks/useDebouncedValue` if search needs deterministic behavior.
- Heavy sidebar child components such as `BulkActionBar`, dialogs, and draggable wrappers.

- [ ] **Step 2: Write empty state test**

Create `tests/react/session-sidebar.test.tsx`.

Test target:

```tsx
it("renders an empty state when no sessions exist", () => {
  resetSessionSidebarState();
  seedSidebarProjects([]);
  seedSidebarSessions([]);
  renderWithApp(<SessionSidebar />, { resetStores: false });
  expect(screen.getByText(/no sessions/i)).toBeTruthy();
})
```

- [ ] **Step 3: Write single project/session test**

Test target:

```tsx
it("renders a single session under its project", () => {
  const { project, session } = seedSidebarSingleSession();
  renderWithApp(<SessionSidebar />, { resetStores: false });
  expect(screen.getByText(project.name ?? project.label)).toBeTruthy();
  expect(screen.getByText(session.title ?? "New session")).toBeTruthy();
})
```

- [ ] **Step 4: Write multi-select test**

Test target:

```tsx
it("renders bulk actions when multi-select is active", () => {
  seedSidebarMultiSelect();
  sessionSidebarTestState.multiSelectEnabled = true;
  sessionSidebarTestState.multiSelectSelectedIds = new Set(["session-1", "session-2"]);
  renderWithApp(<SessionSidebar />, { resetStores: false });
  expect(screen.getByTestId("bulk-action-bar")).toBeTruthy();
})
```

- [ ] **Step 5: Write search test**

Test target:

```tsx
it("filters visible sessions by search query", async () => {
  const { matching, nonMatching } = seedSidebarSearchFixture();
  renderWithApp(<SessionSidebar />, { resetStores: false });
  await userEvent.click(screen.getByRole("button", { name: /search sessions/i }));
  await userEvent.type(screen.getByPlaceholderText(/search sessions/i), "layout");
  expect(screen.getByText(matching.title!)).toBeTruthy();
  expect(screen.queryByText(nonMatching.title!)).toBeNull();
})
```

- [ ] **Step 6: Iterate mocks only as needed**

Do not mock every module preemptively if the component can render without it. Add mocks when the focused tests expose missing dependencies.

- [ ] **Step 7: Verify**

Run: `bun run --cwd tests/react test session-sidebar.test.tsx`

Run: `bun run test:react`

Expected: new tests pass and helpers reset state between tests.

---

## Task 11: Final Verification And Durable Memory Check

**Files:**

- No source changes unless fixing issues found by verification.
- Optional vault note update if durable architecture memory changed.

- [ ] **Step 1: Run focused suites for touched tracks**

Run the focused commands from every task that was implemented.

Expected: all focused tests pass.

- [ ] **Step 2: Run minimum repo verification**

Run: `bun run type-check`

Run: `bun run lint`

Expected: pass or report known pre-existing lint baseline separately.

- [ ] **Step 3: Run broader verification if time allows**

Run: `scripts/verify.sh`

Expected: pass or known unrelated failures are documented with exact failing command and output summary.

- [ ] **Step 4: Inspect final diff**

Run: `git diff --stat`

Run: `git diff -- <touched files>`

Expected: changes match implemented tasks only; unrelated dirty files remain untouched.

- [ ] **Step 5: Vault hygiene**

Search vault for relevant cleanup/test-bench notes. If the work changes durable project memory, update a short summary note under `summaries/`, `decisions/`, or `context/`. If it is only implementation progress with no durable architectural change, do nothing.

---

## Acceptance Criteria

- `MobileSessionStatusBar` collapsed path no longer subscribes to broad status maps for current-session status.
- Agent manager busy indicators no longer require full status-map subscriptions in shell-level components.
- `SessionSidebar` no longer passes redundant full status maps to row children.
- `Header` no longer uses full live session aggregation only to find the current session.
- `evict()` no longer eagerly clones all session-keyed collections on every cache eviction and still deletes evicted data correctly.
- `useGlobalSessionsStore` has direct unit coverage for load/cache/mutation/error behavior.
- Electron remote IPC gate is importable and unit-tested directly, while `main.mjs` preserves runtime behavior.
- Integration liveness tests have documented, evidence-backed behavior for `data_stalled` and cold import timing.
- The first `useUIStore` split moves only model preferences and does not introduce persistence migration without approval.
- `SessionSidebar` has a reusable test harness and first high-signal render tests.
- Verification commands for implemented tasks pass, or any residual failures are explicitly identified as pre-existing/unrelated with evidence.
