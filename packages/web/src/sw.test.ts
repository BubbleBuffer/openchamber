import { describe, expect, test, vi } from 'vitest';

type Listener = (event: unknown) => void;

const listeners = new Map<string, Listener>();
const workerScope = {
  __WB_MANIFEST: [],
  location: new URL('https://openchamber.test/'),
  addEventListener(type: string, listener: Listener) {
    listeners.set(type, listener);
  },
  skipWaiting: vi.fn(),
  clients: {
    claim: vi.fn(),
  },
};

Object.defineProperty(globalThis, 'self', {
  configurable: true,
  value: workerScope,
});

const serviceWorker = await import('./sw');

describe('service worker API routing', () => {
  test('leaves API fetches to the browser without creating a rejected response promise', () => {
    const respondWith = vi.fn();
    const event = {
      request: new Request('https://openchamber.test/api/config/settings'),
      respondWith,
    } as unknown as FetchEvent;

    expect(serviceWorker.isProtectedRequest(event.request)).toBe(true);
    expect(serviceWorker.handleFetchEvent(event)).toBeUndefined();
    expect(respondWith).not.toHaveBeenCalled();
  });

  test.each([
    '/auth/session',
    '/auth/passkey/status',
    '/global/event',
    '/event',
  ])('never intercepts protected route %s', (pathname) => {
    const respondWith = vi.fn();
    const event = {
      request: new Request(`https://openchamber.test${pathname}`),
      respondWith,
    } as unknown as FetchEvent;

    expect(serviceWorker.isProtectedRequest(event.request)).toBe(true);
    serviceWorker.handleFetchEvent(event);
    expect(respondWith).not.toHaveBeenCalled();
  });

  test('never caches cross-origin resources', () => {
    const respondWith = vi.fn();
    const event = {
      request: new Request('https://telemetry.example/app.js'),
      respondWith,
    } as unknown as FetchEvent;

    serviceWorker.handleFetchEvent(event);
    expect(respondWith).not.toHaveBeenCalled();
  });

  test('continues routing static assets through the cache strategy', () => {
    const cachedResponse = new Response('cached');
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        open: vi.fn().mockResolvedValue({
          match: vi.fn().mockResolvedValue(cachedResponse),
        }),
      },
    });
    const respondWith = vi.fn();
    const event = {
      request: new Request('https://openchamber.test/assets/app.js'),
      respondWith,
    } as unknown as FetchEvent;

    expect(serviceWorker.isProtectedRequest(event.request)).toBe(false);
    serviceWorker.handleFetchEvent(event);
    expect(respondWith).toHaveBeenCalledTimes(1);
  });
});
