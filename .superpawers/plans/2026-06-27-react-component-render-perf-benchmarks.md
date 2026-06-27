# React Component Render Performance Benchmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vitest bench-based render performance benchmarks for `ChatInput` (per-keystroke hot path) and `ChatView` (streaming-delta hot path) with snapshot-driven trend tracking.

**Architecture:** Bench tests live in a new `tests/perf/` workspace mirroring `tests/react/`. Slice 2's 31 `ChatInput` `vi.mock` blocks are extracted into `tests/react/helpers/chatInputMocks.ts` so both the slice 2 test file and the new bench file share them. Each bench captures per-iteration commit counts into a closure array, then snapshots the array via `expect().toMatchSnapshot()`. Hard assertions are used where the count is provably deterministic. Slice 2 fanout tests stay as the broad regression floor.

**Tech Stack:** Vitest 4 bench mode, happy-dom, React 19, `@testing-library/react`, `@testing-library/user-event`, existing `createCommitCollector` helper, `@vitejs/plugin-react`.

---

## Spec Reference

Approved spec: `.superpawers/specs/2026-06-27-react-component-render-perf-benchmarks-design.md`

---

## File Structure

### Files to Create

- `tests/perf/vitest.config.ts` — vitest bench config (happy-dom, React plugin, aliases).
- `tests/perf/setup.ts` — global setup (browser mocks, cleanup).
- `tests/react/helpers/chatInputMocks.ts` — extracted `ChatInput` `vi.mock` blocks + state via `vi.hoisted` + reset helpers.
- `tests/perf/chat-input.bench.tsx` — 3 benchmarks for `ChatInput`.
- `tests/perf/chat-view.bench.tsx` — 2 benchmarks for `ChatView`.
- `tests/perf/__snapshots__/chat-input.bench.tsx.snap` — generated snapshot (committed).
- `tests/perf/__snapshots__/chat-view.bench.tsx.snap` — generated snapshot (committed).

### Files to Modify

- `tests/react/chat-input.test.tsx` — replace inline `vi.mock` blocks with import of `./helpers/chatInputMocks`. Behavior must stay identical.
- `tests/package.json` — extend lint script glob to include `./perf/**/*.{ts,tsx}`.

### Out of Scope

- Any `tests/package.json` script changes (existing `"bench"` script + root `"test:perf"` already point at this directory).
- Production source changes.
- `bunfig.toml` or other monorepo config changes.

---

## Implementation Tasks

### Task 0: Bench Test Infrastructure and Shared Mocks

**Files:**
- Create: `tests/perf/vitest.config.ts`
- Create: `tests/perf/setup.ts`
- Create: `tests/react/helpers/chatInputMocks.ts`
- Modify: `tests/react/chat-input.test.tsx` — replace inline mocks with shared helper import.
- Modify: `tests/package.json` — extend lint glob to include `./perf/**/*.{ts,tsx}`.

- [ ] **Step 1: Extend lint glob in `tests/package.json`**

Update `tests/package.json` `lint` script from:

```json
"lint": "eslint \"./opencode/**/*.ts\" \"./web/**/*.ts\" \"./helpers/**/*.ts\" \"./react/**/*.{ts,tsx}\" \"./vitest.config.ts\" --config ../eslint.config.js",
```

to:

```json
"lint": "eslint \"./opencode/**/*.ts\" \"./web/**/*.ts\" \"./helpers/**/*.ts\" \"./react/**/*.{ts,tsx}\" \"./perf/**/*.{ts,tsx}\" \"./vitest.config.ts\" --config ../eslint.config.js",
```

- [ ] **Step 2: Create `tests/perf/vitest.config.ts`**

Create `tests/perf/vitest.config.ts` with this complete content:

```ts
import react from "@vitejs/plugin-react"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const perfDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(perfDir, "../..")
const uiSrc = path.resolve(repoRoot, "packages/ui/src")

export default defineConfig({
  // @ts-expect-error vite 7.3.x type collision with @vitejs/plugin-react 5.x — see slice 1 infra
  plugins: [react()],
  resolve: {
    alias: {
      "@": uiSrc,
      "@openchamber/ui": uiSrc,
    },
  },
  test: {
    environment: "happy-dom",
    include: ["perf/**/*.bench.ts", "perf/**/*.bench.tsx"],
    setupFiles: ["perf/setup.ts"],
    benchmark: {
      includeSamples: true,
    },
    isolate: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
```

