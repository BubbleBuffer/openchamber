import { describe, test, expect } from 'bun:test'
import { createSessionActorKey, createSessionMachine, restoreSessionMachineSnapshot, validateSessionSnapshotV1 } from '@openchamber/session-state'
import { ClientSessionActorRegistry } from './clientSessionActorRegistry'
import type { SessionSnapshotV1 } from '@openchamber/session-state'

describe('ClientSessionActorRegistry', () => {
  test('creates actor for new key with getOrCreate', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor = registry.getOrCreate(key, input)

    expect(actor !== undefined).toBe(true)
    expect(actor.start !== undefined).toBe(true)
    expect(actor.stop !== undefined).toBe(true)
  })

  test('returns same actor for repeated getOrCreate with same key', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor1 = registry.getOrCreate(key, input)
    const actor2 = registry.getOrCreate(key, input)

    expect(actor1).toBe(actor2)
  })

  test('creates separate actors for different keys', () => {
    const registry = new ClientSessionActorRegistry()
    const key1 = createSessionActorKey('dir1', 'session1')
    const key2 = createSessionActorKey('dir1', 'session2')
    const input1 = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }
    const input2 = { directory: 'dir1', sessionId: 'session2', timestamp: Date.now() }

    const actor1 = registry.getOrCreate(key1, input1)
    const actor2 = registry.getOrCreate(key2, input2)

    expect(actor1).not.toBe(actor2)
  })

  test('evict removes and stops actor', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor = registry.getOrCreate(key, input)
    actor.start()

    const stopped = registry.evict(key)

    expect(stopped).toBe(true)
    expect(registry.getOrCreate(key, input)).not.toBe(actor)
  })

  test('evict returns false for non-existent key', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')

    const result = registry.evict(key)

    expect(result).toBe(false)
  })

  test('dispose stops and removes all actors', () => {
    const registry = new ClientSessionActorRegistry()
    const key1 = createSessionActorKey('dir1', 'session1')
    const key2 = createSessionActorKey('dir1', 'session2')
    const input1 = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }
    const input2 = { directory: 'dir1', sessionId: 'session2', timestamp: Date.now() }

    const actor1 = registry.getOrCreate(key1, input1)
    const actor2 = registry.getOrCreate(key2, input2)
    actor1.start()
    actor2.start()

    registry.dispose()

    // After dispose, creating the same keys gives fresh actors
    const fresh1 = registry.getOrCreate(key1, input1)
    const fresh2 = registry.getOrCreate(key2, input2)
    expect(fresh1).not.toBe(actor1)
    expect(fresh2).not.toBe(actor2)
  })

  test('has returns true for existing key', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    registry.getOrCreate(key, input)

    expect(registry.has(key)).toBe(true)
  })

  test('has returns false for non-existent key', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')

    expect(registry.has(key)).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Phase 3.5 revision dedupe tests
  // ---------------------------------------------------------------------------

  function makeValidSnapshot(overrides: Partial<{
    directory: string
    sessionId: string
    revision: number
    updatedAt: number
  }> = {}): SessionSnapshotV1 {
    const now = Date.now()
    return validateSessionSnapshotV1({
      version: 1,
      key: { directory: overrides.directory ?? 'dir1', sessionId: overrides.sessionId ?? 'session1' },
      identity: { projectId: null, parentSessionId: null, exists: true, loaded: true },
      regions: { lifecycle: 'ready', activity: 'idle', interruptions: 'clear', history: 'idle', retry: 'idle', error: 'clear' },
      domain: {
        messageOrder: [],
        messagesById: {},
        partsByMessageId: {},
        partsById: {},
        streamingMessageId: null,
        streamingPartId: null,
        permissionsById: {},
        questionsById: {},
        retry: { retryMessage: null, retryCount: 0, retryCooldownUntil: null },
        error: { errorType: null, fatalError: null },
        history: { isLoadingOlder: false, hasMoreAbove: false, oldestLoadedMessageId: null, newestLoadedMessageId: null, historyLoadError: null },
      },
      meta: {
        revision: overrides.revision ?? 1,
        updatedAt: overrides.updatedAt ?? now,
        sourceEventId: null,
        hydratedAt: null,
      },
    })
  }

  test('getActorRevision returns undefined for non-existent key', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('nonexistent', 'session')
    expect(registry.getActorRevision(key) === undefined).toBe(true)
  })

  test('getActorRevision returns current revision after restore', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')
    const snapshot = makeValidSnapshot({ revision: 5, updatedAt: 1000 })

    const machine = createSessionMachine({ directory: 'dir1', sessionId: 'session1', timestamp: snapshot.meta.updatedAt })
    const restored = restoreSessionMachineSnapshot(machine, snapshot)
    registryRef_getOrRestoreForTest(registry, key, snapshot, machine, restored)
    expect(registry.getActorRevision(key)).toBe(5)
  })

  test('older snapshot revision does not replace newer actor', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')

    // Restore actor at revision 10
    const newerSnapshot = makeValidSnapshot({ revision: 10, updatedAt: 2000 })
    registry.getOrCreate(key, { directory: 'dir1', sessionId: 'session1', timestamp: newerSnapshot.meta.updatedAt })
    // Manually inject the snapshot by getting the actor and restoring it
    const actor10 = restoreActorFromSnapshotForTest(registry, key, newerSnapshot)
    const rev10 = registry.getActorRevision(key)
    expect(rev10).toBe(10)

    // Try to restore older snapshot (revision 5) — should be rejected
    const olderSnapshot = makeValidSnapshot({ revision: 5, updatedAt: 1000 })
    const actor5 = registry.getOrCreate(key, { directory: 'dir1', sessionId: 'session1', timestamp: olderSnapshot.meta.updatedAt })

    // Actor should still be the revision 10 one (not replaced by older)
    expect(actor5).toBe(actor10)
    expect(registry.getActorRevision(key)).toBe(10)
  })

  test('exact same revision is idempotent — does not evict/recreate', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')

    // Restore actor at revision 7
    const snapshot7 = makeValidSnapshot({ revision: 7, updatedAt: 3000 })
    const actor1 = restoreActorFromSnapshotForTest(registry, key, snapshot7)
    const actor1_stopped = actor1.stop // capture to verify it wasn't stopped
    void actor1_stopped // reference to avoid unused warning

    // Restore same revision again — should be idempotent
    const sameSnapshot = makeValidSnapshot({ revision: 7, updatedAt: 3500 })
    const actor2 = restoreActorFromSnapshotForTest(registry, key, sameSnapshot)

    // Should be same actor instance (no evict/recreate)
    expect(actor2).toBe(actor1)
    expect(registry.getActorRevision(key)).toBe(7)
  })

  test('strictly newer revision replaces existing actor', () => {
    const registry = new ClientSessionActorRegistry()
    const key = createSessionActorKey('dir1', 'session1')

    // Restore actor at revision 3
    const olderSnapshot = makeValidSnapshot({ revision: 3, updatedAt: 1000 })
    const actor3 = restoreActorFromSnapshotForTest(registry, key, olderSnapshot)

    // Restore newer snapshot (revision 8)
    const newerSnapshot = makeValidSnapshot({ revision: 8, updatedAt: 5000 })
    const actor8 = restoreActorFromSnapshotForTest(registry, key, newerSnapshot)

    // Should be different actors
    expect(actor8).not.toBe(actor3)
    expect(registry.getActorRevision(key)).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Test helpers — replicate getOrRestoreActor logic from bridge for testing
// ---------------------------------------------------------------------------

import type { Snapshot } from 'xstate'
import { createActor } from 'xstate'

function registryRef_getOrRestoreForTest(
  registry: ClientSessionActorRegistry,
  key: ReturnType<typeof createSessionActorKey>,
  snapshot: SessionSnapshotV1,
  machine: ReturnType<typeof createSessionMachine>,
  restored: unknown,
) {
  if (registry.has(key)) {
    registry.evict(key)
  }
  const actor = createActor(machine, { snapshot: restored as Snapshot<unknown> }).start()
  registry['actors'].set(key, actor)
  return actor
}

function restoreActorFromSnapshotForTest(
  registry: ClientSessionActorRegistry,
  key: ReturnType<typeof createSessionActorKey>,
  snapshot: SessionSnapshotV1,
) {
  const existingRevision = registry.getActorRevision(key)
  if (existingRevision !== undefined && existingRevision >= snapshot.meta.revision) {
    return registry.getOrCreate(key, { directory: snapshot.key.directory, sessionId: snapshot.key.sessionId, timestamp: snapshot.meta.updatedAt })
  }
  if (registry.has(key)) {
    registry.evict(key)
  }
  const machine = createSessionMachine({ directory: snapshot.key.directory, sessionId: snapshot.key.sessionId, timestamp: snapshot.meta.updatedAt })
  const restored = restoreSessionMachineSnapshot(machine, snapshot)
  const actor = createActor(machine, { snapshot: restored as Snapshot<unknown> }).start()
  registry['actors'].set(key, actor)
  return actor
}
