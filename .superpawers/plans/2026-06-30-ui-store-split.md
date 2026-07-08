# useUIStore Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the next realistic `useUIStore` split by moving Diff Preferences into `useDiffPreferencesStore`, while preserving a larger roadmap for the remaining slices.

**Architecture:** This plan is executable for Slice D only. The new diff store follows the proven model-preferences migration pattern: module-load copy-in from the legacy `ui-store` envelope, new persisted store, consumer migration, desktop settings sync migration, and final `useUIStore` version cleanup. Future slices remain as roadmap cards and must be expanded into task-level plans before implementation.

**Tech Stack:** React, TypeScript, Zustand `persist`, `createJSONStorage(() => getSafeStorage())`, Bun tests.

---

## Plan Boundaries

This file intentionally has two levels of detail:

- **Executable now:** Tasks 1-5 for Diff Preferences.
- **Roadmap only:** Notification Settings, Appearance Preferences, Context Panel, and Layout/Shell cards.

Do not implement roadmap-only cards from this file. Expand each later slice into task-level instructions after the diff slice lands and its migration/autosave pattern is verified.

## Current State

`packages/ui/src/stores/useUIStore.ts` is still the largest shared UI Zustand store. It is persisted under the `ui-store` key and wrapped in middleware, so every unrelated update still causes all selectors on the store to re-evaluate. The first completed split, `useModelPreferencesStore`, established the migration pattern this plan reuses.

The next realistic slice is Diff Preferences because the actual production consumer set is small, the setter behavior is simple, and the only non-trivial coupling is desktop settings sync.

## Slice D Scope — Diff Preferences

**Fields:** `diffLayoutPreference`, `diffFileLayout`, `diffWrapLines`, `diffViewMode`, `gitChangesViewMode`.

**Setters:** `setDiffLayoutPreference`, `setDiffFileLayout`, `setDiffWrapLines`, `setDiffViewMode`, `setGitChangesViewMode`.

**Persistence:** Persist `diffLayoutPreference`, `diffWrapLines`, `diffViewMode`, and `gitChangesViewMode`. Do **not** persist `diffFileLayout`; it is not currently in `useUIStore` `partialize` and must remain runtime-only in this move.

**Actual production consumers to migrate:**

