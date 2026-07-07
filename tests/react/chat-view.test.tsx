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
import { useLayoutStore } from "@/stores/useLayoutStore"
import { useUIStore } from "@/stores/useUIStore"

describe("ChatView", () => {
  beforeEach(() => {
    currentSessionId = null
    throwContainerError = false
    seedUIStore({ settingsPage: "home" })
    useLayoutStore.setState({ isRightSidebarOpen: false }, false)
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
      useLayoutStore.setState({ isRightSidebarOpen: true }, false)
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
