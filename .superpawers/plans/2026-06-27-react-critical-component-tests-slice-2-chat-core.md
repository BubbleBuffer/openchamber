# React Critical Component Tests Slice 2 Chat Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second React DOM testing slice for the critical chat core: `ChatSessionView`, `ChatView`, and `ChatInput`, including targeted render-fanout guards.

**Architecture:** Continue using the existing `tests/react/` Vitest + happy-dom infrastructure from slice 1. Tests render the real target component for each file and mock only process boundaries, heavyweight child surfaces, and sync/runtime seams needed to keep the test deterministic. Render-count coverage uses React `Profiler` commit counts as broad fanout guards, not timing benchmarks.

**Tech Stack:** Vitest 4, happy-dom, Testing Library, `@testing-library/user-event`, React 19 `Profiler`/`act`, existing `renderWithApp`, Zustand store seeding, local `vi.mock` boundaries.

---

## Spec Reference

Approved spec: `.superpawers/specs/2026-06-27-react-critical-component-tests-design.md`

This slice covers these spec targets:

- `ChatInput`
- `ChatSessionView`
- `ChatView`

This slice intentionally does not cover `ChatMessage`, `MessageListEntry` / `MessageListEntries`, `VirtualizedMessageList`, or `SessionSidebar` beyond lightweight mocks needed by the three target components.

---

## Existing Infrastructure

Slice 1 already created:

- `tests/react/vitest.config.ts` — Vitest happy-dom config with `@` aliases.
- `tests/react/setup.ts` — browser mocks and cleanup.
- `tests/react/helpers/browser.ts` — viewport and DOM API shims.
- `tests/react/helpers/stores.ts` — `resetTopLevelStores`, `seedUIStore`, `seedDialogStore`.
- `tests/react/helpers/render.tsx` — `renderWithApp(ui, { resetStores?: boolean })`.
- `tests/react/helpers/fixtures.ts` — shared project/session fixtures.
- `tests/react/helpers/mocks.tsx` — reusable mock component helpers.

Keep the slice 1 pattern: local mocks appear before imports of real target components, and tests assert accessible/user-visible behavior rather than Tailwind class names.

---

## File Structure

### Files to Create

- `tests/react/helpers/renderMetrics.tsx` — React `Profiler` commit collector and assertion helpers.
- `tests/react/chat-session-view.test.tsx` — DOM and memo/fanout tests for real `ChatSessionView`.
- `tests/react/chat-view.test.tsx` — DOM and fanout tests for real `ChatView` with mocked `ChatContainer`.
- `tests/react/chat-input.test.tsx` — DOM and fanout tests for real `ChatInput` with controlled child/hook mocks.

### Files to Modify

- None expected beyond `bun.lock` only if an implementer discovers an already-installed test dependency is missing. No package changes are planned.

---

## Shared Testing Rules

- Do not modify production files under `packages/`.
- Do not add E2E, screenshot, or browser-runner tests.
- Do not assert exact render duration values; happy-dom timing is not meaningful.
- Prefer loose render-count bounds, such as zero update commits for unrelated store writes and at-most-N commits for typing.
- Wrap direct Zustand store mutations used for render-count assertions in `act()` from `react`.
- No name-based process cleanup or process-matching commands in tests, scripts, or prompts. Follow the repository test-process safety rules from `AGENTS.md`.
- Keep real target components: do not mock `ChatInput`, `ChatSessionView`, or `ChatView` in their own test files.

---

## Implementation Tasks

### Task 0: Render Metrics Helper

**Files:**
- Create: `tests/react/helpers/renderMetrics.tsx` — reusable `Profiler` commit collector and assertion helpers.
- Test indirectly through subsequent component tests; no standalone helper test is required unless an implementer wants a one-test canary.

- [ ] **Step 1: Create the helper**

Create `tests/react/helpers/renderMetrics.tsx` with this complete content:

```tsx
import { expect } from "vitest"
import type { ProfilerOnRenderCallback, ProfilerProps, ReactElement, ReactNode } from "react"
import { Profiler } from "react"

export type CommitRecord = {
  id: string
  phase: "mount" | "update" | "nested-update"
  actualDuration: number
  baseDuration: number
}

export type CommitCollector = {
  commits: CommitRecord[]
  onRender: ProfilerOnRenderCallback
  reset: () => void
}

export function createCommitCollector(id: string): CommitCollector {
  const commits: CommitRecord[] = []
  const onRender: ProfilerOnRenderCallback = (profilerId, phase, actualDuration, baseDuration) => {
    commits.push({
      id: profilerId,
      phase,
      actualDuration,
      baseDuration,
    })
  }

  return {
    commits,
    onRender,
    reset: () => {
      commits.length = 0
    },
  }
}

export function updateCommits(commits: CommitRecord[]): CommitRecord[] {
  return commits.filter((commit) => commit.phase === "update" || commit.phase === "nested-update")
}

export function expectNoUpdateCommits(commits: CommitRecord[]): void {
  expect(updateCommits(commits)).toHaveLength(0)
}

export function expectUpdateCommitsAtMost(commits: CommitRecord[], max: number): void {
  const updates = updateCommits(commits)
  expect(updates.length).toBeLessThanOrEqual(max)
}

export function createProfiledElement(
  id: string,
  collector: CommitCollector,
  children: ReactNode,
): ReactElement<ProfilerProps> {
  return (
    <Profiler id={id} onRender={collector.onRender}>
      {children}
    </Profiler>
  )
}
```

