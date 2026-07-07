# Preference Stores Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the next preference wave out of `useUIStore` — Notification Settings (11 fields) and Visual Scale/Spacing (5 fields) — into two focused persisted stores, following the migration-free pattern proven by `useModelPreferencesStore` and `useDiffPreferencesStore`.

**Architecture:** Two independent new persisted stores (`useNotificationSettingsStore`, `useVisualPreferencesStore`) created in the same wave. New persist keys, consumer migration in parallel, then deletion of the moved fields from `useUIStore` and from the desktop-sync snapshot in `appearanceAutoSave.ts`. No legacy-state migration, no `ui-store` version bump, no module-load copy-in. The store `version` stays at `1` and the partialize is the only persistence surface.

**Tech Stack:** React, TypeScript, Zustand `persist` + `createJSONStorage(() => getSafeStorage())`, Bun tests.

---

## Scope

### Create (4 files)

- `packages/ui/src/stores/useNotificationSettingsStore.ts`
- `packages/ui/src/stores/useNotificationSettingsStore.test.ts`
- `packages/ui/src/stores/useVisualPreferencesStore.ts`
- `packages/ui/src/stores/useVisualPreferencesStore.test.ts`

### Modify (11 files)

- `packages/ui/src/stores/useUIStore.ts` — remove 16 fields + 11 setters (notifications) + 5 fields + 5 setters (visual scale). Update partialize. Do **not** bump version. Do **not** add migration blocks.
- `packages/ui/src/stores/useUIStore.test.ts` — remove the `setFontSize` clamp test (now lives in `useVisualPreferencesStore.test.ts`).
- `packages/ui/src/lib/theme/appearanceAutoSave.ts` — split subscription so non-diff, non-notification, non-visual-scale fields stay subscribed to `useUIStore`; add two new subscriptions that call the same `schedule(diff)` closure with their slice of fields.
- `packages/ui/src/lib/config/persistence.ts` — `applyDesktopUiPreferences` reads the two new stores' `.getState()` for the relevant keys; `sanitizeWebSettings` is unchanged.
- `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx` — swap `useUIStore` selectors/setters for `useNotificationSettingsStore`.
- `packages/ui/src/components/session/SessionSidebar.tsx` — swap `notifyOnSubtasks` selector only (line 266 + line 1244 + line 1282 dependency array).
- `tests/react/helpers/sessionSidebarMocks.tsx` — the `useUIStore` mock at line 550 includes `notifyOnSubtasks: false`; replace with a `useNotificationSettingsStore` mock of the same shape.
- `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx` — swap selectors/setters for the 5 visual-scale fields it actually consumes (fontSize, terminalFontSize, padding, inputBarOffset). `cornerRadius` is not consumed here — leave alone.
- `packages/ui/src/hooks/useThemeEffects.ts` — swap `fontSize` (line 30) and `padding` (line 54) selectors. Keep `theme` in `useUIStore`.
- `packages/ui/src/components/views/TerminalView.tsx` — swap `terminalFontSize` selector (line 87).
- `packages/ui/src/components/chat/ChatInput.tsx` — swap `inputBarOffset` selector (line 158).
- `packages/ui/src/components/chat/state/useChatComposerState.ts` — swap `inputBarOffset` selector (line 33) + its dependency-array entries.

### Read-only contracts (do NOT modify)

- `packages/ui/src/lib/desktop/desktop.ts` — `DesktopSettings` type stays as-is.
- `packages/ui/src/lib/api/types.ts` — `SettingsPayload` stays as-is.
- `packages/web/server/src/domains/settings/**` — server validation/defaulting stays as-is.

---

## Slice A — Notification Settings

**Fields (11):** `nativeNotificationsEnabled`, `notificationMode`, `notifyOnSubtasks`, `notifyOnCompletion`, `notifyOnError`, `notifyOnQuestion`, `notificationTemplates`, `summarizeLastMessage`, `summaryThreshold`, `summaryLength`, `maxLastMessageLength`.

