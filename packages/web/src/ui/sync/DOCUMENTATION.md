# Sync architecture, event handling & store update rules

## Scope

This document covers the current client-side session/data architecture in `packages/web/src/ui/sync` and the rules for updating stores safely.

## Phase 3 — UI/Store-Owned Boundaries

After Phase 3 migration, the session machine is the authoritative source for
session lifecycle, streaming, retry, blocking interruptions, and history
loading. The following UI/presentation domains remain **store-owned** and are
NOT migrated to the machine:

| Domain | Owner | Location |
|--------|-------|----------|
| Composer draft text | `input-store.ts` | Draft input text pending submission |
| Attached files | `input-store.ts` | Files attached to draft before send |
| Local queue state | `messageQueueStore` | Queued messages before submission |
| Provider/model/agent/variant selection | `selection-store.ts`, `providerConfigStore`, `agentConfigStore` | Model picker, agent picker |
| Selection state (active session, active turn) | `session-ui-store.ts` | Current session/turn selection |
| Viewport scroll position, anchors | `viewport-store.ts` | Scroll position, session memory |
| Reveal state (turn reveal animation) | `session-ui-store.ts` | `turnStart`, `pendingRevealWork` |
| Mobile drawer/layout state | `ui-store.ts` | `isMobile`, `isKeyboardOpen`, `isExpandedInput`, drawer open/closed |
| Theme/layout preferences | `ui-store.ts` | `isDark`, `fontSize`, density, etc. |

These domains are never written by the machine and must not be derived from
machine state. They are owned by their respective stores and mutated by
user action or UI logic only.

## Phase 3 — Deprecated Legacy Surfaces

The following exports in `streaming.ts` are **deprecated** and will be removed
in a future phase. Use the machine selectors instead:

| Deprecated | Replacement |
|-----------|-------------|
| `selectStreamingMessageId` | `useStreamingMessageId(directory, sessionId)` from `@/components/chat/state/machine/selectors` |
| `selectMessageStreamState` | Machine state via `useActorSelector` |
| `selectIsStreaming` | `useIsStreaming(directory, sessionId)` from `@/components/chat/state/machine/selectors` |
| `updateStreamingState` | Machine session actor state |

These deprecated exports emit development/test-only warnings identifying the
replacement. They do not fire in production builds.

## Phase 3 — Session Machine Authority

The session machine (via `ClientSessionMachineBridge` and the actor registry)
is the **sole authoritative source** for:

- `streamingMessageId` — which message is currently streaming
- `isWorking` — whether session is in a working state (streaming or retry cooldown)
- `lifecycle phase` — `idle`, `streaming`, `error`, `fatal`, `not_found`
- `retry` — `retryMessage`, `retryCount`, `retryCooldownUntil`
- `permissions` / `questions` — active blocking requests
- `history loading` — `isLoadingOlder`, `hasMoreAbove`
- `fatalError` — fatal error state

All UI components must read these from machine selectors, not from legacy
sync-store-derived state.

There are **two distinct session data scopes** in the UI:

1. **Directory-scoped sync stores**
   - Owned by the sync layer child stores created in `sync-context.tsx`
   - Source for per-directory live session/message/part/permission/question state
   - Backed by SSE / directory-scoped polling
   - Read via hooks like `useSessions()`, `useDirectorySync()`, `getSyncSessions()`, `getDirectoryState()`

2. **Global sessions cache**
   - Owned by `packages/web/src/ui/stores/useGlobalSessionsStore.ts`
   - Shared source of truth for the Sessions sidebar global lists and Session Retention cleanup
   - Holds:
     - global active sessions
     - global archived sessions
     - active sessions indexed by directory

These two scopes are intentionally different, but they are no longer equal peers for live UI truth.

### Why both exist

The directory-scoped sync stores are **not** a complete global view.

- They are created lazily per directory
- They only contain data for directories initialized in the current app session
- They are optimized for live per-directory domain data
- They do not maintain the complete global active+archived session view needed by the sidebar and retention settings

