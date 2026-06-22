import { createRequire } from "node:module";
import { WebSocketServer } from "ws";

import { parseRequestPathname } from "../../domains/terminal/index.js";

// Own domain imports
import {
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
  DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
} from "./types.js";
import type {
  MessageStreamWsRuntimeDeps,
  MessageStreamWsRuntime,
  GlobalUiBroadcasterDeps,
  GlobalHub,
} from "./types.js";
import { sendMessageStreamWsEvent } from "./protocol.js";
import { createGlobalMessageStreamHub } from "./global-hub.js";
import { createGlobalMessageStreamWsBridge } from "./global-ws-bridge.js";
import { acceptDirectoryMessageStreamWsConnection } from "./directory-ws-bridge.js";

// Old JS module imports (lib/ not in tsconfig.server.json include)
import { createNotificationEmitterRuntime } from "../notifications/emitter.js";
import { createPushRuntime } from "../notifications/push-runtime.js";
import { createOpenCodeWatcherRuntime } from "../opencode-support/watcher.js";
import { EVENTS } from "../core/events.js";
import { createBoundedSet } from "../core/bounded-cache.js";

// web-push is an old JS module — use createRequire to avoid top-level await
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webPush: any = createRequire(import.meta.url)("web-push");

export function createGlobalUiEventBroadcaster({
  sseClients,
  wsClients,
  writeSseEvent,
}: GlobalUiBroadcasterDeps): (payload: unknown, options?: { directory?: string; eventId?: string }) => void {
  return (payload, options = {}) => {
    const hasSseClients = sseClients.size > 0;
    const hasWsClients = wsClients.size > 0;
    if (!hasSseClients && !hasWsClients) return;

    if (hasSseClients) {
      for (const res of sseClients) {
        try { writeSseEvent(res, payload); }
        // eslint-disable-next-line no-empty
        catch {}
      }
    }

    if (hasWsClients) {
      for (const socket of Array.from(wsClients)) {
        const sent = sendMessageStreamWsEvent(socket, payload, {
          directory:
            typeof options.directory === "string" && options.directory.length > 0
              ? options.directory
              : "global",
          eventId:
            typeof options.eventId === "string" && options.eventId.length > 0
              ? options.eventId
              : undefined,
        });
        if (!sent) wsClients.delete(socket);
      }
    }
  };
}