**Defaults (from `useUIStore.ts:665-684`):**
- `nativeNotificationsEnabled: false`
- `notificationMode: 'hidden-only'`
- `notifyOnSubtasks: true`
- `notifyOnCompletion: true`
- `notifyOnError: true`
- `notifyOnQuestion: true`
- `notificationTemplates`: shallow clone of `EMPTY_NOTIFICATION_TEMPLATES` — copy the constant value inline into the new store as `EMPTY_NOTIFICATION_TEMPLATES` (no export from `useUIStore`).
- `summarizeLastMessage: false`
- `summaryThreshold: 200`
- `summaryLength: 100`
- `maxLastMessageLength: 250`

**Setter semantics:** every setter is a direct `set({ field: value })`. No clamping in any current setter — clamping lives in `sanitizeWebSettings` and the server-side `settings/helpers.ts`. Preserve verbatim.

**Persist key:** `notification-settings-store`. **Version:** `1`. **Partialize:** all 11 fields.

---

## Slice B — Visual Scale/Spacing

**Fields (5):** `fontSize`, `terminalFontSize`, `padding`, `cornerRadius`, `inputBarOffset`.

**Defaults (from `useUIStore.ts:660-664`):**
- `fontSize: 100`
- `terminalFontSize: 13`
- `padding: 100`
- `cornerRadius: 18`
- `inputBarOffset: 0`

**Setter semantics:** verbatim from `useUIStore.ts:1181-1205`.
- `setFontSize`: clamp to `[50, 200]` integer via `Math.min(200, Math.max(50, Math.round(size)))`.
- `setTerminalFontSize`: clamp to `[9, 52]` via `Math.min(52, Math.max(9, Math.round(size)))`.
- `setPadding`: clamp to `[50, 200]` integer.
- `setCornerRadius`: direct set.
- `setInputBarOffset`: direct set.

**Persist key:** `visual-preferences-store`. **Version:** `1`.

**Partialize:** `fontSize`, `terminalFontSize`, `padding`, `cornerRadius` only. `inputBarOffset` is intentionally **excluded** because `useUIStore.partialize` never persisted it (current behavior — see `useUIStore.ts:1384-1444` for the existing partialize). This preserves current client-side behavior on the web (server/desktop path still syncs it through `appearanceAutoSave`).

**`theme` stays in `useUIStore`** — do not move it. `ThemeSystemContext` owns the real theme behavior; `useUIStore.theme` is a zombie field that only `useThemeEffects.ts:15` reads. Removing it is a separate decision and out of scope for this wave.

---

## Non-Goals

- No migration from a legacy `ui-store` envelope. The new stores start with default state. The store `version` is `1` (the initial release for each new key — there is no prior version to migrate from).
- No bump of `useUIStore` `version`. The remaining `useUIStore` partialize keys are simply removed; the persisted envelope shrinks naturally on next write.
- No deletion of stale keys from any persisted envelope. There is nothing to clean up — the new keys did not exist before, and the old keys are gone with their fields.
- No module-load copy-in helper.
- No changes to `DesktopSettings`, `SettingsPayload`, or server validation/defaulting.
- No extraction of a shared autosave scheduler. The `schedule(diff)` closure in `appearanceAutoSave.ts` is shared across three subscribers now (UI + diff + 2 new). Pattern still scales — extraction is a future concern.
- No changes to `ThemeSystemContext`, theme localStorage keys, or theme CSS ownership.
- Do not move/delete `theme` from `useUIStore`.
- Do not commit unless explicitly asked.
- Do not run `pgrep` / `pkill` / `killall` for process cleanup.
- Do not modify sibling `../opencode`.

---

## Tasks

### Task 1: RED tests for `useNotificationSettingsStore`

**Files:**
- Create: `packages/ui/src/stores/useNotificationSettingsStore.test.ts`

**Step 1: Write the failing test**

Mirror the structure of `packages/ui/src/stores/useDiffPreferencesStore.test.ts` — `bun:test` imports (`describe`, `it`, `expect`, `beforeEach`), a shared `DEFAULTS` constant, a `resetStore()` helper that calls `useNotificationSettingsStore.setState({...DEFAULTS}, false)`.

Tests to cover:
- Defaults match the 11 defaults above.
- Each of the 11 setters updates state correctly and preserves the other 10 fields.
- `setNotificationTemplates` accepts a full replacement object and does a direct set (no internal merge).
- `setState` partial form works for each field.
- No import or reference to `useUIStore` in the new file.

```ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { useNotificationSettingsStore } from './useNotificationSettingsStore';

const DEFAULTS = {
  nativeNotificationsEnabled: false,
  notificationMode: 'hidden-only' as const,
  notifyOnSubtasks: true,
  notifyOnCompletion: true,
  notifyOnError: true,
  notifyOnQuestion: true,
  notificationTemplates: {
    completion: { title: '', message: '' },
    error: { title: '', message: '' },
    question: { title: '', message: '' },
    subtask: { title: '', message: '' },
  },
  summarizeLastMessage: false,
  summaryThreshold: 200,
  summaryLength: 100,
  maxLastMessageLength: 250,
};

function resetStore(): void {
  useNotificationSettingsStore.setState({ ...DEFAULTS }, false);
}

describe('useNotificationSettingsStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // ... 11 setter groups, each with at minimum:
  //   - "updates field when called"
  //   - "can be set via setState partial form"
  //   - "preserves other fields when called"
});
```

**Step 2: Verify RED**

```bash
bun test packages/ui/src/stores/useNotificationSettingsStore.test.ts
```

Expected: FAIL — `Cannot find module './useNotificationSettingsStore'`.

---

### Task 2: GREEN implementation of `useNotificationSettingsStore`

**Files:**
- Create: `packages/ui/src/stores/useNotificationSettingsStore.ts`

**Step 1: Implement**

Mirror `packages/ui/src/stores/useDiffPreferencesStore.ts` exactly:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

const EMPTY_NOTIFICATION_TEMPLATES = {
  completion: { title: '', message: '' },
  error: { title: '', message: '' },
  question: { title: '', message: '' },
  subtask: { title: '', message: '' },
};

type NotificationTemplates = typeof EMPTY_NOTIFICATION_TEMPLATES;

