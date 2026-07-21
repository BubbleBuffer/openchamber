import { describe, it, expect, beforeEach } from "bun:test";
import { useVisualPreferencesStore } from "./useVisualPreferencesStore";

// ---------------------------------------------------------------------------
// Defaults — mirror the shape declared in useVisualPreferencesStore
// ---------------------------------------------------------------------------
const DEFAULTS = {
  fontSize: 100,
  terminalFontSize: 13,
  padding: 100,
  cornerRadius: 18,
  inputBarOffset: 0,
};

// ---------------------------------------------------------------------------
// Reset helper — replaces setState without notifying subscribers
// ---------------------------------------------------------------------------
function resetStore(): void {
  useVisualPreferencesStore.setState({ ...DEFAULTS }, false);
}

// ===========================================================================
// Store tests
// ===========================================================================
describe("useVisualPreferencesStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // 0. Defaults
  // -------------------------------------------------------------------------
  it("has correct default values", () => {
    const state = useVisualPreferencesStore.getState();
    expect(state.fontSize).toBe(100);
    expect(state.terminalFontSize).toBe(13);
    expect(state.padding).toBe(100);
    expect(state.cornerRadius).toBe(18);
    expect(state.inputBarOffset).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 1. setFontSize — clamped [50, 200], Math.round
  // -------------------------------------------------------------------------
  describe("setFontSize", () => {
    it("setFontSize(500) clamps to 200", () => {
      useVisualPreferencesStore.getState().setFontSize(500);
      expect(useVisualPreferencesStore.getState().fontSize).toBe(200);
    });

    it("setFontSize(10) clamps to 50", () => {
      useVisualPreferencesStore.getState().setFontSize(10);
      expect(useVisualPreferencesStore.getState().fontSize).toBe(50);
    });

    it("setFontSize(87.4) rounds to 87", () => {
      useVisualPreferencesStore.getState().setFontSize(87.4);
      expect(useVisualPreferencesStore.getState().fontSize).toBe(87);
    });

    it("can be set via setState partial form", () => {
      useVisualPreferencesStore.setState({ fontSize: 150 }, false);
      expect(useVisualPreferencesStore.getState().fontSize).toBe(150);
    });

    it("preserves other fields when called", () => {
      useVisualPreferencesStore.getState().setFontSize(75);
      const state = useVisualPreferencesStore.getState();
      expect(state.terminalFontSize).toBe(DEFAULTS.terminalFontSize);
      expect(state.padding).toBe(DEFAULTS.padding);
      expect(state.cornerRadius).toBe(DEFAULTS.cornerRadius);
      expect(state.inputBarOffset).toBe(DEFAULTS.inputBarOffset);
    });
  });

  // -------------------------------------------------------------------------
  // 2. setTerminalFontSize — clamped [9, 52], Math.round
  // -------------------------------------------------------------------------
  describe("setTerminalFontSize", () => {
    it("setTerminalFontSize(100) clamps to 52", () => {
      useVisualPreferencesStore.getState().setTerminalFontSize(100);
      expect(useVisualPreferencesStore.getState().terminalFontSize).toBe(52);
    });

    it("setTerminalFontSize(5) clamps to 9", () => {
      useVisualPreferencesStore.getState().setTerminalFontSize(5);
      expect(useVisualPreferencesStore.getState().terminalFontSize).toBe(9);
    });

    it("setTerminalFontSize(13.7) rounds to 14", () => {
      useVisualPreferencesStore.getState().setTerminalFontSize(13.7);
      expect(useVisualPreferencesStore.getState().terminalFontSize).toBe(14);
    });

    it("can be set via setState partial form", () => {
      useVisualPreferencesStore.setState({ terminalFontSize: 30 }, false);
      expect(useVisualPreferencesStore.getState().terminalFontSize).toBe(30);
    });

    it("preserves other fields when called", () => {
      useVisualPreferencesStore.getState().setTerminalFontSize(20);
      const state = useVisualPreferencesStore.getState();
      expect(state.fontSize).toBe(DEFAULTS.fontSize);
      expect(state.padding).toBe(DEFAULTS.padding);
      expect(state.cornerRadius).toBe(DEFAULTS.cornerRadius);
      expect(state.inputBarOffset).toBe(DEFAULTS.inputBarOffset);
    });
  });

  // -------------------------------------------------------------------------
  // 3. setPadding — clamped [50, 200]
  // -------------------------------------------------------------------------
  describe("setPadding", () => {
    it("setPadding(500) clamps to 200", () => {
      useVisualPreferencesStore.getState().setPadding(500);
      expect(useVisualPreferencesStore.getState().padding).toBe(200);
    });

    it("setPadding(10) clamps to 50", () => {
      useVisualPreferencesStore.getState().setPadding(10);
      expect(useVisualPreferencesStore.getState().padding).toBe(50);
    });

    it("can be set via setState partial form", () => {
      useVisualPreferencesStore.setState({ padding: 75 }, false);
      expect(useVisualPreferencesStore.getState().padding).toBe(75);
    });

    it("preserves other fields when called", () => {
      useVisualPreferencesStore.getState().setPadding(125);
      const state = useVisualPreferencesStore.getState();
      expect(state.fontSize).toBe(DEFAULTS.fontSize);
      expect(state.terminalFontSize).toBe(DEFAULTS.terminalFontSize);
      expect(state.cornerRadius).toBe(DEFAULTS.cornerRadius);
      expect(state.inputBarOffset).toBe(DEFAULTS.inputBarOffset);
    });
  });

  // -------------------------------------------------------------------------
  // 4. setCornerRadius — direct set (no clamp)
  // -------------------------------------------------------------------------
  describe("setCornerRadius", () => {
    it("setCornerRadius(value) sets directly (no clamp)", () => {
      useVisualPreferencesStore.getState().setCornerRadius(99);
      expect(useVisualPreferencesStore.getState().cornerRadius).toBe(99);
    });

    it("can be set via setState partial form", () => {
      useVisualPreferencesStore.setState({ cornerRadius: 8 }, false);
      expect(useVisualPreferencesStore.getState().cornerRadius).toBe(8);
    });

    it("preserves other fields when called", () => {
      useVisualPreferencesStore.getState().setCornerRadius(24);
      const state = useVisualPreferencesStore.getState();
      expect(state.fontSize).toBe(DEFAULTS.fontSize);
      expect(state.terminalFontSize).toBe(DEFAULTS.terminalFontSize);
      expect(state.padding).toBe(DEFAULTS.padding);
      expect(state.inputBarOffset).toBe(DEFAULTS.inputBarOffset);
    });
  });

  // -------------------------------------------------------------------------
  // 5. setInputBarOffset — direct set (no clamp)
  // -------------------------------------------------------------------------
  describe("setInputBarOffset", () => {
    it("setInputBarOffset(value) sets directly (no clamp)", () => {
      useVisualPreferencesStore.getState().setInputBarOffset(-50);
      expect(useVisualPreferencesStore.getState().inputBarOffset).toBe(-50);
    });

    it("can be set via setState partial form", () => {
      useVisualPreferencesStore.setState({ inputBarOffset: 20 }, false);
      expect(useVisualPreferencesStore.getState().inputBarOffset).toBe(20);
    });

    it("preserves other fields when called", () => {
      useVisualPreferencesStore.getState().setInputBarOffset(10);
      const state = useVisualPreferencesStore.getState();
      expect(state.fontSize).toBe(DEFAULTS.fontSize);
      expect(state.terminalFontSize).toBe(DEFAULTS.terminalFontSize);
      expect(state.padding).toBe(DEFAULTS.padding);
      expect(state.cornerRadius).toBe(DEFAULTS.cornerRadius);
    });
  });
});