- [ ] **Step 2: Run targeted verification**

Run:

```bash
bun run --cwd tests type-check
```

Expected: either no new `tests/react/helpers/renderMetrics.tsx` errors, or only the documented pre-existing UI package ambient/Vite type errors. If this helper has a React type mismatch, fix it in the helper before continuing.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff -- tests/react/helpers/renderMetrics.tsx
```

Expected: only the new helper appears.

- [ ] **Step 4: Commit**

Run:

```bash
git add tests/react/helpers/renderMetrics.tsx
git commit -m "test(react): add render metrics helper"
```

---

### Task 1: ChatSessionView Tests

**Files:**
- Create: `tests/react/chat-session-view.test.tsx` — tests real `ChatSessionView` with mocked `ChatEmptyState` and `ChatViewport`.

- [ ] **Step 1: Create `chat-session-view.test.tsx`**

Create `tests/react/chat-session-view.test.tsx` with this target-state sketch. Use real imports for `ChatSessionView`; keep `ChatEmptyState` and `ChatViewport` mocked to avoid theme, virtualizer, scroll, and permission/status dependencies.

```tsx
import { screen } from "@testing-library/react"
import { act, createRef, type ComponentProps } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits, expectUpdateCommitsAtMost } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"

vi.mock("@/components/chat/ChatEmptyState", () => ({
  default: () => <section aria-label="Chat empty state">Start a new chat</section>,
}))

vi.mock("@/components/chat/ChatViewport", () => ({
  ChatViewport: ({
    currentSessionId,
    messages,
    interruptions,
    isDesktopExpandedInput,
    handleLoadOlder,
  }: {
    currentSessionId: string
    messages: { renderedMessages: Array<{ id: string; role?: string; text?: string }> }
    interruptions: { questions: unknown[]; permissions: unknown[] }
    isDesktopExpandedInput: boolean
    handleLoadOlder: () => void
  }) => (
    <section aria-hidden={isDesktopExpandedInput} aria-label="Chat viewport">
      <div>Session {currentSessionId}</div>
      <div>Messages {messages.renderedMessages.length}</div>
      <div>Questions {interruptions.questions.length}</div>
      <div>Permissions {interruptions.permissions.length}</div>
      <button type="button" onClick={handleLoadOlder}>Load older</button>
    </section>
  ),
}))

import { ChatSessionView } from "@/components/chat/ChatSessionView"
import { useUIStore } from "@/stores/useUIStore"

type SessionViewProps = ComponentProps<typeof ChatSessionView>

function buildProps(overrides: Partial<SessionViewProps> = {}): SessionViewProps {
  return {
    session: {
      sessionId: "sess-1",
      activeSessionId: "sess-1",
      isActive: true,
      loaded: true,
      exists: true,
      isDraftOpen: false,
      parentSessionId: null,
    } as SessionViewProps["session"],
    messages: {
      messageCount: 1,
      renderedMessages: [{ id: "msg-1", role: "assistant", text: "Hello" }],
      streamingMessageId: undefined,
    } as SessionViewProps["messages"],
    activity: {
      isWorking: false,
      isStreaming: false,
      isAborting: false,
      showAbortStatus: false,
      needsAttention: false,
    } as SessionViewProps["activity"],
    interruptions: { questions: [], permissions: [] } as SessionViewProps["interruptions"],
    currentSessionId: "sess-1",
    isDesktopExpandedInput: false,
    stickyUserHeader: false,
    activeStreamingPhase: null,
    scrollRef: createRef<HTMLDivElement>(),
    messageListRef: createRef(),
    turnStart: 0,
    pendingRevealWork: false,
    hasMoreAboveTurns: false,
    isLoadingOlder: false,
    handleMessageContentChange: vi.fn(),
    getAnimationHandlers: vi.fn(() => ({})),
    handleLoadOlder: vi.fn(),
    ...overrides,
  }
}

