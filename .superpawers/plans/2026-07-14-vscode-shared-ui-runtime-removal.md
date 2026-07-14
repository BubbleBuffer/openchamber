---
kind: plan
status: active
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - vscode-removal
coverage: completes
created: 2026-07-14
updated: 2026-07-14
next_action: "Execute Task 1"
---

# VS Code Shared UI Runtime Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unreachable VS Code webview runtime contract and every shared UI/server compatibility branch that existed only for the removed extension, leaving the existing web/PWA behavior as the sole maintained path.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`

**Architecture:** Contract the current code onto its existing non-VS-Code branches. Keep the runtime detector and descriptor temporarily while consumers are removed in coherent groups, then delete the contract only after exhaustive searches prove no consumer remains. This plan does not redesign the browser UI, merge package boundaries, or remove Electron/Tauri compatibility; those belong to later chunks.

**Tech Stack:** React, TypeScript, Zustand, Base UI, Tailwind v4 theme tokens, Bun test, Vitest, Vite, Express.

---

## Chunk Coverage

This plan completes the remaining half of `vscode-removal` after `.superpawers/plans/2026-07-14-vscode-product-surface-removal.md` deleted the published extension workspace and repository integration.

It removes:

- the VS Code runtime descriptor, injected globals, API bridge type, detector, and test mocks;
- the VS Code-only app shell, agent-manager panel, theme adapter, theme event path, CSS mode, and URL-routing bypass;
- VS Code-specific state bootstrap, persistence, update, quota, session-folder, and project behavior;
- VS Code-only settings, sidebar, shell, terminal, auth, MCP, catalog, composer, attachment, export, and editor branches;
- the server package-manager `scope`/`appType` handling that accepted update requests from the removed extension.

After this plan, the parent chunk can be marked complete because the extension product is absent, duplicated privileged implementations are absent, root verification no longer invokes VS Code, and no compatibility facade remains solely for a future extension.

## Preservation Boundaries

The following names are not extension-runtime compatibility and must remain unchanged:

- Shiki/TextMate types in `packages/ui/src/lib/shiki/vscodeTextMateTheme.ts` and the transitive `@shikijs/vscode-textmate` dependency;
- `.vscode` project configuration and `folder-vscode*`/`vscode*` file-type icons;
- `scripts/convert-vscode-theme.cjs`, an offline importer for third-party editor theme JSON;
- Visual Studio Code entries in `packages/ui/src/lib/openInApps.ts` and `packages/electron/main.mjs`, which launch an external editor;
- quota provider protocol headers containing `vscode/1.96.2` or `vscode_cloudshelleditor`;
- historical `CHANGELOG.md` and completed/superseded plan content;
- `__sessionSnapshotCallbackBridge`, which is active session restoration infrastructure unrelated to VS Code.

Every UI edit keeps the existing non-VS-Code branch. Mobile behavior continues to use `useRuntimeStore.isMobile`; no platform branch may replace it. Theme edits preserve theme tokens and `SEMANTIC_TYPOGRAPHY`; no hardcoded color system is introduced. Store edits preserve existing object references and subscription boundaries.

## File Structure

- Delete `packages/ui/src/components/layout/VSCodeLayout.tsx` and `packages/ui/src/components/views/agent-manager/`: these views have no surviving entrypoint after the extension deletion.
- Delete `packages/ui/src/lib/theme/vscode/` and `packages/ui/src/types/vscode.d.ts`: injected webview theme conversion and globals have no producer.
- Modify `packages/ui/src/App.tsx`, router, theme context, typography, and CSS: the standard browser shell, URL router, and theme path become unconditional.
- Modify state/config modules under `packages/ui/src/stores/` and `packages/ui/src/lib/`: retain persisted browser/server behavior and remove workspace-global overrides.
- Modify settings, layout, sidebar, and protected-feature components: retain the existing browser/desktop-browser branches without adding replacement abstractions.
- Modify chat/file/export components: retain browser file inputs, blob downloads, context-panel diffs, linked context, and mobile/default sizing.
- Modify `packages/ui/src/lib/api/types.ts`, `packages/ui/src/lib/desktop/desktop.ts`, `packages/ui/src/hooks/useRuntimeAPIs.ts`, `packages/web/src/api/index.ts`, and `packages/web/server/src/domains/package-manager/package-manager.ts`: delete the final runtime contract after consumers are gone.
- Modify only current tests/mocks and active planning state. Do not rewrite historical plans to erase former product history.

### Task 1: Remove The VS Code Shell, Theme Injection, And Router Bypass

