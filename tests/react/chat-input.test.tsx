import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act } from "react"
import { beforeEach, describe, expect, test } from "vitest"
import "./helpers/chatInputMocks"
import { chatInputTestFns, chatInputTestState, resetChatInputState } from "./helpers/chatInputMocks"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits, expectUpdateCommitsAtMost } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"
import { ChatInput } from "@/components/chat/ChatInput"
import { useUIStore } from "@/stores/useUIStore"

const { sendMessage, addToQueue, abortCurrentOperation } = chatInputTestFns

describe("ChatInput", () => {
  beforeEach(() => {
    resetChatInputState()
    setViewport(1280)
  })

  test("renders a disabled composer when no session or draft is active", () => {
    chatInputTestState.currentSessionId = null
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
    chatInputTestState.queueModeEnabled = true
    chatInputTestState.sessionPhase = "busy"
    renderWithApp(<ChatInput />, { resetStores: false })

    await user.type(screen.getByLabelText("Chat input"), "queue this")
    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(addToQueue).toHaveBeenCalledTimes(1)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test("renders attached files, queued messages, and review drafts when seeded", () => {
    chatInputTestState.attachedFiles = [{ id: "file-1", filename: "notes.md", mimeType: "text/markdown", size: 42, source: "local" }]
    chatInputTestState.queuedMessages = [{ id: "queued-1" }]
    chatInputTestState.hasInlineDrafts = true

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
    chatInputTestState.sessionPhase = "busy"
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
