# Chat Virtualizer Restructure — Design Spec

**Date:** 2026-05-13
**Branch:** `feature/chat-column-reverse-mount-pool`
**Status:** Approved — ready for planning

## Problem

The column-reverse CSS strategy introduced in the prior spec (`2026-05-11-chat-column-reverse-mount-pool-design.md`) causes persistent message ordering bugs: new messages sometimes appear at the top instead of the bottom, and message positions flicker/jump when new messages arrive. Root causes:

1. **Two reversals fighting each other** — JS reversal (`reversedDisplayMessages = [...displayMessages].reverse()`) combined with `flex-col-reverse` CSS on both the scroll container and content container create unpredictable visual order.
2. **Inverted scroll math** — `scrollTop = 0` means "at bottom" due to column-reverse, requiring compensation hooks (`useUserScrollDetector`, `useSSEAnchorSuppression`) that have edge-case bugs, particularly around message removals.
3. **No virtualization** — the virtualizer was removed as collateral in the column-reverse migration, losing programmatic scroll control and DOM node economy.
4. **Out-of-sync manual reversals** — `ContextSidebarTab.tsx` does its own `.reverse()` that diverges from the main pipeline pattern.
5. **Monolithic files** — `SessionMount.tsx` (557 lines) and `MessageList.tsx` (546 lines) mix mount lifecycle, scroll management, normalization, reversal, and rendering in single files.

## Solution Overview

Replace the CSS column-reverse strategy with a standard `@tanstack/react-virtual` virtualizer in natural top-to-bottom layout. Remove all message array reversals and CSS column-reverse classes. Replace the two compensation hooks with a single `useChatScrollManager`. Modularize the remaining large files.

### Key invariants

- Messages flow through the pipeline in natural ascending-chronological order (oldest→newest) at every stage. No `.reverse()` anywhere.
- The virtualizer renders items top-to-bottom with `position: absolute` + `translateY`. No CSS column-reverse.
- Scroll anchoring: `initialScrollOffset` on the virtualizer config ensures first paint starts at bottom with no visual flash. For subsequent auto-scroll (new messages while user is at bottom), `virtualizer.scrollToIndex(count - 1, { align: 'end' })` is called. Two distinct mechanisms for two lifecycle phases.
- Load-more triggers when `virtualizer.range.startIndex < threshold` — standard top-scroll detection, not inverted distance math.
- The mount pool from the prior spec (`useSessionMountPool`) is preserved — session switches remain instant DOM toggles.

## Data Flow

```
SSE Event (message.updated / message.part.delta)
  ↓
event-reducer.ts: state.message[sessionID] — ASCENDING order (oldest [0], newest [n-1])
  ↓
sync-context.tsx: useSessionMessageRecords().list — ASCENDING (no change)
  ↓
useChatTimelineController & windowMessagesByTurn — slice by turn window, ASCENDING (no change)
  ↓
SessionMount → ChatViewport → VirtualizedMessageList receives ASCENDING messages
  ↓
VirtualizedMessageList normalizes (dedup, compact) — still ASCENDING
  ↓
@tanstack/react-virtual renders visible slice: items mapped top-to-bottom
  ↓
DOM: oldest message at top, newest message at bottom ✓
```

## Component Architecture

### New

| File | Lines | Responsibility |
|------|-------|----------------|
| `VirtualizedMessageList.tsx` | ~120 | `useVirtualizer` setup, renders visible items via `MessageListEntry`, renders `LoadOlderButton` at top and `StreamingTailContent` at bottom |
| `hooks/useChatScrollManager.ts` | ~80 | Virtualizer scroll-to-bottom, user-scroll-up detection, auto-scroll suppression on new messages, mobile keyboard re-anchor, initial scroll-to-bottom via `initialScrollOffset` |
| `hooks/useViewportAnchor.ts` | ~60 | Capture/restore scroll position across data changes (prepends from load-more) |

### Deleted

| File | Reason |
|------|--------|
| `MessageList.tsx` | Logic distributed to `VirtualizedMessageList`, `normalizeMessages`, `useTurnRecords` |
| `hooks/useUserScrollDetector.ts` | Inverted scroll math no longer needed |
| `hooks/useSSEAnchorSuppression.ts` | Broken edge case; replaced by `useChatScrollManager` |

### Slimmed

| File | Before → After | Changes |
|------|----------------|---------|
| `SessionMount.tsx` | 557 → ~200 | Remove scroll hooks, load-more scroll listener, viewport anchor logic, `scrollToBottom` passthrough. Keep mount lifecycle and controller wiring. |
| `ChatViewport.tsx` | 154 → ~100 | Remove `flex-col-reverse` and `reversed` prop. Swap `MessageList` for `VirtualizedMessageList`. |

