# Residual UI Store Split Design

> **Branch:** `feature/diff-preferences-store-split`
> **Prior work:** Model prefs (merged to main as `6c83e68e`), Diff/Notification/Visual prefs (`e169a901`), Layout/Navigation/Runtime (`2172a0a1`).

**Goal:** Split the last coherent field groups out of `useUIStore` into three focused stores, leaving behind a small residual of genuinely miscellaneous fields.

**Architecture:** Three new stores (`useContextPanelStore`, `useChatRenderingStore`, `useSessionRetentionStore`) following the proven migration-free pattern (no version bumps, no copy-in helpers, no migration blocks). Pure helper functions (~350 lines) extracted to a sibling file. Orphaned notification constants relocated. `useUIStore` shrinks to ~15 residual fields.

**Tech Stack:** React, TypeScript, Zustand `persist` + `createJSONStorage(() => getSafeStorage())`, Bun tests.

---

## Context

After six prior store extractions (model prefs, diff prefs, notification settings, visual scale, layout, navigation, runtime), `useUIStore.ts` is 1091 lines with ~32 remaining state fields plus ~350 lines of pure context-panel helper functions. The remaining fields fall into three cohesive groups plus a residual of truly miscellaneous fields.

This spec covers the final extraction wave. After it, `useUIStore` will be a small residual store (~15 fields) that does not warrant further splitting.

## Design Decision: Migration-Free Pattern

All stores in this wave follow the migration-free pattern established by the preference-stores-wave plan:

- No `ui-store` version bump.
- No migration blocks (`if (version < N) { delete state.X }`).
- No copy-in helpers (`migrateXFromLegacyUIStore`).
- No module-load migration calls.

Rationale: no production deployments exist yet. Existing persisted `ui-store` envelopes will retain stale keys as harmless dead data in localStorage. New stores start fresh with their own persist keys.

---

## Store 1: `useContextPanelStore`

**The largest extraction.** Owns all context-panel state, methods, and pending-file navigation.

### State fields (4)

| Field | Type | Persisted | Default |
|-------|------|-----------|---------|
| `contextPanelByDirectory` | `Record<string, ContextPanelDirectoryState>` | Yes | `{}` |
| `pendingDiffFile` | `string \| null` | No (runtime) | `null` |
| `pendingFileNavigation` | `PendingFileNavigation \| null` | No (runtime) | `null` |
| `pendingFileFocusPath` | `string \| null` | No (runtime) | `null` |

### Methods (18)

**Panel operations (14):**
`openContextPanelTab`, `closeContextPanelTab`, `closeContextPanel`, `reorderContextPanelTabs`, `setActiveContextPanelTab`, `toggleContextPanelExpanded`, `setContextPanelWidth`, `openContextDiff`, `openContextFile`, `openContextFileAtLine`, `openContextOverview`, `openContextPlan`, `consumePendingDiffFile`, `navigateToDiff`

**Pending setters (4):**
`setPendingDiffFile`, `setPendingFileNavigation`, `setPendingFileFocusPath`

### Cross-store dependency

`navigateToDiff` touches both context-panel state (`pendingDiffFile`) and navigation state (`activeMainTab`). After extraction:

```ts
navigateToDiff: (filePath) => {
  set({ pendingDiffFile: filePath });
  useNavigationStore.getState().setActiveMainTab('diff');
}
```

Ordering: set `pendingDiffFile` FIRST, then switch tab. This preserves the observable ordering so subscribers reading `pendingDiffFile` in the same tick as the tab change see the correct value.

### Pure helpers extraction

~350 lines of pure functions currently at lines 96-457 of `useUIStore.ts` move to a new sibling file `packages/ui/src/stores/contextPanelHelpers.ts`:

- Constants: `CONTEXT_PANEL_DEFAULT_WIDTH` (600), `CONTEXT_PANEL_MIN_WIDTH` (360), `CONTEXT_PANEL_MAX_WIDTH` (1400), `CONTEXT_PANEL_MAX_TABS` (12), `CONTEXT_PANEL_MAX_LABEL_LENGTH` (120)
- Functions: `normalizeDirectoryPath`, `clampContextPanelWidth`, `normalizeContextTargetPath`, `normalizeContextTabLabel`, `buildDefaultContextPanelTabDedupeKey`, `normalizeContextPanelTabDedupeKey`, `buildContextPanelTabID`, `createContextPanelTab`, `clampContextPanelTabs`, `sanitizeContextPanelTabs`, `resolveActiveContextPanelTabID`, `touchContextPanelState`, `upsertContextPanelTab`, `closeContextPanelTab`, `reorderContextPanelTabs`, `sanitizeContextPanelByDirectory`

