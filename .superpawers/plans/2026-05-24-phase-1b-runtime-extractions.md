# Phase 1b: Runtime Extractions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract 4 domain runtimes (EventStream, Notification, Session, Tunnel) from `index.js` (809→~450 lines) onto a typed EventBus.

**Architecture:** Each runtime takes `eventBus` as its sole inter-runtime communication channel. No runtime holds a direct reference to another runtime. Named event map in `events.js` prevents string typos.

**Tech Stack:** Express, EventBus pattern with JSDoc generics, Vitest, plain JS.

---

### Task 1: EventBus Upgrade — typed event map + constants

**Files:**
- Create: `packages/web/server/lib/core/events.js`
- Modify: `packages/web/server/lib/core/event-bus.js`

- [ ] **Step 1: Create `events.js` with ServerEvents type + EVENTS constants**

Write to `packages/web/server/lib/core/events.js`:

```js
// packages/web/server/lib/core/events.js
// @ts-check

/**
 * @typedef {{
 *   'opencode:ready': void
 *   'opencode:restarting': void
 *   'opencode:restarted': void
 *   'opencode:unhealthy': void
 *   'event:received': { payload: Record<string, unknown>; directory?: string }
 *   'session:activity-changed': { sessionId: string; phase: 'busy' | 'idle' | 'cooldown' }
 *   'session:needs-attention': { sessionId: string; needsAttention: boolean }
 *   'notification:send-ui': { payload: Record<string, unknown> }
 *   'notification:send-desktop': { payload: Record<string, unknown> }
 *   'notification:send-push': { payload: Record<string, unknown>; options?: Record<string, unknown> }
 *   'tunnel:ready': { url: string; provider: string }
 *   'tunnel:changed': { url: string; provider: string }
 *   'tunnel:error': { error: string }
 *   'server:port-bound': { port: number }
 * }} ServerEvents
 */

export const EVENTS = {
  OPENCODE_READY: 'opencode:ready',
  OPENCODE_RESTARTING: 'opencode:restarting',
  OPENCODE_RESTARTED: 'opencode:restarted',
  OPENCODE_UNHEALTHY: 'opencode:unhealthy',
  EVENT_RECEIVED: 'event:received',
  SESSION_ACTIVITY_CHANGED: 'session:activity-changed',
  SESSION_NEEDS_ATTENTION: 'session:needs-attention',
  NOTIFICATION_SEND_UI: 'notification:send-ui',
  NOTIFICATION_SEND_DESKTOP: 'notification:send-desktop',
  NOTIFICATION_SEND_PUSH: 'notification:send-push',
  TUNNEL_READY: 'tunnel:ready',
  TUNNEL_CHANGED: 'tunnel:changed',
  TUNNEL_ERROR: 'tunnel:error',
  SERVER_PORT_BOUND: 'server:port-bound',
};
```

- [ ] **Step 2: Add JSDoc generic type to `event-bus.js`**

Edit `packages/web/server/lib/core/event-bus.js`. Add the @template generic at the top of `createEventBus`:

```js
// The first line of the function changes from:
export function createEventBus() {

// To:
/** @template {Record<string, unknown>} Events
 * @returns {{
 *   on: <E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) => () => void,
 *   once: <E extends keyof Events>(event: E, handler: (payload: Events[E]) => void) => void,
 *   emit: <E extends keyof Events>(event: E, payload: Events[E]) => void,
 *   removeAllFor: <E extends keyof Events>(event: E) => void,
 *   dispose: () => void,
 * }}
 */
export function createEventBus() {
```

The existing implementation body stays identical — no runtime changes.

- [ ] **Step 3: Verify type-check passes**

Run: `bun run type-check`
Expected: all 5 packages pass (0 errors)

- [ ] **Step 4: Commit**

```bash
git add packages/web/server/lib/core/events.js packages/web/server/lib/core/event-bus.js
git commit -m "feat(event-bus): add typed ServerEvents map with EVENTS constants"
```

---