type NotificationSettingsState = {
  nativeNotificationsEnabled: boolean;
  notificationMode: 'always' | 'hidden-only';
  notifyOnSubtasks: boolean;
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
  notifyOnQuestion: boolean;
  notificationTemplates: NotificationTemplates;
  summarizeLastMessage: boolean;
  summaryThreshold: number;
  summaryLength: number;
  maxLastMessageLength: number;
  setNativeNotificationsEnabled: (value: boolean) => void;
  setNotificationMode: (mode: 'always' | 'hidden-only') => void;
  setNotifyOnSubtasks: (value: boolean) => void;
  setNotifyOnCompletion: (value: boolean) => void;
  setNotifyOnError: (value: boolean) => void;
  setNotifyOnQuestion: (value: boolean) => void;
  setNotificationTemplates: (templates: NotificationTemplates) => void;
  setSummarizeLastMessage: (value: boolean) => void;
  setSummaryThreshold: (value: number) => void;
  setSummaryLength: (value: number) => void;
  setMaxLastMessageLength: (value: number) => void;
};

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      // defaults
      nativeNotificationsEnabled: false,
      notificationMode: 'hidden-only',
      notifyOnSubtasks: true,
      notifyOnCompletion: true,
      notifyOnError: true,
      notifyOnQuestion: true,
      notificationTemplates: {
        completion: { ...EMPTY_NOTIFICATION_TEMPLATES.completion },
        error: { ...EMPTY_NOTIFICATION_TEMPLATES.error },
        question: { ...EMPTY_NOTIFICATION_TEMPLATES.question },
        subtask: { ...EMPTY_NOTIFICATION_TEMPLATES.subtask },
      },
      summarizeLastMessage: false,
      summaryThreshold: 200,
      summaryLength: 100,
      maxLastMessageLength: 250,

      // setters
      setNativeNotificationsEnabled: (value) => { set({ nativeNotificationsEnabled: value }); },
      setNotificationMode: (mode) => { set({ notificationMode: mode }); },
      setNotifyOnSubtasks: (value) => { set({ notifyOnSubtasks: value }); },
      setNotifyOnCompletion: (value) => { set({ notifyOnCompletion: value }); },
      setNotifyOnError: (value) => { set({ notifyOnError: value }); },
      setNotifyOnQuestion: (value) => { set({ notifyOnQuestion: value }); },
      setNotificationTemplates: (templates) => { set({ notificationTemplates: templates }); },
      setSummarizeLastMessage: (value) => { set({ summarizeLastMessage: value }); },
      setSummaryThreshold: (value) => { set({ summaryThreshold: value }); },
      setSummaryLength: (value) => { set({ summaryLength: value }); },
      setMaxLastMessageLength: (value) => { set({ maxLastMessageLength: value }); },
    }),
    {
      name: 'notification-settings-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        nativeNotificationsEnabled: state.nativeNotificationsEnabled,
        notificationMode: state.notificationMode,
        notifyOnSubtasks: state.notifyOnSubtasks,
        notifyOnCompletion: state.notifyOnCompletion,
        notifyOnError: state.notifyOnError,
        notifyOnQuestion: state.notifyOnQuestion,
        notificationTemplates: state.notificationTemplates,
        summarizeLastMessage: state.summarizeLastMessage,
        summaryThreshold: state.summaryThreshold,
        summaryLength: state.summaryLength,
        maxLastMessageLength: state.maxLastMessageLength,
      }),
    },
  ),
);
```

**Step 2: Verify GREEN**

```bash
bun test packages/ui/src/stores/useNotificationSettingsStore.test.ts
bun test packages/ui/src/stores/useUIStore.test.ts
bun run --filter '@openchamber/ui' type-check
```

Expected: store tests pass; UI store tests still pass; type-check clean.

---

### Task 3: RED tests for `useVisualPreferencesStore`

**Files:**
- Create: `packages/ui/src/stores/useVisualPreferencesStore.test.ts`

**Step 1: Write the failing test**

Mirror `useDiffPreferencesStore.test.ts`. Defaults:

```ts
const DEFAULTS = {
  fontSize: 100,
  terminalFontSize: 13,
  padding: 100,
  cornerRadius: 18,
  inputBarOffset: 0,
};
```

Tests:
- Defaults match.
- `setFontSize(500)` clamps to `200`; `setFontSize(10)` clamps to `50`; `setFontSize(87.4)` rounds to `87`.
- `setTerminalFontSize(100)` clamps to `52`; `setTerminalFontSize(5)` clamps to `9`; `setTerminalFontSize(13.7)` rounds to `14`.
- `setPadding(500)` clamps to `200`; `setPadding(10)` clamps to `50`.
- `setCornerRadius(value)` sets directly (no clamp).
- `setInputBarOffset(value)` sets directly (no clamp).
- Each setter preserves the other 4 fields.
- `setState` partial form works for each field.

**Step 2: Verify RED**

```bash
bun test packages/ui/src/stores/useVisualPreferencesStore.test.ts
```

Expected: FAIL — module not found.

---

### Task 4: GREEN implementation of `useVisualPreferencesStore`

**Files:**
- Create: `packages/ui/src/stores/useVisualPreferencesStore.ts`

**Step 1: Implement**

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

type VisualPreferencesState = {
  fontSize: number;
  terminalFontSize: number;
  padding: number;
  cornerRadius: number;
  inputBarOffset: number;
  setFontSize: (size: number) => void;
  setTerminalFontSize: (size: number) => void;
  setPadding: (size: number) => void;
  setCornerRadius: (radius: number) => void;
  setInputBarOffset: (offset: number) => void;
};

export const useVisualPreferencesStore = create<VisualPreferencesState>()(
  persist(
    (set) => ({
      fontSize: 100,
      terminalFontSize: 13,
      padding: 100,
      cornerRadius: 18,
      inputBarOffset: 0,

      setFontSize: (size) => {
        const clampedSize = Math.min(200, Math.max(50, Math.round(size)));
        set({ fontSize: clampedSize });
      },
      setTerminalFontSize: (size) => {
        const clamped = Math.min(52, Math.max(9, Math.round(size)));
        set({ terminalFontSize: clamped });
      },
      setPadding: (size) => {
        const clampedSize = Math.min(200, Math.max(50, Math.round(size)));
        set({ padding: clampedSize });
      },
      setCornerRadius: (radius) => {
        set({ cornerRadius: radius });
      },
      setInputBarOffset: (offset) => {
        set({ inputBarOffset: offset });
      },
    }),
    {
      name: 'visual-preferences-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        fontSize: state.fontSize,
        terminalFontSize: state.terminalFontSize,
        padding: state.padding,
        cornerRadius: state.cornerRadius,
        // inputBarOffset is intentionally excluded — runtime-only field on the
        // web (server/desktop path still syncs it through appearanceAutoSave).
      }),
    },
  ),
);
```