**Files:**
- Delete: `packages/ui/src/components/layout/VSCodeLayout.tsx` - removed webview-only shell
- Delete: `packages/ui/src/components/views/agent-manager/` - removed extension panel and empty state
- Delete: `packages/ui/src/lib/theme/vscode/` - injected VS Code palette adapter
- Delete: `packages/ui/src/types/vscode.d.ts` - removed injected Shiki-theme global
- Modify: `packages/ui/src/App.tsx` - standard initialization and `MainLayout` render path
- Modify: `packages/ui/src/contexts/ThemeSystemContext.tsx` - ordinary theme list/current-theme/event behavior
- Modify: `packages/ui/src/lib/theme/cssGenerator.ts` - semantic typography only
- Modify: `packages/ui/src/lib/theme/typography.ts` - remove `VSCODE_TYPOGRAPHY`
- Modify: `packages/ui/src/index.css` - remove `.vscode-runtime` branches while preserving ordinary/mobile selectors
- Modify: `packages/ui/src/hooks/useRouter.ts` - browser URL behavior only
- Modify: `packages/ui/src/lib/router/serializeRoute.ts` - unconditional browser URL updates
- Modify: `packages/ui/src/lib/router/index.ts` - remove stale webview-routing comment
- Modify: `packages/ui/src/lib/router/types.ts` - remove VS Code router context fields
- Delete: `tests/react/agent-manager-status.test.tsx` - test for deleted extension-only panel
- Test: `tests/react/layout-shell.test.tsx`

- [ ] **Step 1: Capture the dead shell/theme/router contract**

Run:

```bash
rg -n 'VSCodeLayout|AgentManagerView|__OPENCHAMBER_(PANEL_TYPE|CONNECTION|VSCODE)|openchamber:vscode-theme|vscode-runtime|isVSCodeContext|VSCODE_TYPOGRAPHY' packages/ui/src/App.tsx packages/ui/src/components/layout/VSCodeLayout.tsx packages/ui/src/components/views/agent-manager packages/ui/src/contexts/ThemeSystemContext.tsx packages/ui/src/lib/theme packages/ui/src/types/vscode.d.ts packages/ui/src/index.css packages/ui/src/hooks/useRouter.ts packages/ui/src/lib/router tests/react/agent-manager-status.test.tsx
```

Expected: matches capture the dead shell, injected-theme, typography, CSS, and router branches in this task's files. Later-task consumers and preserved Shiki/icon names are intentionally outside this focused inventory.

- [ ] **Step 2: Delete the webview-only views and injected-theme files**

Delete all five listed deletion targets, including the obsolete agent-manager React test. Do not move their bootstrap, connection polling, view switching, palette conversion, or globals into another module; no surviving runtime produces or consumes them.

- [ ] **Step 3: Collapse `App` onto the standard initialization path**

Apply this target state around the existing anchors:

```tsx
// packages/ui/src/App.tsx
// ... existing imports, without VSCodeLayout or AgentManagerView ...

const EmbeddedSessionSelectionGate: React.FC<{
  embeddedSessionChat: EmbeddedSessionChat | null;
}> = ({ embeddedSessionChat }) => {
  // Preserve the existing selection effect, gated only by embeddedSessionChat.
};

// Preserve initializeApp retry, provider/agent loading, directory bootstrap,
// and embedded-session directory behavior without VS Code early returns.

// ... existing providers and gates ...
<EmbeddedSessionSelectionGate embeddedSessionChat={embeddedSessionChat} />
// ... existing standard MainLayout return ...
```

Remove the `isVSCodeRuntime` state/effect, startup skips, panel-type branch, connection globals, and alternate layout return. Do not change the standard startup retry limits or session selection semantics.

- [ ] **Step 4: Collapse theme and CSS behavior onto the browser path**

Remove VS Code theme state, injected globals, custom event listeners, runtime-class toggling, and adapter imports. Keep custom-theme loading, system light/dark resolution, `ensureThemeById`, browser chrome updates, and local-desktop behavior.

In `cssGenerator.ts`, always use `SEMANTIC_TYPOGRAPHY`; delete only `VSCODE_TYPOGRAPHY` from `typography.ts`. In `index.css`, delete `:root.vscode-runtime` rules and remove only `:not(.vscode-runtime)` from ordinary selectors so their prior web behavior remains.

- [ ] **Step 5: Remove the webview URL bypass**

Delete both `isVSCodeContext()` helpers, `__VSCODE_CONFIG__` reads, router early returns, and the direct-state navigation fast path. Preserve existing browser `pushState`/`replaceState`, popstate handling, route application guards, and URL serialization.