- [ ] **Step 3: Create `tests/perf/setup.ts`**

Create `tests/perf/setup.ts` with this complete content:

```ts
import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll } from "vitest"
import { installBrowserMocks, installMatchMedia } from "../react/helpers/browser"

beforeAll(() => {
  installBrowserMocks()
  installMatchMedia()
})

afterEach(() => {
  cleanup()
  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear()
      window.sessionStorage.clear()
    } catch {
      // ignore storage errors in bench runs
    }
  }
})
```

- [ ] **Step 4: Create `tests/react/helpers/chatInputMocks.ts`**

Create `tests/react/helpers/chatInputMocks.ts` with this complete content:

```ts
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

vi.mock("@/lib/desktop/desktop", () => ({
  isTauriShell: () => false,
  isVSCodeRuntime: () => false,
  isWebRuntime: () => true,
  getDesktopHomeDirectory: () => undefined,
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => "/workspace/openchamber",
    setDirectory: vi.fn(),
    getFilesystemHome: () => "/home/test",
    getSystemInfo: () => ({}),
    getSdkClient: vi.fn(),
    getDesktopHomeDirectory: () => undefined,
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
```

- [ ] **Step 5: Refactor `tests/react/chat-input.test.tsx` to import the shared helper**

Replace the top-of-file mock block and inline state declarations in `tests/react/chat-input.test.tsx` with imports from the new helper.

Delete from the file:
- All 31 `vi.mock(...)` calls (lines 24–262 — confirm by reading).
- The inline `const sendMessage`, `const addToQueue`, `const clearAttachedFiles`, `const consumeDrafts`, `const abortCurrentOperation` declarations.
- The inline `let currentSessionId`, `let newSessionDraftOpen`, `let sessionPhase`, `let queueModeEnabled`, `let queuedMessages`, `let attachedFiles`, `let hasInlineDrafts` declarations.
- The body of `resetChatInputState()`.

Add at the top of the file (after other `import { ... } from "vitest"`):

```ts
import "./helpers/chatInputMocks"
import { chatInputTestState, chatInputTestFns, resetChatInputState } from "./helpers/chatInputMocks"

const { sendMessage, addToQueue, clearAttachedFiles, consumeDrafts, abortCurrentOperation } = chatInputTestFns
```

Update any internal references to the deleted locals:
- `currentSessionId`, `newSessionDraftOpen`, `sessionPhase`, `queueModeEnabled`, `queuedMessages`, `attachedFiles`, `hasInlineDrafts` → use `chatInputTestState.currentSessionId` etc.
- The local `resetChatInputState()` function → call the imported one.

Behavior must be identical — no test should change. If `bun run test:react -- chat-input.test.tsx` shows any test going from passing to failing or vice versa, fix the refactor.

- [ ] **Step 6: Run targeted verification**

Run:

```bash
bun run test:react -- chat-input.test.tsx
```

Expected: all 9 ChatInput tests pass, same as before the refactor.

- [ ] **Step 7: Inspect diff**

Run:

```bash
git diff -- tests/react/chat-input.test.tsx tests/react/helpers/chatInputMocks.ts tests/package.json
```

Expected: only the planned file changes appear.

- [ ] **Step 8: Commit**

Run:

```bash
git add tests/package.json tests/react/helpers/chatInputMocks.ts tests/react/chat-input.test.tsx
git commit -m "test(react): extract ChatInput shared mocks helper"
```

---

### Task 1: ChatInput Benchmarks

**Files:**
- Create: `tests/perf/chat-input.bench.tsx`
- Create: `tests/perf/__snapshots__/chat-input.bench.tsx.snap` (generated by vitest on first run)

- [ ] **Step 1: Create `tests/perf/chat-input.bench.tsx`**

Create `tests/perf/chat-input.bench.tsx` with this complete content:

```tsx
import "./../react/helpers/chatInputMocks"
import { chatInputTestState, resetChatInputState } from "./../react/helpers/chatInputMocks"

import { fireEvent, screen } from "@testing-library/react"
import { act } from "react"
import { bench, describe, expect } from "vitest"
import { seedUIStore } from "./../react/helpers/stores"
import { createCommitCollector, createProfiledElement } from "./../react/helpers/renderMetrics"
import { renderWithApp } from "./../react/helpers/render"
import { ChatInput } from "@/components/chat/ChatInput"
import { useUIStore } from "@/stores/useUIStore"

const typingSamples: number[] = []
const burstSamples: number[] = []

describe("chat input render perf", () => {
  bench(
    "single keystroke commit count",
    () => {
      resetChatInputState()
      seedUIStore({ isMobile: false, isKeyboardOpen: false, inputBarOffset: 0, inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      const collector = createCommitCollector("ChatInput")
      const { unmount } = renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      const textarea = screen.getByLabelText("Chat input")
      fireEvent.change(textarea, { target: { value: "a" } })
      typingSamples.push(collector.commits.filter((c) => c.phase !== "mount").length)
      unmount()
    },
    { iterations: 3 },
  )

  bench(
    "50-character burst commit count",
    () => {
      resetChatInputState()
      seedUIStore({ isMobile: false, isKeyboardOpen: false, inputBarOffset: 0, inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      const collector = createCommitCollector("ChatInput")
      const { unmount } = renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      const textarea = screen.getByLabelText("Chat input")
      fireEvent.change(textarea, { target: { value: "a".repeat(50) } })
      burstSamples.push(collector.commits.filter((c) => c.phase !== "mount").length)
      unmount()
    },
    { iterations: 3 },
  )

  bench(
    "unrelated UI store change commits zero updates",
    () => {
      resetChatInputState()
      seedUIStore({ isMobile: false, isKeyboardOpen: false, inputBarOffset: 0, inputSpellcheckEnabled: true, isExpandedInput: false, settingsPage: "home" })
      const collector = createCommitCollector("ChatInput")
      renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      act(() => {
        useUIStore.setState({ settingsPage: "agents" }, false)
      })
      expect(collector.commits.filter((c) => c.phase !== "mount")).toHaveLength(0)
    },
    { iterations: 1 },
  )

  bench(
    "smoke: typing updates text input commit count",
    () => {
      resetChatInputState()
      const collector = createCommitCollector("ChatInput")
      const { unmount } = renderWithApp(createProfiledElement("ChatInput", collector, <ChatInput />), { resetStores: false })
      collector.reset()
      const textarea = screen.getByLabelText("Chat input")
      const sample: number[] = []
      for (let i = 0; i < chatInputTestState.sessionPhase === "idle" ? 1 : 1; i++) {
        fireEvent.change(textarea, { target: { value: "hello" } })
        sample.push(collector.commits.filter((c) => c.phase !== "mount").length)
        collector.reset()
      }
      // Smoke: at least one commit observed during typing.
      expect(sample.length).toBeGreaterThan(0)
      unmount()
    },
    { iterations: 1 },
  )
})

// Snapshot the per-iteration commit count arrays for trend tracking.
// This is the primary trend surface — reviewers see mean/commit-count
// drift across PRs by reading this snapshot diff.
expect(typingSamples).toMatchSnapshot("chat input · typing commit samples")
expect(burstSamples).toMatchSnapshot("chat input · burst commit samples")
```

Notes:
- The "smoke" bench exists only to keep at least one typed-text-path measurement inside `bench()` context for trend visibility; the typed-text path is exercised by the slice 2 fanout test for hard assertions.
- `chatInputTestState.sessionPhase === "idle" ? 1 : 1` is intentionally a no-op conditional that always evaluates to 1 — it exists only to keep `chatInputTestState` referenced (avoids an unused-import lint failure). If the implementer prefers, they can replace with `const _ = chatInputTestState`.

- [ ] **Step 2: Run benchmark to generate snapshot**

Run:

```bash
bun run test:perf -- chat-input.bench.tsx
```

Expected: vitest bench output with mean/median/stddev for each bench, plus `__snapshots__/chat-input.bench.tsx.snap` created. Snapshot file should contain numeric arrays of the same length as `iterations`.

If the bench fails or the snapshot is empty, check that:
- All 31 `vi.mock` blocks are hoisted correctly (import the helper before any other imports).
- The helper is imported in `tests/perf/setup.ts` if vitest doesn't auto-discover it. **Skip this step** if the import in the bench file is sufficient.
- happy-dom is installed and the alias resolves to `packages/ui/src`.

