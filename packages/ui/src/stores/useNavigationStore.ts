import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type MainTab = 'chat' | 'plan' | 'files' | 'git' | 'terminal' | 'diff' | 'settings';
export type MainTabGuard = ((tab: MainTab) => boolean) | null;

type NavigationState = {
  activeMainTab: MainTab;
  mainTabGuard: MainTabGuard;
  isSessionSwitcherOpen: boolean;
  setActiveMainTab: (tab: MainTab) => void;
  setMainTabGuard: (guard: MainTabGuard) => void;
  setSessionSwitcherOpen: (open: boolean) => void;
};

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      activeMainTab: 'chat',
      mainTabGuard: null,
      isSessionSwitcherOpen: false,

      setActiveMainTab: (tab) => {
        const guard = get().mainTabGuard;
        if (guard && !guard(tab)) {
          return;
        }
        set({ activeMainTab: tab });
      },

      setMainTabGuard: (guard) => {
        if (get().mainTabGuard === guard) {
          return;
        }
        set({ mainTabGuard: guard });
      },

      setSessionSwitcherOpen: (open) => {
        set({ isSessionSwitcherOpen: open });
      },
    }),
    {
      name: 'navigation-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        activeMainTab: state.activeMainTab,
        isSessionSwitcherOpen: state.isSessionSwitcherOpen,
      }),
    },
  ),
);
