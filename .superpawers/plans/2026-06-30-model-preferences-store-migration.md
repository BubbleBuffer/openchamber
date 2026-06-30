# Model Preferences Store Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move model preference state out of the broad persisted `useUIStore` into a dedicated persisted `useModelPreferencesStore` without losing existing user preferences or desktop settings sync.

**Architecture:** Treat the current `useUIStore` model preference fields as a deprecated compatibility surface until a migration copies persisted data into the new store. The new store owns model preferences, desktop model-pref autosave, and settings import/export paths; `useUIStore` v10 removes the legacy persisted keys only after every consumer has migrated.

**Tech Stack:** React, TypeScript, Zustand `persist`, `createJSONStorage`, existing `getSafeStorage()`, Bun tests.

---

## Why This Exists

The original cleanup Task 9 was intentionally stopped because the simple split was not behavior-preserving:

- `favoriteModels`, `hiddenModels`, `collapsedModelProviders`, `recentModels`, and `recentEfforts` are persisted in `useUIStore` under the `ui-store` key.
- There are more consumers than the original cleanup task listed.
- Desktop settings import/export and autosave currently read and write model prefs through `useUIStore`.

This plan replaces that blocked task with an explicit migration plan.

## File Responsibilities

- Create: `packages/ui/src/stores/useModelPreferencesStore.ts` — the new owner for model preference state, actions, persistence, and migration-from-legacy helpers.
- Create: `packages/ui/src/stores/useModelPreferencesStore.test.ts` — unit coverage for exact current semantics and legacy persisted-state migration.
- Modify: `packages/ui/src/stores/useUIStore.ts` — keep legacy fields only until all consumers migrate; then bump `ui-store` version and remove model preference keys from `partialize`.
- Modify: `packages/ui/src/hooks/useModelLists.ts` — derive favorites/recents/hidden state from the new store.
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx` — read/write model preferences from the new store.
- Modify: `packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx` — read/write recent models and efforts from the new store.
- Modify: `packages/ui/src/components/sections/agents/ModelSelector.tsx` — read/write favorites, hidden models, and recents from the new store.
- Modify: `packages/ui/src/components/sections/providers/ProvidersPage.tsx` — read/write hidden model preferences from the new store.
- Modify: `packages/ui/src/hooks/useKeyboardShortcuts.ts` — read favorites and write recents from the new store.
- Modify: `packages/ui/src/lib/config/modelPrefsAutoSave.ts` — subscribe to the new store, not `useUIStore`.
- Modify: `packages/ui/src/lib/config/persistence.ts` — apply desktop settings updates to the new store, not `useUIStore`.
- Modify only if needed: `packages/ui/src/lib/desktop/desktop.ts` — keep `DesktopSettings.favoriteModels` and `DesktopSettings.recentModels` as the external settings contract; do not move unrelated settings.

## Current Model Preference Consumers

Consumers found by source search:

- `packages/ui/src/hooks/useModelLists.ts`
- `packages/ui/src/components/chat/controls/ModelControls.tsx`
- `packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx`
- `packages/ui/src/components/sections/agents/ModelSelector.tsx`
- `packages/ui/src/components/sections/providers/ProvidersPage.tsx`
- `packages/ui/src/components/multirun/ModelMultiSelect.tsx` via `useModelLists()` only
- `packages/ui/src/hooks/useKeyboardShortcuts.ts`
- `packages/ui/src/lib/config/modelPrefsAutoSave.ts`
- `packages/ui/src/lib/config/persistence.ts`
- `packages/ui/src/lib/desktop/desktop.ts` type-only external settings fields
- `packages/ui/src/stores/useUIStore.ts` legacy owner to remove last

## Task 1: Characterize Current Semantics

**Files:**

- Test: `packages/ui/src/stores/useModelPreferencesStore.test.ts`
- Read: `packages/ui/src/stores/useUIStore.ts`

- [ ] **Step 1: Write tests that encode existing `useUIStore` behavior**

Create tests for the new store using the exact current semantics from `useUIStore.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { useModelPreferencesStore } from './useModelPreferencesStore';

const resetStore = () => {
  useModelPreferencesStore.setState({
    favoriteModels: [],
    hiddenModels: [],
    collapsedModelProviders: [],
    recentModels: [],
    recentEfforts: {},
  }, false);
};

