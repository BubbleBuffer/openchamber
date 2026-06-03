/**
 * Session UI Store — ephemeral UI state only.
 *
 * Domain data (sessions, messages, parts, permissions, questions, status)
 * lives in sync child stores. This store owns ONLY transient UI concerns:
 * current selection, draft state, viewport anchors, model/agent preferences,
 * voice state, abort prompts, attached files, worktree metadata.
 *
 * Session↔worktree attachments are the authoritative exception: they live in
 * session-worktree-store (shared sync), and session-ui-store routes through it.
 *
 * SDK-calling actions that need domain data read it from sync-refs.
 */

import { create } from "zustand"
import type { Session, Part, Message, TextPart } from "@/lib/opencode/client"
import type { AttachedFile, SessionContextUsage, SessionWorktreeAttachment } from "@/stores/types/sessionTypes"
import type { WorktreeMetadata } from "@/types/worktree"
import { opencodeClient } from "@/lib/opencode/client"
import { useProviderConfigStore } from "@/stores/config/useProviderConfigStore"
import { useAgentConfigStore } from "@/stores/agents/useAgentConfigStore"
import { useProjectsStore } from "@/stores/projects/useProjectsStore"
import { useDirectoryStore } from "@/stores/files/useDirectoryStore"
import { sendMessage as sendMessageImpl } from "./send-message"
import { createSession as createSessionImpl, deleteSessions as deleteSessionsImpl, archiveSessions as archiveSessionsImpl } from "./session-ops"
import { getSafeStorage } from "@/stores/utils/safeStorage"
import { flattenAssistantTextParts } from "@/lib/messages/messageText"
import { EXECUTION_FORK_META_TEXT } from "@/lib/messages/executionMeta"
import { resolveProjectForSessionDirectory } from "@/lib/project/projectResolution"
import {
  getSyncSessions,
  getAllSyncSessions,
  getSyncMessages,
  getSyncParts,
  getDirectoryState,
} from "./sync-refs"
import { markSessionViewed } from "./notification-store"
import { setActiveSession } from "./sync-context"
import {
  deleteSession as deleteSessionAction,
  archiveSession as archiveSessionAction,
  updateSessionTitle as updateSessionTitleAction,
  shareSession as shareSessionAction,
  unshareSession as unshareSessionAction,
} from "./session-actions"
import { useInputStore, type SyntheticContextPart } from "./input-store"
import { useSelectionStore } from "./selection-store"
import { useViewportStore } from "./viewport-store"
import { useSessionWorktreeStore } from "./session-worktree-store"
import { getAttachedSessionDirectory } from "./session-worktree-contract"

export type { AttachedFile }



// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type { SyntheticContextPart } from "./input-store"
export type { SessionMemoryState } from "./viewport-store"

export type NewSessionDraftState = {
  open: boolean
  selectedProjectId?: string | null
  directoryOverride: string | null
  pendingWorktreeRequestId?: string | null
  bootstrapPendingDirectory?: string | null
  preserveDirectoryOverride?: boolean
  parentID: string | null
  title?: string
  initialPrompt?: string
  syntheticParts?: SyntheticContextPart[]
  targetFolderId?: string
}

export type ViewportAnchor = {
  sessionId: string
  value: number
}

export type SessionHistoryMeta = {
  limit: number
  hasMore: boolean
  complete: boolean
  isLoading: boolean
  loading?: boolean
  nextCursor?: string
}

