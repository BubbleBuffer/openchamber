# Test and Benchmark Catch-Up Plan 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React DOM coverage for the deferred critical chat message/list surfaces: `ChatMessage`, `MessageListEntry`/`MessageListEntries`, and `VirtualizedMessageList`.

**Architecture:** Add focused `tests/react/*.test.tsx` files that mirror the existing `chat-input`, `chat-session-view`, and `chat-view` test patterns. Mock process boundaries and heavy child components; do not change production code. `SessionSidebar` is explicitly deferred to a later Plan 2B because it requires a dedicated shared mock helper and is too coupled for this slice.

**Tech Stack:** `vitest`, `happy-dom`, `@testing-library/react`, existing `tests/react/helpers/*`, `vi.mock`, React component testing.

---

## File Structure

- Create: `tests/react/chat-message.test.tsx` — load-bearing render paths for `ChatMessage` with mocked child components and stores.
- Create: `tests/react/message-list-entries.test.tsx` — routing/mapping tests for `MessageListEntry` and `MessageListEntries`.
- Create: `tests/react/virtualized-message-list.test.tsx` — virtualization-boundary tests with mocked virtualizer and scroll hooks.
- Possibly create: `tests/react/helpers/chatMessageMocks.tsx` — only if mocks are shared by both `chat-message.test.tsx` and `message-list-entries.test.tsx`. Do not create it if duplication stays small.

## Deferred To Plan 2B

`SessionSidebar` is not included in this plan. Research found it is 1400+ lines, imports 12+ stores, 15+ custom hooks, and many dialog/child components. It should get a dedicated plan with `tests/react/helpers/sessionSidebarMocks.tsx` rather than bloating this slice.

---

### Task 1: Add `ChatMessage` Render Coverage

**Files:**
- Create: `tests/react/chat-message.test.tsx`.
- Read: `packages/ui/src/components/chat/ChatMessage.tsx`.
- Read: `tests/react/chat-input.test.tsx`, `tests/react/chat-session-view.test.tsx`, `tests/react/helpers/render.tsx`, `tests/react/helpers/stores.ts`.

- [ ] **Step 1: Write failing tests**

Create `tests/react/chat-message.test.tsx` using this target-state sketch:

```tsx
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithApp } from "./helpers/render";

const deviceState = vi.hoisted(() => ({ isMobile: false, hasTouchInput: false }));

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => deviceState,
}));

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({
    currentTheme: { id: "test", mode: "dark", metadata: { variant: "dark" } },
  }),
}));

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: any) =>
    selector({
      currentSessionId: "session-1",
      setActivePart: vi.fn(),
      activePart: null,
    }),
}));

vi.mock("@/sync/selection-store", () => ({
  useSelectionStore: (selector: any) => selector({ selectedParts: {}, togglePartSelection: vi.fn() }),
}));

vi.mock("@/sync/session-actions", () => ({
  sessionActions: {
    setActivePart: vi.fn(),
  },
}));

vi.mock("@/stores/config/useProviderConfigStore", () => ({
  useProviderConfigStore: { getState: () => ({ providers: [] }) },
}));

vi.mock("@/stores/useFeatureFlagsStore", () => ({
  useFeatureFlagsStore: (selector: any) => selector({ planModeEnabled: false }),
}));

vi.mock("@/stores/contextStore", () => ({
  useContextStore: (selector: any) => selector({ selectedProviderId: null, selectedModelId: null }),
}));

vi.mock("@/stores/useDialogStore", () => ({
  useDialogStore: (selector: any) => selector({ openToolOutputDialog: vi.fn() }),
}));

vi.mock("@/components/chat/message/MessageHeader", () => ({
  default: (props: any) => <div data-testid="message-header">{props.agentName ?? "header"}</div>,
}));

vi.mock("@/components/chat/message/MessageBody", () => ({
  default: (props: any) => <div data-testid="message-body">{props.parts?.map((part: any) => part.text ?? part.type).join(" ")}</div>,
}));

vi.mock("@/components/chat/message/ToolOutputDialog", () => ({
  default: () => <div data-testid="tool-output-dialog" />,
}));

import ChatMessage from "@/components/chat/ChatMessage";

function buildMessageInfo(overrides: Partial<any> = {}) {
  return {
    id: "msg-1",
    role: "assistant",
    time: { created: Date.now() },
    sessionID: "session-1",
    ...overrides,
  };
}

function buildParts(text = "hello from assistant") {
  return [{ id: "part-1", type: "text", text }];
}

function buildMessage(overrides: Partial<any> = {}) {
  const { parts = buildParts(), ...infoOverrides } = overrides;
  return { info: buildMessageInfo(infoOverrides), parts };
}

describe("ChatMessage", () => {
  it("renders assistant message body and header", () => {
    renderWithApp(<ChatMessage message={buildMessage()} />);
    expect(screen.getByTestId("message-header")).toBeTruthy();
    expect(screen.getByTestId("message-body")).toHaveTextContent("hello from assistant");
  });

  it("renders user message text", () => {
    const message = buildMessage({ role: "user", parts: buildParts("user prompt") });
    renderWithApp(<ChatMessage message={message} />);
    expect(screen.getByTestId("message-body")).toHaveTextContent("user prompt");
  });

  it("does not render an empty hidden user message", () => {
    const message = buildMessage({ role: "user", parts: [] });
    const { container } = renderWithApp(<ChatMessage message={message} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders assistant error information", () => {
    const message = buildMessage({ error: { data: { message: "API error" } } });
    renderWithApp(<ChatMessage message={message} />);
    expect(screen.getByText(/API error/)).toBeTruthy();
  });

  it("uses previous user metadata for header context", () => {
    const previousMessage = buildMessage({ role: "user", mode: "build", providerID: "anthropic", modelID: "claude" });
    renderWithApp(<ChatMessage message={buildMessage()} previousMessage={previousMessage} />);
    expect(screen.getByTestId("message-header")).toBeTruthy();
  });

  it("renders under mobile device info", () => {
    deviceState.isMobile = true;
    deviceState.hasTouchInput = true;
    renderWithApp(<ChatMessage message={buildMessage()} />);
    expect(screen.getByTestId("message-body")).toHaveTextContent("hello from assistant");
  });
});
```

Notes:
- `ChatMessage` is a default export and expects `message={{ info, parts }}`; do not pass a separate `parts` prop.
- The exact `Message`/`Part` fields may need minor adjustment after reading `packages/ui/src/components/chat/ChatMessage.tsx`; keep the `message={{ info, parts }}` shape.
- Keep child mocks minimal; this test is for `ChatMessage` branching, not `MessageBody` internals.
- If `toHaveTextContent` / `toBeEmptyDOMElement` matchers are unavailable, replace with `textContent` / `childElementCount` assertions used in nearby tests.

- [ ] **Step 2: Run test to verify it fails for missing coverage / signature mismatch**

Run: `bun run --cwd tests vitest run react/chat-message.test.tsx --config react/vitest.config.ts`

Expected: initially FAIL until imports, props, and mocks match actual source.

- [ ] **Step 3: Adjust mocks to actual source anchors**

Read `ChatMessage.tsx` imports around these anchors and update mocks to match exact module specifiers:

- `@/lib/device`
- `@/contexts/useThemeSystem`
- `@/sync/session-ui-store`
- `@/sync/selection-store`
- `@/sync/session-actions`
- `@/stores/config/useProviderConfigStore`
- `@/stores/useFeatureFlagsStore`
- `@/stores/useUIStore` (read and leave real unless it blocks the test)
- `@/stores/contextStore`
- `@/stores/useDialogStore`
- `./message/MessageHeader`
- `./message/MessageBody`
- lazy `./message/ToolOutputDialog`

Do not change production code.

- [ ] **Step 4: Verify ChatMessage test passes**

Run: `bun run --cwd tests vitest run react/chat-message.test.tsx --config react/vitest.config.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/react/chat-message.test.tsx tests/react/helpers/chatMessageMocks.tsx
git commit -m "test(react): cover ChatMessage render states"
```

Only include `tests/react/helpers/chatMessageMocks.tsx` if it was created.

---

### Task 2: Add Message List Entry Coverage

**Files:**
- Create: `tests/react/message-list-entries.test.tsx`.
- Read: `packages/ui/src/components/chat/message-list/MessageListEntry.tsx`.
- Read: `packages/ui/src/components/chat/message-list/MessageListEntries.tsx`.