**Step 2: Verify GREEN**

```bash
bun test packages/ui/src/stores/useVisualPreferencesStore.test.ts
bun test packages/ui/src/stores/useUIStore.test.ts
bun run --filter '@openchamber/ui' type-check
```

---

### Task 5: Migrate Notification Settings consumers

**Files:**
- Modify: `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx`
- Modify: `packages/ui/src/components/session/SessionSidebar.tsx`
- Modify: `tests/react/helpers/sessionSidebarMocks.tsx`

**Step 1: Targeted search**

```bash
rg "useUIStore.*(nativeNotificationsEnabled|notificationMode|notifyOnSubtasks|notifyOnCompletion|notifyOnError|notifyOnQuestion|notificationTemplates|summarizeLastMessage|summaryThreshold|summaryLength|maxLastMessageLength|setNativeNotificationsEnabled|setNotificationMode|setNotifyOnSubtasks|setNotifyOnCompletion|setNotifyOnError|setNotifyOnQuestion|setNotificationTemplates|setSummarizeLastMessage|setSummaryThreshold|setSummaryLength|setMaxLastMessageLength)" packages/ui/src --glob '*.{ts,tsx}' -l
```

Expected matches before this task: `NotificationSettings.tsx`, `SessionSidebar.tsx`, `appearanceAutoSave.ts` (read-only here, handled in Task 7).

**Step 2: Migrate `NotificationSettings.tsx`**

Swap the 22 selector/setter calls at lines 39-60 to read from `useNotificationSettingsStore` instead of `useUIStore`. Change the import line. Keep all non-notification `useUIStore` selectors that this component may use (search for `useUIStore` imports — there are several).

**Step 3: Migrate `SessionSidebar.tsx`**

Only `notifyOnSubtasks` is consumed here. Change lines 266, 1244, 1282:
- 266: `const notifyOnSubtasks = useNotificationSettingsStore((state) => state.notifyOnSubtasks);`
- 1244: prop pass-through is unchanged.
- 1282: add `notifyOnSubtasks` to the import (or destructure from the store via `useNotificationSettingsStore((s) => s.notifyOnSubtasks)` and include in the dependency array of any `useMemo`/`useEffect`).

**Step 4: Migrate `sessionSidebarMocks.tsx`**

At line 550, replace `notifyOnSubtasks: false` inside the `useUIStore` mock with the equivalent on a `useNotificationSettingsStore` mock. The mock must satisfy whatever `useNotificationSettingsStore` selectors are imported by the consuming test (`notifyOnSubtasks` at minimum).

**Step 5: Verify**

```bash
bun test packages/ui/src/stores/useNotificationSettingsStore.test.ts
bun test packages/ui/src/stores/useUIStore.test.ts
bun test --isolate tests/react 2>/dev/null || bun run test:react 2>/dev/null || bun test tests/react
bun run --filter '@openchamber/ui' type-check
```

The third command may differ depending on how the workspace exposes `tests/react`; use whichever form works locally. Expect the same pass count as the baseline.

---

### Task 6: Migrate Visual Scale/Spacing consumers

**Files:**
- Modify: `packages/ui/src/hooks/useThemeEffects.ts`
- Modify: `packages/ui/src/components/views/TerminalView.tsx`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`
- Modify: `packages/ui/src/components/chat/state/useChatComposerState.ts`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`

**Step 1: Targeted search**

```bash
rg "useUIStore.*(fontSize|terminalFontSize|padding|cornerRadius|inputBarOffset|setFontSize|setTerminalFontSize|setPadding|setCornerRadius|setInputBarOffset)" packages/ui/src --glob '*.{ts,tsx}' -l
```

Expected matches before this task: `appearanceAutoSave.ts`, `useUIStore.test.ts`, `TerminalView.tsx`, `ChatInput.tsx`, `useChatComposerState.ts`, `OpenChamberVisualSettings.tsx`, `useThemeEffects.ts`. After this task, only `appearanceAutoSave.ts` (Task 7) and `useUIStore.test.ts` (Task 8) should match.

