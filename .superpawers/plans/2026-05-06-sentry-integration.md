# Sentry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homegrown client error logging system with Sentry (`@sentry/react` client + `@sentry/node` server), add source map uploads, and remove all dead logging code.

**Architecture:** Client-side Sentry initializes in a new `sentry.ts` sidecar file imported before any app code in the React entry point. React 19's `reactErrorHandler()` hooks uncaught errors into Sentry. Custom error boundaries keep their UI but swap `logClientError` for `Sentry.captureException`. Server-side `@sentry/node` v8 uses `Sentry.setupExpressErrorHandler(app)` (no separate request/error handler middleware in v8). Server Sentry inits via an `instrument.mjs` sidecar imported as the first line of `index.js` (required for OpenTelemetry auto-instrumentation). The old `clientErrorLogger.ts`, `/api/client-log` endpoint, and `client-log.js` are removed.

**Tech Stack:** `@sentry/react` ≥8.0, `@sentry/node` ≥8.0, `@sentry/vite-plugin`, React 19.1, Vite 7, Express

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| ErrorBoundary approach | Keep custom components, swap logging call | Custom UI (copy button, reset, styled cards) must be preserved |
| Global error handlers | Remove — Sentry auto-captures | `window.onerror` and `unhandledrejection` are handled by the SDK |
| Lifecycle info logs (`logClientInfo`) | Replace with `Sentry.addBreadcrumb` | Lifecycle events contextualize errors; breadcrumbs show in error events |
| DSN env var | `VITE_SENTRY_DSN` (client), `SENTRY_DSN` (server) | Follows existing `VITE_*` pattern |
| Source maps | `sentryVitePlugin` with `sourcemap: "hidden"` | Vite 7 build, standard approach |
| Server init placement | `instrument.mjs` imported as first line of `index.js` | Sentry v8 requires init before other imports for OTEL auto-instrumentation |
| Electron phase | Deferred to Phase 4 | User scoped current work to Phases 1-3 |

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `packages/ui/src/lib/sentry.ts` | Sentry client init (`Sentry.init()`) — uses `__APP_VERSION__` global |
| `packages/web/server/instrument.mjs` | Sentry server init — imported first in `index.js` |

### Modified Files
| File | Change |
|------|--------|
| `packages/ui/src/main.tsx` | Import `sentry.ts` first, add `reactErrorHandler()` to `createRoot` |
| `packages/ui/src/components/ui/ErrorBoundary.tsx` | Replace `logClientError` → `Sentry.captureException` |
| `packages/ui/src/components/chat/ChatErrorBoundary.tsx` | Replace `logClientError` → `Sentry.captureException` |
| `packages/ui/src/components/chat/ChatErrorBoundary.test.ts` | Update test for new logging call |
| `packages/ui/src/App.tsx` | Remove global error handlers, replace `logClient*` with breadcrumbs |
| `packages/ui/src/sync/sync-context.tsx` | Replace `logClientError` → `Sentry.captureException` |
| `packages/web/vite.config.ts` | Add `sentryVitePlugin`, set `sourcemap: "hidden"` |
| `packages/web/server/index.js` | Import `instrument.mjs` first, add `Sentry.setupExpressErrorHandler(app)` after routes |
| `packages/web/server/lib/opencode/bootstrap-runtime.js` | Remove `registerClientLogRoutes` from deps and call |
| `packages/ui/package.json` | Add `@sentry/react` dependency |
| `packages/web/package.json` | Add `@sentry/node` dependency |

### Deleted Files
| File | Reason |
|------|--------|
| `packages/ui/src/lib/clientErrorLogger.ts` | Replaced by Sentry |
| `packages/web/server/lib/client-log.js` | `/api/client-log` no longer needed |

---