- `packages/ui/src/components/views/DiffView.tsx`
- `packages/ui/src/components/sections/openchamber/GitSettings.tsx`
- `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- `packages/ui/src/components/views/git/ChangesSection.tsx`
- `packages/ui/src/lib/theme/appearanceAutoSave.ts`
- `packages/ui/src/lib/config/persistence.ts`

**Type-contract references to preserve:**

- `packages/ui/src/lib/desktop/desktop.ts`
- `packages/ui/src/lib/api/types.ts`

The type-contract files keep the same `DesktopSettings` / API field names. Do not rename the external contract.

## Global Constraints

- Do not touch unrelated dirty files.
- Do not use `pgrep`, `pkill`, `killall`, or process-name matching.
- Do not add dependencies.
- Do not modify the sibling `../opencode` repo.
- Do not commit unless the user explicitly asks.
- Preserve setter behavior exactly during the move.
- Preserve desktop settings field names and payload shapes.
- Keep `diffFileLayout` runtime-only.

---

## Task 1: Characterize Diff Preferences Semantics (RED)

**Files:**

- Create: `packages/ui/src/stores/useDiffPreferencesStore.test.ts`
- Read: `packages/ui/src/stores/useUIStore.ts` anchors `setDiffLayoutPreference`, `setDiffFileLayout`, `setDiffWrapLines`, `setDiffViewMode`, `setGitChangesViewMode`, `partialize`

- [ ] **Step 1: Write failing tests for the new store surface**

Create `packages/ui/src/stores/useDiffPreferencesStore.test.ts` using the existing singleton-store test style from `useModelPreferencesStore.test.ts`.

Target-state sketch:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  migrateDiffPreferencesFromLegacyUIStore,
  useDiffPreferencesStore,
} from './useDiffPreferencesStore';

const DEFAULTS = {
  diffLayoutPreference: 'inline' as const,
  diffFileLayout: {} as Record<string, 'inline' | 'side-by-side'>,
  diffWrapLines: false,
  diffViewMode: 'stacked' as const,
  gitChangesViewMode: 'flat' as const,
};

const resetStore = () => {
  useDiffPreferencesStore.setState({ ...DEFAULTS }, false);
};

const createInMemoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as Storage;
};

describe('useDiffPreferencesStore', () => {
  beforeEach(resetStore);

  it('setDiffLayoutPreference updates the layout preference', () => {
    useDiffPreferencesStore.getState().setDiffLayoutPreference('side-by-side');
    expect(useDiffPreferencesStore.getState().diffLayoutPreference).toBe('side-by-side');
  });

  it('setDiffFileLayout merges per-file mode without touching other files', () => {
    useDiffPreferencesStore.getState().setDiffFileLayout('a.ts', 'side-by-side');
    useDiffPreferencesStore.getState().setDiffFileLayout('b.ts', 'inline');

    expect(useDiffPreferencesStore.getState().diffFileLayout).toEqual({
      'a.ts': 'side-by-side',
      'b.ts': 'inline',
    });
  });

  it('setDiffWrapLines updates the wrap flag', () => {
    useDiffPreferencesStore.getState().setDiffWrapLines(true);
    expect(useDiffPreferencesStore.getState().diffWrapLines).toBe(true);
  });

  it('setDiffViewMode updates the diff view mode', () => {
    useDiffPreferencesStore.getState().setDiffViewMode('single');
    expect(useDiffPreferencesStore.getState().diffViewMode).toBe('single');
  });

  it('setGitChangesViewMode updates the git changes view mode', () => {
    useDiffPreferencesStore.getState().setGitChangesViewMode('tree');
    expect(useDiffPreferencesStore.getState().gitChangesViewMode).toBe('tree');
  });

  it('migrates valid persisted diff fields from a legacy ui-store envelope', () => {
    const storage = createInMemoryStorage();
    storage.setItem('ui-store', JSON.stringify({
      state: {
        diffLayoutPreference: 'dynamic',
        diffFileLayout: { 'ignored.ts': 'side-by-side' },
        diffWrapLines: true,
        diffViewMode: 'single',
        gitChangesViewMode: 'tree',
      },
      version: 10,
    }));

    expect(migrateDiffPreferencesFromLegacyUIStore(storage)).toBe(true);

    const saved = JSON.parse(storage.getItem('diff-preferences-store')!);
    expect(saved).toEqual({
      state: {
        diffLayoutPreference: 'dynamic',
        diffWrapLines: true,
        diffViewMode: 'single',
        gitChangesViewMode: 'tree',
      },
      version: 1,
    });
  });

  it('does not persist diffFileLayout in the migrated envelope', () => {
    const storage = createInMemoryStorage();
    storage.setItem('ui-store', JSON.stringify({
      state: { diffFileLayout: { 'a.ts': 'side-by-side' } },
      version: 10,
    }));

    migrateDiffPreferencesFromLegacyUIStore(storage);
    const saved = JSON.parse(storage.getItem('diff-preferences-store')!);
    expect(saved.state.diffFileLayout).toBeUndefined();
  });

  it('returns false when the new store key already exists', () => {
    const storage = createInMemoryStorage();
    storage.setItem('diff-preferences-store', JSON.stringify({ state: { diffViewMode: 'single' }, version: 1 }));
    expect(migrateDiffPreferencesFromLegacyUIStore(storage)).toBe(false);
  });

  it('returns false when ui-store is missing or malformed', () => {
    expect(migrateDiffPreferencesFromLegacyUIStore(createInMemoryStorage())).toBe(false);

    const storage = createInMemoryStorage();
    storage.setItem('ui-store', 'not-json{');
    expect(migrateDiffPreferencesFromLegacyUIStore(storage)).toBe(false);
  });

  it('falls back to defaults for invalid legacy values', () => {
    const storage = createInMemoryStorage();
    storage.setItem('ui-store', JSON.stringify({
      state: {
        diffLayoutPreference: 'bad',
        diffWrapLines: 'yes',
        diffViewMode: 'bad',
        gitChangesViewMode: 'bad',
      },
      version: 10,
    }));

    migrateDiffPreferencesFromLegacyUIStore(storage);
    const saved = JSON.parse(storage.getItem('diff-preferences-store')!);
    expect(saved.state).toEqual({
      diffLayoutPreference: 'inline',
      diffWrapLines: false,
      diffViewMode: 'stacked',
      gitChangesViewMode: 'flat',
    });
  });

  it('never deletes the legacy ui-store key', () => {
    const storage = createInMemoryStorage();
    storage.setItem('ui-store', JSON.stringify({ state: {}, version: 10 }));
    migrateDiffPreferencesFromLegacyUIStore(storage);
    expect(storage.getItem('ui-store')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useDiffPreferencesStore.test.ts`

