---
kind: plan
status: complete
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - electron-removal
coverage: completes
created: 2026-07-15
updated: 2026-07-15
next_action: "Select and plan the next uncovered maintainability chunk"
---

# Electron Shared UI And Server Runtime Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the remaining native-shell, Tauri, SSH Remote Instance, desktop host, and desktop-notification compatibility code, leaving the existing browser/PWA client and web server paths as the only maintained runtime.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`

**Architecture:** Contract each shared module onto its existing web branch rather than replacing the removed shell. First remove complete shell-owned vertical features while their helper modules still compile, then move the real settings contract out of `lib/desktop`, collapse all remaining consumers onto browser behavior, and finally delete the dead runtime/server contracts and dependency. Preserve the generic `RuntimeAPIs` browser bridge, PWA capability detection, device form-factor behavior, web notifications and push, web updates, browser file APIs, and protected workspace workflows.

**Tech Stack:** React, TypeScript, Zustand, Base UI, Tailwind v4 theme tokens, Vite/PWA, Express, Bun test, Vitest.

---

## Chunk Coverage

This plan completes `electron-removal` after `.superpawers/plans/2026-07-14-electron-product-surface-removal.md` deleted the native package, release machinery, dependencies, and active product guidance.

It removes:

- SSH Remote Instances, desktop host switching, remote-host onboarding, native network settings, and their state/types/tests;
- desktop boot/recovery, native updater, native window/menu/dialog/filesystem/app-launch behavior, and Tauri drag/drop handling;
- `__TAURI__`, `__OPENCHAMBER_ELECTRON__`, `__OPENCHAMBER_LOCAL_ORIGIN__`, `__OPENCHAMBER_DESKTOP_BOOT_OUTCOME__`, `__OPENCHAMBER_HOME__`, and shell runtime detection;
- shell-era `DesktopSettings`, `syncDesktopSettings`, and `updateDesktopSettings` names while preserving the settings API behavior under neutral names;
- server desktop notification stdout/callback/event/env/health fields, desktop package-manager behavior, and `desktopLanAccessEnabled`;
- the remaining `@tauri-apps/api` dependency and shell-only test mocks.

After this plan, `electron-removal` can be marked complete. Scheduled-task server behavior remains until the separate `scheduled-tasks-removal` chunk; only its already-deleted native quit guard is part of Electron removal.

## Preservation Boundaries

- `window.__OPENCHAMBER_RUNTIME_APIS__` remains the generic web-to-UI API bridge. Its runtime descriptor becomes web-only; Git, GitHub, files, terminal, permissions, settings, push, tools, and notification APIs remain.
- PWA behavior remains: `usePwaDetection`, `usePwaInstallPrompt`, `usePwaManifestSync`, `useWindowControlsOverlayLayout`, service-worker notifications, Push API subscriptions, update installation/reconnect, and manifest settings.
- Browser file selection, drag/drop of real `File` objects, downloads, clipboard, URL opening, and ordinary directory/project APIs remain. No native filesystem replacement is added.
- Device words such as `desktop` may remain only when they describe viewport/form factor (`DeviceType`, desktop browser layout, `desktop-only` responsive class) or third-party/browser compatibility data such as `electron-to-chromium`. They must not identify a shell runtime or capability.
- Ordinary Git SSH support, `openssh-client` in Docker, and OpenCode remote/self-hosted access are not SSH Remote Instances and remain.
- `nativeNotificationsEnabled` and `notificationMode` remain temporarily as browser notification preference names because they govern browser Notification/Push behavior; the native-shell emitter and event path are deleted.
- Theme edits use existing tokens. Mobile behavior continues to derive from `useRuntimeStore.isMobile`/device form factor. Store edits preserve references and subscriber boundaries.
- Historical `CHANGELOG.md` and completed/superseded plan content remain unchanged.

## File Structure

- Delete shell feature modules and views: `lib/desktop/desktopBoot*`, `desktopSsh.ts`, `useDesktopSshStore*`, `components/desktop/`, remote-instance settings, desktop recovery, and native network settings.
- Create `packages/ui/src/lib/config/settingsTypes.ts`: neutral owner for the existing browser/server settings payload and skill-catalog type.
- Rename persistence exports in `packages/ui/src/lib/config/persistence.ts` to `syncSettings` and `updateSettings`; migrate current consumers without changing network or local-storage semantics.
- Collapse `App`, onboarding, layout, sidebar, chat, project/file, update, theme, notification, URL, menu, and PWA consumers onto their existing browser behavior.
- Delete `packages/ui/src/lib/desktop/` and `packages/ui/src/types/desktop.d.ts` after all consumers move; remove `@tauri-apps/api` from the UI manifest and regenerate `bun.lock`.
- Remove server desktop notification/runtime/settings branches while preserving web Push/SSE notifications and update endpoints.
- Update only current tests and active module documentation. Do not rewrite historical artifacts.

### Task 1: Delete Shell-Owned Boot, Host, SSH, Network, And App-Launch Features

