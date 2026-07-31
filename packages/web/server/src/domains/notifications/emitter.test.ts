import { describe, expect, it, vi } from "vitest";

import { createNotificationEmitterRuntime } from "./emitter.js";

describe("notification emitter", () => {
  it("broadcasts browser notifications without desktop stdout metadata or writes", () => {
    const stdoutWrite = vi.fn();
    const processLike = { stdout: { write: stdoutWrite } };
    const globalBroadcast = vi.fn();
    const clients = new Set<unknown>();
    const runtime = createNotificationEmitterRuntime({
      process: processLike,
      getUiNotificationClients: () => clients,
      getBroadcastGlobalUiEvent: () => globalBroadcast,
    } as never);
    const payload = {
      title: "Agent is ready",
      body: "The task is complete",
      kind: "ready",
    };

    runtime.broadcastUiNotification(payload);

    expect(globalBroadcast).toHaveBeenCalledWith({
      type: "openchamber:notification",
      properties: payload,
    });
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
