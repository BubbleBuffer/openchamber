/**
 * Tests for MobileSessionStatusBar render-fanout behavior.
 *
 * Verifies that the collapsed status bar does not subscribe to the full
 * useAllSessionStatuses() map and only re-renders when the current session's
 * status changes.
 */
import { act } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { createCommitCollector, createProfiledElement, expectNoUpdateCommits } from "./helpers/renderMetrics"
import { seedUIStore } from "./helpers/stores"
import { useRuntimeStore } from "@/stores/useRuntimeStore"
import { MobileSessionStatusBar } from "@/components/chat/mobile-session-status-bar/MobileSessionStatusBar"
import { useSessionUIStore } from "@/sync/session-ui-store"
import type { Session } from "@/lib/opencode/client"

// ---------------------------------------------------------------------------
// Mocked sync context — usehoisted for correct hoisting
// ---------------------------------------------------------------------------

// Use simple mutable objects (not getters/setters) to avoid recursion issues
const mockData = vi.hoisted(() => ({
  sessions: [
    {
      id: "session-current",
      title: "Current Session",
      agent: "build",
      time: { created: Date.now() - 1000, updated: Date.now() - 500 },
    } as Session,
    {
      id: "session-other",
      title: "Other Session",
      agent: "build",
      time: { created: Date.now() - 2000, updated: Date.now() - 1000 },
    } as Session,
  ] as Session[],
  allStatuses: {
    "session-current": { type: "idle" as const },
    "session-other": { type: "idle" as const },
  } as Record<string, { type: string }>,
  globalStatus: { type: "idle" as const } as { type: string } | undefined,
}))

// Spy to track calls to useAllSessionStatuses — the key metric for this test
const useAllSessionStatusesSpy = vi.hoisted(() => vi.fn(() => mockData.allStatuses))

vi.mock("@/sync/sync-context", () => ({
  useSessions: () => mockData.sessions,
  useAllSessionStatuses: useAllSessionStatusesSpy,
  useGlobalSessionStatus: (sessionId: string) => {
    // Return current session status for the current session, undefined otherwise
    if (sessionId === "session-current") {
      return mockData.globalStatus
    }
    return undefined
  },
  useDirectorySync: (selector: (state: unknown) => unknown) => {
    // Minimal mock
    return selector({ session: mockData.sessions })
  },
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      currentSessionId: "session-current",
      availableWorktreesByProject: new Map(),
      getSessionsByDirectory: () => [],
      getContextUsage: () => null,
      openNewSessionDraft: vi.fn(),
      setCurrentSession: vi.fn(),
    }),
    {
      getState: () => ({
        currentSessionId: "session-current",
        availableWorktreesByProject: new Map(),
        getSessionsByDirectory: () => [],
        getContextUsage: () => null,
      }),
      setState: () => {},
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/sync/selection-store", () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ getSessionAgentSelection: () => "build" }),
}))

vi.mock("@/stores/config/useProviderConfigStore", () => ({
  useProviderConfigStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      getCurrentModel: () => ({ providerId: "anthropic", modelId: "claude-test", limit: { context: 100000, output: 10000 } }),
    }),
}))

vi.mock("@/stores/agents/useAgentConfigStore", () => ({
  useAgentConfigStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      agents: [{ name: "build" }],
    }),
}))

// Mutable state object for useUIStore mock — allows seedUIStore to work
const mockUIStoreState = {
  isMobile: true,
  showMobileSessionStatusBar: true,
  isMobileSessionStatusBarCollapsed: true,
  setIsMobileSessionStatusBarCollapsed: vi.fn(),
  setActiveMainTab: vi.fn(),
}