**Files:**
- Delete: `packages/ui/src/lib/desktop/desktopBoot.ts`
- Delete: `packages/ui/src/lib/desktop/desktopBoot.test.ts`
- Delete: `packages/ui/src/lib/desktop/desktopSsh.ts`
- Delete: `packages/ui/src/stores/useDesktopSshStore.ts`
- Delete: `packages/ui/src/stores/useDesktopSshStore.test.ts`
- Delete: `packages/ui/src/components/desktop/DesktopHostSwitcher.tsx`
- Delete: `packages/ui/src/components/desktop/OpenInAppButton.tsx`
- Delete: `packages/ui/src/lib/openInApps.ts`
- Delete: `packages/ui/src/components/sections/remote-instances/`
- Delete: `packages/ui/src/components/sections/openchamber/DesktopNetworkSettings.tsx`
- Delete: `packages/ui/src/components/onboarding/DesktopConnectionRecovery.tsx`
- Delete: `packages/ui/src/components/onboarding/RecoveryScreen.tsx`
- Delete: `packages/ui/src/components/onboarding/RemoteConnectionForm.tsx`
- Delete: `packages/ui/src/components/onboarding/desktopRecoveryConfig.ts`
- Delete: `packages/ui/src/components/onboarding/desktopRecoveryConfig.test.ts`
- Delete: `packages/ui/src/components/onboarding/desktopRecoveryRouting.ts`
- Delete: `packages/ui/src/components/onboarding/desktopRecoveryRouting.test.ts`
- Modify: `packages/ui/src/App.tsx` - ordinary loading/onboarding path only
- Modify: `packages/ui/src/components/onboarding/OnboardingScreen.tsx` - first-launch/local setup only
- Modify: `packages/ui/src/components/onboarding/ChooserScreen.tsx` - local browser setup only
- Modify: `packages/ui/src/components/onboarding/LocalSetupScreen.tsx` - HTTP reload/check path only
- Modify: `packages/ui/src/components/layout/Header.tsx` - remove host switcher and native Open In
- Modify: `packages/ui/src/components/auth/SessionAuthGate.tsx` - remove host switcher
- Modify: `packages/ui/src/components/views/SettingsView.tsx` - remove Remote Instances
- Modify: `packages/ui/src/lib/settings/metadata.ts` - remove `remote-instances` page and desktop context
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx` - remove native network section
- Modify: `packages/ui/src/lib/project/projectActions.ts` - remove desktop forwarding types/builders
- Modify: `packages/ui/src/components/sections/projects/ProjectActionsSection.tsx` - normal project actions only
- Modify: `packages/ui/src/components/layout/ProjectActionsButton.tsx` - normal project actions only
- Modify: `packages/ui/src/components/views/FilesView.tsx` - remove native app-launch actions
- Delete: `packages/ui/src/stores/files/useOpenInAppsStore.ts` after removing its shell-owned consumers
- Modify: `packages/ui/src/stores/useUIStore.ts` - remove `settingsRemoteInstancesSelectedId` and setter/persistence
- Modify: `packages/ui/src/lib/api/types.ts` - remove `openInAppId` and shell-only settings fields only when no browser consumer remains
- Modify: `tests/react/settings-view.test.tsx` - remove deleted desktop/Remote Instances mocks and expectations
- Modify: `tests/types.d.ts` - remove shell-only window globals

- [x] **Step 1: Capture the shell-owned vertical features**

Run:

```bash
rg -n 'DesktopHostSwitcher|RemoteInstances|remote-instances|DesktopSsh|desktopSsh|desktopForward|DesktopNetworkSettings|desktopLanAccessEnabled|desktopBoot|RecoveryScreen|RemoteConnectionForm|OpenInApp|openDesktop(Project|File|Path)|settingsRemoteInstances' packages/ui/src tests/react
```

Expected: matches are confined to the files listed in this task plus neutral persistence/server cleanup explicitly assigned to later tasks.

- [x] **Step 2: Delete the shell-owned modules, views, stores, and tests**

Delete the listed boot/recovery, host, SSH, remote-instance, desktop-network, native app-launch files, and static native-app catalog. Do not move SSH parsing, host persistence/probing, native launch, boot-outcome routing, or recovery variants elsewhere.

- [x] **Step 3: Collapse App and onboarding onto browser startup**

Target state:

```tsx
// App.tsx
// Keep ordinary initialization/loading timeout and first-launch/local-setup onboarding.
// Remove injected desktop boot polling, recovery routing, shell restart, and host selection.

// OnboardingScreen.tsx
export type OnboardingScreenMode = 'first-launch' | 'local-setup';
// Render ChooserScreen or LocalSetupScreen only.
```

In `ChooserScreen` and `LocalSetupScreen`, keep CLI installation guidance, health checks, manual `opencodeBinary` text input, `updateSettings`/settings PUT, `/api/config/reload`, errors, and mobile/browser layout. Remove native window dragging, Tauri file dialogs, local/remote tabs, host persistence, and app restart. Remote/self-hosted operation is reached through the server URL and authentication, not an in-app host switcher.

- [x] **Step 4: Remove shell feature entrypoints and state**

Remove host switcher imports/renders from `Header` and `SessionAuthGate`; remove Remote Instances from `SettingsView` and settings metadata; remove Desktop Network settings from `OpenChamberPage`; remove SSH forwarding options from project actions; remove native Open In actions/store usage from `Header`, project controls, and `FilesView`; remove the selected remote-instance field from `useUIStore`.

Preserve normal project/worktree actions, file preview/download, settings navigation, auth, CLI settings, and responsive/mobile behavior.

- [x] **Step 5: Verify the vertical deletion**

Run:

```bash
git diff -- packages/ui/src/App.tsx packages/ui/src/components packages/ui/src/lib/desktop packages/ui/src/lib/project packages/ui/src/lib/settings packages/ui/src/stores packages/ui/src/lib/api/types.ts tests/react/settings-view.test.tsx tests/types.d.ts
bun run test:stores
bun run test:react
bun run type-check
```

Expected: store and React suites pass; type-check passes; the diff deletes shell-owned features without altering protected project/file/session behavior.

- [x] **Step 6: Commit the shell feature deletion**

```bash
git add -A -- packages/ui/src/App.tsx packages/ui/src/components/desktop packages/ui/src/components/sections/remote-instances packages/ui/src/components/sections/openchamber/DesktopNetworkSettings.tsx packages/ui/src/components/onboarding/DesktopConnectionRecovery.tsx packages/ui/src/components/onboarding/RecoveryScreen.tsx packages/ui/src/components/onboarding/RemoteConnectionForm.tsx packages/ui/src/components/onboarding/desktopRecoveryConfig.ts packages/ui/src/components/onboarding/desktopRecoveryConfig.test.ts packages/ui/src/components/onboarding/desktopRecoveryRouting.ts packages/ui/src/components/onboarding/desktopRecoveryRouting.test.ts packages/ui/src/components/onboarding/OnboardingScreen.tsx packages/ui/src/components/onboarding/ChooserScreen.tsx packages/ui/src/components/onboarding/LocalSetupScreen.tsx packages/ui/src/components/layout/Header.tsx packages/ui/src/components/layout/ProjectActionsButton.tsx packages/ui/src/components/auth/SessionAuthGate.tsx packages/ui/src/components/views/SettingsView.tsx packages/ui/src/components/views/FilesView.tsx packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx packages/ui/src/components/sections/projects/ProjectActionsSection.tsx packages/ui/src/lib/desktop/desktopBoot.ts packages/ui/src/lib/desktop/desktopBoot.test.ts packages/ui/src/lib/desktop/desktopSsh.ts packages/ui/src/lib/openInApps.ts packages/ui/src/lib/project/projectActions.ts packages/ui/src/lib/settings/metadata.ts packages/ui/src/lib/api/types.ts packages/ui/src/stores/useDesktopSshStore.ts packages/ui/src/stores/useDesktopSshStore.test.ts packages/ui/src/stores/files/useOpenInAppsStore.ts packages/ui/src/stores/useUIStore.ts tests/react/settings-view.test.tsx tests/types.d.ts
git commit -m "refactor: remove native shell features"
```

### Task 2: Move Browser Settings Out Of The Desktop Contract

**Files:**
- Create: `packages/ui/src/lib/config/settingsTypes.ts` - complete neutral `AppSettings` and `SkillCatalogConfig` types
- Modify: `packages/ui/src/lib/config/persistence.ts` - `AppSettings`, `syncSettings`, `updateSettings`
- Modify: `packages/ui/src/main.tsx`
- Modify: `packages/ui/src/contexts/ThemeSystemContext.tsx`
- Modify: `packages/ui/src/lib/theme/appearanceAutoSave.ts`
- Modify: `packages/ui/src/lib/config/modelPrefsAutoSave.ts`
- Modify: `packages/ui/src/lib/files/directoryShowHidden.ts`
- Modify: `packages/ui/src/lib/files/filesViewShowGitignored.ts`
- Modify: `packages/ui/src/stores/projects/useProjectsStore.ts`
- Modify: `packages/ui/src/stores/files/useDirectoryStore.ts`
- Modify: `packages/ui/src/stores/quota/useQuotaStore.ts`
- Modify: `packages/ui/src/stores/messageQueueStore.ts`
- Modify: `packages/ui/src/stores/agents/useAgentConfigStore.ts`
- Modify: `packages/ui/src/stores/git/useGitIdentitiesStore.ts`
- Modify: `packages/ui/src/components/session/DirectoryTree.tsx`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts`
- Modify: `packages/ui/src/components/auth/SessionAuthGate.tsx`
- Modify: `packages/ui/src/components/sections/usage/UsagePage.tsx`
- Modify: `packages/ui/src/components/sections/usage/UsageSidebar.tsx`
- Modify: `packages/ui/src/components/sections/skills/catalog/AddCatalogDialog.tsx`
- Modify: `packages/ui/src/components/sections/skills/catalog/SkillsCatalogPage.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/DefaultsSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/GitSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenCodeCliSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx`
- Modify: `packages/ui/src/components/onboarding/ChooserScreen.tsx`
- Modify: `packages/ui/src/components/onboarding/LocalSetupScreen.tsx`
- Modify: `packages/ui/src/components/layout/Header.tsx`
- Modify: `packages/ui/src/lib/api/types.ts` - make `SettingsPayload` the exact neutral `AppSettings` contract and remove shell-only fields
- Modify: `packages/web/src/api/settings.ts` - consume the neutral settings payload without changing GET/PUT behavior

