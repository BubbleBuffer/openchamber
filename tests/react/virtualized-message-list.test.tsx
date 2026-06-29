/**
 * VirtualizedMessageList render coverage.
 *
 * Tests the VirtualizedMessageList (default export) with mocked child
 * hooks / components to verify:
 * - Virtualizer renders entries with data-turn-entry divs
 * - LoadOlderBoundary visibility controlled by hasMoreAbove
 * - Imperative handle (scrollToMessageId) calls into virtualizer
 * - Streaming state correctly forwarded to MessageListEntry
 *
 * @tanstack/react-virtual is aliased in vitest.config.ts to a local mock
 * so that useVirtualizer and its helpers can be controlled from the test.
 */

import React from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock functions from the aliased @tanstack/react-virtual module
// ---------------------------------------------------------------------------

import {
  mockGetTotalSize,
  mockGetVirtualItems,
  mockScrollToIndex,
} from "@tanstack/react-virtual"

// ---------------------------------------------------------------------------
// Hoisted mock state shared between mock factories and test code
// ---------------------------------------------------------------------------

const mockMessageListEntry = vi.hoisted(() => vi.fn())
const mockUseVirtualizedChatEntries = vi.hoisted(
  () =>
    vi.fn(() => ({
      allEntries: [] as Array<{ key: string }>,
      trailingStreamingEntry: null as { key: string } | null,
      messageIndexMap: new Map<string, number>(),
    })),
)

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/chat/message-list/MessageListEntry", () => ({
  MessageListEntry: (props: Record<string, unknown>) => {
    const entry = props.entry as { key: string }
    mockMessageListEntry(props)
    return <div data-testid={`ml-entry-${entry.key}`} />
  },
}))

vi.mock("@/components/chat/message-list/LoadOlderBoundary", () => ({
  LoadOlderBoundary: ({ hasMoreAbove }: { hasMoreAbove: boolean }) =>
    hasMoreAbove ? <div data-testid="load-older-boundary" /> : null,
}))

