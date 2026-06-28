/**
 * ChatMessage render coverage.
 *
 * Tests default-exported ChatMessage component mounted inside a Vitest/JSDOM
 * environment with mock child components and real top-level stores.
 */
import { screen } from "@testing-library/react"
import { type ComponentProps } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { Part } from "@/lib/opencode/client"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { seedUIStore } from "./helpers/stores"
import ChatMessage from "@/components/chat/ChatMessage"

// ---------------------------------------------------------------------------
// Hoisted device state shared between mock body and test assertions
// ---------------------------------------------------------------------------
const deviceState = vi.hoisted(() => ({
  isMobile: false,
  hasTouchInput: false,
}))

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({
    isMobile: deviceState.isMobile,
    isTablet: false,
    isDesktop: !deviceState.isMobile,
    deviceType: deviceState.isMobile ? ("mobile" as const) : ("desktop" as const),
    screenWidth: deviceState.isMobile ? 390 : 1280,
    breakpoint: deviceState.isMobile ? ("xs" as const) : ("lg" as const),
    hasTouchInput: deviceState.hasTouchInput || deviceState.isMobile,
  }),
}))

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({
    currentTheme: { id: "test", mode: "dark", metadata: { variant: "dark" } },
  }),
}))

vi.mock("@/lib/theme/syntaxThemeGenerator", () => ({
  generateSyntaxTheme: () => ({
    'code[class*="language-"]': { color: '#000', background: 'transparent' },
  }),
}))

vi.mock("@/sync/session-ui-store", () => {
  let currentSessionIdValue: string | null = "sess-1"
  return {
    useSessionUIStore: Object.assign(
      (selector: (state: Record<string, unknown>) => unknown) =>
        selector({ currentSessionId: currentSessionIdValue }),
      {
        getState: () => ({ currentSessionId: currentSessionIdValue }),
        setState: (patch: { currentSessionId?: string | null }) => {
          if (patch.currentSessionId !== undefined) {
            currentSessionIdValue = patch.currentSessionId
          }
        },
        subscribe: () => () => {},
      },
    ),
  }
})

vi.mock("@/sync/selection-store", () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      getAgentModelForSession: () => null,
      getSessionModelSelection: () => null,
    }),
}))

vi.mock("@/sync/session-actions", () => ({
  revertToMessage: vi.fn(),
  forkFromMessage: vi.fn(),
}))

vi.mock("@/stores/config/useProviderConfigStore", () => ({
  useProviderConfigStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({ providers: [] }),
    {
      getState: () => ({ providers: [] }),
      setState: () => {},
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useFeatureFlagsStore", () => ({
  useFeatureFlagsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ planModeEnabled: false }),
}))

vi.mock("@/stores/contextStore", () => ({
  useContextStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      currentAgentContext: new Map<string, string>(),
      sessionAgentSelections: new Map<string, string>(),
    }),
}))

// ---------------------------------------------------------------------------
// Mock child components – render enough to assert props were passed
// ---------------------------------------------------------------------------

vi.mock("@/components/chat/message/MessageHeader", () => ({
  default: ({
    agentName,
    providerID,
    modelName,
    isUser,
  }: {
    agentName?: string
    providerID?: string | null
    modelName?: string
    isUser: boolean
  }) => (
    <div data-testid="message-header">
      {isUser ? <span>user-header</span> : <span>assistant-header</span>}
      {agentName ? <span data-testid="header-agent-name">{agentName}</span> : null}
      {providerID ? <span data-testid="header-provider-id">{providerID}</span> : null}
      {modelName ? <span data-testid="header-model-name">{modelName}</span> : null}
    </div>
  ),
}))

vi.mock("@/components/chat/message/MessageBody", () => ({
  default: ({
    parts,
    isUser,
    errorMessage,
    children,
  }: {
    parts: Part[]
    isUser: boolean
    errorMessage?: string
    children?: React.ReactNode
  }) => (
    <div data-testid="message-body" data-user={isUser}>
      {errorMessage ? <div data-testid="error-message">{errorMessage}</div> : null}
      {children}
      {parts.map((part, i) => {
        const p = part as { type?: string; text?: string; content?: string }
        return (
          <div key={i} data-testid={`part-${p.type ?? "unknown"}`}>
            {p.text ?? p.content ?? ""}
          </div>
        )
      })}
    </div>
  ),
}))