- [x] **Step 1: Record the shell-era settings names and consumers**

Run:

```bash
rg -l 'DesktopSettings|syncDesktopSettings|updateDesktopSettings' packages/ui/src tests/react
```

Expected: every result is an existing settings persistence consumer; no shell behavior is required for the settings GET/PUT contract.

- [x] **Step 2: Create the neutral settings type owner**

Create `settingsTypes.ts` with the complete surviving fields currently declared by `DesktopSettings`, excluding fields removed in Task 1 or later server cleanup (`desktopLanAccessEnabled`, `openInAppId`, `approvedDirectories`, `securityScopedBookmarks`, and other shell bookmark/access fields with no browser consumer). Preserve browser-used `pinnedDirectories`, `nativeNotificationsEnabled`, `notificationMode`, PWA fields, catalogs, projects, and all current preference fields. Keep `ProjectEntry` and `SkillCatalogConfig` typing. This is a type move and rename, not a settings redesign.

`AppSettings` is the single settings shape. In `lib/api/types.ts`, replace the separate `SettingsPayload` interface with a type alias to `AppSettings` and make `SettingsLoadResult.source` exactly `'web'`. `packages/web/src/api/settings.ts` continues to sanitize/load/save that alias. If `settingsTypes.ts` imports `ProjectEntry` from the API barrel, use type-only imports so the relationship emits no runtime cycle; do not duplicate either settings shape.

During the same edit, remove all reads/writes/sanitization for the excluded fields from `persistence.ts`, including the localStorage `openInAppId` branch and sanitizers for `desktopLanAccessEnabled`, `approvedDirectories`, `securityScopedBookmarks`, and `openInAppId`. Preserve the existing `pinnedDirectories` storage and sanitizer unchanged. This keeps Task 2 type-checkable before the server-side field cleanup in Task 4.

Target shape:

```ts
import type { ProjectEntry } from '@/lib/api/types';

export type SkillCatalogConfig = {
  id: string;
  label: string;
  source: string;
  subpath?: string;
  gitIdentityId?: string;
};

export type AppSettings = {
  // Exact surviving fields from the former DesktopSettings contract.
  projects?: ProjectEntry[];
  skillCatalogs?: SkillCatalogConfig[];
  // ... all current browser/server settings fields, with existing types ...
};
```

- [x] **Step 3: Rename settings persistence exports mechanically**

In `persistence.ts`, use `AppSettings`; rename `syncDesktopSettings` to `syncSettings`, `updateDesktopSettings` to `updateSettings`, and internal desktop-named helpers/caches to settings-neutral names where they describe browser/server settings. Preserve:

- GET/PUT `/api/config/settings` behavior and coalescing;
- localStorage mirroring and hydration order;
- targeted Zustand setter calls and reference behavior;
- `openchamber:settings-synced` event payload;
- error handling and runtime API settings fallback.

Remove assignment to `window.__OPENCHAMBER_HOME__`; persist `homeDirectory` to localStorage and settings only.

- [x] **Step 4: Migrate all current consumers**

Update every Step 1 result to the neutral type/functions. Do not create compatibility re-exports or deprecated aliases. The post-step search must return zero matches.

- [x] **Step 5: Verify the settings migration**

Run:

```bash
if rg -n 'DesktopSettings|syncDesktopSettings|updateDesktopSettings' packages/ui/src tests/react; then exit 1; fi
git diff -- packages/ui/src/lib/config packages/ui/src/main.tsx packages/ui/src/contexts packages/ui/src/lib/theme packages/ui/src/lib/files packages/ui/src/stores packages/ui/src/components tests/react
bun run test:stores
bun run test:react
bun run type-check
```

Expected: zero old settings names; settings/store/React tests and type-check pass.

- [x] **Step 6: Commit the settings contract migration**

```bash
git add -A -- packages/ui/src/lib/config/settingsTypes.ts packages/ui/src/lib/config/persistence.ts packages/ui/src/main.tsx packages/ui/src/contexts/ThemeSystemContext.tsx packages/ui/src/lib/theme/appearanceAutoSave.ts packages/ui/src/lib/config/modelPrefsAutoSave.ts packages/ui/src/lib/files/directoryShowHidden.ts packages/ui/src/lib/files/filesViewShowGitignored.ts packages/ui/src/lib/api/types.ts packages/ui/src/stores/projects/useProjectsStore.ts packages/ui/src/stores/files/useDirectoryStore.ts packages/ui/src/stores/quota/useQuotaStore.ts packages/ui/src/stores/messageQueueStore.ts packages/ui/src/stores/agents/useAgentConfigStore.ts packages/ui/src/stores/git/useGitIdentitiesStore.ts packages/ui/src/components/session/DirectoryTree.tsx packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts packages/ui/src/components/auth/SessionAuthGate.tsx packages/ui/src/components/sections/usage/UsagePage.tsx packages/ui/src/components/sections/usage/UsageSidebar.tsx packages/ui/src/components/sections/skills/catalog/AddCatalogDialog.tsx packages/ui/src/components/sections/skills/catalog/SkillsCatalogPage.tsx packages/ui/src/components/sections/openchamber/DefaultsSettings.tsx packages/ui/src/components/sections/openchamber/GitSettings.tsx packages/ui/src/components/sections/openchamber/OpenCodeCliSettings.tsx packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx packages/ui/src/components/sections/openchamber/NotificationSettings.tsx packages/ui/src/components/onboarding/ChooserScreen.tsx packages/ui/src/components/onboarding/LocalSetupScreen.tsx packages/ui/src/components/layout/Header.tsx packages/web/src/api/settings.ts
git commit -m "refactor: rename browser settings contract"
```

### Task 3: Collapse Remaining UI Runtime Behavior Onto Browser And PWA Paths

