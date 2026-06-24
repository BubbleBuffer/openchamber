import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HubStatus } from "./types.js";

interface CapturedDeps {
  onStall?: (info: { duration: number }) => void;
  onResume?: (info: { lastEventId: string }) => void;
}

const capturedDeps: CapturedDeps = {};

vi.mock("./upstream-reader.js", () => ({
  createUpstreamSseReader: (deps: {
    onStall?: (info: { duration: number }) => void;
    onResume?: (info: { lastEventId: string }) => void;
  }) => {
    capturedDeps.onStall = deps.onStall;
    capturedDeps.onResume = deps.onResume;
    return {
      start: async () => {},
      stop: () => {},
      getLastEventId: () => "test-event-id",
    };
  },
}));

import { createGlobalMessageStreamHub } from "./global-hub.js";

describe("createGlobalMessageStreamHub — stall/resume wiring", () => {
  beforeEach(() => {
    capturedDeps.onStall = undefined;
    capturedDeps.onResume = undefined;
  });

  it("emits data_stalled status when upstream fires onStall", () => {
    const statuses: HubStatus[] = [];
    const hub = createGlobalMessageStreamHub({
      getOpenCodeRuntime: () => ({
        getUrl: () => new URL("http://localhost/global/event"),
        getAuthHeaders: () => ({}),
      }),
      upstreamStallTimeoutMs: 100,
    });
    hub.subscribeStatus((s: HubStatus) => statuses.push(s));
    hub.start();

    capturedDeps.onStall?.({ duration: 250 });

    expect(statuses).toContainEqual({
      type: "data_stalled",
      duration: 250,
    });
  });

  it("emits data_resumed status with lastEventId when upstream fires onResume", () => {
    const statuses: HubStatus[] = [];
    const hub = createGlobalMessageStreamHub({
      getOpenCodeRuntime: () => ({
        getUrl: () => new URL("http://localhost/global/event"),
        getAuthHeaders: () => ({}),
      }),
    });
    hub.subscribeStatus((s: HubStatus) => statuses.push(s));
    hub.start();

    capturedDeps.onResume?.({ lastEventId: "evt-42" });

    expect(statuses).toContainEqual({
      type: "data_resumed",
      lastEventId: "evt-42",
    });
  });
});
