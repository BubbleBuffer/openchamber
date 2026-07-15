import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';
import { useNavigationStore } from './useNavigationStore';
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

      openContextPanelTab: (directory, tab) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: upsertContextPanelTab(current, tab),
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      openContextDiff: (directory, filePath) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedFilePath = (filePath || '').trim();
        if (!normalizedDirectory || !normalizedFilePath) {
          return;
        }

        get().openContextPanelTab(normalizedDirectory, { mode: 'diff', targetPath: normalizedFilePath });
        get().setPendingDiffFile(normalizedFilePath);
      },

      openContextFile: (directory, filePath) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedFilePath = normalizeContextTargetPath(filePath);
        if (!normalizedDirectory || !normalizedFilePath) {
          return;
        }

        get().openContextPanelTab(normalizedDirectory, { mode: 'file', targetPath: normalizedFilePath });
        get().setPendingFileFocusPath(normalizedFilePath);
        get().setPendingFileNavigation(null);
      },

      openContextFileAtLine: (directory, filePath, line, column) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedFilePath = normalizeContextTargetPath(filePath);
        const normalizedLine = Number.isFinite(line) ? Math.max(1, Math.trunc(line)) : 1;
        const normalizedColumn = Number.isFinite(column) ? Math.max(1, Math.trunc(column as number)) : 1;
        if (!normalizedDirectory || !normalizedFilePath) {
          return;
        }

        get().openContextPanelTab(normalizedDirectory, { mode: 'file', targetPath: normalizedFilePath });
        get().setPendingFileFocusPath(null);
        get().setPendingFileNavigation({
          path: normalizedFilePath,
          line: normalizedLine,
          column: normalizedColumn,
        });
      },

      openContextOverview: (directory) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        get().openContextPanelTab(normalizedDirectory, { mode: 'context' });
      },

      openContextPlan: (directory) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        get().openContextPanelTab(normalizedDirectory, { mode: 'plan' });
      },

      setActiveContextPanelTab: (directory, tabID) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedTabID = (tabID || '').trim();
        if (!normalizedDirectory || !normalizedTabID) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          if (!current.tabs.some((tab) => tab.id === normalizedTabID)) {
            return state;
          }

          if (current.activeTabId === normalizedTabID && current.isOpen) {
            return state;
          }

          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: {
              ...current,
              isOpen: true,
              activeTabId: normalizedTabID,
              touchedAt: Date.now(),
              tabs: current.tabs.map((tab) => (tab.id === normalizedTabID
                ? { ...tab, touchedAt: Date.now() }
                : tab)),
            },
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      reorderContextPanelTabs: (directory, activeTabID, overTabID) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedActiveTabID = (activeTabID || '').trim();
        const normalizedOverTabID = (overTabID || '').trim();
        if (!normalizedDirectory || !normalizedActiveTabID || !normalizedOverTabID) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          if (!current.tabs.some((tab) => tab.id === normalizedActiveTabID) || !current.tabs.some((tab) => tab.id === normalizedOverTabID)) {
            return state;
          }

          const next = reorderContextPanelTabsHelper(current, normalizedActiveTabID, normalizedOverTabID);
          if (next.tabs === current.tabs) {
            return state;
          }

          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: next,
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      closeContextPanelTab: (directory, tabID) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        const normalizedTabID = (tabID || '').trim();
        if (!normalizedDirectory || !normalizedTabID) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          if (!current.tabs.some((tab) => tab.id === normalizedTabID)) {
            return state;
          }

          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: closeContextPanelTabHelper(current, normalizedTabID),
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      closeContextPanel: (directory) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          if (!prev || !prev.isOpen) {
            return state;
          }

          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: {
              ...touchContextPanelState(prev),
              isOpen: false,
            },
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      toggleContextPanelExpanded: (directory) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: {
              ...current,
              expanded: !current.expanded,
            },
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      setContextPanelWidth: (directory, width) => {
        const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
        if (!normalizedDirectory) {
          return;
        }

        set((state) => {
          const prev = state.contextPanelByDirectory[normalizedDirectory];
          const current = touchContextPanelState(prev);
          const byDirectory = {
            ...state.contextPanelByDirectory,
            [normalizedDirectory]: {
              ...current,
              width: clampContextPanelWidth(width),
            },
          };

          return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
        });
      },

      setPendingDiffFile: (filePath) => {
        set({ pendingDiffFile: filePath });
      },

      setPendingFileNavigation: (navigation) => {
        set({ pendingFileNavigation: navigation });
      },

      setPendingFileFocusPath: (path) => {
        set({ pendingFileFocusPath: path });
      },

      navigateToDiff: (filePath) => {
        const { mainTabGuard, setActiveMainTab } = useNavigationStore.getState();
        if (mainTabGuard && !mainTabGuard('diff')) {
          return;
        }
        set({ pendingDiffFile: filePath });
        setActiveMainTab('diff');
      },

      consumePendingDiffFile: () => {
        const { pendingDiffFile } = get();
        if (pendingDiffFile) {
          set({ pendingDiffFile: null });
        }
        return pendingDiffFile;
      },
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