describe('useModelPreferencesStore', () => {
  beforeEach(resetStore);

  it('toggles favorite models newest first and removes existing entries', () => {
    const store = useModelPreferencesStore.getState();
    store.toggleFavoriteModel('anthropic', 'claude');
    expect(useModelPreferencesStore.getState().favoriteModels).toEqual([
      { providerID: 'anthropic', modelID: 'claude' },
    ]);
    useModelPreferencesStore.getState().toggleFavoriteModel('anthropic', 'claude');
    expect(useModelPreferencesStore.getState().favoriteModels).toEqual([]);
  });

  // Add tests for hidden models, provider collapse, recent model ordering,
  // recent effort ordering, invalid provider/model guards, and persistence migration.
});
```

Required test cases:

- `toggleFavoriteModel` adds newest first and removes existing entries.
- `isFavoriteModel` reads current favorites.
- `toggleHiddenModel` adds newest first and removes existing entries.
- `hideAllModels(providerID, modelIDs)` replaces all hidden entries for that provider with valid non-empty model IDs, preserving hidden entries for other providers.
- `showAllModels(providerID)` removes only hidden entries for that provider.
- `isHiddenModel` reads current hidden models.
- `toggleModelProviderCollapsed` trims provider IDs, ignores empty IDs, adds/removes IDs.
- `addRecentModel` dedupes by provider/model, moves the selected model to the front, and limits to 5.
- `addRecentEffort` trims provider/model/variant, defaults blank variant to `default`, dedupes by variant, and limits each provider/model key to 5.
- Legacy migration copies valid model preference fields from a simulated `ui-store` persisted envelope into the new persisted store.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useModelPreferencesStore.test.ts`

Expected: FAIL because `useModelPreferencesStore` does not exist yet.

---

## Task 2: Create The Persisted Model Preferences Store

**Files:**

- Create: `packages/ui/src/stores/useModelPreferencesStore.ts`
- Test: `packages/ui/src/stores/useModelPreferencesStore.test.ts`

- [ ] **Step 1: Implement the store with copied behavior**

Target-state sketch:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { getSafeStorage } from './utils/safeStorage';

export type ModelRef = { providerID: string; modelID: string };

type ModelPreferencesState = {
  favoriteModels: ModelRef[];
  hiddenModels: ModelRef[];
  collapsedModelProviders: string[];
  recentModels: ModelRef[];
  recentEfforts: Record<string, string[]>;
  toggleFavoriteModel: (providerID: string, modelID: string) => void;
  toggleHiddenModel: (providerID: string, modelID: string) => void;
  isHiddenModel: (providerID: string, modelID: string) => boolean;
  hideAllModels: (providerID: string, modelIDs: string[]) => void;
  showAllModels: (providerID: string) => void;
  toggleModelProviderCollapsed: (providerID: string) => void;
  isFavoriteModel: (providerID: string, modelID: string) => boolean;
  addRecentModel: (providerID: string, modelID: string) => void;
  addRecentEffort: (providerID: string, modelID: string, variant: string | undefined) => void;
};

