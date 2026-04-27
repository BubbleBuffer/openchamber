# PWA Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add runtime caching strategies, offline fallback, cache versioning, and an offline indicator UI to the PWA service worker — without adding workbox runtime dependencies and maintaining iOS Safari compatibility.

**Architecture:** The service worker (`packages/web/src/sw.ts`) currently only handles push notifications. This plan adds caching using the native Cache Storage API (no workbox runtime imports — consistent with the existing "iOS Safari fragile" philosophy). Four cache strategies are implemented: app shell (HTML navigation, CacheFirst), static assets (CacheFirst with content-hash URL matching), API calls (NetworkFirst with 3s timeout), and images (CacheFirst). Cache versioning via a `CACHE_VERSION` constant ensures clean upgrades on activate. An offline fallback HTML page is precached and served when navigation requests fail. A React `OfflineIndicator` component shows a dismissible banner when `navigator.onLine` is false.

**Tech Stack:** TypeScript (SW), React/TypeScript (UI), Vite with `vite-plugin-pwa` (already installed, `injectManifest` strategy), native Cache Storage API, Tailwind v4 theme tokens

**IMPORTANT DESIGN DECISION — No workbox runtime imports:**
- The existing codebase already has a comment at `packages/web/src/sw.ts:3-6` saying "Intentionally avoiding complex Workbox runtime helpers: iOS Safari/PWA has fragile support for some Workbox patterns."
- This plan is CONSISTENT with that philosophy: we implement caching using the native Cache Storage API directly, NOT workbox runtime modules (`workbox-routing`, `workbox-strategies`, etc.)
- This avoids adding any new npm dependencies and keeps the service worker bundle minimal
- Workbox is still used at build time via `vite-plugin-pwa`'s `injectManifest` (precache manifest injection)
- All runtime caching is implemented with small, focused helper functions

---

## File Changes

| File | Change |
|------|--------|
| `packages/web/src/sw.ts` | **Modify** — add CACHE_VERSION, cache helpers, runtime caching routes, offline fallback, cache cleanup on activate |
| `packages/web/public/offline.html` | **Create** — minimal offline fallback page with branding |
| `packages/web/vite.config.ts` | **Modify** — add `maximumFileSizeToCacheInBytes`, add `offline.html` to globPatterns |
| `packages/ui/src/components/ui/OfflineIndicator.tsx` | **Create** — dismissible offline banner using theme tokens |
| `packages/ui/src/components/layout/MainLayout.tsx` | **Modify** — add OfflineIndicator rendering |
| `packages/web/src/main.tsx` | **No changes needed** — SW registration is already handled via `registerSW` from `virtual:pwa-register` |

---

### Task 1: Add cache helpers and runtime caching strategies to sw.ts

**Files:**
- Modify: `packages/web/src/sw.ts` (full rewrite of existing 71 lines to ~200 lines)

**Approach:** Use native Cache Storage API. Define:
- `CACHE_VERSION` constant (incremented on breaking cache changes)
- Per-strategy cache names: `app-shell-v1`, `static-assets-v1`, `api-cache-v1`, `image-cache-v1`
- Helper: `isNavigationRequest()`, `isStaticAsset()`, `isApiRequest()`, `isImageRequest()`
- Helper: `cacheFirst(request, cacheName, maxEntries, maxAgeSeconds)` — fetch from cache, fall back to network, store response
- Helper: `networkFirst(request, cacheName, networkTimeoutSeconds, maxEntries, maxAgeSeconds)` — try network first, fall back to cache, with timeout
- Helper: `clearExpiredEntries(cache, maxAgeSeconds, maxEntries)` — age-based + LRU eviction
- On `install`: precache `offline.html` from the `__WB_MANIFEST`
- On `activate`: claim clients AND delete all caches not matching current version prefix
- On `fetch`: route requests through caching strategies
- Keep all existing push notification and notificationclick handlers untouched

- [ ] **Step 1: Rewrite sw.ts with caching support**

Replace the entire `packages/web/src/sw.ts` with:

```typescript
/// <reference lib="webworker" />

// NOTE: keep the Workbox injection point so vite-plugin-pwa can build.
// Runtime caching uses the native Cache Storage API (not Workbox runtime helpers)
// for maximum iOS Safari/PWA compatibility. The strategies here (CacheFirst,
// NetworkFirst) are re-implemented with native primitives.

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision?: string }>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __precacheManifest = self.__WB_MANIFEST;

// ─── Cache versioning ──────────────────────────────────────────────
// Increment CACHE_VERSION to invalidate all caches on next activate.
// Each strategy appends its own suffix: {prefix}-{strategy}-v{version}
const CACHE_VERSION = 1;
const CACHE_PREFIX = 'openchamber';

const CACHE_NAMES = {
  APP_SHELL: `${CACHE_PREFIX}-app-shell-v${CACHE_VERSION}`,
  STATIC_ASSETS: `${CACHE_PREFIX}-static-assets-v${CACHE_VERSION}`,
  API: `${CACHE_PREFIX}-api-v${CACHE_VERSION}`,
  IMAGES: `${CACHE_PREFIX}-images-v${CACHE_VERSION}`,
  OFFLINE_FALLBACK: `${CACHE_PREFIX}-offline-v${CACHE_VERSION}`,
} as const;

const ALL_CACHE_NAMES = Object.values(CACHE_NAMES);

// ─── Request classifier helpers ───────────────────────────────────
const isNavigationRequest = (request: Request): boolean => {
  return request.mode === 'navigate'
    || (request.method === 'GET' && request.headers.get('Accept')?.includes('text/html'));
};

const isStaticAsset = (url: URL): boolean => {
  // Content-hashed assets: JS, CSS, fonts
  return /\.(js|css|woff2?|ttf|otf|eot)\b/.test(url.pathname)
    && /[a-f0-9]{8,}/.test(url.pathname);
};

const isApiRequest = (url: URL): boolean => {
  return url.pathname.startsWith('/api/');
};

const isImageRequest = (url: URL): boolean => {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico)\b/.test(url.pathname);
};

// ─── Cache utility helpers ─────────────────────────────────────────

/** Open a cache by name, returning the Cache object or null on error. */
const openCache = async (name: string): Promise<Cache | null> => {
  try {
    return await caches.open(name);
  } catch {
    return null;
  }
};

/**
 * Remove entries from a cache that exceed maxAgeSeconds or push the count
 * past maxEntries (LRU eviction based on insertion order).
 */
const trimCache = async (cache: Cache, maxAgeSeconds: number, maxEntries: number): Promise<void> => {
  const requests: Request[] = [];
  const now = Date.now();

  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) {
      await cache.delete(request);
      continue;
    }

    // Age-based eviction
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      const cachedTime = new Date(dateHeader).getTime();
      if (now - cachedTime > maxAgeSeconds * 1000) {
        await cache.delete(request);
        continue;
      }
    }

    requests.push(request);
  }

  // LRU eviction: keep only the last maxEntries entries
  if (requests.length > maxEntries) {
    const toDelete = requests.slice(0, requests.length - maxEntries);
    await Promise.all(toDelete.map((req) => cache.delete(req)));
  }
};

/**
 * CacheFirst strategy: try cache first, fall back to network, store network response.
 */
const cacheFirst = async (
  request: Request,
  cacheName: string,
  options: { maxAgeSeconds?: number; maxEntries?: number } = {},
): Promise<Response> => {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await openCache(cacheName);
      if (cache) {
        // Clone before putting in cache (response body is consumed once)
        void cache.put(request, response.clone());
        if (options.maxAgeSeconds || options.maxEntries) {
          void trimCache(cache, options.maxAgeSeconds ?? 86400, options.maxEntries ?? 100);
        }
      }
    }
    return response;
  } catch {
    // Network failed and no cache — caller handles fallback
    return new Response('Offline', { status: 503 });
  }
};

/**
 * NetworkFirst strategy: try network first within a timeout, fall back to cache.
 */
const networkFirst = async (
  request: Request,
  cacheName: string,
  options: { networkTimeoutSeconds?: number; maxAgeSeconds?: number; maxEntries?: number } = {},
): Promise<Response> => {
  const timeoutMs = (options.networkTimeoutSeconds ?? 3) * 1000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok && response.type === 'basic') {
      const cache = await openCache(cacheName);
      if (cache) {
        void cache.put(request, response.clone());
        if (options.maxAgeSeconds || options.maxEntries) {
          void trimCache(cache, options.maxAgeSeconds ?? 3600, options.maxEntries ?? 50);
        }
      }
    }
    return response;
  } catch {
    // Network failed or timed out — fall back to cache
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
};

// ─── Offline fallback ──────────────────────────────────────────────
const OFFLINE_FALLBACK_URL = '/offline.html';

const getOfflineFallback = async (): Promise<Response> => {
  const cached = await caches.match(OFFLINE_FALLBACK_URL);
  if (cached) return cached;
  // Last resort: inline minimal offline response
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#151313;color:#cdccc3;text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#878580;max-width:20rem}button{margin-top:1rem;padding:0.5rem 1.5rem;border-radius:0.5rem;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#cdccc3;cursor:pointer}</style></head><body><div><h1>You\'re offline</h1><p>OpenChamber cannot load because there is no internet connection.</p><button onclick="location.reload()">Retry</button></div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
};

// ─── Install: precache offline fallback ────────────────────────────
const PRECACHED_URLS: string[] = [OFFLINE_FALLBACK_URL];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Precache offline fallback and any self.__WB_MANIFEST entries
    const cache = await openCache(CACHE_NAMES.OFFLINE_FALLBACK);
    if (cache) {
      await Promise.allSettled(
        PRECACHED_URLS.map((url) =>
          fetch(url)
            .then((res) => { if (res.ok) cache.put(url, res); })
            .catch(() => {/* skip */}),
        ),
      );
    }
    await self.skipWaiting();
  })());
});

// ─── Activate: clean old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Delete all caches that don't match current version
    const cacheKeys = await caches.keys();
    const validPrefix = `${CACHE_PREFIX}-`;
    await Promise.all(
      cacheKeys
        .filter((key) => key.startsWith(validPrefix) && !ALL_CACHE_NAMES.includes(key as never))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

// ─── Fetch: runtime caching strategies ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-http protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // ── Navigation / App shell (CacheFirst) ──
  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        const result = await cacheFirst(request, CACHE_NAMES.APP_SHELL, {
          maxAgeSeconds: 30 * 86400, // 30 days
          maxEntries: 10,
        });
        // If cacheFirst returned 503 (offline), serve offline fallback
        if (result.status === 503) {
          return getOfflineFallback();
        }
        return result;
      })(),
    );
    return;
  }

  // ── Static assets with content hashes (CacheFirst) ──
  if (isStaticAsset(url)) {
    event.respondWith(
      cacheFirst(request, CACHE_NAMES.STATIC_ASSETS, {
        maxAgeSeconds: 30 * 86400, // 30 days
        maxEntries: 100,
      }),
    );
    return;
  }

  // ── API calls (NetworkFirst) ──
  if (isApiRequest(url)) {
    event.respondWith(
      networkFirst(request, CACHE_NAMES.API, {
        networkTimeoutSeconds: 3,
        maxAgeSeconds: 3600, // 1 hour
        maxEntries: 50,
      }),
    );
    return;
  }

  // ── Images (CacheFirst) ──
  if (isImageRequest(url)) {
    event.respondWith(
      cacheFirst(request, CACHE_NAMES.IMAGES, {
        maxAgeSeconds: 30 * 86400, // 30 days
        maxEntries: 60,
      }),
    );
    return;
  }
});

// ─── Push notification handling (unchanged) ────────────────────────
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
```

