/// <reference lib="webworker" />

// NOTE: keep the Workbox injection point so vite-plugin-pwa can build.
// We intentionally do not use Workbox runtime helpers here: iOS Safari can be
// fragile with more complex SW bundles. For push notifications we only need a
// minimal SW.

// Runtime caching uses the native Cache Storage API for maximum compatibility.

const CACHE_VERSION = 'v1';

const CACHE_NAMES = {
  appShell: `app-shell-${CACHE_VERSION}`,
  staticAssets: `static-assets-${CACHE_VERSION}`,
  api: `api-cache-${CACHE_VERSION}`,
  images: `image-cache-${CACHE_VERSION}`,
} as const;

// Maximum entries per cache
const CACHE_LIMITS = {
  appShell: 10,
  staticAssets: 100,
  api: 50,
  images: 60,
} as const;

// Maximum age in milliseconds (30 days)
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// API cache max age (1 hour)
const API_MAX_AGE_MS = 60 * 60 * 1000;

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision?: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __precacheManifest = self.__WB_MANIFEST;

type PushPayload = {
  title?: string;
  body?: string;
  tag?: string;
  data?: {
    url?: string;
    sessionId?: string;
    type?: string;
  };
  icon?: string;
  badge?: string;
};

// ── Cache helpers ───────────────────────────────────────────────────────────

async function trimCache(cacheName: string, maxEntries: number): Promise<void> {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.slice(0, keys.length - maxEntries);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

async function isCacheExpired(response: Response, maxAgeMs: number): Promise<boolean> {
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return false;
  const date = new Date(dateHeader).getTime();
  return Date.now() - date > maxAgeMs;
}

async function cacheFirst(request: Request, cacheName: string, options?: { maxAgeMs?: number }): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const maxAge = options?.maxAgeMs ?? MAX_AGE_MS;

  if (cached && !(await isCacheExpired(cached, maxAge))) {
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && networkResponse.status !== 206) {
      cache.put(request, networkResponse.clone());
      await trimCache(cacheName, CACHE_LIMITS[cacheName as keyof typeof CACHE_LIMITS] ?? 100);
    }
    return networkResponse;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function networkFirst(request: Request, cacheName: string, options?: { timeoutMs?: number; maxAgeMs?: number }): Promise<Response> {
  const cache = await caches.open(cacheName);
  const timeoutMs = options?.timeoutMs ?? 3000;
  const maxAge = options?.maxAgeMs ?? API_MAX_AGE_MS;

  const networkPromise = fetch(request).then(async (response) => {
    if (response.ok && response.status !== 206) {
      cache.put(request, response.clone());
      await trimCache(cacheName, CACHE_LIMITS[cacheName as keyof typeof CACHE_LIMITS] ?? 50);
    }
    return response;
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
  });

  try {
    return await Promise.race([networkPromise, timeoutPromise]);
  } catch {
    const cached = await cache.match(request);
    if (cached && !(await isCacheExpired(cached, maxAge))) {
      return cached;
    }
    throw new Error('Network failed and no valid cache');
  }
}

// ── Install / Activate ──────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const expectedCaches = Object.values(CACHE_NAMES);
      const existingCaches = await caches.keys();
      await Promise.all(
        existingCaches
          .filter((name) => !expectedCaches.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) return;

  // API calls: NetworkFirst
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, CACHE_NAMES.api, { timeoutMs: 3000, maxAgeMs: API_MAX_AGE_MS }));
    return;
  }

  // Images: CacheFirst
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|tif|tiff)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.images));
    return;
  }

  // Static assets (JS, CSS, fonts with content hashes): CacheFirst
  if (/\.(js|css|woff|woff2|ttf|otf|eot)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAMES.staticAssets));
    return;
  }

  // HTML navigation (app shell): CacheFirst with offline fallback
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      cacheFirst(request, CACHE_NAMES.appShell).catch(async () => {
        const cache = await caches.open(CACHE_NAMES.appShell);
        const offlineFallback = await cache.match('/offline.html');
        if (offlineFallback) return offlineFallback;
        return new Response('Offline — OpenChamber is unavailable.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    );
    return;
  }
});

// ── Push ────────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = (event.data?.json() ?? null) as PushPayload | null;
    if (!payload) {
      return;
    }

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hasVisibleClient = clients.some((client) => client.visibilityState === 'visible' || client.focused);
    if (hasVisibleClient) {
      return;
    }

    const title = payload.title || 'OpenChamber';
    const body = payload.body ?? '';
    const icon = payload.icon ?? '/apple-touch-icon-180x180.png';
    const badge = payload.badge ?? '/favicon-32.png';

    await self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag: payload.tag,
      data: payload.data,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = (event.notification.data ?? null) as { url?: string } | null;
  const url = data?.url ?? '/';

  event.waitUntil(self.clients.openWindow(url));
});
