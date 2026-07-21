import { EVENTS } from "../core/events.js";
import type {
  NotificationDeliveryRuntime,
  NotificationDeliveryRuntimeDeps,
} from "./types.js";

export const createNotificationDeliveryRuntime = (
  deps: NotificationDeliveryRuntimeDeps,
): NotificationDeliveryRuntime => {
  const {
    eventBus,
    broadcastUiNotification,
    sendPushToAllUiSessions,
    notificationTriggerRuntime,
    notificationTemplateRuntime,
  } = deps;
  let disposed = false;

  const unsubscribeUi = eventBus.on(EVENTS.NOTIFICATION_SEND_UI, ({ payload }) => {
    broadcastUiNotification(payload);
  });
  const unsubscribePush = eventBus.on(EVENTS.NOTIFICATION_SEND_PUSH, ({ payload, options }) => {
    void sendPushToAllUiSessions(payload, options);
  });

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribeUi();
      unsubscribePush();
      notificationTriggerRuntime.dispose?.();
      notificationTemplateRuntime?.dispose?.();
    },
  };
};
