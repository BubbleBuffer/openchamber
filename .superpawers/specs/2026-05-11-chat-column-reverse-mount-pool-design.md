# Chat Column-Reverse + Mount Pool — Design Spec

**Date:** 2026-05-11
**Branch:** `feature/chat-column-reverse-mount-pool`

## Problem

When switching conversations, the chat UI has two visible flashes:
1. A loading/re-render flash when switching to a previously-viewed conversation (even though the sync layer already caches the data in-memory).
2. A scroll flash — messages render top-down, then `scrollToBottom` fires one frame later, producing a visible flicker of the conversation top.

The underlying cause: the `ChatViewport` is a singleton that full-unmounts/remounts per session switch, and the scroll manager fights CSS with JavaScript (ResizeObserver pinning, manual scroll-to-bottom, threshold-based re-pin detection).

## Solution Overview

Three changes that compound:
1. **Mount pool** — keep the last 10 `MessageList` instances mounted. Switching between recently-viewed sessions is a DOM-only visibility toggle with zero re-render.
2. **`column-reverse` layout** — the chat viewport uses `flex-direction: column-reverse`. Content anchors naturally at the bottom. The browser handles pinning — no JavaScript scroll-to-bottom needed.
3. **Reduce message page size** — `MESSAGE_PAGE_SIZE` from 200 → 25. Combined with the virtualizer, reduces parse/store/measure overhead per session by ~8x.

## Component Architecture

### Current

```
ChatView
└── ChatContainer (singleton lifecycle + scroll orchestration, ~640 lines)
    └── ChatViewport (unmount/remount per switch)
        └── MessageList
            ├── StaticHistoryList (virtualized when >= 15 messages)
            └── StreamingTailContent (non-virtualized)
```

### Proposed

```
ChatView
└── ChatContainer (mount pool LRU, ~200 lines)
    ├── SessionMount (idle, opacity:0, pointer-events:none)
    │   └── ChatViewport (column-reverse container)
    │       └── MessageList
    ├── SessionMount (idle)
    │   └── ChatViewport
    ├── SessionMount (active, opacity:1, pointer-events:auto)
    │   └── ChatViewport
    │       └── MessageList
    └── ... (up to MAX_MOUNTED_SESSIONS = 10)
```

### Component Responsibilities

| Component | Role |
|---|---|
| `ChatContainer` | Mount pool management. Maintains `Map<sessionId, SessionMountState>`. LRU eviction at 10 entries. Delegates `syncSession` calls. Owns no scroll logic. |
| `SessionMount` | One per mounted session. Wraps a `ChatViewport`. Conditionally visible via `opacity` + `pointer-events`. Explicitly skipped from scroll anchoring when idle. |
| `ChatViewport` | `column-reverse` flex container with `overflow-y: auto`. Owns the virtualizer and MessageList. Scroll interaction reduced to: load-more compensation + user-scrolling-up flag. |
| `MessageList` | Unchanged logic. Existing virtualization, turn grouping, `React.memo` all stay. |
| `useSessionMountPool` (new hook) | Extracted from ChatContainer. Exposes: `mountedSessions`, `activateSession(id)`, `evict()` logic. |
| `useLoadMoreCompensation` (replaces `useChatScrollManager`) | Thin hook: snapshot scroll position before prepend, restore after DOM commit via `useLayoutEffect`. |
| `useUserScrollDetector` (new hook) | Single boolean: `userScrolledUp`. Set on wheel/touch scrolling upward. Reset when scroll reaches position 0 (bottom in column-reverse). Drives jump-to-newest button visibility. |

### What Gets Deleted

`useChatScrollManager.ts` (~400 lines). Replaced by `useLoadMoreCompensation` + `useUserScrollDetector` (combined ~80 lines).

Deleted logic and why it's unnecessary with `column-reverse`:

| Deleted | Why unnecessary |
|---|---|
| `scrollPinnedToBottom` / `scrollToBottomInternal` | Browser handles anchoring. New content extends downward naturally. |
| `followMode` / `smooth` | No JS scrolling needed. |
| `isPinned` / `updatePinnedState` | Replaced by single `userScrolledUp` boolean. |
| `PIN_THRESHOLD_RATIO` distance-from-bottom detection | Replaced by explicit toggle: user scrolled up or not. |
| `ResizeObserver` → `scrollToBottom` on content growth | Content growth pushes up in column-reverse — browser handles it. |
| `showScrollButton` complex threshold logic | Trivial: show when `userScrolledUp && scrollTop !== 0`. |