### Unchanged

| File | Why |
|------|-----|
| `sync-context.tsx` | Already returns ascending order — correct |
| `event-reducer.ts` | Already stores ascending order — correct |
| `useChatTimelineController.ts` | Turn window logic is correct; only load-more trigger source changes from scroll handler to virtualizer range |
| `lib/turns/windowTurns.ts` | Turn model works on ascending arrays — correct |
| `message-list/TurnBlock.tsx` | Turn rendering unchanged |
| `message-list/MessageListEntry.tsx` | Entry rendering unchanged |
| `message-list/MessageRow.tsx` | Row rendering unchanged |
| `message-list/UngroupedMessageRow.tsx` | Ungrouped rendering unchanged |
| `message-list/normalizeMessages.ts` | Normalization logic unchanged (just no longer reversed after) |
| `hooks/useTurnRecords.ts` | Turn projection works on ascending arrays — correct |
| `hooks/useChatTurnNavigation.ts` | Navigation unchanged |
| `hooks/useStreamingTextThrottle.ts` | Unchanged |
| `hooks/useSessionMountPool.ts` | Unchanged |
| `turn/LoadOlderButton.tsx` | Unchanged |
| `ChatContainer.tsx` | Mount pool orchestration unchanged |

## VirtualizedMessageList

### Virtualizer configuration

```ts
const virtualizer = useVirtualizer({
  count: entries.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (index) => entries[index].estimatedHeight ?? DEFAULT_ENTRY_HEIGHT,
  initialScrollOffset: computeInitialBottomOffset(entries),
  overscan: 5,
});
```

- `entries` is the output of `normalizeMessages` + `useTurnRecords` + render-entry projection, in ascending order.
- `estimateSize` uses per-entry height estimates from the render-entry projection.
- `initialScrollOffset` is pre-computed from estimated heights of all entries except the last — scroll starts at bottom, zero visual flash.
- `overscan: 5` renders items above/below the viewport to prevent blank flickers during scroll.

### Rendering

Uses the standard `@tanstack/react-virtual` absolute-positioning pattern. The items are positioned inside a single `virtualizer.getVirtualItems().map()` loop, with `LoadOlderButton` and `StreamingTailContent` rendered as synthetic entries at the top and bottom of the entries array rather than separate sibling elements. This keeps them inside the virtualizer's coordinate system.

```
scroll container (overflow-y: auto, no flex-col-reverse)
  └── virtualizer inner (position: relative, height = getTotalSize())
       └── virtualizer.getVirtualItems().map(virtualItem =>
           if virtualItem.index === 0: LoadOlderButton OR first MessageListEntry
           if virtualItem.index === entries.length - 1: StreamingTailContent OR last MessageListEntry
           else: MessageListEntry(entry=entries[virtualItem.index])
       )
```

`LoadOlderButton` is only added to `entries[0]` when `hasMoreAbove && !isLoadingOlder`. `StreamingTailContent` replaces the last entry render when the session is actively streaming. Both are included in the `count` passed to the virtualizer so their space is accounted for in `getTotalSize`.

### Load-more trigger

Triggered in `useChatScrollManager` when the user scrolls near the top:

```ts
const range = virtualizer.range;
if (range?.startIndex <= LOAD_MORE_THRESHOLD && canLoadMore && !isLoading) {
  loadMore();
}
```

`LOAD_MORE_THRESHOLD = 2` — when fewer than 2 entries are above the visible range.

### Scroll position on prepend

When `turnStart` decreases (more history loaded into the array), `entries.length` increases. `@tanstack/react-virtual` tracks the `totalSize` delta and automatically adjusts scroll position during the render cycle to keep the user's viewport stable. `useViewportAnchor` provides a safety net for edge cases.

## useChatScrollManager

Single hook replacing both `useUserScrollDetector` and `useSSEAnchorSuppression`.

### Responsibilities

1. **Track user-at-bottom state** — derive from virtualizer's scroll offset + viewport height vs total content size, not an inverted `scrollTop = 0` check.
2. **Initial scroll to bottom** — handled by `initialScrollOffset` on the virtualizer configuration, not a runtime scroll call.
3. **Auto-scroll on new messages** — when `messageCount` increases AND user is at bottom, call `virtualizer.scrollToIndex(count - 1, { align: 'end' })`. If user is scrolled up, do nothing.
4. **Mobile keyboard re-anchor** — on `visualViewport` resize, if user was at bottom, re-scroll to bottom.
5. **Provide `isAtBottom` ref** — for consumers that need to know scroll state.

