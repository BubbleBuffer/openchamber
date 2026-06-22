# Chat Adapter Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modularize the chat view around a stable `chat/state` adapter boundary, then split composer, session shell, timeline, and message-list responsibilities without changing runtime behavior.

**Architecture:** Current sync stores, UI stores, and chat hooks remain the source of truth during this phase. New adapter hooks in `packages/ui/src/components/chat/state/` expose chat-shaped state and actions, so render components stop importing broad stores directly and a future session state machine can replace adapter internals later. Refactors proceed from low-risk stabilization to adapter migration to focused component/controller extraction.

**Tech Stack:** React, TypeScript, Zustand, Bun test runner, Tailwind v4, `@tanstack/react-virtual`

---

## Branch And Working Tree Constraints

This plan is executed on the current branch (`feature/server-typescript-modernization` at time of writing). Do not revert or overwrite unrelated changes. Server migration work is in `packages/web/server/**` and should not be touched by this plan.

The existing dirty files at plan time are part of the cleanup baseline:

| File | Plan Treatment |
|------|----------------|
| `packages/ui/src/components/chat/ChatContainer.tsx` | Stabilize first, then migrate shell reads through adapters. |
| `packages/ui/src/components/chat/ChatInput.tsx` | Stabilize first, then split composer after adapters exist. |
| `packages/ui/src/components/chat/SessionMount.tsx` | Stabilize first, then migrate session/timeline props through adapters. |
| `packages/ui/src/components/chat/VirtualizedMessageList.tsx` | Stabilize first, then split hot-path local UI and animation state. |
| `packages/ui/src/components/chat/hooks/useChatTimelineController.ts` | Stabilize first, then split only after adapter migration. |
| `packages/web/server/lib/opencode/runtime.js` | Do not touch in this plan. |
| `packages/web/server/lib/opencode/runtime.test.js` | Do not touch in this plan. |

Checkpoint commits are recommended after each task. If the user does not want commits, still keep each task independently verifiable and avoid mixing unrelated phases.

---

## File Structure

### New

| File | Responsibility |
|------|----------------|
| `packages/ui/src/components/chat/state/types.ts` | Shared chat adapter types that are stable for render components and future session-machine migration. |
| `packages/ui/src/components/chat/state/useChatSessionState.ts` | Session identity, loaded/existence, active-state, draft-state adapter. |
| `packages/ui/src/components/chat/state/useChatMessages.ts` | Message records, rendered messages, streaming ID, and history metadata adapter. |
| `packages/ui/src/components/chat/state/useChatActivity.ts` | Streaming/working/retry/abort attention adapter. |
| `packages/ui/src/components/chat/state/useChatInterruptions.ts` | Permission/question blocking request adapter. |
| `packages/ui/src/components/chat/state/useChatComposerState.ts` | Composer state adapter for draft text, attachments, queue, mode, and selected send context. |
| `packages/ui/src/components/chat/state/useChatComposerActions.ts` | Composer action adapter for submit, queue, abort, attachments, linked context, and mobile controls. |
| `packages/ui/src/components/chat/state/useChatSelection.ts` | Selected agent/model/provider/project/directory adapter. |
| `packages/ui/src/components/chat/state/useChatTimelineState.ts` | Timeline state adapter around turn window, reveal work, older history, and hash navigation flags. |
| `packages/ui/src/components/chat/state/index.ts` | Barrel export for adapter hooks and types only. |
| `packages/ui/src/components/chat/chat-input/composerSlashCommands.ts` | Pure local slash command detection and execution planning. |
| `packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts` | Unit coverage for slash command parsing and shell-mode guard behavior. |
| `packages/ui/src/components/chat/chat-input/ComposerLinkedContextRow.tsx` | Linked issue and PR display rows. |
| `packages/ui/src/components/chat/chat-input/ComposerAutocompleteLayer.tsx` | Command, skill, and file mention overlay rendering. |
| `packages/ui/src/components/chat/chat-input/ComposerHighlightLayer.tsx` | Highlight preview layer behind the textarea. |
| `packages/ui/src/components/chat/chat-input/ComposerTextarea.tsx` | Textarea element and immediate event binding. |
| `packages/ui/src/components/chat/chat-input/ComposerMobileControls.tsx` | Mobile composer control chrome. |
| `packages/ui/src/components/chat/chat-input/ComposerFooter.tsx` | Desktop composer control chrome. |
| `packages/ui/src/components/chat/chat-input/useComposerHistory.ts` | User message history navigation state and actions. |
| `packages/ui/src/components/chat/chat-input/useComposerKeyboard.ts` | Keyboard orchestration around autocomplete, shell mode, history, submit, and queue. |
| `packages/ui/src/components/chat/timeline/useTurnWindow.ts` | Turn window model, turn start clamping, rendered-message derivation. |
| `packages/ui/src/components/chat/message-list/useMessageEntryUiState.ts` | Turn group expansion/collapse state. |
| `packages/ui/src/components/chat/message-list/useMessageAnimationState.ts` | User message animation bookkeeping. |
| `packages/ui/src/components/chat/message-list/MessageListEntries.tsx` | Virtual row rendering delegation. |
| `packages/ui/src/components/chat/message-list/LoadOlderBoundary.tsx` | Load-older button/boundary rendering. |

### Modified

| File | Change |
|------|--------|
| `packages/ui/src/components/chat/ChatContainer.tsx` | Keep top-level route/mount-pool orchestration; consume shell/session adapter outputs where practical. |
| `packages/ui/src/components/chat/ChatInput.tsx` | Become a composer shell delegating state, actions, render layers, footer, and keyboard behavior. |
| `packages/ui/src/components/chat/SessionMount.tsx` | Use chat adapters for session/messages/activity/interruptions/timeline-shaped state; keep lifecycle orchestration. |
| `packages/ui/src/components/chat/ChatSessionView.tsx` | Receive adapter-shaped props and keep loading/empty/viewport dispatch only. |
| `packages/ui/src/components/chat/ChatViewport.tsx` | Keep scroll container and overlays; receive narrower props. |
| `packages/ui/src/components/chat/VirtualizedMessageList.tsx` | Keep virtualizer wiring; delegate local UI state, animation state, load-older boundary, and row rendering. |
| `packages/ui/src/components/chat/hooks/useChatSessionData.ts` | Thin toward session/messages/activity/interruption adapter internals. |
| `packages/ui/src/components/chat/hooks/useChatTimelineController.ts` | Become an orchestrator after timeline hooks are extracted. |
| `packages/ui/src/components/chat/hooks/useChatTurnNavigation.ts` | Move pure hash/offset helpers into `timeline/useHashNavigation.ts` or timeline lib and keep wrapper behavior. |

### Not Touched

| Path | Reason |
|------|--------|
| `packages/web/server/lib/opencode/**` | Server runtime cleanup is separate from this chat UI plan. |
| `packages/ui/src/sync/**` | Current stores remain source of truth; adapter internals wrap them without broad sync rewrites. |
| `packages/ui/src/stores/**` | No store deletion or broad state consolidation in this phase. |

### Deferred / Future Scope

These items are explicitly out of scope for this plan. They are listed here so an agent executing the plan does not silently drop spec requirements.