Expected: FAIL because `useDiffPreferencesStore` does not exist yet.

---

## Task 2: Create The Diff Preferences Store (GREEN)

**Files:**

- Create: `packages/ui/src/stores/useDiffPreferencesStore.ts`
- Test: `packages/ui/src/stores/useDiffPreferencesStore.test.ts`

- [ ] **Step 1: Implement the migration helper before store creation**

Create `packages/ui/src/stores/useDiffPreferencesStore.ts`. The module-load migration call must occur before `useDiffPreferencesStore` is created so Zustand hydrates from the new key after the legacy copy-in runs.

Target-state sketch:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

type DiffLayoutPreference = 'dynamic' | 'inline' | 'side-by-side';
type DiffFileLayout = Record<string, 'inline' | 'side-by-side'>;
type DiffViewMode = 'single' | 'stacked';
type GitChangesViewMode = 'flat' | 'tree';

type DiffPreferencesState = {
  diffLayoutPreference: DiffLayoutPreference;
  diffFileLayout: DiffFileLayout;
  diffWrapLines: boolean;
  diffViewMode: DiffViewMode;
  gitChangesViewMode: GitChangesViewMode;
  setDiffLayoutPreference: (mode: DiffLayoutPreference) => void;
  setDiffFileLayout: (filePath: string, mode: 'inline' | 'side-by-side') => void;
  setDiffWrapLines: (wrap: boolean) => void;
  setDiffViewMode: (mode: DiffViewMode) => void;
  setGitChangesViewMode: (mode: GitChangesViewMode) => void;
};

const isDiffLayoutPreference = (value: unknown): value is DiffLayoutPreference =>
  value === 'dynamic' || value === 'inline' || value === 'side-by-side';

const isDiffViewMode = (value: unknown): value is DiffViewMode =>
  value === 'single' || value === 'stacked';

const isGitChangesViewMode = (value: unknown): value is GitChangesViewMode =>
  value === 'flat' || value === 'tree';

export const migrateDiffPreferencesFromLegacyUIStore = (
  storage: Storage = getSafeStorage(),
): boolean => {
  try {
    if (storage.getItem('diff-preferences-store') !== null) {
      return false;
    }

    const raw = storage.getItem('ui-store');
    if (raw === null) {
      return false;
    }

    const envelope = JSON.parse(raw) as { state?: unknown };
    if (!envelope || !envelope.state || typeof envelope.state !== 'object') {
      return false;
    }

    const state = envelope.state as Record<string, unknown>;
    const newEnvelope = {
      state: {
        diffLayoutPreference: isDiffLayoutPreference(state.diffLayoutPreference)
          ? state.diffLayoutPreference
          : 'inline',
        diffWrapLines: typeof state.diffWrapLines === 'boolean' ? state.diffWrapLines : false,
        diffViewMode: isDiffViewMode(state.diffViewMode) ? state.diffViewMode : 'stacked',
        gitChangesViewMode: isGitChangesViewMode(state.gitChangesViewMode)
          ? state.gitChangesViewMode
          : 'flat',
      },
      version: 1,
    };

    storage.setItem('diff-preferences-store', JSON.stringify(newEnvelope));
    return true;
  } catch {
    return false;
  }
};

migrateDiffPreferencesFromLegacyUIStore();

