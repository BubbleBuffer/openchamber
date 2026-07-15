import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

import { getSafeStorage } from './utils/safeStorage';
import type { ShortcutCombo } from '@/lib/shortcuts';

export type { MainTab, MainTabGuard } from './useNavigationStore';

export type RightSidebarTab = 'git' | 'files' | 'context';
export type { ChatRenderMode, ActivityRenderMode, MermaidRenderingMode, UserMessageRenderingMode } from './useChatRenderingStore';
export type { SessionRetentionAction } from './useSessionRetentionStore';
export type TimeFormatPreference = 'auto' | '12h' | '24h';
export type WeekStartPreference = 'auto' | 'sunday' | 'monday';

// Re-export context panel types for backward compat
export type { ContextPanelMode, ContextPanelTab, ContextPanelTabDescriptor, ContextPanelDirectoryState, PendingFileNavigation } from './contextPanelHelpers';

export type EventStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'paused'
  | 'offline'
  | 'error';

interface UIStore {

  theme: 'light' | 'dark' | 'system';

  // Settings IA (new shell)
  settingsPage: string;
  settingsProjectsSelectedId: string | null;
  eventStreamStatus: EventStreamStatus;
  showTerminalQuickKeysOnDesktop: boolean;
  persistChatDraft: boolean;
  inputSpellcheckEnabled: boolean;
  timeFormatPreference: TimeFormatPreference;
  weekStartPreference: WeekStartPreference;
  showMobileSessionStatusBar: boolean;
  isMobileSessionStatusBarCollapsed: boolean;
  isExpandedInput: boolean;
  reportUsage: boolean;
  shortcutOverrides: Record<string, ShortcutCombo>;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setSettingsPage: (slug: string) => void;
  setSettingsProjectsSelectedId: (projectId: string | null) => void;
  setEventStreamStatus: (status: EventStreamStatus) => void;
  setShowTerminalQuickKeysOnDesktop: (value: boolean) => void;
  setPersistChatDraft: (value: boolean) => void;
  setInputSpellcheckEnabled: (value: boolean) => void;
  setTimeFormatPreference: (value: TimeFormatPreference) => void;
  setWeekStartPreference: (value: WeekStartPreference) => void;
  setShowMobileSessionStatusBar: (value: boolean) => void;
  setIsMobileSessionStatusBarCollapsed: (value: boolean) => void;
  toggleExpandedInput: () => void;
  setExpandedInput: (value: boolean) => void;
  setReportUsage: (value: boolean) => void;
  setShortcutOverride: (actionId: string, combo: ShortcutCombo) => void;
  clearShortcutOverride: (actionId: string) => void;
  resetAllShortcutOverrides: () => void;
}


