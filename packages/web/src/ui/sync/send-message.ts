/**
 * Send-message operations — extracted from session-ui-store.
 *
 * Standalone exported functions for routeMessage and sendMessage.
 * These were originally store actions but are now independent modules
 * that read/write stores directly via getState/setState.
 */

import type { AttachedFile } from "@/stores/types/sessionTypes"
import { opencodeClient } from "@/lib/opencode/client"
import { useProviderConfigStore } from "@/stores/config/useProviderConfigStore"
import { useAgentConfigStore } from "@/stores/agents/useAgentConfigStore"
import { useCommandsStore } from "@/stores/useCommandsStore"
import { useSelectionStore } from "./selection-store"
import { useViewportStore } from "./viewport-store"
import { useSessionFoldersStore } from "@/stores/session/useSessionFoldersStore"
import { getSafeStorage } from "@/stores/utils/safeStorage"
import { markPendingUserSendAnimation } from "@/lib/userSendAnimation"
import { waitForWorktreeBootstrap } from "@/lib/worktrees/worktreeBootstrap"
import { waitForPendingDraftWorktreeRequest } from "@/lib/worktrees/pendingDraftWorktree"
import { getDirectoryState } from "./sync-refs"
import { optimisticSend } from "./session-actions"
import { useSessionUIStore } from "./session-ui-store"
import { parseSessionActionResponse } from "@contracts/notifications"

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

const safeStorage = getSafeStorage()
const DRAFT_TARGET_STORAGE_KEY = "oc.chatInput.lastDraftTarget"

type PersistedDraftTarget = { projectId: string | null; directory: string | null }

const persistDraftTarget = (target: PersistedDraftTarget): void => {
  try {
    safeStorage.setItem(DRAFT_TARGET_STORAGE_KEY, JSON.stringify(target))
  } catch { /* ignored */ }
}

const activateConfigForDirectory = async (directory: string | null | undefined): Promise<void> => {
  await useProviderConfigStore.getState().activateDirectory(normalizePath(directory))
}

// ---------------------------------------------------------------------------
// Send routing — shell mode, slash commands, or normal prompt
// ---------------------------------------------------------------------------

export function routeMessage(params: {
  sessionId: string
  content: string
  providerID: string
  modelID: string
  agent?: string
  variant?: string
  inputMode?: "normal" | "shell"
  files?: Array<{ type: "file"; mime: string; url: string; filename: string }>
  additionalParts?: Array<{ text: string; synthetic?: boolean; files?: Array<{ type: "file"; mime: string; url: string; filename: string }> }>
}): Promise<void> {
  const sdk = opencodeClient.getSdkClient()

  if (params.inputMode === "shell") {
    const dir = opencodeClient.getDirectory() || undefined
    return sdk.session.shell({
      sessionID: params.sessionId,
      directory: dir,
      agent: params.agent,
      model: { providerID: params.providerID, modelID: params.modelID },
      command: params.content,
    }).then(() => {})
  }

  // Slash commands — fire and forget, SSE delivers messages and status
  if (params.content.startsWith("/")) {
    const [head, ...tail] = params.content.split(" ")
    const cmdName = head.slice(1)

    const dirState = getDirectoryState()
    const syncCommands = dirState?.command ?? []
    const storeCommands = useCommandsStore.getState().commands

    const isCommand = syncCommands.find((c) => c.name === cmdName)
      || storeCommands.find((c) => c.name === cmdName)

    if (isCommand) {
      const dir = opencodeClient.getDirectory() || undefined
      return sdk.session.command({
        sessionID: params.sessionId,
        directory: dir,
        command: cmdName,
        arguments: tail.join(" "),
        agent: params.agent,
        model: `${params.providerID}/${params.modelID}`,
        variant: params.variant,
        parts: params.files,
      }).then(() => {})
    }
  }

  // Normal prompt — optimistic insert so message appears instantly
  return optimisticSend({
    sessionId: params.sessionId,
    content: params.content,
    providerID: params.providerID,
    modelID: params.modelID,
    agent: params.agent,
    files: params.files,
    send: (messageID) => opencodeClient.sendMessage({
      id: params.sessionId,
      providerID: params.providerID,
      modelID: params.modelID,
      text: params.content,
      agent: params.agent,
      variant: params.variant,
      files: params.files,
      additionalParts: params.additionalParts,
      messageId: messageID,
    }).then(() => {}),
  })
}

// ---------------------------------------------------------------------------
// sendMessage — calls SDK, reads domain data from sync
// ---------------------------------------------------------------------------

