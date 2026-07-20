// packages/web/src/ui/stores/useDialogStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export interface DialogStore {
  isQuickOpenOpen: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  isAboutDialogOpen: boolean;
  isOpenCodeStatusDialogOpen: boolean;
  openCodeStatusText: string;
  isSessionCreateDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isModelSelectorOpen: boolean;
  isTimelineDialogOpen: boolean;
  isImagePreviewOpen: boolean;
  isMultiRunLauncherOpen: boolean;
  multiRunLauncherPrefillPrompt: string;

  setQuickOpenOpen: (open: boolean) => void;
  toggleQuickOpen: () => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleHelpDialog: () => void;
  setHelpDialogOpen: (open: boolean) => void;
  setAboutDialogOpen: (open: boolean) => void;
  setOpenCodeStatusDialogOpen: (open: boolean) => void;
  setOpenCodeStatusText: (text: string) => void;
  setSessionCreateDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setModelSelectorOpen: (open: boolean) => void;
  setTimelineDialogOpen: (open: boolean) => void;
  setImagePreviewOpen: (open: boolean) => void;
  setMultiRunLauncherOpen: (open: boolean) => void;
  openMultiRunLauncher: () => void;
  openMultiRunLauncherWithPrompt: (prompt: string) => void;
}

export const useDialogStore = create<DialogStore>()(
  devtools(
    (set) => ({
      isQuickOpenOpen: false,
      isCommandPaletteOpen: false,
      isHelpDialogOpen: false,
      isAboutDialogOpen: false,
      isOpenCodeStatusDialogOpen: false,
      openCodeStatusText: '',
      isSessionCreateDialogOpen: false,
      isSettingsDialogOpen: false,
      isModelSelectorOpen: false,
      isTimelineDialogOpen: false,
      isImagePreviewOpen: false,
      isMultiRunLauncherOpen: false,
      multiRunLauncherPrefillPrompt: '',

      setQuickOpenOpen: (open) => set({ isQuickOpenOpen: open }),
      toggleQuickOpen: () => set((s) => ({ isQuickOpenOpen: !s.isQuickOpenOpen })),
      toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
      setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
      toggleHelpDialog: () => set((s) => ({ isHelpDialogOpen: !s.isHelpDialogOpen })),
      setHelpDialogOpen: (open) => set({ isHelpDialogOpen: open }),
      setAboutDialogOpen: (open) => set({ isAboutDialogOpen: open }),
      setOpenCodeStatusDialogOpen: (open) => set({ isOpenCodeStatusDialogOpen: open }),
      setOpenCodeStatusText: (text) => set({ openCodeStatusText: text }),
      setSessionCreateDialogOpen: (open) => set({ isSessionCreateDialogOpen: open }),
      setSettingsDialogOpen: (open) => set(() => {
        if (!open) return { isSettingsDialogOpen: false };
        return { isSettingsDialogOpen: true };
      }),
      setModelSelectorOpen: (open) => set({ isModelSelectorOpen: open }),
      setTimelineDialogOpen: (open) => set({ isTimelineDialogOpen: open }),
      setImagePreviewOpen: (open) => set({ isImagePreviewOpen: open }),
      setMultiRunLauncherOpen: (open) => set((s) => ({
        isMultiRunLauncherOpen: open,
        multiRunLauncherPrefillPrompt: open ? s.multiRunLauncherPrefillPrompt : '',
      })),
      openMultiRunLauncher: () => set({
        isMultiRunLauncherOpen: true,
        multiRunLauncherPrefillPrompt: '',
      }),
      openMultiRunLauncherWithPrompt: (prompt) => set({
        isMultiRunLauncherOpen: true,
        multiRunLauncherPrefillPrompt: prompt,
      }),
    }),
    { name: "dialog-store" },
  ),
);