- [ ] **Step 6: Inspect and verify the focused contraction**

Run:

```bash
git diff -- packages/ui/src/App.tsx packages/ui/src/components/layout packages/ui/src/components/views/agent-manager packages/ui/src/contexts/ThemeSystemContext.tsx packages/ui/src/lib/theme packages/ui/src/types/vscode.d.ts packages/ui/src/index.css packages/ui/src/hooks/useRouter.ts packages/ui/src/lib/router tests/react/agent-manager-status.test.tsx
bun run test:react -- layout-shell.test.tsx
bun run type-check
```

Expected: the diff deletes only the alternate shell/theme/router behavior; the standard layout test and type-check pass.

- [ ] **Step 7: Commit the shell/theme/router contraction**

```bash
git add -A -- packages/ui/src/App.tsx packages/ui/src/components/layout/VSCodeLayout.tsx packages/ui/src/components/views/agent-manager packages/ui/src/contexts/ThemeSystemContext.tsx packages/ui/src/lib/theme packages/ui/src/types/vscode.d.ts packages/ui/src/index.css packages/ui/src/hooks/useRouter.ts packages/ui/src/lib/router tests/react/agent-manager-status.test.tsx
git commit -m "refactor: remove vscode ui shell"
```

### Task 2: Collapse State, Persistence, And Update Behavior Onto Web Paths

**Files:**
- Modify: `packages/ui/src/stores/projects/useProjectsStore.ts` - persisted/API projects only
- Modify: `packages/ui/src/stores/files/useDirectoryStore.ts` - persisted/home directory behavior only
- Modify: `packages/ui/src/stores/session/useSessionFoldersStore.ts` - ordinary folder persistence and operations
- Modify: `packages/ui/src/stores/quota/useQuotaStore.ts` - normal quota settings load
- Modify: `packages/ui/src/stores/useUpdateStore.ts` - desktop/web update runtimes only
- Modify: `packages/ui/src/lib/config/openchamberConfig.ts` - ordinary home-directory resolution
- Modify: `packages/ui/src/lib/config/modelPrefsAutoSave.ts` - always install browser autosave
- Modify: `packages/ui/src/lib/config/persistence.ts` - remove stale webview comment while retaining guarded runtime-global assignment
- Modify: `packages/ui/src/lib/files/directoryPersistence.ts` - apply saved browser directory normally
- Modify: `packages/ui/src/components/multirun/MultiRunLauncher.tsx` - project/current-directory resolution only
- Test: `packages/ui/src/stores/useUpdateStore.test.ts`
- Test: existing store tests under `packages/ui/src/stores/`

- [ ] **Step 1: Record the state/persistence compatibility branches**

Run:

```bash
rg -n 'isVSCode|VSCode|__VSCODE_CONFIG__|vscodeWorkspace|["'"']vscode["'"']' packages/ui/src/stores packages/ui/src/lib/config packages/ui/src/lib/files/directoryPersistence.ts packages/ui/src/components/multirun/MultiRunLauncher.tsx
```

Expected: matches identify the removed workspace bootstrap, persistence skips, quota skip, and update runtime while preserved file-icon/Shiki/editor concepts remain outside this task.

- [ ] **Step 2: Remove workspace-global project and directory overrides**

Delete `getVSCodeWorkspaceProject`, `vscodeWorkspace`, and all branches that bypass ordinary project persistence or mutations. Initial projects come from the existing persisted/API path and the active project ID comes from `readPersistedActiveProjectId()`.

Delete `__VSCODE_CONFIG__.workspaceFolder` fallbacks in the directory store and multirun launcher. Retain stored home-directory validation, persisted directory restoration, selected-project resolution, and current-directory fallback exactly as used by the web path.

- [ ] **Step 3: Remove persistence and fetch skips**

Delete `isVSCodeWebview` and make session-folder operations use their existing disk/server path. Remove early returns from model preference autosave, directory persistence, config home resolution, and quota settings loading so the existing web behavior is unconditional. Do not change store shapes, selectors, cloning behavior, or request payloads.

- [ ] **Step 4: Remove the VS Code update runtime**

Change `ClientRuntime`, store `runtimeType`, `detectRuntimeType`, query construction, update checking, and availability handling to support only the existing `desktop` and `web` paths. Preserve Electron behavior for the later `electron-removal` chunk; do not rename `desktop-tauri` server compatibility here unless it is directly part of a VS Code-only conditional.

- [ ] **Step 5: Verify store behavior and referential discipline**

Run:

