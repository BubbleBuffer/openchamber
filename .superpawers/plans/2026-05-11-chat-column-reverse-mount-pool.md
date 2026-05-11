# Chat Column-Reverse + Mount Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate session-switch loading flashes and scroll flicker by keeping the last 10 `MessageList` instances mounted (visibility toggle), using CSS `column-reverse` for natural bottom anchoring, and replacing the 400-line scroll manager with two focused hooks.

**Architecture:** A `SessionMount` pool in `ChatContainer` maintains up to 10 mounted sessions as hidden DOM. Each mount wraps a `ChatViewport` with `flex-direction: column-reverse` and a reversed (newest-first) message array for the virtualizer. Browser overflow anchoring replaces JS scroll-to-bottom. Two small hooks — `useUserScrollDetector` (boolean: `scrollTop > 0`) and `useSSEAnchorSuppression` (suppress virtualizer prepend offset when pinned) — replace `useChatScrollManager.ts` entirely.

**Tech Stack:** React + TypeScript + Tailwind v4, Zustand, `@tanstack/react-virtual`, Base UI

---

## File Structure

### New files
| File | Responsibility |
|---|---|
| `packages/ui/src/components/chat/timeline/types.ts` | Shared types migrated from `useChatScrollManager.ts`: `AnimationHandlers`, `ContentChangeReason` |
| `packages/ui/src/components/chat/hooks/useSessionMountPool.ts` | LRU mount pool state: `Map<sessionId, SessionMountState>`, eviction logic, `activateSession`, `mountedSessions` |
| `packages/ui/src/components/chat/hooks/useUserScrollDetector.ts` | Reads `onScroll` from scroll container. Returns `{ userScrolledUp, scrollToBottom }`. Handles `visualViewport.resize` for Safari keyboard re-anchor |
| `packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts` | Detects virtualizer prepend adjustments. When `!userScrolledUp`, suppresses offset shift so new SSE messages appear naturally at bottom |
| `packages/ui/src/components/chat/ActiveSessionContext.tsx` | React context providing `isActive: boolean` for the current session mount |

### Modified files
| File | Change |
|---|---|
| `packages/ui/src/sync/use-sync.ts` | `MESSAGE_PAGE_SIZE` 200 → 25 |
| `packages/ui/src/components/ui/ScrollShadow.tsx` | Add `reversed?: boolean` prop; flip overflow check when true |
| `packages/ui/src/components/chat/ChatContainer.tsx` | Mount pool integration; `column-reverse` CSS; delete scroll-manager usage; wire `useUserScrollDetector` + `useSSEAnchorSuppression`; move `MessageFreshnessDetector.recordSessionStart()` |
| `packages/ui/src/components/chat/MessageList.tsx` | Reverse `messages` array via `useMemo` before passing to virtualizer; `initialOffset: 0`; `scrollToIndex` with `align: 'center'`; adapt `scrollIntoView` block param |
| `packages/ui/src/components/chat/hooks/useChatTimelineController.ts` | Delete `prePrependScrollRef` and `useLayoutEffect` lines 270–300 (load-more compensation no longer needed) |
| `packages/ui/src/components/chat/ChatMessage.tsx` | Update import path for `AnimationHandlers`, `ContentChangeReason` |
| `packages/ui/src/components/chat/MessageBody.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/components/TurnActivity.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/message/parts/JustificationBlock.tsx` | Update import path for `ContentChangeReason` |
| `packages/ui/src/components/chat/message/parts/ToolPart.tsx` | Update import path for `ContentChangeReason` |

### Deleted files
| File | Reason |
|---|---|
| `packages/ui/src/hooks/useChatScrollManager.ts` | Replaced by `useUserScrollDetector` + `useSSEAnchorSuppression` (~60 lines total) |

---

## Tasks

### Task 1: Reduce MESSAGE_PAGE_SIZE to 25

**Files:**
- Modify: `packages/ui/src/sync/use-sync.ts:23`

**Rationale:** Coupled to mount pool — 10 sessions × 25 messages keeps working set small while virtualizer renders ~15 at a time.

- [ ] **Step 1: Edit the constant**

In `packages/ui/src/sync/use-sync.ts` line 23, change:

```typescript
const MESSAGE_PAGE_SIZE = 200
```

To:

```typescript
const MESSAGE_PAGE_SIZE = 25
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors related to this file.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/sync/use-sync.ts
git commit -m "feat(chat): reduce MESSAGE_PAGE_SIZE 200 -> 25"
```

---

### Task 2: Create shared timeline types file

**Files:**
- Create: `packages/ui/src/components/chat/timeline/types.ts`

**Rationale:** `AnimationHandlers` and `ContentChangeReason` are imported by 10 files. Extracting them now lets us migrate imports incrementally without breaking the build.

- [ ] **Step 1: Create the types file**

Create `packages/ui/src/components/chat/timeline/types.ts`:

```typescript
export type ContentChangeReason = 'text' | 'structural' | 'permission';

export interface AnimationHandlers {
  onChunk: () => void;
  onComplete: () => void;
  onStreamingCandidate?: () => void;
  onAnimationStart?: () => void;
  onReservationCancelled?: () => void;
  onReasoningBlock?: () => void;
  onAnimatedHeightChange?: (height: number) => void;
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: Pass (new file has no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/timeline/types.ts
git commit -m "feat(chat): extract AnimationHandlers and ContentChangeReason to shared types"
```

---

### Task 3: Migrate all imports from useChatScrollManager to shared types

**Files:**
- Modify: `packages/ui/src/components/chat/MessageList.tsx:8`
- Modify: `packages/ui/src/components/chat/ChatMessage.tsx:20`
- Modify: `packages/ui/src/components/chat/message/MessageBody.tsx:21`
- Modify: `packages/ui/src/components/chat/components/TurnActivity.tsx:7`
- Modify: `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx:5`
- Modify: `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx:7`
- Modify: `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx:6`
- Modify: `packages/ui/src/components/chat/message/parts/JustificationBlock.tsx:3`
- Modify: `packages/ui/src/components/chat/message/parts/ToolPart.tsx:24`
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx:15`

**Rationale:** All 10 consumers switch to the new types file. `ChatContainer.tsx` still imports `useChatScrollManager` (the hook) — that import stays for now; only the type imports move.

- [ ] **Step 1: Update MessageList.tsx import**

Replace line 8 in `MessageList.tsx`:

```typescript
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 2: Update ChatMessage.tsx import**

Replace line 20 in `ChatMessage.tsx`:

```typescript
import type { AnimationHandlers, ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 3: Update MessageBody.tsx import**

Replace line 21 in `MessageBody.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 4: Update TurnActivity.tsx import**

Replace line 7 in `TurnActivity.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 5: Update AssistantTextPart.tsx import**

Replace line 5 in `AssistantTextPart.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 6: Update ProgressiveGroup.tsx import**

Replace line 7 in `ProgressiveGroup.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 7: Update ReasoningPart.tsx import**

Replace line 6 in `ReasoningPart.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 8: Update JustificationBlock.tsx import**