vi.mock("@/components/chat/message/FadeInOnReveal", () => ({
  FadeInDisabledProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("@/components/chat/hooks/useChatScrollManager", () => ({
  useChatScrollManager: () => ({
    isAtBottom: true,
    isOverflowing: false,
    scrollToBottom: vi.fn(),
  }),
}))

vi.mock("@/components/chat/hooks/useViewportAnchor", () => ({
  useViewportAnchor: () => ({
    captureViewportAnchor: vi.fn(),
    restoreViewportAnchor: vi.fn(),
  }),
}))

vi.mock("@/components/chat/hooks/useVirtualizedChatEntries", () => ({
  useVirtualizedChatEntries: mockUseVirtualizedChatEntries,
}))

vi.mock("@/components/chat/message-list/useMessageEntryUiState", () => ({
  useMessageEntryUiState: () => ({
    turnUiStates: new Map(),
    toggleTurnGroup: vi.fn(),
  }),
}))

vi.mock("@/components/chat/message-list/useMessageAnimationState", () => ({
  useMessageAnimationState: () => ({
    shouldAnimateUserMessage: vi.fn(),
    onUserAnimationConsumed: vi.fn(),
  }),
}))

vi.mock("@/stores/utils/streamDebug", () => ({
  streamPerfCount: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import VirtualizedMessageList from "@/components/chat/VirtualizedMessageList"
import type { ChatViewerHandle } from "@/components/chat/VirtualizedMessageList"
import type { RenderEntry } from "@/components/chat/message-list/MessageListEntry"
import type { ChatMessageEntry } from "@/components/chat/lib/turns/types"
import type { AnimationHandlers, ContentChangeReason } from "@/components/chat/timeline/types"
import type { StreamPhase } from "@/components/chat/message/types"

// ---------------------------------------------------------------------------
// Factory functions for RenderEntry variants
// ---------------------------------------------------------------------------

function ungroupedEntry(overrides: Partial<RenderEntry> & { messageId?: string } = {}): RenderEntry {
  return {
    kind: "ungrouped",
    key: "ungrouped-1",
    message: {
      info: { id: overrides.messageId ?? "m1" } as ChatMessageEntry["info"],
      parts: [],
    },
    ...overrides,
  } as RenderEntry
}

function turnEntry(overrides: Partial<RenderEntry> = {}): RenderEntry {
  return {
    kind: "turn",
    key: "turn-1",
    turn: { turnId: "turn-1" } as { turnId: string },
    isLastTurn: false,
    ...overrides,
  } as RenderEntry
}

function buildVirtualItems(entryCount: number) {
  return Array.from({ length: entryCount }, (_, i) => ({
    index: i,
    key: i,
    start: i * 160,
    size: 160,
  }))
}

// ---------------------------------------------------------------------------
// Default props
// ---------------------------------------------------------------------------

const defaultProps = {
  sessionKey: "sess-1",
  turnStart: 0,
  messages: [] as ChatMessageEntry[],
  sessionIsWorking: false,
  activeStreamingMessageId: null as string | null,
  activeStreamingPhase: null as StreamPhase | null,
  retryOverlay: null,
  onMessageContentChange: vi.fn() as (reason?: ContentChangeReason) => void,
  getAnimationHandlers: vi.fn() as (messageId: string) => AnimationHandlers,
  hasMoreAbove: false,
  isLoadingOlder: false,
  onLoadOlder: vi.fn(),
  scrollRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  onScrollStateChange: vi.fn(),
  onAtBottomChange: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VirtualizedMessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply default return values after clearAllMocks.
    // mockGetVirtualItems / mockGetTotalSize retain their module-level
    // defaults (returning [] / 0) through restoreMocks.
    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: [],
      trailingStreamingEntry: null,
      messageIndexMap: new Map<string, number>(),
    })
  })

  test("renders all entries from virtualizer with data-turn-entry divs", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "a" }),
      turnEntry({ key: "b" }),
      ungroupedEntry({ key: "c", messageId: "msg-c" }),
    ]

    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: entries,
      trailingStreamingEntry: null,
      messageIndexMap: new Map(),
    })
    mockGetVirtualItems.mockReturnValue(buildVirtualItems(entries.length))
    mockGetTotalSize.mockReturnValue(entries.length * 160)

    const { container } = render(<VirtualizedMessageList {...defaultProps} />)

    const turnDivs = container.querySelectorAll("[data-turn-entry]")
    expect(turnDivs).toHaveLength(3)
    expect(turnDivs[0].getAttribute("data-turn-entry")).toBe("a")
    expect(turnDivs[1].getAttribute("data-turn-entry")).toBe("b")
    expect(turnDivs[2].getAttribute("data-turn-entry")).toBe("c")

    // Each entry also renders a MessageListEntry
    expect(mockMessageListEntry).toHaveBeenCalledTimes(3)
    expect(mockMessageListEntry.mock.calls[0][0].entry.key).toBe("a")
    expect(mockMessageListEntry.mock.calls[1][0].entry.key).toBe("b")
    expect(mockMessageListEntry.mock.calls[2][0].entry.key).toBe("c")
  })

  test("shows LoadOlderBoundary when hasMoreAbove is true", () => {
    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: [],
      trailingStreamingEntry: null,
      messageIndexMap: new Map(),
    })
    mockGetVirtualItems.mockReturnValue([])
    mockGetTotalSize.mockReturnValue(0)

    // Render with hasMoreAbove = true
    const { rerender } = render(
      <VirtualizedMessageList {...defaultProps} hasMoreAbove={true} />,
    )
    expect(screen.getByTestId("load-older-boundary")).toBeTruthy()

    // Re-render with hasMoreAbove = false
    rerender(<VirtualizedMessageList {...defaultProps} hasMoreAbove={false} />)
    expect(screen.queryByTestId("load-older-boundary")).toBeNull()
  })

  test("scrollToMessageId delegates to virtualizer when element not found in DOM", () => {
    const messageIndexMap = new Map<string, number>([["msg-1", 0]])
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "e1", messageId: "msg-1" }),
    ]

    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: entries,
      trailingStreamingEntry: null,
      messageIndexMap,
    })
    mockGetVirtualItems.mockReturnValue(buildVirtualItems(entries.length))
    mockGetTotalSize.mockReturnValue(entries.length * 160)

    const ref = React.createRef<ChatViewerHandle>()
    // Provide a real DOM element so scrollRef.current is truthy,
    // but with no matching [data-message-id] children so it falls
    // through to the messageIndexMap lookup.
    const scrollRef = {
      current: document.createElement("div"),
    } as React.RefObject<HTMLDivElement | null>

    render(
      <VirtualizedMessageList
        {...defaultProps}
        scrollRef={scrollRef}
        ref={ref}
      />,
    )

    const result = ref.current!.scrollToMessageId("msg-1")
    expect(result).toBe(true)
    expect(mockScrollToIndex).toHaveBeenCalledTimes(1)
    expect(mockScrollToIndex).toHaveBeenCalledWith(0, {
      behavior: "auto",
      align: "start",
    })
  })

  test("scrollToMessageId returns false when messageId not found", () => {
    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: [],
      trailingStreamingEntry: null,
      messageIndexMap: new Map(),
    })
    mockGetVirtualItems.mockReturnValue([])
    mockGetTotalSize.mockReturnValue(0)

    const ref = React.createRef<ChatViewerHandle>()
    const scrollRef = {
      current: document.createElement("div"),
    } as React.RefObject<HTMLDivElement | null>

    render(
      <VirtualizedMessageList
        {...defaultProps}
        scrollRef={scrollRef}
        ref={ref}
      />,
    )

    const result = ref.current!.scrollToMessageId("nonexistent")
    expect(result).toBe(false)
    expect(mockScrollToIndex).not.toHaveBeenCalled()
  })

  test("passes streaming state through to MessageListEntry for trailing streaming entry", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "a", messageId: "msg-a" }),
      ungroupedEntry({ key: "b", messageId: "msg-b" }),
    ]
    // Mark the second entry as the trailing streaming entry
    const trailingEntry = entries[1]

    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: entries,
      trailingStreamingEntry: trailingEntry,
      messageIndexMap: new Map(),
    })
    mockGetVirtualItems.mockReturnValue(buildVirtualItems(entries.length))
    mockGetTotalSize.mockReturnValue(entries.length * 160)

    render(
      <VirtualizedMessageList
        {...defaultProps}
        sessionIsWorking={true}
        activeStreamingMessageId="msg-b"
        activeStreamingPhase="streaming"
      />,
    )

    // MessageListEntry is rendered per virtual item once each
    expect(mockMessageListEntry).toHaveBeenCalledTimes(2)

    // Entry "a" — non-streaming → streaming props nulled
    const callA = mockMessageListEntry.mock.calls[0][0]
    expect(callA.entry.key).toBe("a")
    expect(callA.sessionIsWorking).toBe(false)
    expect(callA.activeStreamingMessageId).toBeNull()
    expect(callA.activeStreamingPhase).toBeNull()

    // Entry "b" — trailing streaming entry → props pass through
    const callB = mockMessageListEntry.mock.calls[1][0]
    expect(callB.entry.key).toBe("b")
    expect(callB.sessionIsWorking).toBe(true)
    expect(callB.activeStreamingMessageId).toBe("msg-b")
    expect(callB.activeStreamingPhase).toBe("streaming")
  })

  test("disables streaming effects when no trailing streaming entry", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "x", messageId: "msg-x" }),
      turnEntry({ key: "y", isLastTurn: true }),
    ]

    mockUseVirtualizedChatEntries.mockReturnValue({
      allEntries: entries,
      trailingStreamingEntry: null,
      messageIndexMap: new Map(),
    })
    mockGetVirtualItems.mockReturnValue(buildVirtualItems(entries.length))
    mockGetTotalSize.mockReturnValue(entries.length * 160)

    render(
      <VirtualizedMessageList
        {...defaultProps}
        sessionIsWorking={true}
        activeStreamingMessageId="msg-x"
        activeStreamingPhase="streaming"
      />,
    )

    expect(mockMessageListEntry).toHaveBeenCalledTimes(2)
    // Without a matching trailingStreamingEntry, every entry gets nulled
    // streaming props and false sessionIsWorking
    for (let i = 0; i < 2; i++) {
      const call = mockMessageListEntry.mock.calls[i][0]
      expect(call.sessionIsWorking).toBe(false)
      expect(call.activeStreamingMessageId).toBeNull()
      expect(call.activeStreamingPhase).toBeNull()
    }
  })
})
