import { describe, expect, it } from "vitest";

import { createUpstreamSseReader } from "./upstream-reader.js";
import type { SseEventEnvelope } from "./types.js";

interface TestEvent {
  block: string;
  envelope: SseEventEnvelope;
  payload: unknown;
  eventId: string | null;
  directory: string | null;
}

// Mock response helper
function createSseResponse({
  blocks = [],
  signal,
  holdOpen = false,
}: {
  blocks?: string[];
  signal?: AbortSignal;
  holdOpen?: boolean;
}) {
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

            if (!holdOpen) {
              return { value: undefined, done: true };
            }

            return new Promise((_resolve, reject) => {
              const onAbort = () => {
                signal!.removeEventListener("abort", onAbort);
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
              };
              signal!.addEventListener("abort", onAbort, { once: true });
            });
          },
        };
      },
    },
  };
}

describe("createUpstreamSseReader", () => {
  it("emits parsed events and tracks the latest event id", async () => {
    const events: TestEvent[] = [];
    let reader: ReturnType<typeof createUpstreamSseReader>;

    reader = createUpstreamSseReader({
      buildUrl: () => new URL("http://127.0.0.1:4096/global/event"),
      reconnectDelayMs: 0,
      fetchImpl: async (
        _url: string,
        options: { signal?: AbortSignal }
      ) =>
        createSseResponse({
          signal: options.signal,
          blocks: [
            'id: evt-1\r\ndata: {"type":"server.connected","properties":{"directory":"/tmp/project"}}\r\n\r\n',
          ],
        }),
      onEvent(event: TestEvent) {
        events.push(event);
        reader!.stop();
      },
    });

    await reader.start();

    expect(events).toHaveLength(1);
    expect(events[0]?.eventId).toBe("evt-1");
    expect(events[0]?.directory).toBe("/tmp/project");
    expect(events[0]?.payload).toEqual({
      type: "server.connected",
      properties: {
        directory: "/tmp/project",
      },
    });
    expect(reader.getLastEventId()).toBe("evt-1");
  });

  it("reconnects a stalled stream with Last-Event-ID", async () => {
    const fetchLastEventIds: (string | null)[] = [];
    const events: (string | null)[] = [];
    let attempt = 0;
    let reader: ReturnType<typeof createUpstreamSseReader>;

    reader = createUpstreamSseReader({
      buildUrl: () => new URL("http://127.0.0.1:4096/global/event"),
      stallTimeoutMs: 10,
      reconnectDelayMs: 0,
      fetchImpl: async (
        _url: string,
        options: { headers?: Record<string, string>; signal?: AbortSignal }
      ) => {
        fetchLastEventIds.push(options.headers?.["Last-Event-ID"] ?? null);
        attempt += 1;

        if (attempt === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n',
            ],
          });
        }

        return createSseResponse({
          signal: options.signal,
          blocks: [
            'id: evt-2\ndata: {"type":"session.updated","properties":{}}\n\n',
          ],
        });
      },
      onEvent(event: TestEvent) {
        events.push(event.eventId);
        if (event.eventId === "evt-2") {
          reader!.stop();
        }
      },
    });

    await reader.start();

    expect(events).toEqual(["evt-1", "evt-2"]);
    expect(fetchLastEventIds.slice(0, 2)).toEqual([null, "evt-1"]);
    expect(reader.getLastEventId()).toBe("evt-2");
  });

  it("reports unavailable upstream responses and continues reconnecting until stopped", async () => {
    const errors: { type: string; status?: number }[] = [];
    let attempt = 0;
    let reader: ReturnType<typeof createUpstreamSseReader>;

    reader = createUpstreamSseReader({
      buildUrl: () => new URL("http://127.0.0.1:4096/global/event"),
      reconnectDelayMs: 0,
      fetchImpl: async (
        _url: string,
        options: { signal?: AbortSignal }
      ) => {
        attempt += 1;
        if (attempt === 1) {
          return { ok: false, status: 503, body: null };
        }

        return createSseResponse({
          signal: options.signal,
          blocks: [
            'id: evt-1\ndata: {"type":"server.connected","properties":{}}\n\n',
          ],
        });
      },
      onError(error: { type: string; status?: number }) {
        errors.push(error);
      },
      onEvent() {
        reader!.stop();
      },
    });

    await reader.start();

    expect(errors).toEqual([
      expect.objectContaining({
        type: "upstream_unavailable",
        status: 503,
      }),
    ]);
    expect(attempt).toBe(2);
  });
});