**Files:**
- Delete: `packages/ui/src/lib/desktop/desktop.ts`
- Delete: `packages/ui/src/lib/desktop/desktopNative.ts`
- Delete: `packages/ui/src/lib/desktop/desktopHosts.ts`
- Delete: `packages/ui/src/types/desktop.d.ts`
- Modify: `packages/ui/src/lib/api/types.ts` - web-only runtime/settings source and no shell capability types
- Modify: `packages/ui/src/lib/device.ts` - form-factor detection only
- Modify: `packages/ui/src/styles/design-system.css`
- Modify: `packages/ui/src/styles/mobile.css`
- Modify: `packages/ui/src/lib/url.ts`
- Test: `packages/ui/src/lib/url.test.ts` - reject unsafe schemes and open normalized HTTP(S) URLs through the browser
- Test: `packages/ui/src/lib/pwa.test.ts` - browser, standalone, and window-controls-overlay display modes
- Test: `packages/ui/src/lib/clipboard.test.ts` - preserve browser Clipboard API and fallback behavior
- Create: `packages/ui/src/lib/config/updateTypes.ts` - neutral `UpdateInfo` owner
- Modify: `packages/ui/src/lib/errors/debug.ts`
- Modify: `packages/ui/src/lib/errors/openCodeStatus.ts`
- Modify: `packages/ui/src/lib/utils.ts`
- Modify: `packages/ui/src/lib/shortcuts.ts`
- Modify: `packages/ui/src/lib/exportSession.ts`
- Modify: `packages/ui/src/lib/config/openchamberConfig.ts`
- Modify: `packages/ui/src/lib/git/gitApiHttp.ts` - always use the browser origin
- Modify: `packages/ui/src/lib/opencode/client.ts`
- Modify: `packages/ui/src/hooks/useMenuActions.ts`
- Delete or simplify: `packages/ui/src/hooks/useFileSystemAccess.ts`
- Modify: `packages/ui/src/hooks/useWindowTitle.ts`
- Modify: `packages/ui/src/hooks/useWindowControlsOverlayLayout.ts`
- Modify: `packages/ui/src/hooks/usePwaManifestSync.ts`
- Modify: `packages/ui/src/hooks/usePwaInstallPrompt.ts`
- Modify: `packages/ui/src/hooks/usePushVisibilityBeacon.ts`
- Modify: `packages/ui/src/stores/useUpdateStore.ts`
- Modify: `packages/ui/src/stores/useUpdateStore.test.ts`
- Modify: `packages/ui/src/stores/files/useDirectoryStore.ts`
- Modify: `packages/ui/src/contexts/ThemeSystemContext.tsx`
- Modify: `packages/ui/src/components/session/SessionDialogs.tsx`
- Modify: `packages/ui/src/components/session/DirectoryTree.tsx` - browser/server directory selection only
- Modify: `packages/ui/src/components/session/DirectoryExplorerDialog.tsx` - remove native access-grant branch; add projects by browser/server path
- Modify: `packages/ui/src/components/session/SessionSidebar.tsx`
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` - browser markdown download only
- Modify: `packages/ui/src/components/session/sidebar/SidebarProjectsList.tsx`
- Modify: `packages/ui/src/components/session/sidebar/sortableItems.tsx`
- Modify: `packages/ui/src/components/session/sidebar/hooks/useStickyProjectHeaders.ts`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`
- Modify: `packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx`
- Modify: `packages/ui/src/components/chat/controls/ModelControls.tsx`
- Modify: `packages/ui/src/components/auth/SessionAuthGate.tsx`
- Modify: `packages/ui/src/components/ui/CommandPalette.tsx`
- Modify: `packages/ui/src/components/ui/AboutDialog.tsx`
- Modify: `packages/ui/src/components/ui/UpdateDialog.tsx` - web-only update props and rendering; no desktop default
- Modify: `packages/ui/src/components/layout/Header.tsx`
- Modify: `packages/ui/src/components/layout/MainLayout.tsx`
- Modify: `packages/ui/src/components/layout/RightSidebar.tsx`
- Modify: `packages/ui/src/components/layout/ProjectActionsButton.tsx`
- Modify: `packages/ui/src/components/layout/SidebarFilesTree.tsx`
- Modify: `packages/ui/src/components/multirun/MultiRunLauncher.tsx`
- Modify: `packages/ui/src/components/sections/projects/ProjectsSidebar.tsx`
- Modify: `packages/ui/src/components/sections/projects/ProjectActionsSection.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/AboutSettings.tsx` - pass only web update props
- Modify: `packages/ui/src/components/sections/openchamber/NotificationSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenCodeCliSettings.tsx`
- Modify: `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx`
- Modify: `packages/ui/src/components/views/SettingsView.tsx`
- Modify: `packages/ui/src/components/views/FilesView.tsx`
- Modify: `packages/web/src/api/permissions.ts`
- Modify: `packages/web/src/api/index.ts` - web-only runtime descriptor
- Test: `packages/web/src/api/index.test.ts` - web runtime descriptor and protected API bridge shape
- Modify: `packages/web/src/api/files.ts` - browser download only; remove OS reveal API
- Test: `packages/web/src/api/files.test.ts` - browser download anchor behavior and no reveal capability
- Modify: `packages/web/src/api/notifications.ts`
- Modify: `packages/web/src/api/settings.ts` if Task 2 leaves any source/runtime narrowing for this task
- Test: `packages/web/src/api/push.test.ts` - preserve subscribe/unsubscribe/visibility endpoint contracts
- Test: `packages/web/src/api/notifications.test.ts` - Service Worker success and Web Notification fallback
- Test: `tests/react/pwa-runtime.test.tsx` - PWA install prompt, manifest sync, and Window Controls Overlay browser behavior
- Modify: current React mocks under `tests/react/`

- [x] **Step 1: Capture every remaining shell runtime reference**

Run:

```bash
rg -n '__TAURI__|__OPENCHAMBER_(ELECTRON|LOCAL_ORIGIN|DESKTOP_BOOT_OUTCOME|HOME|MACOS_MAJOR|DESKTOP_SERVER)|is(Tauri|Electron|Desktop)Shell|isDesktopLocalOriginActive|runtime\.isDesktop|desktop-runtime|desktopOpenSshForward|desktop-tauri|@tauri-apps|desktop_(notify|restart|read_file|open_|reveal_|save_|set_window|get_app|clear_cache)|DesktopWindow|startDesktopWindowDrag|setDesktopWindow|readDesktopFile|openDesktop|revealDesktop|saveDesktop|fetchDesktop|request(File|Directory)Access|useFileSystemAccess|revealPath' packages/ui/src packages/web/src tests
```

Expected: every production match is in the files listed for this task. Form-factor words without shell/runtime context are outside this zero-tolerance pattern.

- [x] **Step 2: Make runtime and device behavior browser-only**

Remove shell globals/detectors and delete `desktop.ts`, `desktopNative.ts`, `desktopHosts.ts`, and `desktop.d.ts` after consumers migrate. The generic runtime descriptor becomes web-only:

```ts
export type RuntimePlatform = 'web';

export interface RuntimeDescriptor {
  platform: 'web';
  label: string;
}

export interface SettingsLoadResult {
  settings: AppSettings;
  source: 'web';
}
```