```bash
git diff -- packages/ui/src/stores packages/ui/src/lib/config packages/ui/src/lib/files/directoryPersistence.ts packages/ui/src/components/multirun/MultiRunLauncher.tsx
bun run test:stores
bun run type-check
```

Expected: store tests and type-check pass; diffs remove branches without broadening subscriptions or cloning unrelated state.

- [ ] **Step 6: Commit the state contraction**

```bash
git add packages/ui/src/stores/projects/useProjectsStore.ts packages/ui/src/stores/files/useDirectoryStore.ts packages/ui/src/stores/session/useSessionFoldersStore.ts packages/ui/src/stores/quota/useQuotaStore.ts packages/ui/src/stores/useUpdateStore.ts packages/ui/src/lib/config/openchamberConfig.ts packages/ui/src/lib/config/modelPrefsAutoSave.ts packages/ui/src/lib/config/persistence.ts packages/ui/src/lib/files/directoryPersistence.ts packages/ui/src/components/multirun/MultiRunLauncher.tsx
git commit -m "refactor: remove vscode state branches"
```

### Task 3: Collapse Settings, Sidebar, And Shell Components Onto Browser Behavior

**Files:**
- Modify: `packages/ui/src/components/session/SessionSidebar.tsx`
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useArchivedAutoFolders.ts`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useProjectSessionLists.ts`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useSessionFolderCleanup.ts`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useSessionGrouping.ts`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts`
- Modify: `packages/ui/src/components/layout/Header.tsx`
- Modify: `packages/ui/src/components/layout/RightSidebar.tsx`
- Modify: `packages/ui/src/components/layout/ProjectActionsButton.tsx`
- Modify: `packages/ui/src/components/ui/CommandPalette.tsx`
- Modify: `packages/ui/src/components/ui/MemoryDebugPanel.tsx`
- Modify: `packages/ui/src/components/ui/UpdateDialog.tsx`
- Modify: `packages/ui/src/components/views/SettingsView.tsx`
- Modify: `packages/ui/src/components/views/TerminalView.tsx`
- Modify: `packages/ui/src/components/auth/SessionAuthGate.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/GitSettings.tsx`
- Modify: `packages/ui/src/components/sections/projects/ProjectsSidebar.tsx`
- Modify: `packages/ui/src/components/sections/shared/SettingsProjectSelector.tsx`
- Modify: `packages/ui/src/components/sections/shared/SettingsSidebarLayout.tsx`
- Modify: `packages/ui/src/components/sections/mcp/McpPage.tsx`
- Modify: `packages/ui/src/components/sections/skills/catalog/AddCatalogDialog.tsx`
- Modify: `packages/ui/src/components/sections/skills/catalog/InstallFromRepoDialog.tsx`
- Modify: `packages/ui/src/lib/settings/metadata.ts`
- Modify: `packages/ui/src/stores/agents/useAgentConfigStore.ts` - stale runtime comment only
- Modify: `packages/ui/src/stores/utils/streamDebug.ts` - remove the VS Code bridge metrics channel while retaining UI metrics
- Test: `tests/react/settings-view.test.tsx`
- Test: `tests/react/layout-shell.test.tsx`
- Test: `tests/react/session-sidebar.test.tsx`

- [ ] **Step 1: Capture component behavior currently hidden or altered for VS Code**

Run:

```bash
rg -n 'isVSCode|VSCode|runtime\.isVSCode|platform.*vscode|__openchamberVsCodeStreamPerfState|getVsCodeStreamPerfSnapshot|["'"']vscode["'"']' packages/ui/src/components/session packages/ui/src/components/layout packages/ui/src/components/ui packages/ui/src/components/views packages/ui/src/components/auth packages/ui/src/components/sections packages/ui/src/lib/settings/metadata.ts packages/ui/src/stores/agents/useAgentConfigStore.ts packages/ui/src/stores/utils/streamDebug.ts
```

Expected: matches identify only component branches and stale comments in this task, plus any chat files reserved for Task 4.

- [ ] **Step 2: Simplify sidebar hooks and items to their existing browser behavior**

Remove `isVSCode` arguments, memoized detectors, dependency entries, worktree suppression, persistence skips, recent-session filtering, and VS Code hover classes. Keep ordinary worktree grouping, archived scope keys, server/local persistence, runtime buttons, mobile variants, and leaf store selectors. Do not restructure the sidebar or alter session ordering.

- [ ] **Step 3: Simplify layout, settings metadata, auth, and terminal behavior**

Retain these existing outcomes unconditionally where VS Code previously disabled them:

- browser URL/settings pages and project selectors remain available;
- Header and RightSidebar use desktop-shell drag behavior only for the surviving desktop shell;
- Project actions remain gated by mobile/project/directory requirements, not a removed runtime;
- password/session auth is never skipped because of an injected editor runtime;
- terminal tabs and transport priming remain enabled by their ordinary visibility/state rules;
- update dialog runtime types are `desktop | web | null`.

Remove `isVSCode` from `SettingsRuntimeContext` and from every context builder/consumer.

- [ ] **Step 4: Simplify protected settings and integration surfaces**

Keep the prior non-VS-Code branches for visual/PWA settings, notification permission handling, terminal quick keys, projects, MCP OAuth redirect URI handling, and catalog identity selection. Delete only editor-runtime skips, special copy, and stale comments. Do not alter OAuth validation, notification permission checks, mobile settings navigation, or theme-token classes.

Delete `__openchamberVsCodeStreamPerfState`, `getVsCodeStreamPerfSnapshot`, its reset/cleanup branches, the second snapshot subscription, and the VS Code metric cards/JSON field from the debug panel. Preserve `__openchamberStreamPerfState`, `getStreamPerfSnapshot`, ordinary UI metric collection, reset/copy behavior, and the existing 500 ms debug-only refresh interval.

- [ ] **Step 5: Update focused React mocks and verify browser/mobile behavior**

Remove the obsolete `isVSCodeRuntime` mock export from `tests/react/settings-view.test.tsx` only when its source consumer is gone.

Run:

```bash
bun run test:react -- settings-view.test.tsx layout-shell.test.tsx session-sidebar.test.tsx
bun run type-check
git diff --check
```

Expected: focused tests and type-check pass; mobile variants still derive from existing mobile state rather than platform checks.

- [ ] **Step 6: Commit the component contraction**

```bash
git add packages/ui/src/components/session packages/ui/src/components/layout/Header.tsx packages/ui/src/components/layout/RightSidebar.tsx packages/ui/src/components/layout/ProjectActionsButton.tsx packages/ui/src/components/ui/CommandPalette.tsx packages/ui/src/components/ui/MemoryDebugPanel.tsx packages/ui/src/components/ui/UpdateDialog.tsx packages/ui/src/components/views/SettingsView.tsx packages/ui/src/components/views/TerminalView.tsx packages/ui/src/components/auth/SessionAuthGate.tsx packages/ui/src/components/sections packages/ui/src/lib/settings/metadata.ts packages/ui/src/stores/agents/useAgentConfigStore.ts packages/ui/src/stores/utils/streamDebug.ts tests/react/settings-view.test.tsx
git commit -m "refactor: remove vscode component branches"
```

### Task 4: Collapse Chat, File, Export, And Editor Behavior Onto Browser Paths

**Files:**
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`
- Modify: `packages/ui/src/components/chat/FileAttachment.tsx`
- Modify: `packages/ui/src/components/chat/MarkdownRendererImpl.tsx`
- Modify: `packages/ui/src/components/chat/status/StatusRow.tsx`
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx`
- Modify: `packages/ui/src/components/chat/chat-input/ComposerAttachmentControls.tsx`
- Modify: `packages/ui/src/components/chat/chat-input/ComposerFooter.tsx`
- Modify: `packages/ui/src/components/chat/chat-input/ComposerLinkedContextRow.tsx`
- Modify: `packages/ui/src/components/chat/chat-input/ComposerMobileControls.tsx`
- Modify: `packages/ui/src/components/chat/chat-input/useDraftTargetSelector.ts`
- Modify: `packages/ui/src/components/chat/message/MessageBody.tsx`
- Modify: `packages/ui/src/components/chat/message/TextSelectionMenu.tsx`
- Modify: `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
- Modify: `packages/ui/src/components/chat/diff/PendingChangesBar.tsx` - remove stale webview comment only
- Modify: `packages/ui/src/lib/exportSession.ts`
- Modify: `packages/ui/src/lib/url.ts`
- Modify: `packages/ui/src/hooks/useKeyboardShortcuts.ts`
- Modify: `tests/react/helpers/chatInputMocks.tsx`
- Test: `tests/react/chat-input.test.tsx`
- Test: `tests/react/chat-message.test.tsx`

