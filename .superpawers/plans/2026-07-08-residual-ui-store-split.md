# Residual UI Store Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the last coherent field groups out of `useUIStore` into three focused stores (`useSessionRetentionStore`, `useChatRenderingStore`, `useContextPanelStore`), relocate orphaned notification constants, and shrink `useUIStore` to a ~15-field residual.

**Architecture:** Four sequential tracks (notification cleanup → session retention → chat rendering → context panel), each following the proven migration-free pattern: no version bumps, no migration blocks, no copy-in helpers. Pure helper functions (~350 lines) extracted to a sibling file for the context panel store. Desktop settings sync (`appearanceAutoSave.ts` + `persistence.ts`) updated per-store to route fields to the correct new store.

**Tech Stack:** React, TypeScript, Zustand `persist` + `createJSONStorage(() => getSafeStorage())`, Bun tests.

---

## File Responsibilities

### Create (7 files)

| File | Responsibility |
|------|----------------|
| `packages/ui/src/stores/useSessionRetentionStore.ts` | 4 persisted fields + 4 setters (auto-delete policy) |
| `packages/ui/src/stores/useSessionRetentionStore.test.ts` | Unit tests for retention setters |
| `packages/ui/src/stores/useChatRenderingStore.ts` | 10 persisted fields + 10 setters (chat message rendering prefs) |
| `packages/ui/src/stores/useChatRenderingStore.test.ts` | Unit tests for rendering setters |
| `packages/ui/src/stores/contextPanelHelpers.ts` | ~350 lines of pure functions + 5 types extracted from useUIStore |
| `packages/ui/src/stores/useContextPanelStore.ts` | 4 state fields + 17 methods + persist config |
| `packages/ui/src/stores/useContextPanelStore.test.ts` | Unit tests for context panel methods |

### Modify

| File | Changes |
|------|---------|
| `packages/ui/src/stores/useUIStore.ts` | Remove fields/setters/types/helpers/constants per track; update `navigateToDiff` to delegate to `useContextPanelStore` |
| `packages/ui/src/stores/useNotificationSettingsStore.ts` | Accept 4 relocated constants (Track 1) |
| `packages/ui/src/lib/theme/appearanceAutoSave.ts` | Per-track: move chat-rendering and session-retention fields out of useUIStore subscription; add new subscriptions |
| `packages/ui/src/lib/config/persistence.ts` | Per-track: route chat-rendering and session-retention fields to new stores in `applyDesktopUiPreferences` |
| `packages/ui/src/hooks/useRouter.ts` | Track 4: migrate `pendingDiffFile` reads + subscription to `useContextPanelStore` |
| 17 consumer files (Track 4) | Migrate context-panel selectors from useUIStore to useContextPanelStore |
| ~12 consumer files (Track 3) | Migrate chat-rendering selectors |
| ~6 consumer files (Track 2) | Migrate session-retention selectors |
| `tests/react/helpers/stores.ts` | Add new store resets to `resetTopLevelStores` |
| `tests/react/helpers/sessionSidebarMocks.tsx` | Add new store mocks; remove moved fields from useUIStore mock |

### Read-only (do NOT modify)

- `packages/ui/src/lib/desktop/desktop.ts` — `DesktopSettings` type stays as-is
- `packages/ui/src/lib/api/types.ts` — `SettingsPayload` stays as-is
- `packages/web/server/src/domains/settings/**` — server validation stays as-is

---

## Global Constraints

- Do not touch pre-existing dirty files in the worktree (listed in `.superpawers/specs/2026-06-28-cleanup-handoff-design.md` line 24).
- Do not use `pgrep`, `pkill`, `killall`, or process-name matching.
- Do not add dependencies.
- Do not modify the sibling `../opencode` repo.
- Do not commit unless the user explicitly asks.
- Migration-free pattern: no `ui-store` version bumps, no migration blocks, no copy-in helpers, no module-load migration calls.
- Verbatim setter copies — no behavior changes within a track.
- TDD: every new store gets tests before or alongside implementation.

---

## Track 1: Notification Constant Cleanup

**Files:**
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove lines 61–94 (4 constant declarations) + remove dead migration block at lines ~988–998 that references `notificationTemplates` (no longer in useUIStore)
- Modify: `packages/ui/src/stores/useNotificationSettingsStore.ts` — add the 4 constants near the top of the file

**Context:** The 4 constants (`LEGACY_DEFAULT_NOTIFICATION_TEMPLATES`, `EMPTY_NOTIFICATION_TEMPLATES`, `isSameTemplateValue`, `isLegacyDefaultTemplates`) are currently at useUIStore.ts lines 61–94. They are used ONLY by a dead migration block at lines ~988–998 that reads `state.notificationTemplates` — a field that was moved to `useNotificationSettingsStore` and no longer exists in useUIStore. Only `EMPTY_NOTIFICATION_TEMPLATES` is genuinely useful (replaces inline defaults in the notification store). The other 3 (`LEGACY_DEFAULT_NOTIFICATION_TEMPLATES`, `isSameTemplateValue`, `isLegacyDefaultTemplates`) are dead code — relocate them to the notification store for proximity, or delete them entirely if the notification store has no use for them.

- [ ] **Step 1: Move constants to useNotificationSettingsStore.ts**

Move the 4 declarations verbatim from useUIStore.ts lines 61–94 to useNotificationSettingsStore.ts, placing them after the imports and before the store type definition. Replace the inline default at lines 48–53 with a reference to `EMPTY_NOTIFICATION_TEMPLATES`:

```ts
// useNotificationSettingsStore.ts
// ... existing imports ...

// --- Notification template constants (relocated from useUIStore) ---
const LEGACY_DEFAULT_NOTIFICATION_TEMPLATES = {
  completion: { title: '{agent_name} is ready', message: '{last_message}' },
  error: { title: 'Tool error', message: '{last_message}' },
  question: { title: '{agent_name} needs input', message: '{last_message}' },
  subtask: { title: 'Subtask complete', message: '{last_message}' },
} as const;

const EMPTY_NOTIFICATION_TEMPLATES = {
  completion: { title: '', message: '' },
  error: { title: '', message: '' },
  question: { title: '', message: '' },
  subtask: { title: '', message: '' },
} as const;

// ... isSameTemplateValue, isLegacyDefaultTemplates — copy verbatim ...

// ... store type ...
// In the initial state, replace inline defaults with:
//   notificationTemplates: { ...EMPTY_NOTIFICATION_TEMPLATES },
```