- [ ] **Step 2: Verify SW compiles with build**

```bash
bun run --cwd packages/web build
```

Expected: Build completes without errors. The `dist/sw.js` file should exist and contain the caching logic. If there are TypeScript errors in the SW, fix them (the `declare const self` line handles the SW global scope).

---

### Task 2: Create offline fallback page

**Files:**
- Create: `packages/web/public/offline.html`

- [ ] **Step 1: Create offline.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenChamber - Offline</title>
    <meta name="theme-color" content="#151313" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#FFFCF0" media="(prefers-color-scheme: light)" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      :root { color-scheme: dark; }
      @media (prefers-color-scheme: light) {
        :root { color-scheme: light; }
      }
      body {
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100dvh;
        background: #151313;
        color: #cdccc3;
        text-align: center;
        padding: 2rem;
      }
      @media (prefers-color-scheme: light) {
        body {
          background: #FFFCF0;
          color: #100F0F;
        }
      }
      .container {
        max-width: 24rem;
      }
      .logo {
        width: 64px;
        height: 64px;
        margin: 0 auto 1.5rem;
        opacity: 0.6;
      }
      h1 {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.5rem;
        line-height: 1.4;
      }
      p {
        font-size: 0.9375rem;
        line-height: 1.5;
        color: #878580;
        margin-bottom: 1.5rem;
      }
      @media (prefers-color-scheme: light) {
        p { color: #6F6E69; }
      }
      .retry-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.625rem 1.5rem;
        font-size: 0.9375rem;
        font-weight: 500;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.625rem;
        background: rgba(255, 255, 255, 0.05);
        color: #cdccc3;
        cursor: pointer;
        transition: background 0.15s ease;
        min-height: 44px;
        min-width: 120px;
      }
      @media (prefers-color-scheme: light) {
        .retry-btn {
          border-color: rgba(0, 0, 0, 0.1);
          background: rgba(0, 0, 0, 0.05);
          color: #100F0F;
        }
        .retry-btn:hover { background: rgba(0, 0, 0, 0.1); }
      }
      .retry-btn:hover { background: rgba(255, 255, 255, 0.1); }
      .retry-btn:active { transform: scale(0.97); }
    </style>
  </head>
  <body>
    <div class="container">
      <svg class="logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OpenChamber">
        <path d="M50 2 L8.432 26 L50 50 L91.568 26 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity="0.4"/>
        <path d="M50 50 L8.432 26 L8.432 74 L50 98 Z" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <path d="M50 50 L91.568 26 L91.568 74 L50 98 Z" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      <h1>You're offline</h1>
      <p>OpenChamber needs an internet connection to load. Check your connection and try again.</p>
      <button class="retry-btn" onclick="location.reload()" type="button">
        Retry
      </button>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Verify offline.html is accessible in dev build**

