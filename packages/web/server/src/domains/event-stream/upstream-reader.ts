import { parseSseEventEnvelope } from "./protocol.js";
import {
  DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
  type SseEventEnvelope,
  type UpstreamSseReader,
  type UpstreamSseReaderDeps,
} from "./types.js";

function waitForReconnectDelay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, Math.max(0, ms));
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

export function createUpstreamSseReader({
  buildUrl,
  getHeaders = () => ({}),
  fetchImpl = fetch,
  parseBlock = parseSseEventEnvelope,
  initialLastEventId = "",
  signal,
  stallTimeoutMs = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
  reconnectDelayMs = DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  onEvent,
  onConnect,
  onDisconnect,
  onError,
  onStall,
  onResume,
}: UpstreamSseReaderDeps): UpstreamSseReader {
  let running: Promise<void> | null = null;
  let stopped = false;
  let activeController: AbortController | null = null;
  let lastEventId = typeof initialLastEventId === "string" ? initialLastEventId : "";

  const stop = () => {
    stopped = true;
    if (activeController && !activeController.signal.aborted) {
      activeController.abort();
    }
  };

  signal?.addEventListener("abort", stop, { once: true });

  const start = () => {
    if (running) {
      return running;
    }

    stopped = false;
    running = (async () => {
      while (!stopped && !signal?.aborted) {
        const controller = new AbortController();
        activeController = controller;
        const abortActive = () => controller.abort();
        signal?.addEventListener("abort", abortActive, { once: true });

        let abortReason: string | null = null;
        let wasStalled = false;
        let stallStartTime = 0;
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const clearStallTimer = () => {
          if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
          }
        };
        const resetStallTimer = () => {
          clearStallTimer();
          if (stallTimeoutMs <= 0) {
            return;
          }

          stallStartTime = Date.now();
          stallTimer = setTimeout(() => {
            abortReason = "upstream_stalled";
            wasStalled = true;
            const duration = Date.now() - stallStartTime;
            controller.abort();
            onStall?.({ duration });
          }, stallTimeoutMs);
        };

        try {
          const url = buildUrl();
          const headers: Record<string, string> = {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...getHeaders(),
          };
          if (lastEventId) {
            headers["Last-Event-ID"] = lastEventId;
          }

          const response = await fetchImpl(url.toString(), {
            headers,
            signal: controller.signal,
          });

          if (!response?.ok || !response.body) {
            onError?.({
              type: "upstream_unavailable",
              status: response?.status ?? 0,
              response,
            });
            await waitForReconnectDelay(reconnectDelayMs, signal);
            continue;
          }

          onConnect?.({ response, lastEventId });

          if (wasStalled) {
            wasStalled = false;
            onResume?.({ lastEventId });
          }

          const decoder = new TextDecoder();
          const reader = response.body.getReader();
          let buffer = "";

          resetStallTimer();

          while (!stopped && !signal?.aborted) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }

            resetStallTimer();
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

            let separatorIndex = buffer.indexOf("\n\n");
            while (separatorIndex !== -1 && !stopped && !signal?.aborted) {
              const block = buffer.slice(0, separatorIndex);
              buffer = buffer.slice(separatorIndex + 2);
              const envelope = parseBlock(block);
              if (envelope?.payload) {
                if (
                  typeof envelope.eventId === "string" &&
                  envelope.eventId.length > 0
                ) {
                  lastEventId = envelope.eventId;
                }
                onEvent?.({
                  block,
                  envelope,
                  payload: envelope.payload,
                  eventId: envelope.eventId,
                  directory: envelope.directory,
                });
              }
              separatorIndex = buffer.indexOf("\n\n");
            }
          }

          if (!stopped && !signal?.aborted && buffer.trim().length > 0) {
            const block = buffer.trim();
            const envelope = parseBlock(block);
            if (envelope?.payload) {
              if (
                typeof envelope.eventId === "string" &&
                envelope.eventId.length > 0
              ) {
                lastEventId = envelope.eventId;
              }
              onEvent?.({
                block,
                envelope,
                payload: envelope.payload,
                eventId: envelope.eventId,
                directory: envelope.directory,
              });
            }
          }
        } catch (error) {
          if (!stopped && !signal?.aborted && abortReason !== "upstream_stalled") {
            onError?.({
              type: "stream_error",
              error,
            });
          }
        } finally {
          clearStallTimer();
          signal?.removeEventListener("abort", abortActive);
          if (activeController === controller) {
            activeController = null;
          }
          onDisconnect?.({
            reason: abortReason ?? (stopped || signal?.aborted ? "stopped" : "closed"),
          });
        }

        if (!stopped && !signal?.aborted) {
          await waitForReconnectDelay(reconnectDelayMs, signal);
        }
      }
    })().finally(() => {
      running = null;
    });

    return running;
  };

  return {
    start,
    stop,
    getLastEventId() {
      return lastEventId;
    },
  };
}