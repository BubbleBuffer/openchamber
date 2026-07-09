import { describe, it, expect, beforeEach } from "bun:test";
import type { DesktopSshInstanceStatus } from "@/lib/desktop/desktopSsh";
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
    const status: DesktopSshInstanceStatus = {
      id: "known",
      phase: "ready",
      startedByUs: true,
      retryAttempt: 0,
      requiresUserAction: false,
      updatedAtMs: 1,
    };
    useDesktopSshStore.setState({
      statusesById: { known: status },
    });
    expect(useDesktopSshStore.getState().getStatus("known")).toEqual(status);
  });
});
