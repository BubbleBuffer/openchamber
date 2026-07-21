# Chat Scroll Refactor — COMPLETE

## What was done

### Phase 1 — Core scroll state plumbing

**`useChatScrollManager.ts`**: Added `onScrollStateChange` callback (edge-triggered, only fires when `userScrolledUp` changes), stable `scrollToBottom` callback via `useCallback([], ...)` with refs. `isAtBottom`/`isOverflowing` as React state. ResizeObserver for content-growth auto-scroll (gated: `isAtBottom && scrollHeight grew`, deferred via rAF). Initial state sync on mount.

**`VirtualizedMessageList.tsx`**: Added `onScrollStateChange` + `onAtBottomChange` props, wired to `useChatScrollManager`.

**`ChatViewport.tsx`**: Removed dead `onScroll`/`isProgrammaticFollowActive` props. Local `isAtBottom` state via `onAtBottomChange` callback, wired to `OverlayScrollbar.suppressVisibility`. Bottom spacer `<div className="h-10 shrink-0" />` added after StatusRowContainer. Memo comparator updated.

**`SessionMount.tsx`**: `onScrollStateChange` wired through `handleScrollStateChange` which captures `scrollToBottom` in a ref. `handleMessageContentChange` and `onAnimatedHeightChange` un-stubbed — call `scrollToBottomRef.current()`.

### Phase 2 — Prepend scroll compensation

**`useChatScrollManager.ts`**: Before `loadMore` fires, captures `virtualizer.range.startIndex` + `entryCount` in `loadMoreSnapshotRef`. After entry count grows, calculates delta and calls `scrollToIndex(firstVisibleIndex + delta, { align: 'start' })`.

### Phase 3 — Cleanup

Verified zero stale references to `isProgrammaticFollowActive`, `onScroll`, or dead props.

## Data flow

```
useChatScrollManager → onScrollStateChange → VML → ChatViewport → SessionMount → ChatContainer
                     → onAtBottomChange → ChatViewport(state) → OverlayScrollbar.suppressVisibility

prepend compensation:
  loadMore snapshot (index, count) → entryCount grows → scrollToIndex(oldIndex + delta)
```
