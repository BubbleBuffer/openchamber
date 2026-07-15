import { describe, it, expect, beforeEach } from "bun:test";
import { useDialogStore } from "./useDialogStore";

const initialState = {
  isQuickOpenOpen: false,
  isCommandPaletteOpen: false,
  isHelpDialogOpen: false,
  isAboutDialogOpen: false,
  isOpenCodeStatusDialogOpen: false,
  openCodeStatusText: "",
  isSessionCreateDialogOpen: false,
  isSettingsDialogOpen: false,
  isModelSelectorOpen: false,
  isTimelineDialogOpen: false,
  isImagePreviewOpen: false,
  isMultiRunLauncherOpen: false,
  multiRunLauncherPrefillPrompt: "",
};

describe("useDialogStore", () => {
  beforeEach(() => {
    useDialogStore.setState(initialState, false);
  });

  describe("initial state", () => {
    it("all boolean dialogs default to false", () => {
      const state = useDialogStore.getState();
      expect(state.isQuickOpenOpen).toBe(false);
      expect(state.isCommandPaletteOpen).toBe(false);
      expect(state.isHelpDialogOpen).toBe(false);
      expect(state.isAboutDialogOpen).toBe(false);
      expect(state.isOpenCodeStatusDialogOpen).toBe(false);
      expect(state.isSessionCreateDialogOpen).toBe(false);
      expect(state.isSettingsDialogOpen).toBe(false);
      expect(state.isModelSelectorOpen).toBe(false);
      expect(state.isTimelineDialogOpen).toBe(false);
      expect(state.isImagePreviewOpen).toBe(false);
      expect(state.isMultiRunLauncherOpen).toBe(false);
      expect(state.openCodeStatusText).toBe("");
      expect(state.multiRunLauncherPrefillPrompt).toBe("");
    });
  });

  describe("set/toggle pairs", () => {
    it("setQuickOpenOpen sets the flag", () => {
      useDialogStore.getState().setQuickOpenOpen(true);
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(true);
    });
    it("toggleQuickOpen flips the flag", () => {
      useDialogStore.getState().toggleQuickOpen();
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(true);
      useDialogStore.getState().toggleQuickOpen();
      expect(useDialogStore.getState().isQuickOpenOpen).toBe(false);
    });
    it("setCommandPaletteOpen sets, toggleCommandPalette flips", () => {
      useDialogStore.getState().setCommandPaletteOpen(true);
      expect(useDialogStore.getState().isCommandPaletteOpen).toBe(true);
      useDialogStore.getState().toggleCommandPalette();
      expect(useDialogStore.getState().isCommandPaletteOpen).toBe(false);
    });
    it("setHelpDialogOpen sets, toggleHelpDialog flips", () => {
      useDialogStore.getState().setHelpDialogOpen(true);
      expect(useDialogStore.getState().isHelpDialogOpen).toBe(true);
      useDialogStore.getState().toggleHelpDialog();
      expect(useDialogStore.getState().isHelpDialogOpen).toBe(false);
    });
    it("setAboutDialogOpen sets the flag", () => {
      useDialogStore.getState().setAboutDialogOpen(true);
      expect(useDialogStore.getState().isAboutDialogOpen).toBe(true);
    });
    it("setOpenCodeStatusDialogOpen + setOpenCodeStatusText", () => {
      useDialogStore.getState().setOpenCodeStatusDialogOpen(true);
      useDialogStore.getState().setOpenCodeStatusText("hello");
      const s = useDialogStore.getState();
      expect(s.isOpenCodeStatusDialogOpen).toBe(true);
      expect(s.openCodeStatusText).toBe("hello");
    });
    it("setSessionCreateDialogOpen sets the flag", () => {
      useDialogStore.getState().setSessionCreateDialogOpen(true);
      expect(useDialogStore.getState().isSessionCreateDialogOpen).toBe(true);
    });
    it("setSettingsDialogOpen sets and unsets the flag", () => {
      useDialogStore.getState().setSettingsDialogOpen(true);
      expect(useDialogStore.getState().isSettingsDialogOpen).toBe(true);
      useDialogStore.getState().setSettingsDialogOpen(false);
      expect(useDialogStore.getState().isSettingsDialogOpen).toBe(false);
    });
    it("setModelSelectorOpen sets the flag", () => {
      useDialogStore.getState().setModelSelectorOpen(true);
      expect(useDialogStore.getState().isModelSelectorOpen).toBe(true);
    });
    it("setTimelineDialogOpen sets the flag", () => {
      useDialogStore.getState().setTimelineDialogOpen(true);
      expect(useDialogStore.getState().isTimelineDialogOpen).toBe(true);
    });
    it("setImagePreviewOpen sets the flag", () => {
      useDialogStore.getState().setImagePreviewOpen(true);
      expect(useDialogStore.getState().isImagePreviewOpen).toBe(true);
    });
    it("setMultiRunLauncherOpen(true) preserves prefill", () => {
      useDialogStore.getState().setMultiRunLauncherOpen(true);
      expect(useDialogStore.getState().isMultiRunLauncherOpen).toBe(true);
      expect(useDialogStore.getState().multiRunLauncherPrefillPrompt).toBe("");
    });
    it("setMultiRunLauncherOpen(false) resets prefill", () => {
      useDialogStore.getState().setMultiRunLauncherOpen(true);
      useDialogStore.setState({ multiRunLauncherPrefillPrompt: "draft" });
      useDialogStore.getState().setMultiRunLauncherOpen(false);
      const s = useDialogStore.getState();
      expect(s.isMultiRunLauncherOpen).toBe(false);
      expect(s.multiRunLauncherPrefillPrompt).toBe("");
    });
    it("openMultiRunLauncher opens the launcher", () => {
      useDialogStore.getState().openMultiRunLauncher();
      expect(useDialogStore.getState().isMultiRunLauncherOpen).toBe(true);
    });
    it("openMultiRunLauncherWithPrompt opens with prefill", () => {
      useDialogStore.getState().openMultiRunLauncherWithPrompt("do thing");
      const s = useDialogStore.getState();
      expect(s.isMultiRunLauncherOpen).toBe(true);
      expect(s.multiRunLauncherPrefillPrompt).toBe("do thing");
    });
  });
});
