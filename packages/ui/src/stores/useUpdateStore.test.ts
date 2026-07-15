import { describe, it, expect, beforeEach } from "bun:test";
import { useUpdateStore } from "./useUpdateStore";

const initialState = {
  checking: false,
  available: false,
  info: null,
  error: null,
  lastChecked: null,
  nextCheckInSec: null,
};

describe("useUpdateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState(initialState, false);
  });

  it("dismiss clears available + info", () => {
    useUpdateStore.setState({
      available: true,
      info: { available: true } as never,
    });
    useUpdateStore.getState().dismiss();
    const s = useUpdateStore.getState();
    expect(s.available).toBe(false);
    expect(s.info).toBe(null);
  });

  it("does not expose desktop update installation state or actions", () => {
    const state = useUpdateStore.getState();

    expect(state).not.toHaveProperty("downloading");
    expect(state).not.toHaveProperty("downloaded");
    expect(state).not.toHaveProperty("downloadUpdate");
    expect(state).not.toHaveProperty("restartToUpdate");
  });

  it("reset returns to initial state", () => {
    useUpdateStore.setState({
      checking: true,
      error: "boom",
      lastChecked: 12345,
    });
    useUpdateStore.getState().reset();
    const s = useUpdateStore.getState();
    expect(s.checking).toBe(false);
    expect(s.error).toBe(null);
    expect(s.lastChecked).toBe(null);
  });

});
