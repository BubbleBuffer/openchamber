# Layout Store Split (Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the layout/runtime/navigation fields out of `useUIStore` into three focused stores — `useLayoutStore` (panel dimensions/visibility), `useNavigationStore` (tab/routing), and `useRuntimeStore` (mobile/keyboard) — following the migration-free pattern proven by the prior preference-store waves.

**Architecture:** Three independent persisted/non-persisted stores created in sequence (B1 → B3 → B2). Each sub-slice is a standalone PR: create store + tests, migrate consumers, remove legacy surface from `useUIStore`. No migration helpers, no version bumps, no migration blocks. The cross-slice dependency (`navigateToDiff` reads `mainTabGuard`/`activeMainTab` from B3 while staying in `useUIStore` for `pendingDiffFile`) is resolved by having `navigateToDiff` read from `useNavigationStore.getState()` imperatively.

**Tech Stack:** React, TypeScript, Zustand `persist` + `createJSONStorage(() => getSafeStorage())`, Bun tests.

---

## File Responsibilities

### Sub-slice B1 — `useLayoutStore` (panel dimensions/visibility)

- Create: `packages/ui/src/stores/useLayoutStore.ts` — persisted store owning sidebar/right-sidebar/bottom-terminal dimensions and visibility.
- Create: `packages/ui/src/stores/useLayoutStore.test.ts` — unit coverage for all setters.
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 9 fields + 11 setters + 2 constants from interface, initial state, implementations, and `partialize`.
- Modify: 17 consumer files (listed in Task 3 below).
- Modify: `tests/react/helpers/stores.ts` — update `resetTopLevelStores()`.
- Modify: `tests/react/helpers/sessionSidebarMocks.tsx` — update `useUIStore` mock, add `useLayoutStore` mock.

### Sub-slice B3 — `useNavigationStore` (tab/routing)

- Create: `packages/ui/src/stores/useNavigationStore.ts` — persisted store owning `activeMainTab`, `mainTabGuard`, `isSessionSwitcherOpen`.
- Create: `packages/ui/src/stores/useNavigationStore.test.ts` — unit coverage.
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 4 fields + 3 setters. Update `navigateToDiff`/`consumePendingDiffFile` to use `useNavigationStore.getState()`.
- Modify: 19 consumer files (listed in Task 8 below).
- Modify: `tests/react/helpers/stores.ts`, `tests/react/helpers/sessionSidebarMocks.tsx`.

### Sub-slice B2 — `useRuntimeStore` (mobile/keyboard)

- Create: `packages/ui/src/stores/useRuntimeStore.ts` — **non-persisted** store owning `isMobile`, `isKeyboardOpen`.
- Create: `packages/ui/src/stores/useRuntimeStore.test.ts` — unit coverage.
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 2 fields + 2 setters.
- Modify: 22 consumer files (listed in Task 13 below).
- Modify: `.opencode/skills/mobile-first-ui/SKILL.md` — update all 6 references from `useUIStore` to `useRuntimeStore`.
- Modify: `tests/react/helpers/stores.ts`, `tests/react/helpers/sessionSidebarMocks.tsx`, `tests/perf/chat-input.bench.tsx`.

---

## Global Constraints

- Do not touch pre-existing dirty files unless a task explicitly names them.
- Do not use `pgrep`, `pkill`, `killall`, or process-name matching.
- Do not add dependencies.
- Do not modify the sibling `../opencode` repo.
- Do not commit unless the user explicitly asks.
- **No migration helpers, no version bumps, no migration blocks.** The migration-free pattern is canonical.
- Verbatim setter copies — no behavior changes within a sub-slice.
- One sub-slice per PR. Sequence: B1 → B3 → B2.

---

## Sub-slice B1 — `useLayoutStore`

**Fields (9):** `isSidebarOpen`, `sidebarWidth`, `isRightSidebarOpen`, `rightSidebarWidth`, `rightSidebarTab`, `isBottomTerminalOpen`, `isBottomTerminalExpanded`, `bottomTerminalHeight`, `hasManuallyResizedBottomTerminal`.

**Setters (11):** `toggleSidebar`, `setSidebarOpen`, `setSidebarWidth`, `toggleRightSidebar`, `setRightSidebarOpen`, `setRightSidebarWidth`, `setRightSidebarTab`, `toggleBottomTerminal`, `setBottomTerminalOpen`, `setBottomTerminalExpanded`, `setBottomTerminalHeight`.

