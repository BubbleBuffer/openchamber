import { useCallback, useRef } from 'react'
import { createActor } from 'xstate'
import type { Snapshot } from 'xstate'
import { ClientSessionActorRegistry } from './clientSessionActorRegistry'
import { ClientSessionBridgeContext } from './clientSessionBridgeContext'
import { createSessionActorKey, createSessionMachine, restoreSessionMachineSnapshot } from '@openchamber/session-state'
import type { SessionSnapshotV1 } from '@openchamber/session-state'

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
        // Restore from snapshot
        const machine = createSessionMachine({ directory, sessionId, timestamp: snapshot.meta.updatedAt })
        const restored = restoreSessionMachineSnapshot(machine, snapshot)
        // Evict existing actor if present
        if (registry.has(key)) {
          registry.evict(key)
        }
        // Create actor with the restored snapshot
        const actor = createActor(machine, { snapshot: restored as Snapshot<unknown> }).start()
        registry['actors'].set(key, actor)
        return actor
      }

      // Fresh actor
      return registry.getOrCreate(key, { directory, sessionId, timestamp: Date.now() })
    },
    [],
  )

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