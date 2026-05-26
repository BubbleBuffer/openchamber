import { WebSocketServer } from 'ws';
import webPush from 'web-push';

import { parseRequestPathname } from '../terminal/index.js';
import {
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
  sendMessageStreamWsEvent,
} from './protocol.js';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createGlobalMessageStreamWsBridge } from './global-ws-bridge.js';
import { acceptDirectoryMessageStreamWsConnection } from './directory-ws-bridge.js';
import {
  DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
} from './upstream-reader.js';
import { createNotificationEmitterRuntime } from '../notifications/emitter-runtime.js';
import { createPushRuntime } from '../notifications/push-runtime.js';
import { createOpenCodeWatcherRuntime } from '../opencode/services/watcher.js';
import { EVENTS } from '../core/events.js';

export function createGlobalUiEventBroadcaster({
  sseClients,
  wsClients,
  writeSseEvent,
}) {
  return (payload, options = {}) => {
    const hasSseClients = sseClients.size > 0;
    const hasWsClients = wsClients.size > 0;
    if (!hasSseClients && !hasWsClients) {
      return;
    }

    if (hasSseClients) {
      for (const res of sseClients) {
        try {
          writeSseEvent(res, payload);
        } catch {
        }
      }
    }

    if (hasWsClients) {
      for (const socket of Array.from(wsClients)) {
        const sent = sendMessageStreamWsEvent(socket, payload, {
          directory: typeof options.directory === 'string' && options.directory.length > 0 ? options.directory : 'global',
          eventId: typeof options.eventId === 'string' && options.eventId.length > 0 ? options.eventId : undefined,
        });
        if (!sent) {
          wsClients.delete(socket);
        }
      }
    }
  };
}