describe("ChatSessionView", () => {
  beforeEach(() => {
    seedUIStore({ settingsPage: "home", isRightSidebarOpen: false })
  })

  test("renders loading skeletons when the session is not loaded and nothing is streaming", () => {
    const props = buildProps({
      session: {
        sessionId: "sess-1",
        activeSessionId: "sess-1",
        isActive: true,
        loaded: false,
        exists: true,
        isDraftOpen: false,
        parentSessionId: null,
      } as SessionViewProps["session"],
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as SessionViewProps["messages"],
    })

    const { container } = renderWithApp(<ChatSessionView {...props} />, { resetStores: false })

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText("Chat empty state")).toBeNull()
    expect(screen.queryByLabelText("Chat viewport")).toBeNull()
  })

  test("renders the empty state when the loaded session has no messages", () => {
    const props = buildProps({
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as SessionViewProps["messages"],
    })

    renderWithApp(<ChatSessionView {...props} />, { resetStores: false })

    expect(screen.getByLabelText("Chat empty state")).toBeTruthy()
    expect(screen.getByText("Start a new chat")).toBeTruthy()
  })

  test("renders the active viewport with message and interruption counts", () => {
    const props = buildProps({
      interruptions: { questions: [{ id: "q-1" }], permissions: [{ id: "p-1" }] } as SessionViewProps["interruptions"],
    })

    renderWithApp(<ChatSessionView {...props} />, { resetStores: false })

    expect(screen.getByLabelText("Chat viewport")).toBeTruthy()
    expect(screen.getByText("Session sess-1")).toBeTruthy()
    expect(screen.getByText("Messages 1")).toBeTruthy()
    expect(screen.getByText("Questions 1")).toBeTruthy()
    expect(screen.getByText("Permissions 1")).toBeTruthy()
  })

  test("hides loading and empty branches from assistive tech while desktop input is expanded", () => {
    const loadingProps = buildProps({
      isDesktopExpandedInput: true,
      session: {
        sessionId: "sess-1",
        activeSessionId: "sess-1",
        isActive: true,
        loaded: false,
        exists: true,
        isDraftOpen: false,
        parentSessionId: null,
      } as SessionViewProps["session"],
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as SessionViewProps["messages"],
    })

    const { container, rerender } = renderWithApp(<ChatSessionView {...loadingProps} />, { resetStores: false })

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")

    const emptyProps = buildProps({
      isDesktopExpandedInput: true,
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as SessionViewProps["messages"],
    })
    rerender(<ChatSessionView {...emptyProps} />)

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByLabelText("Chat empty state")).toBeNull()
  })

  test("does not commit an update for unrelated UI store changes", () => {
    const collector = createCommitCollector("ChatSessionView")
    renderWithApp(createProfiledElement("ChatSessionView", collector, <ChatSessionView {...buildProps()} />), { resetStores: false })
    collector.reset()

    act(() => {
      useUIStore.setState({ isRightSidebarOpen: true }, false)
    })

    expectNoUpdateCommits(collector.commits)
  })

  test("keeps memoized rerenders bounded for stable props and one scalar prop change", () => {
    const props = buildProps()
    const collector = createCommitCollector("ChatSessionView")
    const { rerender } = renderWithApp(createProfiledElement("ChatSessionView", collector, <ChatSessionView {...props} />), { resetStores: false })
    collector.reset()

    rerender(createProfiledElement("ChatSessionView", collector, <ChatSessionView {...props} />))

    expectNoUpdateCommits(collector.commits)

    rerender(createProfiledElement("ChatSessionView", collector, <ChatSessionView {...props} isDesktopExpandedInput />))

    expectUpdateCommitsAtMost(collector.commits, 1)
  })
})
```

If the exact local state types differ from the casts above, adjust the fixture object shapes only enough to satisfy `ChatSessionView` and its mocked `ChatViewport`. Do not import or render the real `ChatViewport` in this task.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
bun run test:react -- chat-session-view.test.tsx
```

Expected: all 6 tests pass. If TypeScript/runtime mismatches occur, fix only mechanical object-shape or mock-signature issues while keeping real `ChatSessionView` under test.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff -- tests/react/chat-session-view.test.tsx tests/react/helpers/renderMetrics.tsx
```

Expected: only planned test/helper files appear.

- [ ] **Step 4: Commit**

Run:

```bash
git add tests/react/chat-session-view.test.tsx
git commit -m "test(react): cover chat session view"
```

---

### Task 2: ChatView Tests

**Files:**
- Create: `tests/react/chat-view.test.tsx` — tests real `ChatView` with mocked `ChatContainer` and a minimal mocked `useSessionUIStore` hook/static surface.

- [ ] **Step 1: Create `chat-view.test.tsx`**

Create `tests/react/chat-view.test.tsx` with this target-state sketch. The target component stays real; `ChatContainer` is mocked because this file tests `ChatView`'s boundary and error wrapper, not `ChatContainer` internals.

```tsx
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits, expectUpdateCommitsAtMost } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"

