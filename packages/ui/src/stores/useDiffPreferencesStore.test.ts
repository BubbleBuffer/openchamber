import { describe, it, expect, beforeEach } from "bun:test";
import { useDiffPreferencesStore } from "./useDiffPreferencesStore";

// ---------------------------------------------------------------------------
// Defaults — mirror the shape declared in useDiffPreferencesStore
// ---------------------------------------------------------------------------
const DEFAULTS = {
  diffLayoutPreference: "inline" as const,
  diffFileLayout: {} as Record<string, "inline" | "side-by-side">,
  diffWrapLines: false,
  diffViewMode: "stacked" as const,
  gitChangesViewMode: "flat" as const,
};

// ---------------------------------------------------------------------------
// Reset helper — replaces setState without notifying subscribers
// ---------------------------------------------------------------------------
function resetStore(): void {
  useDiffPreferencesStore.setState({ ...DEFAULTS }, false);
}

// ===========================================================================
// Store tests
// ===========================================================================
describe("useDiffPreferencesStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // 1. setDiffLayoutPreference
  // -------------------------------------------------------------------------
  describe("setDiffLayoutPreference", () => {
    it("updates diffLayoutPreference when called with a valid value", () => {
      useDiffPreferencesStore.getState().setDiffLayoutPreference("side-by-side");
      expect(useDiffPreferencesStore.getState().diffLayoutPreference).toBe("side-by-side");
    });

    it("can be set via setState partial form", () => {
      useDiffPreferencesStore.setState({ diffLayoutPreference: "dynamic" }, false);
      expect(useDiffPreferencesStore.getState().diffLayoutPreference).toBe("dynamic");
    });

    it("preserves other fields when called", () => {
      useDiffPreferencesStore.getState().setDiffLayoutPreference("side-by-side");
      const state = useDiffPreferencesStore.getState();
      expect(state.diffWrapLines).toBe(DEFAULTS.diffWrapLines);
      expect(state.diffViewMode).toBe(DEFAULTS.diffViewMode);
      expect(state.gitChangesViewMode).toBe(DEFAULTS.gitChangesViewMode);
    });
  });

  // -------------------------------------------------------------------------
  // 2. setDiffWrapLines
  // -------------------------------------------------------------------------
  describe("setDiffWrapLines", () => {
    it("updates diffWrapLines when called with true", () => {
      useDiffPreferencesStore.getState().setDiffWrapLines(true);
      expect(useDiffPreferencesStore.getState().diffWrapLines).toBe(true);
    });

    it("updates diffWrapLines when called with false", () => {
      // Toggle true first, then back to false
      useDiffPreferencesStore.getState().setDiffWrapLines(true);
      useDiffPreferencesStore.getState().setDiffWrapLines(false);
      expect(useDiffPreferencesStore.getState().diffWrapLines).toBe(false);
    });

    it("can be set via setState partial form", () => {
      useDiffPreferencesStore.setState({ diffWrapLines: true }, false);
      expect(useDiffPreferencesStore.getState().diffWrapLines).toBe(true);
    });

    it("preserves other fields when called", () => {
      useDiffPreferencesStore.getState().setDiffWrapLines(true);
      const state = useDiffPreferencesStore.getState();
      expect(state.diffLayoutPreference).toBe(DEFAULTS.diffLayoutPreference);
      expect(state.diffViewMode).toBe(DEFAULTS.diffViewMode);
      expect(state.gitChangesViewMode).toBe(DEFAULTS.gitChangesViewMode);
    });
  });

  // -------------------------------------------------------------------------
  // 3. setDiffViewMode
  // -------------------------------------------------------------------------
  describe("setDiffViewMode", () => {
    it("updates diffViewMode when called with 'single'", () => {
      useDiffPreferencesStore.getState().setDiffViewMode("single");
      expect(useDiffPreferencesStore.getState().diffViewMode).toBe("single");
    });

    it("updates diffViewMode when called with 'stacked'", () => {
      useDiffPreferencesStore.getState().setDiffViewMode("single");
      useDiffPreferencesStore.getState().setDiffViewMode("stacked");
      expect(useDiffPreferencesStore.getState().diffViewMode).toBe("stacked");
    });

    it("can be set via setState partial form", () => {
      useDiffPreferencesStore.setState({ diffViewMode: "single" }, false);
      expect(useDiffPreferencesStore.getState().diffViewMode).toBe("single");
    });

    it("preserves other fields when called", () => {
      useDiffPreferencesStore.getState().setDiffViewMode("single");
      const state = useDiffPreferencesStore.getState();
      expect(state.diffLayoutPreference).toBe(DEFAULTS.diffLayoutPreference);
      expect(state.diffWrapLines).toBe(DEFAULTS.diffWrapLines);
      expect(state.gitChangesViewMode).toBe(DEFAULTS.gitChangesViewMode);
    });
  });

  // -------------------------------------------------------------------------
  // 4. setGitChangesViewMode
  // -------------------------------------------------------------------------
  describe("setGitChangesViewMode", () => {
    it("updates gitChangesViewMode when called with 'tree'", () => {
      useDiffPreferencesStore.getState().setGitChangesViewMode("tree");
      expect(useDiffPreferencesStore.getState().gitChangesViewMode).toBe("tree");
    });

    it("updates gitChangesViewMode when called with 'flat'", () => {
      useDiffPreferencesStore.getState().setGitChangesViewMode("tree");
      useDiffPreferencesStore.getState().setGitChangesViewMode("flat");
      expect(useDiffPreferencesStore.getState().gitChangesViewMode).toBe("flat");
    });

    it("can be set via setState partial form", () => {
      useDiffPreferencesStore.setState({ gitChangesViewMode: "tree" }, false);
      expect(useDiffPreferencesStore.getState().gitChangesViewMode).toBe("tree");
    });

    it("preserves other fields when called", () => {
      useDiffPreferencesStore.getState().setGitChangesViewMode("tree");
      const state = useDiffPreferencesStore.getState();
      expect(state.diffLayoutPreference).toBe(DEFAULTS.diffLayoutPreference);
      expect(state.diffWrapLines).toBe(DEFAULTS.diffWrapLines);
      expect(state.diffViewMode).toBe(DEFAULTS.diffViewMode);
    });
  });

  // -------------------------------------------------------------------------
  // 5. setDiffFileLayout — merges per-file mode
  // -------------------------------------------------------------------------
  describe("setDiffFileLayout", () => {
    it("sets per-file diff mode for a single file", () => {
      useDiffPreferencesStore.getState().setDiffFileLayout("a.ts", "side-by-side");
      expect(useDiffPreferencesStore.getState().diffFileLayout).toEqual({
        "a.ts": "side-by-side",
      });
    });

    it("merges per-file mode without touching other files", () => {
      useDiffPreferencesStore.getState().setDiffFileLayout("a.ts", "side-by-side");
      useDiffPreferencesStore.getState().setDiffFileLayout("b.ts", "inline");
      expect(useDiffPreferencesStore.getState().diffFileLayout).toEqual({
        "a.ts": "side-by-side",
        "b.ts": "inline",
      });
    });

    it("can be set via setState partial form", () => {
      useDiffPreferencesStore.setState(
        { diffFileLayout: { "c.ts": "side-by-side" } },
        false,
      );
      expect(useDiffPreferencesStore.getState().diffFileLayout).toEqual({
        "c.ts": "side-by-side",
      });
    });

    it("preserves other fields when called", () => {
      useDiffPreferencesStore.getState().setDiffFileLayout("a.ts", "side-by-side");
      const state = useDiffPreferencesStore.getState();
      expect(state.diffLayoutPreference).toBe(DEFAULTS.diffLayoutPreference);
      expect(state.diffWrapLines).toBe(DEFAULTS.diffWrapLines);
      expect(state.diffViewMode).toBe(DEFAULTS.diffViewMode);
      expect(state.gitChangesViewMode).toBe(DEFAULTS.gitChangesViewMode);
    });
  });
});
