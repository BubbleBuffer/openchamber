/**
 * Shared mocks for SessionSidebar tests.
 *
 * Following the chatInputMocks.tsx pattern: vi.mock calls are hoisted by
 * vitest's transformer to before any imports in the consumer file. Export
 * hoisted mutable state (`sessionSidebarTestState`), a `resetSessionSidebarState()`
 * helper, and factory/seed helpers.
 *
 * All mock bodies are non-throwing stubs returning safe defaults. They are
 * designed so a future test author can seed state through the exported
 * helpers and state object, then run narrow render tests — but the four
 * render tests from the original plan are explicitly deferred per the
 * handoff spec (Recommendation 7).
 */
import { vi } from "vitest"

// ---------------------------------------------------------------------------
// Hoisted state — mutable, shared between mock bodies and test code
// ---------------------------------------------------------------------------
// NOTE: vi.hoisted result cannot be exported directly; assign to a const
// and re-export below.
const _state = vi.hoisted(() => ({
  // Sync context
  liveSessions: [] as Array<Record<string, unknown>>,
  sessionStatuses: {} as Record<string, unknown>,
  sessionsReturn: [] as Array<Record<string, unknown>>,
  syncObj: { syncSession: vi.fn(async () => undefined) },

  // Session UI store
  currentSessionId: null as string | null,
  newSessionDraftOpen: false,
  worktreeMetadata: new Map<string, unknown>(),
  availableWorktreesByProject: new Map<string, unknown[]>(),

  // Global sessions store
  activeSessions: [] as Array<Record<string, unknown>>,
  archivedSessions: [] as Array<Record<string, unknown>>,
  hasLoaded: true,

  // Projects store
  projects: [] as Array<Record<string, unknown>>,
  activeProjectId: null as string | null,

  // Directory store
  homeDirectory: "/home/test",
  currentDirectory: "/workspace/test",
  directoryHistory: [] as string[],
  historyIndex: -1,

  // Session folders store
  foldersMap: {} as Record<string, unknown>,
  collapsedFolderIds: new Set<string>(),

  // Session multi-select store
  multiSelectEnabled: false,
  multiSelectSelectedIds: new Set<string>(),
  multiSelectScopeKey: null as string | null,

  // Git store
  gitBranches: [] as Array<Record<string, unknown>>,
  gitRepoStatusMap: new Map<string, boolean | null>(),

  // GitHub auth store
  gitHubAuthStatus: null as Record<string, unknown> | null,
  gitHubAuthHasChecked: false,

  // GitHub PR status store
  prEntries: {} as Record<string, unknown>,

  // Update store
  updateChecking: false,
  updateAvailable: false,
}))

export const sessionSidebarTestState = _state

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

let sessionCounter = 0
let projectCounter = 0

/**
 * Create a minimal Session-like object for test seeding.
 */
export function makeSidebarSession(
  id?: string,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  sessionCounter += 1
  const sid = id ?? `test-session-${sessionCounter}`
  return {
    id: sid,
    title: `Test Session ${sessionCounter}`,
    directory: "/workspace/test",
    time: { created: Date.now(), updated: Date.now() },
    ...overrides,
  }
}

/**
 * Create a minimal ProjectEntry-like object for test seeding.
 */
export function makeSidebarProject(
  id?: string,
  overrides?: Partial<Record<string, unknown>>,
): Record<string, unknown> {
  projectCounter += 1
  const pid = id ?? `test-project-${projectCounter}`
  return {
    id: pid,
    path: `/workspace/test/project-${projectCounter}`,
    label: `Test Project ${projectCounter}`,
    color: "blue",
    addedAt: Date.now(),
    ...overrides,
  }
}

/**
 * Seed sessionSidebarTestState.activeSessions with n generated sessions.
 */
export function seedSidebarSessions(count: number): void {
  const sessions: Array<Record<string, unknown>> = []
  for (let i = 0; i < count; i++) {
    sessions.push(makeSidebarSession())
  }
  sessionSidebarTestState.activeSessions = sessions
}

/**
 * Seed sessionSidebarTestState.projects with n generated projects.
 */
export function seedSidebarProjects(count: number): void {
  const projects: Array<Record<string, unknown>> = []
  for (let i = 0; i < count; i++) {
    projects.push(makeSidebarProject())
  }
  sessionSidebarTestState.projects = projects
}

// ---------------------------------------------------------------------------
// vi.mock side-effect registrations (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("@/sync/sync-context", () => ({
  useAllLiveSessions: () => sessionSidebarTestState.liveSessions,
  useAllSessionStatuses: () => sessionSidebarTestState.sessionStatuses,
  useSessions: () => sessionSidebarTestState.sessionsReturn,
  useSync: () => sessionSidebarTestState.syncObj,
}))