**Constants:** `LEFT_SIDEBAR_MIN_WIDTH` (300), `RIGHT_SIDEBAR_MIN_WIDTH` (400) — move with the store.

**Persist key:** `layout-store`. **Version:** `1`. **Partialize:** all fields except `hasManuallyResizedBottomTerminal`.

**Defaults (from `useUIStore.ts:586-595`):**
- `isSidebarOpen: true`
- `sidebarWidth: LEFT_SIDEBAR_MIN_WIDTH` (300)
- `isRightSidebarOpen: false`
- `rightSidebarWidth: RIGHT_SIDEBAR_MIN_WIDTH` (400)
- `rightSidebarTab: 'git'`
- `isBottomTerminalOpen: false`
- `isBottomTerminalExpanded: false`
- `bottomTerminalHeight: 300`
- `hasManuallyResizedBottomTerminal: false`

### Task 1: Write `useLayoutStore` tests (RED)

**Files:**
- Create: `packages/ui/src/stores/useLayoutStore.test.ts`
- Read: `packages/ui/src/stores/useUIStore.ts` (setter implementations at lines 638-1010)

- [ ] **Step 1: Write the failing test file**

Create `packages/ui/src/stores/useLayoutStore.test.ts` with `bun:test` covering:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { useLayoutStore } from './useLayoutStore';

const resetStore = () => {
  // Stub window.innerHeight so proportional height calculations are deterministic.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true, configurable: true });
  }
  useLayoutStore.setState({
    isSidebarOpen: true,
    sidebarWidth: 300,
    isRightSidebarOpen: false,
    rightSidebarWidth: 400,
    rightSidebarTab: 'git',
    isBottomTerminalOpen: false,
    isBottomTerminalExpanded: false,
    bottomTerminalHeight: 300,
    hasManuallyResizedBottomTerminal: false,
  }, false);
};

