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
| `SessionMount` | One per mounted session. Wraps a `ChatViewport`. Conditionally visible via `opacity` + `pointer-events`. Provides `ActiveSessionContext`. |
| `ChatViewport` | `column-reverse` flex container with `overflow-y: auto`. Owns the virtualizer and MessageList. Reverses the sync store's chronological array for the virtualizer. |
| `MessageList` | Unchanged logic aside from receiving reversed data. Existing virtualization, turn grouping, `React.memo` all stay. |
| `useSessionMountPool` (new hook) | Extracted from ChatContainer. Exposes: `mountedSessions`, `activateSession(id)`, `evict()` logic. |
| `useUserScrollDetector` (new hook) | Single boolean: `userScrolledUp`. Reads `scrollTop > 0` from onScroll. Drives jump-to-newest button visibility. |
| `useSSEAnchorSuppression` (new hook) | Detects SSE-triggered virtualizer prepends. When user is at bottom (not scrolled up), suppresses the virtualizer's scroll adjustment so new messages appear naturally. |

### What Gets Deleted

`useChatScrollManager.ts` (~400 lines). Replaced by `useUserScrollDetector` + `useSSEAnchorSuppression` (combined ~60 lines).

**Load-more compensation deleted entirely.** The current `useChatTimelineController.ts:276-300` snapshot/restore pattern is unnecessary with `column-reverse` and newest-first array: older messages append at the end of the virtualizer array with zero index-shift for existing items.

**AnimationHandlers and ContentChangeReason migration:** `useChatScrollManager.ts` exports `AnimationHandlers` and `ContentChangeReason` imported by 10 files (`MessageList.tsx`, `ChatMessage.tsx`, `ProgressiveGroup.tsx`, `ReasoningPart.tsx`, `JustificationBlock.tsx`, `AssistantTextPart.tsx`, `ToolPart.tsx`, `MessageBody.tsx`, `TurnActivity.tsx`, `ChatContainer.tsx`). These types move to a new shared file: `packages/ui/src/components/chat/timeline/types.ts`. The scroll manager's animation wiring (`onAnimationStart`, `onAnimationComplete`) is re-homed: the scroll compensation hook exposes animation callbacks; the user scroll detector hooks into wheel/touch start. All existing imports update paths.

**MessageFreshnessDetector migration:** `useChatScrollManager.ts:508` calls `MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId)`. This call moves to `ChatContainer`'s session-switch effect, decoupled from scroll logic.

Deleted logic and why it's unnecessary with `column-reverse`:

| Deleted | Why unnecessary |
|---|---|
| `scrollPinnedToBottom` / `scrollToBottomInternal` | Browser anchors naturally via column-reverse + overflow-anchor. |
| `followMode` / `smooth` | No JS scrolling needed. |
| `isPinned` / `updatePinnedState` | Replaced by single `userScrolledUp` boolean. |
| `PIN_THRESHOLD_RATIO` distance-from-bottom detection | Replaced by explicit toggle: user scrolled up or not. |
| `ResizeObserver` → `scrollToBottom` on content growth | Content growth pushes up in column-reverse — browser handles it. |
| `showScrollButton` complex threshold logic | Trivial: show when `userScrolledUp && scrollTop !== 0`. |

### ScrollShadow Adaptation

`ChatContainer.tsx:123-131` wraps the viewport in a `ScrollShadow` component that computes overflow visibility using `scrollTop` and `clientHeight`. With `column-reverse`, `scrollTop = 0` means "at bottom" — the shadow directions flip.

**Fix:** ScrollShadow receives a `reversed` prop. When true, the overflow check flips: the "top" shadow shows when `scrollTop > 0` (user scrolled up from bottom), and the "bottom" shadow shows when scrolled past the start. The existing `checkOverflow` function (`ScrollShadow.tsx:96-103`) is parameterized for this.

### Mobile / Touch / Keyboard

The current `useChatScrollManager` handles mobile `touchstart`/`touchmove` for scroll-intent detection. In `column-reverse`:

- **Touch scroll intent:** `useUserScrollDetector` listens for `wheel` + `touchmove` events. A touch gesture scrolling upward (fingers move down on screen, content moves up) sets `userScrolledUp = true`. Same for trackpad/mouse wheel upward.
- **Soft keyboard:** When the keyboard opens on mobile (via the chat input focus), the viewport-height changes. In `column-reverse`, the browser handles this naturally — content stays anchored at the bottom. No JavaScript keyboard-handling needed.
- **Safari/WebKit:** Known issues with `column-reverse` + keyboard viewport resize. Mitigation: on `visualViewport.resize` event, if `!userScrolledUp`, force `scrollTop = 0` to re-anchor. This is a single `scrollTo` call in the detector, not the full ResizeObserver loop from the old scroll manager.

### OverlayScrollbar

Currently one `OverlayScrollbar` per `ChatViewport` (`ChatContainer.tsx:169`). With 10 mounts, there would be 10 instances. Each `SessionMount` renders its own `OverlayScrollbar`. Only the active mount's scrollbar is visible (hidden mounts have `opacity: 0`). This is fine — each mount is a self-contained viewport with independent scroll state. No sharing needed.

## Data Flow

### Session Switch

```
user clicks session
→ setCurrentSession(sessionId)
→ ChatContainer: if sessionId in mountPool:
    → swap isActive flag. (no React mount cycle, DOM stays attached)
    → no syncSession call (data + DOM already exist)
→ if sessionId NOT in mountPool:
    → if pool.size >= 10: evict least-recent, prefer non-streaming
    → mount new SessionMount for sessionId
    → sync.syncSession(sessionId) if not cached in sync store
    → render into column-reverse (bottom-anchored by default)
```

### Mount Pool State

```typescript
type SessionMountState = {
  id: string;
  isActive: boolean;
};
```

The pool uses a `Map<sessionId, SessionMountState>`. LRU tracking uses JavaScript `Map` insertion order — on access, delete and re-insert the entry (moving it to the end). The oldest-by-access entry is always `Map.keys().next().value`. No manual `order` counter needed.

### Eviction Policy

1. If pool size < 10, no eviction.
2. If pool is full and a new session needs to mount:
   a. Iterate Map in insertion order (oldest first).
   b. Skip the incoming session ID.
   c. Pick the first non-streaming session (read streaming state from the sync store imperatively: `useStreamingStore.getState().isStreaming(sessionId)`).
   d. If all are streaming, pick the oldest by insertion order.
3. Unmount the evicted `SessionMount`. Sync store data is unaffected (LRU 8 cache handles that separately).

### Streaming in Hidden Mounts

Non-active sessions continue receiving SSE events through the sync layer. The hidden `SessionMount` re-renders on store changes — React re-renders, not remounts. Cost is minimized by the virtualizer (only visible-area measurements) and by extending `MessageRow`'s `React.memo` comparator to bail out when the owning session is not active. The `isActive` flag is passed via React context (`SessionMount` provides `ActiveSessionContext`) so `MessageRow` reads it without prop-drilling through 5+ layers.