export const useDiffPreferencesStore = create<DiffPreferencesState>()(
  persist(
    (set) => ({
      diffLayoutPreference: 'inline',
      diffFileLayout: {},
      diffWrapLines: false,
      diffViewMode: 'stacked',
      gitChangesViewMode: 'flat',

      setDiffLayoutPreference: (mode) => {
        set({ diffLayoutPreference: mode });
      },

      setDiffFileLayout: (filePath, mode) => {
        set((state) => ({
          diffFileLayout: {
            ...state.diffFileLayout,
            [filePath]: mode,
          },
        }));
      },

      setDiffWrapLines: (wrap) => {
        set({ diffWrapLines: wrap });
      },

      setDiffViewMode: (mode) => {
        set({ diffViewMode: mode });
      },

      setGitChangesViewMode: (mode) => {
        set({ gitChangesViewMode: mode });
      },
    }),
    {
      name: 'diff-preferences-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        diffLayoutPreference: state.diffLayoutPreference,
        diffWrapLines: state.diffWrapLines,
        diffViewMode: state.diffViewMode,
        gitChangesViewMode: state.gitChangesViewMode,
      }),
    },
  ),
);
```

- [ ] **Step 2: Verify store tests pass**

Run: `bun test packages/ui/src/stores/useDiffPreferencesStore.test.ts`

Expected: PASS.

- [ ] **Step 3: Run nearby store tests and type-check**

Run: `bun test packages/ui/src/stores/useUIStore.test.ts`

Run: `bun run --filter '@openchamber/ui' type-check`

Expected: both pass.

---

## Task 3: Migrate Diff Preferences Consumers And Desktop Sync

**Files:**

- Modify: `packages/ui/src/components/views/DiffView.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/GitSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- Modify: `packages/ui/src/components/views/git/ChangesSection.tsx`
- Modify: `packages/ui/src/lib/theme/appearanceAutoSave.ts`
- Modify: `packages/ui/src/lib/config/persistence.ts`
- Read only: `packages/ui/src/lib/desktop/desktop.ts`
- Read only: `packages/ui/src/lib/api/types.ts`

- [ ] **Step 1: Confirm actual consumers with a targeted search**

Run:

```bash
rg "useUIStore.*(diffLayoutPreference|diffFileLayout|diffWrapLines|diffViewMode|gitChangesViewMode|setDiffLayoutPreference|setDiffFileLayout|setDiffWrapLines|setDiffViewMode|setGitChangesViewMode)|(diffLayoutPreference|diffFileLayout|diffWrapLines|diffViewMode|gitChangesViewMode|setDiffLayoutPreference|setDiffFileLayout|setDiffWrapLines|setDiffViewMode|setGitChangesViewMode).*useUIStore" packages/ui/src --glob '*.{ts,tsx}'
```

Expected production consumers: the six files listed above. If the command finds another real `useUIStore` consumer, migrate it too. Ignore unrelated local variables named `diffViewMode` that do not read from `useUIStore`.

- [ ] **Step 2: Swap component selectors and setters**

In component files, replace only the diff-preference selectors/setters with `useDiffPreferencesStore`. Keep unrelated `useUIStore` selectors intact.

Target-state sketch:

```ts
// ... existing imports ...
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
import { useUIStore } from '@/stores/useUIStore';

// ... existing code ...
const diffLayoutPreference = useDiffPreferencesStore((state) => state.diffLayoutPreference);
const setDiffFileLayout = useDiffPreferencesStore((state) => state.setDiffFileLayout);
const isMobile = useUIStore((state) => state.isMobile);
// ... existing code ...
```

- [ ] **Step 3: Update apply-once desktop settings in `persistence.ts`**

Add `useDiffPreferencesStore` import. At the existing `applySettingsToStores` diff-preference block, use the new store's state and setters while preserving validation and external field names.

Target-state sketch:

```ts
// ... existing imports ...
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
// ... existing imports ...

// Inside applySettingsToStores, near the existing diff settings block:
const diffStore = useDiffPreferencesStore.getState();

if (typeof settings.diffLayoutPreference === 'string'
  && (settings.diffLayoutPreference === 'dynamic' || settings.diffLayoutPreference === 'inline' || settings.diffLayoutPreference === 'side-by-side')) {
  if (settings.diffLayoutPreference !== diffStore.diffLayoutPreference) {
    diffStore.setDiffLayoutPreference(settings.diffLayoutPreference);
  }
}

if (typeof settings.diffViewMode === 'string'
  && (settings.diffViewMode === 'single' || settings.diffViewMode === 'stacked')) {
  if (settings.diffViewMode !== diffStore.diffViewMode) {
    diffStore.setDiffViewMode(settings.diffViewMode);
  }
}

if (typeof settings.gitChangesViewMode === 'string'
  && (settings.gitChangesViewMode === 'flat' || settings.gitChangesViewMode === 'tree')) {
  if (settings.gitChangesViewMode !== diffStore.gitChangesViewMode) {
    diffStore.setGitChangesViewMode(settings.gitChangesViewMode);
  }
}
```