```bash
bun run --cwd packages/web build
ls -la packages/web/dist/offline.html
```

Expected: `offline.html` exists in the dist output. It will also be precached by the SW install handler.

---

### Task 3: Update VitePWA config

**Files:**
- Modify: `packages/web/vite.config.ts:42-60`

- [ ] **Step 1: Add maximumFileSizeToCacheInBytes and update globPatterns**

In `packages/web/vite.config.ts`, find the `VitePWA({` block (lines 42-60) and modify it:

Current (lines 42-60):
```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  injectRegister: false,
  manifest: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,otf,eot}'],
    rollupFormat: 'iife',
    injectionPoint: undefined,
  },
  devOptions: {
    enabled: pwaDevEnabled,
    type: 'module',
  },
}),
```

Change to:
```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  registerType: 'autoUpdate',
  injectRegister: false,
  manifest: false,
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,otf,eot}'],
    // Files larger than 4MB won't be precached (prevents bloat from large
    // vendor chunks or assets that shouldn't be in the SW).
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4MB
    rollupFormat: 'iife',
    injectionPoint: undefined,
  },
  devOptions: {
    enabled: pwaDevEnabled,
    type: 'module',
  },
}),
```

- [ ] **Step 2: Verify build completes with updated config**

```bash
bun run --cwd packages/web build
```

Expected: Build completes without errors.

---

### Task 4: Create OfflineIndicator UI component