In `device.ts`, remove shell forcing and `desktop-runtime` class toggling. Preserve width/pointer/touch-based `DeviceType`, `useRuntimeStore` updates, mobile safe areas, and breakpoint behavior. In CSS, delete dead `:root.desktop-runtime` rules, remove `:not(.desktop-runtime)` from normal mobile selectors, and retain responsive `.desktop-only`/`.mobile-only` form-factor behavior.

- [x] **Step 3: Collapse PWA, URL, settings, and home-directory helpers**

Make PWA hooks use their browser capability checks directly; remove `isWebRuntime` imports without weakening SSR guards. `openExternalUrl` uses the existing validated `window.open` path only. Home-directory resolution uses settings/localStorage and `/api/fs/home`, not an injected global. `gitApiHttp.ts` and the OpenCode client use the current browser origin/API bridge with no `__OPENCHAMBER_DESKTOP_SERVER__` override. Remove `desktopOpenSshForward` from project config parsing/serialization and action UI. Keep `__OPENCHAMBER_RUNTIME_APIS__` and its registered web APIs.

Remove Tauri menu listeners, native title/resize/drag behavior, native file dialogs, native drag-drop, and native export/reveal/open flows. `DirectoryExplorerDialog` directly adds a validated path through the project store; it no longer requests or starts native access. `SessionNodeItem` always uses `downloadAsMarkdown`; remove native save/reveal helpers once their final consumers are gone. Keep DOM menu events, browser file inputs/drop, HTTP filesystem APIs, blob downloads, clipboard, URL validation, and ordinary browser title updates.

- [x] **Step 4: Make updates and notifications web-only**

Create `packages/ui/src/lib/config/updateTypes.ts` as the neutral owner of `UpdateInfo`. Remove `UpdateProgress`, desktop runtime state, native download/restart methods, and `desktop-tauri` query values. `useUpdateStore.checkForUpdates` always calls `/api/openchamber/update-check` with `appType=web`. Simplify `UpdateDialog` props to the web behavior it actually consumes; remove `runtimeType`, download progress/native callbacks, and the default-to-desktop behavior while retaining web install/reconnect polling, command copy, release link, error states, and PWA-safe reload behavior. Update both mobile and desktop-browser renders in `AboutSettings` to pass only those web props.

In `packages/web/src/api/notifications.ts`, delete `notifyWithTauri` and call service-worker/Web Notification behavior directly. Add `notifications.test.ts` with controlled globals proving an active Service Worker receives the payload, and proving the granted Web Notification fallback runs when no active registration exists; restore all globals/timers after each test. In `NotificationSettings`, remove shell gating so browser Push/Notification support and permission states are authoritative.

Remove `FilesAPI.revealPath`, the web API implementation that calls `/api/fs/reveal`, and Reveal controls/handlers in `FilesView` and `SidebarFilesTree`. Preserve `downloadFile`, file preview, and blob/anchor download behavior. The server route itself is removed and tested in Task 4.

Add focused browser/PWA contracts rather than relying only on file existence: `pwa.test.ts` covers display-mode resolution; `pwa-runtime.test.tsx` covers install-prompt capture/action, manifest synchronization, and Window Controls Overlay layout updates; `url.test.ts` and `clipboard.test.ts` cover browser URL/clipboard behavior; web API tests cover the runtime bridge keys, file downloads, Push endpoints/options, and notification fallbacks. Existing `layout-shell.test.tsx`, `mobile-session-status-bar.test.tsx`, `settings-view.test.tsx`, store tests, and performance benchmarks remain the named regression coverage for responsive/mobile/theme/store/render boundaries.

- [x] **Step 5: Collapse all component branches onto existing browser behavior**

Update the exact consumers identified by Step 1, including:

- `SessionSidebar`, `SidebarProjectsList`, `sortableItems`, `SessionDialogs`, `DirectoryTree`, and mobile session status: browser project dialogs/persistence, responsive chrome, no native drag/titlebar padding;
- `Header`, `MainLayout`, `RightSidebar`, `CommandPalette`, `SettingsView`, `MultiRunLauncher`, `ProjectActionsButton`, `ProjectsSidebar`: ordinary browser controls and PWA layout;
- `ChatInput`, `ModelControls`, `FilesView`, `OpenCodeCliSettings`, `OpenChamberVisualSettings`, `NotificationSettings`, `SessionAuthGate`: browser file/API/auth/PWA behavior;
- `ThemeSystemContext`: persist theme through settings and browser chrome only, with no native window theme call.

Do not replace platform branches with mobile prop plumbing. Keep existing leaf selectors and component memo boundaries.

- [x] **Step 6: Remove the Tauri dependency and regenerate the lockfile**

Delete `@tauri-apps/api` from `packages/ui/package.json`, run `bun install`, and assert no first-party Tauri package remains in `bun.lock`. Do not remove unrelated file icons/provenance strings solely because they contain `tauri`.

- [x] **Step 7: Verify the browser/PWA contraction**

Run:

```bash
if rg -n '__TAURI__|__OPENCHAMBER_(ELECTRON|LOCAL_ORIGIN|DESKTOP_BOOT_OUTCOME|HOME|MACOS_MAJOR|DESKTOP_SERVER)|is(Tauri|Electron|Desktop)Shell|isDesktopLocalOriginActive|runtime\.isDesktop|desktop-runtime|desktopOpenSshForward|desktop-tauri|@tauri-apps|desktop_(notify|restart|read_file|open_|reveal_|save_|set_window|get_app|clear_cache)|saveAsMarkdownDesktop|revealExportedMarkdown' packages/ui/src packages/web/src tests packages/ui/package.json; then exit 1; fi
test ! -d packages/ui/src/lib/desktop
test ! -e packages/ui/src/types/desktop.d.ts
bun install --frozen-lockfile
bun run test:stores
bun run test:react
bun run test:perf
bun test packages/ui/src/lib/pwa.test.ts packages/ui/src/lib/url.test.ts packages/ui/src/lib/clipboard.test.ts
bun run --cwd packages/web test -- src/api/index.test.ts src/api/files.test.ts src/api/push.test.ts src/api/notifications.test.ts
bun run type-check
```

Expected: zero shell runtime/global/IPC/dependency matches; browser/PWA tests, performance benchmarks, and type-check pass.

- [x] **Step 8: Commit the UI runtime contraction**