All are pure (no `get()`/`set()` calls, no store access). The store methods call them internally.

### Types moved to `contextPanelHelpers.ts`

`ContextPanelTab`, `ContextPanelTabDescriptor`, `ContextPanelDirectoryState`, `ContextPanelMode`, `PendingFileNavigation`

Re-exported from `useContextPanelStore.ts` for consumer convenience.

### Store config

- Key: `context-panel-store`
- Version: `1`
- Partialize: `contextPanelByDirectory` only (pending fields are runtime-only)
- Storage: `createJSONStorage(() => getSafeStorage())`

### Consumers (17 files)

FilesView.tsx (23 refs), ContextPanel.tsx (19), Header.tsx (16), DiffView.tsx (13), useRouter.ts (11), SidebarFilesTree.tsx (7), GitView.tsx (4), CommandPalette.tsx (4), QuickOpenDialog.tsx (3), SessionNodeItem.tsx (3), SessionSidebar.tsx (3), ProjectNotesTodoPanel.tsx (3), ProgressiveGroup.tsx (2), TurnChangedFilesDropdown.tsx (2), PendingChangesBar.tsx (2), MarkdownRendererImpl.tsx (2), MainLayout.tsx (1)

### `useRouter.ts` subscription migration

`useRouter.ts` currently has `useUIStore.subscribe` watching `pendingDiffFile` (lines 212-228). After extraction, this migrates to `useContextPanelStore.subscribe`. The callback reads `pendingDiffFile` via `.getState()` at lines 112, 212, 223, 228, 365, 366 — all migrate to `useContextPanelStore.getState()`.

---

## Store 2: `useChatRenderingStore`

Owns chat message rendering preferences.

### State fields (10)

| Field | Type | Persisted | Default |
|-------|------|-----------|---------|
| `chatRenderMode` | `ChatRenderMode` | Yes | `'compact'` |
| `activityRenderMode` | `ActivityRenderMode` | Yes | `'grouped'` |
| `showReasoningTraces` | `boolean` | Yes | `true` |
| `showExpandedBashTools` | `boolean` | Yes | `false` |
| `showExpandedEditTools` | `boolean` | Yes | `false` |
| `userMessageRenderingMode` | `UserMessageRenderingMode` | Yes | `'markdown'` |
| `mermaidRenderingMode` | `MermaidRenderingMode` | Yes | `'raw'` |
| `stickyUserHeader` | `boolean` | Yes | `true` |
| `showDeletionDialog` | `boolean` | Yes | `true` |
| `showToolFileIcons` | `boolean` | Yes | `false` |

All setters are direct `set({ field: value })`. No clamping, no guards.

### Types moved

`ChatRenderMode`, `ActivityRenderMode`, `UserMessageRenderingMode`, `MermaidRenderingMode` — moved to `useChatRenderingStore.ts`, re-exported from `useUIStore.ts` if any consumer imports them from there.

### Store config

- Key: `chat-rendering-store`
- Version: `1`
- Partialize: all 10 fields
- Storage: `createJSONStorage(() => getSafeStorage())`

### Consumers

Top: OpenChamberVisualSettings.tsx, persistence.ts, appearanceAutoSave.ts, ChatMessage.tsx, MessageBody.tsx, TurnBlock.tsx, MessageListEntry.tsx, VirtualizedMessageList.tsx, ConfirmDialogs.tsx, SessionSidebar.tsx, MessageListEntries.tsx, appearancePersistence.ts

---

## Store 3: `useSessionRetentionStore`

Owns auto-delete and session retention policy.

### State fields (4)

| Field | Type | Persisted | Default |
|-------|------|-----------|---------|
| `autoDeleteEnabled` | `boolean` | Yes | `false` |
| `autoDeleteAfterDays` | `number` | Yes | `30` |
| `sessionRetentionAction` | `SessionRetentionAction` | Yes | `'none'` |
| `autoDeleteLastRunAt` | `number \| null` | Yes | `null` |