Replace line 3 in `JustificationBlock.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 9: Update ToolPart.tsx import**

Replace line 24 in `ToolPart.tsx`:

```typescript
import type { ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import type { ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 10: Update ChatContainer.tsx import**

Replace line 15 in `ChatContainer.tsx`:

```typescript
import { useChatScrollManager, type AnimationHandlers, type ContentChangeReason } from '@/hooks/useChatScrollManager';
```

With:

```typescript
import { useChatScrollManager } from '@/hooks/useChatScrollManager';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
```

- [ ] **Step 11: Verify type-check**

Run: `bun run type-check`
Expected: No errors. The old `useChatScrollManager.ts` still exports these types (for now, duplicated), so both old and new import paths resolve.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(chat): migrate AnimationHandlers and ContentChangeReason imports to shared types"
```

---

### Task 4: Add reversed prop to ScrollShadow

**Files:**
- Modify: `packages/ui/src/components/ui/ScrollShadow.tsx`

**Rationale:** In `column-reverse`, `scrollTop = 0` is the bottom. The overflow check must flip shadow directions.

- [ ] **Step 1: Add reversed prop to type and component**

In `ScrollShadow.tsx`, add `reversed?: boolean` to `ScrollShadowProps` (line 3–13):

```typescript
export type ScrollShadowProps = React.HTMLAttributes<HTMLElement> & {
  as?: React.ElementType;
  orientation?: "vertical" | "horizontal";
  offset?: number;
  size?: number;
  isEnabled?: boolean;
  hideTopShadow?: boolean;
  hideBottomShadow?: boolean;
  observeMutations?: boolean;
  reversed?: boolean;
  onVisibilityChange?: (state: "both" | "none" | "top" | "bottom" | "left" | "right") => void;
};
```

In the component destructuring (around line 30–43), add `reversed = false`:

```typescript
  {
    as: Component = "div",
    orientation = "vertical",
    offset = 0,
    size = 48,
    isEnabled = true,
    hideTopShadow = false,
    hideBottomShadow = false,
    observeMutations = true,
    reversed = false,
    onVisibilityChange,
    style,
    className,
    children,
    ...rest
  },
```

- [ ] **Step 2: Flip overflow check when reversed**

In the `checkOverflow` callback (around line 83–118), update the `hasBefore` and `hasAfter` logic for vertical orientation:

Replace lines 96–103:

```typescript
      const hasBefore =
        orientation === "vertical"
          ? el.scrollTop > offset + SUBPIXEL_TOLERANCE
          : el.scrollLeft > offset + SUBPIXEL_TOLERANCE;
      let hasAfter =
        orientation === "vertical"
          ? el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
          : el.scrollWidth - (el.scrollLeft + el.clientWidth) > offset + SUBPIXEL_TOLERANCE;
```

With:

```typescript
      const hasBefore =
        orientation === "vertical"
          ? reversed
            ? el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
            : el.scrollTop > offset + SUBPIXEL_TOLERANCE
          : el.scrollLeft > offset + SUBPIXEL_TOLERANCE;
      let hasAfter =
        orientation === "vertical"
          ? reversed
            ? el.scrollTop > offset + SUBPIXEL_TOLERANCE
            : el.scrollHeight - (el.scrollTop + el.clientHeight) > offset + SUBPIXEL_TOLERANCE
          : el.scrollWidth - (el.scrollLeft + el.clientWidth) > offset + SUBPIXEL_TOLERANCE;
```

Also update the `checkOverflow` dependency array to include `reversed`:

```typescript
    }, [clearAttributes, hideTopShadow, hideBottomShadow, isEnabled, offset, onVisibilityChange, orientation, reversed, setAttributes]);
```

- [ ] **Step 3: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/ScrollShadow.tsx
git commit -m "feat(ui): add reversed prop to ScrollShadow for column-reverse layouts"
```

---

### Task 5: Create useSessionMountPool hook

**Files:**
- Create: `packages/ui/src/components/chat/hooks/useSessionMountPool.ts`

**Rationale:** Pure hook. Maintains LRU `Map<sessionId, SessionMountState>`. Eviction prefers non-streaming sessions.

- [ ] **Step 1: Create the hook file**

Create `packages/ui/src/components/chat/hooks/useSessionMountPool.ts`:

```typescript
import React from 'react';
import { useStreamingStore } from '@/sync/streaming';

const MAX_MOUNTED_SESSIONS = 10;

export type SessionMountState = {
  id: string;
  isActive: boolean;
};

export interface UseSessionMountPoolResult {
  mountedSessions: Map<string, SessionMountState>;
  activeSessionId: string | null;
  activateSession: (sessionId: string | null) => void;
}

function isStreaming(sessionId: string): boolean {
  return useStreamingStore.getState().streamingMessageIds.get(sessionId) != null;
}

export function useSessionMountPool(): UseSessionMountPoolResult {
  const [mountedSessions, setMountedSessions] = React.useState<Map<string, SessionMountState>>(() => new Map());
  const activeSessionIdRef = React.useRef<string | null>(null);

  const activateSession = React.useCallback((sessionId: string | null) => {
    if (!sessionId) {
      activeSessionIdRef.current = null;
      setMountedSessions((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const state of next.values()) {
          state.isActive = false;
        }
        return next;
      });
      return;
    }

    activeSessionIdRef.current = sessionId;

    setMountedSessions((prev) => {
      const existing = prev.get(sessionId);
      if (existing) {
        // Already mounted — move to end (LRU touch) and mark active
        const next = new Map(prev);
        next.delete(sessionId);
        for (const s of next.values()) {
          s.isActive = false;
        }
        next.set(sessionId, { ...existing, isActive: true });
        return next;
      }

      // Need to mount new session
      const next = new Map(prev);
      for (const s of next.values()) {
        s.isActive = false;
      }

      // Evict if at capacity
      if (next.size >= MAX_MOUNTED_SESSIONS) {
        let evicted = false;
        for (const [key, value] of next) {
          if (key === sessionId) continue;
          if (!isStreaming(key)) {
            next.delete(key);
            evicted = true;
            break;
          }
        }
        if (!evicted) {
          // All are streaming — evict oldest (first in insertion order)
          const first = next.keys().next().value;
          if (first && first !== sessionId) {
            next.delete(first);
          }
        }
      }

      next.set(sessionId, { id: sessionId, isActive: true });
      return next;
    });
  }, []);

  return {
    mountedSessions,
    activeSessionId: Array.from(mountedSessions.values()).find((s) => s.isActive)?.id ?? null,
    activateSession,
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors (hook is not imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/hooks/useSessionMountPool.ts
git commit -m "feat(chat): create useSessionMountPool hook with LRU eviction"
```

---

### Task 6: Create useUserScrollDetector hook

**Files:**
- Create: `packages/ui/src/components/chat/hooks/useUserScrollDetector.ts`

**Rationale:** Replaces the bulk of `useChatScrollManager`. Single boolean `userScrolledUp` derived from `scrollTop > 0` in column-reverse. Handles jump-to-newest and Safari keyboard re-anchor.

- [ ] **Step 1: Create the hook file**

Create `packages/ui/src/components/chat/hooks/useUserScrollDetector.ts`:

```typescript
import React from 'react';

export interface UseUserScrollDetectorResult {
  userScrolledUp: boolean;
  scrollToBottom: (options?: { behavior?: ScrollBehavior }) => void;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}

export function useUserScrollDetector(
  scrollRef: React.RefObject<HTMLDivElement | null>,
): UseUserScrollDetectorResult {
  const [userScrolledUp, setUserScrolledUp] = React.useState(false);

  const scrollToBottom = React.useCallback((options?: { behavior?: ScrollBehavior }) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: options?.behavior ?? 'smooth' });
  }, [scrollRef]);

  const onScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const scrolledUp = container.scrollTop > 0;
    setUserScrolledUp((prev) => (prev === scrolledUp ? prev : scrolledUp));
  }, []);

  // Safari/WebKit: re-anchor when keyboard opens/closes
  React.useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;

    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const container = scrollRef.current;
      if (!container) return;
      if (container.scrollTop === 0) {
        // Already at bottom — force re-anchor
        container.scrollTo({ top: 0 });
      }
    };

    vv.addEventListener('resize', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
    };
  }, [scrollRef]);

  return {
    userScrolledUp,
    scrollToBottom,
    onScroll,
  };
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/hooks/useUserScrollDetector.ts
git commit -m "feat(chat): create useUserScrollDetector hook for column-reverse scroll state"
```