### Task 2: SessionRuntime — refactor to use EventBus

**Files:**
- Modify: `packages/web/server/lib/opencode/session/session-runtime.js`
- Modify: `packages/web/server/lib/opencode/session/session-runtime.test.js`

- [ ] **Step 1: Update test file**

Update `session-runtime.test.js`:

```js
import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createSessionRuntime } from './session-runtime.js';

describe('session-runtime', () => {
  /** @type {ReturnType<typeof createSessionRuntime>[]} */
  const runtimes = [];

  afterEach(() => {
    for (const r of runtimes) r.dispose();
    runtimes.length = 0;
  });

  it('broadcasts attention clears through emitted events', () => {
    /** @type {Array<{ type: string; payload: unknown }>} */
    const events = [];
    const eventBus = createEventBus();
    eventBus.on('session:activity-changed', (payload) => {
      events.push({ type: 'session:activity-changed', payload });
    });
    eventBus.on('session:needs-attention', (payload) => {
      events.push({ type: 'session:needs-attention', payload });
    });

    const runtime = createSessionRuntime({ eventBus });
    runtimes.push(runtime);

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'busy' } },
    });

    runtime.markUserMessageSent('session-1');

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'done' } },
    });

    runtime.markSessionViewed('session-1', 'client-1');

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'session:activity-changed')).toBe(true);
  });

  it('resets all session activity to idle', () => {
    const eventBus = createEventBus();
    const runtime = createSessionRuntime({ eventBus });
    runtimes.push(runtime);

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'busy' } },
    });

    expect(runtime.getSessionActivitySnapshot()).toEqual({
      'session-1': { type: 'busy' },
    });

    runtime.resetAllSessionActivityToIdle();

    expect(runtime.getSessionActivitySnapshot()).toEqual({
      'session-1': { type: 'idle' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run packages/web/server/lib/opencode/session/session-runtime.test.js`
Expected: FAIL — old runtime still expects old deps

- [ ] **Step 3: Refactor session-runtime.js**

Changes:

1. Add import at top: `import { EVENTS } from '../../core/events.js';`

2. Change signature:
```js
export const createSessionRuntime = ({ eventBus }) => {
```

3. Remove all usage of `writeSseEvent`, `getNotificationClients`, `broadcastEvent`:
   - Every `broadcastEvent({ type: 'openchamber:session-activity', ... })` call → `eventBus.emit(EVENTS.SESSION_ACTIVITY_CHANGED, { sessionId, phase })`
   - Every `broadcastEvent(syntheticPayload)` for `openchamber:session-status` → `eventBus.emit(EVENTS.SESSION_NEEDS_ATTENTION, { sessionId, needsAttention })`
   - Remove the `writeSseEvent` fallback blocks entirely (the `else if (clients.size > 0) { for... }` patterns)

4. Add at top of function body:
```js
const disposers = [];
```

5. Add after internal state initialization:
```js
disposers.push(
  eventBus.on(EVENTS.EVENT_RECEIVED, ({ payload }) => { processOpenCodeSsePayload(payload); }),
  eventBus.on(EVENTS.OPENCODE_READY, () => { resetAllSessionActivityToIdle(); }),
);
```

6. Update `dispose`:
```js
dispose: () => {
  disposers.forEach(fn => fn());
  disposers.length = 0;
  clearInterval(cleanupInterval);
  for (const timer of sessionActivityCooldowns.values()) clearTimeout(timer);
  sessionActivityCooldowns.clear();
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run packages/web/server/lib/opencode/session/session-runtime.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/lib/opencode/session/session-runtime.js packages/web/server/lib/opencode/session/session-runtime.test.js
git commit -m "refactor(session): use EventBus instead of direct SSE/broadcast deps"
```

---

### Task 3: EventStreamRuntime — orchestrator for SSE/WS hub, watcher, emitter, push

**Files:**
- Modify: `packages/web/server/lib/event-stream/runtime.js` (extend existing)
- Modify: `packages/web/server/lib/event-stream/index.js` (add new export)
- Create: `packages/web/server/lib/event-stream/event-stream-runtime.test.js`