- [ ] **Step 2: Remove constants + dead migration block from useUIStore.ts**

Delete lines 61–94 (the 4 declarations). Also find and delete the dead migration block that references `notificationTemplates` (around lines 988–998 in the `migrate` function). Search for `isLegacyDefaultTemplates` and `notificationTemplates` in useUIStore.ts — all references should be gone.

- [ ] **Step 3: Verify**

Run: `rg "EMPTY_NOTIFICATION_TEMPLATES|LEGACY_DEFAULT_NOTIFICATION_TEMPLATES|isSameTemplateValue|isLegacyDefaultTemplates" packages/ui/src/stores/useUIStore.ts`

Expected: 0 matches.

Run: `bun run type-check`

Expected: PASS.

Run: `bun run test:stores`

Expected: PASS (no behavior change).

---

## Track 2: `useSessionRetentionStore`

**Files:**
- Create: `packages/ui/src/stores/useSessionRetentionStore.ts`
- Create: `packages/ui/src/stores/useSessionRetentionStore.test.ts`
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 4 fields, 4 setters, 1 type, 4 partialize keys
- Modify: `packages/ui/src/lib/theme/appearanceAutoSave.ts` — move 3 fields out of useUIStore subscription
- Modify: `packages/ui/src/lib/config/persistence.ts` — route 4 fields to new store
- Modify: ~6 consumer files

**Anchors in useUIStore.ts:**
- Type `SessionRetentionAction` at line 17
- Interface fields at lines 475–478
- Initial state at lines 567–570
- Setter implementations at lines 886–901
- Partialize entries at lines 1066–1069

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/stores/useSessionRetentionStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { useSessionRetentionStore } from './useSessionRetentionStore';

const resetStore = () => {
  useSessionRetentionStore.setState({
    autoDeleteEnabled: false,
    autoDeleteAfterDays: 30,
    sessionRetentionAction: 'archive',
    autoDeleteLastRunAt: null,
  }, false);
};