## Data Flow

### Session Switch

```
user clicks session
→ setCurrentSession(sessionId)
→ ChatContainer: if sessionId in mountPool:
    → swap activeSession → new. (DOM-only, opacity swap, no re-render)
    → no syncSession call (data + DOM already exist)
→ if sessionId NOT in mountPool:
    → if pool.size >= 10: evict least-recently-accessed, prefer non-streaming
    → mount new SessionMount for sessionId
    → sync.syncSession(sessionId) if not cached in sync store
    → render into column-reverse (bottom-anchored by default)
```

### Mount Pool State

```typescript
type SessionMountState = {
  id: string;
  order: number;        // monotonically increasing access counter for LRU
  isActive: boolean;
  isStreaming: boolean; // checked during eviction
  mountedAt: number;    // Date.now()
};
```

### Eviction Policy

1. Pick candidate with lowest `order` (least recently accessed).
2. Never evict the session being activated.
3. Prefer non-streaming sessions.
4. If all are streaming, evict the oldest-by-order anyway — streaming state lives in the sync store and will reconcile on re-mount.

### Streaming in Hidden Mounts

Non-active sessions continue to receive SSE events through the sync store. The hidden `SessionMount` re-renders at full render cost. Optimization: extend the existing `MessageRow` `React.memo` comparator to bail out when session is not active. This prevents wasted virtualizer measurements for off-screen views.

### Sync Layer — No Changes

The existing sync layer's LRU 8 session cache + SSE keep data current. The mount pool is a pure DOM cache on top — it avoids the React render cycle, not the data fetch. `syncSession` remains the canonical data-loading path; the mount pool just skips calling it when the session is already mounted.

## Rendering

### Column-reverse CSS

```css
.chat-viewport {
  display: flex;
  flex-direction: column-reverse;
  overflow-y: auto;
  height: 100%;
  scroll-behavior: auto;
  overflow-anchor: none;
}
```

- `scroll-behavior: auto` — no smooth scrolling (fights column-reverse anchoring).
- `overflow-anchor: none` — existing override, keeps browser from hijacking anchor.
- Scroll position 0 = bottom of content. Negative values = scrolled up toward older messages.

### Virtualizer Integration

`@tanstack/react-virtual` works with `column-reverse` with two adjustments:

1. **`initialOffset: 0`** — the virtualizer starts at scroll position 0, which is the bottom in column-reverse. Messages render newest-first.
2. **`scrollToFn` wrapper** — the virtualizer's default `scrollToFn` computes `element.scrollTop` offsets. With column-reverse, scrollTop is negative when scrolled up. The wrapper translates offsets for the reversed coordinate space.

The virtualizer's lazy rendering still works — only visible + overscan messages are rendered. Prepending (load-more) adds entries at the logical top, which is the scroll-end in column-reverse. The load-more scroll compensation adapts to this.

### Load-More Scroll Compensation

When older messages load via prepend, they're added at the flex-end (scroll-bottom in column-reverse). Without compensation, the user jumps. Solution: the existing `useLayoutEffect` snapshot pattern (`useChatTimelineController.ts:276-300`) is adapted for the reversed space.

```
Before prepend:
  snapshot scrollHeight + scrollTop
After prepend DOM commit (in useLayoutEffect, before paint):
  restore: scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop
```

This is direction-agnostic math — same principle as current code, just with `column-reverse` scroll values.

### User Scroll Interaction

```
wheel/touch event (delta < 0, scrolling up in reversed space)
→ set userScrolledUp = true
→ jump-to-newest button appears

scrollTop reaches 0 (bottom)
→ set userScrolledUp = false
→ button hides, browser resumes natural anchoring

jump-to-newest button click
→ scrollTo({ top: 0, behavior: 'smooth' })
```

No `PIN_THRESHOLD_RATIO`, no distance-from-bottom math, no ResizeObserver scroll handler. A single boolean flag and a button.

## Message Loading

### Page Size Reduction