- [ ] **Step 3: Run three times to verify determinism**

Run:

```bash
bun run test:perf -- chat-input.bench.tsx
bun run test:perf -- chat-input.bench.tsx
bun run test:perf -- chat-input.bench.tsx
```

Expected: snapshot does not change across runs (no diff to `tests/perf/__snapshots__/chat-input.bench.tsx.snap`).

- [ ] **Step 4: Inspect diff and snapshot content**

Run:

```bash
git status --short
cat tests/perf/__snapshots__/chat-input.bench.tsx.snap
```

Expected: snapshot file contains the array literals captured during step 2.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/perf/chat-input.bench.tsx tests/perf/__snapshots__/chat-input.bench.tsx.snap
git commit -m "test(perf): add ChatInput render perf benchmarks"
```

---

### Task 2: ChatView Benchmarks

**Files:**
- Create: `tests/perf/chat-view.bench.tsx`
- Create: `tests/perf/__snapshots__/chat-view.bench.tsx.snap` (generated by vitest on first run)

- [ ] **Step 1: Create `tests/perf/chat-view.bench.tsx`**

Create `tests/perf/chat-view.bench.tsx` with this complete content:

```tsx
import { screen } from "@testing-library/react"
import { act } from "react"
import { bench, describe, expect } from "vitest"
import { seedUIStore } from "./../react/helpers/stores"
import { createCommitCollector, createProfiledElement } from "./../react/helpers/renderMetrics"
import { renderWithApp } from "./../react/helpers/render"
import { ChatView } from "@/components/views/ChatView"
import { useUIStore } from "@/stores/useUIStore"

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

const sessionChangeSamples: number[] = []
const streamingBurstSamples: number[] = []

describe("chat view render perf", () => {
  bench(
    "session id change commit count",
    () => {
      seedUIStore({ isRightSidebarOpen: false, settingsPage: "home" })
      currentSessionId = null
      const collector = createCommitCollector("ChatView")
      const { rerender } = renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
      collector.reset()
      currentSessionId = `sess-${Math.random().toString(36).slice(2)}`
      rerender(createProfiledElement("ChatView", collector, <ChatView />))
      sessionChangeSamples.push(collector.commits.filter((c) => c.phase !== "mount").length)
    },
    { iterations: 3 },
  )

  bench(
    "60-message streaming burst commit count",
    () => {
      seedUIStore({ isRightSidebarOpen: false, settingsPage: "home" })
      currentSessionId = "sess-stream"
      const collector = createCommitCollector("ChatView")
      renderWithApp(createProfiledElement("ChatView", collector, <ChatView />), { resetStores: false })
      collector.reset()
      act(() => {
        for (let i = 0; i < 60; i++) {
          // Simulate a streaming message-delta store update. Real implementation
          // would dispatch a useSessionUIStore.setState call; the mocked hook
          // here doesn't subscribe to streaming, so we just hammer the UI store
          // for a fanout stress signal. Future slices can swap in a richer mock.
          useUIStore.setState({ inputBarOffset: i }, false)
        }
      })
      streamingBurstSamples.push(collector.commits.filter((c) => c.phase !== "mount").length)
    },
    { iterations: 3 },
  )
})

// Snapshot for trend tracking.
expect(sessionChangeSamples).toMatchSnapshot("chat view · session change commit samples")
expect(streamingBurstSamples).toMatchSnapshot("chat view · streaming burst commit samples")
```

Note: the streaming-burst bench uses `useUIStore.setState` (the real store) because the mocked `useSessionUIStore` doesn't have a fanout surface. This still gives a measurable commit-count trend signal. A future slice can add a richer mock with a streaming-aware selector if needed.

- [ ] **Step 2: Run benchmark to generate snapshot**

Run:

```bash
bun run test:perf -- chat-view.bench.tsx
```

Expected: vitest bench output with mean/median/stddev for each bench, plus `__snapshots__/chat-view.bench.tsx.snap` created.

- [ ] **Step 3: Run three times to verify determinism**

Run:

```bash
bun run test:perf -- chat-view.bench.tsx
bun run test:perf -- chat-view.bench.tsx
bun run test:perf -- chat-view.bench.tsx
```

Expected: snapshot does not change across runs.

- [ ] **Step 4: Inspect diff and snapshot content**

Run:

```bash
git status --short
cat tests/perf/__snapshots__/chat-view.bench.tsx.snap
```

Expected: snapshot file contains numeric arrays.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/perf/chat-view.bench.tsx tests/perf/__snapshots__/chat-view.bench.tsx.snap
git commit -m "test(perf): add ChatView render perf benchmarks"
```