describe('useLayoutStore', () => {
  beforeEach(resetStore);

  // toggleSidebar flips isSidebarOpen
  it('toggleSidebar flips isSidebarOpen', () => {
    const before = useLayoutStore.getState().isSidebarOpen;
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().isSidebarOpen).toBe(!before);
  });

  // setSidebarOpen: closed→open preserves width; already-open resets non-min width to min
  it('setSidebarOpen opens and preserves width when transitioning from closed', () => {
    useLayoutStore.setState({ isSidebarOpen: false, sidebarWidth: 500 }, false);
    useLayoutStore.getState().setSidebarOpen(true);
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(500);
  });

  it('setSidebarOpen resets width to min when already open and width differs', () => {
    useLayoutStore.setState({ isSidebarOpen: true, sidebarWidth: 500 }, false);
    useLayoutStore.getState().setSidebarOpen(true);
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(300);
  });

  // setSidebarWidth: direct set
  it('setSidebarWidth sets width directly', () => {
    useLayoutStore.getState().setSidebarWidth(450);
    expect(useLayoutStore.getState().sidebarWidth).toBe(450);
  });

  // toggleRightSidebar mirrors sidebar pattern
  it('toggleRightSidebar flips isRightSidebarOpen', () => {
    const before = useLayoutStore.getState().isRightSidebarOpen;
    useLayoutStore.getState().toggleRightSidebar();
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(!before);
  });

  // setRightSidebarOpen mirrors setSidebarOpen
  it('setRightSidebarOpen opens and preserves width when transitioning from closed', () => {
    useLayoutStore.setState({ isRightSidebarOpen: false, rightSidebarWidth: 600 }, false);
    useLayoutStore.getState().setRightSidebarOpen(true);
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(600);
  });

  it('setRightSidebarOpen resets width to min when already open and width differs', () => {
    useLayoutStore.setState({ isRightSidebarOpen: true, rightSidebarWidth: 600 }, false);
    useLayoutStore.getState().setRightSidebarOpen(true);
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(400);
  });

  // setRightSidebarWidth: direct set
  it('setRightSidebarWidth sets width directly', () => {
    useLayoutStore.getState().setRightSidebarWidth(500);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(500);
  });

  // setRightSidebarTab: direct set
  it('setRightSidebarTab sets tab directly', () => {
    useLayoutStore.getState().setRightSidebarTab('context');
    expect(useLayoutStore.getState().rightSidebarTab).toBe('context');
  });

  // toggleBottomTerminal flips isBottomTerminalOpen; when opening, sets height + hasManuallyResizedBottomTerminal: false
  // NOTE: stub window.innerHeight in beforeEach to a known value (e.g. 1000) so proportional height is deterministic.
  it('toggleBottomTerminal opens and recalculates height', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: false, hasManuallyResizedBottomTerminal: true, bottomTerminalHeight: 500 }, false);
    useLayoutStore.getState().toggleBottomTerminal();
    expect(useLayoutStore.getState().isBottomTerminalOpen).toBe(true);
    expect(useLayoutStore.getState().hasManuallyResizedBottomTerminal).toBe(false);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(Math.floor(1000 * 0.32));
  });

  // setBottomTerminalOpen: early-return if same; when opening, recalculates proportional height if not manually resized
  it('setBottomTerminalOpen is no-op when already open and manually resized', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: true, hasManuallyResizedBottomTerminal: true, bottomTerminalHeight: 300 }, false);
    useLayoutStore.getState().setBottomTerminalOpen(true);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(300);
  });

  it('setBottomTerminalOpen recalculates height when opening if not manually resized', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: false, hasManuallyResizedBottomTerminal: false, bottomTerminalHeight: 100 }, false);
    useLayoutStore.getState().setBottomTerminalOpen(true);
    expect(useLayoutStore.getState().isBottomTerminalOpen).toBe(true);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(Math.floor(1000 * 0.32));
  });

  // setBottomTerminalExpanded: direct set
  it('setBottomTerminalExpanded sets expanded directly', () => {
    useLayoutStore.getState().setBottomTerminalExpanded(true);
    expect(useLayoutStore.getState().isBottomTerminalExpanded).toBe(true);
  });

  // setBottomTerminalHeight: sets height + hasManuallyResizedBottomTerminal: true
  it('setBottomTerminalHeight sets height and marks manually resized', () => {
    useLayoutStore.getState().setBottomTerminalHeight(400);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(400);
    expect(useLayoutStore.getState().hasManuallyResizedBottomTerminal).toBe(true);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useLayoutStore.test.ts`
Expected: FAIL — `Cannot find module './useLayoutStore'`.

---

### Task 2: Create `useLayoutStore` (GREEN)

**Files:**
- Create: `packages/ui/src/stores/useLayoutStore.ts`

- [ ] **Step 1: Implement the store**

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

const LEFT_SIDEBAR_MIN_WIDTH = 300;
const RIGHT_SIDEBAR_MIN_WIDTH = 400;

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  isRightSidebarOpen: boolean;
  rightSidebarWidth: number;
  rightSidebarTab: string;
  isBottomTerminalOpen: boolean;
  isBottomTerminalExpanded: boolean;
  bottomTerminalHeight: number;
  hasManuallyResizedBottomTerminal: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarTab: (tab: string) => void;
  toggleBottomTerminal: () => void;
  setBottomTerminalOpen: (open: boolean) => void;
  setBottomTerminalExpanded: (expanded: boolean) => void;
  setBottomTerminalHeight: (height: number) => void;
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      isSidebarOpen: true,
      sidebarWidth: LEFT_SIDEBAR_MIN_WIDTH,
      isRightSidebarOpen: false,
      rightSidebarWidth: RIGHT_SIDEBAR_MIN_WIDTH,
      rightSidebarTab: 'git',
      isBottomTerminalOpen: false,
      isBottomTerminalExpanded: false,
      bottomTerminalHeight: 300,
      hasManuallyResizedBottomTerminal: false,

      // Copy exact method bodies from useUIStore before deleting them there.
      toggleSidebar: () => { /* verbatim from useUIStore */ },
      setSidebarOpen: (open) => { /* verbatim */ },
      setSidebarWidth: (width) => { /* verbatim */ },
      toggleRightSidebar: () => { /* verbatim */ },
      setRightSidebarOpen: (open) => { /* verbatim */ },
      setRightSidebarWidth: (width) => { /* verbatim */ },
      setRightSidebarTab: (tab) => { /* verbatim */ },
      toggleBottomTerminal: () => { /* verbatim */ },
      setBottomTerminalOpen: (open) => { /* verbatim */ },
      setBottomTerminalExpanded: (expanded) => { /* verbatim */ },
      setBottomTerminalHeight: (height) => { /* verbatim */ },
    }),
    {
      name: 'layout-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        sidebarWidth: state.sidebarWidth,
        isRightSidebarOpen: state.isRightSidebarOpen,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarTab: state.rightSidebarTab,
        isBottomTerminalOpen: state.isBottomTerminalOpen,
        isBottomTerminalExpanded: state.isBottomTerminalExpanded,
        bottomTerminalHeight: state.bottomTerminalHeight,
        // hasManuallyResizedBottomTerminal is intentionally excluded — runtime-only.
      }),
    },
  ),
);
```

Copy setter bodies verbatim from `useUIStore.ts` lines 638-1010. The setters reference `LEFT_SIDEBAR_MIN_WIDTH`/`RIGHT_SIDEBAR_MIN_WIDTH` and `window.innerHeight` — both are available in the new file scope.

- [ ] **Step 2: Verify GREEN**

Run: `bun test packages/ui/src/stores/useLayoutStore.test.ts`
Expected: PASS (14 tests).

Run: `bun run type-check`
Expected: PASS.

---

### Task 3: Migrate B1 consumers

**Files (17):**
- `packages/ui/src/components/layout/BottomTerminalDock.tsx`
- `packages/ui/src/components/layout/Header.tsx`
- `packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/layout/ProjectActionsButton.tsx`
- `packages/ui/src/components/layout/RightSidebar.tsx`
- `packages/ui/src/components/layout/RightSidebarTabs.tsx`
- `packages/ui/src/components/layout/Sidebar.tsx`
- `packages/ui/src/components/session/SessionSidebar.tsx`
- `packages/ui/src/components/ui/CommandPalette.tsx`
- `packages/ui/src/components/views/GitView.tsx`
- `packages/ui/src/components/views/TerminalView.tsx`
- `packages/ui/src/components/chat/diff/PendingChangesBar.tsx`
- `packages/ui/src/components/chat/diff/TurnChangedFilesDropdown.tsx`
- `packages/ui/src/hooks/useKeyboardShortcuts.ts`
- `packages/ui/src/hooks/useMenuActions.ts`
- `packages/ui/src/hooks/useThemeEffects.ts`
- `packages/ui/src/stores/useUIStore.test.ts`

- [ ] **Step 1: Replace `useUIStore` selectors with `useLayoutStore` selectors**

For each layout field selector:
```ts
// Before
const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
// After
const isSidebarOpen = useLayoutStore((s) => s.isSidebarOpen);
```

Same pattern for all 9 fields and 11 setters. Keep unrelated `useUIStore` selectors intact. Add `import { useLayoutStore } from '@/stores/useLayoutStore'` where needed.

**Special: `MainLayout.tsx` has a `useUIStore.subscribe` (line ~308) watching `isRightSidebarOpen` and `isBottomTerminalOpen`.** This subscription must migrate to `useLayoutStore.subscribe` — otherwise it silently stops firing after Task 4 removes the fields from `useUIStore`. Replace the subscription target; the callback logic stays the same.


For `.getState()` calls (e.g., `useUIStore.getState().isMobile` in PendingChangesBar/TurnChangedFilesDropdown), replace with `useLayoutStore.getState()` for layout fields only.

- [ ] **Step 2: Update test infrastructure**

In `tests/react/helpers/stores.ts`, update `resetTopLevelStores()`:
```ts
// Move layout fields from useUIStore.setState to useLayoutStore.setState
useLayoutStore.setState({
  isSidebarOpen: true,
  sidebarWidth: 300,
  isRightSidebarOpen: false,
  rightSidebarWidth: 400,
  isBottomTerminalOpen: false,
}, false);
```

In `tests/react/helpers/sessionSidebarMocks.tsx`, add `useLayoutStore` mock and remove layout fields from the `useUIStore` mock.

In `packages/ui/src/stores/useUIStore.test.ts`, update any test that seeds layout fields to use `useLayoutStore.setState()` instead.

- [ ] **Step 3: Verify no direct layout reads remain through `useUIStore`**

Run: `rg "isSidebarOpen|sidebarWidth|isRightSidebarOpen|rightSidebarWidth|rightSidebarTab|isBottomTerminalOpen|isBottomTerminalExpanded|bottomTerminalHeight|hasManuallyResizedBottomTerminal|toggleSidebar|setSidebarOpen|setSidebarWidth|toggleRightSidebar|setRightSidebarOpen|setRightSidebarWidth|setRightSidebarTab|toggleBottomTerminal|setBottomTerminalOpen|setBottomTerminalExpanded|setBottomTerminalHeight" packages/ui/src`

Expected: remaining `useUIStore` references are only in `useUIStore.ts` (legacy until Task 4 removes them).

- [ ] **Step 4: Run tests**

Run: `bun test packages/ui/src/stores/useLayoutStore.test.ts`
Run: `bun run test:stores`
Run: `bun run test:react`
Run: `bun run type-check`

Expected: all pass.

---

### Task 4: Remove legacy B1 surface from `useUIStore`

**Files:**
- Modify: `packages/ui/src/stores/useUIStore.ts`

- [ ] **Step 1: Remove fields, setters, constants, and partialize keys**

Delete from `useUIStore.ts`:
- `LEFT_SIDEBAR_MIN_WIDTH` and `RIGHT_SIDEBAR_MIN_WIDTH` constants (lines 99-100).
- 9 interface fields: `isSidebarOpen`, `sidebarWidth`, `isRightSidebarOpen`, `rightSidebarWidth`, `rightSidebarTab`, `isBottomTerminalOpen`, `isBottomTerminalExpanded`, `bottomTerminalHeight`, `hasManuallyResizedBottomTerminal`.
- 11 interface method signatures: `toggleSidebar`, `setSidebarOpen`, `setSidebarWidth`, `toggleRightSidebar`, `setRightSidebarOpen`, `setRightSidebarWidth`, `setRightSidebarTab`, `toggleBottomTerminal`, `setBottomTerminalOpen`, `setBottomTerminalExpanded`, `setBottomTerminalHeight`.
- 9 initial state values.
- 11 method implementations (lines 638-1008).
- 8 `partialize` keys: `isSidebarOpen`, `sidebarWidth`, `isRightSidebarOpen`, `rightSidebarWidth`, `rightSidebarTab`, `isBottomTerminalOpen`, `isBottomTerminalExpanded`, `bottomTerminalHeight`.

Do NOT bump version. Do NOT add migration blocks.

- [ ] **Step 2: Verify**

Run: `bun test packages/ui/src/stores/useUIStore.test.ts`
Run: `bun run test:stores`
Run: `bun run test:react`
Run: `bun run type-check`

Expected: all pass.

---

## Sub-slice B3 — `useNavigationStore`

**Fields (3):** `activeMainTab`, `mainTabGuard`, `isSessionSwitcherOpen`.

**Setters (3):** `setActiveMainTab`, `setMainTabGuard`, `setSessionSwitcherOpen`.

**Types:** `MainTab` and `MainTabGuard` types (currently exported from `useUIStore.ts` lines 7, 49) move to `useNavigationStore.ts`. Re-export them from `useUIStore.ts` (`export type { MainTab, MainTabGuard } from './useNavigationStore'`) so the 8+ existing import sites don't need to change in this wave.

**Persist key:** `navigation-store`. **Version:** `1`. **Partialize:** `activeMainTab`, `isSessionSwitcherOpen` only (not `mainTabGuard` — it's a function).

**Defaults:**
- `activeMainTab: 'chat'`
- `mainTabGuard: null`
- `isSessionSwitcherOpen: false`

**Cross-slice dependency:** `navigateToDiff` and `consumePendingDiffFile` stay in `useUIStore` (they touch `pendingDiffFile`). After B3 migration, `navigateToDiff` reads `mainTabGuard` from `useNavigationStore.getState()` and writes `activeMainTab` via `useNavigationStore.getState().setActiveMainTab('diff')` or `useNavigationStore.setState({ activeMainTab: 'diff' })`.

### Task 5: Write `useNavigationStore` tests (RED)

**Files:**
- Create: `packages/ui/src/stores/useNavigationStore.test.ts`

- [ ] **Step 1: Write tests covering:**
- `setActiveMainTab` sets tab directly when no guard.
- `setActiveMainTab` early-returns when guard rejects.
- `setActiveMainTab` sets tab when guard approves.
- `setMainTabGuard` sets guard.
- `setMainTabGuard` is no-op when guard is same.
- `setSessionSwitcherOpen` sets directly.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useNavigationStore.test.ts`
Expected: FAIL — module not found.

---

### Task 6: Create `useNavigationStore` (GREEN)

**Files:**
- Create: `packages/ui/src/stores/useNavigationStore.ts`

- [ ] **Step 1: Implement store with verbatim setter bodies from `useUIStore.ts` lines 1010-1027.**

Store sketch:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type MainTab = 'chat' | 'plan' | 'files' | 'git' | 'terminal' | 'diff' | 'settings';
export type MainTabGuard = ((tab: MainTab) => boolean) | null;

type NavigationState = {
  activeMainTab: MainTab;
  mainTabGuard: MainTabGuard;
  isSessionSwitcherOpen: boolean;
  setActiveMainTab: (tab: MainTab) => void;
  setMainTabGuard: (guard: MainTabGuard) => void;
  setSessionSwitcherOpen: (open: boolean) => void;
};

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      activeMainTab: 'chat',
      mainTabGuard: null,
      isSessionSwitcherOpen: false,
      // Copy exact method bodies from useUIStore lines 1010-1027.
      setActiveMainTab: (tab) => { /* verbatim */ },
      setMainTabGuard: (guard) => { /* verbatim */ },
      setSessionSwitcherOpen: (open) => { /* verbatim */ },
    }),
    {
      name: 'navigation-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        activeMainTab: state.activeMainTab,
        isSessionSwitcherOpen: state.isSessionSwitcherOpen,
      }),
    },
  ),
);
```

- [ ] **Step 2: Verify GREEN**

Run: `bun test packages/ui/src/stores/useNavigationStore.test.ts`
Expected: PASS.

---

### Task 7: Migrate B3 consumers + update `navigateToDiff` + split `useRouter` subscription

**Files (18 consumers + useUIStore.ts):**
- `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx`
- `packages/ui/src/components/layout/Header.tsx`
- `packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/layout/MobileShell.tsx`
- `packages/ui/src/components/layout/ProjectActionsButton.tsx`
- `packages/ui/src/components/session/ProjectNotesTodoPanel.tsx`
- `packages/ui/src/components/session/SessionSidebar.tsx`
- `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx`
- `packages/ui/src/components/ui/CommandPalette.tsx`
- `packages/ui/src/components/views/FilesView.tsx`
- `packages/ui/src/components/views/PlanView.tsx`
- `packages/ui/src/components/views/TerminalView.tsx`
- `packages/ui/src/components/views/git/ConflictDialog.tsx`
- `packages/ui/src/components/views/git/IntegrateCommitsSection.tsx`
- `packages/ui/src/components/views/git/PullRequestSection.tsx`
- `packages/ui/src/hooks/useEdgeSwipe.ts`
- `packages/ui/src/hooks/useKeyboardShortcuts.ts`
- `packages/ui/src/hooks/useMenuActions.ts`
- `packages/ui/src/hooks/useRouter.ts` — **special: subscription split (Step 3)**
- `packages/ui/src/stores/useUIStore.ts` — update `navigateToDiff`/`consumePendingDiffFile`.

- [ ] **Step 1: Replace selectors in 18 consumer files**

`useUIStore((s) => s.activeMainTab)` → `useNavigationStore((s) => s.activeMainTab)`, etc. Add `import { useNavigationStore } from '@/stores/useNavigationStore'` where needed. Also add `export type { MainTab, MainTabGuard } from './useNavigationStore'` to `useUIStore.ts` so existing type-only imports from `@/stores/useUIStore` continue to resolve.

- [ ] **Step 2: Update `navigateToDiff` in `useUIStore.ts`**

```ts
// Before (inside useUIStore):
navigateToDiff: (filePath) => {
  const guard = get().mainTabGuard;
  if (guard && !guard('diff')) { return; }
  set({ pendingDiffFile: filePath, activeMainTab: 'diff' });
},

// After (still inside useUIStore, but reads/writes navigation imperatively):
// Set pendingDiffFile FIRST to preserve observable ordering, then switch tab.
navigateToDiff: (filePath) => {
  const { mainTabGuard, setActiveMainTab } = useNavigationStore.getState();
  if (mainTabGuard && !mainTabGuard('diff')) { return; }
  set({ pendingDiffFile: filePath });
  setActiveMainTab('diff');
},
```

`consumePendingDiffFile` stays unchanged (only touches `pendingDiffFile`).

- [ ] **Step 3: Split `useRouter.ts` subscription**

`useRouter.ts` currently has a single `useUIStore.subscribe` that watches both `activeMainTab` (B3) and `pendingDiffFile`/`settingsPage` (useUIStore). After B3, `activeMainTab` moves to `useNavigationStore`, so the subscription must be split:

```ts
// Before: single subscription on useUIStore watching activeMainTab + pendingDiffFile + settingsPage
const unsubscribe = useUIStore.subscribe((state) => {
  const tabChanged = state.activeMainTab !== prevTab;
  const diffFileChanged = state.pendingDiffFile !== prevDiffFile && state.activeMainTab === 'diff';
  // ... sync URL ...
});

// After: two subscriptions — one on useNavigationStore for tab changes, one on useUIStore for pendingDiffFile
let prevTab = useNavigationStore.getState().activeMainTab;
let prevDiffFile = useUIStore.getState().pendingDiffFile;

const unsubNav = useNavigationStore.subscribe((navState) => {
  if (navState.activeMainTab !== prevTab) {
    prevTab = navState.activeMainTab;
    syncURLFromState(); // shared URL-sync function
  }
});

const unsubUI = useUIStore.subscribe((uiState) => {
  if (uiState.pendingDiffFile !== prevDiffFile) {
    prevDiffFile = uiState.pendingDiffFile;
    syncURLFromState();
  }
});
```

Extract the URL-sync logic into a shared `syncURLFromState()` function that reads from both stores via `.getState()`. Return a cleanup that calls both unsubscribers.

- [ ] **Step 4: Update test infrastructure**

`resetTopLevelStores()`, `sessionSidebarMocks.tsx` — move `activeMainTab`, `isSessionSwitcherOpen` to `useNavigationStore`.

- [ ] **Step 5: Verify**

Run: `bun run test:stores`, `bun run test:react`, `bun run type-check`.
Expected: all pass.

---

### Task 8: Remove legacy B3 surface from `useUIStore`

**Files:**
- Modify: `packages/ui/src/stores/useUIStore.ts`

- [ ] **Step 1: Delete 4 fields, 3 setters, 2 partialize keys**

Remove `activeMainTab`, `mainTabGuard`, `isSessionSwitcherOpen` from interface, initial state, implementations, and `partialize`. Do NOT remove `navigateToDiff` or `consumePendingDiffFile` — they stay (they own `pendingDiffFile`).

Do NOT bump version. Do NOT add migration blocks.

- [ ] **Step 2: Verify**

Run: `bun run test:stores`, `bun run test:react`, `bun run type-check`.
Expected: all pass.

---

## Sub-slice B2 — `useRuntimeStore`

**Fields (2):** `isMobile`, `isKeyboardOpen`.
**Setters (2):** `setIsMobile`, `setKeyboardOpen`.
**NOT persisted** — runtime-only store, no `persist` middleware.

**Defaults:**
- `isMobile: false`
- `isKeyboardOpen: false`

**Skill update required:** `.opencode/skills/mobile-first-ui/SKILL.md` has 4 references to `useUIStore` (lines 14, 18, 22, 26) that must update to `useRuntimeStore`. Lines 53 and 64 mention `isMobile` without naming `useUIStore` — no edit needed there.

### Task 9: Write `useRuntimeStore` tests (RED)

- [ ] **Step 1: Write tests covering:**
- `setIsMobile` sets directly.
- `setKeyboardOpen` sets directly.
- `setKeyboardOpen` is no-op when same (has the `state.isKeyboardOpen === open ? state : ...` guard).

- [ ] **Step 2: Verify RED**

---

### Task 10: Create `useRuntimeStore` (GREEN)

- [ ] **Step 1: Implement non-persisted store**

```ts
import { create } from 'zustand';

type RuntimeState = {
  isMobile: boolean;
  isKeyboardOpen: boolean;
  setIsMobile: (mobile: boolean) => void;
  setKeyboardOpen: (open: boolean) => void;
};

export const useRuntimeStore = create<RuntimeState>((set) => ({
  isMobile: false,
  isKeyboardOpen: false,
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  setKeyboardOpen: (open) => set((state) => state.isKeyboardOpen === open ? state : { isKeyboardOpen: open }),
}));
```

- [ ] **Step 2: Verify GREEN**

---

### Task 11: Migrate B2 consumers (20 files)

- [ ] **Step 1: Replace `useUIStore` selectors with `useRuntimeStore` selectors in all 20 consumer files**

Consumer files:
- `packages/ui/src/components/chat/ChatInput.tsx`
- `packages/ui/src/components/chat/FileAttachment.tsx`
- `packages/ui/src/components/chat/message/TextSelectionMenu.tsx`
- `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx`
- `packages/ui/src/components/chat/state/useChatComposerState.ts`
- `packages/ui/src/components/chat/status/StatusRow.tsx`
- `packages/ui/src/components/chat/diff/PendingChangesBar.tsx`
- `packages/ui/src/components/chat/diff/TurnChangedFilesDropdown.tsx`
- `packages/ui/src/components/layout/MainLayout.tsx`
- `packages/ui/src/components/sections/agents/ModelSelector.tsx`
- `packages/ui/src/components/sections/commands/AgentSelector.tsx`
- `packages/ui/src/components/session/GitHubIntegrationDialog.tsx`
- `packages/ui/src/components/session/GitHubIssuePickerDialog.tsx`
- `packages/ui/src/components/session/GitHubPrPickerDialog.tsx`
- `packages/ui/src/components/session/NewWorktreeDialog.tsx`
- `packages/ui/src/components/session/ScheduledTaskEditorDialog.tsx`
- `packages/ui/src/components/session/ScheduledTasksDialog.tsx`
- `packages/ui/src/components/ui/sortable-tabs-strip.tsx`
- `packages/ui/src/components/views/GitView.tsx`
- `packages/ui/src/components/views/git/GitHeader.tsx`
- `packages/ui/src/hooks/useEdgeSwipe.ts`
- `packages/ui/src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 2: Update test infrastructure**

- `resetTopLevelStores()`: move `isMobile: false` to `useRuntimeStore.setState()`.
- `sessionSidebarMocks.tsx`: add `useRuntimeStore` mock, remove `isMobile` from `useUIStore` mock.
- `tests/perf/chat-input.bench.tsx`: **split** the `seedUIStore` call — keep `seedUIStore({ inputSpellcheckEnabled, isExpandedInput, settingsPage })` for the fields that stay on `useUIStore`, and add `useRuntimeStore.setState({ isMobile: false, isKeyboardOpen: false }, false)`.

- [ ] **Step 3: Update `.opencode/skills/mobile-first-ui/SKILL.md`**

Replace 4 references from `useUIStore` to `useRuntimeStore`:
- Line 14: "`isMobile` lives in `useRuntimeStore`."
- Line 18: `const isMobile = useRuntimeStore((s) => s.isMobile);`
- Line 22: `const { isMobile } = useRuntimeStore.getState();`
- Line 26: "useRuntimeStore.isMobile is the single source of truth"

- [ ] **Step 4: Verify**

Run: `bun run test:stores`, `bun run test:react`, `bun run test:perf`, `bun run type-check`.
Expected: all pass.

---

### Task 12: Remove legacy B2 surface from `useUIStore`

- [ ] **Step 1: Delete 2 fields + 2 setters from interface, initial state, implementations**

No `partialize` keys to remove (B2 was never persisted). Do NOT bump version.

- [ ] **Step 2: Final verification**

Run: `bun run test:stores`, `bun run test:react`, `bun run test:perf`, `bun run type-check`.
Expected: all pass.

Run: `rg "isMobile|isKeyboardOpen|setIsMobile|setKeyboardOpen" packages/ui/src/stores/useUIStore.ts`
Expected: 0 matches.

---

## Non-Goals

- Do not migrate unrelated `useUIStore` slices in this plan (context panel, remaining 28 fields).
- Do not change layout UX, sidebar resize behavior, or tab routing logic.
- Do not add new dependencies.
- Do not add migration helpers, version bumps, or migration blocks.