describe('useSessionRetentionStore', () => {
  beforeEach(resetStore);

  it('enables auto-delete', () => {
    useSessionRetentionStore.getState().setAutoDeleteEnabled(true);
    expect(useSessionRetentionStore.getState().autoDeleteEnabled).toBe(true);
  });

  it('clamps autoDeleteAfterDays to [1, 365]', () => {
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(0);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(1);
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(500);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(365);
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(60);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(60);
  });

  it('sets session retention action', () => {
    useSessionRetentionStore.getState().setSessionRetentionAction('delete');
    expect(useSessionRetentionStore.getState().sessionRetentionAction).toBe('delete');
  });

  it('sets autoDeleteLastRunAt', () => {
    const now = Date.now();
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(now);
    expect(useSessionRetentionStore.getState().autoDeleteLastRunAt).toBe(now);
  });

  it('clears autoDeleteLastRunAt with null', () => {
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(Date.now());
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(null);
    expect(useSessionRetentionStore.getState().autoDeleteLastRunAt).toBeNull();
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useSessionRetentionStore.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the store**

Create `packages/ui/src/stores/useSessionRetentionStore.ts`:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type SessionRetentionAction = 'archive' | 'delete';

type SessionRetentionState = {
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays: number;
  sessionRetentionAction: SessionRetentionAction;
  autoDeleteLastRunAt: number | null;
  setAutoDeleteEnabled: (value: boolean) => void;
  setAutoDeleteAfterDays: (days: number) => void;
  setSessionRetentionAction: (value: SessionRetentionAction) => void;
  setAutoDeleteLastRunAt: (timestamp: number | null) => void;
};

export const useSessionRetentionStore = create<SessionRetentionState>()(
  persist(
    (set) => ({
      autoDeleteEnabled: false,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: 'archive',
      autoDeleteLastRunAt: null,
      setAutoDeleteEnabled: (value) => {
        set({ autoDeleteEnabled: value });
      },
      setAutoDeleteAfterDays: (days) => {
        const clampedDays = Math.max(1, Math.min(365, days));
        set({ autoDeleteAfterDays: clampedDays });
      },
      setSessionRetentionAction: (value) => {
        set({ sessionRetentionAction: value });
      },
      setAutoDeleteLastRunAt: (timestamp) => {
        set({ autoDeleteLastRunAt: timestamp });
      },
    }),
    {
      name: 'session-retention-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        autoDeleteEnabled: state.autoDeleteEnabled,
        autoDeleteAfterDays: state.autoDeleteAfterDays,
        sessionRetentionAction: state.sessionRetentionAction,
        autoDeleteLastRunAt: state.autoDeleteLastRunAt,
      }),
    },
  ),
);
```

- [ ] **Step 4: Verify GREEN**

Run: `bun test packages/ui/src/stores/useSessionRetentionStore.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Migrate consumers**

Find all consumers:
```bash
rg -l "autoDeleteEnabled|autoDeleteAfterDays|sessionRetentionAction|autoDeleteLastRunAt|setAutoDeleteEnabled|setAutoDeleteAfterDays|setSessionRetentionAction|setAutoDeleteLastRunAt" packages/ui/src --glob '!**/useUIStore.ts' --glob '!**/useSessionRetentionStore*'
```

Expected consumer files (~6):
- `packages/ui/src/hooks/useSessionAutoCleanup.ts`
- `packages/ui/src/components/sections/openchamber/SessionRetentionSettings.tsx`
- `packages/ui/src/lib/config/persistence.ts`
- `packages/ui/src/lib/theme/appearanceAutoSave.ts`
- `packages/ui/src/lib/desktop/desktop.ts` (type-only — read-only, no change needed)
- `packages/ui/src/lib/api/types.ts` (type-only — read-only, no change needed)

For each consumer:
- Replace `useUIStore((s) => s.autoDeleteEnabled)` → `useSessionRetentionStore((s) => s.autoDeleteEnabled)` (and same for the other 3 fields)
- Replace `useUIStore.getState().setAutoDeleteEnabled(...)` → `useSessionRetentionStore.getState().setAutoDeleteEnabled(...)`
- Add `import { useSessionRetentionStore } from '@/stores/useSessionRetentionStore'`
- Keep unrelated `useUIStore` selectors intact

- [ ] **Step 6: Update appearanceAutoSave.ts**

In the `useUIStore.subscribe` callback (lines 145–225), remove the 3 session-retention fields from the snapshot and comparison:
- Remove `autoDeleteEnabled` snapshot (line 149) + comparison (lines 174–175)
- Remove `autoDeleteAfterDays` snapshot (line 150) + comparison (lines 177–178)
- Remove `sessionRetentionAction` snapshot (line 151) + comparison (lines 180–181)

Add a new `useSessionRetentionStore.subscribe` block mirroring the existing `useDiffPreferencesStore.subscribe` pattern (lines 319–343):
```ts
// Snapshot initial values
let prevAutoDeleteEnabled = useSessionRetentionStore.getState().autoDeleteEnabled;
let prevAutoDeleteAfterDays = useSessionRetentionStore.getState().autoDeleteAfterDays;
let prevSessionRetentionAction = useSessionRetentionStore.getState().sessionRetentionAction;

useSessionRetentionStore.subscribe((state) => {
  const diff: Partial<DesktopSettings> = {};
  if (state.autoDeleteEnabled !== prevAutoDeleteEnabled) {
    diff.autoDeleteEnabled = state.autoDeleteEnabled;
    prevAutoDeleteEnabled = state.autoDeleteEnabled;
  }
  if (state.autoDeleteAfterDays !== prevAutoDeleteAfterDays) {
    diff.autoDeleteAfterDays = state.autoDeleteAfterDays;
    prevAutoDeleteAfterDays = state.autoDeleteAfterDays;
  }
  if (state.sessionRetentionAction !== prevSessionRetentionAction) {
    diff.sessionRetentionAction = state.sessionRetentionAction;
    prevSessionRetentionAction = state.sessionRetentionAction;
  }
  if (Object.keys(diff).length > 0) schedule(diff);
});
```

Note: `autoDeleteLastRunAt` is runtime state (timestamp of last cleanup run) and is NOT synced to desktop settings. Do NOT include it in the subscription.

- [ ] **Step 7: Update persistence.ts**

In `applyDesktopUiPreferences`, the **3** session-retention fields that are routed through desktop settings are currently handled via `store.setAutoDeleteEnabled(...)` etc. (lines 279–292). Note: `autoDeleteLastRunAt` is runtime-only and NOT in desktop settings — it has no handler in `applyDesktopUiPreferences`. Change the 3 routed fields to read from `useSessionRetentionStore.getState()`:

```ts
// Before:
// const store = useUIStore.getState();  (line 270)
// if (settings.autoDeleteEnabled !== undefined) { store.setAutoDeleteEnabled(...); }

// After:
const retentionStore = useSessionRetentionStore.getState();
if (typeof settings.autoDeleteEnabled === 'boolean' && settings.autoDeleteEnabled !== retentionStore.autoDeleteEnabled) {
  retentionStore.setAutoDeleteEnabled(settings.autoDeleteEnabled);
}
// Same pattern for the other 3 fields, using retentionStore.*
```

Add `import { useSessionRetentionStore } from '@/stores/useSessionRetentionStore'` at the top.

- [ ] **Step 8: Remove legacy surface from useUIStore.ts**

Delete from useUIStore.ts:
- `SessionRetentionAction` type (line 17) — re-export from useUIStore for backward compat: `export type { SessionRetentionAction } from './useSessionRetentionStore'`
- 4 interface field declarations (lines 475–478)
- 4 setter signatures (lines 523–526)
- 4 initial state values (lines 567–570)
- 4 setter implementations (lines 886–901)
- 4 partialize entries (lines 1066–1069)

- [ ] **Step 9: Verify**

```bash
rg "autoDeleteEnabled|autoDeleteAfterDays|sessionRetentionAction|autoDeleteLastRunAt" packages/ui/src/stores/useUIStore.ts
```
Expected: 0 matches.

```bash
bun run test:stores && bun run test:react && bun run type-check
```
Expected: all pass.

---

## Track 3: `useChatRenderingStore`

**Files:**
- Create: `packages/ui/src/stores/useChatRenderingStore.ts`
- Create: `packages/ui/src/stores/useChatRenderingStore.test.ts`
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 10 fields, 10 setters, 4 types, 10 partialize keys
- Modify: `packages/ui/src/lib/theme/appearanceAutoSave.ts` — move 10 fields out of useUIStore subscription
- Modify: `packages/ui/src/lib/config/persistence.ts` — route 10 fields to new store
- Modify: ~12 consumer files

**Anchors in useUIStore.ts:**
- Types: `MermaidRenderingMode` (line 13), `UserMessageRenderingMode` (line 14), `ChatRenderMode` (line 15), `ActivityRenderMode` (line 16)
- Interface fields: lines 471–474, 483–485, 488–490
- Initial state: lines 563–566, 575–577, 580–582
- Setter implementations: lines 870–884, 913–921, 930–938
- Partialize entries: lines 1062–1065, 1073–1075, 1078–1080

- [ ] **Step 1: Write failing tests**

Create `packages/ui/src/stores/useChatRenderingStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { useChatRenderingStore } from './useChatRenderingStore';

const resetStore = () => {
  useChatRenderingStore.setState({
    showReasoningTraces: true,
    chatRenderMode: 'live',
    activityRenderMode: 'summary',
    showDeletionDialog: true,
    showToolFileIcons: true,
    showExpandedBashTools: false,
    showExpandedEditTools: false,
    mermaidRenderingMode: 'svg',
    userMessageRenderingMode: 'markdown',
    stickyUserHeader: true,
  }, false);
};

describe('useChatRenderingStore', () => {
  beforeEach(resetStore);

  it('sets showReasoningTraces', () => {
    useChatRenderingStore.getState().setShowReasoningTraces(false);
    expect(useChatRenderingStore.getState().showReasoningTraces).toBe(false);
  });

  it('sets chatRenderMode', () => {
    useChatRenderingStore.getState().setChatRenderMode('sorted');
    expect(useChatRenderingStore.getState().chatRenderMode).toBe('sorted');
  });

  it('sets activityRenderMode', () => {
    useChatRenderingStore.getState().setActivityRenderMode('collapsed');
    expect(useChatRenderingStore.getState().activityRenderMode).toBe('collapsed');
  });

  it('sets showDeletionDialog', () => {
    useChatRenderingStore.getState().setShowDeletionDialog(false);
    expect(useChatRenderingStore.getState().showDeletionDialog).toBe(false);
  });

  it('sets showToolFileIcons', () => {
    useChatRenderingStore.getState().setShowToolFileIcons(false);
    expect(useChatRenderingStore.getState().showToolFileIcons).toBe(false);
  });

  it('sets showExpandedBashTools', () => {
    useChatRenderingStore.getState().setShowExpandedBashTools(true);
    expect(useChatRenderingStore.getState().showExpandedBashTools).toBe(true);
  });

  it('sets showExpandedEditTools', () => {
    useChatRenderingStore.getState().setShowExpandedEditTools(true);
    expect(useChatRenderingStore.getState().showExpandedEditTools).toBe(true);
  });

  it('sets mermaidRenderingMode', () => {
    useChatRenderingStore.getState().setMermaidRenderingMode('ascii');
    expect(useChatRenderingStore.getState().mermaidRenderingMode).toBe('ascii');
  });

  it('sets userMessageRenderingMode', () => {
    useChatRenderingStore.getState().setUserMessageRenderingMode('plain');
    expect(useChatRenderingStore.getState().userMessageRenderingMode).toBe('plain');
  });

  it('sets stickyUserHeader', () => {
    useChatRenderingStore.getState().setStickyUserHeader(false);
    expect(useChatRenderingStore.getState().stickyUserHeader).toBe(false);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test packages/ui/src/stores/useChatRenderingStore.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the store**

Create `packages/ui/src/stores/useChatRenderingStore.ts`:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type ChatRenderMode = 'sorted' | 'live';
export type ActivityRenderMode = 'collapsed' | 'summary';
export type MermaidRenderingMode = 'svg' | 'ascii';
export type UserMessageRenderingMode = 'markdown' | 'plain';

type ChatRenderingState = {
  chatRenderMode: ChatRenderMode;
  activityRenderMode: ActivityRenderMode;
  showReasoningTraces: boolean;
  showExpandedBashTools: boolean;
  showExpandedEditTools: boolean;
  userMessageRenderingMode: UserMessageRenderingMode;
  mermaidRenderingMode: MermaidRenderingMode;
  stickyUserHeader: boolean;
  showDeletionDialog: boolean;
  showToolFileIcons: boolean;
  setShowReasoningTraces: (value: boolean) => void;
  setChatRenderMode: (value: ChatRenderMode) => void;
  setActivityRenderMode: (value: ActivityRenderMode) => void;
  setShowDeletionDialog: (value: boolean) => void;
  setShowToolFileIcons: (value: boolean) => void;
  setShowExpandedBashTools: (value: boolean) => void;
  setShowExpandedEditTools: (value: boolean) => void;
  setMermaidRenderingMode: (value: MermaidRenderingMode) => void;
  setUserMessageRenderingMode: (value: UserMessageRenderingMode) => void;
  setStickyUserHeader: (value: boolean) => void;
};

export const useChatRenderingStore = create<ChatRenderingState>()(
  persist(
    (set) => ({
      showReasoningTraces: true,
      chatRenderMode: 'live',
      activityRenderMode: 'summary',
      showDeletionDialog: true,
      showToolFileIcons: true,
      showExpandedBashTools: false,
      showExpandedEditTools: false,
      mermaidRenderingMode: 'svg',
      userMessageRenderingMode: 'markdown',
      stickyUserHeader: true,
      setShowReasoningTraces: (value) => { set({ showReasoningTraces: value }); },
      setChatRenderMode: (value) => { set({ chatRenderMode: value }); },
      setActivityRenderMode: (value) => { set({ activityRenderMode: value }); },
      setShowDeletionDialog: (value) => { set({ showDeletionDialog: value }); },
      setShowToolFileIcons: (value) => { set({ showToolFileIcons: value }); },
      setShowExpandedBashTools: (value) => { set({ showExpandedBashTools: value }); },
      setShowExpandedEditTools: (value) => { set({ showExpandedEditTools: value }); },
      setMermaidRenderingMode: (value) => { set({ mermaidRenderingMode: value }); },
      setUserMessageRenderingMode: (value) => { set({ userMessageRenderingMode: value }); },
      setStickyUserHeader: (value) => { set({ stickyUserHeader: value }); },
    }),
    {
      name: 'chat-rendering-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        showReasoningTraces: state.showReasoningTraces,
        chatRenderMode: state.chatRenderMode,
        activityRenderMode: state.activityRenderMode,
        showDeletionDialog: state.showDeletionDialog,
        showToolFileIcons: state.showToolFileIcons,
        showExpandedBashTools: state.showExpandedBashTools,
        showExpandedEditTools: state.showExpandedEditTools,
        mermaidRenderingMode: state.mermaidRenderingMode,
        userMessageRenderingMode: state.userMessageRenderingMode,
        stickyUserHeader: state.stickyUserHeader,
      }),
    },
  ),
);
```

- [ ] **Step 4: Verify GREEN**

Run: `bun test packages/ui/src/stores/useChatRenderingStore.test.ts`
Expected: 10 pass.

- [ ] **Step 5: Migrate consumers**

Find all consumers:
```bash
rg -l "showReasoningTraces|chatRenderMode|activityRenderMode|showDeletionDialog|showToolFileIcons|showExpandedBashTools|showExpandedEditTools|mermaidRenderingMode|userMessageRenderingMode|stickyUserHeader" packages/ui/src --glob '!**/useUIStore.ts' --glob '!**/useChatRenderingStore*' --glob '!**/appearanceAutoSave.ts' --glob '!**/persistence.ts'
```

Expected consumer files (~30+ — this is a widely-consumed field group. The `rg` command above is authoritative; the list below is non-exhaustive):
- `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- `packages/ui/src/components/chat/ChatMessage.tsx`
- `packages/ui/src/components/chat/message/MessageBody.tsx`
- `packages/ui/src/components/chat/message-list/TurnBlock.tsx`
- `packages/ui/src/components/chat/message-list/MessageListEntry.tsx`
- `packages/ui/src/components/chat/VirtualizedMessageList.tsx`
- `packages/ui/src/components/session/sidebar/ConfirmDialogs.tsx`
- `packages/ui/src/components/session/SessionSidebar.tsx`
- `packages/ui/src/components/chat/message/MessageListEntries.tsx`
- `packages/ui/src/lib/theme/appearancePersistence.ts`
- Plus ~20 more files discoverable via the `rg` command above (ChatSessionView, ChatViewport, SessionMount, TurnItem, ToolPart, UserTextPart, AssistantTextPart, ReasoningPart, ProgressiveGroup, etc.)

For each consumer:
- Replace `useUIStore((s) => s.showReasoningTraces)` → `useChatRenderingStore((s) => s.showReasoningTraces)` (and same for the other 9 fields + their setters)
- Add `import { useChatRenderingStore } from '@/stores/useChatRenderingStore'`
- Keep unrelated `useUIStore` selectors intact
- If any consumer imports `ChatRenderMode` / `ActivityRenderMode` / `MermaidRenderingMode` / `UserMessageRenderingMode` from `useUIStore`, update the import to come from `useChatRenderingStore` (re-export from useUIStore as fallback)

- [ ] **Step 6: Update appearanceAutoSave.ts**

Remove the 10 chat-rendering fields from the `useUIStore.subscribe` snapshot + comparison block (lines 145–225). Remove:
- `showReasoningTraces` (snapshot 147, compare 168–169)
- `showDeletionDialog` (snapshot 148, compare 171–172)
- `showToolFileIcons` (snapshot 153, compare 186–187)
- `showExpandedBashTools` (snapshot 154, compare 189–190)
- `showExpandedEditTools` (snapshot 155, compare 192–193)
- `chatRenderMode` (snapshot 158, compare 201–202)
- `activityRenderMode` (snapshot 159, compare 204–205)
- `mermaidRenderingMode` (snapshot 160, compare 207–208)
- `userMessageRenderingMode` (snapshot 161, compare 210–211)
- `stickyUserHeader` (snapshot 162, compare 213–214)

Add a new `useChatRenderingStore.subscribe` block mirroring the existing pattern:

```ts
// Snapshot initial values
let prevShowReasoningTraces = useChatRenderingStore.getState().showReasoningTraces;
let prevChatRenderMode = useChatRenderingStore.getState().chatRenderMode;
// ... all 10 fields ...

useChatRenderingStore.subscribe((state) => {
  const diff: Partial<DesktopSettings> = {};
  if (state.showReasoningTraces !== prevShowReasoningTraces) {
    diff.showReasoningTraces = state.showReasoningTraces;
    prevShowReasoningTraces = state.showReasoningTraces;
  }
  // ... all 10 comparisons ...
  if (Object.keys(diff).length > 0) schedule(diff);
});
```

Note: `reportUsage` and `timeFormatPreference`/`weekStartPreference` stay in the useUIStore subscription — they are residual fields.

- [ ] **Step 7: Update persistence.ts**

In `applyDesktopUiPreferences`, the 10 chat-rendering fields are currently routed through `store.setShowReasoningTraces(...)` etc. Change them to read from `useChatRenderingStore.getState()`:

```ts
const chatStore = useChatRenderingStore.getState();
if (typeof settings.showReasoningTraces === 'boolean' && settings.showReasoningTraces !== chatStore.showReasoningTraces) {
  chatStore.setShowReasoningTraces(settings.showReasoningTraces);
}
// Same pattern for the other 9 fields
```

Add `import { useChatRenderingStore } from '@/stores/useChatRenderingStore'`.

- [ ] **Step 8: Remove legacy surface from useUIStore.ts**

Delete from useUIStore.ts:
- 4 type definitions (lines 13–16) — re-export: `export type { ChatRenderMode, ActivityRenderMode, MermaidRenderingMode, UserMessageRenderingMode } from './useChatRenderingStore'`
- 10 interface field declarations
- 10 setter signatures
- 10 initial state values
- 10 setter implementations
- 10 partialize entries

- [ ] **Step 9: Verify**

```bash
rg "showReasoningTraces|chatRenderMode|activityRenderMode|showDeletionDialog|showToolFileIcons|showExpandedBashTools|showExpandedEditTools|mermaidRenderingMode|userMessageRenderingMode|stickyUserHeader" packages/ui/src/stores/useUIStore.ts
```
Expected: 0 matches.

```bash
bun run test:stores && bun run test:react && bun run type-check
```
Expected: all pass.

---

## Track 4: `useContextPanelStore`

**The largest track.** Two sub-steps: helpers extraction, then store + consumer migration.

**Files:**
- Create: `packages/ui/src/stores/contextPanelHelpers.ts`
- Create: `packages/ui/src/stores/useContextPanelStore.ts`
- Create: `packages/ui/src/stores/useContextPanelStore.test.ts`
- Modify: `packages/ui/src/stores/useUIStore.ts` — remove 4 fields, 17 methods, 5 types, 1 partialize key
- Modify: `packages/ui/src/hooks/useRouter.ts` — migrate subscription + getState reads
- Modify: 17 consumer files

**Anchors in useUIStore.ts:**
- Types: `ContextPanelMode` (line 12), `ContextPanelTab` (lines 21–28), `ContextPanelTabDescriptor` (lines 30–35), `ContextPanelDirectoryState` (lines 37–44), `PendingFileNavigation` (lines 46–50)
- Pure helper functions: lines 96–456
- Interface fields: lines 461–464 (state) + 498–514 (methods)
- Initial state: lines 555–558
- Method implementations: lines 593–850
- Partialize: line 1058 (`contextPanelByDirectory` only)

### Sub-step 4a: Extract pure helpers

- [ ] **Step 1: Create contextPanelHelpers.ts**

Create `packages/ui/src/stores/contextPanelHelpers.ts` containing all pure functions and types currently at useUIStore.ts lines 12, 21–50, 96–456.

Move verbatim:
- 5 constants: `CONTEXT_PANEL_DEFAULT_WIDTH`, `CONTEXT_PANEL_MIN_WIDTH`, `CONTEXT_PANEL_MAX_WIDTH`, `CONTEXT_PANEL_MAX_TABS`, `CONTEXT_PANEL_MAX_LABEL_LENGTH`
- 5 types: `ContextPanelMode`, `ContextPanelTab`, `ContextPanelTabDescriptor`, `ContextPanelDirectoryState`, `PendingFileNavigation`
- 17 pure functions: `normalizeDirectoryPath`, `clampContextPanelWidth`, `normalizeContextTargetPath`, `normalizeContextTabLabel`, `buildDefaultContextPanelTabDedupeKey`, `normalizeContextPanelTabDedupeKey`, `buildContextPanelTabID`, `createContextPanelTab`, `clampContextPanelTabs`, `sanitizeContextPanelTabs`, `resolveActiveContextPanelTabID`, `touchContextPanelState`, `upsertContextPanelTab`, `closeContextPanelTab`, `reorderContextPanelTabs`, `sanitizeContextPanelByDirectory`, `clampContextPanelRoots`

All exports must be `export` (they are currently unexported in useUIStore.ts). Types should be `export type`.

- [ ] **Step 2: Update useUIStore.ts to import from helpers**

Replace lines 12, 21–50, 96–456 in useUIStore.ts with:
```ts
import {
  CONTEXT_PANEL_DEFAULT_WIDTH,
  CONTEXT_PANEL_MIN_WIDTH,
  CONTEXT_PANEL_MAX_WIDTH,
  CONTEXT_PANEL_MAX_TABS,
  CONTEXT_PANEL_MAX_LABEL_LENGTH,
  type ContextPanelMode,
  type ContextPanelTab,
  type ContextPanelTabDescriptor,
  type ContextPanelDirectoryState,
  type PendingFileNavigation,
  normalizeDirectoryPath,
  clampContextPanelWidth,
  normalizeContextTargetPath,
  normalizeContextTabLabel,
  buildDefaultContextPanelTabDedupeKey,
  normalizeContextPanelTabDedupeKey,
  buildContextPanelTabID,
  createContextPanelTab,
  clampContextPanelTabs,
  sanitizeContextPanelTabs,
  resolveActiveContextPanelTabID,
  touchContextPanelState,
  upsertContextPanelTab,
  closeContextPanelTab as closeContextPanelTabHelper,
  reorderContextPanelTabs as reorderContextPanelTabsHelper,
  sanitizeContextPanelByDirectory,
  clampContextPanelRoots,
} from './contextPanelHelpers';

// Re-export types for backward compat with consumers importing from useUIStore
export type { ContextPanelMode, ContextPanelTab, ContextPanelTabDescriptor, ContextPanelDirectoryState, PendingFileNavigation };
```

Note: `closeContextPanelTab` and `reorderContextPanelTabs` are aliased with `Helper` suffix because the store also has methods with the same names.

- [ ] **Step 3: Verify helpers extraction compiles**

```bash
bun run type-check
```
Expected: PASS — useUIStore methods still reference the same functions via imports.

### Sub-step 4b: Create the store

- [ ] **Step 4: Write failing tests**

Create `packages/ui/src/stores/useContextPanelStore.test.ts`. Test the key behaviors:

```ts
import { beforeEach, describe, expect, it } from 'bun:test';
import { useContextPanelStore } from './useContextPanelStore';

const resetStore = () => {
  useContextPanelStore.setState({
    contextPanelByDirectory: {},
    pendingDiffFile: null,
    pendingFileNavigation: null,
    pendingFileFocusPath: null,
  }, false);
};

describe('useContextPanelStore', () => {
  beforeEach(resetStore);

  it('opens a context diff tab and sets pendingDiffFile', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/file.ts');
    const state = useContextPanelStore.getState();
    expect(state.pendingDiffFile).toBe('/workspace/file.ts');
    const panel = state.contextPanelByDirectory['/workspace'];
    expect(panel).toBeDefined();
    expect(panel.isOpen).toBe(true);
    expect(panel.tabs.length).toBe(1);
    expect(panel.tabs[0].mode).toBe('diff');
  });

  it('opens a context file tab and sets focus path', () => {
    useContextPanelStore.getState().openContextFile('/workspace', '/workspace/file.ts');
    const state = useContextPanelStore.getState();
    expect(state.pendingFileFocusPath).toBe('/workspace/file.ts');
    const panel = state.contextPanelByDirectory['/workspace'];
    expect(panel.tabs[0].mode).toBe('file');
  });

  it('opens a context file at line with navigation', () => {
    useContextPanelStore.getState().openContextFileAtLine('/workspace', '/workspace/file.ts', 42, 5);
    const state = useContextPanelStore.getState();
    expect(state.pendingFileNavigation).toEqual({ path: '/workspace/file.ts', line: 42, column: 5 });
  });

  it('closes a panel tab and selects next active', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().openContextFile('/workspace', '/workspace/b.ts');
    const panel = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    const firstTabId = panel.tabs[1].id; // diff tab is older
    useContextPanelStore.getState().closeContextPanelTab('/workspace', firstTabId);
    const updated = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    expect(updated.tabs.find(t => t.id === firstTabId)).toBeUndefined();
  });

  it('closes panel entirely when no tabs remain', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    const panel = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    useContextPanelStore.getState().closeContextPanelTab('/workspace', panel.tabs[0].id);
    const updated = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    expect(updated.isOpen).toBe(false);
  });

  it('toggles panel expanded', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().toggleContextPanelExpanded('/workspace');
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].expanded).toBe(true);
  });

  it('sets panel width with clamping', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().setContextPanelWidth('/workspace', 100);
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].width).toBe(360); // MIN_WIDTH
    useContextPanelStore.getState().setContextPanelWidth('/workspace', 2000);
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].width).toBe(1400); // MAX_WIDTH
  });

  it('navigateToDiff sets pendingDiffFile first then switches tab', () => {
    // Mock useNavigationStore to capture setActiveMainTab call
    const navStore = require('@/stores/useNavigationStore').useNavigationStore;
    let tabSet = false;
    const origGetState = navStore.getState;
    navStore.getState = () => ({
      ...origGetState(),
      mainTabGuard: undefined, // no guard — allows the switch
      setActiveMainTab: () => { tabSet = true; },
    });
    useContextPanelStore.getState().navigateToDiff('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBe('/workspace/file.ts');
    expect(tabSet).toBe(true);
    navStore.getState = origGetState;
  });

  it('navigateToDiff respects mainTabGuard and skips when guard rejects', () => {
    const navStore = require('@/stores/useNavigationStore').useNavigationStore;
    let tabSet = false;
    const origGetState = navStore.getState;
    navStore.getState = () => ({
      ...origGetState(),
      mainTabGuard: () => false, // guard rejects
      setActiveMainTab: () => { tabSet = true; },
    });
    useContextPanelStore.getState().navigateToDiff('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBeNull(); // not set
    expect(tabSet).toBe(false);
    navStore.getState = origGetState;
  });

  it('consumePendingDiffFile returns and clears the value', () => {
    useContextPanelStore.getState().setPendingDiffFile('/workspace/file.ts');
    const consumed = useContextPanelStore.getState().consumePendingDiffFile();
    expect(consumed).toBe('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBeNull();
  });
});
```

- [ ] **Step 5: Verify RED**

Run: `bun test packages/ui/src/stores/useContextPanelStore.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 6: Create the store**

Create `packages/ui/src/stores/useContextPanelStore.ts`. Copy all method bodies verbatim from useUIStore.ts lines 593–850. The store shape:

```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';
import { useNavigationStore } from './useNavigationStore';
import {
  CONTEXT_PANEL_DEFAULT_WIDTH,
  // ... all constants, types, and helpers from contextPanelHelpers ...
  type ContextPanelDirectoryState,
  type ContextPanelTabDescriptor,
  type PendingFileNavigation,
  normalizeDirectoryPath,
  touchContextPanelState,
  upsertContextPanelTab,
  closeContextPanelTab as closeContextPanelTabHelper,
  reorderContextPanelTabs as reorderContextPanelTabsHelper,
  sanitizeContextPanelByDirectory,
  clampContextPanelRoots,
  clampContextPanelWidth,
  // ... etc ...
} from './contextPanelHelpers';

// Re-export types for consumer convenience
export type { ContextPanelMode, ContextPanelTab, ContextPanelTabDescriptor, ContextPanelDirectoryState, PendingFileNavigation };

type ContextPanelState = {
  contextPanelByDirectory: Record<string, ContextPanelDirectoryState>;
  pendingDiffFile: string | null;
  pendingFileNavigation: PendingFileNavigation | null;
  pendingFileFocusPath: string | null;
  openContextPanelTab: (directory: string, tab: ContextPanelTabDescriptor) => void;
  openContextDiff: (directory: string, filePath: string) => void;
  openContextFile: (directory: string, filePath: string) => void;
  openContextFileAtLine: (directory: string, filePath: string, line: number, column?: number) => void;
  openContextOverview: (directory: string) => void;
  openContextPlan: (directory: string) => void;
  setActiveContextPanelTab: (directory: string, tabID: string) => void;
  reorderContextPanelTabs: (directory: string, activeTabID: string, overTabID: string) => void;
  closeContextPanelTab: (directory: string, tabID: string) => void;
  closeContextPanel: (directory: string) => void;
  toggleContextPanelExpanded: (directory: string) => void;
  setContextPanelWidth: (directory: string, width: number) => void;
  setPendingDiffFile: (filePath: string | null) => void;
  setPendingFileNavigation: (navigation: PendingFileNavigation | null) => void;
  setPendingFileFocusPath: (path: string | null) => void;
  navigateToDiff: (filePath: string) => void;
  consumePendingDiffFile: () => string | null;
};

export const useContextPanelStore = create<ContextPanelState>()(
  persist(
    (set, get) => ({
      contextPanelByDirectory: {},
      pendingDiffFile: null,
      pendingFileNavigation: null,
      pendingFileFocusPath: null,
      // ... copy ALL method bodies verbatim from useUIStore.ts lines 593-850 ...
      // navigateToDiff preserves the mainTabGuard check from the original:
      navigateToDiff: (filePath) => {
        const { mainTabGuard, setActiveMainTab } = useNavigationStore.getState();
        if (mainTabGuard && !mainTabGuard('diff')) {
          return;
        }
        set({ pendingDiffFile: filePath });
        setActiveMainTab('diff');
      },
      // consumePendingDiffFile and all other methods are verbatim copies
    }),
    {
      name: 'context-panel-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        contextPanelByDirectory: state.contextPanelByDirectory,
        // pending fields are NOT persisted — runtime-only
      }),
    },
  ),
);
```

- [ ] **Step 7: Verify GREEN**

Run: `bun test packages/ui/src/stores/useContextPanelStore.test.ts`
Expected: all tests pass.

### Sub-step 4c: Migrate consumers

- [ ] **Step 8: Migrate useRouter.ts**

In `packages/ui/src/hooks/useRouter.ts`:
1. Replace `useUIStore.getState().pendingDiffFile` reads (lines 112, 365) with `useContextPanelStore.getState().pendingDiffFile`.
2. **Migrate `navigateToDiff` references** — these move from `useUIStore` to `useContextPanelStore`:
   - Line 47: `useUIStore((state) => state.navigateToDiff)` → `useContextPanelStore((state) => state.navigateToDiff)`
   - Line 297: `useUIStore.getState().navigateToDiff(route.diffFile)` → `useContextPanelStore.getState().navigateToDiff(route.diffFile)`
   - Line 336: `useUIStore.getState().navigateToDiff(route.diffFile)` → `useContextPanelStore.getState().navigateToDiff(route.diffFile)`
3. In the `useUIStore.subscribe` callback (line 214): the `pendingDiffFile` tracking (snapshot at line 212, comparison at line 223, update at line 228) must move to a NEW `useContextPanelStore.subscribe`. The existing `useUIStore.subscribe` keeps watching `settingsPage` only.

Target state:
```ts
// useRouter.ts
import { useContextPanelStore } from '@/stores/useContextPanelStore';

// ... in the hook body ...

// Snapshot for context panel subscription
let prevDiffFile: string | null = useContextPanelStore.getState().pendingDiffFile;

const unsubContextPanel = useContextPanelStore.subscribe((state) => {
  const diffFileChanged = state.pendingDiffFile !== prevDiffFile;
  prevDiffFile = state.pendingDiffFile;
  if (diffFileChanged) syncURLFromState();
});

// The existing useUIStore.subscribe loses its diffFile tracking.
// It keeps: settingsPage snapshot + comparison.
```

Keep the `useUIStore.subscribe` for `settingsPage` (residual field, stays in useUIStore). Remove the `pendingDiffFile` snapshot + comparison + update from it.

Also update `getCurrentAppState` (line 112): `diffFile: useContextPanelStore.getState().pendingDiffFile` and `getShareableURL` (line 365).

- [ ] **Step 9: Migrate all consumer files**

Find all consumers:
```bash
rg -l "contextPanelByDirectory|pendingDiffFile|pendingFileNavigation|pendingFileFocusPath|openContextPanelTab|openContextDiff|openContextFile|openContextFileAtLine|openContextOverview|openContextPlan|setActiveContextPanelTab|reorderContextPanelTabs|closeContextPanelTab|closeContextPanel|toggleContextPanelExpanded|setContextPanelWidth|setPendingDiffFile|setPendingFileNavigation|setPendingFileFocusPath|navigateToDiff|consumePendingDiffFile" packages/ui/src --glob '!**/useUIStore.ts' --glob '!**/useContextPanelStore*' --glob '!**/contextPanelHelpers*' --glob '!**/useRouter.ts'
```

Expected consumer files (17 — the `rg` command above is authoritative):
- `packages/ui/src/components/views/FilesView.tsx`
- `packages/ui/src/components/layout/ContextPanel.tsx`
- `packages/ui/src/components/layout/Header.tsx`
- `packages/ui/src/components/views/DiffView.tsx`
- `packages/ui/src/components/layout/SidebarFilesTree.tsx`
- `packages/ui/src/components/views/GitView.tsx`
- `packages/ui/src/components/ui/CommandPalette.tsx`
- `packages/ui/src/components/ui/QuickOpenDialog.tsx`
- `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`
- `packages/ui/src/components/session/SessionSidebar.tsx`
- `packages/ui/src/components/session/ProjectNotesTodoPanel.tsx`
- `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx`
- `packages/ui/src/components/chat/diff/TurnChangedFilesDropdown.tsx`
- `packages/ui/src/components/chat/diff/PendingChangesBar.tsx`
- `packages/ui/src/components/chat/MarkdownRendererImpl.tsx`
- `packages/ui/src/components/layout/MainLayout.tsx`
- Any other file found by the rg search above

For each consumer:
- Replace `useUIStore((s) => s.contextPanelByDirectory)` → `useContextPanelStore((s) => s.contextPanelByDirectory)`
- Replace `useUIStore.getState().openContextDiff(...)` → `useContextPanelStore.getState().openContextDiff(...)`
- Replace `useUIStore((s) => s.pendingDiffFile)` → `useContextPanelStore((s) => s.pendingDiffFile)`
- Add `import { useContextPanelStore } from '@/stores/useContextPanelStore'`
- Keep unrelated `useUIStore` selectors intact

- [ ] **Step 10: Remove legacy surface from useUIStore.ts**

Delete from useUIStore.ts:
- All imports from `contextPanelHelpers` (they were added in step 2 but are now consumed only by `useContextPanelStore`)
- Re-export of types can stay if any consumer still imports them from useUIStore: `export type { ContextPanelMode, ... } from './contextPanelHelpers'`
- 4 interface field declarations (lines 461–464)
- 17 method signatures (lines 498–514)
- 4 initial state values (lines 555–558)
- All 17 method implementations (lines 593–850)
- 1 partialize entry (line 1058: `contextPanelByDirectory`)

- [ ] **Step 11: Update test infrastructure**

In `tests/react/helpers/stores.ts`:
- Add `import { useContextPanelStore } from '@/stores/useContextPanelStore'`
- Add `import { useChatRenderingStore } from '@/stores/useChatRenderingStore'`
- Add `import { useSessionRetentionStore } from '@/stores/useSessionRetentionStore'`
- In `resetTopLevelStores()`, add resets for any fields that tests seed (check if any existing test seeds context-panel, chat-rendering, or session-retention fields via `seedUIStore`)

In `tests/react/helpers/sessionSidebarMocks.tsx`:
- If the useUIStore mock includes any context-panel, chat-rendering, or session-retention fields, move them to new store mocks

- [ ] **Step 12: Verify**

```bash
rg "contextPanelByDirectory|pendingDiffFile|pendingFileNavigation|pendingFileFocusPath|openContextDiff|openContextFile|navigateToDiff|consumePendingDiffFile" packages/ui/src/stores/useUIStore.ts
```
Expected: 0 matches.

```bash
bun run test:stores && bun run test:react && bun run type-check && bun run test:perf
```
Expected: all pass.

```bash
wc -l packages/ui/src/stores/useUIStore.ts
```
Expected: ~500–600 lines (down from 1091).

---

## Final Verification

- [ ] **Step 1: Run full suite**

```bash
bun run test:stores && bun run test:react && bun run test:perf && bun run type-check
```
Expected: all pass.

- [ ] **Step 2: Diff audit**

```bash
git diff --stat
```
Expected: only planned files changed; pre-existing dirty files untouched.

- [ ] **Step 3: Confirm useUIStore residual**

```bash
rg "^\s+\w+:" packages/ui/src/stores/useUIStore.ts | head -40
```
Expected: ~15 residual fields (settingsPage, settingsProjectsSelectedId, settingsRemoteInstancesSelectedId, eventStreamStatus, shortcutOverrides, timeFormatPreference, weekStartPreference, reportUsage, persistChatDraft, inputSpellcheckEnabled, isExpandedInput, showMobileSessionStatusBar, isMobileSessionStatusBarCollapsed) + their setters.

---

## Non-Goals

- Do not split the residual `useUIStore` further. The ~15 remaining fields stay.
- Do not add migration helpers, version bumps, or migration blocks.
- Do not modify `DesktopSettings` or `SettingsPayload` external type contracts.
- Do not change the server-side settings validation/defaulting.
- Do not touch pre-existing dirty files in the worktree.
