# Phase 1b: EventStream, Notification, Session & Tunnel Runtime Extraction

## Goal

Extract 4 domain runtimes from `packages/web/server/index.js` (809→~450 lines), each owning their state internally and communicating exclusively through a typed EventBus. No direct dependencies between runtimes.

---

## 1. EventBus Upgrade

### Problem
Current `createEventBus()` is untyped — bare strings for event names, `any` for payloads. Typos are silent no-ops.

### Solution

**`packages/web/server/lib/core/events.js`** — single source of truth with ServerEvents type + EVENTS constants file.

**`packages/web/server/lib/core/event-bus.js`** — add JSDoc generic type parameter so on/emit are type-checked.

### Risk
Low — no runtime behavioral change. Purely JSDoc type annotations + constants file.

---

## 2. Runtime Architecture (4 runtimes)

### Pattern
Every runtime creator follows the same signature:
```
create*Runtime({ eventBus, /* domain-specific deps only */ })
```
- `eventBus` is the **only** inter-runtime communication channel
- **No runtime holds a reference to another runtime**
- **State lives inside the runtime**, not in `index.js` module-level `let` vars
- Startup/lifecycle driven by EventBus events

### 2.1 EventStreamRuntime

**File:** `packages/web/server/lib/event-stream/runtime.js` (extends the existing file)

**Constructor deps:** `eventBus`, `openCodeRuntime`, `process`, `fsPromises`, `path`, `readSettingsFromDiskMigrated`, `writeSettingsToDisk`, `pushSubscriptionsFilePath`

**Owns (previously index.js module-level vars):**
- SSE/WS client Sets (3)
- `notificationEmitterRuntime` — SSE writing + desktop notification IPC
- `globalMessageStreamHub` — upstream SSE reader from OpenCode
- `openCodeWatcherRuntime` — processes SSE payloads from hub
- `ensureGlobalWatcherStarted` — watcher lifecycle
- `processForwardedEventPayload` — synthetic event bridge
- `pushRuntime` — push subscription management + sending
- `broadcastGlobalUiEvent`

**Emits:** `event:received` — every upstream SSE event

**Listens:** `notification:send-ui` → broadcast to clients, `notification:send-desktop` → IPC, `notification:send-push` → send push, `opencode:ready` → start watcher

**Exports:** `writeSseEvent`, `broadcastUiNotification`, `emitDesktopNotification`, `ensureGlobalWatcherStarted`, client set accessors, `pushRuntime`, `dispose`

**Note:** `web-push` imported directly by this runtime (not passed from index.js).

### 2.2 NotificationRuntime

**File:** `packages/web/server/lib/notifications/runtime.js`
(Extends existing file. Renames existing `runtime.js` (trigger) to `trigger-runtime.js`.)

**Constructor deps:** `eventBus`, `openCodeRuntime`, `readSettingsFromDisk`, `persistSettings`, `resolveGitBinaryForSpawn`

**Owns:** template-runtime, trigger-runtime

**Subscribes to:** `event:received` → `maybeSendPushForTrigger`

**Emits:** `notification:send-ui`, `notification:send-desktop`, `notification:send-push`

**Refactored template/trigger:** Instead of receiving `emitDesktopNotification`, `broadcastUiNotification`, `sendPushToAllUiSessions` as DI deps, they emit on EventBus.

**Exports:** `setAutoAcceptSession`

### 2.3 SessionRuntime

**File:** `packages/web/server/lib/opencode/session/session-runtime.js` (refactored in place)

**Old deps:** `{ writeSseEvent, getNotificationClients, broadcastEvent }`
**New deps:** `{ eventBus }`

**Refactored:** Subscribes to `event:received` instead of watcher DI callback. Emits `session:activity-changed` and `session:needs-attention` instead of `broadcastEvent`/`writeSseEvent`.

**Subscribes to:** `event:received` → `processOpenCodeSsePayload`, `opencode:ready` → `resetAllSessionActivityToIdle`

**Emits:** `session:activity-changed`, `session:needs-attention`

### 2.4 TunnelRuntime

**File:** `packages/web/server/lib/tunnels/tunnel-runtime.js`

**Owns:** `tunnelProviderRegistry` (created internally), `tunnelAuthController`, 3 mutable `let` vars (`activeTunnelController`, hostname, token), tunnel-wiring-runtime integration

**Constructor deps:** `eventBus`, `crypto`, `URL`, settings + tunnel normalizer functions, tunnel type constants

**initialize(app, port):** Called inside `main()`. Registers Express routes, returns context object with `{ tunnelService, startTunnelWithNormalizedRequest, getActivePort, setActivePort }`.

**Emits:** `tunnel:ready`, `tunnel:error` (via wrapping tunnelService.start)

### 2.5 Index.js after extraction (~450 lines)

**Remaining:**
1. Constants (versions, ports, timeouts, paths, flags)
2. Settings normalizer + helpers
3. Theme, managed tunnel config, settings runtimes
4. Request security runtime
5. Module-level `let` vars: `server`, `expressApp`, `uiAuthController`, `terminalRuntime`, `messageStreamRuntime`, `exitOnShutdown`
6. Env + resolution runtime
7. Server utils runtime
8. EventBus creation + 4 runtime constructions (~20 lines)
9. EventBus observability subscriptions (logging — stays in index.js)
10. `main()`: Express setup, route registration, startup pipeline
11. CLI entry, exports

**Runtime construction block:**
```js
const eventBus = createEventBus();
const eventStreamRuntime = createEventStreamRuntime({...});
const notificationRuntime = createNotificationRuntime({...});
const sessionRuntime = createSessionRuntime({ eventBus });
const tunnelRuntime = createTunnelRuntime({...});
```

---

## 3. Event Catalog

| Event | Payload | Emitter | Subscribers |
|---|---|---|---|
| `opencode:ready` | void | OpenCodeRuntime | EventStream, Session, index.js (log) |
| `opencode:restarting` | void | OpenCodeRuntime | index.js (log) |
| `opencode:restarted` | void | OpenCodeRuntime | index.js (log) |
| `opencode:unhealthy` | void | OpenCodeRuntime | index.js (log) |
| `event:received` | `{ payload, directory? }` | EventStream | Notification, Session |
| `session:activity-changed` | `{ sessionId, phase }` | Session | (EventStream subscribes) |
| `session:needs-attention` | `{ sessionId, needsAttention }` | Session | (EventStream subscribes) |
| `notification:send-ui` | `{ payload }` | Notification | EventStream |
| `notification:send-desktop` | `{ payload }` | Notification | EventStream |
| `notification:send-push` | `{ payload, options? }` | Notification | EventStream |
| `tunnel:ready` | `{ url, provider }` | Tunnel | (logged/debug) |
| `tunnel:error` | `{ error }` | Tunnel | (logged/debug) |
| `server:port-bound` | `{ port }` | Tunnel | (logged/debug) |

---

## 4. What stays unchanged

- `createOpenCodeRuntime` (Phase 1a)
- `createSettingsNormalizationRuntime`, helpers
- `createThemeRuntime`, `createManagedTunnelConfigRuntime`
- `createProjectDirectoryRuntime`, `createSettingsRuntime`
- `createRequestSecurityRuntime`
- `createOpenCodeEnvRuntime`, `createOpenCodeResolutionRuntime`
- `createServerUtilsRuntime`
- `createBootstrapRuntime`, `createFeatureRoutesRuntime`, `createStaticRoutesRuntime`
- `createStartupPipelineRuntime`, `createGracefulShutdownRuntime`
- `createScheduledTasksRuntime`
- `runCliEntryIfMain`
- All Express route registration functions