- [ ] **Step 1: Record webview-specific chat and file behavior**

Run:

```bash
rg -n 'isVSCode|VSCode|runtime\.isVSCode|/api/vscode/|["'"']vscode["'"']' packages/ui/src/components/chat packages/ui/src/lib/exportSession.ts packages/ui/src/lib/url.ts packages/ui/src/hooks/useKeyboardShortcuts.ts tests/react/helpers/chatInputMocks.tsx
```

Expected: matches identify URI-drop suppression, webview file/save endpoints, editor-diff routing, hidden browser actions, composer sizing/props, and one test mock.

- [ ] **Step 2: Remove webview file/drop/save endpoints**

Delete VS Code URI-drop constants/helpers, suppressed text-insert refs/handlers, `/api/vscode/pick-files`, `/api/vscode/save-image`, and `/api/vscode/save-markdown` paths. Preserve the existing browser `File`/`<input type="file">` flow, blob/object-URL download behavior, drag/drop behavior for real `File` objects, and desktop save/open/reveal behavior until Electron removal.

- [ ] **Step 3: Remove editor-only rendering and action hiding**

Use the existing web context-panel/diff behavior instead of `runtime.editor` for VS Code. Keep linked issue/PR rows, notes actions, worktree keyboard shortcuts, rotating model metadata, and ordinary URL opening. Do not remove generic runtime editor APIs unless exhaustive use analysis shows they have no non-VS-Code consumer; this task removes only the VS Code preference/dispatch.