**Step 2: Migrate `useThemeEffects.ts`**

Lines 30 + 54: change `useUIStore((s) => s.fontSize)` and `useUIStore((s) => s.padding)` to read from `useVisualPreferencesStore`. Keep the existing `useUIStore` import for `theme` (line 15).

**Step 3: Migrate `TerminalView.tsx`**

Line 87: `const terminalFontSize = useVisualPreferencesStore((state) => state.terminalFontSize);`

**Step 4: Migrate `ChatInput.tsx`**

Line 158: `const inputBarOffset = useVisualPreferencesStore((state) => state.inputBarOffset);`

**Step 5: Migrate `useChatComposerState.ts`**

Line 33: same pattern as ChatInput. Update any dependency-array entries that reference `inputBarOffset` (lines 50, 65).

**Step 6: Migrate `OpenChamberVisualSettings.tsx`**

Lines 247-254: change selectors/setters for the 4 fields this component consumes (`fontSize`, `setFontSize`, `terminalFontSize`, `setTerminalFontSize`, `padding`, `setPadding`, `inputBarOffset`, `setInputBarOffset`). **Do NOT add `cornerRadius` selectors/setters here** — this component does not currently consume them, and there is no UI control for `cornerRadius` anywhere in the codebase. The new store exposes the field; nothing reads it yet.

**Step 7: Verify**

```bash
bun test packages/ui/src/stores/useVisualPreferencesStore.test.ts
bun test packages/ui/src/stores/useUIStore.test.ts
bun run --filter '@openchamber/ui' type-check
```

---

### Task 7: Split `appearanceAutoSave.ts` subscriptions

**Files:**
- Modify: `packages/ui/src/lib/theme/appearanceAutoSave.ts`

**Step 1: Add new imports**

```ts
import { useNotificationSettingsStore } from '@/stores/useNotificationSettingsStore';
import { useVisualPreferencesStore } from '@/stores/useVisualPreferencesStore';
```

**Step 2: Replace the `AppearanceSlice` type**

Shrink it to the remaining `useUIStore`-owned fields. From the current `AppearanceSlice` (lines 8-34 plus its 11 notification fields + 5 visual-scale fields), keep only the fields that are still in `useUIStore` after Tasks 5 + 6 + 8:

```
showReasoningTraces, showDeletionDialog, inputSpellcheckEnabled,
showToolFileIcons, showExpandedBashTools, showExpandedEditTools,
timeFormatPreference, weekStartPreference, chatRenderMode,
activityRenderMode, mermaidRenderingMode, userMessageRenderingMode,
stickyUserHeader, reportUsage, autoDeleteEnabled, autoDeleteAfterDays,
sessionRetentionAction
```

(Adjust the exact list to whatever remains after Task 8 lands; verify with `rg "partialize" packages/ui/src/stores/useUIStore.ts` once Task 8 is done.)

**Step 3: Add two new subscriptions after the existing `useUIStore.subscribe(...)` block**

```ts
useNotificationSettingsStore.subscribe((state) => {
  const current: AppearanceSlice = {
    nativeNotificationsEnabled: state.nativeNotificationsEnabled,
    notificationMode: state.notificationMode,
    notifyOnSubtasks: state.notifyOnSubtasks,
    notifyOnCompletion: state.notifyOnCompletion,
    notifyOnError: state.notifyOnError,
    notifyOnQuestion: state.notifyOnQuestion,
    notificationTemplates: state.notificationTemplates,
    summarizeLastMessage: state.summarizeLastMessage,
    summaryThreshold: state.summaryThreshold,
    summaryLength: state.summaryLength,
    maxLastMessageLength: state.maxLastMessageLength,
  };
  const diff: Partial<DesktopSettings> = {};
  // ... reuse the existing diff-detection block for these 11 fields,
  //     keeping the JSON.stringify comparison for notificationTemplates ...
  schedule(diff);
});

useVisualPreferencesStore.subscribe((state) => {
  const current: AppearanceSlice = {
    fontSize: state.fontSize,
    terminalFontSize: state.terminalFontSize,
    padding: state.padding,
    cornerRadius: state.cornerRadius,
    inputBarOffset: state.inputBarOffset,
  };
  const diff: Partial<DesktopSettings> = {};
  // ... reuse the existing diff-detection block for these 5 fields ...
  schedule(diff);
});
```