So:

- Use the **directory sync stores** for per-directory live session/message state
- Use the **global sessions store** for cold/global session coverage (especially archived pages and unopened directories)
- Use **aggregated child-store snapshots** for live session/status truth across already initialized directories

## Ownership map

| Layer / Store | Owns | Scope |
|---|---|---|
| child directory stores in `sync-context.tsx` | `session`, `message`, `part`, `permission`, `question`, etc. | One directory |
| `session-ui-store.ts` | Session selection, draft lifecycle, abort prompts, worktree metadata, SDK-facing action entrypoints | App UI state |
| `useGlobalSessionsStore.ts` | Global active sessions, global archived sessions, `sessionsByDirectory` | All opened project/worktree session lists |
| `viewport-store.ts` | Scroll anchors, session memory, loading indicators | App UI state |
| `input-store.ts` | Draft input state, attached files, synthetic parts | App UI state |
| `selection-store.ts` | Model/agent/variant selections | App UI state |
| `voice-store.ts` | Voice state | App UI state |

## Session list rules

### Directory-scoped session list

Use the directory-scoped sync store when the UI needs the live session list for the **current directory**.

Examples:

- current chat/session switching
- per-directory session/message bootstrap
- session/message/part SSE updates

### Global session list

Use `useGlobalSessionsStore` when the UI needs a **shared global session cache**.

Current consumers:

- `useSessionAutoCleanup.ts`

### Live cross-directory session/status view

Use the sync hooks backed by aggregated child stores when the UI needs **live truth** for sessions or statuses across all initialized directories.

Current consumers:

- `SessionSidebar.tsx`
- `SessionNodeItem.tsx`
- `Header.tsx`
- agent/session activity surfaces using `useGlobalSessionStatus()` / `useAllSessionStatuses()`

### Mutation responsibility

`useGlobalSessionsStore` is not maintained by SSE directly. It is kept correct by:

1. shared global fetch/reconciliation via `loadSessions()` / `refreshGlobalSessions()`
2. direct mutation from session actions after successful SDK calls:
   - create
   - title update
   - share
   - unshare
   - archive
   - delete
   - retention cleanup batch archive/delete

This keeps cold/global lists responsive without requiring a refetch after every change.

Live activity/status indicators must not depend on this cache. They must derive from aggregated child-store state.

## Session action rules

Session actions live in `session-actions.ts` and are the canonical place for SDK-calling session mutations that affect global session lists.

Rules:

1. If an action mutates session list membership or visible session metadata, update `useGlobalSessionsStore` there.
2. If an action targets a session by ID, resolve the **session's own directory**. Do not assume the current directory is correct.
3. `session-ui-store.ts` should delegate to `session-actions.ts` for these mutations instead of duplicating SDK calls.

Examples of global-store updates performed in `session-actions.ts`:

- `createSession()` -> `upsertSession(session)`
- `updateSessionTitle()` -> `upsertSession(result.data)`
- `shareSession()` / `unshareSession()` -> `upsertSession(result.data)`
- `archiveSession()` -> `archiveSessions([id], archivedAt)`
- `deleteSession()` -> `removeSessions([id])`

## The golden rule

When creating a draft in `handleDirectoryEvent`, **only clone the state fields the event will mutate**. Never spread all fields eagerly.

```typescript
// WRONG — clones everything, breaks referential equality for all subscribers
const draft = {
  ...current,
  session: [...current.session],
  message: { ...current.message },
  part: { ...current.part },
  permission: { ...current.permission },
  // ...
}

// RIGHT — only clone what this event type touches
const draft = { ...current }
switch (event.type) {
  case "message.part.delta":
    draft.part = { ...current.part }
    break
}
```

## Why this matters

Zustand skips re-renders when a selector returns the same reference (`Object.is`). If you spread `session: [...current.session]` but the event only modifies `part`, the `session` array gets a new reference. Every component using `useSessions()` re-renders for nothing.