The spec says "DOM-only, opacity swap" — precise wording: no React mount/unmount cycle occurs. Re-renders from store updates still fire, but the DOM stays attached. This eliminates the loading flash and preserves virtualizer measurements.

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
}
```

- No `scroll-behavior: smooth` — smooth scrolling fights column-reverse anchoring.
- **Remove `overflow-anchor: none`** (currently set in `ChatContainer.tsx:50`). The browser's `overflow-anchor` is what gives column-reverse its natural bottom-pinning behavior. Keeping `none` defeats the purpose.
- Scroll position 0 = bottom of content (newest). Positive scrollTop = scrolled up toward older messages.
- For empty sessions: use `justify-content: flex-end` so the input area sits at the bottom.

### Virtualizer Integration

`@tanstack/react-virtual` works with `column-reverse` with these adjustments:

1. **Data order: newest-to-oldest.** The message array is reversed from chronological order before passing to the virtualizer. Index 0 = newest message. In `column-reverse`, flex-start is at the visual bottom, so index 0 (newest) renders at the bottom — the user sees newest first at `scrollTop = 0`.

2. **`initialOffset: 0`** — the virtualizer starts at scroll position 0 (bottom of the viewport = newest messages). No `scrollToIndex` needed on mount.

3. **SSE new messages:** New messages are chronologically newest, so they prepend to the reversed array at index 0. The virtualizer's prepend mechanism fires `onChange` with an adjusted offset to keep the view stable. For SSE new messages when the user is at the bottom (pinned), suppress this adjustment — the user should naturally see the new content. When the user has scrolled up (reading history), keep the adjustment so their view doesn't jump.

4. **Load-more old messages:** Older messages are chronologically oldest, so they append to the end of the reversed array. No virtualizer index shift occurs for existing items. **No scroll compensation needed** — older messages extend above the user's current view. The virtualizer handle this natively as `count` increases at the tail.

5. **`scrollToIndex` / `scrollToTurn` / `scrollToMessage`:** Existing code (`MessageList.tsx:1443`) uses `historyVirtualizer.scrollToIndex(index, { align: 'start' })`. With `column-reverse` and newest-first array, "start" (visual bottom) ≈ newest. To scroll to a specific message, compute its index in the reversed array and use `align: 'center'` — direction-agnostic. The `scrollToTurn`/`scrollToMessage` callers in `useChatTimelineController` adapt to map chronological index → reversed index.

6. **Hash-based scroll targets:** `ChatContainer.tsx:597-600` detects `window.location.hash` and skips auto-scroll. The hash target detection stays; the scroll-to-target computes the reversed-array index for the target message.

Reversal is done via `useMemo` on the sync store's chronological message array. The virtualizer's `count` is `reversedMessages.length`. This is cheap — the array is already small (25 base, growing via load-more).

### Load-More Scroll Compensation

With the reversed (newest-first) array: older messages append at the end of the virtualizer array (highest indices = top of viewport in column-reverse). Appending doesn't shift existing virtualizer item positions — items 0...(N-1) stay where they are. **No scroll compensation needed.** The user's current view stays stable; older messages become visible when they scroll up.

This eliminates the `useLayoutEffect` snapshot/restore pattern entirely for load-more. The virtualizer handles growing `count` at the tail natively without scroll-side-effects. This is a significant simplification over the current `useChatTimelineController.ts:276-300` compensation logic.

### User Scroll Interaction

```
onScroll event: scrollTop > 0 (user scrolled up from bottom in column-reverse)
→ set userScrolledUp = true
→ jump-to-newest button appears

scrollTop reaches 0 (bottom/anchor point)
→ set userScrolledUp = false
→ button hides