At `ToolPart`'s existing tool-diff click handler, remove only the `runtime.runtime.isVSCode` branch that calls `runtime.editor.openDiff()`. Preserve the generic `runtime.editor` contract and the current browser context-diff fallback for edit, multiedit, and apply-patch tools.

- [ ] **Step 4: Remove VS Code composer props and sizing**

Delete the `isVSCode` prop chain through footer/mobile/attachment/linked-context components and memo comparators. Preserve mobile sizing from `isMobile`; use the existing default desktop-browser classes otherwise. The attachment control always uses its current browser dropdown behavior, and draft target selection is no longer hidden for an editor runtime.

- [ ] **Step 5: Update chat mocks and verify hot-path behavior**

Remove the obsolete detector from `tests/react/helpers/chatInputMocks.tsx` after source consumers disappear. Do not introduce new store subscriptions or pass `isMobile` through props.

Run:

```bash
bun run test:react -- chat-input.test.tsx chat-message.test.tsx mobile-session-status-bar.test.tsx
bun run test:perf
bun run type-check
git diff --check
```

Expected: React tests, performance thresholds, and type-check pass; no unrelated input/composer chrome gains a text-value dependency.

- [ ] **Step 6: Commit the chat/file contraction**

```bash
git add packages/ui/src/components/chat packages/ui/src/lib/exportSession.ts packages/ui/src/lib/url.ts packages/ui/src/hooks/useKeyboardShortcuts.ts tests/react/helpers/chatInputMocks.tsx
git commit -m "refactor: remove vscode chat branches"
```

### Task 5: Delete The Final Runtime Contract And Server Update Scope

**Files:**
- Modify: `packages/ui/src/lib/api/types.ts` - remove `'vscode'`, `isVSCode`, `VSCodeAPI`, and `RuntimeAPIs.vscode`
- Modify: `packages/ui/src/lib/desktop/desktop.ts` - delete detector and simplify `isWebRuntime`
- Modify: `packages/ui/src/hooks/useRuntimeAPIs.ts` - delete `useIsVSCodeRuntime`
- Modify: `packages/ui/src/lib/errors/debug.ts` - remove runtime debug field
- Modify: `packages/ui/src/sync/sync-context.tsx` - remove the stale VS Code bootstrap-retry comment at the retry effect while leaving retry behavior intact
- Modify: `packages/web/src/api/index.ts` - remove `isVSCode: false`
- Modify: `packages/web/server/src/domains/package-manager/package-manager.ts` - remove VS Code scope/app type/platform/arch branches
- Create: `packages/web/server/src/domains/package-manager/package-manager.test.ts` - update payload normalizes removed app types to web and ignores caller platform/arch
- Delete: `packages/ui/src/lib/phase3-allowlist.test.ts` - stale migration test whose referenced allowlist no longer exists
- Modify: `tests/react/helpers/sessionSidebarMocks.tsx` - remove obsolete runtime fields/detector mocks
- Test: `packages/ui/src/sync/sync-context.test.ts` - retained session snapshot restoration bridge coverage

- [ ] **Step 1: Run the zero-tolerance audit before contract deletion**

Run:

```bash
rg -n 'isVSCode|VSCodeAPI|RuntimeAPIs\.vscode|VSCodeLayout|__VSCODE_CONFIG__|__OPENCHAMBER_(VSCODE|PANEL_TYPE|CONNECTION)|__openchamberVsCodeStreamPerfState|getVsCodeStreamPerfSnapshot|vscode-runtime|/api/vscode/' packages/ui/src packages/web/src tests
rg -n 'platform.*vscode|runtimeType.*vscode|appType.*vscode|scope.*vscode' packages/ui/src packages/web/src packages/web/server/src --glob '!**/*.test.ts'
```

Expected: only the runtime descriptor/detector, web descriptor, package-manager branches, and current test mocks remain. If an unlisted production consumer remains, stop and amend/re-review this plan rather than making an unplanned architecture decision.

- [ ] **Step 2: Delete runtime types, detector, hook, and web descriptor field**

Apply these target states:

```ts
// packages/ui/src/lib/api/types.ts
export type RuntimePlatform = 'web' | 'desktop';

export interface RuntimeDescriptor {
  platform: RuntimePlatform;
  isDesktop: boolean;
  label: string;
}

// RuntimeAPIs has no vscode field and VSCodeAPI no longer exists.
```

```ts
// packages/ui/src/lib/desktop/desktop.ts, isWebRuntime
export const isWebRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const platform = (window as {
    __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: { platform?: string } };
  }).__OPENCHAMBER_RUNTIME_APIS__?.runtime?.platform;
  if (platform === 'desktop') return false;
  return true;
};
```

Delete `useIsVSCodeRuntime` and the debug report field. Remove `isVSCode: false` from the web runtime descriptor.

- [ ] **Step 3: Remove server update-scope compatibility**

In `sanitizeInstallScope` and `normalizeAppType`, remove only the `"vscode"` accepted value. Compute request `platform` and `arch` from the host unconditionally instead of honoring editor-supplied values. Preserve current `web` and `desktop-tauri` behavior for later chunks.

First add `package-manager.test.ts`. Mock `node:os` home-directory resolution to a temporary directory, set `OPENCHAMBER_RUNTIME=desktop` during the test to deterministically short-circuit package-manager probing, and stub `fetch` to capture the update-check JSON body. Call exported `checkForUpdates({ currentVersion: "1.0.0", appType: "vscode", platform: "windows", arch: "arm64" })`; before implementation the payload reports the removed app type and caller platform/arch, while the target state reports `appType: "web"` and the mapped host `process.platform`/`process.arch`. Return a successful update API response from the stub. After each test, restore the prior `OPENCHAMBER_RUNTIME`, restore `fetch`, and remove the temporary directory so no process or filesystem state leaks between tests.

Run the focused test before implementation and expect it to fail on the payload assertion. Run it again after implementation and expect it to pass:

```bash
bun run --cwd packages/web test -- server/src/domains/package-manager/package-manager.test.ts
```

- [ ] **Step 4: Update current tests without deleting unrelated session infrastructure**

Remove obsolete `isVSCode` fields and detector exports from `sessionSidebarMocks.tsx`. Delete `phase3-allowlist.test.ts` in full because all of its assertions depend on missing `.superpawers/plans/phase-3-allowlist.md`; it is already red before this change and no longer protects a live policy source. Keep `__sessionSnapshotCallbackBridge` and its active coverage in `sync-context.test.ts` unchanged.

- [ ] **Step 5: Prove runtime compatibility references are gone and preserved names remain**

Run:

```bash
rg -n 'isVSCode|VSCodeAPI|RuntimeAPIs\.vscode|VSCodeLayout|__VSCODE_CONFIG__|__OPENCHAMBER_(VSCODE|PANEL_TYPE|CONNECTION)|__openchamberVsCodeStreamPerfState|getVsCodeStreamPerfSnapshot|vscode-runtime|/api/vscode/' packages/ui/src packages/web/src tests
rg -n 'platform.*vscode|runtimeType.*vscode|appType.*vscode|scope.*vscode' packages/ui/src packages/web/src packages/web/server/src --glob '!**/*.test.ts'
rg -n 'VSCodeTextMateTheme|VSCodeTokenColorRule' packages/ui/src/lib/shiki
rg -n 'folder-vscode|["'"']vscode["'"']' packages/ui/src/lib/files/fileTypeIconIds.ts packages/ui/src/lib/openInApps.ts packages/electron/main.mjs
rg -n 'vscode/1\.96\.2|vscode_cloudshelleditor' packages/web/server/src/domains/quota
rg -n '@shikijs/vscode-textmate' bun.lock
test -f scripts/convert-vscode-theme.cjs
```

Expected: the first two searches return no matches; all preservation searches/assertions succeed. Historical plans and `CHANGELOG.md` are intentionally outside the zero-tolerance audit.