Do not change `sanitizeWebSettings` field names or `DesktopSettings` shape.

- [ ] **Step 4: Split diff autosave out of the monolithic `useUIStore` subscription**

`appearanceAutoSave.ts` currently snapshots diff fields through the `useUIStore.subscribe(...)` callback. After moving diff fields, add a second subscription to `useDiffPreferencesStore` that shares the existing `schedule(diff)` debounced writer.

Target-state sketch:

```ts
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
import { useUIStore } from '@/stores/useUIStore';
// ... existing imports ...

type AppearanceSlice = {
  showReasoningTraces: boolean;
  showDeletionDialog: boolean;
  // ... existing non-diff fields only ...
  inputBarOffset: number;
};

type DiffPreferencesSlice = {
  diffLayoutPreference: 'dynamic' | 'inline' | 'side-by-side';
  diffViewMode: 'single' | 'stacked';
  gitChangesViewMode: 'flat' | 'tree';
};

// Inside startAppearanceAutoSave:
let previous: AppearanceSlice = {
  showReasoningTraces: useUIStore.getState().showReasoningTraces,
  // ... existing non-diff fields only ...
  inputBarOffset: useUIStore.getState().inputBarOffset,
};

let previousDiff: DiffPreferencesSlice = {
  diffLayoutPreference: useDiffPreferencesStore.getState().diffLayoutPreference,
  diffViewMode: useDiffPreferencesStore.getState().diffViewMode,
  gitChangesViewMode: useDiffPreferencesStore.getState().gitChangesViewMode,
};

// Keep existing pending/timer/flush/schedule code.

useUIStore.subscribe((state) => {
  const current: AppearanceSlice = {
    showReasoningTraces: state.showReasoningTraces,
    // ... existing non-diff fields only ...
    inputBarOffset: state.inputBarOffset,
  };

  const diff: Partial<DesktopSettings> = {};
  // ... existing non-diff comparisons only ...
  previous = current;
  if (Object.keys(diff).length > 0) {
    schedule(diff);
  }
});

useDiffPreferencesStore.subscribe((state) => {
  const current: DiffPreferencesSlice = {
    diffLayoutPreference: state.diffLayoutPreference,
    diffViewMode: state.diffViewMode,
    gitChangesViewMode: state.gitChangesViewMode,
  };

  const diff: Partial<DesktopSettings> = {};
  if (current.diffLayoutPreference !== previousDiff.diffLayoutPreference) {
    diff.diffLayoutPreference = current.diffLayoutPreference;
  }
  if (current.diffViewMode !== previousDiff.diffViewMode) {
    diff.diffViewMode = current.diffViewMode;
  }
  if (current.gitChangesViewMode !== previousDiff.gitChangesViewMode) {
    diff.gitChangesViewMode = current.gitChangesViewMode;
  }

  previousDiff = current;
  if (Object.keys(diff).length > 0) {
    schedule(diff);
  }
});
```

Preserve the existing `initialized` guard, `typeof window === 'undefined'` guard, debounce duration, and `updateDesktopSettings` call.

- [ ] **Step 5: Verify no direct diff reads remain through `useUIStore` outside `useUIStore.ts`**

Run the targeted `rg` command from Step 1.

Expected: no production references outside `useUIStore.ts`. Type-contract references in `desktop.ts` and `api/types.ts` remain because they do not use `useUIStore`.

- [ ] **Step 6: Run verification**

Run: `bun test packages/ui/src/stores/useDiffPreferencesStore.test.ts`

Run: `bun run test:stores`

Run: `bun run test:react`

Run: `bun run type-check`

Expected: all pass.

---

## Task 4: Remove Legacy Diff Preferences Surface From useUIStore

**Files:**

- Modify: `packages/ui/src/stores/useUIStore.ts`
- Test: `packages/ui/src/stores/useUIStore.test.ts`

- [ ] **Step 1: Confirm all consumers migrated**

Run the targeted `rg` command from Task 3 Step 1.

Expected: zero production consumers read or write diff preferences through `useUIStore`.

- [ ] **Step 2: Remove diff fields, setters, initial values, and partialize keys**

Delete from `useUIStore.ts`:

