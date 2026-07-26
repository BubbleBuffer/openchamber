import { describe, expect, it, vi } from "vitest";

import { createOpenCodeWatcherRuntime } from "./watcher.js";

describe("OpenCode watcher", () => {
  it("does not install a watcher when stop races a pending start", async () => {
    let releasePort!: () => void;
    const waitForOpenCodePort = vi.fn(
      () => new Promise<void>((resolve) => {
        releasePort = resolve;
      }),
    );
    const unsubscribeEvent = vi.fn();
    const unsubscribeStatus = vi.fn();
    const globalEventHub = {
      subscribeEvent: vi.fn(() => unsubscribeEvent),
      subscribeStatus: vi.fn(() => unsubscribeStatus),
      start: vi.fn(),
    };
    const watcher = createOpenCodeWatcherRuntime({
      waitForOpenCodePort,
      getOpenCodeRuntime: vi.fn(() => ({
        getUrl: () => "http://127.0.0.1:4096/global/event",
        getAuthHeaders: () => ({}),
      })),
      onPayload: vi.fn(),
      globalEventHub,
    });

    const pendingStart = watcher.start();
    watcher.stop();
    releasePort();
    await pendingStart;

    expect(globalEventHub.subscribeEvent).not.toHaveBeenCalled();
    expect(globalEventHub.subscribeStatus).not.toHaveBeenCalled();
    expect(globalEventHub.start).not.toHaveBeenCalled();
    expect(unsubscribeEvent).not.toHaveBeenCalled();
    expect(unsubscribeStatus).not.toHaveBeenCalled();
  });
});
