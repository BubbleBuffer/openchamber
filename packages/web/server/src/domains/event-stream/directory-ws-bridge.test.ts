import { describe, expect, it, vi } from "vitest";

import { acceptDirectoryMessageStreamWsConnection } from "./directory-ws-bridge.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createSocket(): any {
  const listeners = new Map<string, () => void>();
  return {
    readyState: 1,
    send: vi.fn(),
    ping: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, listener: () => void) => {
      listeners.set(event, listener);
    }),
    emit(event: string) {
      listeners.get(event)?.();
    },
  };
}

function createSseResponse(blocks: string[], signal: AbortSignal) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index < blocks.length) {
              return { value: encoder.encode(blocks[index++]), done: false };
            }

            return new Promise((_resolve, reject) => {
              const onAbort = () => {
                signal.removeEventListener("abort", onAbort);
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
              };
              signal.addEventListener("abort", onAbort, { once: true });
            });
          },
        };
      },
    },
  };
}

async function waitFor(expectation: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      expectation();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  expectation();
}

describe("acceptDirectoryMessageStreamWsConnection", () => {
  it("uses the authoritative global stream and forwards only the requested directory", async () => {
    const socket = createSocket();
    let upstreamSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (url: string, options: { signal: AbortSignal }) =>
      {
        upstreamSignal = options.signal;
        return createSseResponse(
          [
            'id: matching\ndata: {"directory":"/projects/a","payload":{"type":"session.updated"}}\n\n',
            'id: other\ndata: {"directory":"/projects/b","payload":{"type":"session.updated"}}\n\n',
            'id: global\ndata: {"payload":{"type":"server.connected"}}\n\n',
          ],
          options.signal
        );
      }
    );

    acceptDirectoryMessageStreamWsConnection({
      socket,
      requestedLastEventId: "",
      requestedDirectory: "/projects/a",
      openCodeRuntime: {
        getUrl: vi.fn((path: string) => `http://opencode.test${path}`),
        getAuthHeaders: () => ({}),
      },
      processForwardedEventPayload: vi.fn(),
      wsClients: new Set(),
      heartbeatIntervalMs: 60_000,
      upstreamStallTimeoutMs: 60_000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    await waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledWith("http://opencode.test/global/event", expect.any(Object));
    expect(socket.send.mock.calls.map(([frame]: [string]) => JSON.parse(frame))).toEqual([
      { type: "ready", scope: "directory" },
      {
        type: "event",
        eventId: "matching",
        directory: "/projects/a",
        payload: { type: "session.updated" },
      },
    ]);

    expect(() => socket.emit("close")).not.toThrow();
    expect(upstreamSignal?.aborted).toBe(true);
  });

  it("keeps a directory-less request unscoped, including directory-less global events", async () => {
    const socket = createSocket();
    const fetchImpl = vi.fn(async (url: string, options: { signal: AbortSignal }) =>
      createSseResponse(
        [
          'id: scoped\ndata: {"directory":"/projects/b","payload":{"type":"session.updated"}}\n\n',
          'id: global\ndata: {"payload":{"type":"server.connected"}}\n\n',
        ],
        options.signal
      )
    );

    acceptDirectoryMessageStreamWsConnection({
      socket,
      requestedLastEventId: "",
      requestedDirectory: "",
      openCodeRuntime: {
        getUrl: vi.fn((path: string) => `http://opencode.test${path}`),
        getAuthHeaders: () => ({}),
      },
      processForwardedEventPayload: vi.fn(),
      wsClients: new Set(),
      heartbeatIntervalMs: 60_000,
      upstreamStallTimeoutMs: 60_000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    await waitFor(() => expect(socket.send).toHaveBeenCalledTimes(3));

    expect(fetchImpl).toHaveBeenCalledWith("http://opencode.test/global/event", expect.any(Object));
    expect(socket.send.mock.calls.map(([frame]: [string]) => JSON.parse(frame))).toEqual([
      { type: "ready", scope: "directory" },
      {
        type: "event",
        eventId: "scoped",
        directory: "/projects/b",
        payload: { type: "session.updated" },
      },
      {
        type: "event",
        eventId: "global",
        directory: "global",
        payload: { type: "server.connected" },
      },
    ]);

    socket.emit("close");
  });
});
