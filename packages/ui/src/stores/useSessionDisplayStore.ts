import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SessionDisplayMode = 'default' | 'minimal';

type SessionDisplayStore = {
  displayMode: SessionDisplayMode;
  setDisplayMode: (mode: SessionDisplayMode) => void;
};

export const useSessionDisplayStore = create<SessionDisplayStore>()(
  persist(
    (set) => ({
      displayMode: 'default',
      setDisplayMode: (mode) => set({ displayMode: mode }),
    }),
    {
      name: 'session-display-mode',
      // RC-11: Bump version + add migrate when partialize fields change.
      version: 1,
    },
  ),
);
