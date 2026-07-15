import { describe, it, expect, beforeEach } from "bun:test";
import { useFeatureFlagsStore } from "./useFeatureFlagsStore";

describe("useFeatureFlagsStore", () => {
  beforeEach(() => {
    useFeatureFlagsStore.setState({ planModeEnabled: false }, false);
  });

  it("planModeEnabled defaults to false", () => {
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(false);
  });

  it("setPlanModeEnabled updates the flag", () => {
    useFeatureFlagsStore.getState().setPlanModeEnabled(true);
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(true);
    useFeatureFlagsStore.getState().setPlanModeEnabled(false);
    expect(useFeatureFlagsStore.getState().planModeEnabled).toBe(false);
  });
});
