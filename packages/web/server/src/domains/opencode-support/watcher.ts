import { createUpstreamSseReader } from "../event-stream/upstream-reader.js";
import type {
  OpenCodeWatcherRuntime,
  OpenCodeWatcherDeps,
} from "./types.js";

const unknownMessage = (err: unknown): string | undefined => {
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    if (obj.error && typeof obj.error === "object") {
      const nested = obj.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
    if (typeof obj.message === "string") return obj.message;
  }
  return undefined;
};

export const createOpenCodeWatcherRuntime = (
  deps: OpenCodeWatcherDeps,
): OpenCodeWatcherRuntime => {
  const {
    waitForOpenCodePort,
    getOpenCodeRuntime: _getOpenCodeRuntime,
    onPayload,
    fetchImpl = fetch,
    upstreamStallTimeoutMs,
    upstreamReconnectDelayMs = 1000,
    globalEventHub = null,
  } = deps;

  let abortController: AbortController | null = null;
  let reader: ReturnType<typeof createUpstreamSseReader> | null = null;
  let unsubscribeEvent: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;

  const unwrapGlobalEventPayload = (eventData: unknown) => {
    if (!eventData || typeof eventData !== "object") {
      return null;
    }

    const record = eventData as Record<string, unknown>;

    if (record.payload && typeof record.payload === "object") {
      return record.payload;
    }

    return eventData;
  };

  const start = async () => {
    if (abortController) {
      return;
    }

    await waitForOpenCodePort();

    abortController = new AbortController();
    const signal = abortController.signal;

    if (globalEventHub) {
      unsubscribeEvent = globalEventHub.subscribeEvent((event) => {
        const payload = unwrapGlobalEventPayload(event.payload);
        if (!payload || typeof payload !== "object") {
          return;
        }
        onPayload(payload as Record<string, unknown>);
      });
      unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
        if (signal.aborted) {
          return;
        }
        if (status.type === "connect") {
          console.log("[PushWatcher] connected");
          return;
        }
        if (status.type === "error" || status.type === "initial-error") {
          console.warn(
            "[PushWatcher] disconnected",
            unknownMessage(status.error) ?? status.error,
          );
        }
      });
      globalEventHub.start();
      return;
    }

    reader = createUpstreamSseReader({
      signal,
      buildUrl: () => new URL(_getOpenCodeRuntime().getUrl("/global/event", "")),
      getHeaders: () => _getOpenCodeRuntime().getAuthHeaders(),
      fetchImpl,
      stallTimeoutMs: upstreamStallTimeoutMs,
      reconnectDelayMs: upstreamReconnectDelayMs,
      onConnect() {
        console.log("[PushWatcher] connected");
      },
      onEvent(event) {
        const payload = unwrapGlobalEventPayload(event.payload);
        if (!payload || typeof payload !== "object") {
          return;
        }
        onPayload(payload as Record<string, unknown>);
      },
      onError(error) {
        if (signal.aborted) {
          return;
        }
        console.warn(
          "[PushWatcher] disconnected",
          unknownMessage(error) ?? error,
        );
      },
    });

    void reader.start();
  };

  const stop = () => {
    if (!abortController) {
      return;
    }
    try {
      abortController.abort();
      reader?.stop();
      unsubscribeEvent?.();
      unsubscribeStatus?.();
    } catch {
      // best-effort cleanup
    }
    reader = null;
    unsubscribeEvent = null;
    unsubscribeStatus = null;
    abortController = null;
  };

  return {
    start,
    stop,
  };
};