- [ ] **Step 1: Write the test first**

Create `packages/web/server/lib/event-stream/event-stream-runtime.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createEventStreamRuntime } from './runtime.js';

describe('event-stream-runtime', () => {
  it('broadcasts ui notification to sse clients', () => {
    const eventBus = createEventBus();
    const runtime = createEventStreamRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      process,
      fsPromises: null, path: null,
      readSettingsFromDiskMigrated: async () => ({}),
      writeSettingsToDisk: async () => {},
      pushSubscriptionsFilePath: '/tmp/test-push.json',
    });

    const messages = [];
    const fakeRes = { write: (data) => { messages.push(data); } };
    runtime.addUiNotificationClient(fakeRes);

    eventBus.emit('notification:send-ui', {
      payload: { type: 'test', title: 'hello' },
    });

    expect(messages.length).toBe(1);
    expect(messages[0]).toContain('hello');
  });

  it('emits event:received when upstream payload arrives', () => {
    const eventBus = createEventBus();
    const runtime = createEventStreamRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      process,
      fsPromises: null, path: null,
      readSettingsFromDiskMigrated: async () => ({}),
      writeSettingsToDisk: async () => {},
      pushSubscriptionsFilePath: '/tmp/test-push.json',
    });

    const received = [];
    eventBus.on('event:received', (payload) => { received.push(payload); });

    runtime.processUpstreamPayload({ type: 'session.status', properties: { sessionID: 's1' } });

    expect(received.length).toBe(1);
    expect(received[0].payload.type).toBe('session.status');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run packages/web/server/lib/event-stream/event-stream-runtime.test.js`
Expected: FAIL — `createEventStreamRuntime` not exported

- [ ] **Step 3: Extend `runtime.js` with EventStreamRuntime orchestrator**

Add to the bottom of `packages/web/server/lib/event-stream/runtime.js`:

```js
import webPush from 'web-push';
import { createNotificationEmitterRuntime } from '../notifications/emitter-runtime.js';
import { createPushRuntime } from '../notifications/push-runtime.js';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createOpenCodeWatcherRuntime } from '../opencode/services/watcher.js';
import { EVENTS } from '../core/events.js';

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
  const uiNotificationWsClients = new Set();
  const uiOpenChamberEventClients = new Set();
  const DESKTOP_NOTIFY_PREFIX = '[OpenChamberDesktopNotify] ';
  const getDesktopNotifyEnabled = () => false;

  let broadcastGlobalUiEventFn = null;
  const setBroadcastGlobalUiEvent = (fn) => { broadcastGlobalUiEventFn = fn; };

  const notificationEmitterRuntime = createNotificationEmitterRuntime({
    process,
    getDesktopNotifyEnabled,
    desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
    getUiNotificationClients: () => uiNotificationClients,
    getBroadcastGlobalUiEvent: () => broadcastGlobalUiEventFn,
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
    if (broadcastGlobalUiEventFn) { broadcastGlobalUiEventFn(payload); return; }
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
    getUiNotificationWsClients: () => uiNotificationWsClients,
    getUiOpenChamberEventClients: () => uiOpenChamberEventClients,
    pushRuntime,
    globalMessageStreamHub,
    setBroadcastGlobalUiEvent,
    dispose: () => {
      disposers.forEach(fn => fn());
      globalWatcherStartPromise = null;
    },
  };
};
```

- [ ] **Step 4: Update `event-stream/index.js` barrel**

Add to existing exports:
```js
export { createEventStreamRuntime } from './runtime.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun vitest run packages/web/server/lib/event-stream/event-stream-runtime.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/web/server/lib/event-stream/runtime.js packages/web/server/lib/event-stream/index.js packages/web/server/lib/event-stream/event-stream-runtime.test.js
git commit -m "feat(event-stream): add EventStreamRuntime orchestrator with watcher, emitter, push"
```

---