export const useModelPreferencesStore = create<ModelPreferencesState>()(
  persist(
    (set, get) => ({
      favoriteModels: [],
      hiddenModels: [],
      collapsedModelProviders: [],
      recentModels: [],
      recentEfforts: {},
      // Copy exact method bodies from useUIStore before deleting them there.
    }),
    {
      name: 'model-preferences-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        favoriteModels: state.favoriteModels,
        hiddenModels: state.hiddenModels,
        collapsedModelProviders: state.collapsedModelProviders,
        recentModels: state.recentModels,
        recentEfforts: state.recentEfforts,
      }),
    },
  ),
);
```

- [ ] **Step 2: Add legacy `ui-store` copy-in migration**

Implement a helper in the same file:

```ts
export const migrateModelPreferencesFromLegacyUIStore = (storage = getSafeStorage()): boolean => {
  // If `model-preferences-store` already exists, return false and do not overwrite it.
  // Read `ui-store`, parse Zustand persist envelope `{ state, version }`.
  // Copy only valid arrays/objects for the five model preference fields.
  // Write a `model-preferences-store` envelope with version 1.
  // Return true only when a new store entry was written.
};
```

Validation rules:

- Model refs must be objects with string `providerID` and string `modelID`.
- `collapsedModelProviders` must be an array of non-empty strings.
- `recentEfforts` must be a record whose values are string arrays.
- Invalid fields fall back to empty defaults.
- Never delete `ui-store` keys in this helper; deletion happens only in the later `useUIStore` v10 migration after consumers are migrated.

- [ ] **Step 3: Ensure migration runs before store hydration matters**

Call `migrateModelPreferencesFromLegacyUIStore()` at module load before creating the store, or in a small exported bootstrap function that is imported before consumers read the store.

Preferred: module-load copy-in guarded by existing `model-preferences-store` key, because this mirrors the simple persisted-store migration need and avoids app bootstrap ordering changes.

- [ ] **Step 4: Verify store tests**

Run: `bun test packages/ui/src/stores/useModelPreferencesStore.test.ts`

Expected: PASS.

---

## Task 3: Migrate Readers And Writers

**Files:**

- Modify: `packages/ui/src/hooks/useModelLists.ts`
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx`
- Modify: `packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx`
- Modify: `packages/ui/src/components/sections/agents/ModelSelector.tsx`
- Modify: `packages/ui/src/components/sections/providers/ProvidersPage.tsx`
- Modify: `packages/ui/src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Replace `useUIStore` selectors with `useModelPreferencesStore` selectors**

For each model preference selector:

```ts
const favoriteModels = useUIStore((state) => state.favoriteModels);
```

use:

```ts
const favoriteModels = useModelPreferencesStore((state) => state.favoriteModels);
```

Keep unrelated `useUIStore` selectors in the same components, such as `isMobile`, drawer state, layout state, or notification settings.

- [ ] **Step 2: Update `useModelLists.ts` first**

`ModelMultiSelect.tsx` reads model preferences only through `useModelLists()`, so migrating `useModelLists.ts` migrates that path without touching `ModelMultiSelect.tsx`.

- [ ] **Step 3: Verify no direct model preference reads remain outside the store and config bridge**

Run: `rg "favoriteModels|recentModels|hiddenModels|collapsedModelProviders|recentEfforts|toggleFavoriteModel|toggleHiddenModel|hideAllModels|showAllModels|toggleModelProviderCollapsed|isFavoriteModel|isHiddenModel|addRecentModel|addRecentEffort" packages/ui/src`

Expected: remaining direct references are only in:

- `packages/ui/src/stores/useModelPreferencesStore.ts`
- `packages/ui/src/stores/useModelPreferencesStore.test.ts`
- `packages/ui/src/stores/useUIStore.ts` until Task 5 removes the legacy surface
- `packages/ui/src/lib/config/modelPrefsAutoSave.ts` until Task 4 migrates it
- `packages/ui/src/lib/config/persistence.ts` until Task 4 migrates it
- `packages/ui/src/lib/desktop/desktop.ts` type-only settings contract

---

## Task 4: Migrate Desktop Settings Sync

**Files:**

- Modify: `packages/ui/src/lib/config/modelPrefsAutoSave.ts`
- Modify: `packages/ui/src/lib/config/persistence.ts`
- Read/modify only if type changes are necessary: `packages/ui/src/lib/desktop/desktop.ts`

- [ ] **Step 1: Update autosave to subscribe to the new store**

Target-state sketch:

```ts
import { useModelPreferencesStore } from '@/stores/useModelPreferencesStore';

// ... existing refsEqual helper ...

const state = useModelPreferencesStore.getState();
const payload = { favoriteModels: state.favoriteModels, recentModels: state.recentModels };