## Task 1: Install Sentry Dependencies

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/web/package.json`

- [ ] **Step 1: Add `@sentry/react` to the UI package**

```bash
cd /home/breadcat/Projects/openchamber && bun add @sentry/react --cwd packages/ui
```

- [ ] **Step 2: Add `@sentry/node` and `@sentry/vite-plugin` to the web package**

```bash
cd /home/breadcat/Projects/openchamber && bun add @sentry/node --cwd packages/web && bun add -d @sentry/vite-plugin --cwd packages/web
```

- [ ] **Step 3: Verify installations**

```bash
cd /home/breadcat/Projects/openchamber && bun install && grep '@sentry' packages/ui/package.json packages/web/package.json
```

Expected: `@sentry/react` in `packages/ui/package.json`, `@sentry/node` and `@sentry/vite-plugin` in `packages/web/package.json`

- [ ] **Step 4: Commit**

```bash
git add packages/ui/package.json packages/web/package.json bun.lock
git commit -m "chore: add @sentry/react, @sentry/node, @sentry/vite-plugin dependencies"
```

---

## Task 2: Create Client-Side Sentry Instrumentation

**Files:**
- Create: `packages/ui/src/lib/sentry.ts`

- [ ] **Step 1: Create the Sentry init module**

Create `packages/ui/src/lib/sentry.ts`:

```typescript
import * as Sentry from '@sentry/react';

declare const __APP_VERSION__: string | undefined;

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: __APP_VERSION__,

    sendDefaultPii: false,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check 2>&1 | tail -5
```

Expected: type-check passes (the file is not imported yet, but it must compile cleanly)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/sentry.ts
git commit -m "feat(sentry): add client-side Sentry instrumentation module"
```

---

## Task 3: Wire Sentry Into React Entry Point

**Files:**
- Modify: `packages/ui/src/main.tsx`

- [ ] **Step 1: Update `main.tsx` to import Sentry first and use `reactErrorHandler()`**

The file is `packages/ui/src/main.tsx` (63 lines). Apply these changes:

1. Add `import './lib/sentry'` as the **very first import** (line 1)
2. Add `import { reactErrorHandler } from '@sentry/react'` import
3. Wrap `createRoot` call with `reactErrorHandler()` (React 19 pattern)

Full updated file:

```typescript
import './lib/sentry';

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import './styles/fonts'
import './index.css'
import App from './App.tsx'
import { SessionAuthGate } from './components/auth/SessionAuthGate'
import { ThemeSystemProvider } from './contexts/ThemeSystemContext'
import { ThemeProvider } from './components/providers/ThemeProvider'
import './lib/debug'
import { syncDesktopSettings, initializeAppearancePreferences } from './lib/persistence'
import { startAppearanceAutoSave } from './lib/appearanceAutoSave'
import { applyPersistedDirectoryPreferences } from './lib/directoryPersistence'
import { startTypographyWatcher } from './lib/typographyWatcher'
import { startModelPrefsAutoSave } from './lib/modelPrefsAutoSave'
import type { RuntimeAPIs } from './lib/api/types'

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

const runtimeAPIs = (typeof window !== 'undefined' && window.__OPENCHAMBER_RUNTIME_APIS__) || (() => {
  throw new Error('Runtime APIs not provided for legacy UI entrypoint.');
})();

// Initialize settings asynchronously — the app renders with defaults first
// and hydrates once persisted preferences are applied. Users with non-default
// themes may briefly see default appearance on cold start; accepted trade-off
// for faster time-to-first-paint.
void initializeAppearancePreferences().then(() => {
  void Promise.all([
    syncDesktopSettings(),
    applyPersistedDirectoryPreferences(),
  ]).catch((err) => {
    console.error('[main] settings init failed:', err);
  });

  // Start watchers regardless of whether secondary settings succeed.
  startAppearanceAutoSave();
  startModelPrefsAutoSave();
  startTypographyWatcher();
}).catch((err) => {
  console.error('[main] appearance init failed:', err);
});


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <ThemeSystemProvider>
      <ThemeProvider>
        <SessionAuthGate>
          <App apis={runtimeAPIs} />
        </SessionAuthGate>
      </ThemeProvider>
    </ThemeSystemProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Verify type-check passes**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

Expected: passes

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/main.tsx
git commit -m "feat(sentry): wire Sentry into React 19 entry point with reactErrorHandler"
```

