import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type SessionRetentionAction = 'archive' | 'delete';

type SessionRetentionState = {
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays: number;
  sessionRetentionAction: SessionRetentionAction;
  autoDeleteLastRunAt: number | null;
  setAutoDeleteEnabled: (value: boolean) => void;
  setAutoDeleteAfterDays: (days: number) => void;
  setSessionRetentionAction: (value: SessionRetentionAction) => void;
  setAutoDeleteLastRunAt: (timestamp: number | null) => void;
};

export const useSessionRetentionStore = create<SessionRetentionState>()(
  persist(
    (set) => ({
      autoDeleteEnabled: false,
      autoDeleteAfterDays: 30,
      sessionRetentionAction: 'archive',
      autoDeleteLastRunAt: null,
      setAutoDeleteEnabled: (value) => {
        set({ autoDeleteEnabled: value });
      },
      setAutoDeleteAfterDays: (days) => {
        const clampedDays = Math.max(1, Math.min(365, days));
        set({ autoDeleteAfterDays: clampedDays });
      },
      setSessionRetentionAction: (value) => {
        set({ sessionRetentionAction: value });
      },
      setAutoDeleteLastRunAt: (timestamp) => {
        set({ autoDeleteLastRunAt: timestamp });
      },
    }),
    {
      name: 'session-retention-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        autoDeleteEnabled: state.autoDeleteEnabled,
        autoDeleteAfterDays: state.autoDeleteAfterDays,
        sessionRetentionAction: state.sessionRetentionAction,
        autoDeleteLastRunAt: state.autoDeleteLastRunAt,
      }),
    },
  ),
);
