# Chat Virtualizer Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CSS column-reverse chat layout with standard `@tanstack/react-virtual` virtualizer in natural top-to-bottom order. Remove all message array reversals and `flex-col-reverse` CSS. Modularize `MessageList.tsx` (546 lines) and `SessionMount.tsx` (557 lines).

**Architecture:** `VirtualizedMessageList` owns the virtualizer + scroll hooks. Messages flow ascending (oldest→newest) through the pipeline with zero reversals. `@tanstack/react-virtual` handles viewport rendering and scroll anchoring — `initialScrollOffset` avoids first-paint flash, `scrollToIndex` handles subsequent auto-scroll. Load-more triggers from `virtualizer.range.startIndex`.

**Tech Stack:** React, TypeScript, `@tanstack/react-virtual` v3 (`packages/ui/package.json:48`), Tailwind v4

---

## File Structure

### New

| File | Lines | Responsibility |
|------|-------|----------------|
| `packages/ui/src/components/chat/VirtualizedMessageList.tsx` | ~180 | `useVirtualizer`, `useChatScrollManager`, `useViewportAnchor`, render loop |
| `packages/ui/src/components/chat/hooks/useChatScrollManager.ts` | ~80 | At-bottom detection, auto-scroll, load-more trigger, mobile keyboard re-anchor |
| `packages/ui/src/components/chat/hooks/useViewportAnchor.ts` | ~60 | Capture/restore scroll anchor for load-more prepends |

### Deleted

| File | Reason |
|------|--------|
| `packages/ui/src/components/chat/MessageList.tsx` | Replaced by `VirtualizedMessageList` |
| `packages/ui/src/components/chat/hooks/useUserScrollDetector.ts` | Replaced by `useChatScrollManager` |
| `packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts` | Replaced by `useChatScrollManager` |

### Modified

| File | Lines | Change |
|------|-------|--------|
| `ChatViewport.tsx` | 154→~90 | Remove `flex-col-reverse`, `reversed` prop, `scrollToBottom` prop; swap `MessageList` → `VirtualizedMessageList` |
| `SessionMount.tsx` | 557→~460 | Remove old scroll hooks, load-more scroll listener, ref-sync patch, `scrollToBottom` passthrough |
| `hooks/useChatTimelineController.ts` | 468→~468 | Update `MessageListHandle` import path (line 4) |
| `ScrollShadow.tsx` | 179→~170 | Remove `reversed` prop |
| `layout/ContextSidebarTab.tsx` | 603→~603 | Remove `.reverse()` on line 518 |

### Unchanged

All `message-list/*`, `hooks/useTurnRecords.ts`, `hooks/useSessionMountPool.ts`, `hooks/useChatTurnNavigation.ts`, `turn/LoadOlderButton.tsx`, `lib/turns/*`, `ChatContainer.tsx`, `sync/*` — no changes needed.

---

### Task 1: Create `hooks/useChatScrollManager.ts`

**Files:**
- Create: `packages/ui/src/components/chat/hooks/useChatScrollManager.ts`

- [ ] **Step 1: Write the hook**

```ts
import React from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

const BOTTOM_THRESHOLD_PX = 80;
const LOAD_MORE_START_INDEX = 2;

interface UseChatScrollManagerOptions {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  entryCount: number;
  isActive: boolean;
  loadMore: () => void;
  canLoadMore: boolean;
  isLoadingOlder: boolean;
}

export function useChatScrollManager({
  virtualizer,
  entryCount,
  isActive,
  loadMore,
  canLoadMore,
  isLoadingOlder,
}: UseChatScrollManagerOptions) {
  const isAtBottomRef = React.useRef(true);
  const prevEntryCountRef = React.useRef(entryCount);

  // Track at-bottom state via scroll events
  React.useEffect(() => {
    const scrollEl = virtualizer.scrollElement;
    if (!scrollEl || !isActive) return;

    const checkIfAtBottom = () => {
      const scrollBottom = scrollEl.scrollTop + scrollEl.clientHeight;
      const totalHeight = scrollEl.scrollHeight;
      isAtBottomRef.current = totalHeight - scrollBottom < BOTTOM_THRESHOLD_PX;
    };

    scrollEl.addEventListener('scroll', checkIfAtBottom, { passive: true });
    return () => scrollEl.removeEventListener('scroll', checkIfAtBottom);
  }, [virtualizer, isActive]);

  // Load-more trigger: near the top of the virtual list
  React.useEffect(() => {
    if (!isActive) return;
    const range = virtualizer.range;
    if (range && range.startIndex <= LOAD_MORE_START_INDEX && canLoadMore && !isLoadingOlder) {
      loadMore();
    }
  });

  // Auto-scroll to bottom when new entries arrive and user is at bottom
  React.useEffect(() => {
    if (!isActive) return;
    if (entryCount > prevEntryCountRef.current && isAtBottomRef.current) {
      virtualizer.scrollToIndex(entryCount - 1, { align: 'end' });
    }
    prevEntryCountRef.current = entryCount;
  }, [entryCount, virtualizer, isActive]);

  // Mobile keyboard: re-anchor to bottom on visual viewport resize
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window) || !isActive) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleResize = () => {
      if (isAtBottomRef.current) {
        virtualizer.scrollToIndex(entryCount - 1, { align: 'end' });
      }
    };
    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, [virtualizer, entryCount, isActive]);

  return { isAtBottom: isAtBottomRef };
}
```

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS

---

### Task 2: Create `hooks/useViewportAnchor.ts`

**Files:**
- Create: `packages/ui/src/components/chat/hooks/useViewportAnchor.ts`

- [ ] **Step 1: Write the hook**

```ts
import React from 'react';

interface ViewportAnchor {
  entryKey: string;
  offsetFromTop: number;
}

export function useViewportAnchor(
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const captureViewportAnchor = React.useCallback((): ViewportAnchor | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const nodes: HTMLElement[] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-turn-entry]'),
    );
    const firstVisible = nodes.find(
      (node) => node.getBoundingClientRect().bottom > containerRect.top + 1,
    );
    if (!firstVisible) return null;
    const entryKey = firstVisible.dataset.turnEntry;
    if (!entryKey) return null;
    return {
      entryKey,
      offsetFromTop: firstVisible.getBoundingClientRect().top - containerRect.top,
    };
  }, [scrollRef]);

  const restoreViewportAnchor = React.useCallback(
    (anchor: ViewportAnchor | null): boolean => {
      if (!anchor) return false;
      const container = scrollRef.current;
      if (!container) return false;
      const element = container.querySelector(
        `[data-turn-entry="${anchor.entryKey}"]`,
      );
      if (!element) return false;
      const containerRect = container.getBoundingClientRect();
      const targetTop = element.getBoundingClientRect().top - containerRect.top;
      const delta = targetTop - anchor.offsetFromTop;
      if (delta !== 0) {
        container.scrollTop += delta;
      }
      return true;
    },
    [scrollRef],
  );

  return { captureViewportAnchor, restoreViewportAnchor };
}
```

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS

---

### Task 3: Create `VirtualizedMessageList.tsx`

**Files:**
- Create: `packages/ui/src/components/chat/VirtualizedMessageList.tsx`
- Reference: `packages/ui/src/components/chat/MessageList.tsx` (port and adapt logic)
- Reference: `packages/ui/src/components/chat/message-list/normalizeMessages.ts` (imports)

**Key changes from MessageList.tsx:**
1. Remove `reversedDisplayMessages = [...displayMessages].reverse()` — use `displayMessages` directly
2. `useTurnRecords(displayMessages, {...})` — ascending, no change needed (hook builds turns in iteration order; `streamingTurn = last element = newest` with ascending input)
3. `staticRenderEntries` iterates `displayMessages` (ascending) instead of `reversedDisplayMessages`
4. `trailingStreamingEntry` checks `displayMessages[displayMessages.length - 1]` (last = newest) instead of `reversedDisplayMessages[0]`
5. `previousMessage`/`nextMessage` for ungrouped: `i > 0 ? displayMessages[i - 1] : undefined` and `i + 1 < length ? displayMessages[i + 1] : undefined` (ascending convention)
6. Add `useVirtualizer` from `@tanstack/react-virtual`
7. Call `useChatScrollManager` and `useViewportAnchor` internally
8. No `flex-col-reverse` CSS
9. No `scrollRef` external prop — owns its own scroll container
10. Export `MessageListHandle` type alias

- [ ] **Step 1: Write VirtualizedMessageList component**

See complete code in the Plan Reference section below.

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: FAIL — existing imports of `MessageList` from `ChatViewport` and `SessionMount` will break (fixed in Tasks 5, 6)

---

### Task 4: Update `ChatViewport.tsx`