let currentSessionId: string | null = null
let throwContainerError = false

function selectSessionState<T>(selector: (state: { currentSessionId: string | null }) => T): T {
  return selector({ currentSessionId })
}

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: { currentSessionId: string | null }) => unknown) => selectSessionState(selector),
    {
      getState: () => ({ currentSessionId }),
      setState: (patch: { currentSessionId?: string | null }) => {
        currentSessionId = patch.currentSessionId ?? currentSessionId
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/components/chat/ChatContainer", () => ({
  ChatContainer: () => {
    if (throwContainerError) {
      throw new Error("container exploded")
    }
    return <main aria-label="Chat container">Chat container</main>
  },
}))

import { ChatView } from "@/components/views/ChatView"
import { useUIStore } from "@/stores/useUIStore"

describe("ChatView", () => {
  beforeEach(() => {
    currentSessionId = null
    throwContainerError = false
    seedUIStore({ isRightSidebarOpen: false, settingsPage: "home" })
  })

  test("renders the chat container with no active session", () => {
    renderWithApp(<ChatView />, { resetStores: false })

    expect(screen.getByLabelText("Chat container")).toBeTruthy()
  })

  test("passes the active session id into the error boundary fallback", () => {
    currentSessionId = "sess-123"
    throwContainerError = true

    renderWithApp(<ChatView />, { resetStores: false })

    expect(screen.getByText("Chat Error")).toBeTruthy()
    expect(screen.getByText("Session: sess-123")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Reset Chat/i })).toBeTruthy()
  })

  test("resetting the error boundary renders the chat container again", async () => {
    const user = userEvent.setup()
    currentSessionId = "sess-123"
    throwContainerError = true
    renderWithApp(<ChatView />, { resetStores: false })

    throwContainerError = false
    await user.click(screen.getByRole("button", { name: /Reset Chat/i }))

    expect(screen.getByLabelText("Chat container")).toBeTruthy()
  })

  test("does not commit an update for unrelated UI store changes", () => {
    const collector = createCommitCollector("ChatView")
    renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
    collector.reset()

    act(() => {
      useUIStore.setState({ isRightSidebarOpen: true }, false)
    })

    expectNoUpdateCommits(collector.commits)
  })

  test("keeps session id changes bounded when the mocked selected store value changes", () => {
    const collector = createCommitCollector("ChatView")
    const { rerender } = renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
    collector.reset()

    currentSessionId = "sess-next"
    rerender(createProfiledElement("ChatView", collector, <ChatView />))

    expectUpdateCommitsAtMost(collector.commits, 1)
  })
})
```

If Testing Library requires the reset click to be wrapped with `userEvent`, use `const user = userEvent.setup()` and `await user.click(...)`. Keep the real `ChatView` and real `ChatErrorBoundary`; do not mock `ChatErrorBoundary`.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
bun run test:react -- chat-view.test.tsx
```

Expected: all 5 tests pass. If the boundary fallback text differs, read `packages/ui/src/components/chat/ChatErrorBoundary.tsx` and update assertions to match the real accessible text.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff -- tests/react/chat-view.test.tsx
```

Expected: only the planned test file appears for this task.

- [ ] **Step 4: Commit**

Run:

```bash
git add tests/react/chat-view.test.tsx
git commit -m "test(react): cover chat view boundary"
```

---

### Task 3: ChatInput Tests

**Files:**
- Create: `tests/react/chat-input.test.tsx` — tests real `ChatInput` with controlled child/hook/store mocks.

**Task-specific mock strategy:**

- Keep real `ChatInput` under test.
- Mock composer child components (`ComposerTextarea`, `ComposerFooter`, `ComposerMobileControls`, `ComposerAutocompleteLayer`) so the test can interact through accessible controls without importing model pickers, file pickers, Base UI dropdowns, GitHub dialogs, or filesystem search.
- Mock `useComposerDraft` with a small internal React state hook so typing through the real `ChatInput` handlers updates DOM value and computed `canSend`.
- Mock `useSessionUIStore`, `useProviderConfigStore`, `useAgentConfigStore`, and other process-boundary stores/hooks with local state and spies. The real sync store is too large for this component-level slice.
- Use real `useUIStore` for UI settings and render-fanout assertions.

- [ ] **Step 1: Create `chat-input.test.tsx`**

Create `tests/react/chat-input.test.tsx` with this target-state sketch. This sketch names every required local mock and every expected test. Implementers may adjust TypeScript annotations mechanically, but must preserve the test behaviors.

```tsx
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act, type ChangeEvent, type KeyboardEvent } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits, expectUpdateCommitsAtMost } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"