### Task 4: NotificationRuntime — orchestrator for template + trigger

**Files:**
- Rename: `packages/web/server/lib/notifications/runtime.js` → `trigger-runtime.js`
- Create: `packages/web/server/lib/notifications/runtime.js` (new orchestrator)
- Modify: `packages/web/server/lib/notifications/template-runtime.js`
- Modify: `packages/web/server/lib/notifications/trigger-runtime.js`
- Modify: `packages/web/server/lib/notifications/index.js`
- Create: `packages/web/server/lib/notifications/notification-runtime.test.js`

- [ ] **Step 1: Write the test first**

Create `packages/web/server/lib/notifications/notification-runtime.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createNotificationRuntime } from './runtime.js';

describe('notification-runtime', () => {
  it('emits notification events when event:received has matching payload', async () => {
    const eventBus = createEventBus();

    const emitted = [];
    eventBus.on('notification:send-ui', (p) => emitted.push(p));
    eventBus.on('notification:send-desktop', (p) => emitted.push(p));

    const runtime = createNotificationRuntime({
      eventBus,
      openCodeRuntime: { getUrl: () => '', getAuthHeaders: () => ({}) },
      readSettingsFromDisk: async () => ({ notifications: { pushEnabled: false, desktop: { enabled: false } } }),
      persistSettings: async () => {},
      resolveGitBinaryForSpawn: () => null,
    });

    await runtime.initialize();

    eventBus.emit('event:received', {
      payload: {
        type: 'message.updated',
        properties: {
          sessionID: 'test-session',
          message: { role: 'assistant', content: 'Hello', id: 'msg-1', finish: 'stop' },
        },
      },
    });

    const start = Date.now();
    while (emitted.length < 1 && Date.now() - start < 2000) {
      await new Promise(r => setTimeout(r, 10));
    }

    expect(emitted.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Rename existing `runtime.js` to `trigger-runtime.js`**

```bash
git mv packages/web/server/lib/notifications/runtime.js packages/web/server/lib/notifications/trigger-runtime.js
```

- [ ] **Step 3: Update `template-runtime.js` to use EventBus**

Add import: `import { EVENTS } from '../../core/events.js';`

Add `eventBus` to constructor deps:
```js
export const createNotificationTemplateRuntime = (deps) => {
  const { eventBus, readSettingsFromDisk, persistSettings, openCodeRuntime, resolveGitBinaryForSpawn } = deps;
```

Remove `emitDesktopNotification`, `broadcastUiNotification`, `sendPushToAllUiSessions` deps — those are now EventBus events.

In `validateZenModelAtStartup`, emit via EventBus on success:
```js
eventBus.emit(EVENTS.NOTIFICATION_SEND_UI, { payload: { type: 'zen-model-ready' } });
```

- [ ] **Step 4: Update `trigger-runtime.js` to use EventBus**

Add import: `import { EVENTS } from '../../core/events.js';`

Add `eventBus` to constructor deps:
```js
export const createNotificationTriggerRuntime = (deps) => {
  const { eventBus, readSettingsFromDisk, prepareNotificationLastMessage, summarizeText, resolveZenModel, buildTemplateVariables, extractLastMessageText, fetchLastAssistantMessageText, resolveNotificationTemplate, shouldApplyResolvedTemplateMessage, openCodeRuntime } = deps;
```

Remove `emitDesktopNotification`, `broadcastUiNotification`, `sendPushToAllUiSessions` from deps.

Replace every call:
- `emitDesktopNotification(notificationPayload)` → `eventBus.emit(EVENTS.NOTIFICATION_SEND_DESKTOP, { payload: notificationPayload })`
- `broadcastUiNotification(notificationPayload)` → `eventBus.emit(EVENTS.NOTIFICATION_SEND_UI, { payload: notificationPayload })`
- `sendPushToAllUiSessions(notificationPayload, options)` → `eventBus.emit(EVENTS.NOTIFICATION_SEND_PUSH, { payload: notificationPayload, options })`

- [ ] **Step 5: Create new `runtime.js` as orchestrator**

Write to `packages/web/server/lib/notifications/runtime.js`:

```js
import { createNotificationTemplateRuntime } from './template-runtime.js';
import { createNotificationTriggerRuntime } from './trigger-runtime.js';
import { EVENTS } from '../../core/events.js';

export const createNotificationRuntime = (deps) => {
  const { eventBus, openCodeRuntime, readSettingsFromDisk, persistSettings, resolveGitBinaryForSpawn } = deps;

  const templateRuntime = createNotificationTemplateRuntime({
    eventBus, readSettingsFromDisk, persistSettings, openCodeRuntime, resolveGitBinaryForSpawn,
  });

  const triggerRuntime = createNotificationTriggerRuntime({
    eventBus, readSettingsFromDisk, openCodeRuntime,
    prepareNotificationLastMessage: templateRuntime.prepareNotificationLastMessage,
    summarizeText: templateRuntime.summarizeText,
    resolveZenModel: templateRuntime.resolveZenModel,
    buildTemplateVariables: templateRuntime.buildTemplateVariables,
    extractLastMessageText: templateRuntime.extractLastMessageText,
    fetchLastAssistantMessageText: templateRuntime.fetchLastAssistantMessageText,
    resolveNotificationTemplate: templateRuntime.resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage: templateRuntime.shouldApplyResolvedTemplateMessage,
  });

  let initialized = false;

  const initialize = async () => {
    if (initialized) return;
    initialized = true;
    await templateRuntime.validateZenModelAtStartup();
    eventBus.on(EVENTS.EVENT_RECEIVED, ({ payload }) => {
      triggerRuntime.maybeSendPushForTrigger(payload);
    });
  };

  return { initialize, setAutoAcceptSession: triggerRuntime.setAutoAcceptSession };
};
```

- [ ] **Step 6: Update `notifications/index.js` barrel**

```js
export { createNotificationRuntime } from './runtime.js';
export { createNotificationEmitterRuntime } from './emitter-runtime.js';
export { createNotificationTriggerRuntime } from './trigger-runtime.js';
export { createNotificationTemplateRuntime } from './template-runtime.js';
export { createPushRuntime } from './push-runtime.js';
export { truncateNotificationText, prepareNotificationLastMessage } from './message.js';
```

- [ ] **Step 7: Run test**

Run: `bun vitest run packages/web/server/lib/notifications/notification-runtime.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/web/server/lib/notifications/
git commit -m "refactor(notifications): add NotificationRuntime orchestrator with EventBus dispatch"
```

---

### Task 5: TunnelRuntime — orchestrator for tunnel wiring

**Files:**
- Create: `packages/web/server/lib/tunnels/tunnel-runtime.js`
- Create: `packages/web/server/lib/tunnels/tunnel-runtime.test.js`

- [ ] **Step 1: Write the test first**

Create `packages/web/server/lib/tunnels/tunnel-runtime.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createTunnelRuntime } from './tunnel-runtime.js';

describe('tunnel-runtime', () => {
  it('initializes and provides tunnel context', () => {
    const eventBus = createEventBus();
    const runtime = createTunnelRuntime({
      eventBus,
      crypto: require('crypto'),
      URL: globalThis.URL,
      readSettingsFromDiskMigrated: async () => ({}),
      readManagedRemoteTunnelConfigFromDisk: async () => ({ tunnels: [], version: 1 }),
      normalizeTunnelProvider: (v) => v || null,
      normalizeTunnelMode: (v) => v || null,
      normalizeOptionalPath: (v) => v || null,
      normalizeManagedRemoteTunnelHostname: (v) => v || null,
      normalizeTunnelBootstrapTtlMs: (v) => v || 1800000,
      normalizeTunnelSessionTtlMs: (v) => v || 28800000,
      isSupportedTunnelMode: () => true,
      upsertManagedRemoteTunnelToken: async () => {},
      resolveManagedRemoteTunnelToken: async () => null,
      TUNNEL_MODE_QUICK: 'quick',
      TUNNEL_MODE_MANAGED_LOCAL: 'managed-local',
      TUNNEL_MODE_MANAGED_REMOTE: 'managed-remote',
      TUNNEL_PROVIDER_CLOUDFLARE: 'cloudflare',
      TunnelServiceError: class extends Error { constructor(msg, code) { super(msg); this.code = code; } },
    });

    const ctx = runtime.initialize({}, 3000);
    expect(ctx.tunnelService).toBeDefined();
    expect(typeof ctx.getActivePort).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun vitest run packages/web/server/lib/tunnels/tunnel-runtime.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TunnelRuntime**

Create `packages/web/server/lib/tunnels/tunnel-runtime.js`:

```js
import { createTunnelAuth } from '../opencode/auth/tunnel-auth.js';
import { createTunnelWiringRuntime } from '../opencode/network/tunnel-wiring-runtime.js';
import { createTunnelProviderRegistry } from '../tunnels/registry.js';
import { createCloudflareTunnelProvider } from '../tunnels/providers/cloudflare.js';
import { EVENTS } from '../../core/events.js';

export const createTunnelRuntime = (deps) => {
  const {
    eventBus, crypto, URL,
    readSettingsFromDiskMigrated, readManagedRemoteTunnelConfigFromDisk,
    normalizeTunnelProvider, normalizeTunnelMode, normalizeOptionalPath,
    normalizeManagedRemoteTunnelHostname, normalizeTunnelBootstrapTtlMs,
    normalizeTunnelSessionTtlMs, isSupportedTunnelMode,
    upsertManagedRemoteTunnelToken, resolveManagedRemoteTunnelToken,
    TUNNEL_MODE_QUICK, TUNNEL_MODE_MANAGED_LOCAL, TUNNEL_MODE_MANAGED_REMOTE,
    TUNNEL_PROVIDER_CLOUDFLARE, TunnelServiceError,
  } = deps;

  const tunnelProviderRegistry = createTunnelProviderRegistry([createCloudflareTunnelProvider()]);
  tunnelProviderRegistry.seal();

  const tunnelAuthController = createTunnelAuth();
  let activeTunnelController = null;
  let runtimeManagedRemoteTunnelHostname = '';
  let runtimeManagedRemoteTunnelToken = '';
  let tunnelWiringRuntime = null;

  const initialize = (app, port) => {
    tunnelWiringRuntime = createTunnelWiringRuntime({
      crypto, URL, tunnelProviderRegistry, tunnelAuthController,
      readSettingsFromDiskMigrated, readManagedRemoteTunnelConfigFromDisk,
      normalizeTunnelProvider, normalizeTunnelMode, normalizeOptionalPath,
      normalizeManagedRemoteTunnelHostname, normalizeTunnelBootstrapTtlMs,
      normalizeTunnelSessionTtlMs, isSupportedTunnelMode,
      upsertManagedRemoteTunnelToken, resolveManagedRemoteTunnelToken,
      TUNNEL_MODE_QUICK, TUNNEL_MODE_MANAGED_LOCAL, TUNNEL_MODE_MANAGED_REMOTE,
      TUNNEL_PROVIDER_CLOUDFLARE, TunnelServiceError,
      getActiveTunnelController: () => activeTunnelController,
      setActiveTunnelController: (v) => { activeTunnelController = v; },
      getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname,
      setRuntimeManagedRemoteTunnelHostname: (v) => { runtimeManagedRemoteTunnelHostname = v; },
      getRuntimeManagedRemoteTunnelToken: () => runtimeManagedRemoteTunnelToken,
      setRuntimeManagedRemoteTunnelToken: (v) => { runtimeManagedRemoteTunnelToken = v; },
    });

    const result = tunnelWiringRuntime.initialize(app, port);

    if (result.tunnelService) {
      const origStart = result.tunnelService.start;
      result.tunnelService.start = async (...args) => {
        const tunnelResult = await origStart.apply(result.tunnelService, args);
        const url = result.tunnelService.getPublicUrl();
        if (url) {
          const provider = result.tunnelService.resolveActiveProvider
            ? result.tunnelService.resolveActiveProvider()
            : TUNNEL_PROVIDER_CLOUDFLARE;
          eventBus.emit(EVENTS.TUNNEL_READY, { url, provider });
        }
        return tunnelResult;
      };
    }

    eventBus.emit(EVENTS.SERVER_PORT_BOUND, { port });
    return result;
  };

  return {
    initialize,
    getActiveTunnelController: () => activeTunnelController,
    getTunnelAuthController: () => tunnelAuthController,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun vitest run packages/web/server/lib/tunnels/tunnel-runtime.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add packages/web/server/lib/tunnels/tunnel-runtime.js packages/web/server/lib/tunnels/tunnel-runtime.test.js
git commit -m "feat(tunnels): add TunnelRuntime orchestrator with EventBus events"
```

---

### Task 6: Index.js cleanup — remove extracted wiring

**Files:**
- Modify: `packages/web/server/index.js`

- [ ] **Step 1: Update imports**

Add:
```js
import { createEventStreamRuntime } from './lib/event-stream/runtime.js';
import { createNotificationRuntime } from './lib/notifications/runtime.js';
import { createTunnelRuntime } from './lib/tunnels/tunnel-runtime.js';
```

Remove:
- `createGlobalUiEventBroadcaster`, `createGlobalMessageStreamHub`, `createMessageStreamWsRuntime` from event-stream barrel
- `createNotificationEmitterRuntime`, `createNotificationTriggerRuntime`, `createNotificationTemplateRuntime` from notifications barrel
- `createPushRuntime` from notifications barrel
- `createManagedTunnelConfigRuntime` and tunnel-specific import lines
- `createTunnelProviderRegistry`, `createCloudflareTunnelProvider`, `createTunnelAuth`
- `import webPush from 'web-push'` (moved to EventStreamRuntime)
- `prepareNotificationLastMessage` from notifications barrel

Keep all settings, theme, route, and infrastructure imports unchanged.

- [ ] **Step 2: Remove extracted module-level code**

Delete:
- `uiNotificationClients` Set, `uiNotificationWsClients` Set, `uiOpenChamberEventClients` Set
- `notificationEmitterRuntime` construction + all forwarding methods
- `writeSseEvent` forwarding
- `broadcastGlobalUiEvent` definition
- `globalMessageStreamHub` construction + subscriptions
- `openCodeWatcherRuntime` construction + `ensureGlobalWatcherStarted` + `globalWatcherStartPromise`
- `processForwardedEventPayload` function
- `notificationTemplateRuntime` construction + forwarding methods
- `notificationTriggerRuntime` construction + forwarding methods
- `tunnelProviderRegistry` construction + seal
- `tunnelAuthController` construction
- `activeTunnelController`, `runtimeManagedRemoteTunnelHostname`, `runtimeManagedRemoteTunnelToken` let vars
- `tunnelWiringRuntime` construction
- `sessionRuntime` construction (keep reference, change deps)
- `tunnelRuntimeContext = tunnelWiringRuntime.initialize(app, port)` line in main()
- `bootstrapOpenCodeAtStartup` function (watcher started by EventBus subscription)

- [ ] **Step 3: Add runtime construction block**

After `openCodeRuntime = createOpenCodeRuntime({...})`, add:

```js
const eventBus = createEventBus();

const eventStreamRuntime = createEventStreamRuntime({
  eventBus, openCodeRuntime, process, fsPromises, path,
  readSettingsFromDiskMigrated, writeSettingsToDisk,
  pushSubscriptionsFilePath: PUSH_SUBSCRIPTIONS_FILE_PATH,
});
const { writeSseEvent, ensureGlobalWatcherStarted, pushRuntime } = eventStreamRuntime;

const notificationRuntime = createNotificationRuntime({
  eventBus, openCodeRuntime, readSettingsFromDisk, persistSettings, resolveGitBinaryForSpawn,
});

const sessionRuntime = createSessionRuntime({ eventBus });
sessionRuntime.resetAllSessionActivityToIdle();

const tunnelRuntime = createTunnelRuntime({
  eventBus, crypto, URL,
  readSettingsFromDiskMigrated, readManagedRemoteTunnelConfigFromDisk,
  normalizeTunnelProvider, normalizeTunnelMode, normalizeOptionalPath,
  normalizeManagedRemoteTunnelHostname, normalizeTunnelBootstrapTtlMs,
  normalizeTunnelSessionTtlMs, isSupportedTunnelMode,
  upsertManagedRemoteTunnelToken, resolveManagedRemoteTunnelToken,
  TUNNEL_MODE_QUICK, TUNNEL_MODE_MANAGED_LOCAL, TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_PROVIDER_CLOUDFLARE, TunnelServiceError,
});
```

- [ ] **Step 4: Keep EventBus observability subscriptions**

Keep these in index.js at module scope:
```js
eventBus.on('opencode:ready', () => console.log('[event-bus] OpenCode server is ready'));
eventBus.on('opencode:restarting', () => console.log('[event-bus] OpenCode server restarting'));
eventBus.on('opencode:restarted', () => console.log('[event-bus] OpenCode server restarted'));
eventBus.on('opencode:unhealthy', () => console.log('[event-bus] OpenCode server health check failed'));
```

- [ ] **Step 5: Update `main()` to use tunnelRuntime**

Replace:
```js
const tunnelRuntimeContext = tunnelWiringRuntime.initialize(app, port);
```
With:
```js
const tunnelRuntimeContext = tunnelRuntime.initialize(app, port);
```

- [ ] **Step 6: Check line count**

Run: `wc -l packages/web/server/index.js`
Expected: ~450 lines

- [ ] **Step 7: Verify type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: both pass

- [ ] **Step 8: Commit**

```bash
git add packages/web/server/index.js
git commit -m "refactor(server): extract 4 runtimes, wire through EventBus, index.js ~450 lines"
```

---

### Task 7: Update existing tests

**Files:**
- Modify: All test files that mock the old index.js state

- [ ] **Step 1: Find test files needing updates**

Run:
```bash
rg -l "createSessionRuntime|createNotificationTriggerRuntime|createGlobalUiEventBroadcaster" -g "*.test.js" packages/web/server/
```

For each test that creates `createSessionRuntime({ writeSseEvent, getNotificationClients, broadcastEvent })`:
- Replace with `const eventBus = createEventBus(); const runtime = createSessionRuntime({ eventBus });`
- Import `createEventBus` from `../../core/event-bus.js`

For tests importing `createNotificationTriggerRuntime`:
- Update import path to `./trigger-runtime.js`

For tests importing `createGlobalUiEventBroadcaster`:
- Import from `./event-stream/runtime.js` and use `createEventStreamRuntime` instead, or import the specific function directly

- [ ] **Step 2: Run all tests**

Run: `bun run --filter '@openchamber/web' test`
Expected: 21 pass, 1 pre-existing failure (sse-routes.test.js)

- [ ] **Step 3: Commit**

```bash
git add packages/web/server/
git commit -m "test(server): update tests for EventBus-based runtimes"
```

---

### Task 8: Final verification

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: all 5 packages pass

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: all 5 packages pass

- [ ] **Step 3: All web tests**

Run: `bun run --filter '@openchamber/web' test`
Expected: 21 pass, 1 pre-existing failure

- [ ] **Step 4: Line count**

Run: `wc -l packages/web/server/index.js`
Expected: ~450 lines

- [ ] **Step 5: Stray reference check**

```bash
rg -c "getNotificationClients|broadcastUiNotification|globalWatcherStartPromise|processForwardedEventPayload|notificationTemplateRuntime|notificationTriggerRuntime" packages/web/server/index.js
```
Expected: 0 matches (all moved into new runtimes)
