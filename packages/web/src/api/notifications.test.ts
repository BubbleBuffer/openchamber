import { afterEach, describe, expect, test, vi } from 'vitest';
import { createWebNotificationsAPI } from './notifications';

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
const originalNotification = (globalThis as { Notification?: unknown }).Notification;

describe('web notifications API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
    if (originalNotification === undefined) {
      delete (globalThis as { Notification?: unknown }).Notification;
    } else {
      (globalThis as { Notification?: unknown }).Notification = originalNotification;
    }
  });

  test('delivers through the active service worker without waiting on a timer', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const getRegistration = vi.fn().mockResolvedValue({ active: {}, showNotification });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } });

    await expect(createWebNotificationsAPI().notifyAgentCompletion({ title: 'Done', body: 'Ready' })).resolves.toBe(true);
    expect(showNotification).toHaveBeenCalledWith('Done', { body: 'Ready', tag: undefined });
  });

  test('falls back to granted Notification when no service worker is active', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn().mockResolvedValue(null) } });
    const NotificationMock = vi.fn();
    Object.assign(NotificationMock, { permission: 'granted' });
    (globalThis as { Notification?: unknown }).Notification = NotificationMock;

    await expect(createWebNotificationsAPI().notifyAgentCompletion({ title: 'Done' })).resolves.toBe(true);
    expect(NotificationMock).toHaveBeenCalledWith('Done', { body: undefined, tag: undefined });
  });
});
