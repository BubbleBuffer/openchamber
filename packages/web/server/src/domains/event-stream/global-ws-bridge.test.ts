import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const capturedFrames: unknown[] = [];
const capturedEvents: unknown[] = [];

vi.mock("./protocol.js", () => ({
  sendMessageStreamWsFrame: (_socket: unknown, payload: unknown) => {
    capturedFrames.push(payload);
    return true;
  },
  sendMessageStreamWsEvent: (_socket: unknown, payload: unknown) => {
    capturedEvents.push(payload);
    return true;
  },
  parseSseEventEnvelope: () => null,
}));

import { createGlobalMessageStreamWsBridge } from "./global-ws-bridge.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubSocket(): any {
  return {
    readyState: 1,
    send: vi.fn(),
    ping: vi.fn(),
    pong: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    close: vi.fn(),
    removeAllListeners: vi.fn(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubHub(): any {
  const statusSubscribers: Array<(s: unknown) => void> = [];
  return {
    isConnected: () => true,
    hasConnected: () => true,
    subscribeEvent: () => () => {},
    subscribeStatus: (cb: (s: unknown) => void) => {
      statusSubscribers.push(cb);
      return () => {
        const idx = statusSubscribers.indexOf(cb);
        if (idx >= 0) statusSubscribers.splice(idx, 1);
      };
    },
    replayAfter: () => [],
    emitSynthetic: () => {},
    start: () => {},
    stop: () => {},
    _fireStatus: (s: unknown) => {
      for (const cb of statusSubscribers) cb(s);
    },
  };
}

describe("createGlobalMessageStreamWsBridge — stall/resume dispatch + heartbeat removal", () => {
  beforeEach(() => {
    capturedFrames.length = 0;
    capturedEvents.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createBridge(hub: ReturnType<typeof stubHub>) {
    return createGlobalMessageStreamWsBridge({
      globalHub: hub,
      ownsGlobalHub: false,
      wsClients: new Set(),
      processForwardedEventPayload: undefined,
      triggerHealthCheck: undefined,
      heartbeatIntervalMs: 1000,
    });
  }

  it("sends data_stalled frame to ready clients when hub emits data_stalled", () => {
    const hub = stubHub();
    const bridge = createBridge(hub);
    const socket = stubSocket();

    bridge.accept(socket, { requestedLastEventId: "" });

    // Clear the "ready" frame sent during accept
    capturedFrames.length = 0;

    hub._fireStatus({ type: "data_stalled", duration: 250 });

    expect(capturedFrames).toContainEqual({
      type: "data_stalled",
      duration: 250,
    });
  });

  it("sends data_resumed frame with lastEventId when hub emits data_resumed", () => {
    const hub = stubHub();
    const bridge = createBridge(hub);
    const socket = stubSocket();

    bridge.accept(socket, { requestedLastEventId: "" });

    // Clear the "ready" frame sent during accept
    capturedFrames.length = 0;

    hub._fireStatus({ type: "data_resumed", lastEventId: "evt-1" });

    expect(capturedFrames).toContainEqual({
      type: "data_resumed",
      lastEventId: "evt-1",
    });
  });

  it("does NOT send openchamber:heartbeat data frames to clients", () => {
    const hub = stubHub();
    const bridge = createBridge(hub);
    const socket = stubSocket();

    bridge.accept(socket, { requestedLastEventId: "" });

    // Clear any frames/events sent during accept
    capturedFrames.length = 0;
    capturedEvents.length = 0;

    // Advance timers past several heartbeat intervals
    vi.advanceTimersByTime(5000);

    const heartbeatFrames = capturedFrames.filter(
      (f: unknown) => (f as Record<string, unknown>).type === "openchamber:heartbeat",
    );
    const heartbeatEvents = capturedEvents.filter(
      (e: unknown) => (e as Record<string, unknown>).type === "openchamber:heartbeat",
    );

    expect(heartbeatFrames).toHaveLength(0);
    expect(heartbeatEvents).toHaveLength(0);
  });
});
