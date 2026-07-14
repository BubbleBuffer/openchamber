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

  it("does not check for updates through a VS Code runtime", async () => {
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    let requestCount = 0;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        __OPENCHAMBER_RUNTIME_APIS__: {
          runtime: { isVSCode: true, platform: "vscode" },
        },
      },
    });
    globalThis.fetch = (async () => {
      requestCount += 1;
      throw new Error("VS Code update request should not be made");
    }) as unknown as typeof fetch;

    try {
      const suggestedCheckIn = await useUpdateStore.getState().checkForUpdates();

      expect(suggestedCheckIn).toBe(null);
      expect(useUpdateStore.getState().runtimeType).toBe(null);
      expect(requestCount).toBe(0);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousWindow === undefined) {
        delete (globalThis as { window?: typeof window }).window;
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: previousWindow,
        });
      }
    }
  });
});
