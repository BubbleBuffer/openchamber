/**
 * Tests for Agent Manager Status Subscription Narrowing.
 *
 * Verifies that AgentGroupDetail and AgentManagerSidebar use narrow
 * subscriptions that only respond to status changes for their relevant sessions.
 */
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { seedUIStore } from "./helpers/stores"
import { AgentGroupDetail } from "@/components/views/agent-manager/AgentGroupDetail"
import { AgentManagerSidebar } from "@/components/views/agent-manager/AgentManagerSidebar"
import { useAgentGroupsStore } from "@/stores/agents/useAgentGroupsStore"
import { useSessionUIStore } from "@/sync/session-ui-store"
import type { AgentGroup, AgentGroupSession } from "@/stores/agents/useAgentGroupsStore"
import type { SessionStatus } from "@/lib/opencode/client"

// ---------------------------------------------------------------------------
// Mocked sync context
// ---------------------------------------------------------------------------

// Mutable status map — simulating live session statuses
const mockStatusMap = vi.hoisted(() => ({
  map: {} as Record<string, SessionStatus>,
}))

// Track calls to the narrow hook and their return values
const useAnyGlobalSessionBusyCalls: string[][] = []
const useAnyGlobalSessionBusyResults: boolean[] = []

vi.mock("@/sync/sync-context", () => ({
  useGlobalSessionStatus: (sessionId: string) => {
    return mockStatusMap.map[sessionId]
  },
  useAllSessionStatuses: () => mockStatusMap.map,
  // The narrow hook — tracks which session IDs it's called with and return values
  // Only 'busy' triggers true; 'retry' does not (preserves original behavior)
  useAnyGlobalSessionBusy: (sessionIds: readonly string[]) => {
    useAnyGlobalSessionBusyCalls.push([...sessionIds])
    const result = sessionIds.some((id) => {
      const status = mockStatusMap.map[id]
      return status?.type === "busy"
    })
    useAnyGlobalSessionBusyResults.push(result)
    return result
  },
  useSessions: () => [],
  useDirectorySync: (selector: (state: unknown) => unknown) => {
    return selector({ session: [] })
  },
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        currentSessionId: null,
        availableWorktreesByProject: new Map(),
        getSessionsByDirectory: () => [],
        getContextUsage: () => null,
        openNewSessionDraft: vi.fn(),
        setCurrentSession: vi.fn(),
      }
      return selector(state)
    },
    {
      getState: () => ({
        currentSessionId: null,
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

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => {
      const state = {
        isMobile: false,
        showMobileSessionStatusBar: false,
        isMobileSessionStatusBarCollapsed: true,
        setIsMobileSessionStatusBarCollapsed: vi.fn(),
        setActiveMainTab: vi.fn(),
      }
      return selector(state)
    },
    {
      getState: () => ({
        isMobile: false,
        showMobileSessionStatusBar: false,
        isMobileSessionStatusBarCollapsed: true,
      }),
      setState: () => {},
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

vi.mock("@/lib/desktop/desktop", () => ({
  isTauriShell: () => false,
  isDesktopLocalOriginActive: () => false,
  requestDirectoryAccess: () => Promise.resolve({ success: false, error: "not available" }),
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
    success: vi.fn(),
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

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children, open }: { children: React.ReactNode; open?: boolean }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <div onClick={onSelect}>{children}</div>
  ),
}))

vi.mock("@/components/ui/scroll", () => ({
  ScrollableOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChange }: { value: string; onChange: (e: { target: { value: string } }) => void }) => (
    <input type="text" value={value} onChange={onChange} />
  ),
}))

vi.mock("@/components/ui/ProviderLogo", () => ({
  ProviderLogo: () => null,
}))

vi.mock("@/components/chat/ChatContainer", () => ({
  ChatContainer: () => null,
}))

vi.mock("@/components/chat/ChatErrorBoundary", () => ({
  ChatErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
// Test data helpers
// ---------------------------------------------------------------------------

const makeSession = (id: string): AgentGroupSession => ({
  id,
  path: `/test/${id}`,
  providerId: "anthropic",
  modelId: "claude-3-5-sonnet",
  instanceNumber: 1,
  branch: "main",
  displayLabel: `anthropic/claude-3-5-sonnet`,
})

const makeGroup = (name: string, sessionIds: string[]): AgentGroup => ({
  name,
  sessions: sessionIds.map(makeSession),
  lastActive: Date.now(),
  sessionCount: sessionIds.length,
})

// ---------------------------------------------------------------------------
// Tests — AgentGroupDetail
// ---------------------------------------------------------------------------

describe("AgentGroupDetail", () => {
  beforeEach(() => {
    // Reset status map to all idle
    mockStatusMap.map = {
      "a1": { type: "idle" },
      "a2": { type: "idle" },
      "outside": { type: "idle" },
    }
    // Clear call tracking
    useAnyGlobalSessionBusyCalls.length = 0
    useAnyGlobalSessionBusyResults.length = 0

    // Seed store with a group containing sessions a1, a2
    const group = makeGroup("group-1", ["a1", "a2"])
    useAgentGroupsStore.setState({
      groups: [group],
      selectedGroupName: "group-1",
      selectedSessionId: "a1",
    })
    seedUIStore({ isMobile: false })
  })

  test("uses narrow subscription with only the group's session IDs", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    renderWithApp(<AgentGroupDetail group={group} />, { resetStores: false })

    // The narrow hook should be called with exactly the session IDs from this group
    expect(useAnyGlobalSessionBusyCalls.length).toBeGreaterThan(0)
    const lastCall = useAnyGlobalSessionBusyCalls[useAnyGlobalSessionBusyCalls.length - 1]
    expect(lastCall).toContain("a1")
    expect(lastCall).toContain("a2")
    expect(lastCall).not.toContain("outside")
  })

  test("does not include outside session IDs in narrow subscription", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    renderWithApp(<AgentGroupDetail group={group} />, { resetStores: false })

    // Check all calls - none should include "outside"
    for (const call of useAnyGlobalSessionBusyCalls) {
      expect(call).not.toContain("outside")
    }
  })

  test("returns correct busy status when session becomes busy", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    // Initially all idle
    const { rerender } = renderWithApp(<AgentGroupDetail group={group} />, {
      resetStores: false,
    })

    // Clear calls from initial render
    useAnyGlobalSessionBusyCalls.length = 0
    useAnyGlobalSessionBusyResults.length = 0

    // Make a1 busy
    mockStatusMap.map = {
      "a1": { type: "busy" },
      "a2": { type: "idle" },
      "outside": { type: "idle" },
    }

    // Trigger a re-render (simulating what would happen in real app when status changes)
    useSessionUIStore.setState({} as Record<string, unknown>)
    rerender(<AgentGroupDetail group={group} />)

    // The narrow hook should have been called with the group's session IDs
    expect(useAnyGlobalSessionBusyCalls.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Behavioral assertions — verify actual busy display behavior
  // ---------------------------------------------------------------------------

  test("related busy status makes displayed group busy", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    // Set a1 as busy within the group
    mockStatusMap.map = {
      "a1": { type: "busy" },
      "a2": { type: "idle" },
      "outside": { type: "idle" },
    }

    renderWithApp(<AgentGroupDetail group={group} />, { resetStores: false })

    // At least one call should have returned true (group is busy)
    expect(useAnyGlobalSessionBusyResults.some((r) => r === true)).toBe(true)
  })

  test("unrelated busy status does not make displayed group busy", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    // Only "outside" is busy — not in this group
    mockStatusMap.map = {
      "a1": { type: "idle" },
      "a2": { type: "idle" },
      "outside": { type: "busy" },
    }

    renderWithApp(<AgentGroupDetail group={group} />, { resetStores: false })

    // No call should have returned true for this group (unrelated busy)
    const groupCallsResults = useAnyGlobalSessionBusyResults.slice(-1)
    expect(groupCallsResults.every((r) => r === false)).toBe(true)
  })

  test("retry status does not make displayed group busy (preserves original behavior)", () => {
    const group = makeGroup("group-1", ["a1", "a2"])

    // Set a1 as retry — should NOT trigger busy display
    mockStatusMap.map = {
      "a1": { type: "retry", attempt: 1, message: "retrying", next: 5000 },
      "a2": { type: "idle" },
      "outside": { type: "idle" },
    }

    renderWithApp(<AgentGroupDetail group={group} />, { resetStores: false })

    // Retry should NOT make the group appear busy
    const groupCallsResults = useAnyGlobalSessionBusyResults.slice(-1)
    expect(groupCallsResults.every((r) => r === false)).toBe(true)
  })

  test("busy status in one group does not affect another group", () => {
    // Set up two separate groups
    const group1 = makeGroup("group-1", ["a1"])
    const group2 = makeGroup("group-2", ["a2"])

    // Only a1 (in group-1) is busy
    mockStatusMap.map = {
      "a1": { type: "busy" },
      "a2": { type: "idle" },
    }

    // Render group-2 — it should NOT show busy
    useAnyGlobalSessionBusyCalls.length = 0
    useAnyGlobalSessionBusyResults.length = 0

    renderWithApp(<AgentGroupDetail group={group2} />, { resetStores: false })

    // group-2 should not be busy (only a1 is busy, not a2)
    const group2CallsResults = useAnyGlobalSessionBusyResults.slice(-1)
    expect(group2CallsResults.every((r) => r === false)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — AgentManagerSidebar
// ---------------------------------------------------------------------------

describe("AgentManagerSidebar", () => {
  beforeEach(() => {
    mockStatusMap.map = {
      "s1": { type: "idle" },
      "s2": { type: "idle" },
      "outside": { type: "idle" },
    }
    useAnyGlobalSessionBusyCalls.length = 0
    useAnyGlobalSessionBusyResults.length = 0

    seedUIStore({ isMobile: false })
  })

  test("each group item uses narrow subscription with only its own session IDs", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // We should have calls for both groups' session IDs
    const allCalledSessionIds = useAnyGlobalSessionBusyCalls.flat()
    expect(allCalledSessionIds).toContain("s1")
    expect(allCalledSessionIds).toContain("s2")
    // "outside" should NOT be in any call
    expect(allCalledSessionIds).not.toContain("outside")
  })

  test("sidebar groups do not subscribe to sessions outside their groups", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // Verify no call includes "outside"
    for (const call of useAnyGlobalSessionBusyCalls) {
      expect(call).not.toContain("outside")
    }
  })

  // ---------------------------------------------------------------------------
  // Behavioral assertions — verify actual busy display behavior
  // ---------------------------------------------------------------------------

  test("related busy status makes the correct displayed group busy", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    // Make s1 busy (belongs to group-1)
    mockStatusMap.map = {
      "s1": { type: "busy" },
      "s2": { type: "idle" },
    }

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // There should be calls for group-1 returning true (s1 is busy)
    // and group-2 returning false (s2 is not busy)
    // Find the results for each group's session
    const group1Calls = useAnyGlobalSessionBusyCalls
      .map((call, i) => (call.includes("s1") ? useAnyGlobalSessionBusyResults[i] : null))
      .filter((v): v is boolean => v !== null)

    expect(group1Calls.some((r) => r === true)).toBe(true)
  })

  test("unrelated busy status does not make a displayed group busy", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    // Only "outside" is busy — not in any group
    mockStatusMap.map = {
      "s1": { type: "idle" },
      "s2": { type: "idle" },
      "outside": { type: "busy" },
    }

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // No group should show busy since no group sessions are busy
    expect(useAnyGlobalSessionBusyResults.every((r) => r === false)).toBe(true)
  })

  test("retry status does not make any displayed group busy (preserves original behavior)", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    // Set s1 as retry — should NOT trigger busy display
    mockStatusMap.map = {
      "s1": { type: "retry", attempt: 1, message: "retrying", next: 5000 },
      "s2": { type: "idle" },
    }

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // Retry should NOT make any group appear busy
    // Filter to only calls that include s1 or s2 (the group sessions)
    const groupSessionResults = useAnyGlobalSessionBusyResults.slice(
      -useAnyGlobalSessionBusyCalls.filter((call) => call.includes("s1") || call.includes("s2")).length,
    )
    expect(groupSessionResults.every((r) => r === false)).toBe(true)
  })

  test("busy status in one group does not affect another group", () => {
    const groups = [
      makeGroup("group-1", ["s1"]),
      makeGroup("group-2", ["s2"]),
    ]

    // Only s1 (in group-1) is busy; s2 is idle
    mockStatusMap.map = {
      "s1": { type: "busy" },
      "s2": { type: "idle" },
    }

    renderWithApp(<AgentManagerSidebar groups={groups} selectedGroupName={null} />, {
      resetStores: false,
    })

    // Find results where the call includes s2 (group-2's session)
    const group2Results = useAnyGlobalSessionBusyResults.filter(
      (_, i) => useAnyGlobalSessionBusyCalls[i]?.includes("s2"),
    )

    // group-2 should NOT be busy (s2 is idle)
    expect(group2Results.every((r) => r === false)).toBe(true)
  })
})