| Item | Spec Phase | Reason for Deferral |
|------|-----------|---------------------|
| Phase 2.4 — Split `ChatContainer` / `SessionMount` / `ChatSessionView` / `ChatViewport` roles; remove duplicated loading/empty/session wrapper responsibilities | Spec §2.4 | Out of scope; this plan focuses on the adapter boundary and focused extractions, not role deduplication. Follow-up plan. |
| `packages/ui/src/components/chat/timeline/useOlderHistoryLoader.ts` | Spec §2.5 | Scroll intent and older history loading remain inside `useChatTimelineController.ts` for this plan. Extracting them requires the `messageListRef` shared-coupling protocol to be reworked first. |
| `packages/ui/src/components/chat/timeline/useScrollIntent.ts` | Spec §2.5 | Same as above. Pending render waiters and pending scroll request queue stay in the controller. |
| `packages/ui/src/components/chat/timeline/useViewportAnchorRestore.ts` | Spec §2.5 | `useViewportAnchor` already exists at `chat/hooks/useViewportAnchor.ts` and is DOM-coupled. Spec's separate "restore" hook would duplicate it without clear benefit; deferred. |
| `packages/ui/src/components/chat/timeline/useHashNavigation.ts` | Spec §2.5 | `useChatTurnNavigation.ts` already covers this. A rename + move is a separate task with no semantic change; deferred to keep this plan focused. |
| Splitting oversized files (`ChatMessage.tsx`, `MessageBody.tsx`, `ToolPart.tsx`, `ProgressiveGroup.tsx`, `ModelControls.tsx`, `MarkdownRendererImpl.tsx`, `MobileSessionStatusBar.tsx`, `FileAttachment.tsx`, `TextSelectionMenu.tsx`) | Spec §3 | These are functionally cohesive but large. Splitting them requires their own planning round (test infrastructure, dedicated hooks). Out of scope here. |
| `useChatSessionData` decomposition | Spec §2.1 | Known re-render bottleneck — wraps 5+ store boundaries (sync-context, machine selectors, plan detection). This plan's adapters wrap it rather than splitting it. A follow-up plan should decompose it into narrower per-domain fetchers to reduce XState `useSelector` calls per component. |
| `useVirtualizedChatEntries` move into `message-list/` | Spec §2.6 | File is already at `chat/hooks/useVirtualizedChatEntries.ts` and works. Moving it without restructuring is a separate task. |
| Adapter tests for `state/useChat*.ts` | Spec §4 | Existing adapter hooks are thin wrappers around machine selectors and are exercised by machine tests in `chat/state/chatMessagesMachine.test.tsx` and `chat/state/chatTimelineMachine.test.tsx`. New tests would be tautological; deferred. |

### Known Risks Carried Forward

| Risk | Source | Mitigation in this plan |
|------|--------|------------------------|
| `useChatSessionData` is a single bottleneck for 4+ state sources | Researcher report §5.1 | Adapters wrap the existing aggregator (Task 3). Follow-up decomposition plan needed. |
| `messageListRef` shared coupling between `SessionMount` → `ChatViewport` → `VirtualizedMessageList` for scroll-to-turn/message | Researcher report §5.2 | Carried over; not solved in this plan. Required for `useOlderHistoryLoader` / `useScrollIntent` extraction. |
| Pending scroll request protocol is fragile across render cycles | Researcher report §5.4 | Carried over; refactoring would break deferred timeline hooks. |
| Spec's `useChatSelection` may compete with existing `useSelectionStore` | Researcher report §5.7 | `useChatSelection` reads `useSelectionStore` directly — no new state of its own. No conflict. |
| Composer state is most coupled to broad stores | Researcher report §5.8 | Composer adapter hooks wrap the same stores `ChatInput` already uses. No new coupling introduced. |

---

## Verification Baseline

Use these commands throughout the plan:

```bash
bun test packages/ui/src/components/chat/chat-input/
bun test packages/ui/src/components/chat/timeline/
bun test packages/ui/src/components/chat/message-list/
bun run --cwd packages/ui type-check
bun run --cwd packages/ui lint
bun run type-check
bun run lint
```

Expected successful output for `bun test ...` is a zero exit status with all listed tests passing. Expected successful output for type-check and lint is a zero exit status with no TypeScript or ESLint errors.

Manual verification is required after Tasks 4, 7, 9, and 11:

1. Start a new chat session and stream a response.
2. Switch sessions while one is streaming.
3. Abort a streaming session.
4. Queue a message if queue mode is available.
5. Attach files through picker and drag/drop.
6. Use inline file mentions, agent mentions, skill autocomplete, command autocomplete, and local slash commands.
7. Load older history and verify scroll does not jump.
8. Navigate to a turn/message hash.
9. Verify desktop expanded composer.
10. Verify mobile composer with soft keyboard open and closed.

---

### Task 1: Stabilize The Current Extraction Baseline

**Files:**
- Modify: `packages/ui/src/components/chat/chat-input/draftStorage.test.ts`
- Read-only verify: `packages/ui/src/components/chat/ChatInput.tsx`
- Read-only verify: `packages/ui/src/components/chat/chat-input/**`

- [ ] **Step 1: Inspect the dirty working tree without changing it**

Run:

```bash
git status --short
git diff --stat
```

Expected: dirty chat files and existing server runtime files are present. Do not revert unrelated changes.

- [ ] **Step 2: Complete draft storage tests if missing**

If `packages/ui/src/components/chat/chat-input/draftStorage.test.ts` lacks coverage, replace it with:

```ts
import { describe, expect, test } from 'bun:test';
import {
  getConfirmedMentionsKey,
  getDraftKey,
  getStoredDraft,
  loadConfirmedMentions,
  saveConfirmedMentions,
  saveStoredDraft,
} from './draftStorage';

const installLocalStorage = () => {
  const data = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => {
        data.delete(key);
      },
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    },
  });
};

describe('draftStorage', () => {
  test('builds stable keys for session-scoped draft state', () => {
    expect(getDraftKey('session-1')).toBe('openchamber_chat_input_draft_session-1');
    expect(getConfirmedMentionsKey('session-1')).toBe('openchamber_chat_confirmed_mentions_session-1');
  });

  test('persists and reads draft text', () => {
    installLocalStorage();

    saveStoredDraft('session-1', 'hello world');

    expect(getStoredDraft('session-1')).toBe('hello world');
  });

  test('removes empty draft text', () => {
    installLocalStorage();

    saveStoredDraft('session-1', 'hello world');
    saveStoredDraft('session-1', '');

    expect(getStoredDraft('session-1')).toBe('');
  });

  test('persists confirmed mentions', () => {
    installLocalStorage();

    saveConfirmedMentions('session-1', new Set(['/src/App.tsx', '/src/main.tsx']));

    expect(loadConfirmedMentions('session-1')).toEqual(new Set(['/src/App.tsx', '/src/main.tsx']));
  });

  test('ignores malformed confirmed mention storage', () => {
    installLocalStorage();
    localStorage.setItem(getConfirmedMentionsKey('session-1'), '{not-json');

    expect(loadConfirmedMentions('session-1')).toEqual(new Set());
  });
});
```

- [ ] **Step 3: Run focused composer utility tests**

Run:

```bash
bun test packages/ui/src/components/chat/chat-input/
```

Expected: all chat-input tests pass. If this fails, fix only the extracted utility or test mismatch before continuing.

- [ ] **Step 4: Run baseline UI type-check and lint**

Run:

```bash
bun run --cwd packages/ui type-check
bun run --cwd packages/ui lint
```

Expected: both commands exit zero. If either fails due to the pre-existing extraction, fix only the minimal import/type/lint issue needed to restore baseline.

- [ ] **Step 5: Checkpoint**

If commits are allowed for this run, commit only the stabilization changes and already-intended chat extraction files:

```bash
git add packages/ui/src/components/chat packages/ui/src/components/chat/chat-input
git commit -m "refactor(chat): stabilize extracted composer baseline"
```

Expected: commit succeeds. If commits are not desired, record the passing commands in the final task note and proceed without committing.

---

### Task 2: Add Chat Adapter Type Contracts

**Files:**
- Create: `packages/ui/src/components/chat/state/types.ts`
- Create: `packages/ui/src/components/chat/state/index.ts`

- [ ] **Step 1: Create adapter directory and type contracts**

Create `packages/ui/src/components/chat/state/types.ts`:

```ts
import type React from 'react';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { QueuedMessage } from '@/stores/messageQueueStore';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { ChatSessionData } from '../hooks/useChatSessionData';

export interface ChatHistoryMeta {
  limit: number;
  complete: boolean;
  loading: boolean;
}

export interface ChatSessionState {
  sessionId: string | null;
  activeSessionId: string | null;
  isActive: boolean;
  loaded: boolean;
  exists: boolean;
  isDraftOpen: boolean;
  parentSessionId: string | null;
}

export interface ChatMessagesState {
  messages: ChatMessageEntry[];
  renderedMessages: ChatMessageEntry[];
  messageCount: number;
  streamingMessageId: string | undefined;
  historyMeta: ChatHistoryMeta;
  retryOverlay: ChatSessionData['retryOverlay'];
}

export interface ChatActivityState {
  isWorking: boolean;
  isStreaming: boolean;
  isAborting: boolean;
  showAbortStatus: boolean;
  needsAttention: boolean;
}

export interface ChatInterruptionsState {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  hasBlockingRequest: boolean;
}

export interface ChatTimelineState {
  turnStart: number;
  pendingRevealWork: boolean;
  hasMoreAboveTurns: boolean;
  isLoadingOlder: boolean;
  allEntries: ChatMessageEntry[];
}

export interface ChatComposerState {
  message: string;
  attachedFiles: AttachedFile[];
  queuedMessages: QueuedMessage[];
  queueModeEnabled: boolean;
  inputMode: 'normal' | 'shell';
  isMobile: boolean;
  isKeyboardOpen: boolean;
  isExpandedInput: boolean;
}

export interface ChatComposerActions {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  submit: () => void | Promise<void>;
  queue: () => void;
  abort: () => void;
  clearAttachments: () => void;
}

export interface ChatSelectionState {
  agentName: string | null;
  modelId: string | null;
  providerId: string | null;
  variant: string | null;
  directory: string | null;
  projectId: string | null;
}
```

- [ ] **Step 2: Export adapter contracts**

Create `packages/ui/src/components/chat/state/index.ts`:

```ts
export type {
  ChatActivityState,
  ChatComposerActions,
  ChatComposerState,
  ChatHistoryMeta,
  ChatInterruptionsState,
  ChatMessagesState,
  ChatSelectionState,
  ChatSessionState,
  ChatTimelineState,
} from './types';
```

- [ ] **Step 3: Type-check the contract**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: type-check passes. If imported type names differ, update the adapter type imports to match existing exported names rather than adding casts.

- [ ] **Step 4: Checkpoint**

```bash
git add packages/ui/src/components/chat/state
git commit -m "refactor(chat): add adapter state contracts"
```

Expected: commit succeeds if commits are allowed.

---

### Task 3: Introduce Read-Only Session, Message, Activity, And Interruption Adapters

**Files:**
- Create: `packages/ui/src/components/chat/state/useChatSessionState.ts`
- Create: `packages/ui/src/components/chat/state/useChatMessages.ts`
- Create: `packages/ui/src/components/chat/state/useChatActivity.ts`
- Create: `packages/ui/src/components/chat/state/useChatInterruptions.ts`
- Modify: `packages/ui/src/components/chat/state/index.ts`
- Modify: `packages/ui/src/components/chat/hooks/useChatSessionData.ts`

- [ ] **Step 1: Keep blocking request runtime helpers unchanged**

Do not invent chat-specific blocking request type names. Runtime helpers stay in `packages/ui/src/components/chat/lib/blockingRequests.ts`; adapter state uses `PermissionRequest` from `@/types/permission` and `QuestionRequest` from `@/types/question`.

- [ ] **Step 2: Create `useChatSessionState`**

Create `packages/ui/src/components/chat/state/useChatSessionState.ts`:

```ts
import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/hooks/useSessions';
import type { ChatSessionState } from './types';

interface UseChatSessionStateOptions {
  sessionId: string | null;
  isActive: boolean;
  loaded: boolean;
}

export function useChatSessionState({ sessionId, isActive, loaded }: UseChatSessionStateOptions): ChatSessionState {
  const activeSessionId = useSessionUIStore((state) => state.currentSessionId);
  const isDraftOpen = useSessionUIStore((state) => state.newSessionDraft.open);
  const { sessions } = useSessions();

  return React.useMemo(() => {
    const session = sessionId ? sessions.find((candidate) => candidate.id === sessionId) : undefined;
    const parentSessionId = session?.parentID ?? null;

    return {
      sessionId,
      activeSessionId,
      isActive,
      loaded,
      exists: Boolean(session),
      isDraftOpen,
      parentSessionId,
    };
  }, [activeSessionId, isActive, isDraftOpen, loaded, sessionId, sessions]);
}
```

- [ ] **Step 3: Create `useChatMessages` as a thin shape adapter**

Create `packages/ui/src/components/chat/state/useChatMessages.ts`:

```ts
import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { ChatSessionData } from '../hooks/useChatSessionData';
import type { ChatHistoryMeta } from './types';
import type { ChatMessagesState } from './types';

interface UseChatMessagesOptions {
  messages: ChatMessageEntry[];
  renderedMessages: ChatMessageEntry[];
  streamingMessageId: string | undefined;
  historyMeta: ChatHistoryMeta;
  retryOverlay: ChatSessionData['retryOverlay'];
}

export function useChatMessages({
  messages,
  renderedMessages,
  streamingMessageId,
  historyMeta,
  retryOverlay,
}: UseChatMessagesOptions): ChatMessagesState {
  return React.useMemo(
    () => ({
      messages,
      renderedMessages,
      messageCount: messages.length,
      streamingMessageId,
      historyMeta,
      retryOverlay,
    }),
    [historyMeta, messages, renderedMessages, retryOverlay, streamingMessageId],
  );
}
```

- [ ] **Step 4: Create `useChatActivity`**

Create `packages/ui/src/components/chat/state/useChatActivity.ts`:

```ts
import React from 'react';
import type { ChatActivityState } from './types';

interface UseChatActivityOptions {
  isWorking: boolean;
  streamingMessageId: string | undefined;
  showAbortStatus: boolean;
  hasBlockingRequest: boolean;
}

export function useChatActivity({
  isWorking,
  streamingMessageId,
  showAbortStatus,
  hasBlockingRequest,
}: UseChatActivityOptions): ChatActivityState {
  return React.useMemo(
    () => ({
      isWorking,
      isStreaming: Boolean(streamingMessageId),
      isAborting: showAbortStatus,
      showAbortStatus,
      needsAttention: hasBlockingRequest,
    }),
    [hasBlockingRequest, isWorking, showAbortStatus, streamingMessageId],
  );
}
```

- [ ] **Step 5: Create `useChatInterruptions`**

Create `packages/ui/src/components/chat/state/useChatInterruptions.ts`:

```ts
import React from 'react';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { ChatInterruptionsState } from './types';

interface UseChatInterruptionsOptions {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}

export function useChatInterruptions({ permissions, questions }: UseChatInterruptionsOptions): ChatInterruptionsState {
  return React.useMemo(
    () => ({
      permissions,
      questions,
      hasBlockingRequest: permissions.length > 0 || questions.length > 0,
    }),
    [permissions, questions],
  );
}
```

- [ ] **Step 6: Export read adapters**

Modify `packages/ui/src/components/chat/state/index.ts`:

```ts
export { useChatActivity } from './useChatActivity';
export { useChatInterruptions } from './useChatInterruptions';
export { useChatMessages } from './useChatMessages';
export { useChatSessionState } from './useChatSessionState';
export type {
  ChatActivityState,
  ChatComposerActions,
  ChatComposerState,
  ChatHistoryMeta,
  ChatInterruptionsState,
  ChatMessagesState,
  ChatSelectionState,
  ChatSessionState,
  ChatTimelineState,
} from './types';
```

