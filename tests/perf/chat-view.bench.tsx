import { act } from "react"
import { bench, describe, vi } from "vitest"
import { seedUIStore } from "../react/helpers/stores"
import { createCommitCollector, createProfiledElement } from "../react/helpers/renderMetrics"
import { renderWithApp } from "../react/helpers/render"
import { ChatView } from "@/components/views/ChatView"
import { useLayoutStore } from "@/stores/useLayoutStore"
import { useVisualPreferencesStore } from "@/stores/useVisualPreferencesStore"

let currentSessionId: string | null = null

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: { currentSessionId: string | null }) => unknown) => selector({ currentSessionId }),
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
  ChatContainer: () => <main aria-label="Chat container">Chat container</main>,
}))

describe("chat view render perf", () => {
  bench(
    "session id change commit count",
    () => {
      seedUIStore({ settingsPage: "home" })
      useLayoutStore.setState({ isRightSidebarOpen: false }, false)
      currentSessionId = null
      const collector = createCommitCollector("ChatView")
      const { rerender, unmount } = renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
      collector.reset()
      currentSessionId = `sess-${Math.random().toString(36).slice(2)}`
      rerender(createProfiledElement("ChatView", collector, <ChatView />))
      const sample = collector.commits.filter((c) => c.phase !== "mount").length
      if (sample > 1) {
        throw new Error(`session id change produced ${sample} updates; expected at most 1.`)
      }
      unmount()
    },
    { iterations: 3 },
  )

  bench(
    "60-message streaming burst commit count",
    () => {
      seedUIStore({ settingsPage: "home" })
      useLayoutStore.setState({ isRightSidebarOpen: false }, false)
      currentSessionId = "sess-stream"
      const collector = createCommitCollector("ChatView")
      const { unmount } = renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
      collector.reset()
      act(() => {
        for (let i = 0; i < 60; i++) {
          useVisualPreferencesStore.setState({ inputBarOffset: i }, false)
        }
      })
      const sample = collector.commits.filter((c) => c.phase !== "mount").length
      if (sample > 60) {
        throw new Error(`60-message streaming burst produced ${sample} commits; expected at most 60.`)
      }
      unmount()
    },
    { iterations: 3 },
  )
})
