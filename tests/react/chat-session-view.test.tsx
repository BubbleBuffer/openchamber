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

import type { ChatMessagesState, ChatInterruptionsState } from "@/components/chat/state/types"
import type { AnimationHandlers } from "@/components/chat/timeline/types"
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
    } as unknown as ChatMessagesState,
    activity: {
      isWorking: false,
      isStreaming: false,
      isAborting: false,
      showAbortStatus: false,
      needsAttention: false,
    } as SessionViewProps["activity"],
    interruptions: { questions: [], permissions: [] } as unknown as ChatInterruptionsState,
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
    getAnimationHandlers: vi.fn(() => ({ onChunk: vi.fn(), onComplete: vi.fn() })) as unknown as (messageId: string) => AnimationHandlers,
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
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as unknown as ChatMessagesState,
    })

    const { container } = renderWithApp(<ChatSessionView {...props} />, { resetStores: false })

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText("Chat empty state")).toBeNull()
    expect(screen.queryByLabelText("Chat viewport")).toBeNull()
  })

  test("renders the empty state when the loaded session has no messages", () => {
    const props = buildProps({
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as unknown as ChatMessagesState,
    })

    renderWithApp(<ChatSessionView {...props} />, { resetStores: false })

    expect(screen.getByLabelText("Chat empty state")).toBeTruthy()
    expect(screen.getByText("Start a new chat")).toBeTruthy()
  })

  test("renders the active viewport with message and interruption counts", () => {
    const props = buildProps({
      interruptions: { questions: [{ id: "q-1" }], permissions: [{ id: "p-1" }] } as unknown as ChatInterruptionsState,
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
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as unknown as ChatMessagesState,
    })

    const { container, rerender } = renderWithApp(<ChatSessionView {...loadingProps} />, { resetStores: false })

    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true")

    const emptyProps = buildProps({
      isDesktopExpandedInput: true,
      messages: { messageCount: 0, renderedMessages: [], streamingMessageId: undefined } as unknown as ChatMessagesState,
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

    // Profiler always fires on root.render() even when memo bails out, so at most 1 commit
    expectUpdateCommitsAtMost(collector.commits, 1)
    collector.reset()

    rerender(createProfiledElement("ChatSessionView", collector, <ChatSessionView {...props} isDesktopExpandedInput />))

    expectUpdateCommitsAtMost(collector.commits, 1)
  })
})