**Files:**
- Modify: `packages/ui/src/components/chat/ChatViewport.tsx`

- [ ] **Step 1: Apply changes**

Changes:
1. Line 4: Replace `import MessageList, { type MessageListHandle } from './MessageList'` → `import VirtualizedMessageList, { type MessageListHandle } from './VirtualizedMessageList'`
2. Line 39: Remove `scrollToBottom` prop from `ChatViewportProps`
3. Line 64: Remove `scrollToBottom` destructuring
4. Lines 82-84: Replace `<ScrollShadow reversed className="flex flex-col-reverse...">` with `<ScrollShadow className="flex...">` (remove `reversed` prop and `flex-col-reverse`)
5. Lines 92-109: Replace `<MessageList ref={...} scrollRef={scrollRef} ...>` with `<VirtualizedMessageList ref={...} ...>` (remove `scrollRef` prop)
6. Line 107: Remove `scrollToBottom={scrollToBottom}` prop

Updated `ChatViewportProps` type (remove `scrollToBottom` lines 38-39):
```tsx
export type ChatViewportProps = {
    currentSessionId: string;
    isDesktopExpandedInput: boolean;
    stickyUserHeader: boolean;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messageListRef: React.RefObject<MessageListHandle | null>;
    turnStart: number;
    pendingRevealWork: boolean;
    renderedMessages: Array<{ info: Message; parts: Part[] }>;
    hasMoreAboveTurns: boolean;
    isLoadingOlder: boolean;
    sessionIsWorking: boolean;
    streamingMessageId: string | null;
    activeStreamingPhase: import('./message/types').StreamPhase | null;
    retryOverlay: { sessionId: string; message: string; confirmedAt?: number; fallbackTimestamp?: number } | null;
    handleMessageContentChange: (reason?: ContentChangeReason) => void;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
    handleLoadOlder: () => void;
    // scrollToBottom removed
    sessionQuestions: QuestionRequest[];
    sessionPermissions: PermissionRequest[];
    isProgrammaticFollowActive: boolean;
    onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
};
```

Updated ScrollShadow in JSX:
```tsx
<ScrollShadow
    className="flex absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
    ref={scrollRef}
    onScroll={onScroll}
    observeMutations={false}
    hideTopShadow={isMobile && stickyUserHeader}
    data-scroll-shadow="true"
    data-scrollbar="chat"
>
    <VirtualizedMessageList
        ref={messageListRef}
        sessionKey={currentSessionId}
        turnStart={turnStart}
        disableStaging={pendingRevealWork}
        messages={renderedMessages}
        sessionIsWorking={sessionIsWorking}
        activeStreamingMessageId={streamingMessageId}
        activeStreamingPhase={activeStreamingPhase}
        retryOverlay={retryOverlay}
        onMessageContentChange={handleMessageContentChange}
        getAnimationHandlers={getAnimationHandlers}
        hasMoreAbove={hasMoreAboveTurns}
        isLoadingOlder={isLoadingOlder}
        onLoadOlder={handleLoadOlder}
    />
```

Update `React.memo` comparator (remove `scrollToBottom` checks):
- Remove line 147: `&& prev.scrollToBottom === next.scrollToBottom`

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: FAIL — `SessionMount` still imports old hooks and passes `scrollToBottom`

---

### Task 5: Update `SessionMount.tsx`

**Files:**
- Modify: `packages/ui/src/components/chat/SessionMount.tsx`

- [ ] **Step 1: Apply changes**

Changes:
1. Line 4: `import { type MessageListHandle } from './MessageList'` → `import { type MessageListHandle } from './VirtualizedMessageList'`
2. Lines 8-9: Remove `import { useUserScrollDetector } from './hooks/useUserScrollDetector'` and `import { useSSEAnchorSuppression } from './hooks/useSSEAnchorSuppression'`
3. Line 254: Remove `const { userScrolledUp, scrollToBottom, onScroll } = useUserScrollDetector(scrollRef);`
4. Line 255: Remove `useSSEAnchorSuppression(scrollRef, userScrolledUp, sessionMessages.length);`
5. Lines 287-296: Remove ref-sync patch block (all of `canLoadEarlierRef`, `isLoadingOlderRef`, `loadEarlierRef` and their effect)
6. Lines 299-314: Remove aggressive load-more scroll listener (`React.useEffect(() => {...}` with `distanceFromTop`)
7. Line 78: Remove `onScrollStateChange` prop from `SessionMountProps` (or keep but deprecate)
8. Remove `scrollToBottom` from any pass-through props to `ChatViewport`
9. Remove `onScroll` from any pass-through to `ChatViewport`