---

### Task 7: Create useSSEAnchorSuppression hook

**Files:**
- Create: `packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts`

**Rationale:** In column-reverse with reversed array, new SSE messages prepend at index 0. The virtualizer adjusts scroll offset to keep the view stable. When the user is at bottom (`!userScrolledUp`), we suppress this adjustment so new content appears naturally.

- [ ] **Step 1: Create the hook file**

Create `packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts`:

```typescript
import React from 'react';

export function useSSEAnchorSuppression(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  userScrolledUp: boolean,
  messageCount: number,
): void {
  const prevCountRef = React.useRef(messageCount);

  React.useLayoutEffect(() => {
    if (userScrolledUp) {
      prevCountRef.current = messageCount;
      return;
    }
    if (messageCount <= prevCountRef.current) {
      prevCountRef.current = messageCount;
      return;
    }
    prevCountRef.current = messageCount;

    const container = scrollRef.current;
    if (!container) return;

    // Force re-anchor at bottom after virtualizer adjusts.
    // rAF ensures this runs after the virtualizer's synchronous updates.
    requestAnimationFrame(() => {
      if (container.scrollTop !== 0) {
        container.scrollTop = 0;
      }
    });
  }, [messageCount, userScrolledUp, scrollRef]);
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/hooks/useSSEAnchorSuppression.ts
git commit -m "feat(chat): create useSSEAnchorSuppression hook for virtualizer prepend compensation"
```

---

### Task 8: Create ActiveSessionContext

**Files:**
- Create: `packages/ui/src/components/chat/ActiveSessionContext.tsx`

**Rationale:** `MessageRow` `React.memo` comparator will read this to bail out when the session is not active, reducing wasted renders in hidden mounts.

- [ ] **Step 1: Create the context file**

Create `packages/ui/src/components/chat/ActiveSessionContext.tsx`:

```typescript
import React from 'react';

export type ActiveSessionContextValue = {
  isActive: boolean;
};

export const ActiveSessionContext = React.createContext<ActiveSessionContextValue>({
  isActive: true,
});

export function useIsActiveSession(): boolean {
  return React.useContext(ActiveSessionContext).isActive;
}
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/ActiveSessionContext.tsx
git commit -m "feat(chat): create ActiveSessionContext for mount pool visibility"
```

---

### Task 9: Create SessionMount component (self-contained per-session mount)

**Files:**
- Create: `packages/ui/src/components/chat/SessionMount.tsx`
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx` (remove inline ChatViewport)

**Rationale:** `SessionMount` encapsulates all per-session logic: sync store reads, timeline controller, old scroll manager (temporarily), and `ChatViewport` rendering. This allows `ChatContainer` to render N mounts independently.

- [ ] **Step 1: Extract ChatViewport to its own file**

Create `packages/ui/src/components/chat/ChatViewport.tsx` by extracting the inline `ChatViewport` component from `ChatContainer.tsx` lines 59–195. Include all its imports and the `SessionMessageRecord` type.

Key imports for `ChatViewport.tsx`:
```typescript
import React from 'react';
import type { Part, Message } from '@/lib/opencode/client';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';
import MessageList, { type MessageListHandle } from './MessageList';
import { PermissionCard } from './permissions/PermissionCard';
import { QuestionCard } from './permissions/QuestionCard';
import { StatusRowContainer } from './status/StatusRowContainer';
import type { AnimationHandlers, ContentChangeReason } from '@/components/chat/timeline/types';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { StreamPhase } from './message/types';
```

Export `ChatViewportProps` and `ChatViewport` from this file. Keep the same `React.memo` comparator.

- [ ] **Step 2: Remove inline ChatViewport from ChatContainer.tsx**

In `ChatContainer.tsx`:
1. Remove lines 59–195 (the entire inline `ChatViewport` component and its props type).
2. Remove `CHAT_SCROLL_STYLE` constant at line 50.
3. Add import: `import { ChatViewport } from './ChatViewport';`
4. Remove now-unused imports that were only for the inline ChatViewport: `ScrollShadow`, `OverlayScrollbar`, `PermissionCard`, `QuestionCard`, `StatusRowContainer` (but keep `ScrollToBottomButton` since it's used later).

Actually, verify which imports ChatContainer still needs. It uses: `ScrollToBottomButton` at line 802, and may still need `MessageList` type for `MessageListHandle`. Check if `MessageListHandle` is used in ChatContainer... yes, at line 408: `const messageListRef = React.useRef<MessageListHandle | null>(null);`. So keep `MessageListHandle` import.

- [ ] **Step 3: Create SessionMount.tsx**

Create `packages/ui/src/components/chat/SessionMount.tsx`:

```typescript
import React from 'react';
import type { Message, Part } from '@/lib/opencode/client';
import { ChatViewport } from './ChatViewport';
import { useChatScrollManager } from '@/hooks/useChatScrollManager';
import { useChatTimelineController } from './hooks/useChatTimelineController';
import { ActiveSessionContext } from './ActiveSessionContext';
import { useSync } from '@/sync/use-sync';
import { useStreamingStore } from '@/sync/streaming';
import { useViewportStore } from '@/sync/viewport-store';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import {
  useSessionMessageCount,
  useSessionMessageRecords,
  useSessionStatus,
  useDirectorySync,
} from '@/sync/sync-context';
import {
  collectVisibleSessionIdsForBlockingRequests,
  flattenBlockingRequests,
} from './lib/blockingRequests';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';

const EMPTY_MESSAGES: Array<{ info: Message; parts: Part[] }> = [];
const EMPTY_PERMISSIONS: PermissionRequest[] = [];
const EMPTY_QUESTIONS: QuestionRequest[] = [];
const IDLE_SESSION_STATUS = { type: 'idle' as const };
const DEFAULT_RETRY_MESSAGE = 'Quota limit reached. Retrying automatically.';

type SessionMountProps = {
  sessionId: string;
  isActive: boolean;
  onScrollStateChange?: (state: { userScrolledUp: boolean; scrollToBottom: () => void }) => void;
};