- [ ] **Step 1: Write failing tests**

Create `tests/react/message-list-entries.test.tsx` using this target-state sketch:

```tsx
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithApp } from "./helpers/render";

vi.mock("@/components/chat/message-list/MessageListEntry", () => ({
  MessageListEntry: (props: any) => (
    <div
      data-testid="message-list-entry"
      data-kind={props.entry.kind}
      data-streaming={props.activeStreamingMessageId ? "true" : "false"}
    >
      {props.entry.key}
    </div>
  ),
}));

import { MessageListEntries } from "@/components/chat/message-list/MessageListEntries";

function ungroupedEntry(id: string) {
  return { key: id, kind: "ungrouped", message: { info: { id, role: "assistant" }, parts: [] } } as any;
}

function turnEntry(id: string) {
  return { key: id, kind: "turn", turn: { id, messages: [] }, isLastTurn: false } as any;
}

function renderEntries(overrides: Partial<any> = {}) {
  return renderWithApp(
    <MessageListEntries
      turnUiStates={new Map()}
      toggleTurnGroup={vi.fn()}
      defaultActivityExpanded={false}
      chatRenderMode="live"
      sessionIsWorking={false}
      stickyUserHeader={false}
      shouldAnimateUserMessage={() => false}
      onUserAnimationConsumed={vi.fn()}
      activeStreamingMessageId={null}
      activeStreamingPhase={null}
      getAnimationHandlers={() => ({}) as any}
      onMessageContentChange={vi.fn()}
      entries={[]}
      trailingStreamingEntry={null}
      {...overrides}
    />,
  );
}

describe("MessageListEntries", () => {
  it("renders ungrouped entries", () => {
    renderEntries({ entries: [ungroupedEntry("entry-1")] });
    expect(screen.getByTestId("message-list-entry")).toHaveAttribute("data-kind", "ungrouped");
  });

  it("renders turn entries", () => {
    renderEntries({ entries: [turnEntry("turn-1")] });
    expect(screen.getByTestId("message-list-entry")).toHaveAttribute("data-kind", "turn");
  });

  it("preserves mixed entry order", () => {
    renderEntries({ entries: [ungroupedEntry("entry-1"), turnEntry("turn-1")] });
    expect(screen.getAllByTestId("message-list-entry").map((node) => node.textContent)).toEqual(["entry-1", "turn-1"]);
  });

  it("marks the trailing streaming entry", () => {
    const entry = ungroupedEntry("entry-1");
    renderEntries({ entries: [entry], trailingStreamingEntry: entry, activeStreamingMessageId: "msg-1", sessionIsWorking: true });
    expect(screen.getByTestId("message-list-entry")).toHaveAttribute("data-streaming", "true");
  });
});
```

Notes:
- `MessageListEntries` requires the full prop surface from `MessageListEntriesProps`; keep the `renderEntries` helper so tests only override the specific props under test.
- The exact `RenderEntry` shape must match `MessageListEntry.tsx`; factories should include `key`, `kind`, and the branch-specific fields (`message` for ungrouped, `turn` and `isLastTurn` for turn entries).
- This test intentionally mocks `MessageListEntry` so `MessageListEntries` mapping logic is isolated.
- If direct `MessageListEntry` coverage is easy, add 2 tests in the same file that mock `UngroupedMessageRow` and `TurnBlock` and assert `entry.kind` routes correctly.

- [ ] **Step 2: Run test to verify it fails for missing coverage / signature mismatch**

Run: `bun run --cwd tests vitest run react/message-list-entries.test.tsx --config react/vitest.config.ts`

Expected: initially FAIL until props and entry factories match actual source.

- [ ] **Step 3: Adjust to source signatures**

Read anchors:
- `function MessageListEntries` in `MessageListEntries.tsx`
- `function MessageListEntry` in `MessageListEntry.tsx`
- `entry.kind === "ungrouped"` and `entry.kind === "turn"` branches

Adjust factories and props only; do not touch production code.

- [ ] **Step 4: Verify MessageListEntries test passes**

Run: `bun run --cwd tests vitest run react/message-list-entries.test.tsx --config react/vitest.config.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/react/message-list-entries.test.tsx
git commit -m "test(react): cover message list entry mapping"
```