Specifically:
- Remove the `onScrollStateChange` prop from type and destructuring
- Remove the `userScrolledUp`, `scrollToBottom`, `onScroll` destructured variables
- Remove the ref-sync block
- Remove the scroll listener block
- Remove `scrollToBottom={scrollToBottom}` and `onScroll={onScroll}` from `<ChatViewport ...>` JSX

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: FAIL — `useChatTimelineController` still imports `MessageListHandle` from old path

---

### Task 6: Update remaining imports

**Files:**
- Modify: `packages/ui/src/components/chat/hooks/useChatTimelineController.ts` (line 4)

- [ ] **Step 1: Update import path**

Line 4: `import type { MessageListHandle } from '../MessageList';` → `import type { MessageListHandle } from '../VirtualizedMessageList';`

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS (all imports resolved)

---

### Task 7: Remove `reversed` prop from `ScrollShadow.tsx`

**Files:**
- Modify: `packages/ui/src/components/ui/ScrollShadow.tsx`

- [ ] **Step 1: Remove `reversed` prop and its usage**

1. Remove from type (line 12): `reversed?: boolean;`
2. Remove from destructuring (line 39): `reversed = false,`
3. Remove reversed-based logic in `checkOverflow` (lines 97-109): simplify to non-reversed version only

Current reversed logic:
```ts
const hasBefore = orientation === "vertical"
    ? reversed
        ? el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
        : el.scrollTop > offset + SUBPIXEL_TOLERANCE
    : el.scrollLeft > offset + SUBPIXEL_TOLERANCE;

let hasAfter = orientation === "vertical"
    ? reversed
        ? el.scrollTop > offset + SUBPIXEL_TOLERANCE
        : el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
    : el.scrollWidth - (el.scrollLeft + el.clientWidth) > offset + SUBPIXEL_TOLERANCE;
```

Replaced with:
```ts
const hasBefore = orientation === "vertical"
    ? el.scrollTop > offset + SUBPIXEL_TOLERANCE
    : el.scrollLeft > offset + SUBPIXEL_TOLERANCE;

let hasAfter = orientation === "vertical"
    ? el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
    : el.scrollWidth - (el.scrollLeft + el.clientWidth) > offset + SUBPIXEL_TOLERANCE;
```

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS

---

### Task 8: Fix `ContextSidebarTab.tsx` manual reverse

**Files:**
- Modify: `packages/ui/src/components/layout/ContextSidebarTab.tsx` (line 518)

- [ ] **Step 1: Remove `.reverse()`**

Line 518: `{[...sessionMessages].reverse().map((message) => {` → `{sessionMessages.map((message) => {`

The `.reverse()` was needed when the pipeline had a reversal pattern. Now messages are in ascending order everywhere. The raw messages display should show in natural ascending order.

- [ ] **Step 2: Run type-check**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS

---

### Task 9: Delete old files

**Files:**
- Delete: `packages/ui/src/components/chat/MessageList.tsx`
- Delete: `packages/ui/src/components/chat/hooks/useUserScrollDetector.ts`
- Delete: `packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts`

- [ ] **Step 1: Delete files**

```bash
rm packages/ui/src/components/chat/MessageList.tsx
rm packages/ui/src/components/chat/hooks/useUserScrollDetector.ts
rm packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts
```

- [ ] **Step 2: Run type-check + lint**

```bash
cd packages/ui && bun run type-check
```
Expected: PASS

```bash
cd packages/ui && bun run lint
```
Expected: PASS (no new errors)

---

### Task 10: Full build verification

- [ ] **Step 1: Run full type-check**

```bash
bun run type-check
```
Expected: PASS for all packages

- [ ] **Step 2: Run lint**

```bash
bun run lint
```
Expected: PASS (no new errors)

- [ ] **Step 3: Run build**

```bash
bun run build
```
Expected: PASS

---

### Task 11: Manual verification checklist

- [ ] Fresh session: newest message visible on first paint with no scroll flash
- [ ] Streaming: auto-scrolls as assistant types; stops if user scrolls up during streaming
- [ ] Load-more: scrolling to top triggers history load; position remains stable after prepend  
- [ ] Session switch: immediately shows bottom of new session
- [ ] Turn navigation (timeline dialog): scrolls to correct turn
- [ ] Mobile keyboard: scroll re-anchors properly
- [ ] Permissions/questions cards: appear at bottom of chat
- [ ] Context sidebar "Raw Messages": shows in correct order (oldest to newest top-to-bottom)