jump-to-newest button click
→ scrollTo({ top: 0, behavior: 'smooth' })
```

Detection is event-agnostic: check `scrollTop > 0` rather than trying to parse wheel delta or touch direction per-event. The scroll event already reflects the final position. A single `onScroll` handler sets the boolean. No `PIN_THRESHOLD_RATIO`, no ResizeObserver scroll handler.

## Message Loading

### Page Size Reduction

| Setting | Old | New |
|---|---|---|
| `MESSAGE_PAGE_SIZE` | 200 | 25 |

Located in `packages/ui/src/sync/types.ts` or `use-sync.ts` (wherever the constant is defined).

This reduction is coupled to the mount pool: with 10 sessions mounted, 200 messages each would be 2000 entries — wasteful since the virtualizer only renders ~15 at a time. 25 per session keeps the working set small while providing enough history context for load-more triggers. Coupled with the virtualizer, the user sees no difference — they still scroll up to load more on demand.

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
**Files:** `ChatViewport` component, `MessageList` data input, virtualizer config
**Change:** Flex direction switch. Remove `overflow-anchor: none`. `initialOffset: 0`. Reverse sync store's chronological array to newest-first before passing to virtualizer (`useMemo`). Adapt `scrollToIndex` calls to map chronological index → reversed index + use `align: 'center'`. Adapt ScrollShadow with `reversed` prop.
**Verify:** Messages render newest-first at bottom. New messages anchor naturally. No scroll flash. ScrollShadow shows correct shadows. Scrolling up shows older messages in correct order.

### Step 4: Delete Scroll Manager, Build Replacements
**Files:** Delete `useChatScrollManager.ts`. Create `types.ts` (AnimationHandlers, ContentChangeReason migration). Create `useUserScrollDetector.ts`. Create `useSSEAnchorSuppression.ts`. Remove load-more scroll compensation from `useChatTimelineController.ts` (no longer needed — column-reverse + newest-first array eliminates it).
**Change:** Move `AnimationHandlers`/`ContentChangeReason` to shared types file. Update all 10 downstream imports. Implement `useUserScrollDetector` (read `scrollTop > 0` from onScroll, single boolean, jump-to-newest on scrollTo(0)). Move `MessageFreshnessDetector.recordSessionStart()` to `ChatContainer` session-switch effect. Implement `useSSEAnchorSuppression` — when user is at bottom, prevent virtualizer prepend adjustment so new SSE messages appear naturally.
**Verify:** New messages auto-anchor at bottom. Manual scroll up via mouse/touch disables anchoring. Jump-to-newest button works. Load-more has no scroll jump. SSE messages appear without interruption.

### Step 5: Tighten Load-More Threshold
**Files:** Virtualizer config / timeline controller
**Change:** Trigger load-more when within 5 estimated entry heights of the top edge.
**Verify:** Scrolling up loads more messages seamlessly. No content gap.

### Step 6: Polish
**Files:** `MessageRow` memo comparator, `ActiveSessionContext`, `ChatViewport` empty state
**Change:** Add `ActiveSessionContext` provider in `SessionMount`. Extend `MessageRow` `React.memo` comparator to skip rendering when `!isActive` (read via context). Handle empty sessions: `justify-content: flex-end` keeps input at bottom. Verify safe-area and keyboard on mobile via visualViewport resize handling.
**Verify:** Hidden sessions don't cause measurable layout overhead. Empty sessions render correctly. Mobile keyboard doesn't cause scroll jumps. Safari/WebKit column-reverse + keyboard works.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `@tanstack/react-virtual` + `column-reverse` has unknown edge cases | Test first in step 3. Fallback: `transform: scaleY(-1)` container + children (Approach C lite) or keep DOM order with `scrollToIndex` at mount. |
| Mount pool increases memory (10 sessions × DOM trees) | 10 × 25 messages is negligible (~250 entries in store, ~150 visible measurements in virtualizer). Pool size of 10 covers typical usage (switching between a handful of active sessions). Reduce to 5 if memory pressure observed. Measure with `performance.mark` on mount/unmount. |
| Streaming in hidden sessions causes wasted renders | Use `ActiveSessionContext` — `MessageRow` `React.memo` comparator bails out when `!isActive`. |
| SSE prepend adjustment conflicts with anchoring | `useSSEAnchorSuppression` suppresses virtualizer prepend offset when user is at bottom. Test both pinned-at-bottom and scrolled-up scenarios. |
| Safari/WebKit `column-reverse` + keyboard viewport resize | Detect via `visualViewport.resize`. If `!userScrolledUp`, force `scrollTop = 0` to re-anchor. Test on iOS Safari. |
| `AnimationHandlers` / `ContentChangeReason` downstream breakage | All 10 consumers update imports to `types.ts`. Catch at build time via TypeScript. |

## Non-Goals

- Changing the sync layer's LRU cache (already works).
- Changing the virtualizer library (`@tanstack/react-virtual` stays).
- Changing turn grouping or message normalization.
- Changing the SSE/event pipeline.
- Mobile/PWA layout changes beyond scroll/keyboard behavior (existing mobile-first patterns handle responsive layout).
- VS Code or Desktop shell changes (shared UI layer only).