export const SessionMount = React.memo(({ sessionId, isActive, onScrollStateChange }: SessionMountProps) => {
  const sync = useSync();
  const { isMobile } = useDeviceInfo();
  const isExpandedInput = useUIStore((state) => state.isExpandedInput);
  const stickyUserHeader = useUIStore((state) => state.stickyUserHeader);
  const chatRenderMode = useUIStore((state) => state.chatRenderMode);
  const isDesktopExpandedInput = isExpandedInput && !isMobile;

  const sessionMemoryStateMap = useViewportStore((s) => s.sessionMemoryState);
  const isSyncing = useViewportStore((s) => s.isSyncing);
  const updateViewportAnchor = useViewportStore((s) => s.updateViewportAnchor);

  const streamingMessageId = useStreamingStore(
    React.useCallback(
      (s) => s.streamingMessageIds.get(sessionId) ?? null,
      [sessionId],
    ),
  );
  const activeStreamingPhase = useStreamingStore(
    React.useCallback(
      (s) => {
        if (!streamingMessageId) return null;
        return s.messageStreamStates.get(streamingMessageId)?.phase ?? null;
      },
      [streamingMessageId],
    ),
  );

  const sessionMessageCount = useSessionMessageCount(sessionId);
  const sessionMessageRecords = useSessionMessageRecords(sessionId);
  const sessionMessages = sessionMessageRecords;

  const sessionStatus = useSessionStatus(sessionId) ?? IDLE_SESSION_STATUS;

  const allPermissions = useDirectorySync(
    React.useCallback((s) => s.permission ?? {}, []),
  );
  const allQuestions = useDirectorySync(
    React.useCallback((s) => s.question ?? {}, []),
  );

  const sessionPermissions = React.useMemo(() => {
    const scoped = collectVisibleSessionIdsForBlockingRequests(
      [], // sessions not needed for single-session scope
      sessionId,
    );
    if (scoped.length === 0) return EMPTY_PERMISSIONS;
    const map = new Map(Object.entries(allPermissions));
    return flattenBlockingRequests(map, scoped);
  }, [allPermissions, sessionId]);

  const sessionQuestions = React.useMemo(() => {
    const scoped = collectVisibleSessionIdsForBlockingRequests(
      [],
      sessionId,
    );
    if (scoped.length === 0) return EMPTY_QUESTIONS;
    const map = new Map(Object.entries(allQuestions));
    return flattenBlockingRequests(map, scoped);
  }, [allQuestions, sessionId]);

  const sessionIsWorking = React.useMemo(() => {
    if (sessionPermissions.length > 0 || sessionQuestions.length > 0) return false;
    if (streamingMessageId || activeStreamingPhase) return true;
    const statusType = sessionStatus.type ?? 'idle';
    if (statusType === 'busy' || statusType === 'retry') return true;
    const lastMessage = sessionMessages[sessionMessages.length - 1]?.info as Message | undefined;
    return Boolean(
      lastMessage
      && lastMessage.role === 'assistant'
      && typeof (lastMessage as { time?: { completed?: number } }).time?.completed !== 'number',
    );
  }, [activeStreamingPhase, sessionMessages, sessionPermissions.length, sessionQuestions.length, sessionStatus.type, streamingMessageId]);

  const activeRetryStatus = React.useMemo(() => {
    if (sessionStatus.type !== 'retry') return null;
    const rawMessage = typeof (sessionStatus as { message?: string }).message === 'string'
      ? (((sessionStatus as { message?: string }).message) ?? '').trim()
      : '';
    return {
      sessionId,
      message: rawMessage || DEFAULT_RETRY_MESSAGE,
      confirmedAt: (sessionStatus as { confirmedAt?: number }).confirmedAt,
    };
  }, [sessionId, sessionStatus]);

  const [retryFallbackTimestamp, setRetryFallbackTimestamp] = React.useState(0);
  const retryFallbackSessionRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!activeRetryStatus || typeof activeRetryStatus.confirmedAt === 'number') {
      retryFallbackSessionRef.current = null;
      setRetryFallbackTimestamp(0);
      return;
    }
    if (retryFallbackSessionRef.current !== activeRetryStatus.sessionId) {
      retryFallbackSessionRef.current = activeRetryStatus.sessionId;
      setRetryFallbackTimestamp(Date.now());
    }
  }, [activeRetryStatus]);

  const retryOverlay = React.useMemo(() => {
    if (!activeRetryStatus) return null;
    return { ...activeRetryStatus, fallbackTimestamp: retryFallbackTimestamp };
  }, [activeRetryStatus, retryFallbackTimestamp]);

  const historyMeta = React.useMemo(() => {
    return {
      limit: sessionMessages.length,
      complete: !sync.hasMore(sessionId),
      loading: sync.isLoading(sessionId),
    };
  }, [sessionId, sessionMessages.length, sync]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const messageListRef = React.useRef<import('./MessageList').MessageListHandle | null>(null);

  const activeTurnChangeRef = React.useRef<(turnId: string | null) => void>(() => {});
  const handleActiveTurnChange = React.useCallback((turnId: string | null) => {
    activeTurnChangeRef.current(turnId);
  }, []);

  const scrollManager = useChatScrollManager({
    currentSessionId: isActive ? sessionId : null,
    sessionMessageCount,
    sessionIsWorking,
    sessionMemoryState: sessionMemoryStateMap,
    updateViewportAnchor,
    isSyncing,
    isMobile,
    chatRenderMode,
    sessionPermissions: [...sessionPermissions, ...sessionQuestions],
    onActiveTurnChange: handleActiveTurnChange,
  });

  const timelineController = useChatTimelineController({
    sessionId: isActive ? sessionId : null,
    messages: sessionMessages,
    historyMeta,
    scrollRef,
    messageListRef,
    loadMoreMessages: (sid: string, _dir: 'up' | 'down') => sync.loadMore(sid),
    prepareForBottomResume: scrollManager.prepareForBottomResume,
    scrollToBottom: scrollManager.scrollToBottom,
    isPinned: scrollManager.isPinned,
    isOverflowing: scrollManager.isOverflowing,
  });

  React.useEffect(() => {
    activeTurnChangeRef.current = timelineController.handleActiveTurnChange;
  }, [timelineController.handleActiveTurnChange]);

  const handleLoadOlder = React.useCallback(() => {
    void timelineController.loadEarlier();
  }, [timelineController.loadEarlier]);

  const handleMessageContentChange = React.useCallback((reason?: import('@/components/chat/timeline/types').ContentChangeReason) => {
    scrollManager.handleMessageContentChange(reason);
  }, [scrollManager.handleMessageContentChange]);

  React.useEffect(() => {
    if (sessionPermissions.length === 0 && sessionQuestions.length === 0) return;
    scrollManager.handleMessageContentChange('permission');
  }, [scrollManager.handleMessageContentChange, sessionPermissions, sessionQuestions]);

  return (
    <ActiveSessionContext.Provider value={{ isActive }}>
      <ChatViewport
        currentSessionId={sessionId}
        isDesktopExpandedInput={isDesktopExpandedInput}
        stickyUserHeader={stickyUserHeader}
        scrollRef={scrollRef}
        messageListRef={messageListRef}
        turnStart={timelineController.turnStart}
        pendingRevealWork={timelineController.pendingRevealWork}
        renderedMessages={timelineController.renderedMessages}
        hasMoreAboveTurns={timelineController.historySignals.hasMoreAboveTurns}
        isLoadingOlder={timelineController.isLoadingOlder}
        sessionIsWorking={sessionIsWorking}
        streamingMessageId={streamingMessageId}
        activeStreamingPhase={activeStreamingPhase}
        retryOverlay={retryOverlay}
        handleMessageContentChange={handleMessageContentChange}
        getAnimationHandlers={scrollManager.getAnimationHandlers}
        handleLoadOlder={handleLoadOlder}
        scrollToBottom={scrollManager.scrollToBottom}
        sessionQuestions={sessionQuestions}
        sessionPermissions={sessionPermissions}
        isProgrammaticFollowActive={scrollManager.isProgrammaticFollowActive}
      />
    </ActiveSessionContext.Provider>
  );
});