export type SessionUIState = {
  currentSessionId: string | null
  newSessionDraft: NewSessionDraftState
  abortPromptSessionId: string | null
  abortPromptExpiresAt: number | null
  error: string | null
  worktreeMetadata: Map<string, WorktreeMetadata>
  availableWorktrees: WorktreeMetadata[]
  availableWorktreesByProject: Map<string, WorktreeMetadata[]>
  webUICreatedSessions: Set<string>
  sessionAbortFlags: Map<string, { timestamp: number; acknowledged: boolean }>
  abortControllers: Map<string, AbortController>
  isLoading: boolean
  lastLoadedDirectory: string | null
  // Plan mode - per-session plan file availability (set when plan_enter tool creates a plan)
  sessionPlanAvailable: Map<string, boolean>
  markSessionPlanAvailable: (sessionId: string) => void
  isSessionPlanAvailable: (sessionId: string) => boolean

  // Non-Git mode: dismissed signature hash per session, hides bar until new turn arrives
  pendingChangesBarDismissed: Map<string, string>
  dismissPendingChangesBar: (sessionId: string, signature: string | null) => void

  // Actions — UI state management
  setCurrentSession: (id: string | null, directoryHint?: string | null) => void
  openNewSessionDraft: (options?: Partial<NewSessionDraftState>) => void
  closeNewSessionDraft: () => void
  setNewSessionDraftTarget: (target: { projectId?: string | null; selectedProjectId?: string | null; directoryOverride?: string | null }, options?: { force?: boolean }) => void
  setDraftPreserveDirectoryOverride: (value: boolean) => void
  acknowledgeSessionAbort: (sessionId: string) => void
  cleanupSession: (sessionId: string) => void
  clearAbortPrompt: () => void
  armAbortPrompt: (durationMs?: number) => number | null
  clearError: () => void
  markSessionAsOpenChamberCreated: (sessionId: string) => void
  isOpenChamberCreatedSession: (sessionId: string) => boolean
  getContextUsage: (contextLimit: number, outputLimit: number) => SessionContextUsage | null
  initializeNewOpenChamberSession: (sessionId: string, agents: unknown[]) => void
  setWorktreeMetadata: (sessionId: string, metadata: WorktreeMetadata | null) => void
  overrideNewSessionDraftTarget: (options: Record<string, unknown>) => void
  resolvePendingDraftWorktreeTarget: (requestId: string, directory: string | null, options?: Record<string, unknown>) => void
  setDraftBootstrapPendingDirectory: (directory: string | null) => void
  setPendingDraftWorktreeRequest: (requestId: string | null) => void
  getWorktreeMetadata: (sessionId: string) => WorktreeMetadata | undefined

  // Actions — SDK-calling operations (read domain data from sync-refs)
  sendMessage: (
    content: string,
    providerID: string,
    modelID: string,
    agent?: string,
    attachments?: AttachedFile[],
    agentMentionName?: string,
    additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean }>,
    variant?: string,
    inputMode?: "normal" | "shell",
  ) => Promise<void>

  createSession: (title?: string, directoryOverride?: string | null, parentID?: string | null) => Promise<Session | null>
  deleteSession: (id: string, options?: Record<string, unknown>) => Promise<boolean>
  deleteSessions: (ids: string[], options?: Record<string, unknown>) => Promise<{ deletedIds: string[]; failedIds: string[] }>
  archiveSession: (id: string) => Promise<boolean>
  archiveSessions: (ids: string[], options?: Record<string, unknown>) => Promise<{ archivedIds: string[]; failedIds: string[] }>
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>
  shareSession: (sessionId: string) => Promise<Session | null>
  unshareSession: (sessionId: string) => Promise<Session | null>
  revertToMessage: (sessionId: string, messageId: string) => Promise<void>
  forkFromMessage: (sessionId: string, messageId: string) => Promise<void>
  handleSlashUndo: (sessionId: string) => Promise<void>
  handleSlashRedo: (sessionId: string) => Promise<void>
  createSessionFromAssistantMessage: (sourceMessageId: string) => Promise<void>

  // Data access helpers (read from sync)
  getSessionsByDirectory: (directory: string) => Session[]
  getDirectoryForSession: (sessionId: string) => string | null
  getLastUserChoice: (sessionId: string) => { agent?: string; providerID?: string; modelID?: string; variant?: string } | null
  getCurrentAgent: (sessionId: string) => string | undefined
  debugSessionMessages: (sessionId: string) => Promise<void>
  pollForTokenUpdates: () => void
  setSessionDirectory: (sessionId: string, directory: string | null) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalizePath = (value?: string | null): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const replaced = trimmed.replace(/\\/g, "/")
  if (replaced === "/") return "/"
  return replaced.length > 1 ? replaced.replace(/\/+$/, "") : replaced
}