### Edge cases

- **Message count same, content changed** (streaming): virtualizer remeasures the changed item. `scrollToIndex` not needed; user stays in place.
- **All messages replaced** (session switch): `count` resets, `initialScrollOffset` recalculated, virtualizer starts at bottom.
- **Window resize / sidebar toggle**: virtualizer recalibrates; `useViewportAnchor` captures and restores position if needed.

## useViewportAnchor

Captures the user's scroll position relative to a specific message entry before data changes, and restores it after. Used as a safety net when the virtualizer's built-in scroll compensation isn't sufficient (e.g., when `estimateSize` values are significantly off from measured sizes).

**Trigger points:** Capture fires in `SessionMount` before `turnStart` changes (load-more prepend). Restore fires in the render cycle after the new entries are measured. Window resize handling uses the virtualizer's built-in recalculation instead — `useViewportAnchor` only handles explicit data-mutation events.

```ts
interface ViewportAnchor {
  messageId: string;
  offsetFromTop: number;
}

function useViewportAnchor(virtualizer: Virtualizer, entries: RenderEntry[]) {
  const captureViewportAnchor = (): ViewportAnchor | null => { ... };
  const restoreViewportAnchor = (anchor: ViewportAnchor): boolean => { ... };
  return { captureViewportAnchor, restoreViewportAnchor };
}
```

## ScrollShadow changes

The `reversed` prop added to `ScrollShadow` in the prior spec was specific to column-reverse shadow direction. With column-reverse removed:

- `reversed` prop is removed from `ScrollShadow` component.
- `ChatViewport` no longer passes `reversed` to `ScrollShadow`.

## ContextSidebarTab fix

`ContextSidebarTab.tsx:518` currently does `[...sessionMessages].reverse().map(...)`. This was consistent with the old reversal pipeline. Change to iterate `sessionMessages` directly (ascending order) since no reversal exists anywhere in the pipeline.

## Migration order

1. Create `VirtualizedMessageList.tsx` (testable standalone with dummy data)
2. Create `hooks/useChatScrollManager.ts` (depends on virtualizer instance)
3. Create `hooks/useViewportAnchor.ts` (depends on virtualizer instance)
4. Update `ChatViewport.tsx` — remove `flex-col-reverse`, `reversed` prop, replace `MessageList` with `VirtualizedMessageList`
5. Update `SessionMount.tsx` — remove `useUserScrollDetector`, `useSSEAnchorSuppression`, distance-from-top scroll listener; wire `useChatScrollManager` and `useViewportAnchor`
6. Delete `MessageList.tsx`, `hooks/useUserScrollDetector.ts`, `hooks/useSSEAnchorSuppression.ts`
7. Remove `reversed` prop from `ScrollShadow.tsx`
8. Fix `ContextSidebarTab.tsx:518` manual reverse

## Bug fixes covered

| Bug (from prior spec) | Fix |
|-----------------------|-----|
| `useSSEAnchorSuppression` doesn't handle message removals | Hook is deleted. New `useChatScrollManager` uses `messageCount` compare for add detection only, plus `virtualizer.range` for position checking — message removals don't affect auto-scroll state. |
| `updateTurnWindowModelIncremental` only handles +1 append | Unchanged — falls back to full rebuild for batch updates, which is correct behavior at this message volume. |
| `revertedMessages` string comparison | Not in scope for this spec — orthogonal bug in sync layer. |
| `ContextSidebarTab` manual reverse out of sync | Fixed — uses ascending order directly. |

## Testing

### Unit tests

- `VirtualizedMessageList`: renders ascending entries in correct visual order; `LoadOlderButton` visible when `hasMoreAbove`; `StreamingTailContent` visible when streaming
- `useChatScrollManager`: detects at-bottom correctly; auto-scrolls on new messages when at bottom; suppresses auto-scroll when scrolled up; handles mobile keyboard events
- `useViewportAnchor`: captures and restores anchor correctly; returns null when no entries

### Integration tests

- Fresh session: newest message visible on first paint with no scroll flash
- Streaming: auto-scrolls as assistant types; stops if user scrolls up during streaming
- Load-more: scrolling to top triggers history load; position remains stable after prepend
- Session switch: `initialScrollOffset` starts at bottom of new session
- Mobile keyboard: scroll re-anchors when keyboard opens/closes
- Long session: virtualizer performs well with 50+ turns
- Turn window pagination: correct after multiple load-more cycles

### Manual verification

- Web app: full chat flow
- Electron desktop: full chat flow
- VS Code extension: full chat flow
- Mobile / PWA: keyboard behavior, touch scroll