export function createMessageStreamWsRuntime({
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
}) {
  const wsServer = new WebSocketServer({
    noServer: true,
  });

  const ownsGlobalHub = !globalEventHub;
  const globalHub = globalEventHub ?? createGlobalMessageStreamHub({
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

  wsServer.on('connection', (socket, req) => {
    const rawUrl = typeof req?.url === 'string' ? req.url : MESSAGE_STREAM_GLOBAL_WS_PATH;
    const pathname = parseRequestPathname(rawUrl);
    const requestUrl = new URL(rawUrl, 'http://127.0.0.1');
    const isGlobalStream = pathname === MESSAGE_STREAM_GLOBAL_WS_PATH;
    const requestedLastEventId = requestUrl.searchParams.get('lastEventId')?.trim() || '';
    const requestedDirectory = requestUrl.searchParams.get('directory')?.trim() || '';

    if (isGlobalStream) {
      globalBridge.accept(socket, {
        requestedLastEventId,
      });
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

  const upgradeHandler = (req, socket, head) => {
    const pathname = parseRequestPathname(req.url);
    if (pathname !== MESSAGE_STREAM_GLOBAL_WS_PATH && pathname !== MESSAGE_STREAM_DIRECTORY_WS_PATH) {
      return;
    }

    const handleUpgrade = async () => {
      try {
        if (uiAuthController?.enabled) {
          const sessionToken = await uiAuthController?.ensureSessionToken?.(req, null);
          if (!sessionToken) {
            rejectWebSocketUpgrade(socket, 401, 'UI authentication required');
            return;
          }

          const originAllowed = await isRequestOriginAllowed(req);
          if (!originAllowed) {
            rejectWebSocketUpgrade(socket, 403, 'Invalid origin');
            return;
          }
        }

        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      } catch {
        rejectWebSocketUpgrade(socket, 500, 'Upgrade failed');
      }
    };

    void handleUpgrade();
  };

  server.on('upgrade', upgradeHandler);

  return {
    wsServer,
    async close() {
      server.off('upgrade', upgradeHandler);
      globalBridge.close();

      try {
        for (const client of wsServer.clients) {
          try {
            client.terminate();
          } catch {
          }
        }

        await new Promise((resolve) => {
          wsServer.close(() => resolve());
        });
      } catch {
      } finally {
        wsClients.clear();
      }
    },
  };
}

/**
 * @param {object} deps
 * @param {import('../core/event-bus.js').EventBus<import('../core/events.js').ServerEvents>} deps.eventBus
 * @param {object} deps.openCodeRuntime
 * @param {NodeJS.Process} deps.process
 * @param {import('fs').promises|null} deps.fsPromises
 * @param {typeof import('path')|null} deps.path
 * @param {Function} deps.readSettingsFromDiskMigrated
 * @param {Function} deps.writeSettingsToDisk
 * @param {string} deps.pushSubscriptionsFilePath
 */
export const createEventStreamRuntime = (deps) => {
  const {
    eventBus, openCodeRuntime, process,
    fsPromises, path,
    readSettingsFromDiskMigrated, writeSettingsToDisk,
    pushSubscriptionsFilePath,
  } = deps;

  const uiNotificationClients = new Set();
  const uiOpenChamberEventClients = new Set();
  const DESKTOP_NOTIFY_PREFIX = '[OpenChamberDesktopNotify] ';
  const getDesktopNotifyEnabled = () => false;

  const notificationEmitterRuntime = createNotificationEmitterRuntime({
    process,
    getDesktopNotifyEnabled,
    desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
    getUiNotificationClients: () => uiNotificationClients,
    getBroadcastGlobalUiEvent: () => null,
  });

  const { writeSseEvent, emitDesktopNotification, broadcastUiNotification } = notificationEmitterRuntime;

  const pushRuntime = createPushRuntime({
    fsPromises, path, webPush,
    PUSH_SUBSCRIPTIONS_FILE_PATH: pushSubscriptionsFilePath,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
  });

  const globalMessageStreamHub = createGlobalMessageStreamHub({ openCodeRuntime });

  const processForwardedEventPayload = (payload, emitSyntheticEvent) => {
    if (!payload || typeof payload !== 'object' || typeof emitSyntheticEvent !== 'function') return;
    if (payload.type !== 'session.status') return;
    const properties = payload.properties && typeof payload.properties === 'object' ? payload.properties : {};
    const info = properties.info && typeof properties.info === 'object' ? properties.info : {};
    const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
    const status = typeof info.type === 'string' ? info.type.trim() : '';
    if (!sessionId || !status) return;
    emitSyntheticEvent({
      type: 'openchamber:session-status',
      properties: { sessionId, status, timestamp: Date.now(), metadata: { attempt: info.attempt, message: info.message, next: info.next }, needsAttention: false },
    });
    emitSyntheticEvent({
      type: 'openchamber:session-activity',
      properties: { sessionId, phase: status === 'busy' || status === 'retry' ? 'busy' : 'idle' },
    });
  };

  let globalWatcherStartPromise = null;

  const ensureGlobalWatcherStarted = async () => {
    if (globalWatcherStartPromise) return globalWatcherStartPromise;
    globalWatcherStartPromise = (async () => {
      const watcher = createOpenCodeWatcherRuntime({
        waitForOpenCodePort: null,
        openCodeRuntime,
        globalEventHub: globalMessageStreamHub,
        onPayload: (payload) => {
          processForwardedEventPayload(payload, (syntheticPayload) => {
            for (const res of uiNotificationClients) {
              try { writeSseEvent(res, syntheticPayload); } catch {}
            }
          });
          eventBus.emit(EVENTS.EVENT_RECEIVED, { payload, directory: undefined });
        },
      });
      await watcher.start();
    })().catch((error) => {
      globalWatcherStartPromise = null;
      throw error;
    });
    return globalWatcherStartPromise;
  };

  const broadcastToClients = (payload) => {
    for (const res of uiNotificationClients) {
      try { writeSseEvent(res, payload); } catch {}
    }
  };

  const disposers = [
    eventBus.on(EVENTS.NOTIFICATION_SEND_UI, ({ payload }) => broadcastToClients(payload)),
    eventBus.on(EVENTS.NOTIFICATION_SEND_DESKTOP, ({ payload }) => emitDesktopNotification(payload)),
    eventBus.on(EVENTS.NOTIFICATION_SEND_PUSH, ({ payload, options }) => {
      void pushRuntime.sendPushToAllUiSessions?.(payload, options);
    }),
    eventBus.on(EVENTS.OPENCODE_READY, () => { void ensureGlobalWatcherStarted(); }),
  ];

  return {
    writeSseEvent,
    broadcastUiNotification,
    emitDesktopNotification,
    ensureGlobalWatcherStarted,
    addUiNotificationClient: (res) => { uiNotificationClients.add(res); },
    removeUiNotificationClient: (res) => { uiNotificationClients.delete(res); },
    processUpstreamPayload: (payload) => {
      eventBus.emit(EVENTS.EVENT_RECEIVED, { payload, directory: undefined });
    },
    getUiNotificationClients: () => uiNotificationClients,
    getUiOpenChamberEventClients: () => uiOpenChamberEventClients,
    pushRuntime,
    globalMessageStreamHub,
    dispose: () => {
      disposers.forEach(fn => fn());
      globalWatcherStartPromise = null;
    },
  };
};
