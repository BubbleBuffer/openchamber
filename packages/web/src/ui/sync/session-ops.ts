/**
 * Session operations — extracted from session-ui-store.
 *
 * Standalone exported functions for session lifecycle operations.
 * These were originally store actions but are now independent modules
 * that read/write stores directly via getState/setState.
 */

import type { Session } from "@/lib/opencode/client"
import { opencodeClient } from "@/lib/opencode/client"
import { useSessionFoldersStore } from "@/stores/session/useSessionFoldersStore"
import {
  createSession as createSessionAction,
  deleteSession as deleteSessionAction,
  archiveSession as archiveSessionAction,
} from "./session-actions"
import { useSessionUIStore } from "./session-ui-store"

// ---------------------------------------------------------------------------
// createSession — wraps SDK call with draft handling and folder assignment
// ---------------------------------------------------------------------------

export async function createSession(
  title?: string,
  directoryOverride?: string | null,
  parentID?: string | null,
): Promise<Session | null> {
  const draft = useSessionUIStore.getState().newSessionDraft
  const targetFolderId = draft.targetFolderId
  useSessionUIStore.getState().closeNewSessionDraft()

  try {
    const dir = directoryOverride ?? opencodeClient.getDirectory()
    const session = await createSessionAction(title, dir, parentID ?? null)
    if (!session) return null

    if (targetFolderId) {
      const scopeKey = directoryOverride || session.directory
      if (scopeKey) {
        useSessionFoldersStore.getState().addSessionToFolder(scopeKey, targetFolderId, session.id)
      }
    }

    return session
  } catch (e) {
    console.error("[session-ops] createSession failed", e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Batch session operations
// ---------------------------------------------------------------------------

export async function deleteSessions(
  ids: string[],
): Promise<{ deletedIds: string[]; failedIds: string[] }> {
  const deletedIds: string[] = []
  const failedIds: string[] = []
  for (const id of ids) {
    const ok = await deleteSessionAction(id)
    if (ok) deletedIds.push(id)
    else failedIds.push(id)
  }
  return { deletedIds, failedIds }
}

export async function archiveSessions(
  ids: string[],
): Promise<{ archivedIds: string[]; failedIds: string[] }> {
  const archivedIds: string[] = []
  const failedIds: string[] = []
  for (const id of ids) {
    const ok = await archiveSessionAction(id)
    if (ok) archivedIds.push(id)
    else failedIds.push(id)
  }
  return { archivedIds, failedIds }
}