const sendMessage = vi.fn(async () => undefined)
const addToQueue = vi.fn()
const clearAttachedFiles = vi.fn()
const consumeDrafts = vi.fn(() => [])
const abortCurrentOperation = vi.fn(async () => undefined)

let currentSessionId: string | null = "sess-1"
let newSessionDraftOpen = false
let sessionPhase: "idle" | "busy" = "idle"
let queueModeEnabled = false
let queuedMessages: unknown[] = []
let attachedFiles: Array<{ id: string; filename: string; mimeType: string; size: number; source: string }> = []
let hasInlineDrafts = false

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ currentTheme: { id: "test", mode: "dark" } }),
}))

vi.mock("@/lib/desktop/desktop", () => ({
  isTauriShell: () => false,
  isVSCodeRuntime: () => false,
  isWebRuntime: () => true,
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: { getDirectory: () => "/workspace/openchamber" },
}))

vi.mock("@/sync/session-actions", () => ({
  sessionActions: { abortCurrentOperation },
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      currentSessionId,
      newSessionDraft: newSessionDraftOpen ? { open: true } : null,
      abortPromptSessionId: null,
      sendMessage,
      clearAbortPrompt: vi.fn(),
      acknowledgeSessionAbort: vi.fn(),
    }),
    {
      getState: () => ({ currentSessionId, sendMessage }),
      setState: (patch: { currentSessionId?: string | null }) => {
        currentSessionId = patch.currentSessionId ?? currentSessionId
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/sync/input-store", () => ({
  useInputStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    attachedFiles,
    addAttachedFile: vi.fn(),
    clearAttachedFiles,
    consumePendingInputText: vi.fn(() => null),
    setPendingInputText: vi.fn(),
    pendingInputText: null,
    consumePendingSyntheticParts: vi.fn(() => null),
  }),
}))

vi.mock("@/sync/selection-store", () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ saveSessionAgentSelection: vi.fn() }),
}))

vi.mock("@/stores/config/useProviderConfigStore", () => ({
  useProviderConfigStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    currentVariant: undefined,
    getEffectiveModel: () => ({ providerID: "anthropic", modelID: "claude-test" }),
  }),
}))

vi.mock("@/stores/agents/useAgentConfigStore", () => ({
  useAgentConfigStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    currentAgentName: "build",
    setAgent: vi.fn(),
    getVisibleAgents: () => [{ name: "build", mode: "primary" }],
  }),
}))

vi.mock("@/stores/messageQueueStore", () => ({
  useMessageQueueStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    queueModeEnabled,
    queuedMessages: { "sess-1": queuedMessages },
    addToQueue,
    clearQueue: vi.fn(),
  }),
}))

vi.mock("@/stores/useInlineCommentDraftStore", () => ({
  useInlineCommentDraftStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    drafts: hasInlineDrafts ? { "sess-1": [{ id: "draft-1", text: "review" }] } : {},
    consumeDrafts,
  }),
}))

vi.mock("@/stores/permissionStore", () => ({
  usePermissionStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    setSessionAutoAccept: vi.fn(),
    isSessionAutoAccepting: () => false,
  }),
}))

vi.mock("@/hooks/useSessionActivity", () => ({
  useCurrentSessionActivity: () => ({ phase: sessionPhase, isWorking: sessionPhase !== "idle" }),
}))

vi.mock("@/hooks/useChatSearchDirectory", () => ({ useChatSearchDirectory: () => "/workspace/openchamber" }))

vi.mock("@/components/chat/chat-input/useDraftTargetSelector", () => ({
  useDraftTargetSelector: () => ({
    showDraftTargetSelectors: false,
    selectedProject: null,
    selectedWorktree: null,
    selectedBranch: null,
    selectedDirectory: null,
    directoryOptions: [],
    projectOptions: [],
    worktreeOptions: [],
    branchOptions: [],
    setSelectedProjectId: vi.fn(),
    setSelectedWorktreeId: vi.fn(),
    setSelectedBranchName: vi.fn(),
    setSelectedDirectory: vi.fn(),
  }),
}))

vi.mock("@/components/chat/chat-input/useComposerDraft", async () => {
  const React = await import("react")
  return {
    useComposerDraft: () => {
      const [message, setMessage] = React.useState("")
      const messageRef = React.useRef(message)
      messageRef.current = message
      return {
        message,
        setMessage,
        messageRef,
        confirmedMentionsRef: React.useRef(new Set<string>()),
        isConfirmedFilePath: () => false,
        clearSubmittedDraft: vi.fn(),
      }
    },
  }
})