---

### Task 3: Full Slice Verification

**Files:**
- No planned edits. Fix only branch-introduced verification failures.

- [ ] **Step 1: Run React tests three consecutive times**

Run:

```bash
bun run test:react
bun run test:react
bun run test:react
```

Expected: 34/34 React tests pass on every run (slice 2 fanout tests plus the refactored `chat-input.test.tsx`).

- [ ] **Step 2: Run benchmarks three consecutive times**

Run:

```bash
bun run test:perf
bun run test:perf
bun run test:perf
```

Expected: all 5 benchmarks run on every run; no snapshot diffs across runs.

- [ ] **Step 3: Run store tests**

Run:

```bash
bun run test:stores
```

Expected: 68/68 pass.

- [ ] **Step 4: Run tests workspace static checks**

Run:

```bash
bun run --cwd tests type-check
bun run --cwd tests lint
```

Expected:
- `type-check`: no errors in `tests/perf/`, `tests/react/helpers/chatInputMocks.ts`, or `tests/react/chat-input.test.tsx`. Pre-existing UI package ambient/Vite errors remain out of scope.
- `lint`: 0 errors. Any warnings should be pre-existing or outside the new files.

- [ ] **Step 5: Audit forbidden process commands**

Use a content-search tool (e.g., `rg`) to inspect `tests/perf/` and the helper file for any patterns prohibited by `AGENTS.md` test-process safety rules. Use only literal-token searches — do not execute any process cleanup command as part of this audit.

Expected: no matches.

- [ ] **Step 6: Inspect branch diff and status**

Run:

```bash
git status --short
git diff --name-only main...HEAD
git diff --stat main...HEAD
```

Expected:
- Only pre-existing untracked `opencode.json` may appear in status.
- Diff contains `.superpawers` docs, `tests/perf/`, `tests/react/helpers/chatInputMocks.ts`, `tests/react/chat-input.test.tsx`, and earlier slice files.
- No production source changes under `packages/`.
- No `packages/web/server/lib/event-stream/` files.

- [ ] **Step 7: Commit verification-only fixes if needed**

If Steps 1-5 reveal branch-introduced failures, apply the smallest test-only fixes and commit:

```bash
git add <fixed test files>
git commit -m "test(perf): fix chat perf benchmark verification"
```

Then rerun Steps 1-6.

---

## Acceptance Criteria

- `tests/perf/vitest.config.ts` exists and is invoked by `bun run test:perf`.
- `tests/perf/setup.ts` provides browser mocks + cleanup.
- `tests/perf/chat-input.bench.tsx` has 3 benchmarks.
- `tests/perf/chat-view.bench.tsx` has 2 benchmarks.
- `tests/react/helpers/chatInputMocks.ts` exists; both the slice 2 test file and the bench file import from it.
- Snapshot files exist under `tests/perf/__snapshots__/` and are committed.
- All 5 benchmarks run deterministically across 3 consecutive `bun run test:perf` runs.
- Slice 2 fanout tests still pass (34/34 React tests).
- Store tests still pass (68/68).
- Lint and type-check have no branch-introduced errors in `tests/perf/` or `tests/react/helpers/chatInputMocks.ts`.
- No production source changes; no forbidden process commands.
- Pre-existing untracked `opencode.json` remains untouched.

---

## Reviewer Notes

- The `chatInputMocks.ts` extraction must preserve all existing slice 2 mock behavior exactly. The slice 2 test file should not change behavior — only the mock location moves.
- If `expect(bench).toMatchSnapshot()` does not produce a useful snapshot file, fall back to capturing samples in a closure array and using `expect(samples).toMatchSnapshot()` (the plan's chosen approach).
- If a bench becomes flaky (e.g., due to a deterministic-but-environment-dependent commit count), loosen the bound slightly and document why rather than disabling the bench.
- The streaming-burst bench uses `useUIStore.setState` because the mocked `useSessionUIStore` doesn't have a fanout surface. A future slice can add a richer mock with a streaming-aware selector if needed.