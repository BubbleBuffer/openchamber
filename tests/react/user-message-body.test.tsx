import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { Part } from "@/lib/opencode/client"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { UserMessageBody } from "@/components/chat/message/UserMessageBody"

const mocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(async () => ({ ok: true })),
  setCurrentSession: vi.fn(async () => undefined),
}))

vi.mock("@/lib/clipboard", () => ({
  copyTextToClipboard: mocks.copyTextToClipboard,
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ setCurrentSession: mocks.setCurrentSession }),
}))

vi.mock("@/components/chat/FileAttachment", () => ({
  MessageFilesDisplay: () => <div data-testid="message-files" />,
}))

vi.mock("@/components/chat/message/parts/UserTextPart", () => ({
  default: ({
    part,
    agentMention,
  }: {
    part: { text?: string }
    agentMention?: { name: string }
  }) => (
    <div data-testid="user-text" data-agent={agentMention?.name}>
      {part.text}
    </div>
  ),
}))

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const asPart = (part: Record<string, unknown>): Part => part as unknown as Part

const baseProps = {
  messageId: "message-1",
  isMobile: false,
  onShowPopup: vi.fn(),
}

describe("UserMessageBody", () => {
  beforeEach(() => {
    mocks.copyTextToClipboard.mockClear()
    mocks.setCurrentSession.mockClear()
  })

  test("routes a mention to the first matching text part and renders attachments", () => {
    render(
      <UserMessageBody
        {...baseProps}
        parts={[
          asPart({ id: "text-1", type: "text", text: "hello" }),
          asPart({ id: "text-2", type: "text", text: "ask @reviewer now" }),
          asPart({ id: "text-3", type: "text", text: "@reviewer again" }),
        ]}
        agentMention={{ name: "reviewer", token: "@reviewer" }}
      />,
    )

    const textParts = screen.getAllByTestId("user-text")
    expect(textParts[0].getAttribute("data-agent")).toBeNull()
    expect(textParts[1].getAttribute("data-agent")).toBe("reviewer")
    expect(textParts[2].getAttribute("data-agent")).toBeNull()
    expect(screen.getByTestId("message-files")).toBeTruthy()
  })

  test("opens delegated task sessions", () => {
    render(
      <UserMessageBody
        {...baseProps}
        parts={[
          asPart({
            id: "subtask-1",
            type: "subtask",
            description: "Review the change",
            taskSessionID: "child-session",
          }),
        ]}
      />,
    )

    expect(screen.getByText("Review the change")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Open subtask session" }))
    expect(mocks.setCurrentSession).toHaveBeenCalledWith("child-session")
  })

  test("expands and copies shell output", async () => {
    render(
      <UserMessageBody
        {...baseProps}
        parts={[
          asPart({
            id: "shell-1",
            type: "text",
            text: "/shell",
            shellAction: {
              command: "bun test",
              output: "3 pass",
              status: "completed",
            },
          }),
        ]}
      />,
    )

    expect(screen.getByText("bun test")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show output" }))
    expect(screen.getByText("3 pass")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Copy output" }))

    await waitFor(() => {
      expect(mocks.copyTextToClipboard).toHaveBeenCalledWith("3 pass")
    })
  })
})