vi.mock("@/components/chat/chat-input/useComposerAutocomplete", () => ({
  useComposerAutocomplete: () => ({
    showCommandAutocomplete: false,
    setShowCommandAutocomplete: vi.fn(),
    commandAutocompleteQuery: "",
    setCommandAutocompleteQuery: vi.fn(),
    showSkillAutocomplete: false,
    setShowSkillAutocomplete: vi.fn(),
    skillAutocompleteQuery: "",
    setSkillAutocompleteQuery: vi.fn(),
    showFileMention: false,
    setShowFileMention: vi.fn(),
    fileMentionQuery: "",
    setFileMentionQuery: vi.fn(),
    showAgentAutocomplete: false,
    setShowAgentAutocomplete: vi.fn(),
    agentAutocompleteQuery: "",
    setAgentAutocompleteQuery: vi.fn(),
    autocompleteTabIndex: 0,
    setAutocompleteTabIndex: vi.fn(),
    updateAutocompleteState: vi.fn(),
    resetAutocompleteState: vi.fn(),
  }),
}))

vi.mock("@/components/chat/chat-input/useComposerAutocompleteOverlay", () => ({
  useComposerAutocompleteOverlay: () => ({ autocompleteOverlayPosition: null, updateAutocompleteOverlayPosition: vi.fn() }),
}))

vi.mock("@/components/chat/chat-input/useComposerTextareaAutosize", () => ({
  useComposerTextareaAutosize: () => ({ textareaSize: { height: 52, maxHeight: 200 }, adjustTextareaHeight: vi.fn() }),
}))

vi.mock("@/components/chat/chat-input/useComposerHistory", () => ({
  useComposerHistory: () => ({ historyIndex: -1, setHistoryIndex: vi.fn(), navigateHistory: vi.fn() }),
}))

vi.mock("@/components/chat/chat-input/ComposerTextarea", () => ({
  ComposerTextarea: ({ value, disabled, currentSessionId, newSessionDraftOpen, inputMode, onChange, onKeyDown }: {
    value: string
    disabled: boolean
    currentSessionId: string | null
    newSessionDraftOpen: boolean
    inputMode: "normal" | "shell"
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  }) => (
    <textarea
      data-chat-input="true"
      aria-label="Chat input"
      disabled={disabled}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={currentSessionId || newSessionDraftOpen ? (inputMode === "shell" ? "Enter shell command..." : "@ for files/agents; / for commands; ! for shell") : "Select or create a session to start chatting"}
    />
  ),
}))

vi.mock("@/components/chat/chat-input/ComposerAutocompleteLayer", () => ({ ComposerAutocompleteLayer: () => null }))

vi.mock("@/components/chat/FileAttachment", () => ({
  AttachedFilesList: () => attachedFiles.length ? <section aria-label="Attached files">{attachedFiles.map((file) => <span key={file.id}>{file.filename}</span>)}</section> : null,
}))
vi.mock("@/components/chat/QueuedMessageChips", () => ({
  QueuedMessageChips: () => queuedMessages.length ? <section aria-label="Queued messages">Queued {queuedMessages.length}</section> : null,
}))
vi.mock("@/components/chat/status/StatusRow", () => ({ StatusRow: () => <div data-testid="status-row" /> }))
vi.mock("@/components/chat/diff/PendingChangesBar", () => ({ PendingChangesBar: () => null }))
vi.mock("@/components/chat/mobile-session-status-bar/MobileSessionStatusBar", () => ({ MobileSessionStatusBar: () => <section aria-label="Mobile session status">Mobile session status</section> }))
vi.mock("@/components/session/GitHubIssuePickerDialog", () => ({ GitHubIssuePickerDialog: () => null }))
vi.mock("@/components/session/GitHubPrPickerDialog", () => ({ GitHubPrPickerDialog: () => null }))

vi.mock("@/components/chat/chat-input/ComposerFooter", () => ({
  ComposerFooter: ({ canSend, canAbort, onPrimaryAction, onQueueMessage, onAbort }: {
    canSend: boolean
    canAbort: boolean
    onPrimaryAction: () => void
    onQueueMessage: () => void
    onAbort: () => void
  }) => (
    <footer data-chat-input-footer="true">
      <button type="button" aria-label="Send message" disabled={!canSend} onClick={onPrimaryAction}>Send</button>
      {canAbort ? <button type="button" aria-label="Queue message" disabled={!canSend} onClick={onQueueMessage}>Queue</button> : null}
      {canAbort ? <button type="button" aria-label="Stop generating" onClick={onAbort}>Stop</button> : null}
    </footer>
  ),
}))