SessionMount.displayName = 'SessionMount';
```

**Note:** This is intentionally a large file move. It copies per-session logic from `ChatContainer` into a self-contained component. The old scroll manager and timeline controller are still used here — they will be replaced in Task 14.

- [ ] **Step 4: Verify type-check**

Run: `bun run type-check`
Expected: No errors. `SessionMount` is not imported yet, so any issues are self-contained.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/chat/ChatViewport.tsx packages/ui/src/components/chat/SessionMount.tsx packages/ui/src/components/chat/ChatContainer.tsx
git commit -m "feat(chat): create SessionMount component and extract ChatViewport"
```

---

### Task 10: Integrate mount pool into ChatContainer

**Files:**
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx`

**Rationale:** Replace the single `ChatViewport` render with a loop over `mountedSessions` from `useSessionMountPool`. Each session gets a `SessionMount`. The active session is visible; others are `opacity: 0`.

- [ ] **Step 1: Add mount pool imports and remove old per-session logic**

Add imports at the top of `ChatContainer.tsx`:

```typescript
import { useSessionMountPool } from './hooks/useSessionMountPool';
import { SessionMount } from './SessionMount';
import { MessageFreshnessDetector } from '@/lib/messages/messageFreshness';
```

Remove the following from `ChatContainer` (they move into `SessionMount`):
- `useSync()` call and `sync` variable
- `loadMessages` callback
- `loadMoreMessages` callback
- `sessionMessageCount` selector
- `hasLoadedSessionMessages` selector
- `sessionMessageRecords` selector and `sessionMessages` variable
- `sessionStatusForCurrent` selector
- `allPermissions` / `allQuestions` selectors
- `permissionsMap` / `questionsMap` / `scopedSessionIds` / `sessionPermissions` / `sessionQuestions` computations
- `sessionIsWorking` computation
- `activeRetryStatus` / `retryFallbackTimestamp` / `retryFallbackSessionRef` / `retryOverlay` computations
- `historyMeta` computation
- `messageListRef`
- `useChatScrollManager` call and `scrollManager` destructuring
- `useChatTimelineController` call and `timelineController` destructuring
- `handleLoadOlder` callback
- `handleMessageContentChange` effect for permissions
- `navigation` from `useChatTurnNavigation`
- `useChatTurnNavigation` import
- `handleActiveTurnChange` / `activeTurnChangeRef`
- `resumeToLatestInstant` / `runLatestInstantResume` callbacks
- The `useEffect` that listens for `SESSION_RESELECTED_EVENT`
- The `useLayoutEffect` for `--chat-scroll-height` (this moves into `SessionMount` or is removed since column-reverse handles it)
- `lastScrolledSessionRef` and the two session-switch effects at lines 588–639
- The `isSessionHydrating` logic and early returns for hydrating / empty states (these move into `SessionMount`)

`ChatContainer` should be reduced to roughly:
1. Read `currentSessionId` from `sessionUIStore`
2. Call `useSessionMountPool()`
3. Track active scroll ref
4. Use `useUserScrollDetector` (in Task 14)
5. Render `SessionMount` instances
6. Render `ChatInput` and `ScrollToBottomButton`

- [ ] **Step 2: Add session-switch effect with MessageFreshnessDetector and hash detection**

In `ChatContainer`, add the session-switch effect. Preserve the existing hash-based scroll target detection from `ChatContainer.tsx:597-600`:

```typescript
const lastScrolledSessionRef = React.useRef<string | null>(null);

React.useEffect(() => {
  if (!currentSessionId) return;
  activateSession(currentSessionId);
  MessageFreshnessDetector.getInstance().recordSessionStart(currentSessionId);
  
  // Hash-based scroll target: skip auto-scroll-to-bottom when URL has a hash.
  // The actual scroll-to-target is handled by SessionMount's timeline controller.
  if (typeof window !== 'undefined' && window.location.hash.length > 0) {
    lastScrolledSessionRef.current = currentSessionId;
    return;
  }
  lastScrolledSessionRef.current = currentSessionId;
}, [currentSessionId, activateSession]);
```

The `SessionMount` component will receive a `skipInitialScroll` prop derived from `lastScrolledSessionRef` in a future task, but for now just track the hash state.

- [ ] **Step 3: Update ChatContainer render to use mount pool**

Replace the render block with mount pool. **Preserve the no-session early returns** — `ChatContainer.tsx:641-668` has `ChatEmptyState` and draft-composer branches for when `!currentSessionId`:

```tsx
// No session selected — show empty state or draft composer
if (!currentSessionId && !draftOpen) {
  return (
    <div className="relative flex flex-col h-full bg-background">
      {returnToParentButton}
      <ChatEmptyState />
    </div>
  );
}

if (!currentSessionId && draftOpen) {
  return (
    <div className="relative flex flex-col h-full bg-background">
      {returnToParentButton}
      <div className="flex-1" />
      <div className="relative z-10 bg-background">
        <ChatInput scrollToBottom={() => {}} />
      </div>
    </div>
  );
}

// Active session — render mount pool
return (
  <div className="relative flex flex-col h-full bg-background">
    {returnToParentButton}
    <div className="relative flex-1 min-h-0">
      {Array.from(mountedSessions.values()).map((mountState) => (
        <div
          key={mountState.id}
          className={cn(
            'absolute inset-0 transition-opacity duration-150',
            mountState.isActive ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
          )}
          aria-hidden={!mountState.isActive}
        >
          <SessionMount sessionId={mountState.id} isActive={mountState.isActive} />
        </div>
      ))}
    </div>
    <div className="relative z-10 bg-background">
       <ScrollToBottomButton
        visible={false}
        onClick={() => {}}
      />
      <ChatInput scrollToBottom={() => {}} />
    </div>
  </div>
);
```

The `ScrollToBottomButton` and `ChatInput` will be properly wired in Task 14 when `useUserScrollDetector` is connected.

- [ ] **Step 4: Verify type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: No errors. `ChatContainer` is now simplified. Some props to `ScrollToBottomButton` and `ChatInput` are temporarily no-ops.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/chat/ChatContainer.tsx
git commit -m "feat(chat): integrate mount pool into ChatContainer with SessionMount"
```

---

### Task 11: Convert ChatViewport to column-reverse

**Files:**
- Modify: `packages/ui/src/components/chat/ChatViewport.tsx`
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx` (mount wrapper)

**Rationale:** CSS `flex-direction: column-reverse` anchors content at the bottom naturally. `scrollTop = 0` is the bottom. Remove `overflow-anchor: none` so the browser handles pinning.

- [ ] **Step 1: Update ChatViewport CSS for column-reverse**

In `ChatViewport.tsx`:
1. Remove `CHAT_SCROLL_STYLE` constant (`overflowAnchor: 'none'`).
2. Change the `ScrollShadow` style prop from `style={CHAT_SCROLL_STYLE}` to no inline style (or `style={{}}`).
3. Add `reversed` prop to `ScrollShadow` usage:
   ```tsx
   <ScrollShadow
     reversed
     className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
     ref={scrollRef}
     observeMutations={false}
     hideTopShadow={isMobile && stickyUserHeader}
     data-scroll-shadow="true"
     data-scrollbar="chat"
   >
   ```
4. Add `justify-content: flex-end` to the inner content div for empty sessions:
   ```tsx
   <div className="relative z-0 min-h-full flex flex-col justify-end">
   ```

- [ ] **Step 2: Remove bottom spacer if present**

In `ChatViewport.tsx`, the bottom spacer div at the end of the scroll content (`<div className="flex-shrink-0" style={{ height: isMobile ? '40px' : '10vh' }} />`) may not be needed with column-reverse since content naturally anchors at the bottom. Comment it out for now — remove entirely if testing confirms it's unnecessary.

- [ ] **Step 3: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/chat/ChatViewport.tsx
git commit -m "feat(chat): convert ChatViewport to column-reverse layout"
```