- Interface fields: `diffLayoutPreference`, `diffFileLayout`, `diffWrapLines`, `diffViewMode`, `gitChangesViewMode`.
- Setter signatures: `setDiffLayoutPreference`, `setDiffFileLayout`, `setDiffWrapLines`, `setDiffViewMode`, `setGitChangesViewMode`.
- Initial values for the five fields.
- Setter implementations for the five setters.
- `partialize` keys for `diffLayoutPreference`, `diffWrapLines`, `diffViewMode`, and `gitChangesViewMode`.

Do not look for `diffFileLayout` in `partialize`; it is not currently persisted.

- [ ] **Step 3: Bump `ui-store` version and delete stale persisted keys**

Current `ui-store` version is 10. Bump it to 11. Add a new migration block after the v10 block:

```ts
// v10 -> v11: diff preferences moved to useDiffPreferencesStore.
// The new store copies valid values from the legacy ui-store envelope before
// this cleanup deletes the stale keys from persisted state.
if (version < 11) {
  delete state.diffLayoutPreference;
  delete state.diffFileLayout;
  delete state.diffWrapLines;
  delete state.diffViewMode;
  delete state.gitChangesViewMode;
}
```

Also remove the old v8 `gitChangesViewMode` sanitizer if it becomes dead or type-invalid after deleting the field from `UIStore`. The new v11 cleanup supersedes it for stale persisted state.

- [ ] **Step 4: Add or update migration cleanup coverage**

Extend `packages/ui/src/stores/useUIStore.test.ts` only if there is an existing practical way to exercise `persist` migrations in this test file. If not, rely on type-check plus the new diff-store migration tests and do not create a brittle persistence harness just for this cleanup.

- [ ] **Step 5: Verify**

Run: `bun test packages/ui/src/stores/useDiffPreferencesStore.test.ts`

Run: `bun test packages/ui/src/stores/useUIStore.test.ts`

Run: `bun run test:stores`

Run: `bun run test:react`

Run: `bun run type-check`

Run:

```bash
rg "diffLayoutPreference|diffFileLayout|diffWrapLines|diffViewMode|gitChangesViewMode|setDiffLayoutPreference|setDiffFileLayout|setDiffWrapLines|setDiffViewMode|setGitChangesViewMode" packages/ui/src/stores/useUIStore.ts
```

Expected: tests and type-check pass. The final `rg` should return only the v11 migration delete statements, or zero matches if the migration is written with a typed stale-state helper that avoids direct field names.

---

## Task 5: Final Slice Verification And Handoff

**Files:**

- Inspect: `git diff --stat`
- Inspect: `git diff -- packages/ui/src/stores/useDiffPreferencesStore.ts packages/ui/src/stores/useDiffPreferencesStore.test.ts packages/ui/src/stores/useUIStore.ts packages/ui/src/lib/theme/appearanceAutoSave.ts packages/ui/src/lib/config/persistence.ts`

- [ ] **Step 1: Inspect diff boundaries**

Run: `git diff --stat`

Expected: only files required by the diff slice are changed.

- [ ] **Step 2: Run required verification**

Run: `bun run type-check`

Run: `bun run lint`

Run: `bun run test:stores`

Run: `bun run test:react`

Expected: all pass, or any pre-existing lint baseline issue is called out explicitly with evidence.

- [ ] **Step 3: Record follow-up decision**

After the diff slice lands, decide whether the next executable plan should be:

- Notification Settings alone,
- Notification Settings + Appearance as a larger preference wave,
- or a preparatory desktop-autosave split before either.

Do not begin the next slice from this plan without expanding it into task-level instructions.

---

## Roadmap Cards For Later Slices

These cards intentionally keep some bigger slices. They are not detailed enough for implementation yet.

### Slice E — Notification Settings

**Likely size:** Medium-large, but cohesive enough to keep as one slice.

**Fields:** `nativeNotificationsEnabled`, `notificationMode`, `notifyOnSubtasks`, `notifyOnCompletion`, `notifyOnError`, `notifyOnQuestion`, `notificationTemplates`, `summarizeLastMessage`, `summaryThreshold`, `summaryLength`, `maxLastMessageLength`.

**Persistence:** all 11 persisted. Desktop-synced.

**Reason to keep together:** The fields form one settings surface and one desktop settings payload family. Splitting templates, toggles, and summarization separately would likely add more migration churn than it saves.

**Main risks:** nested `notificationTemplates` validation; autosave subscription shape once `appearanceAutoSave.ts` no longer owns every setting field; possible row-level reads of `notifyOnSubtasks` in session UI.