export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set) => ({

        theme: 'system',
        settingsPage: 'home',
        settingsProjectsSelectedId: null,
        eventStreamStatus: 'idle',
        showTerminalQuickKeysOnDesktop: false,
        persistChatDraft: true,
        inputSpellcheckEnabled: false,
        timeFormatPreference: 'auto',
        weekStartPreference: 'auto',
        showMobileSessionStatusBar: true,
        isMobileSessionStatusBarCollapsed: false,
        isExpandedInput: false,
        reportUsage: true,
        shortcutOverrides: {},

        setTheme: (theme) => {
          set({ theme });
        },

        setSettingsPage: (slug) => {
          set({ settingsPage: slug });
        },

        setSettingsProjectsSelectedId: (projectId) => {
          set({ settingsProjectsSelectedId: projectId });
        },

        setEventStreamStatus: (status) => {
          set({
            eventStreamStatus: status,
          });
        },

        setShowTerminalQuickKeysOnDesktop: (value) => {
          set({ showTerminalQuickKeysOnDesktop: value });
        },

        setPersistChatDraft: (value) => {
          set({ persistChatDraft: value });
        },
        setInputSpellcheckEnabled: (value) => {
          set({ inputSpellcheckEnabled: value });
        },
        setTimeFormatPreference: (value) => {
          set({ timeFormatPreference: value });
        },

        setWeekStartPreference: (value) => {
          set({ weekStartPreference: value });
        },
        setShowMobileSessionStatusBar: (value) => {
          set({ showMobileSessionStatusBar: value });
        },
        setIsMobileSessionStatusBarCollapsed: (value) => {
          set({ isMobileSessionStatusBarCollapsed: value });
        },
        setReportUsage: (value) => {
          set({ reportUsage: value });
        },

        setShortcutOverride: (actionId, combo) => {
          set((state) => ({
            shortcutOverrides: {
              ...state.shortcutOverrides,
              [actionId]: combo,
            },
          }));
        },

        clearShortcutOverride: (actionId) => {
          set((state) => {
            const rest = { ...state.shortcutOverrides };
            delete rest[actionId];
            return { shortcutOverrides: rest };
          });
        },

        resetAllShortcutOverrides: () => {
          set({ shortcutOverrides: {} });
        },

        toggleExpandedInput: () => {
          set((state) => ({ isExpandedInput: !state.isExpandedInput }));
        },

        setExpandedInput: (value) => {
          set({ isExpandedInput: value });
        },
      }),
      {
        name: 'ui-store',
        storage: createJSONStorage(() => getSafeStorage()),
        version: 10,
        migrate: (persistedState, version) => {
          if (!persistedState || typeof persistedState !== 'object') {
            return persistedState;
          }
          const state = persistedState as Record<string, unknown>;

          // v2 -> v3: remove obsolete memory-limit fields. messageLimit was
          // removed in a later cleanup, so we just drop the legacy keys.
          if (version < 3) {
            delete state.memoryLimitHistorical;
            delete state.memoryLimitViewport;
            delete state.memoryLimitActiveSession;
          }

          if (
            typeof state.rightSidebarTab !== 'string'
            || (state.rightSidebarTab !== 'git' && state.rightSidebarTab !== 'files' && state.rightSidebarTab !== 'context')
          ) {
            state.rightSidebarTab = 'git';
          }

          if (version < 5) {
            if (!state.shortcutOverrides || typeof state.shortcutOverrides !== 'object') {
              state.shortcutOverrides = {};
            } else {
              const overrides = state.shortcutOverrides as Record<string, unknown>;
              const cleaned: Record<string, string> = {};
              for (const [key, value] of Object.entries(overrides)) {
                if (typeof key === 'string' && typeof value === 'string') {
                  cleaned[key] = value;
                }
              }
              state.shortcutOverrides = cleaned;
            }
          }

          // v8 -> v9: drop dead fields removed in Phase 4 audit so they don't
          // linger as inert properties on existing users' persisted state.
          if (version < 9) {
            delete state.hasManuallyResizedLeftSidebar;
            delete state.hasManuallyResizedRightSidebar;
            delete state.sidebarOpenBeforeFullscreenTab;
            delete state.sidebarSection;
            delete state.settingsHasOpenedOnce;
            delete state.eventStreamHint;
            delete state.messageLimit;
            delete state.recentAgents;
            delete state.viewPagerPage;
          }

          return state;
        },
        partialize: (state) => ({
          theme: state.theme,
          settingsPage: state.settingsPage,
          settingsProjectsSelectedId: state.settingsProjectsSelectedId,
          showTerminalQuickKeysOnDesktop: state.showTerminalQuickKeysOnDesktop,
          persistChatDraft: state.persistChatDraft,
          inputSpellcheckEnabled: state.inputSpellcheckEnabled,
          timeFormatPreference: state.timeFormatPreference,
          weekStartPreference: state.weekStartPreference,
          showMobileSessionStatusBar: state.showMobileSessionStatusBar,
          isMobileSessionStatusBarCollapsed: state.isMobileSessionStatusBarCollapsed,
          shortcutOverrides: state.shortcutOverrides,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
