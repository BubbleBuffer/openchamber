import { parseNotificationSseEvent } from '@contracts/notifications';

export type NotificationPayload = { title?: string; body?: string; tag?: string };
export interface NotificationsAPI {
  notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean>;
  canNotify?: () => boolean | Promise<boolean>;
}

/** Decode only the OpenChamber synthetic outer SSE event; SDK payloads remain opaque. */
export const parseNotificationStreamEvent = (value: unknown) => parseNotificationSseEvent(value);

const SW_READY_TIMEOUT_MS = 1500;

const getNotificationRegistration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  let existing: ServiceWorkerRegistration | null = null;
  try {
    existing = (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    existing = null;
  }

  if (existing?.active) {
    return existing;
  }

  if (!existing) {
    return null;
  }

  try {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const ready = await Promise.race<ServiceWorkerRegistration | null>([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
        }),
      ]);

      return ready ?? existing;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  } catch {
    return existing;
  }
};

const notifyWithServiceWorker = async (payload?: NotificationPayload): Promise<boolean> => {
  const registration = await getNotificationRegistration();
  if (!registration || typeof registration.showNotification !== 'function') {
    return false;
  }

  try {
    await registration.showNotification(payload?.title ?? 'OpenChamber', {
      body: payload?.body,
      tag: payload?.tag,
    });
    return true;
  } catch (error) {
    console.warn('Failed to send notification via service worker', error);
    return false;
  }
};

const notifyWithWebAPI = async (payload?: NotificationPayload): Promise<boolean> => {
  if (await notifyWithServiceWorker(payload)) {
    return true;
  }

  if (typeof Notification === 'undefined') {
    console.info('Notifications not supported in this environment', payload);
    return false;
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return false;
    }
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  try {
    new Notification(payload?.title ?? 'OpenChamber', {
      body: payload?.body,
      tag: payload?.tag,
    });
    return true;
  } catch (error) {
    console.warn('Failed to send notification', error);
    return false;
  }
};

export const createWebNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    return notifyWithWebAPI(payload);
  },
  canNotify: () => {
    return typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false;
  },
});