vi.mock("@/sync/use-sync", () => ({
  useSync: () => sessionSidebarTestState.syncObj,
}))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        currentSessionId: sessionSidebarTestState.currentSessionId,
        newSessionDraft: sessionSidebarTestState.newSessionDraftOpen ? { open: true } : { open: false },
        worktreeMetadata: sessionSidebarTestState.worktreeMetadata,
        availableWorktreesByProject: sessionSidebarTestState.availableWorktreesByProject,
        abortPromptSessionId: null,
        setCurrentSession: vi.fn(),
        openNewSessionDraft: vi.fn(),
        closeNewSessionDraft: vi.fn(),
        updateSessionTitle: vi.fn(),
        shareSession: vi.fn(),
        unshareSession: vi.fn(),
        sendMessage: vi.fn(),
        createSession: vi.fn(),
        deleteSession: vi.fn(),
        deleteSessions: vi.fn(),
        archiveSession: vi.fn(),
        archiveSessions: vi.fn(),
        setWorktreeMetadata: vi.fn(),
        clearAbortPrompt: vi.fn(),
      }),
    {
      getState: () => ({
        currentSessionId: sessionSidebarTestState.currentSessionId,
        newSessionDraft: sessionSidebarTestState.newSessionDraftOpen ? { open: true } : { open: false },
        worktreeMetadata: sessionSidebarTestState.worktreeMetadata,
        availableWorktreesByProject: sessionSidebarTestState.availableWorktreesByProject,
        setCurrentSession: vi.fn(),
      }),
      setState: (patch: Record<string, unknown>) => {
        if ("currentSessionId" in patch) {
          sessionSidebarTestState.currentSessionId = patch.currentSessionId as string | null
        }
        if ("newSessionDraft" in patch) {
          const draft = patch.newSessionDraft as { open?: boolean } | null
          sessionSidebarTestState.newSessionDraftOpen = draft?.open === true
        }
        if ("availableWorktrees" in patch) {
          // store in availableWorktreesByProject is updated by caller
        }
        if ("availableWorktreesByProject" in patch) {
          sessionSidebarTestState.availableWorktreesByProject = patch.availableWorktreesByProject as Map<string, unknown[]>
        }
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useGlobalSessionsStore", () => ({
  useGlobalSessionsStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        activeSessions: sessionSidebarTestState.activeSessions,
        archivedSessions: sessionSidebarTestState.archivedSessions,
        hasLoaded: sessionSidebarTestState.hasLoaded,
        status: "ready",
        loadSessions: vi.fn(async () => ({
          activeSessions: sessionSidebarTestState.activeSessions,
          archivedSessions: sessionSidebarTestState.archivedSessions,
        })),
      }),
    {
      getState: () => ({
        activeSessions: sessionSidebarTestState.activeSessions,
        archivedSessions: sessionSidebarTestState.archivedSessions,
        hasLoaded: sessionSidebarTestState.hasLoaded,
        status: "ready",
        loadSessions: vi.fn(async () => ({
          activeSessions: sessionSidebarTestState.activeSessions,
          archivedSessions: sessionSidebarTestState.archivedSessions,
        })),
        upsertSession: vi.fn(),
        removeSessions: vi.fn(),
        archiveSessions: vi.fn(),
        applySnapshot: vi.fn(),
      }),
      setState: (patch: Record<string, unknown>) => {
        if ("activeSessions" in patch) {
          sessionSidebarTestState.activeSessions = patch.activeSessions as Array<Record<string, unknown>>
        }
        if ("archivedSessions" in patch) {
          sessionSidebarTestState.archivedSessions = patch.archivedSessions as Array<Record<string, unknown>>
        }
        if ("hasLoaded" in patch) {
          sessionSidebarTestState.hasLoaded = patch.hasLoaded as boolean
        }
      },
      subscribe: () => () => {},
    },
  ),
  refreshGlobalSessions: vi.fn(async () => ({
    activeSessions: sessionSidebarTestState.activeSessions,
    archivedSessions: sessionSidebarTestState.archivedSessions,
  })),
}))

