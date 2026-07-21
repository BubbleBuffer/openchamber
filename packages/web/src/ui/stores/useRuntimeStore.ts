import { create } from 'zustand';

type RuntimeState = {
  isMobile: boolean;
  isKeyboardOpen: boolean;
  setIsMobile: (mobile: boolean) => void;
  setKeyboardOpen: (open: boolean) => void;
};

export const useRuntimeStore = create<RuntimeState>((set) => ({
  isMobile: false,
  isKeyboardOpen: false,
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  setKeyboardOpen: (open) => set((state) => state.isKeyboardOpen === open ? state : { isKeyboardOpen: open }),
}));
