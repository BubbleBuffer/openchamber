import { useCallback, useEffect, useRef } from 'react'
import { createActor } from 'xstate'
import type { Snapshot } from 'xstate'
import { ClientSessionActorRegistry } from './clientSessionActorRegistry'
import { ClientSessionBridgeContext } from './clientSessionBridgeContext'
import { createSessionActorKey, createSessionMachine, restoreSessionMachineSnapshot } from '@openchamber/session-state'
import type { SessionSnapshotV1 } from '@openchamber/session-state'
import {
  __registerSessionSnapshotCallback,
  __unregisterSessionSnapshotCallback,
} from './__sessionSnapshotCallbackBridge'

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

export interface ClientSessionMachineBridgeProps {
  children: React.ReactNode
}

export function ClientSessionMachineBridge({ children }: ClientSessionMachineBridgeProps) {
  const registryRef = useRef<ClientSessionActorRegistry | null>(null)
  if (!registryRef.current) {
    registryRef.current = new ClientSessionActorRegistry()
  }

  const getOrRestoreActor = useCallback(
    (
      directory: string,
      sessionId: string,
      snapshot?: SessionSnapshotV1,
    ) => {
      const registry = registryRef.current!
      const key = createSessionActorKey(directory, sessionId)

      if (snapshot) {
        // Phase 3.5: newer-or-idempotent revision dedupe. Reject older snapshots
        // that would clobber newer state; ignore exact same revision if already
        // applied; accept strictly newer revisions.
        const existingRevision = registry.getActorRevision(key)
        if (existingRevision !== undefined && existingRevision >= snapshot.meta.revision) {
          // Existing actor has same or newer revision — return existing without
          // evicting to avoid unnecessary actor churn.
          return registry.getOrCreate(key, { directory, sessionId, timestamp: snapshot.meta.updatedAt })
        }

        // Strictly newer: evict existing actor if present, then restore.
        if (registry.has(key)) {
          registry.evict(key)
        }
        const machine = createSessionMachine({ directory, sessionId, timestamp: snapshot.meta.updatedAt })
        const restored = restoreSessionMachineSnapshot(machine, snapshot)
        const actor = createActor(machine, { snapshot: restored as Snapshot<unknown> }).start()
        registry['actors'].set(key, actor)
        return actor
      }

      // Fresh actor
      return registry.getOrCreate(key, { directory, sessionId, timestamp: Date.now() })
    },
    [],
  )

  // Register the snapshot restoration callback so the non-React event
  // pipeline can restore actors. Unregister on unmount.
  useEffect(() => {
    const generation = __registerSessionSnapshotCallback((directory, sessionId, snapshot) => {
      getOrRestoreActor(directory, sessionId, snapshot)
    })
    return () => {
      __unregisterSessionSnapshotCallback(generation)
    }
  }, [getOrRestoreActor])

  const value = {
    registry: registryRef.current,
    getOrRestoreActor,
  }

  return (
    <ClientSessionBridgeContext.Provider value={value}>
      {children}
    </ClientSessionBridgeContext.Provider>
  )
}
