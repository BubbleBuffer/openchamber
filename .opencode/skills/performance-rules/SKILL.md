---
name: performance-rules
description: Use when modifying Zustand stores, SSE/event handlers, polling, scroll/DOM logic, optimistic updates, autosizing inputs, list ordering, in-memory caches, or any high-frequency React render path. Every rule has caused a real regression in this codebase.
license: MIT
compatibility: opencode
---

## Shared-store render discipline

- **Treat common stores as render fanout boundaries.** An unnecessary reference change in shared state can re-render large parts of the app.
- **Do not put high-frequency state in broadly consumed stores.**
- **Update only the fields that changed.** Preserve references for untouched state branches.
- **Prefer leaf selectors over container selectors.** Subscribe to the smallest stable value.
- **Isolate hot consumers.** If a value changes often and few components need it, move it to a narrower store.
- **Do not subscribe shell/layout components to broad live collections.**
- **Treat provider roots as global hot paths.** A top-level provider must not subscribe to high-frequency data unless essential.

## Zustand referential equality

Zustand skips re-renders when a selector returns the same reference (`Object.is`). Every new object/array reference triggers a re-render.

- **Never spread all state fields in an update.** A `message.part.delta` event should not clone `session`, `permission`, etc.
- **Select leaf values, not containers.** `useStore((s) => s.permission[sessionID])` is correct. `useStore((s) => s.permission)` subscribes to every permission change.
- **Preserve references when merging.** Keep existing object references. Return the original array if nothing was added.
- **For derived collections, preserve item identity when presentation-relevant fields are unchanged.**

## Store splitting

Split stores by change frequency and subscriber set.

- **Group state by how often it changes.** Streaming state (updated 60/sec) must not live with user preferences (updated on click).
- **Group state by who reads it.** If only 2 components need a value, it belongs in a store they alone subscribe to.
- **Cross-store reads use `.getState()`.** Imperative, no subscription.
- **Never add unrelated state to an existing store.** Create a new store.

## Event pipeline and SSE

- **Gate expensive operations on the hot path.** `message.part.delta` fires ~60/sec. Any `findIndex`, `filter`, or iteration added to these handlers multiplies across every event. Gate behind a cheap boolean check first.
- **Skip no-op updates.** If an incoming event doesn't change state (same role, same finish, same timestamps), return `false` from the reducer.
- **Coalesce by key.** Same-entity events should replace earlier ones in the queue, not accumulate.
- **Preserve event ordering semantics.** Reducers must not let stale deltas or out-of-order events corrupt the latest state.
- **Do not widen live-activity fallbacks.** A fallback for delayed status should inspect only the current trailing entity.

## Polling payload fidelity

- **Do not let lightweight polling erase rich fields.** If light mode omits fields (e.g., `diffStats`), preserve previous rich data until a heavy follow-up fetch lands.
- **Use two-phase polling.** Cheap change detection first; heavy status fetches only for directories that actually changed.

## Optimistic updates

- **Use the shadow Map pattern.** Insert optimistic data into the store AND register it in a separate tracking Map. Cleanup deterministically via `mergeOptimisticPage` on the next data fetch — not via heuristics in the event reducer.
- **Pass client-generated IDs to the server.** Use the same ID format as the server. Pass `messageID` to `promptAsync` so the server echoes back the same ID.
- **Rollback on error.** Remove the optimistic entry from both the store and the shadow Map.
- **Stabilize bridge callbacks.** Use stable ref wrappers so effects do not loop on changing function identities.

## Session/input consistency

- **Capture send config at queue time.** Queue items must include provider/model/agent/variant snapshot; do not re-resolve from mutable live state at send time.
- **Do not let text input state repaint unrelated chrome.** Typing should not force unrelated controls, menus, or toolbars to re-render.
- **Extract slow-changing chrome from hot input paths.** If controls don't depend on the current text value, move them behind memoized boundaries with stable callbacks.

## Bootstrap resilience

- **Treat startup 502/503 as transient.** Retry bootstrap/session-list flows with bounded retries, especially in VS Code where API readiness can lag.
- **Use polling recovery when failures are swallowed.** If an async loader resolves without throwing on failure, recover with interval retries gated by loaded-state checks.

## Scroll and DOM

- **Never use `await waitForFrames()` for scroll preservation.** Use `useLayoutEffect` to adjust scroll synchronously after React commits DOM — before the browser paints.
- **Capture scroll state before the state change, restore in layout effect.**
- **Do not let viewport resizes masquerade as content growth.**
- **Disable or narrow native browser scroll anchoring when custom scroll logic exists.**
- **Autosize textareas without transient collapse on growth.** Avoid `height='auto'` shrink/expand cycles on every character.

## List ordering and view consistency

- **Do not sort structural lists directly from high-churn live fields.** Sorting from frequent updates causes reorder thrash and wide rerender cascades.
- **If live recency is required, freeze order during high-frequency updates and apply a one-shot reorder only at an intentional lifecycle edge.**
- **Use one ordering source for all views of the same data.**
- **Do not mix global snapshots and local live snapshots without an explicit reconciliation policy.**

## Caching and memory

- **Cap in-memory caches with both count and byte limits.** Entry count alone doesn't prevent memory bloat. Use dual-constraint LRU.
- **Set store session limits to match loaded data.** If bootstrap loads N sessions, set `limit >= N`.
- **Invalidate caches on mutations.** File content cache must clear entries on write, delete, rename.
- **Use TTLs to prevent redundant fetches.** If a session was fetched <15s ago, skip re-fetching.

## Directory context

- **Never cache directory strings in closures.** Read it dynamically from `opencodeClient.getDirectory()` at call time.
- **Pass directory hints when the source of truth isn't available yet.** Newly created sessions aren't in the sync store until SSE delivers them.
