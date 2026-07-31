/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  NotificationEmitterDeps,
  NotificationEmitterRuntime,
} from "./types.js";

export const createNotificationEmitterRuntime = (
  dependencies: NotificationEmitterDeps
): NotificationEmitterRuntime => {
  const {
    getUiNotificationClients,
    getBroadcastGlobalUiEvent,
  } = dependencies;

  const writeSseEvent = (res: any, payload: any): void => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const broadcastUiNotification = (payload: any): void => {
    if (!payload || typeof payload !== "object") return;
    const syntheticPayload = {
      type: "openchamber:notification",
      properties: {
        ...payload,
      },
    };

    const broadcastGlobalUiEvent =
      typeof getBroadcastGlobalUiEvent === "function"
        ? getBroadcastGlobalUiEvent()
        : null;
    if (broadcastGlobalUiEvent) {
      broadcastGlobalUiEvent(syntheticPayload);
      return;
    }

    const clients = getUiNotificationClients();
    if (clients.size === 0) return;
    for (const res of clients) {
      try {
        writeSseEvent(res, syntheticPayload);
      } catch {
        // ignore
      }
    }
  };

  return {
    writeSseEvent,
    broadcastUiNotification,
  };
};