During streaming, `message.part.delta` fires ~60 times/sec. Eagerly cloning all fields caused every subscriber in the entire app to re-render 60/sec — a 10x overhead. Targeted cloning reduced MessageList renders from ~1972 to ~296 per session.

## Event → field mapping

Keep this in sync with `handleDirectoryEvent` in `sync-context.tsx`:

| Event type | Fields to clone |
|---|---|
| `session.created/updated/deleted` | `session`, `permission`, `todo`, `part` |
| `session.diff` | `session_diff` |
| `session.status` | `session_status` |
| `todo.updated` | `todo` |
| `message.updated` | `message` |
| `message.removed` | `message`, `part` |
| `message.part.updated/removed/delta` | `part` |
| `vcs.branch.updated` | (none — mutates `draft.vcs` directly) |
| `permission.asked/replied` | `permission` |
| `question.asked/replied/rejected` | `question` |
| `lsp.updated` | `lsp` |

## Adding a new event type

1. Add the case to the event reducer (`event-reducer.ts`)
2. Add a corresponding case to the switch in `handleDirectoryEvent` (`sync-context.tsx`) that clones **only** the fields your reducer writes to
3. If your event fires frequently (more than a few times per second), verify that unrelated components don't re-render — check with the stream perf counters

## Selector hygiene

Select leaf values, not containers:

```typescript
// WRONG — returns entire Map/object, new reference on any mutation
useDirectorySync((s) => s.permission)

// RIGHT — returns the value for one key, stable unless that key changes
useDirectorySync((s) => s.permission[sessionID] ?? EMPTY)
```

Same applies to `useStreamingStore` — select `.get(key)` not the Map itself.

## Store splitting pattern

### Why split

A single Zustand store with N properties means every subscriber's selector re-evaluates on every state change — even if the change is unrelated to what that subscriber reads. During streaming, `sessionMemoryState` updates ~60/sec. Before the split, all 68+ `useSessionUIStore` subscribers re-evaluated on each update. After splitting into focused stores, only `useViewportStore` subscribers (2-3 components) re-evaluate.

The optimization multiplies with targeted event cloning: fewer new references per event × fewer subscribers per store = dramatically less work per SSE frame.

### The stores

| Store | Owns | When it changes |
|-------|------|-----------------|
| `session-ui-store.ts` | Session selection, draft lifecycle, abort, worktree, SDK actions | Session switch, draft open/close |
| `voice-store.ts` | Voice connection/activity state | Voice toggle |
| `input-store.ts` | Pending input text, synthetic parts, attached files | User typing, file attach, revert/fork |
| `selection-store.ts` | Per-session model/agent/variant choices | Model/agent picker |
| `viewport-store.ts` | Scroll anchors, session memory state, sync status | Streaming, scroll, session switch |

### Rules for new UI state

1. **Never add to `session-ui-store`** unless it's session selection, draft lifecycle, or abort state
2. **Group by change frequency** — state that changes during streaming (viewport, memory) must not live with state that changes on user action (selections, input)
3. **Group by subscriber set** — if only 2 components read a value, it should be in a store that only those 2 components subscribe to
4. **Prefer a new store over growing an existing one** if the new state has different subscribers or change frequency
5. **Cross-store reads use `.getState()`** — actions in one store that need to read another store call `useOtherStore.getState()` (imperative, no subscription)

### Anti-patterns

```typescript
// WRONG — stuffing unrelated state into one store
const useEverythingStore = create(() => ({
  voiceMode: "idle",
  scrollAnchor: 0,
  selectedModel: null,
  pendingInput: "",
  // 20 more fields...
}))

// RIGHT — separate stores by concern + change frequency
const useVoiceStore = create(() => ({ voiceMode: "idle" }))
const useViewportStore = create(() => ({ scrollAnchor: 0 }))
const useSelectionStore = create(() => ({ selectedModel: null }))
const useInputStore = create(() => ({ pendingInput: "" }))
```
