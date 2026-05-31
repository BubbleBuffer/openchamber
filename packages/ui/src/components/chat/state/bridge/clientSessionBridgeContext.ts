import { createContext, useContext } from 'react'
import { ClientSessionActorRegistry } from './clientSessionActorRegistry'
import type { SessionSnapshotV1 } from '@openchamber/session-state'

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface ClientSessionBridgeContextValue {
  registry: ClientSessionActorRegistry
  /**
   * Gets or creates an actor for the given session.
   * If a snapshot is provided, the actor is restored from that snapshot.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOrRestoreActor: (directory: string, sessionId: string, snapshot?: SessionSnapshotV1) => any
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

export interface UseSessionActorOptions {
  directory: string
  sessionId: string
  /**
   * Optional snapshot to restore the actor from. If provided,
   * the actor will be restored to the snapshot state instead of
   * created fresh.
   */
  snapshot?: SessionSnapshotV1
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const ClientSessionBridgeContext = createContext<ClientSessionBridgeContextValue | null>(null)

// ---------------------------------------------------------------------------
// Hook: useClientSessionBridge
// ---------------------------------------------------------------------------

export function useClientSessionBridge(): ClientSessionBridgeContextValue {
  const ctx = useContext(ClientSessionBridgeContext)
  if (!ctx) {
    throw new Error(
      'useClientSessionBridge must be used within a ClientSessionMachineBridge provider. ' +
        'Wrap your component tree with ClientSessionMachineBridge.',
    )
  }
  return ctx
}