- [ ] **Step 7: Run type-check**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: type-check passes. Fix export/type names minimally.

- [ ] **Step 8: Checkpoint**

```bash
git add packages/ui/src/components/chat/state packages/ui/src/components/chat/utils/blockingRequests.ts
git commit -m "refactor(chat): add read-only chat state adapters"
```

Expected: commit succeeds if commits are allowed.

---

### Task 4: Migrate `SessionMount` To Read Adapters

**Files:**
- Modify: `packages/ui/src/components/chat/SessionMount.tsx`
- Modify: `packages/ui/src/components/chat/ChatSessionView.tsx`
- Modify: `packages/ui/src/components/chat/ChatViewport.tsx`

- [ ] **Step 1: Compose adapter outputs in `SessionMount`**

After existing `data` and `timelineController` calls, create adapter state:

```ts
const interruptions = useChatInterruptions({
  permissions: data.blockingRequests.permissions,
  questions: data.blockingRequests.questions,
});

const messagesState = useChatMessages({
  messages: data.messages,
  renderedMessages: timelineController.renderedMessages,
  streamingMessageId: data.streamingMessageId,
  historyMeta: data.historyMeta,
  retryOverlay: data.retryOverlay,
});

const activity = useChatActivity({
  isWorking: data.isWorking,
  streamingMessageId: data.streamingMessageId,
  showAbortStatus: data.showAbortStatus,
  hasBlockingRequest: interruptions.hasBlockingRequest,
});

const sessionState = useChatSessionState({
  sessionId,
  isActive,
  loaded: data.loaded,
});
```

Import from `./state` when the file sits in `packages/ui/src/components/chat/`, and from `../state` when the file sits in a direct child directory.

- [ ] **Step 2: Pass adapter-shaped props to `ChatSessionView`**

Prefer passing grouped objects over expanding more primitive props:

```tsx
<ChatSessionView
  session={sessionState}
  messages={messagesState}
  activity={activity}
  interruptions={interruptions}
  timeline={timelineController}
  scrollRef={scrollRef}
  messageListRef={messageListRef}
  onScrollStateChange={handleScrollStateChange}
  animationHandlers={animationHandlers}
/>
```

If the existing component signatures make this too large for one step, keep primitive props for this task and add a follow-up step in the same task to group them after type-check passes.

- [ ] **Step 3: Update `ChatSessionView` prop types**

Use adapter types in props:

```ts
import type { ChatActivityState, ChatInterruptionsState, ChatMessagesState, ChatSessionState } from './state';

interface ChatSessionViewProps {
  session: ChatSessionState;
  messages: ChatMessagesState;
  activity: ChatActivityState;
  interruptions: ChatInterruptionsState;
  // Keep existing timeline/ref/callback props until Task 9.
}
```

Preserve the current loading and empty-state behavior:

```ts
const showLoading = !session.loaded && messages.messageCount === 0;
const showEmpty = session.loaded && messages.messageCount === 0 && !messages.streamingMessageId;
```

- [ ] **Step 4: Update `ChatViewport` call sites only**

Do not redesign `ChatViewport`. Map adapter objects back to its current required props if needed:

```tsx
<ChatViewport
  sessionId={session.sessionId ?? ''}
  loaded={session.loaded}
  renderedMessages={messages.renderedMessages}
  streamingMessageId={messages.streamingMessageId}
  retryOverlay={messages.retryOverlay}
  sessionIsWorking={activity.isWorking}
  sessionQuestions={interruptions.questions}
  sessionPermissions={interruptions.permissions}
  {...remainingExistingTimelineAndRefProps}
/>
```

- [ ] **Step 5: Run focused type-check**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: type-check passes. Fix prop mismatches without changing behavior.

- [ ] **Step 6: Manual verification**

Run the manual verification checklist for session load, streaming, session switch, abort, permissions/questions, load older, and mobile keyboard.

- [ ] **Step 7: Checkpoint**

```bash
git add packages/ui/src/components/chat/SessionMount.tsx packages/ui/src/components/chat/ChatSessionView.tsx packages/ui/src/components/chat/ChatViewport.tsx packages/ui/src/components/chat/state
git commit -m "refactor(chat): route session view through adapters"
```

Expected: commit succeeds if commits are allowed.

---

### Task 5: Add Composer Slash Command Utility Before Moving Submit Logic

**Files:**
- Create: `packages/ui/src/components/chat/chat-input/composerSlashCommands.ts`
- Create: `packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts`
- Modify: `packages/ui/src/components/chat/chat-input/composerSubmit.ts`
- Modify: `packages/ui/src/components/chat/chat-input/composerSubmit.test.ts`

- [ ] **Step 1: Write failing slash command tests**

Create `packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { getComposerSlashCommand, isComposerSlashCommand, shouldHandleSlashCommandLocally } from './composerSlashCommands';

describe('composerSlashCommands', () => {
  test('detects supported local slash commands', () => {
    expect(getComposerSlashCommand('/undo')).toBe('undo');
    expect(getComposerSlashCommand('/redo now')).toBe('redo');
    expect(getComposerSlashCommand('/compact')).toBe('compact');
    expect(getComposerSlashCommand('/summary')).toBe('summary');
    expect(getComposerSlashCommand('/review')).toBe('review');
  });

  test('ignores unsupported commands and normal text', () => {
    expect(getComposerSlashCommand('/unsupported')).toBeNull();
    expect(getComposerSlashCommand('hello /undo')).toBeNull();
    expect(getComposerSlashCommand('')).toBeNull();
  });

  test('does not treat shell-mode text as local slash commands', () => {
    expect(shouldHandleSlashCommandLocally({ message: '/undo', inputMode: 'normal' })).toBe(true);
    expect(shouldHandleSlashCommandLocally({ message: '/undo', inputMode: 'shell' })).toBe(false);
  });

  test('supports boolean command checks', () => {
    expect(isComposerSlashCommand('/compact')).toBe(true);
    expect(isComposerSlashCommand('/nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and confirm failure**

Run:

```bash
bun test packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts
```

Expected: fail because `composerSlashCommands.ts` does not exist.

- [ ] **Step 3: Implement utility**

Create `packages/ui/src/components/chat/chat-input/composerSlashCommands.ts`:

```ts
const LOCAL_SLASH_COMMANDS = new Set(['undo', 'redo', 'compact', 'summary', 'review'] as const);

export type ComposerSlashCommand = 'undo' | 'redo' | 'compact' | 'summary' | 'review';

interface ShouldHandleSlashCommandLocallyOptions {
  message: string;
  inputMode: 'normal' | 'shell';
}

export function getComposerSlashCommand(message: string): ComposerSlashCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;

  const [rawCommand] = trimmed.slice(1).split(/\s+/, 1);
  if (!rawCommand) return null;

  return LOCAL_SLASH_COMMANDS.has(rawCommand as ComposerSlashCommand) ? (rawCommand as ComposerSlashCommand) : null;
}

export function isComposerSlashCommand(message: string): boolean {
  return getComposerSlashCommand(message) !== null;
}

export function shouldHandleSlashCommandLocally({
  message,
  inputMode,
}: ShouldHandleSlashCommandLocallyOptions): boolean {
  return inputMode !== 'shell' && isComposerSlashCommand(message);
}
```

- [ ] **Step 4: Wire existing submit utility to reuse this helper**

In `composerSubmit.ts`, replace duplicate slash command parsing with this exact wrapper. Do not re-export `getComposerSlashCommand` directly because the existing `getLocalSlashCommandName` signature is `(inputMode, primaryText)`.

```ts
import { getComposerSlashCommand } from './composerSlashCommands';