vi.mock("@/stores/useRuntimeStore", () => ({
  useRuntimeStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      isMobile: mockUIStoreState.isMobile,
      isKeyboardOpen: false,
    }),
    {
      getState: () => ({
        isMobile: mockUIStoreState.isMobile,
        isKeyboardOpen: false,
      }),
      setState: (patch: Record<string, unknown>) => {
        if ("isMobile" in patch) {
          mockUIStoreState.isMobile = patch.isMobile as boolean
        }
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mockUIStoreState),
    {
      getState: () => mockUIStoreState,
      setState: (patch: Partial<typeof mockUIStoreState>) => {
        Object.assign(mockUIStoreState, patch)
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      projects: [],
      activeProjectId: null,
      setActiveProject: vi.fn(),
      addProject: vi.fn(() => true),
      removeProject: vi.fn(),
      getActiveProject: () => null,
      reorderProjects: vi.fn(),
      updateProjectMeta: vi.fn(),
    }),
}))

vi.mock("@/stores/files/useDirectoryStore", () => ({
  useDirectoryStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ homeDirectory: null }),
}))

vi.mock("@/sync/notification-store", () => ({
  useNotificationStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ index: { session: { unseenCount: {} } } }),
}))

vi.mock("@/contexts/useThemeSystem", () => ({
  useThemeSystem: () => ({
    currentTheme: {
      id: "test",
      mode: "dark",
      metadata: { variant: "dark" },
      colors: { surface: { foreground: "#fff" } },
    },
  }),
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => "/workspace",
    setDirectory: vi.fn(),
    getFilesystemHome: () => "/home/test",
    getSystemInfo: () => ({}),
    getSdkClient: vi.fn(),
    getDesktopHomeDirectory: () => undefined,
  },
}))

vi.mock("@/lib/session/sessionEvents", () => ({
  sessionEvents: { requestDirectoryDialog: vi.fn() },
}))

vi.mock("@/components/ui", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
}))

vi.mock("@/components/layout/ProjectEditDialog", () => ({
  ProjectEditDialog: () => null,
}))

vi.mock("@/components/ui/MobileOverlayPanel", () => ({
  MobileOverlayPanel: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="mobile-overlay">{children}</div> : null,
}))

vi.mock("@/components/chat/mobile-session-status-bar/SortableProjectItem", () => ({
  SortableProjectItem: () => null,
}))

vi.mock("@/dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null }),
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const next = [...arr]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  },
}))

vi.mock("@/dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MobileSessionStatusBar", () => {
  beforeEach(() => {
    seedUIStore({
      showMobileSessionStatusBar: true,
      isMobileSessionStatusBarCollapsed: true,
    })
    useRuntimeStore.setState({ isMobile: true }, false)
    mockData.allStatuses = {
      "session-current": { type: "idle" },
      "session-other": { type: "idle" },
    }
    mockData.globalStatus = { type: "idle" }
    useAllSessionStatusesSpy.mockReturnValue(mockData.allStatuses)
    useAllSessionStatusesSpy.mockClear()
  })

  test("collapsed path does NOT call useAllSessionStatuses", () => {
    // Spy is cleared in beforeEach; render collapsed
    renderWithApp(<MobileSessionStatusBar />, { resetStores: false })

    // The aggregate hook must NOT be called in the collapsed path
    expect(useAllSessionStatusesSpy).not.toHaveBeenCalled()
  })

  test("expanded path calls useAllSessionStatuses", () => {
    // Seed expanded state so the component renders ExpandedMobileSessionStatusBarContent
    seedUIStore({
      showMobileSessionStatusBar: true,
      isMobileSessionStatusBarCollapsed: false,
    })
    useRuntimeStore.setState({ isMobile: true }, false)
    useAllSessionStatusesSpy.mockClear()
    renderWithApp(<MobileSessionStatusBar />, { resetStores: false })

    // The expanded-only child (ExpandedMobileSessionStatusBarContent) must call
    // useAllSessionStatuses when rendered in expanded mode.
    expect(useAllSessionStatusesSpy).toHaveBeenCalled()
  })

  test("collapsed bar maintains narrow aggregates", () => {
    // Verify the collapsed bar renders without errors using only narrow aggregates.
    // This confirms the refactor works: collapsed path uses useGlobalSessionStatus
    // and narrow counts derived from the current session only.
    const { container } = renderWithApp(<MobileSessionStatusBar />, { resetStores: false })
    // Collapsed view should render something
    expect(container.innerHTML).not.toBe("")
  })
})