Also run this case-insensitive classification audit:

```bash
rg -n -i 'vs[[:space:]-]?code|vscode' packages/ui/src packages/web/src packages/web/server/src tests
```

Expected: every remaining match belongs to this explicit allowlist only: Shiki/TextMate type names; `.vscode`/VS Code file icons; built-in editor-theme provenance tags; the Visual Studio Code external-app target; quota-provider protocol headers; or the rejected `appType: "vscode"` fixture in `package-manager.test.ts`. No comment, branch, global, endpoint, runtime descriptor, mock, or feature gate remains.

- [ ] **Step 6: Verify type and focused test integrity**

Run:

```bash
bun test packages/ui/src/sync/sync-context.test.ts
bun run --cwd packages/web test -- server/src/domains/package-manager/package-manager.test.ts
bun run test:react
bun run test:stores
bun run build:web-server
bun run type-check
git diff --check
```

Expected: all commands pass.

- [ ] **Step 7: Commit final contract removal**

```bash
git add packages/ui/src/lib/api/types.ts packages/ui/src/lib/desktop/desktop.ts packages/ui/src/hooks/useRuntimeAPIs.ts packages/ui/src/lib/errors/debug.ts packages/ui/src/sync/sync-context.tsx packages/web/src/api/index.ts packages/web/server/src/domains/package-manager/package-manager.ts packages/web/server/src/domains/package-manager/package-manager.test.ts packages/ui/src/lib/phase3-allowlist.test.ts tests/react/helpers/sessionSidebarMocks.tsx
git add -u
git commit -m "refactor: remove vscode runtime contract"
```

### Task 6: Verify And Close The VS Code Removal Chunk

**Files:**
- Modify: `.superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md` - completion metadata and verification record
- Modify: `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md` - mark `vscode-removal` complete
- Modify: `.superpawers/OVERVIEW.md` - remove stale active package-status mention if still present

- [ ] **Step 1: Run the complete dead-reference and preservation audit**

Repeat Task 5 Step 5. Also run:

```bash
test ! -e packages/vscode
test ! -e .github/workflows/vscode-extension.yml
test ! -e scripts/dev-vscode.mjs
rg -n 'packages/vscode|vscode:(dev|build|package|type-check)|"@types/vscode"|"@vscode/vsce"' package.json Dockerfile scripts bun.lock .github AGENTS.md CONTRIBUTING.md README.md packages/docs/content/docs
```

Expected: all removed-product/runtime assertions pass and all preservation assertions remain present.

- [ ] **Step 2: Run maintained build and behavioral checks**

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
```

Expected: every command passes. Root build invokes no extension/webview work.

Run the repository chunk-boundary verifier as well:

```bash
scripts/verify.sh
```

Expected at this program stage: type-check and build pass; the script exits non-zero only because the documented inherited lint debt has not yet been eliminated. Capture the exact lint counts and confirm they agree with Step 3. Any type-check/build failure, new lint rule category, or surviving-workspace lint increase fails this plan.

- [ ] **Step 3: Run lint against the inherited debt baseline**

Run: `bun run lint`

Expected: lint may remain non-zero because this program has not yet reached `quality-gates-and-test-architecture`, but no new error or warning is introduced in surviving code. Counts for touched UI/web files should fall as deleted branches/files disappear. Record exact per-workspace counts; investigate any new rule category or increase before closing the plan.

- [ ] **Step 4: Inspect all chunk commits and repository state**

Run:

```bash
git status --short
git diff --check
git log --oneline -10
```

Expected: only plan/spec/overview tracking edits remain uncommitted; whitespace validation passes; implementation commits are present.

- [ ] **Step 5: Close the plan and parent chunk**

Set this plan to `status: complete`, update `next_action` to selecting the next uncovered maintainability chunk, mark all checkboxes complete, and append a concise verification record with exact commands/results and residual environment limitations.

Change the parent spec's `### Chunk: vscode-removal` status from `planned` to `complete`. Update only stale active status prose in `.superpawers/OVERVIEW.md`; do not rewrite historical completed plans.

- [ ] **Step 6: Validate planning state and commit closure**

Run:

```bash
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js plan .superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js spec .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
git diff -- .superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md .superpawers/OVERVIEW.md
```

Expected: this plan is complete, `vscode-removal` is complete, other chunks remain planned, and no broken parent/chunk reference is introduced.

```bash
git add .superpawers/plans/2026-07-14-vscode-shared-ui-runtime-removal.md .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md .superpawers/OVERVIEW.md
git commit -m "docs: complete vscode removal chunk"
```
