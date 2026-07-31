import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

const LEFT_SIDEBAR_MIN_WIDTH = 300;
const RIGHT_SIDEBAR_MIN_WIDTH = 400;

type LayoutState = {
  isSidebarOpen: boolean;
  sidebarWidth: number;
  isRightSidebarOpen: boolean;
  rightSidebarWidth: number;
  rightSidebarTab: string;
  isBottomTerminalOpen: boolean;
  isBottomTerminalExpanded: boolean;
  bottomTerminalHeight: number;
  hasManuallyResizedBottomTerminal: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  setRightSidebarWidth: (width: number) => void;
  setRightSidebarTab: (tab: string) => void;
  toggleBottomTerminal: () => void;
  setBottomTerminalOpen: (open: boolean) => void;
  setBottomTerminalExpanded: (expanded: boolean) => void;
  setBottomTerminalHeight: (height: number) => void;
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      isSidebarOpen: true,
      sidebarWidth: LEFT_SIDEBAR_MIN_WIDTH,
      isRightSidebarOpen: false,
      rightSidebarWidth: RIGHT_SIDEBAR_MIN_WIDTH,
      rightSidebarTab: 'git',
      isBottomTerminalOpen: false,
      isBottomTerminalExpanded: false,
      bottomTerminalHeight: 300,
      hasManuallyResizedBottomTerminal: false,

      toggleSidebar: () => {
        set((state) => {
          const newOpen = !state.isSidebarOpen;

          if (newOpen && state.sidebarWidth === LEFT_SIDEBAR_MIN_WIDTH) {
            return {
              isSidebarOpen: newOpen,
            };
          }
          return { isSidebarOpen: newOpen };
        });
      },

      setSidebarOpen: (open) => {
        set((state) => {
          if (state.isSidebarOpen === open) {
            if (!open) {
              return state;
            }
            if (state.sidebarWidth !== LEFT_SIDEBAR_MIN_WIDTH) {
              return {
                isSidebarOpen: open,
                sidebarWidth: LEFT_SIDEBAR_MIN_WIDTH,
              };
            }
            return state;
          }
          if (open && state.sidebarWidth === LEFT_SIDEBAR_MIN_WIDTH) {
            return {
              isSidebarOpen: open,
            };
          }
          return { isSidebarOpen: open };
        });
      },

      setSidebarWidth: (width) => {
        set({ sidebarWidth: width });
      },

      toggleRightSidebar: () => {
        set((state) => {
          const newOpen = !state.isRightSidebarOpen;

          if (newOpen && state.rightSidebarWidth === RIGHT_SIDEBAR_MIN_WIDTH) {
            return {
              isRightSidebarOpen: newOpen,
            };
          }
          return { isRightSidebarOpen: newOpen };
        });
      },

      setRightSidebarOpen: (open) => {
        set((state) => {
          if (state.isRightSidebarOpen === open) {
            if (!open) {
              return state;
            }
            if (state.rightSidebarWidth !== RIGHT_SIDEBAR_MIN_WIDTH) {
              return {
                isRightSidebarOpen: open,
                rightSidebarWidth: RIGHT_SIDEBAR_MIN_WIDTH,
              };
            }
            return state;
          }
          if (open && state.rightSidebarWidth === RIGHT_SIDEBAR_MIN_WIDTH) {
            return {
              isRightSidebarOpen: open,
            };
          }
          return { isRightSidebarOpen: open };
        });
      },

      setRightSidebarWidth: (width) => {
        set({ rightSidebarWidth: width });
      },

      setRightSidebarTab: (tab) => {
        set({ rightSidebarTab: tab });
      },

      toggleBottomTerminal: () => {
        set((state) => {
          const newOpen = !state.isBottomTerminalOpen;

          if (newOpen && typeof window !== 'undefined') {
            const proportionalHeight = Math.floor(window.innerHeight * 0.32);
            return {
              isBottomTerminalOpen: newOpen,
              bottomTerminalHeight: proportionalHeight,
              hasManuallyResizedBottomTerminal: false,
            };
          }

          return { isBottomTerminalOpen: newOpen };
        });
      },

      setBottomTerminalOpen: (open) => {
        set((state) => {
          if (state.isBottomTerminalOpen === open) {
            if (!open) {
              return state;
            }
            if (!state.hasManuallyResizedBottomTerminal && typeof window !== 'undefined') {
              const proportionalHeight = Math.floor(window.innerHeight * 0.32);
              if (state.bottomTerminalHeight === proportionalHeight && state.hasManuallyResizedBottomTerminal === false) {
                return state;
              }
              return {
                isBottomTerminalOpen: open,
                bottomTerminalHeight: proportionalHeight,
                hasManuallyResizedBottomTerminal: false,
              };
            }
            return state;
          }

          if (open && typeof window !== 'undefined') {
            const proportionalHeight = Math.floor(window.innerHeight * 0.32);
            return {
              isBottomTerminalOpen: open,
              bottomTerminalHeight: proportionalHeight,
              hasManuallyResizedBottomTerminal: false,
            };
          }

          return { isBottomTerminalOpen: open };
        });
      },

      setBottomTerminalExpanded: (expanded) => {
        set({ isBottomTerminalExpanded: expanded });
      },

      setBottomTerminalHeight: (height) => {
        set({ bottomTerminalHeight: height, hasManuallyResizedBottomTerminal: true });
      },
    }),
    {
      name: 'layout-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        sidebarWidth: state.sidebarWidth,
        isRightSidebarOpen: state.isRightSidebarOpen,
        rightSidebarWidth: state.rightSidebarWidth,
        rightSidebarTab: state.rightSidebarTab,
        isBottomTerminalOpen: state.isBottomTerminalOpen,
        isBottomTerminalExpanded: state.isBottomTerminalExpanded,
        bottomTerminalHeight: state.bottomTerminalHeight,
        // hasManuallyResizedBottomTerminal is intentionally excluded — runtime-only.
      }),
    },
  ),
);
