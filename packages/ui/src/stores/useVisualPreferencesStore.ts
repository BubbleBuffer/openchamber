import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

type VisualPreferencesState = {
  fontSize: number;
  terminalFontSize: number;
  padding: number;
  cornerRadius: number;
  inputBarOffset: number;

  setFontSize: (size: number) => void;
  setTerminalFontSize: (size: number) => void;
  setPadding: (size: number) => void;
  setCornerRadius: (radius: number) => void;
  setInputBarOffset: (offset: number) => void;
};

export const useVisualPreferencesStore = create<VisualPreferencesState>()(
  persist(
    (set) => ({
      // ---- defaults ----
      fontSize: 100,
      terminalFontSize: 13,
      padding: 100,
      cornerRadius: 18,
      inputBarOffset: 0,

      // ---- setters ----

      setFontSize: (size) => {
        const clampedSize = Math.min(200, Math.max(50, Math.round(size)));
        set({ fontSize: clampedSize });
      },

      setTerminalFontSize: (size) => {
        const clamped = Math.min(52, Math.max(9, Math.round(size)));
        set({ terminalFontSize: clamped });
      },

      setPadding: (size) => {
        const clampedSize = Math.min(200, Math.max(50, Math.round(size)));
        set({ padding: clampedSize });
      },

      setCornerRadius: (radius) => {
        set({ cornerRadius: radius });
      },

      setInputBarOffset: (offset) => {
        set({ inputBarOffset: offset });
      },
    }),
    {
      name: 'visual-preferences-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        fontSize: state.fontSize,
        terminalFontSize: state.terminalFontSize,
        padding: state.padding,
        cornerRadius: state.cornerRadius,
        // inputBarOffset is intentionally excluded — runtime-only field.
      }),
    },
  ),
);