const unsubscribe = useModelPreferencesStore.subscribe((state, prevState) => {
  // same comparison as today, using favoriteModels/recentModels from the new store
});
```

Preserve existing behavior:

- Skip autosave on server.
- Skip autosave in VS Code runtime.
- Skip the initial subscription notification.
- Debounce with the existing 1200 ms timer.
- Save only `favoriteModels` and `recentModels` to desktop settings.

- [ ] **Step 2: Update settings import/apply path**

In `packages/ui/src/lib/config/persistence.ts`, apply `settings.favoriteModels` and `settings.recentModels` to `useModelPreferencesStore.setState(...)` instead of `useUIStore.setState(...)`.

Do not change the external `DesktopSettings` contract in `desktop.ts` unless TypeScript requires a type import move; desktop settings should still expose `favoriteModels` and `recentModels` as external settings fields.

- [ ] **Step 3: Add/adjust tests if existing config tests cover model preferences**

Search for tests around `modelPrefsAutoSave` and `applySettingsToStores`. If none exist, add a focused unit test only if the existing test harness for config persistence is lightweight. Otherwise rely on store tests plus type-check and focused manual assertions in the implementation report.

---

## Task 5: Remove Legacy `useUIStore` Model Preference Surface

**Files:**

- Modify: `packages/ui/src/stores/useUIStore.ts`
- Modify tests that still seed model preference state through `useUIStore`.

- [ ] **Step 1: Confirm all consumers are migrated**

Run the `rg` command from Task 3.

Expected: no production consumer reads or writes model preference fields through `useUIStore`.

- [ ] **Step 2: Remove the deprecated fields and methods from the `UIStore` type and implementation**

Delete only:

- `favoriteModels`
- `hiddenModels`
- `collapsedModelProviders`
- `recentModels`
- `recentEfforts`
- `toggleFavoriteModel`
- `toggleHiddenModel`
- `isHiddenModel`
- `hideAllModels`
- `showAllModels`
- `toggleModelProviderCollapsed`
- `isFavoriteModel`
- `addRecentModel`
- `addRecentEffort`

Keep unrelated UI fields intact.

- [ ] **Step 3: Bump `ui-store` version and remove legacy persisted keys**

Target-state sketch:

```ts
version: 10,
migrate: (persistedState, version) => {
  // ... existing migrations ...

  // v9 -> v10: model preferences moved to useModelPreferencesStore.
  // The new store copies valid values from the legacy ui-store envelope before
  // this cleanup deletes the stale keys from ui-store persistence.
  if (version < 10) {
    delete state.favoriteModels;
    delete state.hiddenModels;
    delete state.collapsedModelProviders;
    delete state.recentModels;
    delete state.recentEfforts;
  }

  return state;
},
partialize: (state) => ({
  // remove the five model preference keys here
}),
```

- [ ] **Step 4: Remove the visible deprecated banner comments added before this plan**

Delete the temporary `OUTDATED MODEL PREFERENCES` comments from `useUIStore.ts` once the legacy surface is gone.

---

## Task 6: Verify End-To-End

**Files:**

- All files touched by Tasks 1-5.

- [ ] **Step 1: Focused store/config tests**

Run: `bun test packages/ui/src/stores/useModelPreferencesStore.test.ts`

Run: `bun test packages/ui/src/stores/useUIStore.test.ts`

Expected: PASS.

- [ ] **Step 2: Broader suites**

Run: `bun run test:stores`

Run: `bun run test:react`

Run: `bun run type-check`

Expected: PASS.

- [ ] **Step 3: Diff audit**

Run: `git diff -- packages/ui/src/stores/useModelPreferencesStore.ts packages/ui/src/stores/useUIStore.ts packages/ui/src/hooks/useModelLists.ts packages/ui/src/components/chat/controls/ModelControls.tsx packages/ui/src/components/chat/controls/UnifiedControlsDrawer.tsx packages/ui/src/components/sections/agents/ModelSelector.tsx packages/ui/src/components/sections/providers/ProvidersPage.tsx packages/ui/src/hooks/useKeyboardShortcuts.ts packages/ui/src/lib/config/modelPrefsAutoSave.ts packages/ui/src/lib/config/persistence.ts`

Expected:

- New store owns all model preference state and persistence.
- `useUIStore` no longer persists or exposes model preference state.
- Desktop settings import/export still handles `favoriteModels` and `recentModels`.
- No unrelated UI store fields were changed.

## Non-Goals

- Do not rename the external desktop settings fields `favoriteModels` or `recentModels`.
- Do not migrate unrelated `useUIStore` slices in this plan.
- Do not change model picker UX, sorting, filtering, or favorites/recents limits.
- Do not add new dependencies.