vi.mock("@/components/chat/message/ToolOutputDialog", () => ({
  default: () => null,
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type MessageProp = ComponentProps<typeof ChatMessage>["message"]
type PreviousMessageProp = ComponentProps<typeof ChatMessage>["previousMessage"]

function assistantMsg(overrides: Partial<MessageProp["info"]> = {}): MessageProp {
  return {
    info: {
      id: "assistant-1",
      sessionID: "sess-1",
      role: "assistant",
      parentID: "user-1",
      modelID: "claude-sonnet-4",
      providerID: "anthropic",
      mode: "code",
      agent: "code",
      time: { created: 1000, completed: 2000 },
      cost: 0,
      tokens: { input: 100, output: 50, reasoning: 0, cache: { read: 0, write: 0 } },
      path: { cwd: "/test", root: "/test" },
      finish: "end_turn",
      ...overrides,
    } as MessageProp["info"],
    parts: [{ id: "p1", sessionID: "sess-1", messageID: "assistant-1", type: "text", text: "Hello from assistant" }] as Part[],
  }
}

function userMsg(overrides: Partial<MessageProp["info"]> = {}): MessageProp {
  return {
    info: {
      id: "user-1",
      sessionID: "sess-1",
      role: "user",
      agent: "",
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      time: { created: 500 },
      ...overrides,
    } as MessageProp["info"],
    parts: [{ id: "p2", sessionID: "sess-1", messageID: "user-1", type: "text", text: "Hello bot" }] as Part[],
  }
}

function prevUserMsg(overrides: Partial<MessageProp["info"]> = {}): PreviousMessageProp {
  return {
    info: {
      id: "prev-user-1",
      sessionID: "sess-1",
      role: "user",
      agent: "code",
      model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
      time: { created: 100 },
      ...overrides,
    } as MessageProp["info"],
    parts: [{ id: "p3", sessionID: "sess-1", messageID: "prev-user-1", type: "text", text: "Previous message" }] as Part[],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatMessage", () => {
  beforeEach(() => {
    deviceState.isMobile = false
    deviceState.hasTouchInput = false
    setViewport(1280)
    // seedUIStore so the real useUIStore has its defaults
    seedUIStore({
      showReasoningTraces: true,
      stickyUserHeader: true,
      chatRenderMode: "live",
      showExpandedBashTools: false,
      showExpandedEditTools: false,
    })
  })

  test("renders an assistant message with header and body", () => {
    renderWithApp(<ChatMessage message={assistantMsg()} />)

    expect(screen.getByTestId("message-header")).toBeTruthy()
    expect(screen.getByTestId("message-body")).toBeTruthy()
    expect(screen.getByText("Hello from assistant")).toBeTruthy()
  })

  test("renders a user message with body but no header", () => {
    renderWithApp(<ChatMessage message={userMsg()} />)

    // User messages render MessageBody but shouldn't render the assistant header
    expect(screen.getByTestId("message-body")).toBeTruthy()
    expect(screen.getByText("Hello bot")).toBeTruthy()
    // Assistant header is not rendered for user messages
    expect(screen.queryByText("assistant-header")).toBeNull()
  })

  test("hides an empty user message entirely", () => {
    const msg: MessageProp = {
      info: {
        id: "empty-user",
        sessionID: "sess-1",
        role: "user",
        agent: "",
        model: { providerID: "anthropic", modelID: "claude-sonnet-4" },
        time: { created: 600 },
      } as MessageProp["info"],
      parts: [],
    }

    const { container } = renderWithApp(<ChatMessage message={msg} />)

    // Component returns null – container should be empty
    expect(container.firstChild).toBeNull()
  })

  test("passes error info to MessageBody for a failed assistant message", () => {
    renderWithApp(
      <ChatMessage
        message={assistantMsg({
          error: { data: { message: "API key authentication failed" } },
        })}
      />,
    )

    expect(screen.getByTestId("error-message")).toBeTruthy()
    // The error text should mention the error detail
    expect(screen.getByTestId("error-message").textContent).toContain("API key")
  })

  test("forwards previous user metadata to assistant header", () => {
    renderWithApp(
      <ChatMessage
        message={assistantMsg({ id: "assistant-2", mode: "", agent: "" })}
        previousMessage={prevUserMsg({ mode: "architect" })}
      />,
    )

    // The assistant has no mode/agent set, so it should fall back to the
    // previous user message's mode as the agent name
    expect(screen.getByTestId("header-agent-name")).toBeTruthy()
    expect(screen.getByTestId("header-agent-name").textContent).toBe("architect")
  })

  test("renders correctly on mobile", () => {
    deviceState.isMobile = true
    setViewport(390, 844)

    renderWithApp(<ChatMessage message={assistantMsg()} />)

    expect(screen.getByTestId("message-header")).toBeTruthy()
    expect(screen.getByTestId("message-body")).toBeTruthy()
  })
})