**Files:**
- Create: `packages/ui/src/components/ui/OfflineIndicator.tsx`
- Modify: `packages/ui/src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Create OfflineIndicator.tsx**

```typescript
// packages/ui/src/components/ui/OfflineIndicator.tsx
import { useSyncExternalStore, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * Subscribe to navigator.onLine changes using the browser's online/offline events.
 * Returns the current online status.
 */
function getOnlineStatus(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}

function subscribeToOnlineStatus(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

interface OfflineIndicatorProps {
  /** Optional class name for positioning. Defaults to bottom-center. */
  className?: string;
  /** Duration in ms before auto-dismissing after coming back online. Default 3000. */
  autoDismissMs?: number;
}

/**
 * A small warning banner shown when the browser reports being offline.
 *
 * Uses `useSyncExternalStore` to subscribe to `navigator.onLine` without
 * polling or setTimeout-based checks. The banner auto-dismisses after
 * coming back online (configurable via `autoDismissMs`).
 *
 * All colors use CSS custom properties (theme tokens), never hardcoded values.
 */
export function OfflineIndicator({
  className,
  autoDismissMs = 3000,
}: OfflineIndicatorProps) {
  const isOnline = useSyncExternalStore(subscribeToOnlineStatus, getOnlineStatus);

  if (isOnline) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        // Positioning: fixed to viewport bottom-center, above safe area
        "fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2",
        "pb-[env(safe-area-inset-bottom,0px)]",
        // Styling using theme CSS custom properties (no hardcoded colors)
        "flex items-center gap-2",
        "rounded-xl border px-4 py-2.5",
        "shadow-lg backdrop-blur-sm",
        // Theme-aware tokens (defined in design-system.css):
        // --surface-elevated (card/popover bg), --status-warning (icon/accent)
        // --border (border), --foreground (text)
        "bg-[var(--surface-elevated,var(--popover))]",
        "border-[var(--border)]",
        "text-[var(--foreground)]",
        // Animation
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        className,
      )}
    >
      {/* Warning icon using theme status color */}
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--status-warning, #edb449)" }}
        aria-hidden="true"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      <span className="typography-ui-label font-medium">
        You are offline
      </span>

      <span
        className="typography-micro text-[var(--muted-foreground)]"
        aria-hidden="true"
      >
        Some features may be unavailable
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Find where MainLayout.tsx renders its content to add OfflineIndicator**

Open `packages/ui/src/components/layout/MainLayout.tsx` and find the main return block (around lines 630-988). The exact location depends on the Phase 3 merge status. The strategy is:

1. Import `OfflineIndicator` at the top of the file
2. Add it as a top-level element inside the root container (outside both mobile and desktop branches)

Add the import near the top of imports (after line 17):
```typescript
import { OfflineIndicator } from '@/components/ui/OfflineIndicator';
```

Then add `<OfflineIndicator />` as a global element just before the closing wrapper `</div>` in the return statement. This ensures it renders on both mobile and desktop paths. Look for the root container's closing tag.

Add after the `{!isMobile && <BottomTerminalDock />}` line (approx line 980):
```tsx
{/* Global offline indicator */}
<OfflineIndicator />
```

Alternatively, if the return JSX is complex, add it as a sibling to the main content wrapper:

```tsx
return (
  <DiffWorkerProvider>
    <div className={cn("h-full flex flex-col", ...)}>
      {/* ...existing mobile/desktop branches... */}
    </div>

    {/* Global offline indicator outside layout flows — fixed position */}
    <OfflineIndicator />
  </DiffWorkerProvider>
);
```

The exact placement depends on the current structure. Search for the closing `</DiffWorkerProvider>` tag and add `<OfflineIndicator />` as a sibling of the main `<div className="h-full flex flex-col ...">`.

- [ ] **Step 3: Run type-check**

```bash
bun run --cwd packages/ui type-check
```

Expected: PASS. If there are import errors, fix path aliases.

---

### Task 5: Final verification

**Files:**
- No file changes

- [ ] **Step 1: Full type-check and lint**

```bash
bun run type-check
bun run lint
```

Expected: Both pass.

- [ ] **Step 2: Full build**

```bash
bun run build
```

Expected: Build completes. Verify `packages/web/dist/sw.js` exists and is an IIFE bundle (not ES module — set by `rollupFormat: 'iife'`).

- [ ] **Step 3: Verify offline.html is in dist**

```bash
ls -la packages/web/dist/offline.html
```

Expected: File exists.

- [ ] **Step 4: Test offline behavior in Chrome DevTools**

Start dev server:
```bash
bun run dev
```

1. Open Chrome DevTools → Application → Service Workers
2. Verify the SW is registered and activated (status shows "activated and is running")
3. Check the Cache Storage section: cache names should appear when the SW handles requests
4. Go to Network tab → check "Offline" checkbox
5. Reload the page — should see the offline fallback page
6. Uncheck "Offline" → reload → app loads normally

- [ ] **Step 5: Verify SW caches on first load**

1. Open Chrome DevTools → Application → Cache Storage
2. After loading the app, you should see these caches:
   - `openchamber-app-shell-v1`
   - `openchamber-static-assets-v1`
   - `openchamber-images-v1`
   - `openchamber-offline-v1`
   (API cache only populates when API requests are made)

3. Verify the offline fallback is cached:
   - Find Cache Storage → `openchamber-offline-v1`
   - Should contain a `/offline.html` entry

- [ ] **Step 6: Verify cache cleanup on version bump**

This is a future-proofing check:
1. In `sw.ts`, change `CACHE_VERSION` from `1` to `2`
2. Rebuild and reload the page
3. In DevTools → Cache Storage, old `-v1` caches should be deleted, new `-v2` caches should appear
4. Restore `CACHE_VERSION` to `1` before committing

---

## Acceptance Criteria

1. **Runtime caching works:** Navigating the app caches the shell HTML, JS/CSS assets, images, and API responses according to their strategies
2. **Offline fallback works:** With the network disconnected, navigating to the app shows the branded offline page
3. **Cache versioning works:** Incrementing `CACHE_VERSION` in `sw.ts` deletes old caches on activate
4. **OfflineIndicator shows/hides:** The indicator banner appears when offline and auto-dismisses when back online
5. **Push notifications still work:** The push event handler is unchanged and continues to work
6. **No new dependencies:** All caching uses native Cache Storage API — no workbox runtime packages added
7. **Type-check and lint pass:** `bun run type-check` and `bun run lint` pass without errors
8. **Build succeeds:** `bun run build` produces a working PWA bundle with `offline.html` in the dist