---

### Task 3: Add Virtualized Message List Coverage

**Files:**
- Create: `tests/react/virtualized-message-list.test.tsx`.
- Read: `packages/ui/src/components/chat/VirtualizedMessageList.tsx`.
- Read: `tests/react/helpers/browser.ts`, `tests/react/helpers/render.tsx`.

- [ ] **Step 1: Write failing tests**

Create `tests/react/virtualized-message-list.test.tsx` using this target-state sketch:

```tsx
import React, { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithApp } from "./helpers/render";

const virtualizerState = vi.hoisted(() => ({ count: 0 }));
const scrollToIndex = vi.hoisted(() => vi.fn());
const entriesState = vi.hoisted(() => ({ entries: [] as any[], trailingStreamingEntry: null as any }));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: any) => {
    virtualizerState.count = options.count;
    return {
      getVirtualItems: () =>
        Array.from({ length: options.count }, (_, index) => ({
          index,
          key: index,
          start: index * 40,
          size: 40,
        })),
      getTotalSize: () => options.count * 40,
      measureElement: vi.fn(),
      scrollToIndex,
      scrollToOffset: vi.fn(),
    };
  },
}));

vi.mock("@/components/chat/hooks/useChatScrollManager", () => ({
  useChatScrollManager: () => ({
    isAtBottom: true,
    scrollToBottom: vi.fn(),
    shouldAutoScroll: true,
  }),
}));

vi.mock("@/components/chat/hooks/useViewportAnchor", () => ({
  useViewportAnchor: () => ({ captureViewportAnchor: vi.fn(), restoreViewportAnchor: vi.fn() }),
}));

vi.mock("@/components/chat/hooks/useVirtualizedChatEntries", () => ({
  useVirtualizedChatEntries: () => ({
    allEntries: entriesState.entries,
    trailingStreamingEntry: entriesState.trailingStreamingEntry,
    messageIndexMap: new Map(entriesState.entries.map((entry, index) => [entry.message?.info?.id, index]).filter(([id]) => id)),
  }),
}));

vi.mock("@/components/chat/message-list/useMessageEntryUiState", () => ({
  useMessageEntryUiState: () => ({ turnUiStates: new Map(), toggleTurnGroup: vi.fn() }),
}));

vi.mock("@/components/chat/message-list/useMessageAnimationState", () => ({
  useMessageAnimationState: () => ({ shouldAnimateUserMessage: () => false, onUserAnimationConsumed: vi.fn() }),
}));

vi.mock("@/components/chat/message-list/MessageListEntry", () => ({
  MessageListEntry: (props: any) => <div data-testid="virtual-entry">{props.entry.key}</div>,
}));

vi.mock("@/components/chat/message-list/LoadOlderBoundary", () => ({
  LoadOlderBoundary: (props: any) => <div data-testid="load-older" data-has-more={String(props.hasMoreAbove)} />,
}));

vi.mock("@/components/chat/message/FadeInOnReveal", () => ({
  FadeInDisabledProvider: ({ children }: any) => <>{children}</>,
}));

import VirtualizedMessageList from "@/components/chat/VirtualizedMessageList";

function entry(id: string) {
  return { key: id, kind: "ungrouped", message: { info: { id, role: "assistant" }, parts: [] } } as any;
}

function message(id: string) {
  return { info: { id, role: "assistant" }, parts: [] } as any;
}

function renderVirtualizedList(overrides: Partial<any> = {}) {
  const { entries = [entry("one")], trailingStreamingEntry = null, ref, ...componentOverrides } = overrides;
  entriesState.entries = entries;
  entriesState.trailingStreamingEntry = trailingStreamingEntry;
  const scrollRef = React.createRef<HTMLDivElement>();
  return renderWithApp(
    <VirtualizedMessageList
      ref={ref}
      sessionKey="session-1"
      turnStart={0}
      messages={entries.map((item: any) => message(item.message?.info?.id ?? item.key))}
      sessionIsWorking={false}
      activeStreamingMessageId={null}
      activeStreamingPhase={null}
      onMessageContentChange={vi.fn()}
      getAnimationHandlers={() => ({}) as any}
      hasMoreAbove={false}
      isLoadingOlder={false}
      onLoadOlder={vi.fn()}
      scrollRef={scrollRef}
      {...componentOverrides}
    />,
  );
}

describe("VirtualizedMessageList", () => {
  it("renders entries returned by the virtualizer", () => {
    renderVirtualizedList({ entries: [entry("one"), entry("two")] });
    expect(screen.getAllByTestId("virtual-entry").map((node) => node.textContent)).toEqual(["one", "two"]);
  });

  it("shows load older boundary when there are older messages", () => {
    renderVirtualizedList({ entries: [entry("one")], hasMoreAbove: true, isLoadingOlder: false });
    expect(screen.getByTestId("load-older")).toHaveAttribute("data-has-more", "true");
  });

  it("exposes imperative scroll handle", () => {
    const ref = createRef<any>();
    renderVirtualizedList({ ref, entries: [entry("one")] });
    expect(ref.current).toBeTruthy();
    ref.current.scrollToMessageId?.("one");
    expect(scrollToIndex).toHaveBeenCalled();
  });

  it("passes streaming state to the rendered entry", () => {
    const streamingEntry = entry("one");
    renderVirtualizedList({ entries: [streamingEntry], trailingStreamingEntry: streamingEntry, activeStreamingMessageId: "one", sessionIsWorking: true });
    expect(screen.getByTestId("virtual-entry")).toBeTruthy();
  });
});
```

