# Chat Adapter Boundary And Modularization — Design Spec

**Status:** Draft  
**Date:** 2026-05-28  
**Parent program:** Radical Architecture Refactor  
**Scope:** `packages/ui/src/components/chat/**` plus narrow chat-facing adapter hooks over existing sync/store state  
**Out of scope:** Final session state machine implementation, broad store deletion, API contract changes, visual redesign

## Problem Statement

The chat view is difficult to debug because rendering, behavior, sync state, composer state, scroll state, and session lifecycle state are interleaved across large files and broad stores.

Current pain points:

- `ChatInput` still owns draft state, submit orchestration, slash commands, attachments, drag/drop, paste handling, autocomplete, linked issue/PR context, mobile controls, and rendering.
- Timeline behavior is hard to isolate because turn windowing, older-history loading, hash navigation, scroll intent, anchor restore, and render waiters live in one dense controller.
- `VirtualizedMessageList` combines virtualizer setup, entry projection, local turn UI state, user-message animation bookkeeping, and load-older wiring.
- Chat components read directly from sync stores, UI stores, input stores, selection stores, and component-local refs.
- The future session state machine has no safe landing zone while chat components consume current stores directly.

## Goals

- Create a chat adapter boundary that exposes explicit session, message, activity, interruption, composer, selection, and timeline state.
- Modularize chat by responsibility while preserving current behavior.
- Make `ChatInput`, `SessionMount`, `VirtualizedMessageList`, and `useChatTimelineController` easier to inspect and test.
- Move risky parsing/projection behavior into pure utilities with tests.
- Prepare chat for a later session state machine by keeping component-facing APIs stable while internals remain backed by existing stores.
- Preserve behavior across web, Electron, VS Code, and mobile/PWA layouts.

## Non-Goals

- Do not implement the final session state machine in this phase.
- Do not delete `useUIStore`, sync stores, or broad stores in this phase.
- Do not introduce a new data-fetching dependency or query framework.
- Do not redesign the chat UI beyond preserving extracted markup.
- Do not change HTTP/SSE/OpenCode SDK contracts.

## Architecture

The refactor introduces a chat-facing adapter layer first:

```text
OpenCode/SSE/sync stores/current UI stores
  -> chat/state adapter hooks
    -> chat domain controller hooks
      -> focused render components
```

The adapter layer initially wraps existing state sources. Later, the session state machine can replace those internals without rewriting chat rendering components.

## Target File Structure

```text
packages/ui/src/components/chat/
  ChatContainer.tsx
  session-shell/
    ChatSessionView.tsx
    SessionMount.tsx
    ChatViewport.tsx
    useChatSessionShell.ts
    useChatSessionData.ts
    useChatSessionLifecycle.ts

  state/
    useChatSessionState.ts
    useChatMessages.ts
    useChatActivity.ts
    useChatInterruptions.ts
    useChatComposerState.ts
    useChatComposerActions.ts
    useChatSelection.ts
    useChatTimelineState.ts
    types.ts

  composer/
    ChatComposer.tsx
    ComposerTextarea.tsx
    ComposerAutocompleteLayer.tsx
    ComposerAttachmentTray.tsx
    ComposerFooter.tsx
    ComposerMobileControls.tsx
    useComposerDraft.ts
    useComposerSubmit.ts
    useComposerAttachments.ts
    useComposerAutocomplete.ts
    useComposerHistory.ts
    useComposerKeyboard.ts
    useComposerLinkedContext.ts
    lib/
      autocompleteUtils.ts
      composerSubmit.ts
      draftStorage.ts
      fileDropUtils.ts
      mentionUtils.ts
      slashCommandUtils.ts

  timeline/
    useChatTimelineController.ts
    useTurnWindow.ts
    useOlderHistoryLoader.ts
    useScrollIntent.ts
    useViewportAnchorRestore.ts
    useHashNavigation.ts
    types.ts

  message-list/
    VirtualizedMessageList.tsx
    MessageListEntries.tsx
    LoadOlderBoundary.tsx
    useVirtualizedChatEntries.ts
    useMessageEntryUiState.ts
    useMessageAnimationState.ts

  message/
    existing message and part renderers
```

