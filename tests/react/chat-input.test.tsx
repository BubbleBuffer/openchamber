import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { act, type ChangeEvent, type KeyboardEvent } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits, expectUpdateCommitsAtMost } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"

const sendMessage = vi.fn<(text: string) => Promise<void>>(async () => undefined)
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
  getDesktopHomeDirectory: () => undefined,
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: { getDirectory: () => "/workspace/openchamber", setDirectory: vi.fn(), getFilesystemHome: () => "/home/test", getSystemInfo: () => ({}), getSdkClient: vi.fn(), getDesktopHomeDirectory: () => undefined },
}))

vi.mock("@/sync/session-actions", () => ({
  get abortCurrentOperation() { return abortCurrentOperation },
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
    getEffectiveModel: () => ({ providerId: "anthropic", modelId: "claude-test" }),
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
  useComposerHistory: () => ({ historyIndex: -1, setHistoryIndex: vi.fn(), navigateHistory: vi.fn(), navigateHistoryUp: vi.fn(), navigateHistoryDown: vi.fn(), userMessageHistory: [], resetHistory: vi.fn() }),
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