Notes:
- `VirtualizedMessageList` is a default export and expects `messages`, `sessionKey`, `turnStart`, `onMessageContentChange`, `getAnimationHandlers`, `onLoadOlder`, `hasMoreAbove`, `isLoadingOlder`, and `scrollRef`.
- Keep `@tanstack/react-virtual` mocked; do not make happy-dom measure real scroll/height.
- Mock `useVirtualizedChatEntries` so tests can control `allEntries`, `trailingStreamingEntry`, and `messageIndexMap` directly.

- [ ] **Step 2: Run test to verify it fails for missing coverage / signature mismatch**

Run: `bun run --cwd tests vitest run react/virtualized-message-list.test.tsx --config react/vitest.config.ts`

Expected: initially FAIL until props, hook mocks, and module specifiers match actual source.

- [ ] **Step 3: Adjust to source signatures**

Read anchors:
- `forwardRef` / exported component signature in `VirtualizedMessageList.tsx`
- `useVirtualizer` call
- `useVirtualizedChatEntries` call
- `LoadOlderBoundary` usage
- `MessageListEntry` usage
- imperative handle methods (`scrollToTurnId`, `scrollToMessageId`, or actual names)

Adjust mocks and assertions only; do not change production code.

- [ ] **Step 4: Verify VirtualizedMessageList test passes**

Run: `bun run --cwd tests vitest run react/virtualized-message-list.test.tsx --config react/vitest.config.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/react/virtualized-message-list.test.tsx
git commit -m "test(react): cover virtualized message list boundaries"
```

---

### Task 4: Final Plan 2A Verification

**Files:**
- Verify only: `tests/react/chat-message.test.tsx`, `tests/react/message-list-entries.test.tsx`, `tests/react/virtualized-message-list.test.tsx`, optional `tests/react/helpers/chatMessageMocks.tsx`.

- [ ] **Step 1: Run full React suite**

Run: `bun run test:react`

Expected: PASS, exit 0.

- [ ] **Step 2: Verify no production code changes**

Run: `git diff --name-only HEAD~3..HEAD`

Expected: only new/modified files under `tests/react/` for this plan.

- [ ] **Step 3: Note deferred sidebar plan**

If `.superpawers/OVERVIEW.md` is being updated by the user in the working tree, do not touch it. Otherwise, no action needed; this plan already documents that `SessionSidebar` is deferred to Plan 2B.

---

## Plan 2B Follow-Up Sketch: SessionSidebar

Do not implement this sketch as part of Plan 2A.

The follow-up plan should create `tests/react/helpers/sessionSidebarMocks.tsx` and `tests/react/session-sidebar.test.tsx`, then cover:

- Project/session list rendering.
- Mobile variant chrome.
- Session search filtering.
- Session selection callback.
- Empty state.
- Multi-select bulk action bar.

The helper must mock all store imports, sidebar hooks, and child dialogs at the boundary.