---

### Task 12: Adapt MessageList for reversed (newest-first) data

**Files:**
- Modify: `packages/ui/src/components/chat/MessageList.tsx`

**Rationale:** The sync store stores messages chronologically (oldest first). For `column-reverse`, the virtualizer receives a newest-first array. Index 0 = newest message.

- [ ] **Step 1: Reverse messages before passing to turn logic**

In `MessageList.tsx`, after `baseDisplayMessages` is computed (line 1126–1158), add a `reversedDisplayMessages` memo:

```typescript
  const reversedDisplayMessages = React.useMemo(() => {
    return [...displayMessages].reverse();
  }, [displayMessages]);
```

Then pass `reversedDisplayMessages` to `useTurnRecords` and `staticRenderEntries` instead of `displayMessages`:

```typescript
  const { projection, staticTurns, streamingTurn } = useTurnRecords(reversedDisplayMessages, {
    sessionKey,
    showTextJustificationActivity: chatRenderMode === 'sorted',
  });
```

And update `staticRenderEntries` and `trailingStreamingEntry` to use `reversedDisplayMessages` instead of `displayMessages`.

- [ ] **Step 2: Adapt virtualizer config**

In `MessageList.tsx`, update the `useVirtualizer` call (lines 1294–1303):

```typescript
  const historyVirtualizer = useVirtualizer({
    count: historyEntries.length,
    getScrollElement: resolveScrollContainer,
    estimateSize: (index) => estimateHistoryEntryHeight(historyEntries[index]),
    getItemKey: (index) => `${historyMeasurementScopeKey}:${historyEntries[index]?.key ?? index}`,
    measureElement: measureVirtualElement,
    useAnimationFrameWithResizeObserver: true,
    overscan: MESSAGE_LIST_OVERSCAN,
    enabled: shouldVirtualizeHistory,
    initialOffset: 0, // Start at bottom (newest)
  });
```

Add `initialOffset: 0` so the virtualizer starts at the bottom.

- [ ] **Step 3: Adapt scrollToIndex alignment**

In `MessageList.tsx`, update `scrollHistoryIndexIntoView` (line 1437–1445):

```typescript
  const scrollHistoryIndexIntoView = React.useCallback((index: number, behavior: ScrollBehavior = 'auto') => {
    if (!shouldVirtualizeHistory || index < 0 || index >= historyEntries.length) {
      return false;
    }

    const virtualizerBehavior = behavior === 'smooth' ? 'smooth' : 'auto';
    historyVirtualizer.scrollToIndex(index, { align: 'center', behavior: virtualizerBehavior });
    return true;
  }, [historyEntries.length, historyVirtualizer, shouldVirtualizeHistory]);
```

Change `align: 'start'` to `align: 'center'`.

- [ ] **Step 3.5: Add reversed-index mapping for scrollToTurnId/scrollToMessageId**

The virtualizer uses the reversed (newest-first) array, but `useChatTimelineController` computes indices in chronological order. In `MessageList.tsx`, update `scrollToTurnId` and `scrollToMessageId` inside the `MessageListHandle` to map the target turn/message to its position in the reversed array:

```typescript
scrollToTurnId: React.useCallback((turnId: string, behavior: ScrollBehavior = 'auto') => {
  const turnElement = contentRef.current?.querySelector(`[data-turn-id="${turnId}"]`);
  if (turnElement) {
    turnElement.scrollIntoView({ behavior, block: 'nearest' });
    return true;
  }
  // Fallback: find the entry in the reversed array
  const reversedIndex = historyEntries.findIndex(
    (e) => e.kind === 'turn' && e.turn.turnId === turnId,
  );
  if (reversedIndex !== -1) {
    return scrollHistoryIndexIntoView(reversedIndex, behavior);
  }
  return false;
}, [historyEntries, scrollHistoryIndexIntoView, contentRef]),

scrollToMessageId: React.useCallback((messageId: string, behavior: ScrollBehavior = 'auto') => {
  const messageElement = contentRef.current?.querySelector(`[data-message-id="${messageId}"]`);
  if (messageElement) {
    messageElement.scrollIntoView({ behavior, block: 'nearest' });
    return true;
  }
  return false;
}, [contentRef]),
```

This uses DOM queries first (which work regardless of array order) and falls back to virtualizer index lookup in the reversed array.

- [ ] **Step 4: Adapt scrollIntoView for column-reverse**

In `MessageList.tsx`, update `scrollToTurnId` inside the `MessageListHandle` (line 1471–1493):

Change:
```typescript
turnElement.scrollIntoView({ behavior, block: 'start' });
```

To:
```typescript
turnElement.scrollIntoView({ behavior, block: 'nearest' });
```

- [ ] **Step 5: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/chat/MessageList.tsx
git commit -m "feat(chat): reverse message array for column-reverse virtualizer"
```

---

### Task 13: Remove load-more scroll compensation from timeline controller

**Files:**
- Modify: `packages/ui/src/components/chat/hooks/useChatTimelineController.ts`

**Rationale:** With `column-reverse` + reversed array, older messages append at the end of the virtualizer array. No index shift occurs for existing items. The `useLayoutEffect` snapshot/restore is unnecessary.

- [ ] **Step 1: Delete prePrependScrollRef and useLayoutEffect**

In `useChatTimelineController.ts`:
1. Remove `prePrependScrollRef` declaration (lines 270–274).
2. Remove the `useLayoutEffect` that restores scroll position (lines 276–300).
3. In `revealBufferedTurns` (lines 310–333), remove the `prePrependScrollRef.current = { ... }` block (lines 317–321).
4. In `fetchOlderHistory` (lines 335–385), remove the `prePrependScrollRef.current = { ... }` block (lines 354–358).

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/hooks/useChatTimelineController.ts
git commit -m "refactor(chat): remove load-more scroll compensation (column-reverse makes it unnecessary)"
```

---

### Task 14: Delete old scroll manager and wire new scroll system