```bash
git add -A -- packages/ui/src/lib/desktop packages/ui/src/types/desktop.d.ts packages/ui/src/lib/api/types.ts packages/ui/src/lib/device.ts packages/ui/src/styles/design-system.css packages/ui/src/styles/mobile.css packages/ui/src/lib/url.ts packages/ui/src/lib/url.test.ts packages/ui/src/lib/pwa.test.ts packages/ui/src/lib/clipboard.test.ts packages/ui/src/lib/config/updateTypes.ts packages/ui/src/lib/errors/debug.ts packages/ui/src/lib/errors/openCodeStatus.ts packages/ui/src/lib/utils.ts packages/ui/src/lib/shortcuts.ts packages/ui/src/lib/exportSession.ts packages/ui/src/lib/config/openchamberConfig.ts packages/ui/src/lib/git/gitApiHttp.ts packages/ui/src/lib/opencode/client.ts packages/ui/src/hooks/useMenuActions.ts packages/ui/src/hooks/useFileSystemAccess.ts packages/ui/src/hooks/useWindowTitle.ts packages/ui/src/hooks/useWindowControlsOverlayLayout.ts packages/ui/src/hooks/usePwaManifestSync.ts packages/ui/src/hooks/usePwaInstallPrompt.ts packages/ui/src/hooks/usePushVisibilityBeacon.ts packages/ui/src/stores/useUpdateStore.ts packages/ui/src/stores/useUpdateStore.test.ts packages/ui/src/stores/files/useDirectoryStore.ts packages/ui/src/contexts/ThemeSystemContext.tsx packages/ui/src/components/session/SessionDialogs.tsx packages/ui/src/components/session/DirectoryTree.tsx packages/ui/src/components/session/DirectoryExplorerDialog.tsx packages/ui/src/components/session/SessionSidebar.tsx packages/ui/src/components/session/sidebar/SessionNodeItem.tsx packages/ui/src/components/session/sidebar/SidebarProjectsList.tsx packages/ui/src/components/session/sidebar/sortableItems.tsx packages/ui/src/components/session/sidebar/hooks/useStickyProjectHeaders.ts packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/chat/mobile-session-status-bar/MobileSessionStatusBar.tsx packages/ui/src/components/chat/controls/ModelControls.tsx packages/ui/src/components/auth/SessionAuthGate.tsx packages/ui/src/components/ui/CommandPalette.tsx packages/ui/src/components/ui/AboutDialog.tsx packages/ui/src/components/ui/UpdateDialog.tsx packages/ui/src/components/layout/Header.tsx packages/ui/src/components/layout/MainLayout.tsx packages/ui/src/components/layout/RightSidebar.tsx packages/ui/src/components/layout/ProjectActionsButton.tsx packages/ui/src/components/layout/SidebarFilesTree.tsx packages/ui/src/components/multirun/MultiRunLauncher.tsx packages/ui/src/components/sections/projects/ProjectsSidebar.tsx packages/ui/src/components/sections/projects/ProjectActionsSection.tsx packages/ui/src/components/sections/openchamber/OpenChamberPage.tsx packages/ui/src/components/sections/openchamber/AboutSettings.tsx packages/ui/src/components/sections/openchamber/NotificationSettings.tsx packages/ui/src/components/sections/openchamber/OpenCodeCliSettings.tsx packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx packages/ui/src/components/views/SettingsView.tsx packages/ui/src/components/views/FilesView.tsx packages/ui/package.json packages/web/src/api/index.ts packages/web/src/api/index.test.ts packages/web/src/api/permissions.ts packages/web/src/api/files.ts packages/web/src/api/files.test.ts packages/web/src/api/push.test.ts packages/web/src/api/notifications.ts packages/web/src/api/notifications.test.ts packages/web/src/api/settings.ts tests/react/pwa-runtime.test.tsx tests/react/settings-view.test.tsx tests/react/mobile-session-status-bar.test.tsx tests/react/helpers/chatInputMocks.tsx tests/react/helpers/sessionSidebarMocks.tsx bun.lock
git commit -m "refactor: remove desktop runtime compatibility"
```

### Task 4: Remove Server Desktop Notification, Runtime, And Settings Seams

**Files:**
- Modify: `packages/web/server/src/shared/types.ts`
- Modify: `packages/web/server/src/runtime/config.ts`
- Modify: `packages/web/server/src/runtime/env.ts`
- Modify: `packages/web/server/src/runtime/server.ts`
- Modify: `packages/web/server/src/domains/bootstrap/server-startup.ts`
- Modify: `packages/web/server/src/index.ts`
- Modify: `packages/web/server/src/domains/core/events.ts`
- Modify: `packages/web/server/src/domains/event-stream/runtime.ts`
- Modify: `packages/web/server/src/domains/fs/routes.ts` - remove OS reveal route; preserve raw/download and workspace-safe file routes
- Test: `packages/web/server/src/domains/fs/routes.test.ts` - reveal route absent and raw download route retained
- Modify: `packages/web/server/src/domains/notifications/emitter.ts`
- Modify: `packages/web/server/src/domains/notifications/types.ts`
- Modify: `packages/web/server/src/domains/notifications/trigger-runtime.ts`
- Test: `packages/web/server/src/domains/notifications/trigger-runtime.test.ts`
- Test: `packages/web/server/src/domains/notifications/emitter.test.ts`
- Modify: `packages/web/server/src/domains/package-manager/package-manager.ts`
- Modify: `packages/web/server/src/domains/package-manager/package-manager.test.ts`
- Modify: `packages/web/server/src/domains/settings/helpers.ts`
- Modify: `packages/web/server/src/domains/settings/normalization.ts` only if a removed shell field is normalized there
- Test: focused notification/runtime/settings/package-manager tests under `packages/web/server/src/domains/`

- [x] **Step 1: Add focused failing assertions for the server contraction**

Update `package-manager.test.ts` so the server no longer needs `OPENCHAMBER_RUNTIME=desktop` to bypass package-manager detection and never returns `packageManager: "electron"`. Use deterministic mocks/environment cleanup already established by the test.

Add `trigger-runtime.test.ts` with parameterized ready/completion, error, question, and permission fixtures. For every trigger, assert Push delivery retains its current payload/options/template result. Assert UI delivery remains gated by the existing `nativeNotificationsEnabled` browser preference, and assert disabled per-event preferences suppress the corresponding notification. The captured event list must contain no desktop event.

Add `emitter.test.ts` to prove UI broadcasting emits `openchamber:notification` through the global broadcaster or SSE fallback without `desktopStdoutActive` or stdout writes. Keep these focused unit tests deterministic by injecting the existing event bus/dependencies and disposing trigger timers/caches after each case.

Add a focused FS route registration test proving `POST /api/fs/reveal` is absent while the existing raw/download route remains registered. This removes server-side Finder/Explorer/`xdg-open` launch capability without changing workspace-safe read/write/download behavior.

Run the focused tests before implementation. Expected: FAIL because desktop runtime/event/payload fields still exist.

- [x] **Step 2: Delete server desktop startup and callback state**

Remove `onDesktopNotification`, `isDesktopNotifyEnabled`, `desktopNotifyEnabled`, `ENV_DESKTOP_NOTIFY`, `OPENCHAMBER_DESKTOP_NOTIFY`, and desktop readiness `process.send` behavior from both `runtime/server.ts` and `domains/bootstrap/server-startup.ts`. Keep ordinary host/port readiness, health fields unrelated to desktop, lifecycle cleanup, and startup logging.

Set runtime identity to the maintained web product without reading `OPENCHAMBER_RUNTIME`. Remove the package-manager desktop short-circuit, its `electron` result, and acceptance of the `desktop-tauri` install scope/app type; unknown legacy values normalize to `web`. Normal host package-manager detection remains.

