import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import * as sessionActions from '@/sync/session-actions';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useNavigationStore } from '@/stores/useNavigationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useRuntimeStore } from '@/stores/useRuntimeStore';
import { useModelPreferencesStore } from '@/stores/useModelPreferencesStore';
import { useDialogStore } from '@/stores/useDialogStore';
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { createWorktreeSession } from '@/lib/session/worktreeSessionCreator';
import { showOpenCodeStatus } from '@/lib/errors/openCodeStatus';
import { eventMatchesShortcut, getEffectiveShortcutCombo } from '@/lib/shortcuts';

export const useKeyboardShortcuts = () => {
  const openNewSessionDraft = useSessionUIStore((s) => s.openNewSessionDraft);
  const armAbortPrompt = useSessionUIStore((s) => s.armAbortPrompt);
  const clearAbortPrompt = useSessionUIStore((s) => s.clearAbortPrompt);
  const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const abortCurrentOperation = sessionActions.abortCurrentOperation;;
  const toggleCommandPalette = useDialogStore((s) => s.toggleCommandPalette);
  const setQuickOpenOpen = useDialogStore((s) => s.setQuickOpenOpen);
  const toggleHelpDialog = useDialogStore((s) => s.toggleHelpDialog);
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleRightSidebar = useLayoutStore((s) => s.toggleRightSidebar);
  const setRightSidebarOpen = useLayoutStore((s) => s.setRightSidebarOpen);
  const setRightSidebarTab = useLayoutStore((s) => s.setRightSidebarTab);
  const toggleBottomTerminal = useLayoutStore((s) => s.toggleBottomTerminal);
  const setBottomTerminalExpanded = useLayoutStore((s) => s.setBottomTerminalExpanded);
  const isMobile = useRuntimeStore((s) => s.isMobile);
  const setSessionSwitcherOpen = useNavigationStore((s) => s.setSessionSwitcherOpen);
  const setActiveMainTab = useNavigationStore((s) => s.setActiveMainTab);
  const setSettingsDialogOpen = useDialogStore((s) => s.setSettingsDialogOpen);
  const setModelSelectorOpen = useDialogStore((s) => s.setModelSelectorOpen);
  const toggleExpandedInput = useUIStore((s) => s.toggleExpandedInput);
  const shortcutOverrides = useUIStore((s) => s.shortcutOverrides);
  const { themeMode, setThemeMode } = useThemeSystem();
  const { working } = useAssistantStatus();
  const abortPrimedUntilRef = React.useRef<number | null>(null);
  const abortPrimedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeModeRef = React.useRef(themeMode);

  React.useEffect(() => {
    themeModeRef.current = themeMode;
  }, [themeMode]);

  const resetAbortPriming = React.useCallback(() => {
    if (abortPrimedTimeoutRef.current) {
      clearTimeout(abortPrimedTimeoutRef.current);
      abortPrimedTimeoutRef.current = null;
    }
    abortPrimedUntilRef.current = null;
    clearAbortPrompt();
  }, [clearAbortPrompt]);

  React.useEffect(() => {
    const combo = (actionId: string) => getEffectiveShortcutCombo(actionId, shortcutOverrides);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (eventMatchesShortcut(e, combo('open_command_palette'))) {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      if (eventMatchesShortcut(e, combo('open_quick_open'))) {
        e.preventDefault();
        setQuickOpenOpen(true);
        return;
      }

      if (eventMatchesShortcut(e, combo('open_status'))) {
        e.preventDefault();
        void showOpenCodeStatus();
        return;
      }

      if (eventMatchesShortcut(e, combo('open_help'))) {
        e.preventDefault();
        toggleHelpDialog();
        return;
      }

      const matchedNewSessionShortcut = eventMatchesShortcut(e, combo('new_chat'));
      const matchedWorktreeShortcut = eventMatchesShortcut(e, combo('new_chat_worktree'));

      if (matchedNewSessionShortcut || matchedWorktreeShortcut) {
        e.preventDefault();

        setActiveMainTab('chat');
        setSessionSwitcherOpen(false);

        if (matchedWorktreeShortcut) {
          createWorktreeSession();
          return;
        }

        openNewSessionDraft();
        return;
      }

      if (eventMatchesShortcut(e, combo('cycle_theme'))) {
        e.preventDefault();
        const modes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
        const activeElement = document.activeElement as HTMLElement | null;
        const currentIndex = modes.indexOf(themeModeRef.current);
        const nextIndex = (currentIndex + 1) % modes.length;
        setThemeMode(modes[nextIndex]);
        requestAnimationFrame(() => {
          if (typeof document === 'undefined' || typeof window === 'undefined') {
            return;
          }
          if (!document.hasFocus()) {
            window.focus();
          }
          if (activeElement && document.contains(activeElement)) {
            activeElement.focus({ preventScroll: true });
          }
        });
        return;
      }

      if (eventMatchesShortcut(e, combo('open_settings'))) {
        e.preventDefault();
        const { isSettingsDialogOpen } = useDialogStore.getState();
        setSettingsDialogOpen(!isSettingsDialogOpen);
        return;
      }

      if (eventMatchesShortcut(e, combo('toggle_sidebar'))) {
        e.preventDefault();
        const { isSessionSwitcherOpen } = useNavigationStore.getState();
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          setSessionSwitcherOpen(!isSessionSwitcherOpen);
        } else {
          toggleSidebar();
        }
        return;
      }

      if (eventMatchesShortcut(e, combo('focus_input'))) {
        e.preventDefault();
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
        textarea?.focus();
        return;
      }

      if (eventMatchesShortcut(e, combo('toggle_right_sidebar'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }
        e.preventDefault();
        toggleRightSidebar();
        return;
      }

      if (eventMatchesShortcut(e, combo('open_right_sidebar_git'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }
        e.preventDefault();
        setRightSidebarOpen(true);
        setRightSidebarTab('git');
        return;
      }

      if (eventMatchesShortcut(e, combo('open_right_sidebar_files'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }
        e.preventDefault();
        setRightSidebarOpen(true);
        setRightSidebarTab('files');
        return;
      }

      if (eventMatchesShortcut(e, combo('cycle_right_sidebar_tab'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }

        const rightSidebarTab = useLayoutStore.getState().rightSidebarTab as 'git' | 'files' | 'context';
        const tabs = ['git', 'files', 'context'] as const;
        const currentIndex = tabs.indexOf(rightSidebarTab);
        const nextTab = tabs[(currentIndex + 1) % tabs.length];

        e.preventDefault();
        setRightSidebarOpen(true);
        setRightSidebarTab(nextTab);
        return;
      }

      if (eventMatchesShortcut(e, combo('toggle_terminal'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }
        e.preventDefault();
        toggleBottomTerminal();
        return;
      }

      if (eventMatchesShortcut(e, combo('toggle_terminal_expanded'))) {
        const { isMobile } = useRuntimeStore.getState();
        if (isMobile) {
          return;
        }
        const isBottomTerminalExpanded = useLayoutStore.getState().isBottomTerminalExpanded;
        e.preventDefault();
        setBottomTerminalExpanded(!isBottomTerminalExpanded);
        return;
      }

      // Cmd/Ctrl+Shift+M: Open model selector (same conditions as double-ESC: chat tab, no overlays)
      if (eventMatchesShortcut(e, combo('open_model_selector'))) {
        const {
          activeMainTab,
          isSessionSwitcherOpen,
        } = useNavigationStore.getState();
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isAboutDialogOpen,
          isModelSelectorOpen,
        } = useDialogStore.getState();

        // Skip if settings open
        if (isSettingsDialogOpen) {
          return;
        }

        // Skip if any overlay open or not on chat tab
        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isAboutDialogOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive) {
          return;
        }

        e.preventDefault();
        setModelSelectorOpen(!isModelSelectorOpen);
        return;
      }

      // Cmd/Ctrl+Shift+T: Cycle thinking variant (same gating as Shift+M)
      if (eventMatchesShortcut(e, combo('cycle_thinking_variant'))) {
        const {
          activeMainTab,
          isSessionSwitcherOpen,
        } = useNavigationStore.getState();
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isAboutDialogOpen,
        } = useDialogStore.getState();

        if (isSettingsDialogOpen) {
          return;
        }

        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isAboutDialogOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive) {
          return;
        }

        e.preventDefault();

        const providerConfig = useProviderConfigStore.getState();
        const variants = providerConfig.getCurrentModelVariants();
        if (variants.length === 0) {
          return;
        }

        providerConfig.cycleCurrentVariant();

        const nextVariant = useProviderConfigStore.getState().currentVariant;
        const sessionId = useSessionUIStore.getState().currentSessionId;
        const agentName = useAgentConfigStore.getState().currentAgentName;
        const providerId = useProviderConfigStore.getState().currentProviderId;
        const modelId = useProviderConfigStore.getState().currentModelId;

        if (sessionId && agentName && providerId && modelId) {
          useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, agentName, providerId, modelId, nextVariant);
        }

        return;
      }

      // Ctrl+] / Ctrl+[: Cycle through starred models (same gating as Shift+M)
      if (
        eventMatchesShortcut(e, combo('cycle_favorite_model_forward')) ||
        eventMatchesShortcut(e, combo('cycle_favorite_model_backward'))
      ) {
        const {
          activeMainTab,
          isSessionSwitcherOpen,
        } = useNavigationStore.getState();
        const { favoriteModels, addRecentModel } = useModelPreferencesStore.getState();
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isAboutDialogOpen,
        } = useDialogStore.getState();

        if (isSettingsDialogOpen) {
          return;
        }

        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isAboutDialogOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive || favoriteModels.length === 0) {
          return;
        }

        e.preventDefault();

        const { currentProviderId, currentModelId, setProvider, setModel } = useProviderConfigStore.getState();
        const len = favoriteModels.length;
        const currentIdx = favoriteModels.findIndex(
          (f) => f.providerID === currentProviderId && f.modelID === currentModelId,
        );
        const delta = eventMatchesShortcut(e, combo('cycle_favorite_model_forward')) ? 1 : -1;
        const next = favoriteModels[(currentIdx + delta + len) % len];

        setProvider(next.providerID);
        setModel(next.modelID);
        addRecentModel(next.providerID, next.modelID);
        return;
      }

      if (eventMatchesShortcut(e, combo('expand_input'))) {
        if (isMobile) {
          return;
        }
        e.preventDefault();
        toggleExpandedInput();
        return;
      }

      if (e.key === 'Escape') {
        const target = e.target as Element | null;
        const isInsideDialog = Boolean(target?.closest('[role="dialog"]'));
        const isSettingsMounted = Boolean(document.querySelector('[data-settings-view="true"]'));

        if (isInsideDialog || isSettingsMounted) {
          resetAbortPriming();
          return;
        }

        const {
          activeMainTab,
          isSessionSwitcherOpen,
        } = useNavigationStore.getState();
        const {
          isSettingsDialogOpen,
          isCommandPaletteOpen,
          isHelpDialogOpen,
          isAboutDialogOpen,
          isMultiRunLauncherOpen,
          isImagePreviewOpen,
        } = useDialogStore.getState();

        // If settings is open, close it
        if (isSettingsDialogOpen) {
          e.preventDefault();
          setSettingsDialogOpen(false);
          resetAbortPriming();
          return;
        }

        // Check if any overlay is open or not on chat tab - don't process abort
        const hasOverlay = isCommandPaletteOpen || isHelpDialogOpen || isSessionSwitcherOpen || isAboutDialogOpen || isMultiRunLauncherOpen || isImagePreviewOpen;
        const isChatActive = activeMainTab === 'chat';

        if (hasOverlay || !isChatActive) {
          resetAbortPriming();
          return;
        }

        // Double-ESC abort logic - only when on chat tab with no overlays
        const sessionId = currentSessionId;
        const canAbortNow = working.canAbort && Boolean(sessionId);
        if (!canAbortNow) {
          resetAbortPriming();
          return;
        }

        const now = Date.now();
        const primedUntil = abortPrimedUntilRef.current;

        if (primedUntil && now < primedUntil) {
          e.preventDefault();
          resetAbortPriming();
          void abortCurrentOperation(sessionId ?? '');
          return;
        }

        e.preventDefault();
        const expiresAt = armAbortPrompt(3000) ?? now + 3000;
        abortPrimedUntilRef.current = expiresAt;

        if (abortPrimedTimeoutRef.current) {
          clearTimeout(abortPrimedTimeoutRef.current);
        }

        const delay = Math.max(expiresAt - now, 0);
        abortPrimedTimeoutRef.current = setTimeout(() => {
          if (abortPrimedUntilRef.current && Date.now() >= abortPrimedUntilRef.current) {
            resetAbortPriming();
          }
        }, delay || 0);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    openNewSessionDraft,
    abortCurrentOperation,
    toggleCommandPalette,
    setQuickOpenOpen,
    toggleHelpDialog,
    toggleSidebar,
    toggleRightSidebar,
    setRightSidebarOpen,
    setRightSidebarTab,
    toggleBottomTerminal,
    setBottomTerminalExpanded,
    isMobile,
    setSessionSwitcherOpen,
    setActiveMainTab,
    setSettingsDialogOpen,
    setModelSelectorOpen,
    toggleExpandedInput,
    setThemeMode,
    working,
    armAbortPrompt,
    resetAbortPriming,
    currentSessionId,
    shortcutOverrides,
  ]);

  React.useEffect(() => {
    return () => {
      resetAbortPriming();
    };
  }, [resetAbortPriming]);
};
