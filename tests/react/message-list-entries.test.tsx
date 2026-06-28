/**
 * MessageListEntries render coverage.
 *
 * Tests that MessageListEntries correctly maps over RenderEntry items,
 * wraps them in turn-entry divs, and passes the right props (including
 * streaming vs non-streaming guard) to MessageListEntry.
 *
 * MessageListEntry is mocked at the module boundary so these tests isolate
 * the mapping / orchestration logic inside MessageListEntries.
 */
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { MessageListEntries } from "@/components/chat/message-list/MessageListEntries"
import type { RenderEntry } from "@/components/chat/message-list/MessageListEntry"
import type { ChatMessageEntry, TurnRecord } from "@/components/chat/lib/turns/types"
import type { AnimationHandlers, ContentChangeReason } from "@/components/chat/timeline/types"
import type { StreamPhase } from "@/components/chat/message/types"
import type { TurnUiState } from "@/components/chat/message-list/TurnBlock"

// ---------------------------------------------------------------------------
// Mock MessageListEntry at the boundary so we can inspect the props it
// receives without relying on its internal rendering.
// ---------------------------------------------------------------------------

const mockMessageListEntry = vi.fn()

vi.mock("@/components/chat/message-list/MessageListEntry", () => ({
  MessageListEntry: (props: Record<string, unknown>) => {
    const entry = props.entry as RenderEntry
    mockMessageListEntry(props)
    return <div data-testid={`ml-entry-${entry.key}`} />
  },
}))

// ---------------------------------------------------------------------------
// Default props (14 fields matching MessageListEntriesProps)
// ---------------------------------------------------------------------------

const defaultProps = {
  turnUiStates: new Map<string, TurnUiState>(),
  toggleTurnGroup: vi.fn(),
  defaultActivityExpanded: false,
  chatRenderMode: "live" as const,
  sessionIsWorking: false,
  stickyUserHeader: false,
  shouldAnimateUserMessage: vi.fn(),
  onUserAnimationConsumed: vi.fn(),
  activeStreamingMessageId: null as string | null,
  activeStreamingPhase: null as StreamPhase | null,
  getAnimationHandlers: vi.fn() as (messageId: string) => AnimationHandlers,
  onMessageContentChange: vi.fn() as (reason?: ContentChangeReason) => void,
  entries: [] as RenderEntry[],
  trailingStreamingEntry: null as RenderEntry | null,
}

function renderEntries(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides }
  return render(<MessageListEntries {...props} />)
}

// ---------------------------------------------------------------------------
// Factories for RenderEntry variants
// ---------------------------------------------------------------------------

function ungroupedEntry(overrides: Partial<RenderEntry> = {}): RenderEntry {
  return {
    kind: "ungrouped",
    key: "ungrouped-1",
    message: { info: { id: "m1" } as ChatMessageEntry["info"], parts: [] },
    ...overrides,
  } as RenderEntry
}

function turnEntry(overrides: Partial<RenderEntry> = {}): RenderEntry {
  return {
    kind: "turn",
    key: "turn-1",
    turn: { turnId: "turn-1" } as TurnRecord,
    isLastTurn: false,
    ...overrides,
  } as RenderEntry
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageListEntries", () => {
  beforeEach(() => {
    mockMessageListEntry.mockClear()
  })

  test("renders an ungrouped entry", () => {
    renderEntries({ entries: [ungroupedEntry()] })

    expect(screen.getByTestId("ml-entry-ungrouped-1")).toBeTruthy()
    expect(mockMessageListEntry).toHaveBeenCalledTimes(1)
    const call = mockMessageListEntry.mock.calls[0][0]
    expect(call.entry.kind).toBe("ungrouped")
    expect(call.entry.message.info.id).toBe("m1")
  })

  test("renders a turn entry", () => {
    renderEntries({ entries: [turnEntry()] })

    expect(screen.getByTestId("ml-entry-turn-1")).toBeTruthy()
    expect(mockMessageListEntry).toHaveBeenCalledTimes(1)
    const call = mockMessageListEntry.mock.calls[0][0]
    expect(call.entry.kind).toBe("turn")
    expect(call.entry.isLastTurn).toBe(false)
  })

  test("preserves mixed entry order", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "a" }),
      turnEntry({ key: "b" }),
      ungroupedEntry({ key: "c" }),
    ]

    const { container } = renderEntries({ entries })

    const turnDivs = container.querySelectorAll("[data-turn-entry]")
    expect(turnDivs).toHaveLength(3)
    expect(turnDivs[0].getAttribute("data-turn-entry")).toBe("a")
    expect(turnDivs[1].getAttribute("data-turn-entry")).toBe("b")
    expect(turnDivs[2].getAttribute("data-turn-entry")).toBe("c")
  })

  test("marks trailing streaming entry with full streaming props forwarded", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "a" }),
      turnEntry({ key: "b" }),
    ]
    const trailingStreamingEntry = entries[1]

    renderEntries({
      entries,
      trailingStreamingEntry,
      sessionIsWorking: true,
      activeStreamingMessageId: "msg-b",
      activeStreamingPhase: "streaming" as StreamPhase,
    })

    // Two calls: one for each entry
    expect(mockMessageListEntry).toHaveBeenCalledTimes(2)

    // First entry (a) – non-streaming → streaming props nulled, session off
    const callA = mockMessageListEntry.mock.calls[0][0]
    expect(callA.entry.key).toBe("a")
    expect(callA.sessionIsWorking).toBe(false)
    expect(callA.activeStreamingMessageId).toBeNull()
    expect(callA.activeStreamingPhase).toBeNull()

    // Second entry (b) – streaming → passes through
    const callB = mockMessageListEntry.mock.calls[1][0]
    expect(callB.entry.key).toBe("b")
    expect(callB.sessionIsWorking).toBe(true)
    expect(callB.activeStreamingMessageId).toBe("msg-b")
    expect(callB.activeStreamingPhase).toBe("streaming")
  })

  test("no streaming effects when trailingStreamingEntry is null", () => {
    const entries: RenderEntry[] = [
      ungroupedEntry({ key: "x" }),
      turnEntry({ key: "y", isLastTurn: true }),
    ]

    renderEntries({
      entries,
      trailingStreamingEntry: null,
      sessionIsWorking: true,
      activeStreamingMessageId: "msg-x",
      activeStreamingPhase: "streaming" as StreamPhase,
    })

    expect(mockMessageListEntry).toHaveBeenCalledTimes(2)
    // Without a trailingStreamingEntry match, every entry gets nulled
    // streaming props and false sessionIsWorking
    for (let i = 0; i < 2; i++) {
      const call = mockMessageListEntry.mock.calls[i][0]
      expect(call.sessionIsWorking).toBe(false)
      expect(call.activeStreamingMessageId).toBeNull()
      expect(call.activeStreamingPhase).toBeNull()
    }
  })
})