export async function sendMessage(
  content: string,
  providerID: string,
  modelID: string,
  agent?: string,
  attachments?: AttachedFile[],
  agentMentionName?: string,
  additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean }>,
  variant?: string,
  inputMode?: "normal" | "shell",
): Promise<void> {
  const store = useSessionUIStore.getState()

  const draft = store.newSessionDraft
  const trimmedAgent = typeof agent === "string" && agent.trim().length > 0 ? agent.trim() : undefined

  // ---- New session from draft ----
  if (draft?.open) {
    const draftTargetFolderId = draft.targetFolderId
    let draftDirectoryOverride = draft.bootstrapPendingDirectory ?? draft.directoryOverride ?? null
    const draftProjectId = draft.selectedProjectId ?? null

    if (draft.pendingWorktreeRequestId) {
      draftDirectoryOverride = await waitForPendingDraftWorktreeRequest(draft.pendingWorktreeRequestId)
      useSessionUIStore.getState().resolvePendingDraftWorktreeTarget(draft.pendingWorktreeRequestId, draftDirectoryOverride)
    }

    const created = await useSessionUIStore.getState().createSession(draft.title, draftDirectoryOverride, draft.parentID ?? null)
    if (!created?.id) throw new Error("Failed to create session")

    persistDraftTarget({
      projectId: draftProjectId,
      directory: normalizePath(draftDirectoryOverride ?? created.directory ?? null),
    })

    const draftSyntheticParts = draft.syntheticParts
    await activateConfigForDirectory(draftDirectoryOverride ?? created.directory ?? null)

    const providerState = useProviderConfigStore.getState()
    const draftAgentName = useAgentConfigStore.getState().currentAgentName
    const effectiveDraftAgent = trimmedAgent ?? draftAgentName

    if (providerState.currentProviderId && providerState.currentModelId) {
      useSelectionStore.getState().saveSessionModelSelection(created.id, providerState.currentProviderId, providerState.currentModelId)
    }

    if (effectiveDraftAgent) {
      useSelectionStore.getState().saveSessionAgentSelection(created.id, effectiveDraftAgent)
      if (providerState.currentProviderId && providerState.currentModelId) {
        useSelectionStore.getState().saveAgentModelForSession(created.id, effectiveDraftAgent, providerState.currentProviderId, providerState.currentModelId)
        useSelectionStore.getState().saveAgentModelVariantForSession(created.id, effectiveDraftAgent, providerState.currentProviderId, providerState.currentModelId, variant)
      }
    }

    useSessionUIStore.getState().initializeNewOpenChamberSession(created.id, useAgentConfigStore.getState().agents ?? [])

    const createdDirectory = normalizePath(draftDirectoryOverride ?? created.directory ?? null)

    useSessionUIStore.getState().closeNewSessionDraft()
    useSessionUIStore.getState().setCurrentSession(created.id, createdDirectory)

    if (draftTargetFolderId) {
      const scopeKey = draftDirectoryOverride || created.directory || null
      if (scopeKey) {
        useSessionFoldersStore.getState().addSessionToFolder(scopeKey, draftTargetFolderId, created.id)
      }
    }

    const mergedAdditionalParts = draftSyntheticParts?.length
      ? [...(additionalParts || []), ...draftSyntheticParts]
      : additionalParts

    if (createdDirectory) {
      await waitForWorktreeBootstrap(createdDirectory)
    }

    markPendingUserSendAnimation(created.id)

    const files = attachments?.map((a) => ({
      type: "file" as const,
      mime: a.mimeType,
      url: a.dataUrl,
      filename: a.filename,
    }))

    await routeMessage({
      sessionId: created.id,
      content,
      providerID,
      modelID,
      agent: effectiveDraftAgent,
      variant,
      inputMode,
      files,
      additionalParts: mergedAdditionalParts?.map((p) => ({
        text: p.text,
        synthetic: p.synthetic,
        files: p.attachments?.map((a: AttachedFile) => ({
          type: "file" as const,
          mime: a.mimeType,
          url: a.dataUrl,
          filename: a.filename,
        })),
      })),
    })
    return
  }

  // ---- Existing session ----
  const currentSessionId = useSessionUIStore.getState().currentSessionId
  const sessionAgentSelection = currentSessionId
    ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
    : null
  const configAgentName = useAgentConfigStore.getState().currentAgentName
  const effectiveAgent = trimmedAgent || sessionAgentSelection || configAgentName || undefined

  if (currentSessionId && effectiveAgent) {
    useSelectionStore.getState().saveSessionAgentSelection(currentSessionId, effectiveAgent)
    useSelectionStore.getState().saveAgentModelVariantForSession(currentSessionId, effectiveAgent, providerID, modelID, variant)
  }

  if (currentSessionId) {
    const viewportState = useViewportStore.getState()
    const memState = viewportState.sessionMemoryState.get(currentSessionId)
    if (!memState || !memState.lastUserMessageAt) {
      const newMemState = new Map(viewportState.sessionMemoryState)
      newMemState.set(currentSessionId, {
        viewportAnchor: memState?.viewportAnchor ?? 0,
        isStreaming: memState?.isStreaming ?? false,
        lastAccessedAt: Date.now(),
        backgroundMessageCount: memState?.backgroundMessageCount ?? 0,
        lastUserMessageAt: Date.now(),
      })
      useViewportStore.setState({ sessionMemoryState: newMemState })
    }
  }

  const currentSessionDirectory = currentSessionId
    ? normalizePath(useSessionUIStore.getState().getDirectoryForSession(currentSessionId))
    : null
  if (currentSessionDirectory) {
    await waitForWorktreeBootstrap(currentSessionDirectory)
  }

  if (currentSessionId) {
    fetch(`/api/sessions/${currentSessionId}/message-sent`, { method: "POST" })
      .then(async (response) => {
        const parsed = parseSessionActionResponse(await response.json().catch(() => null))
        if (!response.ok || !parsed.ok || parsed.value.sessionId !== currentSessionId || parsed.value.messageSent !== true) throw new Error("Invalid message-sent response")
      })
      .catch(() => { /* ignore */ })
  }

  if (currentSessionId) {
    markPendingUserSendAnimation(currentSessionId)
  }

  const files = attachments?.map((a) => ({
    type: "file" as const,
    mime: a.mimeType,
    url: a.dataUrl,
    filename: a.filename,
  }))

  await routeMessage({
    sessionId: currentSessionId || "",
    content,
    providerID,
    modelID,
    agent: effectiveAgent,
    variant,
    inputMode,
    files,
    additionalParts: additionalParts?.map((p) => ({
      text: p.text,
      synthetic: p.synthetic,
      files: p.attachments?.map((a) => ({
        type: "file" as const,
        mime: a.mimeType,
        url: a.dataUrl,
        filename: a.filename,
      })),
    })),
  })
}