The cleanest mechanical approach is to keep the existing diff-detection block intact but split it into three smaller diff-detection blocks (one per subscriber), each closing over its own `previous` snapshot. The existing `previousAppearance` becomes `previousUI`, and you add `previousNotification` and `previousVisual`. All three call the same shared `schedule(diff)` closure that already exists in this file.

**Step 4: Update the initial snapshot block**

The `if (initialized) return;` snapshot at the top of the subscribe function currently captures the full `AppearanceSlice` in one go. Replace with three separate snapshot captures — one per subscriber — each initialized on first subscribe call only.

**Step 5: Verify**

```bash
bun run --filter '@openchamber/ui' type-check
bun test packages/ui/src/stores
```

---

### Task 8: Update `persistence.ts` `applyDesktopUiPreferences`

**Files:**
- Modify: `packages/ui/src/lib/config/persistence.ts`

**Step 1: Add new imports**

```ts
import { useNotificationSettingsStore } from '@/stores/useNotificationSettingsStore';
import { useVisualPreferencesStore } from '@/stores/useVisualPreferencesStore';
```

**Step 2: Refactor `applyDesktopUiPreferences`**

Currently the function grabs `const store = useUIStore.getState();` at the top and reads every notification/visual field from `store`. Replace those reads with reads from the two new stores' `.getState()`. The cleanest pattern: grab `const notificationStore = useNotificationSettingsStore.getState();` and `const visualStore = useVisualPreferencesStore.getState();` after the existing `store` line, and change the 16 `store.setXxx(...)` calls accordingly.

Concretely:
- Lines 297-330 (notifications block): `store.setNativeNotificationsEnabled(...)` → `notificationStore.setNativeNotificationsEnabled(...)`. Same for the other 10 notification setters.
- Lines 392-405 (visual block): `store.setFontSize(...)` → `visualStore.setFontSize(...)`. Same for the other 4 visual setters.

**Step 3: Leave `sanitizeWebSettings` unchanged**

It operates on raw `DesktopSettings` payloads, not on the store. The contract is unchanged.

**Step 4: Verify**

```bash
bun run --filter '@openchamber/ui' type-check
bun test packages/ui/src/stores
```

---

### Task 9: Remove notification + visual fields from `useUIStore.ts`

**Files:**
- Modify: `packages/ui/src/stores/useUIStore.ts`
- Modify: `packages/ui/src/stores/useUIStore.test.ts`

**Step 1: Remove from `useUIStore.ts`**

Delete in this order:
- Lines 500-502, 505-507, 510-517 (notification type fields), 518-521 (summary fields).
- Lines 591-602 (notification setter signatures).
- Lines 665-684 (notification defaults).
- Lines 1211-1234 (notification setter implementations).
- Lines 1412-1423 (notification partialize keys).
- Lines 494-498 (visual type fields — keep `theme` at line 461, but remove fontSize/terminalFontSize/padding/cornerRadius/inputBarOffset).
- Lines 585-589 (visual setter signatures).
- Lines 660-664 (visual defaults — keep `theme` default at 629).
- Lines 1181-1205 (visual setter implementations).
- Lines 1408-1411 (visual partialize keys).
- The `EMPTY_NOTIFICATION_TEMPLATES` constant (lines 66-71) if it is no longer referenced. The `LEGACY_DEFAULT_NOTIFICATION_TEMPLATES` constant (lines 59-64) stays — it is used by the v0→v1 migration in `useUIStore.ts:1316-1325` which is part of the original codebase, not part of this wave. Verify by running type-check: if removing breaks the v0→v1 migration block, leave it alone.
- The `isLegacyDefaultTemplates` helper (lines 81-92) likewise: leave it alone if removing it breaks the v0→v1 migration.

**Step 2: Do NOT bump `version`**

Leave `version: 11` at line 1309 untouched. The migration function (lines 1310-1383) stays untouched — the v0→v1 legacy-templates reset still serves its original purpose.

**Step 3: Remove the `setFontSize` test from `useUIStore.test.ts`**