export function getLocalSlashCommandName(inputMode: 'normal' | 'shell', primaryText: string) {
  return inputMode === 'shell' ? null : getComposerSlashCommand(primaryText);
}
```

- [ ] **Step 5: Run utility tests**

Run:

```bash
bun test packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts packages/ui/src/components/chat/chat-input/composerSubmit.test.ts
```

Expected: both test files pass.

- [ ] **Step 6: Checkpoint**

```bash
git add packages/ui/src/components/chat/chat-input/composerSlashCommands.ts packages/ui/src/components/chat/chat-input/composerSlashCommands.test.ts packages/ui/src/components/chat/chat-input/composerSubmit.ts packages/ui/src/components/chat/chat-input/composerSubmit.test.ts
git commit -m "refactor(chat): isolate composer slash commands"
```

Expected: commit succeeds if commits are allowed.

---

### Task 6: Extract Low-Risk Composer Render Components

**Files:**
- Create: `packages/ui/src/components/chat/chat-input/ComposerLinkedContextRow.tsx`
- Create: `packages/ui/src/components/chat/chat-input/ComposerAutocompleteLayer.tsx`
- Create: `packages/ui/src/components/chat/chat-input/ComposerHighlightLayer.tsx`
- Create: `packages/ui/src/components/chat/chat-input/ComposerTextarea.tsx`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Extract linked context rows first**

Create `ComposerLinkedContextRow.tsx` with props matching current linked issue/PR local state. Move only the JSX that renders linked issue and linked PR rows from `ChatInput.tsx`. Keep state ownership in `ChatInput.tsx`.

Use this component shape:

```tsx
import React from 'react';

interface LinkedContextItem {
  id: string;
  number?: number;
  title: string;
  url?: string;
}

interface ComposerLinkedContextRowProps {
  linkedIssue: LinkedContextItem | null;
  linkedPr: LinkedContextItem | null;
  onOpenIssuePicker: () => void;
  onOpenPrPicker: () => void;
  onClearIssue: () => void;
  onClearPr: () => void;
}

export const ComposerLinkedContextRow = React.memo(function ComposerLinkedContextRow({
  linkedIssue,
  linkedPr,
  onOpenIssuePicker,
  onOpenPrPicker,
  onClearIssue,
  onClearPr,
}: ComposerLinkedContextRowProps) {
  if (!linkedIssue && !linkedPr) return null;

  return (
    <div className="flex flex-col gap-1 px-3 pt-2 text-xs text-text-muted">
      {linkedIssue ? (
        <button type="button" onClick={onOpenIssuePicker} className="flex min-h-8 items-center justify-between gap-2 rounded-md border border-border-subtle px-2 text-left">
          <span className="truncate">#{linkedIssue.number ?? linkedIssue.id} {linkedIssue.title}</span>
          <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onClearIssue(); }}>Clear</span>
        </button>
      ) : null}
      {linkedPr ? (
        <button type="button" onClick={onOpenPrPicker} className="flex min-h-8 items-center justify-between gap-2 rounded-md border border-border-subtle px-2 text-left">
          <span className="truncate">PR #{linkedPr.number ?? linkedPr.id} {linkedPr.title}</span>
          <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onClearPr(); }}>Clear</span>
        </button>
      ) : null}
    </div>
  );
});
```

Adjust `LinkedContextItem` to match the existing linked issue/PR shapes instead of casting.

- [ ] **Step 2: Extract autocomplete layer**

Create `ComposerAutocompleteLayer.tsx`. Move the existing `CommandAutocomplete`, `SkillAutocomplete`, and `FileMentionAutocomplete` JSX blocks. Preserve current prop names and order. Do not change overlay positioning logic.

Use this skeleton and fill the three moved blocks exactly from `ChatInput.tsx`:

```tsx
import React from 'react';

interface ComposerAutocompleteLayerProps {
  showCommandAutocomplete: boolean;
  showSkillAutocomplete: boolean;
  showFileMention: boolean;
  isMobile: boolean;
  isDesktopExpanded: boolean;
}

export const ComposerAutocompleteLayer = React.memo(function ComposerAutocompleteLayer(props: ComposerAutocompleteLayerProps) {
  const { showCommandAutocomplete, showSkillAutocomplete, showFileMention } = props;

  return (
    <>
      {showCommandAutocomplete ? null : null}
      {showSkillAutocomplete ? null : null}
      {showFileMention ? null : null}
    </>
  );
});
```

Replace each `null` with the exact existing autocomplete component block, then add the missing props explicitly. Avoid a catch-all props object.

- [ ] **Step 3: Extract highlight layer**

Create `ComposerHighlightLayer.tsx`. Move only the highlighted composer content overlay from `ChatInput.tsx`.

```tsx
import React from 'react';

interface ComposerHighlightLayerProps {
  highlightedComposerContent: React.ReactNode;
  composerHighlightRef: React.RefObject<HTMLDivElement | null>;
  hidden: boolean;
}

export const ComposerHighlightLayer = React.memo(function ComposerHighlightLayer({
  highlightedComposerContent,
  composerHighlightRef,
  hidden,
}: ComposerHighlightLayerProps) {
  if (hidden) return null;

  return (
    <div ref={composerHighlightRef} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-transparent">
      {highlightedComposerContent}
    </div>
  );
});
```

Keep the existing classes from `ChatInput.tsx` if they differ from this skeleton.

- [ ] **Step 4: Extract textarea element**

Create `ComposerTextarea.tsx`. Move the `<textarea>` element and its direct props. Keep handler implementation in `ChatInput.tsx` for now.

```tsx
import React from 'react';

interface ComposerTextareaProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  placeholder: string;
  disabled: boolean;
  spellCheck: boolean;
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  onFocus?: React.FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
}