### Slice A — Appearance Preferences

**Likely size:** Medium-large, but cohesive enough to keep as one slice.

**Fields:** `theme`, `fontSize`, `terminalFontSize`, `padding`, `cornerRadius`.

**Persistence:** all 5 persisted. Desktop-synced.

**Reason to keep together:** These fields are one visual settings surface and frequently appear together in persistence/autosave. Keep the slice together, but expand with exact consumer inventory before implementation.

**Main risks:** many consumers; `theme` drives global appearance; `setFontSize` and `setTerminalFontSize` clamps must be copied exactly.

### Slice C — Context Panel

**Likely size:** Large. Keep as one domain slice, but split into a prep task and a move task.

**Fields:** `contextPanelByDirectory`, `pendingDiffFile`, `pendingFileNavigation`, `pendingFileFocusPath`.

**Actions:** all context-panel tab/open/close/reorder/navigation actions.

**Persistence:** only `contextPanelByDirectory` persisted. Pending navigation fields stay ephemeral.

**Required prep:** Extract pure helpers from the top of `useUIStore.ts` into a sibling helper module before moving the store. Do not move helpers and consumers in one giant edit.

### Slice B — Layout / Shell

**Likely size:** Too large for one mechanical move. Needs a design decision before implementation.

**Candidate groups:**

- Visible shell and dimensions: `isSidebarOpen`, `sidebarWidth`, `isRightSidebarOpen`, `rightSidebarWidth`, `rightSidebarTab`, `isBottomTerminalOpen`, `isBottomTerminalExpanded`, `bottomTerminalHeight`, `hasManuallyResizedBottomTerminal`, `isSessionSwitcherOpen`.
- Runtime shell: `isMobile`, `isKeyboardOpen`, `inputBarOffset`, `mainTabGuard`.
- Navigation: `activeMainTab`.

**Open decision:** `useUIStore` may remain as a small shell store for cross-cutting runtime flags, especially `isMobile`, because mobile-first guidance currently treats `useUIStore.isMobile` as canonical.

## Fields Intentionally Remaining In useUIStore For Now

Until later plans expand the roadmap cards, the following fields remain in `useUIStore`:

- Settings IA / projects / instances: `settingsPage`, `settingsProjectsSelectedId`, `settingsRemoteInstancesSelectedId`
- Runtime status: `eventStreamStatus`, `mainTabGuard`
- Chat rendering: `showReasoningTraces`, `chatRenderMode`, `activityRenderMode`, `stickyUserHeader`, `userMessageRenderingMode`, `mermaidRenderingMode`
- Deletion dialog / retention: `showDeletionDialog`, `autoDeleteEnabled`, `autoDeleteAfterDays`, `sessionRetentionAction`, `autoDeleteLastRunAt`
- Input / composer: `persistChatDraft`, `inputSpellcheckEnabled`, `isExpandedInput`, `inputBarOffset`
- Tool display: `showToolFileIcons`, `showExpandedBashTools`, `showExpandedEditTools`
- Mobile chrome: `showMobileSessionStatusBar`, `isMobileSessionStatusBarCollapsed`
- Misc UI: `showTerminalQuickKeysOnDesktop`, `timeFormatPreference`, `weekStartPreference`, `reportUsage`, `shortcutOverrides`

Future grouping should be based on actual consumer inventory and update frequency, not just names.

## Acceptance Criteria For This Plan

- `useDiffPreferencesStore` exists, is tested, and persists exactly the same fields that `useUIStore` persisted.
- `diffFileLayout` remains runtime-only.
- Legacy values copy from `ui-store` into `diff-preferences-store` before new store hydration.
- All production diff-preference consumers use `useDiffPreferencesStore`.
- Desktop settings apply-once and autosave still handle `diffLayoutPreference`, `diffViewMode`, and `gitChangesViewMode` with unchanged external names.
- `useUIStore` no longer exposes diff fields or setters after the v11 cleanup.
- `bun run type-check`, `bun run test:stores`, and `bun run test:react` pass for the completed slice.

## Non-Goals

- Do not implement Notification, Appearance, Context Panel, or Layout from this plan.
- Do not rename external desktop settings fields.
- Do not change diff UX or persistence decisions beyond preserving current behavior.
- Do not refactor desktop autosave beyond the minimum split needed for the diff store.