const resolveDirectoryKey = (session: Session): string | null => {
  const sessionRecord = session as Session & {
    directory?: string | null
    project?: { worktree?: string | null } | null
  }
  return normalizePath(sessionRecord.directory ?? null)
    ?? normalizePath(sessionRecord.project?.worktree ?? null)
}

const safeStorage = getSafeStorage()
const DRAFT_TARGET_STORAGE_KEY = "oc.chatInput.lastDraftTarget"

type PersistedDraftTarget = { projectId: string | null; directory: string | null }

const readPersistedDraftTarget = (): PersistedDraftTarget | null => {
  try {
    const raw = safeStorage.getItem(DRAFT_TARGET_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { projectId?: unknown; directory?: unknown }
    return {
      projectId: typeof parsed?.projectId === "string" ? parsed.projectId : null,
      directory: normalizePath(typeof parsed?.directory === "string" ? parsed.directory : null),
    }
  } catch {
    return null
  }
}

const persistDraftTarget = (target: PersistedDraftTarget): void => {
  try {
    safeStorage.setItem(DRAFT_TARGET_STORAGE_KEY, JSON.stringify(target))
  } catch { /* ignored */ }
}

const resolveDraftProjectForDirectory = resolveProjectForSessionDirectory

const getAttachmentForSession = (sessionId: string | null | undefined): SessionWorktreeAttachment | undefined => {
  if (!sessionId) return undefined
  return useSessionWorktreeStore.getState().getAttachment(sessionId)
}

const resolveSessionDirectory = (
  sessionId: string | null | undefined,
  getWtMeta: (id: string) => WorktreeMetadata | undefined,
): string | null => {
  if (!sessionId) return null
  const attachmentDirectory = getAttachedSessionDirectory(getAttachmentForSession(sessionId))
  if (attachmentDirectory) return attachmentDirectory
  const metaPath = getWtMeta(sessionId)?.path
  if (typeof metaPath === "string" && metaPath.trim().length > 0) return normalizePath(metaPath)
  const sessions = getAllSyncSessions()
  const target = sessions.find((s) => s.id === sessionId)
  if (!target) return null
  return resolveDirectoryKey(target)
}

const activateConfigForDirectory = async (directory: string | null | undefined): Promise<void> => {
  await useProviderConfigStore.getState().activateDirectory(normalizePath(directory))
}

const DEFAULT_DRAFT: NewSessionDraftState = {
  open: false,
  directoryOverride: null,
  parentID: null,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSessionUIStore = create<SessionUIState>()((set, get) => ({
  currentSessionId: null,
  newSessionDraft: { ...DEFAULT_DRAFT },
  abortPromptSessionId: null,
  abortPromptExpiresAt: null,
  error: null,
  worktreeMetadata: new Map(),
  availableWorktrees: [],
  availableWorktreesByProject: new Map(),
  webUICreatedSessions: new Set(),
  sessionAbortFlags: new Map(),
  abortControllers: new Map(),
  isLoading: false,
  lastLoadedDirectory: null,
  sessionPlanAvailable: new Map(),
  pendingChangesBarDismissed: new Map(),

  // ---------------------------------------------------------------------------
  // setCurrentSession
  // ---------------------------------------------------------------------------
  setCurrentSession: (id, directoryHint?: string | null) => {
    if (id) {
      get().closeNewSessionDraft()
    }

    const previousSessionId = get().currentSessionId
    const directoryState = useDirectoryStore.getState()

    const sessionDir = resolveSessionDirectory(
      id,
      (sid) => get().worktreeMetadata.get(sid),
    )
    const fallbackDir = opencodeClient.getDirectory() ?? directoryState.currentDirectory ?? null
    const resolvedDir = (directoryHint ? normalizePath(directoryHint) : null) ?? sessionDir ?? fallbackDir

    try {
      if (resolvedDir && directoryState.currentDirectory !== resolvedDir) {
        directoryState.setDirectory(resolvedDir, { showOverlay: false })
      }
      opencodeClient.setDirectory(resolvedDir ?? undefined)
    } catch (e) {
      console.warn("Failed to set OpenCode directory for session switch:", e)
    }

    // Save viewport anchor for previous session
    if (previousSessionId && previousSessionId !== id) {
      const memState = useViewportStore.getState().sessionMemoryState.get(previousSessionId)
      if (!memState?.isStreaming) {
        const prevMessages = getSyncMessages(previousSessionId)
        if (prevMessages.length > 0) {
          useViewportStore.getState().updateViewportAnchor(previousSessionId, prevMessages.length - 1)
        }
      }
    }

    set({ currentSessionId: id })

    // Mark session viewed in notification store + update active session ref
    // Mark session viewed in notification store + update active session ref
    if (id) {
      markSessionViewed(id)
      setActiveSession(resolvedDir ?? "", id)
    }
  },

  // ---------------------------------------------------------------------------
  // openNewSessionDraft
  // ---------------------------------------------------------------------------
  openNewSessionDraft: (options) => {
    const projectsState = useProjectsStore.getState()
    const projects = projectsState.projects
    const availableWorktreesByProject = get().availableWorktreesByProject
    const activeProject = projectsState.getActiveProject()
    const currentDirectory = normalizePath(useDirectoryStore.getState().currentDirectory ?? null)
    const persistedTarget = readPersistedDraftTarget()

    const explicitDirectory = options?.directoryOverride !== undefined
      ? normalizePath(options.directoryOverride)
      : null
    const explicitProject = options?.selectedProjectId
      ? projects.find((p) => p.id === options.selectedProjectId) ?? null
      : null

    const inferredProjectFromDir = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, explicitDirectory)
    const fallbackProject = (() => {
      if (activeProject) return activeProject
      if (projectsState.activeProjectId) return projects.find((p) => p.id === projectsState.activeProjectId) ?? null
      return projects[0] ?? null
    })()

    const persistedProjectById = persistedTarget?.projectId
      ? projects.find((p) => p.id === persistedTarget.projectId) ?? null
      : null
    const persistedProjectByDir = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, persistedTarget?.directory ?? null)
    const currentDirProject = resolveDraftProjectForDirectory(projects, availableWorktreesByProject, currentDirectory)

    const selectedProject = (() => {
      if (explicitProject || explicitDirectory !== null) {
        return explicitProject ?? inferredProjectFromDir ?? fallbackProject
      }
      if (currentDirectory) return currentDirProject ?? fallbackProject
      return persistedProjectByDir ?? persistedProjectById ?? fallbackProject
    })()

    const directory = (() => {
      if (explicitDirectory !== null) return explicitDirectory
      if (explicitProject) return normalizePath(explicitProject.path ?? null)
      if (currentDirectory) return currentDirectory
      if (persistedTarget?.directory) return persistedTarget.directory
      return normalizePath(selectedProject?.path ?? null)
    })()

    persistDraftTarget({ projectId: selectedProject?.id ?? null, directory })

    set({
      newSessionDraft: {
        open: true,
        selectedProjectId: selectedProject?.id ?? null,
        directoryOverride: directory,
        pendingWorktreeRequestId: options?.pendingWorktreeRequestId ?? null,
        bootstrapPendingDirectory: normalizePath(options?.bootstrapPendingDirectory ?? null),
        preserveDirectoryOverride: options?.preserveDirectoryOverride === true,
        parentID: options?.parentID ?? null,
        title: options?.title,
        initialPrompt: options?.initialPrompt,
        syntheticParts: options?.syntheticParts,
        targetFolderId: options?.targetFolderId,
      },
      currentSessionId: null,
      error: null,
    })

    if (options?.initialPrompt) {
      useInputStore.getState().setPendingInputText(options.initialPrompt)
    }

    void activateConfigForDirectory(directory)
  },

  // ---------------------------------------------------------------------------
  // closeNewSessionDraft
  // ---------------------------------------------------------------------------
  closeNewSessionDraft: () => {
    set({
      newSessionDraft: {
        open: false,
        selectedProjectId: null,
        directoryOverride: null,
        pendingWorktreeRequestId: null,
        bootstrapPendingDirectory: null,
        preserveDirectoryOverride: false,
        parentID: null,
        title: undefined,
        initialPrompt: undefined,
        syntheticParts: undefined,
        targetFolderId: undefined,
      },
    })
  },

  setNewSessionDraftTarget: (target) => {
    let nextDirectory: string | null = null
    set((s) => {
      nextDirectory = normalizePath(target.directoryOverride ?? s.newSessionDraft.directoryOverride)
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          selectedProjectId: target.projectId ?? target.selectedProjectId ?? s.newSessionDraft.selectedProjectId,
          directoryOverride: target.directoryOverride ?? s.newSessionDraft.directoryOverride,
        },
      }
    })
    void activateConfigForDirectory(nextDirectory)
  },

  setDraftPreserveDirectoryOverride: (value) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, preserveDirectoryOverride: value } }
    }),

  acknowledgeSessionAbort: (sessionId) =>
    set((s) => {
      const flags = new Map(s.sessionAbortFlags)
      const existing = flags.get(sessionId)
      if (existing) flags.set(sessionId, { ...existing, acknowledged: true })
      return { sessionAbortFlags: flags }
    }),

  cleanupSession: (sessionId) => {
    set((state) => {
      const nextAbortFlags = new Map(state.sessionAbortFlags)
      nextAbortFlags.delete(sessionId)
      const nextAbortControllers = new Map(state.abortControllers)
      const controller = nextAbortControllers.get(sessionId)
      if (controller) { try { controller.abort() } catch { /* ignore */ } nextAbortControllers.delete(sessionId) }
      return { sessionAbortFlags: nextAbortFlags, abortControllers: nextAbortControllers }
    })
  },

  clearAbortPrompt: () => set({ abortPromptSessionId: null, abortPromptExpiresAt: null }),

  armAbortPrompt: (durationMs = 5000) => {
    const { currentSessionId } = get()
    if (!currentSessionId) return null
    const expiresAt = Date.now() + durationMs
    set({ abortPromptSessionId: currentSessionId, abortPromptExpiresAt: expiresAt })
    return expiresAt
  },

  clearError: () => set({ error: null }),

  markSessionAsOpenChamberCreated: (sessionId) =>
    set((s) => {
      const next = new Set(s.webUICreatedSessions)
      next.add(sessionId)
      return { webUICreatedSessions: next }
    }),

  isOpenChamberCreatedSession: (sessionId) => get().webUICreatedSessions.has(sessionId),

  getContextUsage: (contextLimit: number, outputLimit: number) => {
    if (get().newSessionDraft?.open) return null
    const sessionId = get().currentSessionId
    if (!sessionId) return null

    const messages = getSyncMessages(sessionId)
    if (messages.length === 0) return null

    // Find last assistant message with token data
    type AssistantTokens = { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
    let lastTokens: AssistantTokens | undefined
    let lastMessageId: string | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== "assistant") continue
      const tokens = (msg as { tokens?: AssistantTokens }).tokens
      if (!tokens) continue
      const total = tokens.input + tokens.output + tokens.reasoning + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
      if (total > 0) {
        lastTokens = tokens
        lastMessageId = msg.id
        break
      }
    }

    if (!lastTokens) return null

    const totalTokens = lastTokens.input + lastTokens.output + lastTokens.reasoning + (lastTokens.cache?.read ?? 0) + (lastTokens.cache?.write ?? 0)
    const thresholdLimit = contextLimit > 0 ? contextLimit : 200000
    const percentage = contextLimit > 0 ? Math.round((totalTokens / contextLimit) * 100) : 0
    const normalizedOutput = outputLimit > 0 ? Math.round((lastTokens.output / outputLimit) * 100) : undefined

    return {
      totalTokens,
      percentage,
      contextLimit: contextLimit || 0,
      outputLimit: outputLimit || undefined,
      normalizedOutput,
      thresholdLimit,
      lastMessageId,
    }
  },

  initializeNewOpenChamberSession: () => {
    // Stub — was a no-op in old store
  },

  setWorktreeMetadata: (sessionId, metadata) => {
    // Write to authoritative session-worktree-store
    if (metadata) {
      useSessionWorktreeStore.getState().setAttachment(sessionId, {
        worktreeRoot: metadata.worktreeRoot ?? metadata.path ?? null,
        cwd: metadata.path ?? null,
        branch: metadata.branch ?? null,
        headState: metadata.headState ?? (metadata.branch ? 'branch' : 'detached'),
        worktreeStatus: metadata.worktreeStatus ?? 'ready',
        worktreeSource: metadata.worktreeSource ?? null,
        legacy: false,
        degraded: false,
      })
    } else {
      useSessionWorktreeStore.getState().clearAttachment(sessionId)
    }
    // Also keep local map for backward compatibility
    set((s) => {
      const map = new Map(s.worktreeMetadata)
      if (metadata) map.set(sessionId, metadata)
      else map.delete(sessionId)
      return { worktreeMetadata: map }
    })
  },

  overrideNewSessionDraftTarget: (options) => {
    let nextDirectory: string | null = null
    set((s) => {
      const nextDraft = { ...s.newSessionDraft, ...options }
      nextDirectory = normalizePath(
        typeof nextDraft.directoryOverride === "string" ? nextDraft.directoryOverride : null,
      )
      return { newSessionDraft: nextDraft }
    })
    void activateConfigForDirectory(nextDirectory)
  },

  resolvePendingDraftWorktreeTarget: (requestId, directory, options) =>
    set((s) => {
      if (!s.newSessionDraft?.open || s.newSessionDraft.pendingWorktreeRequestId !== requestId) return s
      return {
        newSessionDraft: {
          ...s.newSessionDraft,
          selectedProjectId: (options as Record<string, unknown> | undefined)?.projectId as string ?? s.newSessionDraft.selectedProjectId ?? null,
          directoryOverride: normalizePath(directory),
          pendingWorktreeRequestId: null,
          bootstrapPendingDirectory: normalizePath((options as Record<string, unknown> | undefined)?.bootstrapPendingDirectory as string ?? s.newSessionDraft.bootstrapPendingDirectory ?? null),
          preserveDirectoryOverride: ((options as Record<string, unknown> | undefined)?.preserveDirectoryOverride ?? true) as boolean,
        },
      }
    }),

  setDraftBootstrapPendingDirectory: (directory) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, bootstrapPendingDirectory: normalizePath(directory) } }
    }),

  setPendingDraftWorktreeRequest: (requestId) =>
    set((s) => {
      if (!s.newSessionDraft?.open) return s
      return { newSessionDraft: { ...s.newSessionDraft, pendingWorktreeRequestId: requestId } }
    }),

  getWorktreeMetadata: (sessionId) => get().worktreeMetadata.get(sessionId),

  dismissPendingChangesBar: (sessionId, signature) => {
    const map = new Map(get().pendingChangesBarDismissed);
    if (signature === null) {
      map.delete(sessionId);
    } else {
      map.set(sessionId, signature);
    }
    set({ pendingChangesBarDismissed: map });
  },

  // ---------------------------------------------------------------------------
  // sendMessage — delegates to standalone module
  // ---------------------------------------------------------------------------
  sendMessage: (content, providerID, modelID, agent, attachments, agentMentionName, additionalParts, variant, inputMode) =>
    sendMessageImpl(content, providerID, modelID, agent, attachments, agentMentionName, additionalParts, variant, inputMode),

  // ---------------------------------------------------------------------------
  // createSession — delegates to standalone module
  // ---------------------------------------------------------------------------
  createSession: (title, directoryOverride, parentID) =>
    createSessionImpl(title, directoryOverride, parentID),

  // ---------------------------------------------------------------------------
  // deleteSession — calls SDK, SSE event updates child store
  // ---------------------------------------------------------------------------
  deleteSession: (id) => deleteSessionAction(id),

  deleteSessions: (ids) => deleteSessionsImpl(ids),

  archiveSession: (id) => archiveSessionAction(id),

  archiveSessions: (ids) => archiveSessionsImpl(ids),

  // ---------------------------------------------------------------------------
  // updateSessionTitle — calls SDK, SSE event updates child store
  // ---------------------------------------------------------------------------
  updateSessionTitle: async (sessionId, title) => {
    await updateSessionTitleAction(sessionId, title)
  },

  shareSession: async (sessionId) => {
    return shareSessionAction(sessionId)
  },

  unshareSession: async (sessionId) => {
    return unshareSessionAction(sessionId)
  },

  // ---------------------------------------------------------------------------
  // revertToMessage — delegates to session-actions (single implementation)
  // ---------------------------------------------------------------------------
  revertToMessage: async (sessionId, messageId) => {
    const { revertToMessage: revert } = await import("./session-actions")
    await revert(sessionId, messageId)
  },

  // ---------------------------------------------------------------------------
  // handleSlashUndo — reads from sync
  // ---------------------------------------------------------------------------
  handleSlashUndo: async (sessionId) => {
    const messages = getSyncMessages(sessionId)
    const sessions = getSyncSessions()
    const currentSession = sessions.find((s) => s.id === sessionId)

    const userMessages = messages.filter((m) => m.role === "user")
    if (userMessages.length === 0) return

    const revertToId = currentSession?.revert?.messageID
    let targetMessage: typeof messages[number] | undefined
    if (revertToId) {
      const revertIndex = userMessages.findIndex((m) => m.id === revertToId)
      targetMessage = userMessages[revertIndex + 1]
    } else {
      targetMessage = userMessages[userMessages.length - 1]
    }

    if (!targetMessage) return

    const targetParts = getSyncParts(targetMessage.id)
    const textPart = targetParts.find((p: Part) => p.type === "text") as TextPart | undefined
    const preview = textPart?.text
      ? String(textPart.text).slice(0, 50) + (textPart.text.length > 50 ? "..." : "")
      : "[No text]"

    await get().revertToMessage(sessionId, targetMessage.id)

    const { toast } = await import("sonner")
    toast.success(`Undid to: ${preview}`)
  },

  // ---------------------------------------------------------------------------
  // handleSlashRedo — reads from sync
  // ---------------------------------------------------------------------------
  handleSlashRedo: async (sessionId) => {
    const sessions = getSyncSessions()
    const currentSession = sessions.find((s) => s.id === sessionId)
    const revertToId = currentSession?.revert?.messageID
    if (!revertToId) return

    const messages = getSyncMessages(sessionId)
    const userMessages = messages.filter((m) => m.role === "user")
    const revertIndex = userMessages.findIndex((m) => m.id === revertToId)
    const targetMessage = userMessages[revertIndex - 1]

    if (targetMessage) {
      const targetParts = getSyncParts(targetMessage.id)
      const textPart = targetParts.find((p: Part) => p.type === "text") as TextPart | undefined
      const preview = textPart?.text
        ? String(textPart.text).slice(0, 50) + (textPart.text.length > 50 ? "..." : "")
        : "[No text]"

      await get().revertToMessage(sessionId, targetMessage.id)

      const { toast } = await import("sonner")
      toast.success(`Redid to: ${preview}`)
    } else {
      // Full unrevert
      const { unrevertSession } = await import("./session-actions")
      await unrevertSession(sessionId)

      const { toast } = await import("sonner")
      toast.success("Restored all messages")
    }
  },

  // ---------------------------------------------------------------------------
  // forkFromMessage — delegates to session-actions (handles text + sidebar)
  // ---------------------------------------------------------------------------
  forkFromMessage: async (sessionId, messageId) => {
    const sessions = getSyncSessions()
    const existingSession = sessions.find((s) => s.id === sessionId)
    if (!existingSession) return

    try {
      const { forkFromMessage: fork } = await import("./session-actions")
      await fork(sessionId, messageId)

      const { toast } = await import("sonner")
      toast.success(`Forked from ${existingSession.title}`)
    } catch (error) {
      console.error("Failed to fork session:", error)
      const { toast } = await import("sonner")
      toast.error("Failed to fork session")
    }
  },

  // ---------------------------------------------------------------------------
  // createSessionFromAssistantMessage — reads from sync
  // ---------------------------------------------------------------------------
  createSessionFromAssistantMessage: async (sourceMessageId) => {
    if (!sourceMessageId) return

    // Find which session this message belongs to by scanning sync state
    const state = getDirectoryState()
    if (!state) return

    let sourceSessionId: string | undefined
    let sourceMessage: Message | undefined

    for (const [sid, msgs] of Object.entries(state.message ?? {})) {
      const found = msgs.find((m) => m.id === sourceMessageId)
      if (found) {
        sourceSessionId = sid
        sourceMessage = found
        break
      }
    }

    if (!sourceMessage || sourceMessage.role !== "assistant") return

    const sourceParts = getSyncParts(sourceMessageId)
    const assistantPlanText = flattenAssistantTextParts(sourceParts)
    if (!assistantPlanText.trim()) return

    const directory = resolveSessionDirectory(
      sourceSessionId ?? null,
      (sid) => get().worktreeMetadata.get(sid),
    )

    const session = await get().createSession(undefined, directory ?? null, null)
    if (!session) return

    const { currentProviderId, currentModelId } = useProviderConfigStore.getState()
    const { currentAgentName } = useAgentConfigStore.getState()
    const pID = currentProviderId || useSelectionStore.getState().lastUsedProvider?.providerID
    const mID = currentModelId || useSelectionStore.getState().lastUsedProvider?.modelID

    if (!pID || !mID) return

    await opencodeClient.sendMessage({
      id: session.id,
      providerID: pID,
      modelID: mID,
      text: assistantPlanText,
      prefaceText: EXECUTION_FORK_META_TEXT,
      agent: currentAgentName ?? undefined,
    })
  },

  // ---------------------------------------------------------------------------
  // Data access helpers — read from sync
  // ---------------------------------------------------------------------------
  getSessionsByDirectory: (directory) => {
    const nd = normalizePath(directory)
    if (!nd) return []
    const sessions = getAllSyncSessions()
    return sessions.filter((s) => resolveDirectoryKey(s) === nd)
  },

  getDirectoryForSession: (sessionId) => {
    const attachmentDirectory = getAttachedSessionDirectory(getAttachmentForSession(sessionId))
    if (attachmentDirectory) return attachmentDirectory
    const sessions = getAllSyncSessions()
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) return null
    return resolveDirectoryKey(session)
  },

  getLastUserChoice: (sessionId) => {
    const directory = get().getDirectoryForSession(sessionId) ?? undefined
    const messages = getSyncMessages(sessionId, directory)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i] as Message & {
        model?: { providerID?: string; modelID?: string; variant?: string }
        variant?: string
        mode?: string
      }
      if (message.role !== "user") {
        continue
      }

      const providerID = typeof message.model?.providerID === "string" && message.model.providerID.trim().length > 0
        ? message.model.providerID
        : undefined
      const modelID = typeof message.model?.modelID === "string" && message.model.modelID.trim().length > 0
        ? message.model.modelID
        : undefined
      const agent = typeof message.agent === "string" && message.agent.trim().length > 0
        ? message.agent
        : (typeof message.mode === "string" && message.mode.trim().length > 0 ? message.mode : undefined)
      const variantCandidate = message.model?.variant ?? message.variant
      const variant = typeof variantCandidate === "string" && variantCandidate.trim().length > 0
        ? variantCandidate
        : undefined

      return { agent, providerID, modelID, variant }
    }
    return null
  },

  getCurrentAgent: (sessionId) => {
    return useSelectionStore.getState().sessionAgentSelections.get(sessionId) ?? undefined
  },

  debugSessionMessages: async (sessionId) => {
    const msgs = getSyncMessages(sessionId)
    const sessions = getSyncSessions()
    const session = sessions.find((s) => s.id === sessionId)
    console.log(`Debug session ${sessionId}:`, {
      session,
      messageCount: msgs.length,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        tokens: m.role === "assistant" ? m.tokens : undefined,
      })),
    })
  },

  pollForTokenUpdates: () => {
    // Handled by sync system's SSE stream
  },

  setSessionDirectory: () => {
    // Session directory is owned by sync child stores via SSE events.
    // This is now a no-op — kept for interface compatibility during migration.
  },

  // ---------------------------------------------------------------------------
  // Plan mode availability tracking
  // ---------------------------------------------------------------------------
  markSessionPlanAvailable: (sessionId) => {
    set((state) => {
      const next = new Map(state.sessionPlanAvailable)
      next.set(sessionId, true)
      return { sessionPlanAvailable: next }
    })
  },

  isSessionPlanAvailable: (sessionId) => {
    return get().sessionPlanAvailable.get(sessionId) ?? false
  },
}))

export { sendMessage, routeMessage } from "./send-message"
export { createSession, deleteSessions, archiveSessions } from "./session-ops"