vi.mock("@/stores/projects/useProjectsStore", () => ({
  useProjectsStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        projects: sessionSidebarTestState.projects,
        activeProjectId: sessionSidebarTestState.activeProjectId,
        addProject: vi.fn(),
        removeProject: vi.fn(),
        setActiveProject: vi.fn(),
        setActiveProjectIdOnly: vi.fn(),
        renameProject: vi.fn(),
        updateProjectMeta: vi.fn(),
        reorderProjects: vi.fn(),
        getActiveProject: () =>
          sessionSidebarTestState.activeProjectId
            ? sessionSidebarTestState.projects.find(
                (p: Record<string, unknown>) => p.id === sessionSidebarTestState.activeProjectId,
              ) ?? null
            : null,
      }),
    {
      getState: () => ({
        projects: sessionSidebarTestState.projects,
        activeProjectId: sessionSidebarTestState.activeProjectId,
        addProject: vi.fn(),
        removeProject: vi.fn(),
        setActiveProject: vi.fn(),
        setActiveProjectIdOnly: vi.fn(),
        renameProject: vi.fn(),
        updateProjectMeta: vi.fn(),
        reorderProjects: vi.fn(),
        getActiveProject: () =>
          sessionSidebarTestState.activeProjectId
            ? sessionSidebarTestState.projects.find(
                (p: Record<string, unknown>) => p.id === sessionSidebarTestState.activeProjectId,
              ) ?? null
            : null,
      }),
      setState: (patch: Record<string, unknown>) => {
        if ("projects" in patch) {
          sessionSidebarTestState.projects = patch.projects as Array<Record<string, unknown>>
        }
        if ("activeProjectId" in patch) {
          sessionSidebarTestState.activeProjectId = patch.activeProjectId as string | null
        }
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/files/useDirectoryStore", () => ({
  useDirectoryStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        homeDirectory: sessionSidebarTestState.homeDirectory,
        currentDirectory: sessionSidebarTestState.currentDirectory,
        directoryHistory: sessionSidebarTestState.directoryHistory,
        historyIndex: sessionSidebarTestState.historyIndex,
        hasPersistedDirectory: false,
        isHomeReady: true,
        isSwitchingDirectory: false,
        setDirectory: vi.fn(),
        goBack: vi.fn(),
        goForward: vi.fn(),
        goToParent: vi.fn(),
        goHome: vi.fn(async () => undefined),
        synchronizeHomeDirectory: vi.fn(),
      }),
    {
      getState: () => ({
        homeDirectory: sessionSidebarTestState.homeDirectory,
        currentDirectory: sessionSidebarTestState.currentDirectory,
        setDirectory: vi.fn(),
        hasPersistedDirectory: false,
        isHomeReady: true,
      }),
      setState: (patch: Record<string, unknown>) => {
        if ("currentDirectory" in patch) {
          sessionSidebarTestState.currentDirectory = patch.currentDirectory as string
        }
        if ("homeDirectory" in patch) {
          sessionSidebarTestState.homeDirectory = patch.homeDirectory as string
        }
      },
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/session/useSessionFoldersStore", () => ({
  useSessionFoldersStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        foldersMap: sessionSidebarTestState.foldersMap,
        collapsedFolderIds: sessionSidebarTestState.collapsedFolderIds,
        getFoldersForScope: vi.fn(() => []),
        createFolder: vi.fn(),
        renameFolder: vi.fn(),
        deleteFolder: vi.fn(),
        addSessionToFolder: vi.fn(),
        addSessionsToFolder: vi.fn(),
        removeSessionFromFolder: vi.fn(),
        removeSessionsFromFolders: vi.fn(),
        toggleFolderCollapse: vi.fn(),
        cleanupSessions: vi.fn(),
        getSessionFolderId: vi.fn(() => null),
      }),
    {
      getState: () => ({
        foldersMap: sessionSidebarTestState.foldersMap,
        collapsedFolderIds: sessionSidebarTestState.collapsedFolderIds,
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/session/useSessionMultiSelectStore", () => ({
  useSessionMultiSelectStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        enabled: sessionSidebarTestState.multiSelectEnabled,
        selectedIds: sessionSidebarTestState.multiSelectSelectedIds,
        scopeKey: sessionSidebarTestState.multiSelectScopeKey,
        enable: vi.fn(),
        disable: vi.fn(),
        toggleMode: vi.fn(),
        toggleSelected: vi.fn(),
        setRange: vi.fn(),
        replaceAll: vi.fn(),
        clear: vi.fn(),
        removeMany: vi.fn(),
      }),
    {
      getState: () => ({
        enabled: sessionSidebarTestState.multiSelectEnabled,
        selectedIds: sessionSidebarTestState.multiSelectSelectedIds,
        scopeKey: sessionSidebarTestState.multiSelectScopeKey,
        enable: vi.fn(),
        disable: vi.fn(),
        toggleMode: vi.fn(),
        replaceAll: vi.fn(),
        clear: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/git/useGitStore", () => ({
  useGitStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        directories: new Map(),
        activeDirectory: null,
        setActiveDirectory: vi.fn(),
        getDirectoryState: vi.fn(() => null),
        fetchStatus: vi.fn(),
        fetchBranches: vi.fn(),
        fetchLog: vi.fn(),
        fetchAll: vi.fn(),
      }),
    {
      getState: () => ({
        directories: new Map(),
        activeDirectory: null,
        setActiveDirectory: vi.fn(),
        getDirectoryState: vi.fn(() => null),
        fetchStatus: vi.fn(),
        fetchBranches: vi.fn(),
        fetchAll: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
  useGitAllBranches: () => sessionSidebarTestState.gitBranches,
  useGitRepoStatusMap: () => sessionSidebarTestState.gitRepoStatusMap,
  useGitStatus: () => null,
  useGitBranches: () => null,
  useGitLog: () => null,
  useGitIdentity: () => null,
  useIsGitRepo: () => null,
  useGitFileCount: () => 0,
  useGitBranchLabel: () => null,
  useGitLoadingStatus: () => false,
  useGitLoadingLog: () => false,
  useGitLoadingBranches: () => false,
}))

vi.mock("@/stores/github/useGitHubAuthStore", () => ({
  useGitHubAuthStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        status: sessionSidebarTestState.gitHubAuthStatus,
        hasChecked: sessionSidebarTestState.gitHubAuthHasChecked,
        isLoading: false,
        setStatus: vi.fn(),
        refreshStatus: vi.fn(),
      }),
    {
      getState: () => ({
        status: sessionSidebarTestState.gitHubAuthStatus,
        hasChecked: sessionSidebarTestState.gitHubAuthHasChecked,
        isLoading: false,
        setStatus: vi.fn(),
        refreshStatus: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/github/useGitHubPrStatusStore", () => ({
  useGitHubPrStatusStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        entries: sessionSidebarTestState.prEntries,
        ensureEntry: vi.fn(),
        setParams: vi.fn(),
        refreshTargets: vi.fn(),
        getEntry: vi.fn(() => null),
        setEntry: vi.fn(),
        removeEntry: vi.fn(),
        revalidateNow: vi.fn(),
      }),
    {
      getState: () => ({
        entries: sessionSidebarTestState.prEntries,
        ensureEntry: vi.fn(),
        setParams: vi.fn(),
        refreshTargets: vi.fn(),
        getEntry: vi.fn(() => null),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
  getGitHubPrStatusKey: vi.fn((directory: string, branch: string) => `${directory}::${branch}`),
  usePrVisualSummaryByKeys: vi.fn(() => []),
}))

vi.mock("@/stores/useUpdateStore", () => ({
  useUpdateStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        checking: sessionSidebarTestState.updateChecking,
        available: sessionSidebarTestState.updateAvailable,
        info: null,
        error: null,
        checkForUpdates: vi.fn(),
        dismiss: vi.fn(),
        reset: vi.fn(),
      }),
    {
      getState: () => ({
        checking: sessionSidebarTestState.updateChecking,
        available: sessionSidebarTestState.updateAvailable,
        info: null,
        error: null,
        checkForUpdates: vi.fn(),
        dismiss: vi.fn(),
        reset: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useLayoutStore", () => ({
  useLayoutStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        toggleSidebar: vi.fn(),
        isSidebarOpen: true,
        sidebarWidth: 300,
        isRightSidebarOpen: false,
      }),
    {
      getState: () => ({
        toggleSidebar: vi.fn(),
        isSidebarOpen: true,
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useNavigationStore", () => ({
  useNavigationStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        setActiveMainTab: vi.fn(),
        setSessionSwitcherOpen: vi.fn(),
        activeMainTab: "chat",
      }),
    {
      getState: () => ({
        setActiveMainTab: vi.fn(),
        activeMainTab: "chat",
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useRuntimeStore", () => ({
  useRuntimeStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        isMobile: false,
      }),
    {
      getState: () => ({
        isMobile: false,
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        showDeletionDialog: false,
        setShowDeletionDialog: vi.fn(),
      }),
    {
      getState: () => ({}),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useContextPanelStore", () => ({
  useContextPanelStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        openContextPanelTab: vi.fn(),
      }),
    {
      getState: () => ({}),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useNotificationSettingsStore", () => ({
  useNotificationSettingsStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        notifyOnSubtasks: false,
      }),
    {
      getState: () => ({
        notifyOnSubtasks: false,
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/stores/useDialogStore", () => ({
  useDialogStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        setSettingsDialogOpen: vi.fn(),
        toggleHelpDialog: vi.fn(),
        setAboutDialogOpen: vi.fn(),
        setScheduledTasksDialogOpen: vi.fn(),
        openMultiRunLauncher: vi.fn(),
        isSettingsDialogOpen: false,
        isCommandPaletteOpen: false,
        isHelpDialogOpen: false,
        isAboutDialogOpen: false,
        isScheduledTasksDialogOpen: false,
        isMultiRunLauncherOpen: false,
      }),
    {
      getState: () => ({
        setSettingsDialogOpen: vi.fn(),
        toggleHelpDialog: vi.fn(),
      }),
      setState: vi.fn(),
      subscribe: () => () => {},
    },
  ),
}))

vi.mock("@/hooks/useRuntimeAPIs", () => ({
  useRuntimeAPIs: () => ({
    github: {
      authStatus: vi.fn(),
      listPrStatuses: vi.fn(),
      listPullRequests: vi.fn(),
    },
  }),
  useRuntimeAPI: (selector: (api: Record<string, unknown>) => unknown) =>
    selector({
      github: {
        authStatus: vi.fn(),
        listPrStatuses: vi.fn(),
        listPullRequests: vi.fn(),
      },
    }),
}))

vi.mock("@/lib/opencode/client", () => ({
  opencodeClient: {
    getDirectory: () => "/workspace/test",
    setDirectory: vi.fn(),
    getFilesystemHome: () => "/home/test",
    getSdkClient: vi.fn(),
    getSystemInfo: () => ({}),
    getDesktopHomeDirectory: () => undefined,
    sendMessage: vi.fn(),
    listSessions: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    updateSession: vi.fn(),
    getGlobalSessionStatus: vi.fn(),
    getSessionStatusForDirectory: vi.fn(),
  },
}))

vi.mock("@/lib/session/sessionEvents", () => ({
  sessionEvents: {
    onDeleteRequest: vi.fn(() => () => {}),
    requestDelete: vi.fn(),
    onCreateRequest: vi.fn(() => () => {}),
    requestCreate: vi.fn(),
    onDirectoryRequest: vi.fn(() => () => {}),
    requestDirectoryDialog: vi.fn(),
    onGitRefreshHint: vi.fn(() => () => {}),
    requestGitRefresh: vi.fn(),
  },
}))

vi.mock("@/lib/config/openchamberEvents", () => ({
  subscribeOpenchamberEvents: vi.fn(() => () => {}),
}))

vi.mock("@/lib/worktrees/worktreeManager", () => ({
  listProjectWorktrees: vi.fn(async () => []),
  createWorktree: vi.fn(),
  removeProjectWorktree: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Reset helper
// ---------------------------------------------------------------------------

/**
 * Restore all hoisted state to default values.
 * Call in afterEach or beforeEach of tests that mutate state.
 */
export function resetSessionSidebarState(): void {
  sessionSidebarTestState.liveSessions = []
  sessionSidebarTestState.sessionStatuses = {}
  sessionSidebarTestState.sessionsReturn = []
  sessionSidebarTestState.currentSessionId = null
  sessionSidebarTestState.newSessionDraftOpen = false
  sessionSidebarTestState.worktreeMetadata = new Map()
  sessionSidebarTestState.availableWorktreesByProject = new Map()
  sessionSidebarTestState.activeSessions = []
  sessionSidebarTestState.archivedSessions = []
  sessionSidebarTestState.hasLoaded = true
  sessionSidebarTestState.projects = []
  sessionSidebarTestState.activeProjectId = null
  sessionSidebarTestState.homeDirectory = "/home/test"
  sessionSidebarTestState.currentDirectory = "/workspace/test"
  sessionSidebarTestState.directoryHistory = []
  sessionSidebarTestState.historyIndex = -1
  sessionSidebarTestState.foldersMap = {}
  sessionSidebarTestState.collapsedFolderIds = new Set()
  sessionSidebarTestState.multiSelectEnabled = false
  sessionSidebarTestState.multiSelectSelectedIds = new Set()
  sessionSidebarTestState.multiSelectScopeKey = null
  sessionSidebarTestState.gitBranches = []
  sessionSidebarTestState.gitRepoStatusMap = new Map()
  sessionSidebarTestState.gitHubAuthStatus = null
  sessionSidebarTestState.gitHubAuthHasChecked = false
  sessionSidebarTestState.prEntries = {}
  sessionSidebarTestState.updateChecking = false
  sessionSidebarTestState.updateAvailable = false
  sessionCounter = 0
  projectCounter = 0
}