- [x] **Step 3: Delete the desktop notification event/emitter path**

Remove `NOTIFICATION_SEND_DESKTOP`, `emitDesktopNotification`, stdout prefix/enablement dependencies, and `desktopStdoutActive`. At each trigger site, preserve `NOTIFICATION_SEND_UI` under the existing browser-notification preference and always preserve `NOTIFICATION_SEND_PUSH` behavior/options. Do not merge Push and UI delivery or change template resolution.

- [x] **Step 4: Remove shell-only settings fields**

Remove `desktopLanAccessEnabled`, `openInAppId`, and shell bookmark/access fields that have no remaining browser consumer from settings sanitization/normalization and UI API payload types. Keep browser project/directory selection, normal settings validation, and notification/PWA settings.

- [x] **Step 5: Run focused server verification**

Run:

```bash
bun run --cwd packages/web test -- server/src/domains/package-manager/package-manager.test.ts
bun run --cwd packages/web test -- server/src/domains/notifications
bun run --cwd packages/web test -- server/src/domains/fs/routes.test.ts
bun run build:web-server
bun run type-check
```

Expected: focused tests, server build, and type-check pass.

- [x] **Step 6: Audit and commit the server contraction**

Run:

```bash
if rg -n "onDesktopNotification|isDesktopNotifyEnabled|desktopNotifyEnabled|ENV_DESKTOP_NOTIFY|OPENCHAMBER_DESKTOP_NOTIFY|OPENCHAMBER_RUNTIME|NOTIFICATION_SEND_DESKTOP|emitDesktopNotification|DESKTOP_NOTIFY_PREFIX|desktopNotifyPrefix|desktopStdoutActive|desktopLanAccessEnabled|desktop-tauri|process\\.send|packageManager:\\s*['\"]electron['\"]" packages/web/server/src packages/ui/src packages/web/src --glob '!**/*.test.ts'; then exit 1; fi
git diff -- packages/web/server/src packages/ui/src/lib/api/types.ts packages/ui/src/lib/config/settingsTypes.ts
git add -A -- packages/web/server/src/shared/types.ts packages/web/server/src/runtime/config.ts packages/web/server/src/runtime/env.ts packages/web/server/src/runtime/server.ts packages/web/server/src/index.ts packages/web/server/src/domains/bootstrap/server-startup.ts packages/web/server/src/domains/core/events.ts packages/web/server/src/domains/event-stream/runtime.ts packages/web/server/src/domains/fs/routes.ts packages/web/server/src/domains/fs/routes.test.ts packages/web/server/src/domains/notifications/emitter.ts packages/web/server/src/domains/notifications/emitter.test.ts packages/web/server/src/domains/notifications/types.ts packages/web/server/src/domains/notifications/trigger-runtime.ts packages/web/server/src/domains/notifications/trigger-runtime.test.ts packages/web/server/src/domains/package-manager/package-manager.ts packages/web/server/src/domains/package-manager/package-manager.test.ts packages/web/server/src/domains/settings/helpers.ts packages/web/server/src/domains/settings/normalization.ts packages/ui/src/lib/api/types.ts packages/ui/src/lib/config/settingsTypes.ts
git commit -m "refactor: remove desktop server seams"
```

Expected: zero production server desktop matches and only planned server/UI contract changes are staged.

### Task 5: Verify And Close The Electron Removal Chunk

**Files:**
- Modify: `.superpawers/plans/2026-07-14-electron-shared-runtime-removal.md`
- Modify: `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`
- Modify: `.superpawers/OVERVIEW.md` only if its active validation status still names a removed shell path

- [x] **Step 1: Run exhaustive removal and preservation audits**

Zero-tolerance production audit:

```bash
test ! -e packages/electron
test ! -d packages/ui/src/lib/desktop
test ! -e packages/ui/src/stores/files/useOpenInAppsStore.ts
test ! -e packages/ui/src/components/desktop/OpenInAppButton.tsx
if rg -n 'packages/(electron|desktop)|@openchamber/electron|@tauri-apps|__TAURI__|__OPENCHAMBER_(ELECTRON|LOCAL_ORIGIN|DESKTOP_BOOT_OUTCOME|HOME|MACOS_MAJOR|DESKTOP_SERVER)|is(Tauri|Electron|Desktop)Shell|isDesktopLocalOriginActive|RuntimePlatform[^\n]*desktop|runtime\.isDesktop|runtimeType:\s*.desktop.|source:\s*.desktop.|getDesktopHomeDirectory|checkForDesktopUpdates|downloadDesktopUpdate|restartDesktopApp|restartToApplyUpdate|getDesktopLanAddress|sendAssistantCompletionNotification|getDesktopNotifyEnabled|DesktopHostSwitcher|OpenInApp|useOpenInAppsStore|openInAppId|approvedDirectories|securityScopedBookmarks|RemoteInstances|DesktopSsh|desktopSsh|desktopOpenSshForward|desktop-tauri|desktop-runtime|DesktopSettings|syncDesktopSettings|updateDesktopSettings|NOTIFICATION_SEND_DESKTOP|emitDesktopNotification|DESKTOP_NOTIFY_PREFIX|desktopNotifyPrefix|OPENCHAMBER_(DESKTOP_NOTIFY|RUNTIME)|desktopLanAccessEnabled|process\.send|saveAsMarkdownDesktop|revealExportedMarkdown|/api/fs/reveal|revealPath' package.json packages/ui/src packages/web/src packages/web/server/src --glob '!**/*.test.*' --glob '!**/*.spec.*'; then exit 1; fi
if rg -n 'isDesktop:\s*boolean' packages/ui/src/lib/api/types.ts packages/web/src/api/index.ts; then exit 1; fi
bun -e 'import { readdirSync, readFileSync } from "node:fs"; import { join, relative } from "node:path"; const roots=["packages/ui/src","packages/web/src","packages/web/server/src","tests"]; const files=[]; const walk=(dir)=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name); if(entry.isDirectory()) walk(path); else if(/\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(path)||path.endsWith(".d.ts")) files.push(path)}}; roots.forEach(walk); const structural=/@\/lib\/desktop|components\/desktop|remote-instances|desktopBoot|desktopRecovery|desktopHosts|desktopSsh|DesktopSsh|useDesktopSshStore|openInApps|OpenInApp|DesktopNetworkSettings|RecoveryScreen|RemoteConnectionForm|@tauri-apps|__TAURI__|__OPENCHAMBER_(?:ELECTRON|LOCAL_ORIGIN|DESKTOP_BOOT_OUTCOME|HOME|MACOS_MAJOR|DESKTOP_SERVER)|is(?:Tauri|Electron|Desktop)Shell|isDesktopLocalOriginActive|desktopOpenSshForward|getDesktopHomeDirectory|checkForDesktopUpdates|downloadDesktopUpdate|restartDesktopApp|restartToApplyUpdate|getDesktopLanAddress|sendAssistantCompletionNotification|getDesktopNotifyEnabled|runtime\.isDesktop|runtimeType\s*:\s*["'\''`]desktop["'\''`]|RuntimePlatform[^;\n]*desktop|source\s*:\s*.desktop.|desktopLanAccessEnabled|openInAppId|approvedDirectories|securityScopedBookmarks|OPENCHAMBER_(?:RUNTIME|DESKTOP_NOTIFY)|process\.send|DesktopSettings|syncDesktopSettings|updateDesktopSettings/; const removedLiterals=/desktop-tauri|NOTIFICATION_SEND_DESKTOP|desktopStdoutActive|\/api\/fs\/reveal|revealPath|packageManager\s*:\s*["'\''`]electron["'\''`]/; const allowed=new Set(["packages/web/server/src/domains/package-manager/package-manager.test.ts","packages/web/server/src/domains/notifications/trigger-runtime.test.ts","packages/web/server/src/domains/notifications/emitter.test.ts","packages/web/server/src/domains/fs/routes.test.ts","packages/web/src/api/files.test.ts"]); const failures=[]; for(const file of files){const text=readFileSync(file,"utf8"); const rel=relative(".",file); if(structural.test(text)) failures.push(`${rel}: forbidden shell contract`); if(removedLiterals.test(text)&&!allowed.has(rel)) failures.push(`${rel}: removed literal outside regression allowlist`)} if(failures.length){console.error(failures.join("\n")); process.exit(1)}'
```

The production audit excludes every `*.test.*` and `*.spec.*` extension so focused regression tests may mention removed event/field literals in negative assertions. The Bun scanner covers JavaScript, JSX, TypeScript, TSX, MJS, CJS, and declaration tests. `desktop-tauri`, `NOTIFICATION_SEND_DESKTOP`, `desktopStdoutActive`, `/api/fs/reveal`, `revealPath`, and `packageManager: "electron"` literals are allowed only in the exact five-file set encoded in the scanner, where they must assert normalization or absence. Test imports, mocks, globals, and runtime contracts remain zero-tolerance across every test-bearing workspace.

Case-insensitive audit:

```bash
rg -ni 'electron|tauri|native desktop|desktop shell|ssh remote instance|remote instances' package.json packages/ui packages/web/src packages/web/server/src tests AGENTS.md CONTRIBUTING.md README.md
```

Expected: every remaining match is classified as browser form factor/responsive wording, ordinary Git SSH, historical text outside this active search, file icon/provenance data, or generic `electron-to-chromium`; no runtime capability, mock, dependency, or active guidance remains.

Preservation assertions:

```bash
test -f packages/ui/src/hooks/usePwaDetection.ts
test -f packages/ui/src/hooks/usePwaInstallPrompt.ts
test -f packages/ui/src/hooks/useWindowControlsOverlayLayout.ts
test -f packages/web/src/sw.ts
rg -n '__OPENCHAMBER_RUNTIME_APIS__' packages/web/src/main.tsx packages/ui/src/main.tsx
rg -n 'showNotification|PushManager|Notification' packages/web/src/api/notifications.ts packages/ui/src/components/sections/openchamber/NotificationSettings.tsx
rg -n 'openssh-client' Dockerfile
```

Named behavioral coverage for these boundaries is mandatory: `packages/ui/src/lib/pwa.test.ts`, `packages/ui/src/lib/url.test.ts`, `packages/ui/src/lib/clipboard.test.ts`, `tests/react/pwa-runtime.test.tsx`, `tests/react/layout-shell.test.tsx`, `tests/react/mobile-session-status-bar.test.tsx`, `tests/react/settings-view.test.tsx`, `packages/web/src/api/index.test.ts`, `packages/web/src/api/files.test.ts`, `packages/web/src/api/push.test.ts`, and `packages/web/src/api/notifications.test.ts`. The runtime API test must assert the preserved `git`, `github`, `files`, `terminal`, `permissions`, `settings`, `push`, `tools`, and notifications bridge keys. Store and performance suites remain the regression gate for referential/subscription and chat hot-path behavior; full web/integration suites protect server/client workflows. `openssh-client` is the explicit static assertion for ordinary Git SSH support.

- [x] **Step 2: Run full chunk-boundary verification**

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

Expected: install, type-check, build, stores, React, performance, web, integration, server build, and docs pass. The completed Electron product-surface plan independently verified `bun run type-check` passing on the current surviving workspaces; the contradictory test-type-error line in `.superpawers/OVERVIEW.md` is stale status text, not an accepted baseline, and must be corrected during closure. `scripts/verify.sh` may remain nonzero only because of the inherited lint baseline; its type-check/build phases must pass. Integration cleanup uses the existing PID-file/watchdog/reaper only. Never use process-name matching.

- [x] **Step 3: Compare lint with the inherited baseline**

Run: `bun run lint`

Expected: no surviving workspace has more errors/warnings or a new rule category than the baseline recorded by the completed product-surface plan: session-state 0/5, web 379/237, tests 37/5, UI 43/766. Record exact fresh counts; reductions are allowed.

- [x] **Step 4: Inspect repository state before tracking updates**

Run:

```bash
git status --short
git diff --check
git log --oneline -20
```

Expected: worktree clean after implementation commits; no whitespace errors; all task commits present.

- [x] **Step 5: Close plan and parent chunk**

Update this plan to `status: complete`, check every step, add a concise verification record, and set `next_action` to selecting the next uncovered maintainability chunk.

In the parent spec, change only `electron-removal` from `Status: planned` to `Status: complete`. Update `.superpawers/OVERVIEW.md` only if its active status still contradicts the surviving product.

- [x] **Step 6: Validate planning state and commit tracking**

Run:

```bash
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js plan .superpawers/plans/2026-07-14-electron-shared-runtime-removal.md
node ~/.config/opencode/skills/superpawers/plan-management/scripts/plans.js spec .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
git diff --check
```

Expected: plan is complete with all tasks checked; `electron-removal` is complete; sibling chunks remain unchanged.

```bash
git add .superpawers/plans/2026-07-14-electron-shared-runtime-removal.md .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md .superpawers/OVERVIEW.md
git commit -m "docs: complete electron removal chunk"
```

## Final Verification Record (2026-07-15)

- Exhaustive production/test audits pass: no shell runtime, mock, dependency, or reveal residue; preservation classifications are clean.
- Frozen install: 1267 installs, no changes. Type-check passes all maintained workspaces and server. UI/web PWA build passes; no other product build is required.
- Stores: 239 pass. React: 63 pass. Performance: 2 benchmarks pass. Web: 19 pass/1 skip. Integration: 54 pass/1 skip. Server build passes. Docs: 7 pages/7 links pass.
- Focused checks pass: package-manager 2, filesystem 1, notifications 8, shutdown-runtime 3, and bootstrap 3.
- `scripts/verify.sh` exits 1 solely on inherited lint; its type-check and build phases pass.
- Current lint counts (errors/warnings): session-state 0/5, web 378/236, tests 37/5, UI 41/722; all are unchanged or reduced from baseline, with no new category.
- `git diff --check` and clean-worktree checks pass. Docker runtime verification is not required here; `openssh-client` remains statically preserved.
- Lifecycle-fix commits resolve stale `getPort` after stop and concurrent/retry/HMR reset behavior. Stale mocks and reveal documentation are removed.
