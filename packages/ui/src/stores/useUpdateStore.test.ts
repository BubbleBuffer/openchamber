import { describe, it, expect, beforeEach } from "bun:test";
import { useUpdateStore } from "./useUpdateStore";

const initialState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  info: null,
  progress: null,
  error: null,
  runtimeType: null,
  lastChecked: null,
  nextCheckInSec: null,
};

describe("useUpdateStore", () => {
  beforeEach(() => {
    useUpdateStore.setState(initialState, false);
  });

  it("dismiss clears available + downloaded + info", () => {
    useUpdateStore.setState({
      available: true,
      downloaded: true,
      info: { available: true } as never,
    });
    useUpdateStore.getState().dismiss();
    const s = useUpdateStore.getState();
    expect(s.available).toBe(false);
    expect(s.downloaded).toBe(false);
    expect(s.info).toBe(null);
  });

  it("reset returns to initial state", () => {
    useUpdateStore.setState({
      checking: true,
      error: "boom",
      runtimeType: "desktop",
      lastChecked: 12345,
    });
    useUpdateStore.getState().reset();
    const s = useUpdateStore.getState();
    expect(s.checking).toBe(false);
    expect(s.error).toBe(null);
    expect(s.runtimeType).toBe(null);
    expect(s.lastChecked).toBe(null);
  });
});
