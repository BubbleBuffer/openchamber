import { sendMessageStreamWsEvent, sendMessageStreamWsFrame } from "./protocol.js";
import { createUpstreamSseReader } from "./upstream-reader.js";
import type { DirectoryWsConnectionDeps } from "./types.js";

function shouldTriggerUpstreamHealthCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upstream: any
): boolean {
  if (!upstream) {
    return true;
  }

  if (!upstream.body) {
    return upstream.ok || upstream.status >= 500;
  }

  return upstream.status >= 500;
}

function shouldForwardDirectoryEvent(requestedDirectory: string, eventDirectory: string | null): boolean {
  return requestedDirectory.length === 0 || eventDirectory === requestedDirectory;
}

export function acceptDirectoryMessageStreamWsConnection({
  socket,
  requestedLastEventId,
  requestedDirectory,
   
  openCodeRuntime,
   
  processForwardedEventPayload,
  wsClients,
  triggerHealthCheck,
  heartbeatIntervalMs,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
   
  fetchImpl,
}: DirectoryWsConnectionDeps): void {
  const controller = new AbortController();
  let streamReady = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reader: any = null;

  const cleanup = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
    reader?.stop();
    wsClients.delete(socket);
  };

  const pingInterval = setInterval(() => {
    if (socket.readyState !== 1) {
      return;
    }

    try {
      socket.ping();
    } catch {
      // ignore
    }
  }, heartbeatIntervalMs);

  socket.on("close", () => {
    clearInterval(pingInterval);
    cleanup();
  });

  socket.on("error", () => {
    void undefined;
  });

  const run = async () => {
    const forwardEvent = ({ envelope, payload }: { envelope: { eventId: string | null; directory: string | null; payload: unknown }; payload: unknown }) => {
      if (!shouldForwardDirectoryEvent(requestedDirectory, envelope.directory)) {
        return;
      }

      const directory = requestedDirectory || envelope?.directory || "global";

      sendMessageStreamWsEvent(socket, payload, {
        directory,
        eventId: typeof envelope?.eventId === "string" && envelope.eventId.length > 0 ? envelope.eventId : undefined,
      });

      processForwardedEventPayload(payload, (syntheticPayload: unknown) => {
        sendMessageStreamWsEvent(socket, syntheticPayload, { directory: "global" });
      });
    };

    try {
      let buildUrlFailed = false;
      const closeWithInitialError = ({
        message,
        closeReason = message,
        triggerHealthCheckFor = null,
      }: {
        message: string;
        closeReason?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        triggerHealthCheckFor: any;
      }) => {
        sendMessageStreamWsFrame(socket, { type: "error", message });
        socket.close(1011, closeReason);
        if (triggerHealthCheckFor === true || (triggerHealthCheckFor && shouldTriggerUpstreamHealthCheck(triggerHealthCheckFor))) {
          triggerHealthCheck?.();
        }
        reader?.stop();
        cleanup();
      };

      reader = createUpstreamSseReader({
        initialLastEventId: requestedLastEventId,
        signal: controller.signal,
        stallTimeoutMs: upstreamStallTimeoutMs,
        reconnectDelayMs: upstreamReconnectDelayMs,
        fetchImpl,
        buildUrl: () => {
          buildUrlFailed = false;
          let targetUrl;
          try {
            targetUrl = new URL(openCodeRuntime.getUrl("/global/event", ""));
          } catch {
            buildUrlFailed = true;
            throw new Error("OpenCode service unavailable");
          }

          return targetUrl;
        },
        getHeaders: () => openCodeRuntime.getAuthHeaders(),
        onConnect() {
          if (!streamReady) {
            sendMessageStreamWsFrame(socket, {
              type: "ready",
              scope: "directory",
            });
            streamReady = true;
          }
        },
        onEvent: forwardEvent,
        onError(error) {
          if (controller.signal.aborted) {
            return;
          }

          if (!streamReady) {
            if (error?.type === "upstream_unavailable") {
              closeWithInitialError({
                message: `OpenCode event stream unavailable (${error.status})`,
                closeReason: "OpenCode event stream unavailable",
                triggerHealthCheckFor: error.response,
              });
              return;
            }

            closeWithInitialError({
              message: buildUrlFailed ? "OpenCode service unavailable" : "Failed to connect to OpenCode event stream",
              closeReason: buildUrlFailed ? "OpenCode service unavailable" : "Failed to connect to OpenCode event stream",
              triggerHealthCheckFor: !buildUrlFailed,
            });
            return;
          }

          if (error?.type === "stream_error") {
            console.warn("Message stream WS proxy error:", error.error);
          }
        },
      });

      await reader.start();
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn("Message stream WS proxy error:", error);
        sendMessageStreamWsFrame(socket, { type: "error", message: "Message stream proxy error" });
        socket.close(1011, "Message stream proxy error");
      }
    } finally {
      cleanup();
      try {
        if (socket.readyState === 1 || socket.readyState === 0) {
          socket.close();
        }
      } catch {
        // ignore
      }
    }
  };

  void run();
}
