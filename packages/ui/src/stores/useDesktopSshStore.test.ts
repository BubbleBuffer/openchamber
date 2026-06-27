import { describe, it, expect, beforeEach } from "bun:test";
import { useDesktopSshStore } from "./useDesktopSshStore";

describe("useDesktopSshStore", () => {
  beforeEach(() => {
    useDesktopSshStore.setState(
      {
        instances: [],
        statusesById: {},
        importCandidates: [],
        isLoading: false,
        isSaving: false,
        isImportsLoading: false,
        initialized: false,
        listenerReady: false,
        error: null,
      },
      false,
    );
  });

  it("clearError sets error to null", () => {
    useDesktopSshStore.setState({ error: "boom" });
    useDesktopSshStore.getState().clearError();
    expect(useDesktopSshStore.getState().error).toBe(null);
  });

  it("getStatus returns null for unknown id, returns entry for known id", () => {
    expect(useDesktopSshStore.getState().getStatus("nope")).toBe(null);
    useDesktopSshStore.setState({
      statusesById: { known: { id: "known", status: "connected" } as never },
    });
    expect(useDesktopSshStore.getState().getStatus("known")).toEqual({
      id: "known",
      status: "connected",
    });
  });
});