**Files:**
- Delete: `packages/ui/src/hooks/useChatScrollManager.ts`
- Modify: `packages/ui/src/components/chat/SessionMount.tsx`
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx`
- Modify: `packages/ui/src/components/chat/hooks/useChatTimelineController.ts`

**Rationale:** Replace `useChatScrollManager` (~400 lines) with `useUserScrollDetector` + `useSSEAnchorSuppression` (~60 lines total). Simplify `useChatTimelineController` by removing `prepareForBottomResume`, `scrollToBottom`, `isPinned`, `isOverflowing` dependencies.

- [ ] **Step 1: Simplify useChatTimelineController**

In `useChatTimelineController.ts`:
1. Remove `prepareForBottomResume`, `scrollToBottom`, `isPinned`, `isOverflowing` from `UseChatTimelineControllerOptions` interface.
2. Remove `isPinnedRef` and its effect (lines 132–133).
3. Update `showScrollToBottom` to always return `false` (ChatContainer computes this from `useUserScrollDetector`):
   ```typescript
   showScrollToBottom: false,
   ```
4. Update `resumeToBottom` and `resumeToBottomInstant` to use `scrollRef` directly instead of `scrollToBottom`:
   ```typescript
   const resumeToBottom = React.useCallback(async () => {
     const nextStart = getInitialTurnStart(turnModelRef.current.turnCount);
     setPendingRevealWork(false);
     setIsLoadingOlder(false);

     const shouldWaitForRender = nextStart !== turnStartRef.current;
     if (shouldWaitForRender) {
       setTurnStart(nextStart);
       await waitForNextRenderCommit();
     }

     const container = scrollRef.current;
     if (container) {
       container.scrollTo({ top: 0, behavior: 'smooth' });
     }
   }, [scrollRef, waitForNextRenderCommit]);

   const resumeToBottomInstant = React.useCallback(async () => {
     const nextStart = getInitialTurnStart(turnModelRef.current.turnCount);
     setPendingRevealWork(false);
     setIsLoadingOlder(false);

     const shouldWaitForRender = nextStart !== turnStartRef.current;
     if (shouldWaitForRender) {
       setTurnStart(nextStart);
       await waitForNextRenderCommit();
     }

     const container = scrollRef.current;
     if (container) {
       container.scrollTo({ top: 0 });
     }
   }, [scrollRef, waitForNextRenderCommit]);
   ```
5. Remove `handleActiveTurnChange` from the return object if it's no longer needed by ChatContainer (it was used via `activeTurnChangeRef`). Actually, keep it — `SessionMount` still uses it.

- [ ] **Step 2: Update SessionMount to use new scroll hooks**

In `SessionMount.tsx`:
1. Remove the `useChatScrollManager` import and call.
2. Add imports:
   ```typescript
   import { useUserScrollDetector } from './hooks/useUserScrollDetector';
   import { useSSEAnchorSuppression } from './hooks/useSSEAnchorSuppression';
   ```
3. Replace the scroll manager usage with:
   ```typescript
   const { userScrolledUp, scrollToBottom, onScroll } = useUserScrollDetector(scrollRef);
   useSSEAnchorSuppression(scrollRef, userScrolledUp, sessionMessages.length);
   ```
4. Update `ChatViewport` props:
   - Remove `handleMessageContentChange`, `getAnimationHandlers`, `scrollToBottom`, `isProgrammaticFollowActive`
   - Add `onScroll` prop to `ChatViewport` (we need to add this to ChatViewportProps)
   - For `scrollToBottom` prop passed to `ChatViewport` and `MessageList`, use the one from `useUserScrollDetector`
   - For animation handlers, pass a simple no-op factory since the old scroll manager's animation compensation is no longer needed:
     ```typescript
     const getAnimationHandlers = React.useCallback(() => ({
       onChunk: () => {},
       onComplete: () => {},
       onStreamingCandidate: () => {},
       onAnimationStart: () => {},
       onReservationCancelled: () => {},
       onReasoningBlock: () => {},
       onAnimatedHeightChange: () => {},
     }), []);
     ```
5. Update the `useChatTimelineController` call to remove `prepareForBottomResume`, `scrollToBottom`, `isPinned`, `isOverflowing`:
   ```typescript
   const timelineController = useChatTimelineController({
     sessionId: isActive ? sessionId : null,
     messages: sessionMessages,
     historyMeta,
     scrollRef,
     messageListRef,
     loadMoreMessages: (sid: string, _dir: 'up' | 'down') => sync.loadMore(sid),
   });
   ```

- [ ] **Step 3: Update ChatViewport to accept onScroll**

In `ChatViewport.tsx`:
1. Add `onScroll?: (event: React.UIEvent<HTMLDivElement>) => void` to `ChatViewportProps`.
2. Add `onScroll` to the destructured props.
3. Pass `onScroll` to the `ScrollShadow` (which renders a div):
   ```tsx
   <ScrollShadow
     reversed
     className="absolute inset-0 overflow-y-auto overflow-x-hidden z-0 chat-scroll overlay-scrollbar-target"
     ref={scrollRef}
     onScroll={onScroll}
     observeMutations={false}
     hideTopShadow={isMobile && stickyUserHeader}
     data-scroll-shadow="true"
     data-scrollbar="chat"
   >
   ```

- [ ] **Step 4: Update ChatContainer to wire jump-to-bottom and ChatInput**

In `ChatContainer.tsx`:
1. Import `useUserScrollDetector`:
   ```typescript
   import { useUserScrollDetector } from './hooks/useUserScrollDetector';
   ```
2. The active mount manages its own scroll state via `useUserScrollDetector`. `ChatContainer` receives scroll state through the `onScrollStateChange` callback on `SessionMount`. No `activeScrollRef` needed — `SessionMount` calls `onScrollStateChange` with `{ userScrolledUp, scrollToBottom }` whenever its scroll state changes.

3. Update `ChatContainer` render:
   ```tsx
   return (
     <div className="relative flex flex-col h-full bg-background">
       {returnToParentButton}
       <div className="relative flex-1 min-h-0">
         {Array.from(mountedSessions.values()).map((mountState) => (
           <div
             key={mountState.id}
             className={cn(
               'absolute inset-0 transition-opacity duration-150',
               mountState.isActive ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'
             )}
             aria-hidden={!mountState.isActive}
           >
             <SessionMount
               sessionId={mountState.id}
               isActive={mountState.isActive}
               onScrollStateChange={mountState.isActive ? setActiveScrollState : undefined}
             />
           </div>
         ))}
       </div>
       <div className="relative z-10 bg-background">
         <ScrollToBottomButton
           visible={activeScrollState.userScrolledUp}
           onClick={() => activeScrollState.scrollToBottom()}
         />
         <ChatInput scrollToBottom={() => activeScrollState.scrollToBottom()} />
       </div>
     </div>
   );
   ```

- [ ] **Step 5: Delete useChatScrollManager.ts**

```bash
rm packages/ui/src/hooks/useChatScrollManager.ts
```

- [ ] **Step 6: Verify type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(chat): delete useChatScrollManager, wire useUserScrollDetector + useSSEAnchorSuppression"
```

---

### Task 15: Tighten load-more threshold

**Files:**
- Modify: `packages/ui/src/components/chat/SessionMount.tsx`

**Rationale:** With 25 messages per page, load-more should trigger more aggressively — within 5 estimated entry heights of the top edge. In column-reverse, "near the visual top" (where oldest messages are) means `scrollTop` is close to `scrollHeight - clientHeight`.

- [ ] **Step 1: Add scroll-driven automatic load-more effect to SessionMount**

```typescript
React.useEffect(() => {
  if (!isActive) return;
  const container = scrollRef.current;
  if (!container) return;

  const handleScroll = () => {
    const distanceFromTop = container.scrollHeight - container.scrollTop - container.clientHeight;
    const threshold = 5 * 160; // 5 estimated entry heights (160px default)
    if (distanceFromTop < threshold && timelineController.historySignals.canLoadEarlier && !timelineController.isLoadingOlder) {
      void timelineController.loadEarlier();
    }
  };

  container.addEventListener('scroll', handleScroll, { passive: true });
  return () => container.removeEventListener('scroll', handleScroll);
}, [isActive, scrollRef, timelineController.historySignals.canLoadEarlier, timelineController.isLoadingOlder, timelineController.loadEarlier]);
```