vi.mock("@/components/chat/chat-input/ComposerMobileControls", () => ({
  ComposerMobileControls: ({ canSend, canAbort, onPrimaryAction, onAbort }: { canSend: boolean; canAbort: boolean; onPrimaryAction: () => void; onAbort: () => void }) => (
    <section aria-label="Mobile composer controls">
      <button type="button" aria-label="Send message" disabled={!canSend} onClick={onPrimaryAction}>Send</button>
      {canAbort ? <button type="button" aria-label="Stop generating" onClick={onAbort}>Stop</button> : null}
    </section>
  ),
}))

import { ChatInput } from "@/components/chat/ChatInput"
import { useUIStore } from "@/stores/useUIStore"

function resetChatInputState(): void {
  currentSessionId = "sess-1"
  newSessionDraftOpen = false
  sessionPhase = "idle"
  queueModeEnabled = false
  queuedMessages = []
  attachedFiles = []
  hasInlineDrafts = false
  sendMessage.mockClear()
  addToQueue.mockClear()
  clearAttachedFiles.mockClear()
  consumeDrafts.mockClear()
  abortCurrentOperation.mockClear()
  seedUIStore({ isMobile: false, isKeyboardOpen: false, inputBarOffset: 0, inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
}

describe("ChatInput", () => {
  beforeEach(() => {
    resetChatInputState()
    setViewport(1280)
  })

  test("renders a disabled composer when no session or draft is active", () => {
    currentSessionId = null
    renderWithApp(<ChatInput />, { resetStores: false })

    expect(screen.getByPlaceholderText("Select or create a session to start chatting")).toBeTruthy()
    expect(screen.getByLabelText("Chat input")).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty("disabled", true)
  })

  test("typing enables send and submitting calls sendMessage once", async () => {
    const user = userEvent.setup()
    renderWithApp(<ChatInput />, { resetStores: false })

    await user.type(screen.getByLabelText("Chat input"), "hello")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1))
    // Simple text passes through buildComposerSubmitPayload as the primary message text.
    expect(sendMessage.mock.calls[0][0]).toBe("hello")
  })

  test("blocks whitespace-only submit", async () => {
    const user = userEvent.setup()
    renderWithApp(<ChatInput />, { resetStores: false })

    await user.type(screen.getByLabelText("Chat input"), "   ")

    expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty("disabled", true)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test("queues instead of sending while queue mode is enabled during a busy session", async () => {
    const user = userEvent.setup()
    queueModeEnabled = true
    sessionPhase = "busy"
    renderWithApp(<ChatInput />, { resetStores: false })

    await user.type(screen.getByLabelText("Chat input"), "queue this")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(addToQueue).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test("renders attached files, queued messages, and review drafts when seeded", () => {
    attachedFiles = [{ id: "file-1", filename: "notes.md", mimeType: "text/markdown", size: 42, source: "local" }]
    queuedMessages = [{ id: "queued-1" }]
    hasInlineDrafts = true

    renderWithApp(<ChatInput />, { resetStores: false })

    expect(screen.getByLabelText("Attached files")).toBeTruthy()
    expect(screen.getByText("notes.md")).toBeTruthy()
    expect(screen.getByLabelText("Queued messages")).toBeTruthy()
    expect(screen.getByText(/Review comments:/i)).toBeTruthy()
  })

  test("renders mobile composer controls and status bar when mobile", () => {
    seedUIStore({ isMobile: true })
    setViewport(390, 844)

    renderWithApp(<ChatInput />, { resetStores: false })

    expect(screen.getByLabelText("Mobile composer controls")).toBeTruthy()
    expect(screen.getByLabelText("Mobile session status")).toBeTruthy()
  })

  test("shows stop controls and calls abort while the session is busy", async () => {
    const user = userEvent.setup()
    sessionPhase = "busy"
    renderWithApp(<ChatInput />, { resetStores: false })

    expect(screen.getByRole("button", { name: "Stop generating" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Stop generating" }))

    expect(abortCurrentOperation).toHaveBeenCalledTimes(1)
  })

  test("does not commit an update for unrelated UI store changes", () => {
    const collector = createCommitCollector("ChatInput")
    renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
    collector.reset()

    act(() => {
      useUIStore.setState({ settingsPage: "agents" }, false)
    })

    expectNoUpdateCommits(collector.commits)
  })

  test("keeps typing commits bounded", async () => {
    const user = userEvent.setup()
    const collector = createCommitCollector("ChatInput")
    renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
    collector.reset()

    await user.type(screen.getByLabelText("Chat input"), "hello")

    expectUpdateCommitsAtMost(collector.commits, 8)
  })
})
```

Expected count: 9 tests. If the real `ChatInput` requires additional no-op mocks because an import initializes a service, add the narrowest possible local `vi.mock` and note it in the task report. Do not replace `ChatInput` itself.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
bun run test:react -- chat-input.test.tsx
```

Expected: all 9 tests pass. If the queue or send path differs mechanically, read `handlePrimaryAction` and `handleSubmit` in `ChatInput.tsx` plus `buildComposerSubmitPayload` in `packages/ui/src/components/chat/chat-input/composerSubmit.ts`, then update the mocked props/store state without changing the intended behavior coverage.

- [ ] **Step 3: Run current React suite**

Run:

```bash
bun run test:react
```

Expected: previous 14 tests plus the new chat input tests pass.

- [ ] **Step 4: Inspect diff**

Run:

```bash
git diff -- tests/react/chat-input.test.tsx
```

Expected: only the planned ChatInput test file appears for this task.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/react/chat-input.test.tsx
git commit -m "test(react): cover chat input composer"
```

---

### Task 4: Full Slice Verification

**Files:**
- No planned edits. Fix only branch-introduced verification failures from Tasks 0-3.

- [ ] **Step 1: Run React tests three consecutive times**

Run:

```bash
bun run test:react
bun run test:react
bun run test:react
```

Expected: all React tests pass on all three runs. Expected total after this slice: prior 14 tests plus approximately 20 new chat-core tests, for roughly 32-36 total React tests.

- [ ] **Step 2: Run store tests**

Run:

```bash
bun run test:stores
```

Expected: 68/68 store tests pass. Known non-fatal console warnings from store tests may remain.

- [ ] **Step 3: Run tests workspace static checks**

Run:

```bash
bun run --cwd tests type-check
bun run --cwd tests lint
```

Expected:

- `type-check`: no errors in `tests/react/`; documented pre-existing UI package ambient/Vite errors may remain.
- `lint`: 0 errors; any warnings should be documented and pre-existing or outside `tests/react/`.

- [ ] **Step 4: Audit forbidden process commands**

Use a content-search tool to inspect `tests/react/` for any name-based process cleanup or process-matching commands prohibited by `AGENTS.md`.

Expected: no matches. If the search returns non-zero because there are no matches, that is success. Do not execute any process cleanup command as part of this audit.

- [ ] **Step 5: Inspect branch diff and status**

Run:

```bash
git status --short
git diff --name-only main...HEAD
git diff --stat main...HEAD
```

Expected:

- Only pre-existing untracked `opencode.json` may appear in status.
- Diff contains `.superpawers` docs, `tests/react` files, and earlier slice config/lock files only.
- No production source changes under `packages/`.
- No `packages/web/server/lib/event-stream/` files.

- [ ] **Step 6: Commit verification-only fixes if needed**

If Steps 1-5 reveal branch-introduced lint/type/test failures, apply the smallest test-only fixes and commit:

```bash
git add <fixed test files>
git commit -m "test(react): fix chat core test verification"
```

Then rerun Steps 1-5.

---

## Acceptance Criteria

- `tests/react/helpers/renderMetrics.tsx` exists and is used by at least three render-fanout guard tests.
- `tests/react/chat-session-view.test.tsx` exists and covers loading, empty, active, expanded-hidden, and memo/fanout behavior for real `ChatSessionView`.
- `tests/react/chat-view.test.tsx` exists and covers basic render, error-boundary session id, reset behavior, and unrelated-store fanout behavior for real `ChatView`.
- `tests/react/chat-input.test.tsx` exists and covers disabled/no-session, typing/send, whitespace-submit guard, queue path, seeded attachment/queue/draft surfaces, mobile controls, busy stop controls, and render-fanout/typing bounds for real `ChatInput`.
- `bun run test:react` passes 3 consecutive runs.
- `bun run test:stores` remains passing.
- `bun run --cwd tests lint` has no branch-introduced errors.
- `bun run --cwd tests type-check` has no `tests/react` errors; pre-existing UI package ambient/Vite errors may remain documented.
- No production source changes are introduced.
- No disallowed process cleanup/matching commands are added.

---

## Reviewer Notes

- The exact mocked state object shapes may need mechanical adjustment because several target component prop types are local or broad. That is acceptable if the real target component remains under test and test behavior stays the same.
- Render-count assertions intentionally avoid exact duration or exact per-keystroke commit counts. They should catch broad browser-blasting regressions without making harmless React batching changes fail.
- If a render-fanout assertion is flaky, loosen the bound slightly and document why. Do not delete all performance guard coverage.
- If `ChatInput` grows too difficult because of import side effects, prefer additional narrow local mocks over broad component replacement. `ChatInput` itself must stay real in `chat-input.test.tsx`.