| Setting | Old | New |
|---|---|---|
| `MESSAGE_PAGE_SIZE` | 200 | 25 |

Located in `packages/ui/src/sync/types.ts` or `use-sync.ts` (wherever the constant is defined).

### Load-More Threshold

Trigger next page fetch when the virtualizer's scroll position is within 5 estimated entry heights of the top edge. This is more aggressive than the current threshold to compensate for the smaller page size.

## Implementation Steps

Each step is independently testable:

### Step 1: Reduce MESSAGE_PAGE_SIZE
**File:** sync types / `use-sync.ts`
**Change:** `200 → 25`
**Verify:** Chat loads only 25 messages. Load-more still works.

### Step 2: Build SessionMount Pool
**Files:** `ChatContainer.tsx`, new `useSessionMountPool.ts` hook
**Change:** Extract pool logic. Render N `SessionMount` instances keyed by `sessionId` + a stable mount key. Non-active sessions get `opacity: 0; pointer-events: none`. No `column-reverse` yet.
**Verify:** Switching between recently-viewed sessions is instant. No loading flash. DOM remains intact.

### Step 3: Convert ChatViewport to column-reverse
**Files:** `ChatViewport` component, virtualizer config
**Change:** Flex direction switch. `initialOffset: 0`. `scrollToFn` wrapper. Keep `overflow-anchor: none` (prevents browser scroll anchoring from interfering).
**Verify:** Messages render bottom-first. New messages anchor naturally. No scroll flash.

### Step 4: Delete Scroll Manager, Build Replacements
**Files:** Delete `useChatScrollManager.ts` (all pinning/follow-mode/ResizeObserver scroll/threshold logic). Keep `useChatTimelineController.ts` load-more compensation — adapt for column-reverse space. New: `useUserScrollDetector.ts`.
**Change:** Strip out all pinning/follow-mode/ResizeObserver scroll/threshold logic. Implement simple user-scrolled-up boolean + jump-to-newest button. Adapt the existing `useLayoutEffect` prepend compensation from `useChatTimelineController` into a standalone `useLoadMoreCompensation` hook that handles column-reverse scroll math.
**Verify:** New messages auto-anchor at bottom. Manual scroll up disables anchoring. Jump-to-newest button works. Load-more scroll compensation works.

### Step 5: Tighten Load-More Threshold
**Files:** Virtualizer config / timeline controller
**Change:** Trigger load-more when within 5 estimated entry heights of the top edge.
**Verify:** Scrolling up loads more messages seamlessly. No content gap.

### Step 6: Polish
**Files:** `MessageRow` memo comparator (extend), empty state handling
**Change:** Bail out of virtualizer measurement when `!isActive`. Handle edge cases: empty sessions, sessions with < 25 messages, session being evicted mid-stream.
**Verify:** Hidden sessions don't cause measurable layout overhead. Edge cases handled gracefully.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `@tanstack/react-virtual` + `column-reverse` has unknown edge cases | Test first in step 3. Fallback: `transform: scaleY(-1)` container + children (Approach C lite) or keep DOM order with `scrollToIndex` at mount. |
| Mount pool increases memory (10 sessions × DOM trees) | 10 × 25 messages is negligible (~250 entries in store, ~150 visible measurements in virtualizer). Measure with `performance.mark` on mount/unmount. |
| Streaming in hidden sessions causes wasted renders | Extend existing `MessageRow` `React.memo` comparator to bail out when `!isActive`. Already has a custom comparator (`areRenderRelevantMessagesEqual`). |
| Load-more scroll compensation bugs in column-reverse | The `useLayoutEffect` snapshot pattern is direction-agnostic. Test with large conversation history. |
| Safari `overflow-anchor` behavior differs from Chrome | Test on WebKit. Safari has known issues with `column-reverse` overflow. Mitigation: keep `overflow-anchor: none` and rely fully on our approach. |

## Non-Goals

- Changing the sync layer's LRU cache (already works).
- Changing the virtualizer library (`@tanstack/react-virtual` stays).
- Changing turn grouping or message normalization.
- Changing the SSE/event pipeline.
- PWA/mobile-specific changes (covered by existing mobile-first patterns).
- VS Code or Desktop shell changes (shared UI layer only).