The exact directory names may follow nearby precedent during implementation. The boundary rules matter more than final names.

## Chat State Adapter Layer

`chat/state` is the component-facing API for chat state. It hides where state currently comes from and provides stable return shapes for chat domains.

Initial hooks:

- `useChatSessionState(sessionId)`
- `useChatMessages(sessionId)`
- `useChatActivity(sessionId)`
- `useChatInterruptions(sessionId)`
- `useChatComposerState(sessionId)`
- `useChatComposerActions(sessionId)`
- `useChatSelection(sessionId)`
- `useChatTimelineState(sessionId)`

Adapter rules:

- Chat render components do not import broad stores directly.
- Broad store reads are allowed inside `chat/state` adapters and, temporarily, inside existing domain controller hooks while migration is in progress.
- Adapter hooks expose chat concepts, not store implementation details.
- Adapter hooks use narrow selectors and stable return values where practical.
- Adapters do not invent new persisted state. They read existing state and compose it for chat consumers.
- Values expected to come from the future session machine should be named as domain concepts now.

Example concepts:

```ts
interface ChatSessionState {
  sessionId: string | null;
  loaded: boolean;
  exists: boolean;
  isActive: boolean;
  parentSessionId: string | null;
  projectId: string | null;
}

interface ChatActivityState {
  isStreaming: boolean;
  isAborting: boolean;
  showAbortStatus: boolean;
  retryMessage: string | null;
  needsAttention: boolean;
}

interface ChatComposerState {
  text: string;
  attachedFiles: AttachedFile[];
  pendingInputText: string | null;
  canSubmit: boolean;
  canQueue: boolean;
  isExpanded: boolean;
  isMobile: boolean;
}
```

Concrete implementation should replace these illustrative shapes with existing project types before code is written.

## Composer Modularization

Target responsibility split:

- `ChatInput` or `ChatComposer` becomes a thin composition shell.
- `ComposerTextarea` owns textarea rendering and immediate input events.
- `ComposerAutocompleteLayer` owns command/file/agent/skill autocomplete rendering.
- `ComposerAttachmentTray` owns attached file display and removal.
- `ComposerFooter` owns send/queue/abort, attach controls, auto-accept, focus mode, model/agent controls, and mobile-specific footer placement.
- `ComposerMobileControls` owns mobile-only controls and drawers.

Behavior hooks:

- `useComposerDraft`: draft text, cursor, confirmed mentions, draft persistence.
- `useComposerSubmit`: submit orchestration, payload building, queue behavior, failure restoration.
- `useComposerAttachments`: attach/remove files, paste/drop handling, Tauri/VS Code path normalization.
- `useComposerAutocomplete`: autocomplete query state and selected tab behavior.
- `useComposerHistory`: previous-message navigation.
- `useComposerKeyboard`: enter/shift-enter/escape/composition handling.
- `useComposerLinkedContext`: issue/PR/worktree linked context for sends.

Pure utilities live under `composer/lib` and must be tested when behavior is non-trivial.

## Session Shell Modularization

Clear roles:

- `ChatContainer`: selects current/draft/empty session route and renders the right shell.
- `SessionMount`: bridges mount-pool visibility, lifecycle hooks, and per-session controllers.
- `ChatSessionView`: renders loaded/loading/empty/session states for a single session.
- `ChatViewport`: owns scroll container layout and overlay placement.
- `VirtualizedMessageList`: renders the list only.

Session shell code may use adapter hooks and timeline controllers. It should not contain composer-specific behavior or message part rendering logic.

## Timeline Modularization

`useChatTimelineController` becomes an orchestrator over narrower hooks:

- `useTurnWindow`: turn start, visible turn window, buffered turn reveal.
- `useOlderHistoryLoader`: `loadEarlier`, older history fetch, loading state.
- `useScrollIntent`: user scroll state, autoscroll intent, pending scroll requests.
- `useViewportAnchorRestore`: anchor capture/restore around prepends and reveal operations.
- `useHashNavigation`: scroll-to-turn and scroll-to-message from URL/hash state.

Extraction should preserve algorithms first. Algorithm changes require tests or explicit follow-up tasks.

## Message List Modularization

`VirtualizedMessageList` should become mostly virtualizer wiring plus delegation.

Extract:

- `useVirtualizedChatEntries`: message/turn projection for the list.
- `useMessageEntryUiState`: local expanded/collapsed turn UI state.
- `useMessageAnimationState`: user-message animation bookkeeping.
- `LoadOlderBoundary`: render and invoke load-older behavior.
- `MessageListEntries`: maps virtual items to renderers.

Hot-path constraints:

- Avoid broad store subscriptions inside per-entry renderers.
- Avoid rebuilding large maps/arrays on unrelated state changes.
- Preserve mobile scroll and keyboard behavior.

## Boundary Rules

- Adapters are the approved broad-store boundary for chat state.
- Rendering components should not own domain workflows.
- Controller hooks should not return JSX.
- Pure utilities should not read stores.
- Session-machine-shaped names should be introduced now.
- File moves and extraction PRs should preserve DOM structure and behavior unless a task explicitly says otherwise.

## Implementation Phases

### Phase 2.1: Stabilize Current Extraction

- Validate the existing uncommitted chat extraction.
- Ensure new composer utility tests compile and pass.
- Fix import paths and type errors before additional restructuring.
- Commit a checkpoint before deeper modularization.

### Phase 2.2: Introduce Chat State Adapters

- Add `chat/state` adapter hooks wrapping current stores/sync modules.
- Move read composition first; do not alter behavior.
- Migrate session shell and composer to consume adapters where practical.

### Phase 2.3: Finish Composer Split

- Extract composer rendering components.
- Extract remaining behavior hooks.
- Move slash command, linked context, paste/drop, and mention parsing into tested utilities.

### Phase 2.4: Split Session Shell And Viewport Roles

- Make `ChatContainer`, `SessionMount`, `ChatSessionView`, and `ChatViewport` roles explicit.
- Remove duplicated loading/empty/session wrapper responsibilities.

### Phase 2.5: Split Timeline Controller

- Extract turn window, older history, scroll intent, anchor restore, and hash navigation hooks.
- Preserve existing scroll behavior first; optimize later only with evidence.

### Phase 2.6: Split Message List Hot Path

- Extract entry UI state and animation state.
- Keep virtualizer wiring focused.
- Validate streaming, load older, session switching, and mobile keyboard behavior.

## Verification Strategy

Required automated verification:

- `bun run type-check`
- `bun run lint`
- Unit tests for pure composer utilities.
- Unit tests for timeline projection utilities where extraction creates pure seams.

Required manual verification:

- Start a new chat session and stream a response.
- Switch sessions during streaming.
- Abort an active response.
- Queue a message if queue behavior is available.
- Attach files using picker and drag/drop.
- Use inline file mentions and agent mentions.
- Trigger slash commands.
- Load older history.
- Navigate by message/turn hash if available.
- Verify desktop and mobile layouts, including soft-keyboard behavior.
- Verify shared UI behavior in web, Electron, and VS Code where practical.

## Success Criteria

- Chat has a documented state boundary in `chat/state`.
- Chat components use adapter hooks for session/message/activity/composer state instead of reaching directly into broad stores.
- `ChatInput` is reduced to a composer shell and no longer owns all composer workflows inline.
- `useChatTimelineController` is an orchestrator over narrower timeline hooks.
- `VirtualizedMessageList` delegates projection, local UI state, and animation bookkeeping.
- Pure composer and timeline utilities have tests for non-trivial behavior.
- No user-visible behavior changes are introduced without explicit follow-up tasks.
- The later session state machine can replace adapter internals without another full chat component rewrite.
