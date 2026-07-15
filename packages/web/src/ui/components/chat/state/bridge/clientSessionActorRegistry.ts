import { createActor } from 'xstate'
import { createSessionMachine } from '@openchamber/session-state'
import type { SessionActorKey, CreateInitialSessionContextInput } from '@openchamber/session-state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = any

/**
 * Manages the lifecycle of XState v5 session machine actors.
 *
 * Each actor is identified by a SessionActorKey (`directory::sessionId`).
 * Actors are created on-demand via getOrCreate and stopped via evict/dispose.
 */
export class ClientSessionActorRegistry {
  private actors = new Map<SessionActorKey, AnyActor>()

  /**
   * Returns the existing actor for key, or creates a new one from the machine
   * factory and starts it.
   */
  getOrCreate(
    key: SessionActorKey,
    input: CreateInitialSessionContextInput,
  ): AnyActor {
    const existing = this.actors.get(key)
    if (existing) {
      return existing
    }

    const machine = createSessionMachine(input)
    const actor = createActor(machine).start()
    this.actors.set(key, actor)
    return actor
  }

  /**
   * Returns the revision of the actor's current snapshot, or undefined if
   * no actor exists for this key.
   */
  getActorRevision(key: SessionActorKey): number | undefined {
    const actor = this.actors.get(key)
    if (!actor) return undefined
    return actor.getSnapshot()?.context?.revision
  }

  /**
   * Returns true if an actor exists for this key.
   */
  has(key: SessionActorKey): boolean {
    return this.actors.has(key)
  }

  /**
   * Stops and removes the actor for this key. Returns true if an actor was evicted.
   */
  evict(key: SessionActorKey): boolean {
    const actor = this.actors.get(key)
    if (!actor) {
      return false
    }
    actor.stop()
    this.actors.delete(key)
    return true
  }

  /**
   * Stops and removes all actors.
   */
  dispose(): void {
    for (const actor of this.actors.values()) {
      actor.stop()
    }
    this.actors.clear()
  }
}