Lines 21-26: delete the `setFontSize clamps to [50, 200]` test. The equivalent test now lives in `useVisualPreferencesStore.test.ts`. Keep the `toggleSidebar` test.

**Step 4: Verify**

```bash
bun test packages/ui/src/stores
bun run --filter '@openchamber/ui' type-check
bun run --filter '@openchamber/ui' lint
```

Expected: all store tests pass, type-check clean, lint clean (or only pre-existing errors unrelated to this slice).

**Step 5: Final targeted search**

```bash
rg "useUIStore.*(nativeNotificationsEnabled|notificationMode|notifyOnSubtasks|notifyOnCompletion|notifyOnError|notifyOnQuestion|notificationTemplates|summarizeLastMessage|summaryThreshold|summaryLength|maxLastMessageLength|setNativeNotificationsEnabled|setNotificationMode|setNotifyOnSubtasks|setNotifyOnCompletion|setNotifyOnError|setNotifyOnQuestion|setNotificationTemplates|setSummarizeLastMessage|setSummaryThreshold|setSummaryLength|setMaxLastMessageLength|fontSize|terminalFontSize|padding|cornerRadius|inputBarOffset|setFontSize|setTerminalFontSize|setPadding|setCornerRadius|setInputBarOffset)" packages/ui/src --glob '*.{ts,tsx}' -l
```

Expected: empty output (no consumers outside `useUIStore.ts` itself, and `useUIStore.ts` only has `theme` left from this wave).

---

### Task 10: Final verification + handoff

**Step 1: Inspect diff scope**

```bash
git status --short packages/ui/src
git diff --stat packages/ui/src
```

Expected files: the 11 modified files from the Scope section + the 4 new files.

**Step 2: Run the verification matrix**

```bash
bun run --filter '@openchamber/ui' type-check
bun run --filter '@openchamber/ui' lint
bun run --cwd packages/ui test:stores
bun test packages/ui/src/stores/useNotificationSettingsStore.test.ts
bun test packages/ui/src/stores/useVisualPreferencesStore.test.ts
bun test packages/ui/src/stores/useUIStore.test.ts
bun test packages/ui/src/stores/useDiffPreferencesStore.test.ts
bun test packages/ui/src/stores/useModelPreferencesStore.test.ts
```

All must pass.

**Step 3: Report handoff**

- New stores: `useNotificationSettingsStore` (key `notification-settings-store`), `useVisualPreferencesStore` (key `visual-preferences-store`).
- Fields removed from `useUIStore`: 11 notification + 5 visual-scale = 16 fields.
- Fields kept in `useUIStore`: `theme` (zombie — still zombie, unchanged), and all other unrelated state.
- `inputBarOffset`: not partialized in the new store (matches prior behavior).
- `cornerRadius`: not consumed by any component — exposed by new store for transport only.
- Migration ceremony: zero — no legacy envelope copy, no version bump, no key deletion. Each new store starts at `version: 1`.

---

## Acceptance criteria

- [ ] `useNotificationSettingsStore` exists, persists 11 fields under `notification-settings-store` v1.
- [ ] `useVisualPreferencesStore` exists, persists 4 fields under `visual-preferences-store` v1, excludes `inputBarOffset`.
- [ ] `useUIStore` no longer references any of the 16 removed fields or their setters.
- [ ] `useUIStore.partialize` no longer references any of the 16 removed fields.
- [ ] `useUIStore.test.ts` no longer references `setFontSize`.
- [ ] All consumers (NotificationSettings, SessionSidebar, sessionSidebarMocks, OpenChamberVisualSettings, useThemeEffects, TerminalView, ChatInput, useChatComposerState) read from the appropriate new store.
- [ ] `appearanceAutoSave.ts` has three subscriptions: UI (remaining fields), notification (11), visual (5). All share the existing `schedule(diff)` closure.
- [ ] `persistence.ts` `applyDesktopUiPreferences` reads from the two new stores via `.getState()`.
- [ ] `DesktopSettings`, `SettingsPayload`, server `settings/helpers.ts` are unchanged.
- [ ] `theme` stays in `useUIStore` (zombie, untouched).
- [ ] Type-check, lint, all store tests pass.
- [ ] No name-based process commands run.
- [ ] No commits.