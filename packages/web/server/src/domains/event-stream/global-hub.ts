import type { GlobalHub, GlobalHubDeps, NormalizedEvent } from "./types.js";
import { createUpstreamSseReader } from "./upstream-reader.js";

export { MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT } from "./types.js";

export function createGlobalMessageStreamHub({
  getOpenCodeRuntime,
  fetchImpl = fetch,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
  replayLimit,
}: GlobalHubDeps): GlobalHub {
  const eventSubscribers = new Set<(event: NormalizedEvent) => void>();
  const statusSubscribers = new Set<(status: import("./types.js").HubStatus) => void>();
  const replay: NormalizedEvent[] = [];

   
  let controller: AbortController | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reader: any = null;
  let connected = false;
  let everConnected = false;
  let buildUrlFailed = false;

  const notifyStatus = (status: import("./types.js").HubStatus) => {
    for (const subscriber of Array.from(statusSubscribers)) {
      subscriber(status);
    }
  };

  const normalizeEvent = (event: { envelope: { eventId: string | null; directory: string | null; payload: unknown }; payload: unknown }): NormalizedEvent => {
    const directory =
      typeof event.envelope?.directory === "string" && event.envelope.directory.length > 0
        ? event.envelope.directory
        : "global";
    const eventId =
      typeof event.envelope?.eventId === "string" && event.envelope.eventId.length > 0
        ? event.envelope.eventId
        : undefined;
    return {
      envelope: event.envelope,
      payload: event.payload,
      directory,
      eventId,
    };
  };

  const start = () => {
    if (reader) {
      return;
    }

    controller = new AbortController();
    reader = createUpstreamSseReader({
      signal: controller.signal,
      stallTimeoutMs: upstreamStallTimeoutMs,
      reconnectDelayMs: upstreamReconnectDelayMs,
      fetchImpl,
      buildUrl: () => {
        buildUrlFailed = false;
        try {
          return new URL(getOpenCodeRuntime().getUrl("/global/event", ""));
        } catch {
          buildUrlFailed = true;
          throw new Error("OpenCode service unavailable");
        }
      },
      getHeaders: () => getOpenCodeRuntime().getAuthHeaders(),
      onConnect() {
        connected = true;
        const wasReady = everConnected;
        everConnected = true;
        notifyStatus({ type: "connect", wasReady });
      },
      onDisconnect({ reason }) {
        connected = false;
        notifyStatus({ type: "disconnect", reason });
      },
      onEvent(event) {
        const normalized = normalizeEvent(event as { envelope: { eventId: string | null; directory: string | null; payload: unknown }; payload: unknown });
        if (normalized.eventId) {
          replay.push(normalized);
          if (replay.length > (replayLimit ?? 512)) {
            replay.splice(0, replay.length - (replayLimit ?? 512));
          }
        }

        for (const subscriber of Array.from(eventSubscribers)) {
          subscriber(normalized);
        }
      },
      onStall({ duration }) {
        notifyStatus({ type: "data_stalled", duration });
      },
      onResume({ lastEventId }) {
        notifyStatus({ type: "data_resumed", lastEventId });
      },
      onError(error) {
        if (controller?.signal.aborted) {
          return;
        }

        notifyStatus({
          type: everConnected ? "error" : "initial-error",
          error,
          buildUrlFailed,
        });
      },
    });

    void reader.start();
  };

  const stop = () => {
    connected = false;
    reader?.stop();
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    reader = null;
    controller = null;
    everConnected = false;
    buildUrlFailed = false;
  };

  return {
    start,
    stop,
    isConnected() {
      return connected;
    },
    hasConnected() {
      return everConnected;
    },
    subscribeEvent(subscriber) {
      eventSubscribers.add(subscriber);
      return () => {
        eventSubscribers.delete(subscriber);
      };
    },
    subscribeStatus(subscriber) {
      statusSubscribers.add(subscriber);
      return () => {
        statusSubscribers.delete(subscriber);
      };
    },
    replayAfter(eventId) {
      if (!eventId) {
        return [];
      }

      const index = replay.findIndex((entry) => entry.eventId === eventId);
      return index === -1 ? [] : replay.slice(index + 1);
    },
    emitSynthetic(syntheticPayload, options = {}) {
      const directory =
        typeof options?.directory === "string" && options.directory.length > 0
          ? options.directory
          : "global";
      const eventId =
        typeof options?.eventId === "string" && options.eventId.length > 0
          ? options.eventId
          : `synthetic-${Date.now()}`;
      const normalized: NormalizedEvent = {
        envelope: { eventId, directory, payload: syntheticPayload },
        payload: syntheticPayload,
        directory,
        eventId,
      };
      for (const subscriber of Array.from(eventSubscribers)) {
        subscriber(normalized);
      }
    },
  };
}