export function createMessageStreamWsRuntime(
  deps: MessageStreamWsRuntimeDeps,
): MessageStreamWsRuntime {
  const {
    server,
    uiAuthController,
    isRequestOriginAllowed,
    rejectWebSocketUpgrade,
    openCodeRuntime,
    processForwardedEventPayload,
    wsClients = new Set(),
    triggerHealthCheck,
    heartbeatIntervalMs = MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
    upstreamStallTimeoutMs = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
    upstreamReconnectDelayMs = DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
    fetchImpl = fetch,
    globalEventHub = null,
  } = deps;

  const wsServer = new WebSocketServer({ noServer: true });
  const ownsGlobalHub = !globalEventHub;
  const globalHub: GlobalHub =
    globalEventHub ??
    createGlobalMessageStreamHub({
      openCodeRuntime,
      fetchImpl,
      upstreamStallTimeoutMs,
      upstreamReconnectDelayMs,
    });

  const globalBridge = createGlobalMessageStreamWsBridge({
    globalHub,
    ownsGlobalHub,
    wsClients,
    processForwardedEventPayload,
    triggerHealthCheck,
    heartbeatIntervalMs,
  });

  wsServer.on("connection", (socket, req) => {
    const rawUrl = typeof req?.url === "string" ? req.url : MESSAGE_STREAM_GLOBAL_WS_PATH;
    const pathname = parseRequestPathname(rawUrl);
    const requestUrl = new URL(rawUrl, "http://127.0.0.1");
    const isGlobalStream = pathname === MESSAGE_STREAM_GLOBAL_WS_PATH;
    const requestedLastEventId = requestUrl.searchParams.get("lastEventId")?.trim() || "";
    const requestedDirectory = requestUrl.searchParams.get("directory")?.trim() || "";

    if (isGlobalStream) {
      globalBridge.accept(socket, { requestedLastEventId });
      return;
    }

    acceptDirectoryMessageStreamWsConnection({
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
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upgradeHandler = (req: any, socket: any, head: any) => {
    const pathname = parseRequestPathname((req as { url?: string }).url || "");
    if (
      pathname !== MESSAGE_STREAM_GLOBAL_WS_PATH &&
      pathname !== MESSAGE_STREAM_DIRECTORY_WS_PATH
    ) {
      return;
    }
    const handleUpgrade = async () => {
      try {
        if (uiAuthController?.enabled) {
          const sessionToken = await uiAuthController?.ensureSessionToken?.(req, null);
          if (!sessionToken) {
            rejectWebSocketUpgrade(
              socket as import("node:net").Socket,
              401,
              "UI authentication required"
            );
            return;
          }
          const originAllowed = await isRequestOriginAllowed(req);
          if (!originAllowed) {
            rejectWebSocketUpgrade(
              socket as import("node:net").Socket,
              403,
              "Invalid origin"
            );
            return;
          }
        }
        wsServer.handleUpgrade(
          req,
          socket as import("node:net").Socket,
          head as Buffer,
          (ws) => {
            wsServer.emit("connection", ws, req);
          }
        );
      } catch {
        rejectWebSocketUpgrade(
          socket as import("node:net").Socket,
          500,
          "Upgrade failed"
        );
      }
    };
    void handleUpgrade();
  };

  server.on("upgrade", upgradeHandler);

  return {
    wsServer,
    async close() {
      server.off("upgrade", upgradeHandler);
      globalBridge.close();
      try {
        for (const client of wsServer.clients) {
          try { client.terminate(); }
          // eslint-disable-next-line no-empty
          catch {}
        }
        await new Promise<void>((resolve) => {
          wsServer.close(() => resolve());
        });
      }
      // eslint-disable-next-line no-empty
      catch {} finally {
        wsClients.clear();
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createEventStreamRuntime = (deps: any) => {
  const {
    eventBus,
    openCodeRuntime,
    process,
    fsPromises,
    path,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
    pushSubscriptionsFilePath,
    sessionSnapshotPublisher = null,
  } = deps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uiNotificationClients: any = createBoundedSet({ maxSize: 200, ttlMs: 3600_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uiOpenChamberEventClients: any = createBoundedSet({ maxSize: 200, ttlMs: 3600_000 });
  const DESKTOP_NOTIFY_PREFIX = "[OpenChamberDesktopNotify] ";
  const getDesktopNotifyEnabled = (): boolean => false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notificationEmitterRuntime: any = createNotificationEmitterRuntime({
    process,
    getDesktopNotifyEnabled,
    desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
    getUiNotificationClients: () => uiNotificationClients,
    getBroadcastGlobalUiEvent: () => null,
  });

  const { writeSseEvent, emitDesktopNotification, broadcastUiNotification } =
    notificationEmitterRuntime;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushRuntime: any = createPushRuntime({
    fsPromises,
    path,
    webPush,
    PUSH_SUBSCRIPTIONS_FILE_PATH: pushSubscriptionsFilePath,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
  });

  const globalMessageStreamHub = createGlobalMessageStreamHub({ openCodeRuntime });

  if (sessionSnapshotPublisher) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sessionSnapshotPublisher as any).setTransport({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writeSseEvent: (snapshot: any, options: any = {}) => {
        globalMessageStreamHub.emitSynthetic(
          {
            type: "openchamber:session-snapshot",
            properties: snapshot,
          },
          {
            eventId: snapshot.meta?.sourceEventId ?? undefined,
            directory:
              typeof options.directory === "string" && options.directory.length > 0
                ? options.directory
                : (snapshot.key?.directory ?? "global"),
          }
        );
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const processForwardedEventPayload = (_payload: any, _emitSyntheticEvent: any) => {
    void _payload;
    void _emitSyntheticEvent;
  };

  let globalWatcherStartPromise: Promise<void> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ensureGlobalWatcherStarted = async (): Promise<any> => {
    if (globalWatcherStartPromise) return globalWatcherStartPromise;
    globalWatcherStartPromise = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const watcher: any = createOpenCodeWatcherRuntime({
        waitForOpenCodePort: null,
        openCodeRuntime,
        globalEventHub: globalMessageStreamHub,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPayload: (payload: any) => {
          processForwardedEventPayload(payload, (syntheticPayload: unknown) => {
            for (const res of uiNotificationClients) {
              try { writeSseEvent(res, syntheticPayload); }
              // eslint-disable-next-line no-empty
              catch {}
            }
          });
          eventBus.emit(EVENTS.EVENT_RECEIVED, { payload, directory: undefined });
        },
      });
      await watcher.start();
    })().catch((error: unknown) => {
      globalWatcherStartPromise = null;
      throw error;
    });
    return globalWatcherStartPromise;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastToClients = (payload: any) => {
    for (const res of uiNotificationClients) {
      try { writeSseEvent(res, payload); }
      // eslint-disable-next-line no-empty
      catch {}
    }
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const disposers: Array<() => void> = [
    eventBus.on(EVENTS.NOTIFICATION_SEND_UI, ({ payload }: any) => broadcastToClients(payload)),
    eventBus.on(EVENTS.NOTIFICATION_SEND_DESKTOP, ({ payload }: any) =>
      emitDesktopNotification(payload)
    ),
    eventBus.on(EVENTS.NOTIFICATION_SEND_PUSH, ({ payload, options }: any) => {
      void pushRuntime.sendPushToAllUiSessions?.(payload, options);
    }),
    eventBus.on(EVENTS.OPENCODE_READY, () => {
      void ensureGlobalWatcherStarted();
    }),
  ];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    writeSseEvent,
    broadcastUiNotification,
    emitDesktopNotification,
    ensureGlobalWatcherStarted,
    addUiNotificationClient: (res: unknown) => {
      uiNotificationClients.add(res);
    },
    removeUiNotificationClient: (res: unknown) => {
      uiNotificationClients.delete(res);
    },
    processUpstreamPayload: (payload: unknown) => {
      eventBus.emit(EVENTS.EVENT_RECEIVED, { payload, directory: undefined });
    },
    getUiNotificationClients: () => uiNotificationClients,
    getUiOpenChamberEventClients: () => uiOpenChamberEventClients,
    pushRuntime,
    globalMessageStreamHub,
    dispose: () => {
      disposers.forEach((fn) => fn());
      globalWatcherStartPromise = null;
      uiNotificationClients.dispose();
      uiOpenChamberEventClients.dispose();
    },
  };
};