All setters are direct `set({ field: value })`.

### Types moved

`SessionRetentionAction` — moved to `useSessionRetentionStore.ts`.

### Store config

- Key: `session-retention-store`
- Version: `1`
- Partialize: all 4 fields
- Storage: `createJSONStorage(() => getSafeStorage())`

### Consumers

useSessionAutoCleanup.ts, SessionRetentionSettings.tsx, persistence.ts, appearanceAutoSave.ts, desktop.ts, api/types.ts

---

## Notification constant cleanup

Four orphaned constants left in `useUIStore.ts` (lines 61-94) that should have moved with the notification settings split:

- `EMPTY_NOTIFICATION_TEMPLATES`
- `LEGACY_DEFAULT_NOTIFICATION_TEMPLATES`
- `isSameTemplateValue`
- `isLegacyDefaultTemplates`

Move to `useNotificationSettingsStore.ts`. No consumer changes needed (the constants are only used within the notification store's methods).

---

## Desktop settings sync updates

Two files subscribe to `useUIStore` for desktop settings sync and must be updated after stores 2 and 3 are extracted:

### `appearanceAutoSave.ts`

Currently subscribes to `useUIStore` and snapshots many fields into desktop settings. After extraction:

- Add `useChatRenderingStore.subscribe` for the 10 chat-rendering fields.
- Add `useSessionRetentionStore.subscribe` for the 4 retention fields.
- Each subscription calls the same debounced `schedule(diff)` closure with its slice of fields.

### `persistence.ts`

`applyDesktopUiPreferences` currently reads/writes via `useUIStore.getState()`/`setState()`. After extraction:

- Chat-rendering fields read from `useChatRenderingStore.getState()` and written via `useChatRenderingStore.setState()`.
- Session-retention fields read from `useSessionRetentionStore.getState()` and written via `useSessionRetentionStore.setState()`.

### `desktop.ts` / `api/types.ts`

`DesktopSettings` and `SettingsPayload` types are NOT modified. They remain the external contract. Only the internal store routing changes.

---

## `useUIStore` residual (~15 fields)

After all three extractions, `useUIStore` retains:

**Settings selection:** `settingsPage`, `settingsProjectsSelectedId`, `settingsRemoteInstancesSelectedId`, `eventStreamStatus`

**Shortcuts:** `shortcutOverrides` + methods (`setShortcutOverrides`, `resetShortcutOverrides`, etc.)

**Miscellaneous preferences:** `timeFormatPreference`, `weekStartPreference`, `reportUsage`, `persistChatDraft`, `inputSpellcheckEnabled`, `isExpandedInput`, `showMobileSessionStatusBar`, `isMobileSessionStatusBarCollapsed`

These fields have no cohesive group larger than 4 and are low-churn. They stay in `useUIStore` as a small residual. No further splitting is planned.

---

## Sequencing

Execute in this order (safest first):

1. **Notification constant cleanup** — move 4 constants. No consumer changes. Smallest diff.
2. **`useSessionRetentionStore`** — 4 fields, ~6 consumers. Low risk.
3. **`useChatRenderingStore`** — 10 fields, ~12 consumers. Medium risk (touchpoint for chat hot path).
4. **`useContextPanelStore`** — 4 state fields + 18 methods + 350 lines helpers + 17 consumers + useRouter subscription split. Highest risk, most complex.

Each store is one commit. Context panel may warrant two commits (helpers extraction first, then store + consumer migration).

---

## Non-Goals

- Do not split the residual `useUIStore` further. The ~15 remaining fields stay.
- Do not add migration helpers, version bumps, or migration blocks.
- Do not modify `DesktopSettings` or `SettingsPayload` external type contracts.
- Do not change the server-side settings validation/defaulting in `packages/web/server/src/domains/settings/`.
- Do not touch pre-existing dirty files in the worktree.

---

## Verification

Per-store:
- `bun test packages/ui/src/stores/<store>.test.ts` — new store tests pass
- `bun run test:stores` — full store suite green
- `bun run test:react` — React component tests green
- `bun run type-check` — all workspaces pass
- `rg "<field names>" packages/ui/src/stores/useUIStore.ts` — zero matches (legacy surface fully removed)

Final wave:
- `bun run test:perf` — both benches within expected ranges
- `useUIStore.ts` line count drops from ~1091 to ~500-600