---

## Plan Reference: VirtualizedMessageList.tsx

```tsx
import React from 'react';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { ChatMessageEntry } from './lib/turns/types';
import type { StreamPhase } from './message/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTurnRecords } from './hooks/useTurnRecords';
import { applyRetryOverlay } from './lib/turns/applyRetryOverlay';
import { useUIStore } from '@/stores/useUIStore';
import { FadeInDisabledProvider } from './message/FadeInOnReveal';
import { hasPendingUserSendAnimation, consumePendingUserSendAnimation } from '@/lib/userSendAnimation';
import { streamPerfCount, streamPerfMeasure } from '@/stores/utils/streamDebug';
import { LoadOlderButton } from './turn/LoadOlderButton';
import {
  getNormalizedMessageForDisplay,
  hasCompactionPart,
  getPartText,
  normalizeCompactionSummaryMessage,
  isUserSubtaskMessage,
  isSyntheticSubtaskBridgeAssistant,
  withSubtaskSessionId,
  isUserShellMarkerMessage,
  getShellBridgeAssistantDetails,
  getMessageId,
  withShellBridgeDetails,
  resolveMessageRole,
} from './message-list/normalizeMessages';
import type { RenderEntry } from './message-list/MessageListEntry';
import { MessageListEntry } from './message-list/MessageListEntry';
import type { TurnUiState } from './message-list/TurnBlock';
import { useChatScrollManager } from './hooks/useChatScrollManager';
import { useViewportAnchor } from './hooks/useViewportAnchor';

const DEFAULT_ENTRY_HEIGHT = 160;
const OVERSCAN = 5;

const useStableEvent = <TArgs extends unknown[], TResult>(handler: (...args: TArgs) => TResult) => {
  const handlerRef = React.useRef(handler);
  React.useEffect(() => { handlerRef.current = handler; }, [handler]);
  return React.useCallback((...args: TArgs) => handlerRef.current(...args), []);
};

export interface ChatViewerHandle {
  scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => boolean;
  scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => boolean;
  captureViewportAnchor: () => { entryKey: string; offsetTop: number } | null;
  restoreViewportAnchor: (anchor: { entryKey: string; offsetTop: number }) => boolean;
}

// Alias for backward compatibility with existing importers
export type MessageListHandle = ChatViewerHandle;

interface VirtualizedMessageListProps {
  sessionKey: string;
  turnStart: number;
  disableStaging?: boolean;
  messages: ChatMessageEntry[];
  sessionIsWorking?: boolean;
  activeStreamingMessageId?: string | null;
  activeStreamingPhase?: StreamPhase | null;
  retryOverlay?: {
    sessionId: string;
    message: string;
    confirmedAt?: number;
    fallbackTimestamp?: number;
  } | null;
  onMessageContentChange: (reason?: ContentChangeReason) => void;
  getAnimationHandlers: (messageId: string) => AnimationHandlers;
  hasMoreAbove: boolean;
  isLoadingOlder: boolean;
  onLoadOlder: () => void;
}

const VirtualizedMessageList = React.forwardRef<ChatViewerHandle, VirtualizedMessageListProps>(
  (
    {
      sessionKey,
      turnStart,
      disableStaging: _disableStaging,
      messages,
      sessionIsWorking = false,
      activeStreamingMessageId = null,
      activeStreamingPhase = null,
      retryOverlay = null,
      onMessageContentChange,
      getAnimationHandlers,
      hasMoreAbove,
      isLoadingOlder,
      onLoadOlder,
    },
    ref,
  ) => {
    streamPerfCount('ui.virtual_list.render');
    void _disableStaging;
    const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    const activityRenderMode = useUIStore((state) => state.activityRenderMode);
    const defaultActivityExpanded = activityRenderMode === 'summary';
    const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => new Map());
    const userAnimationRef = React.useRef<{
      sessionKey: string | undefined;
      previousOrder: string[];
      animatedIds: Set<string>;
    }>({ sessionKey: undefined, previousOrder: [], animatedIds: new Set() });
    const stableGetAnimationHandlers = useStableEvent(getAnimationHandlers);
    const stableOnLoadOlder = useStableEvent(onLoadOlder);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => { setTurnUiStates(new Map()); }, [activityRenderMode]);

    const toggleTurnGroup = React.useCallback(
      (turnId: string) => {
        setTurnUiStates((previous) => {
          const next = new Map(previous);
          const current = next.get(turnId) ?? { isExpanded: defaultActivityExpanded };
          next.set(turnId, { isExpanded: !current.isExpanded });
          return next;
        });
      },
      [defaultActivityExpanded],
    );

    // --- Message normalization (ports from MessageList.tsx, NO .reverse()) ---
    const baseDisplayMessages = React.useMemo(
      () => streamPerfMeasure('ui.virtual_list.base_display_ms', () => {
        const seenIdsFromTail = new Set<string>();
        const dedupedMessages: ChatMessageEntry[] = [];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          const messageId = message.info?.id;
          if (typeof messageId === 'string') {
            if (seenIdsFromTail.has(messageId)) continue;
            seenIdsFromTail.add(messageId);
          }
          dedupedMessages.push(getNormalizedMessageForDisplay(message));
        }
        dedupedMessages.reverse();

        const output: ChatMessageEntry[] = [];
        const compactionCommandIds = new Set<string>();
        for (let index = 0; index < dedupedMessages.length; index += 1) {
          const current = dedupedMessages[index];
          const currentWithRole = normalizeCompactionSummaryMessage(current, compactionCommandIds);
          if (hasCompactionPart(current) || current.parts.some((part) => part.type === 'text' && getPartText(part).trim() === '/compact')) {
            compactionCommandIds.add(current.info.id);
          }
          const previous = output.length > 0 ? output[output.length - 1] : undefined;
          if (isUserSubtaskMessage(previous)) {
            const bridge = isSyntheticSubtaskBridgeAssistant(currentWithRole);
            if (bridge.hide) {
              output[output.length - 1] = withSubtaskSessionId(previous as ChatMessageEntry, bridge.taskSessionId);
              continue;
            }
          }
          if (isUserShellMarkerMessage(previous)) {
            const bridge = getShellBridgeAssistantDetails(currentWithRole, getMessageId(previous));
            if (bridge.hide) {
              output[output.length - 1] = withShellBridgeDetails(previous as ChatMessageEntry, bridge.details);
              continue;
            }
          }
          output.push(currentWithRole);
        }
        return output;
      }),
      [messages],
    );

    // --- Retry overlay ---
    const displayMessages = React.useMemo(
      () => streamPerfMeasure('ui.virtual_list.retry_overlay_ms', () =>
        applyRetryOverlay(baseDisplayMessages, {
          sessionId: retryOverlay?.sessionId ?? null,
          message: retryOverlay?.message ?? 'Quota limit reached. Retrying automatically.',
          confirmedAt: retryOverlay?.confirmedAt,
          fallbackTimestamp: retryOverlay?.fallbackTimestamp ?? 0,
        }),
      ),
      [baseDisplayMessages, retryOverlay],
    );

    // --- USE displayMessages directly (ascending, no .reverse()) ---
    // useTurnRecords builds turns from messages in iteration order.
    // With ascending input, projection.turns[last] = newest turn = streamingTurn. Correct.
    const { projection, staticTurns, streamingTurn } = useTurnRecords(displayMessages, {
      sessionKey,
      showTextJustificationActivity: chatRenderMode === 'sorted',
    });

    // --- Build render entries in ASCENDING order ---
    const staticRenderEntries = React.useMemo<RenderEntry[]>(
      () => streamPerfMeasure('ui.virtual_list.render_entries_ms', () => {
        const turnEntries = staticTurns.map((turn) => ({
          kind: 'turn' as const,
          key: `turn:${turn.turnId}`,
          turn,
          isLastTurn: turn.turnId === projection.lastTurnId,
        }));

        if (projection.ungroupedMessageIds.size === 0) return turnEntries;

        const turnEntryByUserMessageId = new Map<string, RenderEntry>();
        turnEntries.forEach((entry) => {
          turnEntryByUserMessageId.set(entry.turn.userMessage.info.id, entry);
        });

        const orderedEntries: RenderEntry[] = [];
        // Iterate ASCENDING (oldest→newest) — no reversal
        displayMessages.forEach((message: ChatMessageEntry, i: number) => {
          const turnEntry = turnEntryByUserMessageId.get(message.info.id);
          if (turnEntry) {
            orderedEntries.push(turnEntry);
            return;
          }
          if (!projection.ungroupedMessageIds.has(message.info.id)) return;
          orderedEntries.push({
            kind: 'ungrouped',
            key: `msg:${message.info.id}`,
            message,
            previousMessage: i > 0 ? displayMessages[i - 1] : undefined,
            nextMessage: i + 1 < displayMessages.length ? displayMessages[i + 1] : undefined,
          });
        });
        return orderedEntries;
      }),
      [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, staticTurns],
    );

    // --- Streaming tail entry (check LAST element for ascending order) ---
    const trailingStreamingEntry = React.useMemo<RenderEntry | undefined>(() => {
      if (streamingTurn) {
        return {
          kind: 'turn',
          key: `turn:${streamingTurn.turnId}`,
          turn: streamingTurn,
          isLastTurn: streamingTurn.turnId === projection.lastTurnId,
        } satisfies RenderEntry;
      }
      if (projection.ungroupedMessageIds.size === 0) return undefined;
      const lastMessage = displayMessages[displayMessages.length - 1];
      if (!lastMessage || !projection.ungroupedMessageIds.has(lastMessage.info.id)) return undefined;
      return {
        kind: 'ungrouped',
        key: `msg:${lastMessage.info.id}`,
        message: lastMessage,
        previousMessage: displayMessages.length > 1 ? displayMessages[displayMessages.length - 2] : undefined,
        nextMessage: undefined,
      } satisfies RenderEntry;
    }, [displayMessages, projection.lastTurnId, projection.ungroupedMessageIds, streamingTurn]);

    if (trailingStreamingEntry) streamPerfCount('ui.virtual_list.render.streaming');

    const historyEntries = staticRenderEntries;

    // --- Build entries array for virtualizer (ascending) ---
    const allEntries = React.useMemo(() => {
      const result: RenderEntry[] = [];
      if (trailingStreamingEntry) result.push(trailingStreamingEntry);
      result.push(...historyEntries);
      return result;
    }, [historyEntries, trailingStreamingEntry]);

    const estimateEntrySize = React.useCallback(
      (index: number): number => {
        const entry = allEntries[index];
        if (!entry) return DEFAULT_ENTRY_HEIGHT;
        if (entry.kind === 'ungrouped') {
          return resolveMessageRole(entry.message) === 'user' ? 80 : DEFAULT_ENTRY_HEIGHT;
        }
        return DEFAULT_ENTRY_HEIGHT;
      },
      [allEntries],
    );

    const virtualizer = useVirtualizer({
      count: allEntries.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: estimateEntrySize,
      overscan: OVERSCAN,
    });

    // --- Scroll manager (load-more + auto-scroll + mobile keyboard) ---
    useChatScrollManager({
      virtualizer,
      entryCount: allEntries.length,
      isActive: true,
      loadMore: stableOnLoadOlder,
      canLoadMore: turnStart > 0 || hasMoreAbove,
      isLoadingOlder,
    });

    const { captureViewportAnchor, restoreViewportAnchor } = useViewportAnchor(scrollRef);

    // --- User animation detection (SYNCHRONOUS during render) ---
    const currentUserOrder = React.useMemo(
      () => messages.filter((m) => resolveMessageRole(m) === 'user').map((m) => m.info.id),
      [messages],
    );

    {
      const anim = userAnimationRef.current;
      if (anim.sessionKey !== sessionKey) {
        anim.sessionKey = sessionKey;
        anim.previousOrder = currentUserOrder;
        anim.animatedIds = new Set();
      }
      const prev = anim.previousOrder;
      if (currentUserOrder.length > prev.length) {
        const isAppendOnly = prev.every((id, i) => currentUserOrder[i] === id);
        if (isAppendOnly && hasPendingUserSendAnimation(sessionKey)) {
          for (let i = prev.length; i < currentUserOrder.length; i += 1) {
            const id = currentUserOrder[i];
            if (id && !anim.animatedIds.has(id)) {
              if (!consumePendingUserSendAnimation(sessionKey)) break;
              anim.animatedIds.add(id);
            }
          }
        }
      }
      anim.previousOrder = currentUserOrder;
    }

    const shouldAnimateUserMessage = React.useCallback(
      (message: ChatMessageEntry): boolean => {
        if (resolveMessageRole(message) !== 'user') return false;
        return userAnimationRef.current.animatedIds.has(message.info.id);
      },
      [],
    );
    const onUserAnimationConsumed = React.useCallback((messageId: string) => {
      userAnimationRef.current.animatedIds.delete(messageId);
    }, []);

    // --- Virtualized entry render callback ---
    const renderEntry = React.useCallback(
      (entry: RenderEntry, isStreaming: boolean) => (
        <MessageListEntry
          entry={entry}
          onMessageContentChange={isStreaming ? stableTailContentChange : stableHistoryContentChange}
          getAnimationHandlers={stableGetAnimationHandlers}
          stickyUserHeader={stickyUserHeader}
          sessionIsWorking={isStreaming ? sessionIsWorking : false}
          defaultActivityExpanded={defaultActivityExpanded}
          turnUiStates={turnUiStates}
          onToggleTurnGroup={toggleTurnGroup}
          chatRenderMode={chatRenderMode}
          shouldAnimateUserMessage={shouldAnimateUserMessage}
          onUserAnimationConsumed={onUserAnimationConsumed}
          activeStreamingMessageId={isStreaming ? activeStreamingMessageId : null}
          activeStreamingPhase={activeStreamingPhase}
        />
      ),
      [stickyUserHeader, sessionIsWorking, defaultActivityExpanded, turnUiStates, toggleTurnGroup, chatRenderMode, shouldAnimateUserMessage, onUserAnimationConsumed, activeStreamingMessageId, activeStreamingPhase, stableGetAnimationHandlers],
    );

    const stableHistoryContentChange = useStableEvent((reason?: ContentChangeReason) => { onMessageContentChange(reason); });
    const stableTailContentChange = useStableEvent((reason?: ContentChangeReason) => { onMessageContentChange(reason); });

    // --- Expose handle via ref ---
    const messageIndexMap = React.useMemo(() => {
      const indexMap = new Map<string, number>();
      allEntries.forEach((entry, index) => {
        if (entry.kind === 'ungrouped') { indexMap.set(entry.message.info.id, index); return; }
        indexMap.set(entry.turn.userMessage.info.id, index);
        entry.turn.assistantMessages.forEach((m) => indexMap.set(m.info.id, index));
      });
      return indexMap;
    }, [allEntries]);

    React.useImperativeHandle(ref, () => ({
      scrollToTurnId: (turnId: string, options?: { behavior?: ScrollBehavior }) => {
        const behavior = options?.behavior ?? 'auto';
        const container = scrollRef.current;
        if (!container) return false;
        const turnElement = container.querySelector<HTMLElement>(`[data-turn-id="${turnId}"]`);
        if (turnElement) { turnElement.scrollIntoView({ behavior, block: 'nearest' }); return true; }
        const index = allEntries.findIndex((e) => e.kind === 'turn' && e.turn.turnId === turnId);
        if (index !== -1) { virtualizer.scrollToIndex(index, { behavior, align: 'start' }); return true; }
        return false;
      },
      scrollToMessageId: (messageId: string, options?: { behavior?: ScrollBehavior }) => {
        const behavior = options?.behavior ?? 'auto';
        const container = scrollRef.current;
        if (!container) return false;
        const messageElement = container.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
        if (messageElement) { messageElement.scrollIntoView({ behavior, block: 'nearest' }); return true; }
        const index = messageIndexMap.get(messageId);
        if (typeof index === 'number') { virtualizer.scrollToIndex(index, { behavior, align: 'start' }); return true; }
        return false;
      },
      captureViewportAnchor: captureViewportAnchor,
      restoreViewportAnchor: restoreViewportAnchor,
    }), [allEntries, messageIndexMap, virtualizer, captureViewportAnchor, restoreViewportAnchor]);

    const disableFadeIn = false;

    return (
      <FadeInDisabledProvider disabled={disableFadeIn}>
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
          data-scrollbar="chat"
        >
          <LoadOlderButton
            hasMoreAbove={turnStart > 0 || hasMoreAbove}
            isLoadingOlder={isLoadingOlder}
            onLoadOlder={stableOnLoadOlder}
          />

          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = allEntries[virtualItem.index];
              if (!entry) return null;
              const isStreaming = entry === trailingStreamingEntry;
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    width: '100%',
                  }}
                >
                  <div data-turn-entry={entry.key}>
                    {renderEntry(entry, isStreaming)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FadeInDisabledProvider>
    );
  },
);

VirtualizedMessageList.displayName = 'VirtualizedMessageList';

export default React.memo(VirtualizedMessageList);
```