---

## Task 4: Update ErrorBoundary to Use Sentry

**Files:**
- Modify: `packages/ui/src/components/ui/ErrorBoundary.tsx`

- [ ] **Step 1: Replace `logClientError` with `Sentry.captureException`**

In `packages/ui/src/components/ui/ErrorBoundary.tsx`:

Replace the import on line 6:
```typescript
import { logClientError } from '@/lib/clientErrorLogger';
```
with:
```typescript
import * as Sentry from '@sentry/react';
```

Replace the `componentDidCatch` body (lines 30-38):
```typescript
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo, copied: false });

    console.error('Error caught by boundary:', error, errorInfo);

    logClientError(error, {
      componentStack: errorInfo.componentStack ?? null,
      source: 'ErrorBoundary',
    });
  }
```
with:
```typescript
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo, copied: false });

    console.error('Error caught by boundary:', error, errorInfo);

    Sentry.captureException(error, {
      extra: {
        componentStack: errorInfo.componentStack ?? null,
        source: 'ErrorBoundary',
      },
    });
  }
```

- [ ] **Step 2: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/ui/ErrorBoundary.tsx
git commit -m "refactor(sentry): replace logClientError with Sentry.captureException in ErrorBoundary"
```

---

## Task 5: Update ChatErrorBoundary to Use Sentry

**Files:**
- Modify: `packages/ui/src/components/chat/ChatErrorBoundary.tsx`
- Modify: `packages/ui/src/components/chat/ChatErrorBoundary.test.ts`

- [ ] **Step 1: Replace `logClientError` with `Sentry.captureException`**

In `packages/ui/src/components/chat/ChatErrorBoundary.tsx`:

Replace the import on line 3:
```typescript
import { logClientError } from '@/lib/clientErrorLogger';
```
with:
```typescript
import * as Sentry from '@sentry/react';
```

Replace the `componentDidCatch` body (lines 28-33):
```typescript
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    logClientError(error, { source: 'ChatErrorBoundary', sessionId: this.props.sessionId, componentStack: errorInfo.componentStack });
    if (process.env.NODE_ENV === 'development') {
      console.error('Chat error caught by boundary:', error, errorInfo);
    }
  }
```
with:
```typescript
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    Sentry.captureException(error, {
      extra: {
        source: 'ChatErrorBoundary',
        sessionId: this.props.sessionId ?? null,
        componentStack: errorInfo.componentStack,
      },
    });
    if (process.env.NODE_ENV === 'development') {
      console.error('Chat error caught by boundary:', error, errorInfo);
    }
  }
```

- [ ] **Step 2: Update the test file**

In `packages/ui/src/components/chat/ChatErrorBoundary.test.ts`, the test calls `componentDidCatch` which previously called `logClientError` and now calls `Sentry.captureException`. Update to verify no crash:

```typescript
import { describe, expect, test, vi } from "bun:test"
import * as Sentry from "@sentry/react"
import { ChatErrorBoundary } from "./ChatErrorBoundary"

