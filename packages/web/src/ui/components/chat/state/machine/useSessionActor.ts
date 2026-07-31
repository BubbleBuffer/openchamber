import { useRef } from 'react'
import { useClientSessionBridge } from '../bridge/clientSessionBridgeContext'
import type { SessionActorKey, SessionSnapshotV1 } from '@openchamber/session-state'
import { createSessionActorKey } from '@openchamber/session-state'

// Re-export options type for convenience
export type { UseSessionActorOptions } from '../bridge/clientSessionBridgeContext'

/**
 * Returns the XState actor for the given session.
 *
 * The actor is retrieved from (or created in) the ClientSessionActorRegistry
 * owned by the nearest ClientSessionMachineBridge provider.
 *
 * @throws If used outside a ClientSessionMachineBridge provider.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSessionActor(directory: string, sessionId: string): any {
  const { getOrRestoreActor } = useClientSessionBridge()

  const actorRef = useRef<unknown>(null)
  const prevKeyRef = useRef<SessionActorKey | null>(null)

  const key = createSessionActorKey(directory, sessionId)

  // If the key changed, get a fresh actor
  if (prevKeyRef.current !== key) {
    actorRef.current = getOrRestoreActor(directory, sessionId)
    prevKeyRef.current = key
  }

  return actorRef.current
}

/**
 * Hook to get or create an actor with a specific snapshot.
 * The actor will be restored from the snapshot if provided.
 */
export function useSessionActorWithSnapshot(
  directory: string,
  sessionId: string,
  snapshot: SessionSnapshotV1 | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const { getOrRestoreActor } = useClientSessionBridge()

  // Always call getOrRestoreActor with the snapshot - the bridge
  // handles the case where the actor already exists
  const actor = getOrRestoreActor(directory, sessionId, snapshot)
  return actor
}