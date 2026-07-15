import { describe, expect, it, vi } from "vitest";

import { EventBus } from "../core/event-bus.js";
import { EVENTS } from "../core/events.js";
import { createNotificationDeliveryRuntime } from "./delivery-runtime.js";

describe("notification delivery runtime", () => {
  it("routes live UI and Push events and disposes all owned resources once", async () => {
    const eventBus = new EventBus();
    const broadcastUiNotification = vi.fn();
    const sendPushToAllUiSessions = vi.fn(async () => undefined);
    const triggerDispose = vi.fn();
    const templateDispose = vi.fn();
    const runtime = createNotificationDeliveryRuntime({
      eventBus,
      broadcastUiNotification,
      sendPushToAllUiSessions,
      notificationTriggerRuntime: { dispose: triggerDispose },
      notificationTemplateRuntime: { dispose: templateDispose },
    });
    const uiPayload = { title: "Ready", body: "Done" };
    const pushPayload = { title: "Ready", data: { type: "ready" } };
    const pushOptions = { requireNoSse: true };

    eventBus.emit(EVENTS.NOTIFICATION_SEND_UI, { payload: uiPayload });
    eventBus.emit(EVENTS.NOTIFICATION_SEND_PUSH, {
      payload: pushPayload,
      options: pushOptions,
    });
    await Promise.resolve();

    expect(broadcastUiNotification).toHaveBeenCalledOnce();
    expect(broadcastUiNotification).toHaveBeenCalledWith(uiPayload);
    expect(sendPushToAllUiSessions).toHaveBeenCalledOnce();
    expect(sendPushToAllUiSessions).toHaveBeenCalledWith(pushPayload, pushOptions);

    runtime.dispose();
    runtime.dispose();
    eventBus.emit(EVENTS.NOTIFICATION_SEND_UI, { payload: { title: "ignored" } });
    eventBus.emit(EVENTS.NOTIFICATION_SEND_PUSH, {
      payload: { title: "ignored" },
      options: { requireNoSse: false },
    });
    await Promise.resolve();

    expect(broadcastUiNotification).toHaveBeenCalledOnce();
    expect(sendPushToAllUiSessions).toHaveBeenCalledOnce();
    expect(triggerDispose).toHaveBeenCalledOnce();
    expect(templateDispose).toHaveBeenCalledOnce();
  });
});
