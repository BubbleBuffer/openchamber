/**
 * Shared mocks for ChatInput tests and benchmarks.
 *
 * The vi.mock calls below are hoisted by vitest's transformer to before
 * any imports in the consumer file. Both `tests/react/chat-input.test.tsx`
 * and `tests/perf/chat-input.bench.tsx` import this file for its side
 * effects (the vi.mock registrations) and the exported state/reset helpers.
 *
 * State that must be shared between mock bodies and the test code lives
 * inside `vi.hoisted(...)` so it's initialized before the hoisted mocks
 * are evaluated.
 */
import { vi } from "vitest"

const sendMessage = vi.hoisted(() => vi.fn<(text: string) => Promise<void>>(async () => undefined))
const addToQueue = vi.hoisted(() => vi.fn())
const clearAttachedFiles = vi.hoisted(() => vi.fn())
const consumeDrafts = vi.hoisted(() => vi.fn(() => []))
const abortCurrentOperation = vi.hoisted(() => vi.fn(async () => undefined))

const state = vi.hoisted(() => {
  let currentSessionId: string | null = "sess-1"
  let newSessionDraftOpen = false
  let sessionPhase: "idle" | "busy" = "idle"
  let queueModeEnabled = false
  let queuedMessages: unknown[] = []
  let attachedFiles: Array<{ id: string; filename: string; mimeType: string; size: number; source: string }> = []
  let hasInlineDrafts = false
  return {
    get currentSessionId() { return currentSessionId },
    set currentSessionId(v: string | null) { currentSessionId = v },
    get newSessionDraftOpen() { return newSessionDraftOpen },
    set newSessionDraftOpen(v: boolean) { newSessionDraftOpen = v },
    get sessionPhase() { return sessionPhase },
    set sessionPhase(v: "idle" | "busy") { sessionPhase = v },
    get queueModeEnabled() { return queueModeEnabled },
    set queueModeEnabled(v: boolean) { queueModeEnabled = v },
    get queuedMessages() { return queuedMessages },
    set queuedMessages(v: unknown[]) { queuedMessages = v },
    get attachedFiles() { return attachedFiles },
    set attachedFiles(v: typeof attachedFiles) { attachedFiles = v },
    get hasInlineDrafts() { return hasInlineDrafts },
    set hasInlineDrafts(v: boolean) { hasInlineDrafts = v },
  }
})

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({ currentTheme: { id: "test", mode: "dark" } }),
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => "/workspace/openchamber",
    setDirectory: vi.fn(),
    getFilesystemHome: () => "/home/test",
    getSystemInfo: () => ({}),
    getSdkClient: vi.fn(),
  },
}))

vi.mock("@/sync/session-actions", () => ({
  get abortCurrentOperation() { return abortCurrentOperation },
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      currentSessionId: state.currentSessionId,
      newSessionDraft: state.newSessionDraftOpen ? { open: true } : null,
      abortPromptSessionId: null,
      sendMessage,
      clearAbortPrompt: vi.fn(),
      acknowledgeSessionAbort: vi.fn(),
    }),
    {
      getState: () => ({ currentSessionId: state.currentSessionId, sendMessage }),
      setState: (patch: { currentSessionId?: string | null }) => {
        state.currentSessionId = patch.currentSessionId ?? state.currentSessionId
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/sync/input-store", () => ({
  useInputStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    attachedFiles: state.attachedFiles,
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
    queueModeEnabled: state.queueModeEnabled,
    queuedMessages: { "sess-1": state.queuedMessages },
    addToQueue,
    clearQueue: vi.fn(),
  }),
}))

vi.mock("@/stores/useInlineCommentDraftStore", () => ({
  useInlineCommentDraftStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    drafts: state.hasInlineDrafts ? { "sess-1": [{ id: "draft-1", text: "review" }] } : {},
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
  useCurrentSessionActivity: () => ({ phase: state.sessionPhase, isWorking: state.sessionPhase !== "idle" }),
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
  useComposerHistory: () => ({
    historyIndex: -1,
    setHistoryIndex: vi.fn(),
    navigateHistory: vi.fn(),
    navigateHistoryUp: vi.fn(),
    navigateHistoryDown: vi.fn(),
    userMessageHistory: [] as Array<{ content: string }>,
    resetHistory: vi.fn(),
  }),
}))

vi.mock("@/components/chat/chat-input/ComposerTextarea", () => ({
  ComposerTextarea: ({ value, disabled, currentSessionId, newSessionDraftOpen, inputMode, onChange, onKeyDown }: {
    value: string
    disabled: boolean
    currentSessionId: string | null
    newSessionDraftOpen: boolean
    inputMode: "normal" | "shell"
    onChange: (event: { target: { value: string } }) => void
    onKeyDown: (event: { key: string }) => void
  }) => (
    <textarea
      data-chat-input="true"
      aria-label="Chat input"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event)}
      onKeyDown={(event) => onKeyDown(event)}
      placeholder={currentSessionId || newSessionDraftOpen ? (inputMode === "shell" ? "Enter shell command..." : "@ for files/agents; / for commands; ! for shell") : "Select or create a session to start chatting"}
    />
  ),
}))

vi.mock("@/components/chat/chat-input/ComposerAutocompleteLayer", () => ({ ComposerAutocompleteLayer: () => null }))

vi.mock("@/components/chat/FileAttachment", () => ({
  AttachedFilesList: () =>
    state.attachedFiles.length ? (
      <section aria-label="Attached files">
        {state.attachedFiles.map((file) => <span key={file.id}>{file.filename}</span>)}
      </section>
    ) : null,
}))

vi.mock("@/components/chat/QueuedMessageChips", () => ({
  QueuedMessageChips: () =>
    state.queuedMessages.length ? <section aria-label="Queued messages">Queued {state.queuedMessages.length}</section> : null,
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

export function resetChatInputState(): void {
  state.currentSessionId = "sess-1"
  state.newSessionDraftOpen = false
  state.sessionPhase = "idle"
  state.queueModeEnabled = false
  state.queuedMessages = []
  state.attachedFiles = []
  state.hasInlineDrafts = false
  sendMessage.mockClear()
  addToQueue.mockClear()
  clearAttachedFiles.mockClear()
  consumeDrafts.mockClear()
  abortCurrentOperation.mockClear()
}

export const chatInputTestState = state
export const chatInputTestFns = { sendMessage, addToQueue, clearAttachedFiles, consumeDrafts, abortCurrentOperation }
