import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { useContextStore } = await import("./contextStore");

describe("contextStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useContextStore.setState(useContextStore.getInitialState(), false);
  });

  it("saveSessionModelSelection + getSessionModelSelection roundtrips", () => {
    useContextStore
      .getState()
      .saveSessionModelSelection("sess-1", "anthropic", "claude-sonnet-4");
    expect(
      useContextStore.getState().getSessionModelSelection("sess-1"),
    ).toEqual({ providerId: "anthropic", modelId: "claude-sonnet-4" });
  });

  it("saveSessionAgentSelection + getSessionAgentSelection roundtrips", () => {
    useContextStore.getState().saveSessionAgentSelection("sess-1", "build");
    expect(useContextStore.getState().getSessionAgentSelection("sess-1")).toBe(
      "build",
    );
  });

  it("hasHydrated flag is observable in state", () => {
    expect(typeof useContextStore.getState().hasHydrated).toBe("boolean");
  });
});
