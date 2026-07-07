import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

type DiffPreferencesState = {
  diffLayoutPreference: 'dynamic' | 'inline' | 'side-by-side';
  diffFileLayout: Record<string, 'inline' | 'side-by-side'>;
  diffWrapLines: boolean;
  diffViewMode: 'single' | 'stacked';
  gitChangesViewMode: 'flat' | 'tree';
  setDiffLayoutPreference: (value: 'dynamic' | 'inline' | 'side-by-side') => void;
  setDiffWrapLines: (value: boolean) => void;
  setDiffViewMode: (value: 'single' | 'stacked') => void;
  setGitChangesViewMode: (value: 'flat' | 'tree') => void;
  setDiffFileLayout: (filePath: string, mode: 'inline' | 'side-by-side') => void;
};

export const useDiffPreferencesStore = create<DiffPreferencesState>()(
  persist(
    (set) => ({
      // ---- defaults ----
      diffLayoutPreference: 'inline',
      diffFileLayout: {},
      diffWrapLines: false,
      diffViewMode: 'stacked',
      gitChangesViewMode: 'flat',

      // ---- setters ----

      setDiffLayoutPreference: (value) => {
        set({ diffLayoutPreference: value });
      },

      setDiffWrapLines: (value) => {
        set({ diffWrapLines: value });
      },

      setDiffViewMode: (value) => {
        set({ diffViewMode: value });
      },

      setGitChangesViewMode: (value) => {
        set({ gitChangesViewMode: value });
      },

      setDiffFileLayout: (filePath, mode) => {
        set((state) => ({
          diffFileLayout: {
            ...state.diffFileLayout,
            [filePath]: mode,
          },
        }));
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
        // diffFileLayout is intentionally excluded — runtime-only field.
      }),
    },
  ),
);