export const ComposerTextarea = React.memo(function ComposerTextarea({
  textareaRef,
  value,
  placeholder,
  disabled,
  spellCheck,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
}: ComposerTextareaProps) {
  return (
    <textarea
      ref={textareaRef}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={spellCheck}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
});
```

Copy all existing accessibility attributes, inline style, class names, row settings, and data attributes from the original textarea into the component.

- [ ] **Step 5: Replace JSX in `ChatInput.tsx`**

Import the new components and replace the moved blocks with component calls. Keep all state, refs, and callbacks in `ChatInput.tsx`.

- [ ] **Step 6: Run type-check and composer tests**

Run:

```bash
bun test packages/ui/src/components/chat/chat-input/
bun run --cwd packages/ui type-check
```

Expected: tests and type-check pass.

- [ ] **Step 7: Manual composer verification**

Verify typing, paste, autocomplete, linked issue/PR rows, desktop expanded mode, and mobile keyboard.

- [ ] **Step 8: Checkpoint**

```bash
git add packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/chat/chat-input
git commit -m "refactor(chat): extract composer render layers"
```

Expected: commit succeeds if commits are allowed.

---

### Task 7: Extract Composer Footer And Mobile Controls

**Files:**
- Create: `packages/ui/src/components/chat/chat-input/ComposerMobileControls.tsx`
- Create: `packages/ui/src/components/chat/chat-input/ComposerFooter.tsx`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Extract mobile controls**

Create `ComposerMobileControls.tsx` and move the mobile footer/control panel block from `ChatInput.tsx`. This component must be `React.memo` because it sits next to the hot input path.

Use this component shape and add the exact moved props:

```tsx
import React from 'react';

interface ComposerMobileControlsProps {
  open: boolean;
  activePanel: string | null;
  onOpenPanel: (panel: string) => void;
  onClose: () => void;
}

export const ComposerMobileControls = React.memo(function ComposerMobileControls({
  open,
  activePanel,
  onOpenPanel,
  onClose,
}: ComposerMobileControlsProps) {
  return (
    <div data-composer-mobile-controls="true">
      {/* Move the exact mobile controls JSX from ChatInput.tsx here. */}
      <button type="button" onClick={() => onOpenPanel(activePanel ?? 'main')}>Controls</button>
      {open ? <button type="button" onClick={onClose}>Close</button> : null}
    </div>
  );
});
```

Replace the temporary scaffold buttons in the skeleton with existing JSX before running tests. Preserve 44px touch targets and keyboard-safe spacing.

- [ ] **Step 2: Extract desktop footer**

Create `ComposerFooter.tsx` and move the desktop footer button row from `ChatInput.tsx`. This component must be `React.memo` and should receive stable callbacks.

Use this component shape and add the exact moved props:

```tsx
import React from 'react';

interface ComposerFooterProps {
  disabled: boolean;
}

export const ComposerFooter = React.memo(function ComposerFooter({ disabled }: ComposerFooterProps) {
  return (
    <div data-composer-footer="true" aria-disabled={disabled}>
      {/* Move the exact desktop footer JSX from ChatInput.tsx here. */}
    </div>
  );
});
```

Replace the comment with existing JSX and explicitly define all props. Do not pass a large `controls` object unless it is stable and memoized.

- [ ] **Step 3: Preserve mobile-first performance rules**

In `ChatInput.tsx`, ensure callbacks passed to `ComposerMobileControls` and `ComposerFooter` are stable with existing `useCallback` handlers. Do not add new store subscriptions to these components.

- [ ] **Step 4: Run type-check and lint**

Run:

```bash
bun run --cwd packages/ui type-check
bun run --cwd packages/ui lint
```

Expected: both pass.

- [ ] **Step 5: Manual verification**

Verify desktop footer buttons, attach picker, VS Code picker if available, issue/PR picker, permission auto-accept, focus mode, send, queue, stop, and mobile controls with keyboard open.

- [ ] **Step 6: Checkpoint**

```bash
git add packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/chat/chat-input/ComposerMobileControls.tsx packages/ui/src/components/chat/chat-input/ComposerFooter.tsx
git commit -m "refactor(chat): extract composer footer controls"
```

Expected: commit succeeds if commits are allowed.

---

### Task 8: Extract Composer History And Keyboard Hooks

**Files:**
- Create: `packages/ui/src/components/chat/chat-input/useComposerHistory.ts`
- Create: `packages/ui/src/components/chat/chat-input/useComposerKeyboard.ts`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Extract history state**

Create `useComposerHistory.ts`:

```ts
import React from 'react';
import { useUserMessageHistory } from '@/sync/sync-context';

interface UseComposerHistoryOptions {
  sessionId: string | null;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useComposerHistory({ sessionId, message, setMessage }: UseComposerHistoryOptions) {
  const userMessageHistory = useUserMessageHistory(sessionId ?? '');
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [draftMessage, setDraftMessage] = React.useState('');

  const resetHistory = React.useCallback(() => {
    setHistoryIndex(-1);
    setDraftMessage('');
  }, []);

  return {
    userMessageHistory,
    historyIndex,
    setHistoryIndex,
    draftMessage,
    setDraftMessage,
    resetHistory,
    currentMessage: message,
    setMessage,
  };
}
```

Move existing history navigation logic from `ChatInput.tsx` into this hook only after the state extraction type-checks.

- [ ] **Step 2: Extract keyboard hook shell**

Create `useComposerKeyboard.ts`:

```ts
import React from 'react';

interface UseComposerKeyboardOptions {
  disabled: boolean;
  isComposingRef: React.RefObject<boolean>;
  submit: () => void | Promise<void>;
  queue: () => void;
  onEscape?: () => void;
}

export function useComposerKeyboard({ disabled, isComposingRef, submit, queue, onEscape }: UseComposerKeyboardOptions) {
  return React.useCallback<React.KeyboardEventHandler<HTMLTextAreaElement>>(
    (event) => {
      if (disabled || isComposingRef.current) return;

      if (event.key === 'Escape') {
        onEscape?.();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void submit();
        return;
      }

      if (event.key === 'Enter' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        queue();
      }
    },
    [disabled, isComposingRef, onEscape, queue, submit],
  );
}
```

Replace this initial shell with the exact existing `handleKeyDown` logic in small chunks. Preserve IME guard, shell Escape/Backspace handling, autocomplete delegation, history navigation, Enter/Ctrl+Enter behavior, and Tab agent cycling.

- [ ] **Step 3: Migrate `ChatInput.tsx` state usage**

Replace inline `historyIndex` and `draftMessage` state with `useComposerHistory`. Replace inline `handleKeyDown` with `useComposerKeyboard` once behavior parity is preserved.

- [ ] **Step 4: Run type-check and manual keyboard verification**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: type-check passes.

Manual checks: Enter submit, Shift+Enter newline, Ctrl/Cmd+Enter queue behavior, Escape, shell mode `!`, arrow history, autocomplete Tab/Enter, IME composition.

- [ ] **Step 5: Checkpoint**

```bash
git add packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/chat/chat-input/useComposerHistory.ts packages/ui/src/components/chat/chat-input/useComposerKeyboard.ts
git commit -m "refactor(chat): extract composer keyboard and history hooks"
```

Expected: commit succeeds if commits are allowed.

---

### Task 9: Add Composer State And Action Adapters

**Files:**
- Create: `packages/ui/src/components/chat/state/useChatComposerState.ts`
- Create: `packages/ui/src/components/chat/state/useChatComposerActions.ts`
- Create: `packages/ui/src/components/chat/state/useChatSelection.ts`
- Modify: `packages/ui/src/components/chat/state/index.ts`
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Create composer state adapter**

Create `useChatComposerState.ts` by moving broad read composition out of `ChatInput.tsx` without moving behavior:

```ts
import React from 'react';
import { useInputStore } from '@/sync/input-store';
import { useMessageQueueStore } from '@/stores/useMessageQueueStore';
import { useUIStore } from '@/stores/useUIStore';
import type { ChatComposerState } from './types';

interface UseChatComposerStateOptions {
  sessionId: string | null;
  message: string;
  inputMode: 'normal' | 'shell';
}

export function useChatComposerState({ sessionId, message, inputMode }: UseChatComposerStateOptions): ChatComposerState {
  const attachedFiles = useInputStore((state) => state.attachedFiles);
  const queuedMessages = useMessageQueueStore((state) => state.queuedMessages[sessionId ?? ''] ?? []);
  const queueModeEnabled = useMessageQueueStore((state) => state.queueModeEnabled);
  const isMobile = useUIStore((state) => state.isMobile);
  const isKeyboardOpen = useUIStore((state) => state.isKeyboardOpen);
  const isExpandedInput = useUIStore((state) => state.isExpandedInput);

  return React.useMemo(
    () => ({
      message,
      attachedFiles,
      queuedMessages,
      queueModeEnabled,
      inputMode,
      isMobile,
      isKeyboardOpen,
      isExpandedInput,
    }),
    [attachedFiles, inputMode, isExpandedInput, isKeyboardOpen, isMobile, message, queueModeEnabled, queuedMessages],
  );
}
```

- [ ] **Step 2: Create composer actions adapter as a pass-through boundary**

Create `useChatComposerActions.ts`:

```ts
import React from 'react';
import { useInputStore } from '@/sync/input-store';
import type { ChatComposerActions } from './types';

interface UseChatComposerActionsOptions {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  submit: () => void | Promise<void>;
  queue: () => void;
  abort: () => void;
}

export function useChatComposerActions({ setMessage, submit, queue, abort }: UseChatComposerActionsOptions): ChatComposerActions {
  const clearAttachedFiles = useInputStore((state) => state.clearAttachedFiles);

  return React.useMemo(
    () => ({
      setMessage,
      submit,
      queue,
      abort,
      clearAttachments: clearAttachedFiles,
    }),
    [abort, clearAttachedFiles, queue, setMessage, submit],
  );
}
```

- [ ] **Step 3: Create selection adapter**

Create `useChatSelection.ts`:

```ts
import React from 'react';
import { useAgentConfigStore } from '@/stores/useAgentConfigStore';
import { useProviderConfigStore } from '@/stores/useProviderConfigStore';
import { useChatSearchDirectory } from '@/hooks/useChatSearchDirectory';
import type { ChatSelectionState } from './types';

export function useChatSelection(): ChatSelectionState {
  const agentName = useAgentConfigStore((state) => state.currentAgentName ?? null);
  const getEffectiveModel = useProviderConfigStore((state) => state.getEffectiveModel);
  const variant = useProviderConfigStore((state) => state.currentVariant ?? null);
  const directory = useChatSearchDirectory();

  return React.useMemo(() => {
    const effectiveModel = getEffectiveModel();

    return {
      agentName,
      modelId: effectiveModel?.modelId ?? null,
      providerId: effectiveModel?.providerId ?? null,
      variant,
      directory,
      projectId: null,
    };
  }, [agentName, directory, getEffectiveModel, variant]);
}
```

Adjust effective model property names to match the actual store return shape.

- [ ] **Step 4: Export adapters**

Update `state/index.ts` to export `useChatComposerState`, `useChatComposerActions`, and `useChatSelection`.

- [ ] **Step 5: Migrate `ChatInput.tsx` to adapter reads**

Replace direct broad reads that are now covered by the adapters. Do this only for values included in adapter outputs. Leave remaining store reads in place until a later focused task.

- [ ] **Step 6: Run type-check, lint, and manual composer verification**

Run:

```bash
bun run --cwd packages/ui type-check
bun run --cwd packages/ui lint
```

Expected: both pass.

- [ ] **Step 7: Checkpoint**

```bash
git add packages/ui/src/components/chat/ChatInput.tsx packages/ui/src/components/chat/state
git commit -m "refactor(chat): route composer state through adapters"
```

Expected: commit succeeds if commits are allowed.

---

### Task 10: Introduce Timeline Adapter And Extract Turn Window Hook

**Files:**
- Create: `packages/ui/src/components/chat/state/useChatTimelineState.ts`
- Create: `packages/ui/src/components/chat/timeline/useTurnWindow.ts`
- Modify: `packages/ui/src/components/chat/hooks/useChatTimelineController.ts`
- Modify: `packages/ui/src/components/chat/state/index.ts`

- [ ] **Step 1: Create timeline adapter around current controller output**

Create `useChatTimelineState.ts`:

```ts
import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { ChatTimelineState } from './types';

interface UseChatTimelineStateOptions {
  turnStart: number;
  pendingRevealWork: boolean;
  hasMoreAboveTurns: boolean;
  isLoadingOlder: boolean;
  allEntries: ChatMessageEntry[];
}

export function useChatTimelineState(options: UseChatTimelineStateOptions): ChatTimelineState {
  return React.useMemo(
    () => ({
      turnStart: options.turnStart,
      pendingRevealWork: options.pendingRevealWork,
      hasMoreAboveTurns: options.hasMoreAboveTurns,
      isLoadingOlder: options.isLoadingOlder,
      allEntries: options.allEntries,
    }),
    [options.allEntries, options.hasMoreAboveTurns, options.isLoadingOlder, options.pendingRevealWork, options.turnStart],
  );
}
```

- [ ] **Step 2: Extract `useTurnWindow`**

Move only turn window model and `turnStart` management out of `useChatTimelineController.ts`. Preserve the existing algorithms and constants.

Create `timeline/useTurnWindow.ts` with this public shape:

```ts
import React from 'react';
import type { ChatMessageEntry } from '../lib/turns/types';
import { buildTurnWindowModel, getInitialTurnStart, updateTurnWindowModelIncremental } from '../lib/turns/windowTurns';

interface UseTurnWindowOptions {
  sessionId: string;
  messages: ChatMessageEntry[];
}

export function useTurnWindow({ sessionId, messages }: UseTurnWindowOptions) {
  const previousSessionIdRef = React.useRef(sessionId);
  const previousMessagesRef = React.useRef<ChatMessageEntry[]>(messages);
  const previousModelRef = React.useRef(buildTurnWindowModel(messages));
  const [turnStart, setTurnStart] = React.useState(() => getInitialTurnStart(previousModelRef.current.turnCount));

  if (previousSessionIdRef.current !== sessionId) {
    previousSessionIdRef.current = sessionId;
    previousMessagesRef.current = messages;
    previousModelRef.current = buildTurnWindowModel(messages);
  } else {
    const nextModel = updateTurnWindowModelIncremental(previousModelRef.current, previousMessagesRef.current, messages) ?? buildTurnWindowModel(messages);
    previousMessagesRef.current = messages;
    previousModelRef.current = nextModel;
  }

  React.useLayoutEffect(() => {
    setTurnStart((current) => Math.min(current, getInitialTurnStart(previousModelRef.current.turnCount)));
  }, [messages.length, sessionId]);

  return {
    turnWindowModel: previousModelRef.current,
    turnStart,
    setTurnStart,
  };
}
```

Adjust imports and return values to match current `windowTurns.ts` exports. Do not rewrite the turn window algorithm.

- [ ] **Step 2a: Write failing unit tests for turn window pure utilities**

The turn window extraction depends on the pure helpers `buildTurnWindowModel`, `updateTurnWindowModelIncremental`, and `getInitialTurnStart` in `packages/ui/src/components/chat/lib/turns/windowTurns.ts`. The spec's Verification Strategy (line 296) requires unit tests for any timeline projection utility that creates a pure seam. Before extracting `useTurnWindow`, write the missing tests.

Create `packages/ui/src/components/chat/lib/turns/windowTurns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ChatMessageEntry } from './types';
import {
  buildTurnWindowModel,
  getInitialTurnStart,
  updateTurnWindowModelIncremental,
} from './windowTurns';

const makeMessage = (id: string): ChatMessageEntry => ({
  info: { id, role: 'user', sessionID: 'sess-1', time: { created: 0 } } as any,
  parts: [],
} as any);

describe('buildTurnWindowModel', () => {
  it('returns zero turns for empty messages', () => {
    const model = buildTurnWindowModel([]);
    expect(model.turnCount).toBe(0);
  });

  it('counts one turn per user message', () => {
    const model = buildTurnWindowModel([makeMessage('m1'), makeMessage('m2')]);
    expect(model.turnCount).toBe(2);
  });
});

describe('updateTurnWindowModelIncremental', () => {
  it('returns null when nothing changed', () => {
    const initial = buildTurnWindowModel([makeMessage('m1')]);
    const result = updateTurnWindowModelIncremental(initial, [makeMessage('m1')], [makeMessage('m1')]);
    expect(result).toBeNull();
  });

  it('returns new model when a turn was appended', () => {
    const initial = buildTurnWindowModel([makeMessage('m1')]);
    const result = updateTurnWindowModelIncremental(initial, [makeMessage('m1')], [makeMessage('m1'), makeMessage('m2')]);
    expect(result?.turnCount).toBe(2);
  });
});

describe('getInitialTurnStart', () => {
  it('clamps negative input to zero', () => {
    expect(getInitialTurnStart(5)).toBe(0);
  });

  it('returns turn count - 1 when there is at least one turn', () => {
    expect(getInitialTurnStart(0)).toBe(0);
    expect(getInitialTurnStart(3)).toBe(2);
  });
});
```

Adjust the exact message shape (`info.role`, `info.sessionID`, `info.time`) to match the existing `ChatMessageEntry` type. Run:

```bash
bun test packages/ui/src/components/chat/lib/turns/windowTurns.test.ts
```

Expected: tests pass against the existing implementations. (If any test fails, the existing helper has a different shape than assumed — fix the test, not the helper. The goal is to characterize existing behavior, not to fix latent bugs.)

- [ ] **Step 3: Wire `useChatTimelineController` through `useTurnWindow`**

Replace inline turn window state with `const turnWindow = useTurnWindow({ sessionId, messages });`. Keep all scroll intent and older history code in `useChatTimelineController.ts` for this task.

- [ ] **Step 4: Run type-check and manual scroll verification**

Run:

```bash
bun run --cwd packages/ui type-check
```

Expected: type-check passes.

Manual checks: load older, reveal buffered turns, jump to bottom, hash target.

- [ ] **Step 5: Checkpoint**

```bash
git add packages/ui/src/components/chat/hooks/useChatTimelineController.ts packages/ui/src/components/chat/timeline/useTurnWindow.ts packages/ui/src/components/chat/state/useChatTimelineState.ts packages/ui/src/components/chat/state/index.ts
git commit -m "refactor(chat): extract turn window timeline state"
```

Expected: commit succeeds if commits are allowed.

---

### Task 11: Extract Message List Local UI And Animation State

**Files:**
- Create: `packages/ui/src/components/chat/message-list/useMessageEntryUiState.ts`
- Create: `packages/ui/src/components/chat/message-list/useMessageAnimationState.ts`
- Create: `packages/ui/src/components/chat/message-list/LoadOlderBoundary.tsx`
- Create: `packages/ui/src/components/chat/message-list/MessageListEntries.tsx`
- Modify: `packages/ui/src/components/chat/VirtualizedMessageList.tsx`

- [ ] **Step 1: Extract turn UI state hook**

Create `useMessageEntryUiState.ts`:

```ts
import React from 'react';
import type { TurnUiState } from './TurnBlock';

export function useMessageEntryUiState(resetKey: string) {
  const [turnUiStates, setTurnUiStates] = React.useState<Map<string, TurnUiState>>(() => new Map());

  React.useEffect(() => {
    setTurnUiStates(new Map());
  }, [resetKey]);

  const toggleTurnGroup = React.useCallback((turnId: string) => {
    setTurnUiStates((current) => {
      const next = new Map(current);
      const previous = next.get(turnId);
      next.set(turnId, { ...previous, collapsed: !previous?.collapsed });
      return next;
    });
  }, []);

  return { turnUiStates, toggleTurnGroup };
}
```

`TurnUiState` currently lives in `message-list/TurnBlock.tsx`; the extensionless `./TurnBlock` import intentionally matches the existing `MessageListEntry.tsx` import style and project TypeScript resolution. Import that existing type rather than inventing a new `message-list/types.ts` file for this task.

- [ ] **Step 2: Extract user animation hook**

Create `useMessageAnimationState.ts` by moving the existing `userAnimationRef`, `shouldAnimateUserMessage`, and `onUserAnimationConsumed` logic from `VirtualizedMessageList.tsx` without changing conditions.

Use this public shape:

```ts
import React from 'react';

export function useMessageAnimationState(sessionKey: string) {
  const userAnimationRef = React.useRef({
    sessionKey,
    previousUserMessageOrder: [] as string[],
    animatedIds: new Set<string>(),
  });

  if (userAnimationRef.current.sessionKey !== sessionKey) {
    userAnimationRef.current = {
      sessionKey,
      previousUserMessageOrder: [],
      animatedIds: new Set<string>(),
    };
  }

  const shouldAnimateUserMessage = React.useCallback((messageId: string) => {
    return !userAnimationRef.current.animatedIds.has(messageId);
  }, []);

  const onUserAnimationConsumed = React.useCallback((messageId: string) => {
    userAnimationRef.current.animatedIds.add(messageId);
  }, []);

  return { shouldAnimateUserMessage, onUserAnimationConsumed, userAnimationRef };
}
```

Replace the simplified conditions with exact existing logic from `VirtualizedMessageList.tsx` before wiring.

- [ ] **Step 3: Extract load older boundary**

Create `LoadOlderBoundary.tsx` and move the `LoadOlderButton` rendering block from `VirtualizedMessageList.tsx`.

- [ ] **Step 4: Extract row rendering wrapper**

Create `MessageListEntries.tsx` and move the `renderEntry` mapping code. Keep virtualizer setup in `VirtualizedMessageList.tsx`.

- [ ] **Step 5: Wire `VirtualizedMessageList.tsx` through extracted hooks/components**

Replace inline local state and render blocks with the extracted hooks/components. Keep `useVirtualizedChatEntries`, `useChatScrollManager`, and `useViewportAnchor` calls in `VirtualizedMessageList.tsx`.

- [ ] **Step 6: Run type-check and lint**

Run:

```bash
bun run --cwd packages/ui type-check
bun run --cwd packages/ui lint
```

Expected: both pass.

- [ ] **Step 7: Manual hot-path verification**

Verify streaming response, user message animation, activity render mode toggle, sticky user header toggle, load older, session switch, and mobile keyboard scroll anchoring.

- [ ] **Step 8: Checkpoint**

```bash
git add packages/ui/src/components/chat/VirtualizedMessageList.tsx packages/ui/src/components/chat/message-list
git commit -m "refactor(chat): split message list local state"
```

Expected: commit succeeds if commits are allowed.

---

### Task 12: Final Verification And Boundary Audit

**Files:**
- Audit: `packages/ui/src/components/chat/**`
- Update if needed: `.superpawers/specs/2026-05-28-chat-adapter-modularization-design.md`

- [ ] **Step 1: Search for broad store imports in render components**

Run:

```bash
rg "from ['\"]@/(stores|sync)/|from ['\"]@/stores|from ['\"]@/sync" packages/ui/src/components/chat
```

Expected: broad store imports remain only in adapter hooks or temporarily approved domain controller hooks. If a render component still imports a broad store and an adapter exists for that state, migrate that read to the adapter.

- [ ] **Step 2: Search for duplicated stable event helpers**

Run:

```bash
rg "function useStableEvent|const useStableEvent" packages/ui/src/components/chat
```

Expected: one local helper remains only if it is intentionally scoped. If duplicates remain in hot paths, consolidate in the narrowest shared location without widening imports.

- [ ] **Step 3: Run focused tests**

Run:

```bash
bun test packages/ui/src/components/chat/chat-input/
bun test packages/ui/src/components/chat/timeline/
bun test packages/ui/src/components/chat/message-list/
```

Expected: all existing test paths that exist pass. If a directory has no tests, Bun may report no tests; do not create empty tests just to satisfy the command.

- [ ] **Step 4: Run full required verification**

Run:

```bash
bun run type-check
bun run lint
```

Expected: both pass.

- [ ] **Step 5: Manual verification**

Run the full manual checklist from the Verification Baseline section. Record any residual risk in the final implementation summary.

- [ ] **Step 6: Final checkpoint**

```bash
git status --short
git diff --stat
```

Expected: only intended chat adapter/modularization files remain changed. If commits are allowed and all verification passed:

```bash
git add packages/ui/src/components/chat .superpawers/specs .superpawers/plans
git commit -m "refactor(chat): modularize chat adapter boundary"
```

Expected: commit succeeds if commits are allowed and `.superpawers` docs are force-added or already tracked as desired by the user.

---

## Execution Notes

Use `subagent-driven-development` for implementation. Recommended agent task boundaries match this plan's tasks exactly. Do not start timeline or message-list extraction before Tasks 1 through 4 pass, because the adapter boundary lowers the risk of later moves.

Never run `git add packages/web/`, `git add .`, or any revert/restore command against `packages/web/server/lib/opencode/runtime.js` or `packages/web/server/lib/opencode/runtime.test.js` during this plan. Those files are pre-existing dirty server runtime work and are outside the chat adapter scope.

If a task uncovers a behavior bug, stop that task after writing a failing focused test or a precise manual reproduction note. Do not fold speculative bug fixes into structural extraction commits.