- [ ] **Step 2: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(chat): tighten automatic load-more threshold to 5 estimated heights"
```

---

### Task 16: Polish — MessageRow memo, empty state, mobile keyboard

**Files:**
- Modify: `packages/ui/src/components/chat/MessageList.tsx`
- Modify: `packages/ui/src/components/chat/ChatViewport.tsx`
- Modify: `packages/ui/src/components/chat/SessionMount.tsx`

**Rationale:** Extend `MessageRow` `React.memo` comparator to bail out when `!isActive`. Handle empty sessions with `justify-content: flex-end`. Ensure mobile keyboard works.

- [ ] **Step 1: Optimize MessageRow for inactive sessions**

In `MessageList.tsx`, import `useIsActiveSession`:
```typescript
import { useIsActiveSession } from './ActiveSessionContext';
```

In the `MessageRow` component (line 436–488), add `isActive` check to the memo comparator. First, add `isActive` to `MessageRowProps`:

```typescript
interface MessageRowProps {
  message: ChatMessageEntry;
  previousMessage?: ChatMessageEntry;
  nextMessage?: ChatMessageEntry;
  turnGroupingContext?: TurnGroupingContext;
  assistantHeaderMessageId?: string;
  isInActiveTurn?: boolean;
  activeStreamingPhase?: StreamPhase | null;
  animateUserOnMount?: boolean;
  onUserAnimationConsumed?: (messageId: string) => void;
  onContentChange: (reason?: ContentChangeReason) => void;
  animationHandlers: AnimationHandlers;
  scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
  isActive?: boolean;
}
```

And update the comparator to include:
```typescript
  && prev.isActive === next.isActive
```

In `MessageRow`'s body, read `isActive` from context or props. Since `MessageRow` is rendered deep inside `SessionMount`, the easiest is to read from `ActiveSessionContext`:

```typescript
const MessageRow = React.memo<MessageRowProps>(({ 
  message, previousMessage, nextMessage, turnGroupingContext,
  assistantHeaderMessageId, isInActiveTurn, activeStreamingPhase,
  animateUserOnMount, onUserAnimationConsumed, onContentChange,
  animationHandlers, scrollToBottom,
}) => {
  const isActive = useIsActiveSession();
  // ... rest of body
}, (prev, next) => {
  const prevTurn = prev.turnGroupingContext;
  const nextTurn = next.turnGroupingContext;

  return areRenderRelevantMessagesEqual(prev.message, next.message)
    && areOptionalRenderRelevantMessagesEqual(prev.previousMessage, next.previousMessage)
    && areOptionalRenderRelevantMessagesEqual(prev.nextMessage, next.nextMessage)
    && prev.animateUserOnMount === next.animateUserOnMount
    && prev.onUserAnimationConsumed === next.onUserAnimationConsumed
    && prev.onContentChange === next.onContentChange
    && prev.scrollToBottom === next.scrollToBottom
    && areRelevantTurnGroupingContextsEqual(prevTurn, nextTurn, prev.message.info.id, resolveMessageRole(prev.message) === 'user')
    && prev.assistantHeaderMessageId === next.assistantHeaderMessageId
    && prev.isInActiveTurn === next.isInActiveTurn
    && prev.activeStreamingPhase === next.activeStreamingPhase
    && prev.animationHandlers?.onChunk === next.animationHandlers?.onChunk
    && prev.animationHandlers?.onComplete === next.animationHandlers?.onComplete
    && prev.animationHandlers?.onStreamingCandidate === next.animationHandlers?.onStreamingCandidate
    && prev.animationHandlers?.onAnimationStart === next.animationHandlers?.onAnimationStart
    && prev.animationHandlers?.onReservationCancelled === next.animationHandlers?.onReservationCancelled
    && prev.animationHandlers?.onReasoningBlock === next.animationHandlers?.onReasoningBlock
    && prev.animationHandlers?.onAnimatedHeightChange === next.animationHandlers?.onAnimatedHeightChange
    && prev.isActive === next.isActive;
});
```

Wait, since `MessageRow` reads `isActive` from context at render time, the prop `isActive` isn't needed. The memo comparator should just always include a check that reads from context... but context can't be read in the comparator function. The comparator only has access to props.

Alternative: pass `isActive` as a prop from the parent. In `renderMessage` inside `TurnBlock`, read `useIsActiveSession()` and pass it to `MessageRow`:

```typescript
const isActive = useIsActiveSession();
// ... in renderMessage:
<MessageRow
  message={message}
  previousMessage={previousMessage}
  nextMessage={nextMessage}
  turnGroupingContext={turnGroupingContext}
  assistantHeaderMessageId={assistantHeaderMessageId}
  isInActiveTurn={isInActiveTurn}
  activeStreamingPhase={activeStreamingPhase}
  animateUserOnMount={shouldAnimateUserMessage(message)}
  onUserAnimationConsumed={onUserAnimationConsumed}
  onContentChange={onMessageContentChange}
  animationHandlers={getAnimationHandlers(message.info.id)}
  scrollToBottom={scrollToBottom}
  isActive={isActive}
/>
```

And in `UngroupedMessageRow`, do the same.

Then the comparator checks `prev.isActive === next.isActive`.

- [ ] **Step 2: Handle empty session layout**

In `ChatViewport.tsx`, the inner content div already has `justify-content: flex-end` from Task 11. For empty sessions (no messages), this keeps the input area at the bottom. Verify the CSS works:

```tsx
<div className="relative z-0 min-h-full flex flex-col justify-end">
```

If the empty state causes the `MessageList` to collapse incorrectly, add `flex-1` or ensure `MessageList` wrapper takes available space.

- [ ] **Step 3: Mobile keyboard re-anchor**

`useUserScrollDetector` already handles `visualViewport.resize` (Task 6). Verify it's working by checking that the effect fires when the keyboard opens/closes on mobile.

- [ ] **Step 4: Verify type-check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "perf(chat): optimize MessageRow for inactive mounts, polish empty state and mobile keyboard"
```

---

### Task 17: Final verification

**Files:**
- All modified files

**Rationale:** Run full type-check and lint to ensure no regressions.

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: Zero errors.

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: Zero errors (or only pre-existing warnings).

- [ ] **Step 3: Manual smoke test checklist**

Run the app and verify:
1. Switching between recently-viewed sessions is instant (no loading flash).
2. Messages render newest-first at the bottom.
3. New SSE messages appear naturally anchored at the bottom.
4. Scrolling up shows older messages in correct order.
5. Jump-to-newest button appears when scrolled up and works.
6. Load-more triggers when near the top of history.
7. Empty sessions render input at the bottom.
8. Mobile keyboard doesn't cause scroll jumps.

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "fix(chat): final type-check and lint cleanup for column-reverse mount pool"
```

---

## Summary

| Task | What it does |
|---|---|
| 1 | Reduce `MESSAGE_PAGE_SIZE` 200 → 25 |
| 2 | Create `timeline/types.ts` with `AnimationHandlers`, `ContentChangeReason` |
| 3 | Update all 10 file imports to use new types file |
| 4 | Add `reversed` prop to `ScrollShadow` |
| 5 | Create `useSessionMountPool` hook |
| 6 | Create `useUserScrollDetector` hook |
| 7 | Create `useSSEAnchorSuppression` hook |
| 8 | Create `ActiveSessionContext` |
| 9 | Extract `ChatViewport` and create `SessionMount` component |
| 10 | Refactor `ChatContainer` to render mount pool |
| 11 | Convert `ChatViewport` to `column-reverse` |
| 12 | Reverse message array in `MessageList` + adapt virtualizer |
| 13 | Remove load-more scroll compensation from timeline controller |
| 14 | Delete `useChatScrollManager.ts`, wire new scroll system |
| 15 | Tighten automatic load-more threshold |
| 16 | Polish: `MessageRow` memo, empty state, mobile keyboard |
| 17 | Final type-check + lint + manual smoke test |