describe("ChatErrorBoundary", () => {
  test("captures errors without crashing", () => {
    const boundary = new ChatErrorBoundary({ children: null, sessionId: "test-session" })
    const error = new Error("test chat error")
    const nextState = (ChatErrorBoundary as unknown as { getDerivedStateFromError: (e: Error) => unknown }).getDerivedStateFromError(error)
    expect(nextState).toEqual({ hasError: true, error })
    const captureSpy = vi.spyOn(Sentry, "captureException").mockImplementation(() => undefined)
    boundary.componentDidCatch(error, { componentStack: "\n    at ChatMessage\n    at div" } as React.ErrorInfo)
    expect(captureSpy).toHaveBeenCalledWith(error, expect.objectContaining({
      extra: expect.objectContaining({ source: 'ChatErrorBoundary', sessionId: 'test-session' }),
    }))
    captureSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run the test**

```bash
cd /home/breadcat/Projects/openchamber && bun test packages/ui/src/components/chat/ChatErrorBoundary.test.ts
```

Expected: PASS

- [ ] **Step 4: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/chat/ChatErrorBoundary.tsx packages/ui/src/components/chat/ChatErrorBoundary.test.ts
git commit -m "refactor(sentry): replace logClientError with Sentry.captureException in ChatErrorBoundary"
```

---

## Task 6: Replace App.tsx Global Handlers and Lifecycle Logging

**Files:**
- Modify: `packages/ui/src/App.tsx`

- [ ] **Step 1: Replace imports and remove global error handlers**

In `packages/ui/src/App.tsx`, the following changes are needed:

1. Replace the `logClientError`, `logClientInfo`, `flushClientLogs` import (line 61) with a Sentry import
2. Remove the `window.onerror` handler (lines ~222-229)
3. Remove the `unhandledrejection` handler (lines ~230-232)
4. Replace `logClientInfo('App init started', ...)` with a breadcrumb
5. Replace `logClientInfo('App init: calling initializeApp')` with a breadcrumb
6. Replace `logClientInfo('App init: initializeApp succeeded')` with a breadcrumb
7. Replace `logClientError(err, { source: 'initializeApp' })` with `Sentry.captureException`
8. Remove the `beforeunload`/`pagehide` flush handler

The import change (line ~61):
```typescript
// REMOVE this import:
import { logClientError, logClientInfo, flushClientLogs } from '@/lib/clientErrorLogger';
// REPLACE with:
import * as Sentry from '@sentry/react';
```

The global error handler removal (lines ~222-232). Remove the entire `window.addEventListener('error', ...)` block and the `window.addEventListener('unhandledrejection', ...)` block. Sentry's SDK captures these automatically.

The `beforeunload`/`pagehide` handler removal (lines ~247-249). Remove the listeners that call `flushClientLogs()`. Sentry handles its own transport.

Replace lifecycle logging calls:
```typescript
// BEFORE:
logClientInfo('App init started', { userAgent: navigator.userAgent });
// AFTER:
Sentry.addBreadcrumb({ category: 'app', message: 'App init started', level: 'info', data: { userAgent: navigator.userAgent } });
```

```typescript
// BEFORE:
logClientInfo('App init: calling initializeApp');
// AFTER:
Sentry.addBreadcrumb({ category: 'app', message: 'App init: calling initializeApp', level: 'info' });
```

```typescript
// BEFORE:
logClientInfo('App init: initializeApp succeeded');
// AFTER:
Sentry.addBreadcrumb({ category: 'app', message: 'App init: initializeApp succeeded', level: 'info' });
```

```typescript
// BEFORE:
logClientError(err, { source: 'initializeApp' });
// AFTER:
Sentry.captureException(err, { extra: { source: 'initializeApp' } });
```

- [ ] **Step 2: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/App.tsx
git commit -m "refactor(sentry): replace global error handlers and lifecycle logging with Sentry"
```

---

## Task 7: Replace sync-context Error Logging

**Files:**
- Modify: `packages/ui/src/sync/sync-context.tsx`

- [ ] **Step 1: Replace `logClientError` with `Sentry.captureException`**

In `packages/ui/src/sync/sync-context.tsx`:

Replace the import (line 32):
```typescript
import { logClientError } from "@/lib/clientErrorLogger"
```
with:
```typescript
import * as Sentry from "@sentry/react"
```

Replace the event handler error log (line ~1278):
```typescript
logClientError(error, { source: "sync-event-handler", eventType: payload.type, sessionID, messageID, directory: resolvedDirectory })
```
with:
```typescript
Sentry.captureException(error, {
  extra: {
    source: "sync-event-handler",
    eventType: payload.type,
    sessionID,
    messageID,
    directory: resolvedDirectory,
  },
})
```

Replace the resync error log (line ~1431):
```typescript
.catch((error) => { console.error("[sync-context] Resync failed for", directory, error); logClientError(error, { source: "sync-resync", directory }) })
```
with:
```typescript
.catch((error) => {
  console.error("[sync-context] Resync failed for", directory, error);
  Sentry.captureException(error, { extra: { source: "sync-resync", directory } });
})
```

- [ ] **Step 2: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/sync/sync-context.tsx
git commit -m "refactor(sentry): replace logClientError with Sentry.captureException in sync-context"
```

---

## Task 8: Remove clientErrorLogger.ts (Dead Code Cleanup)

**Files:**
- Delete: `packages/ui/src/lib/clientErrorLogger.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd /home/breadcat/Projects/openchamber && grep -r 'clientErrorLogger' packages/ --include='*.ts' --include='*.tsx'
```

Expected: zero results (all consumers replaced in Tasks 4-7)

- [ ] **Step 2: Delete the file**

```bash
rm packages/ui/src/lib/clientErrorLogger.ts
```

- [ ] **Step 3: Verify type-check and lint**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check && bun run lint
```

Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add -u packages/ui/src/lib/clientErrorLogger.ts
git commit -m "chore(sentry): remove homegrown clientErrorLogger.ts"
```

---

## Task 9: Remove Server-Side Client Log Route

**Files:**
- Delete: `packages/web/server/lib/client-log.js`
- Modify: `packages/web/server/index.js` (remove import and dependency injection)
- Modify: `packages/web/server/lib/opencode/bootstrap-runtime.js` (remove from deps and call)

- [ ] **Step 1: Remove the import and dependency in `packages/web/server/index.js`**

Remove line 63:
```javascript
import { registerClientLogRoutes } from './lib/client-log.js';
```

Remove from the dependency object passed to `createBootstrapRuntime` (around line 786-793). Remove the line:
```javascript
    registerClientLogRoutes,
```

- [ ] **Step 2: Remove from `packages/web/server/lib/opencode/bootstrap-runtime.js`**

Remove from the dependency destructuring (line 10):
```javascript
    registerClientLogRoutes,
```

Remove the call block (lines 123-127):
```javascript
    registerClientLogRoutes(app, {
      fs,
      path,
      openchamberDataDir,
    });
```

- [ ] **Step 3: Delete the file**

```bash
rm packages/web/server/lib/client-log.js
```

- [ ] **Step 4: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

- [ ] **Step 5: Commit**

```bash
git add -u packages/web/server/lib/client-log.js packages/web/server/index.js packages/web/server/lib/opencode/bootstrap-runtime.js
git commit -m "chore(sentry): remove /api/client-log endpoint and server-side log receiver"
```

---

## Task 10: Configure Vite Source Maps Plugin

**Files:**
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 1: Add `sentryVitePlugin` to Vite config**

In `packages/web/vite.config.ts`:

1. Add the import at the top:
```typescript
import { sentryVitePlugin } from '@sentry/vite-plugin';
```

2. Add `sourcemap: "hidden"` to the `build` section:
```typescript
  build: {
    sourcemap: 'hidden',
    // ... existing rollupOptions etc.
  },
```

3. Add the plugin to the `plugins` array:
```typescript
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: process.env.SENTRY_RELEASE ?? undefined,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
    }),
```

The plugin is a no-op when `SENTRY_AUTH_TOKEN` is not set (local dev), so it's safe to include unconditionally.

- [ ] **Step 2: Verify the build works**

```bash
cd /home/breadcat/Projects/openchamber && bun run build 2>&1 | tail -10
```

Expected: build succeeds (source maps generated, upload skipped gracefully without auth token)

- [ ] **Step 3: Commit**

```bash
git add packages/web/vite.config.ts
git commit -m "feat(sentry): add sentryVitePlugin for source map uploads"
```

---

## Task 11: Add Server-Side Sentry for Express

**Files:**
- Create: `packages/web/server/instrument.mjs`
- Modify: `packages/web/server/index.js`

- [ ] **Step 1: Create server-side Sentry instrument module**

Create `packages/web/server/instrument.mjs`. This file must be imported as the very first line of `index.js` so that Sentry's OpenTelemetry auto-instrumentation hooks module loads:

```javascript
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? undefined,
    sendDefaultPii: false,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}
```

No explicit `httpIntegration()` or `expressIntegration()` — Sentry v8 auto-discovers these. No separate request/error handler middleware — v8 uses `Sentry.setupExpressErrorHandler(app)` instead.

- [ ] **Step 2: Wire Sentry into `packages/web/server/index.js`**

**Add as the very first line of `index.js`** (before `import 'reflect-metadata'` on line 1):

```javascript
import './instrument.mjs';
```

**Add `Sentry.setupExpressErrorHandler(app)` after all route registration** — this replaces the old v7 `Sentry.handlers.errorHandler()`. Find the point after `bootstrapRuntime.setupBaseRoutes(...)` completes and before the server starts listening. Add:

```javascript
  Sentry.setupExpressErrorHandler(app);
```

This must come after all routes are registered (after `setupBaseRoutes`) but before `server.listen()`.

Also add the import for Sentry at the top (after the instrument import):
```javascript
import * as Sentry from '@sentry/node';
```

The middleware order:
1. `import './instrument.mjs'` — line 1 (Sentry init)
2. `compression()` — line 1045
3. `bootstrapRuntime.setupBaseRoutes()` — line 1056 (all app routes)
4. `Sentry.setupExpressErrorHandler(app)` — NEW (after all routes)
5. `server.listen(...)` — existing

- [ ] **Step 3: Verify type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

Expected: passes

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/instrument.mjs packages/web/server/index.js
git commit -m "feat(sentry): add @sentry/node for Express server-side error tracking"
```

---

## Task 12: Final Verification and Cleanup

**Files:** None (verification only)

- [ ] **Step 1: Run full type-check**

```bash
cd /home/breadcat/Projects/openchamber && bun run type-check
```

Expected: zero errors

- [ ] **Step 2: Run lint**

```bash
cd /home/breadcat/Projects/openchamber && bun run lint
```

Expected: zero errors

- [ ] **Step 3: Run full build**

```bash
cd /home/breadcat/Projects/openchamber && bun run build
```

Expected: build succeeds

- [ ] **Step 4: Run VS Code build** (shared UI imports `@sentry/react`)

```bash
cd /home/breadcat/Projects/openchamber && bun run vscode:build
```

Expected: build succeeds

- [ ] **Step 5: Run tests**

```bash
cd /home/breadcat/Projects/openchamber && bun test
```

Expected: all tests pass (including updated ChatErrorBoundary test)

- [ ] **Step 6: Verify no dead references remain**

```bash
cd /home/breadcat/Projects/openchamber && grep -r 'clientErrorLogger\|logClientError\|logClientInfo\|logClientWarning\|flushClientLogs\|client-log' packages/ --include='*.ts' --include='*.tsx' --include='*.js'
```

Expected: zero results

- [ ] **Step 7: Commit if any lint fixes were needed**

```bash
git add -A
git commit -m "chore(sentry): final cleanup after Sentry integration"
```

---

## Environment Variables Required

Add to `.env` (never commit real values):

```bash
# Sentry — client-side (Vite injects these at build time)
VITE_SENTRY_DSN=
# Sentry — server-side
SENTRY_DSN=
SENTRY_RELEASE=
# Sentry — source map upload (CI only)
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

The app is fully functional without these variables — `sentry.ts` guards with `if (dsn)` so the SDK is never initialized when the DSN is unset.
