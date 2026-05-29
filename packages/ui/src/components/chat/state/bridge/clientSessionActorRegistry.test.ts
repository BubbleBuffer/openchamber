import { describe, test, expect, beforeEach } from 'bun:test'
import { createSessionActorKey } from '@openchamber/session-state'
import { ClientSessionActorRegistry } from './clientSessionActorRegistry'

describe('ClientSessionActorRegistry', () => {
  let registry: ClientSessionActorRegistry

  beforeEach(() => {
    registry = new ClientSessionActorRegistry()
  })

  test('creates actor for new key with getOrCreate', () => {
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor = registry.getOrCreate(key, input)

    expect(actor).toBeDefined()
    expect(actor.start).toBeDefined()
    expect(actor.stop).toBeDefined()
  })

  test('returns same actor for repeated getOrCreate with same key', () => {
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor1 = registry.getOrCreate(key, input)
    const actor2 = registry.getOrCreate(key, input)

    expect(actor1).toBe(actor2)
  })

  test('creates separate actors for different keys', () => {
    const key1 = createSessionActorKey('dir1', 'session1')
    const key2 = createSessionActorKey('dir1', 'session2')
    const input1 = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }
    const input2 = { directory: 'dir1', sessionId: 'session2', timestamp: Date.now() }

    const actor1 = registry.getOrCreate(key1, input1)
    const actor2 = registry.getOrCreate(key2, input2)

    expect(actor1).not.toBe(actor2)
  })

  test('evict removes and stops actor', () => {
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    const actor = registry.getOrCreate(key, input)
    actor.start()

    const stopped = registry.evict(key)

    expect(stopped).toBe(true)
    expect(registry.getOrCreate(key, input)).not.toBe(actor)
  })

  test('evict returns false for non-existent key', () => {
    const key = createSessionActorKey('dir1', 'session1')

    const result = registry.evict(key)

    expect(result).toBe(false)
  })

  test('dispose stops and removes all actors', () => {
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
    const key = createSessionActorKey('dir1', 'session1')
    const input = { directory: 'dir1', sessionId: 'session1', timestamp: Date.now() }

    registry.getOrCreate(key, input)

    expect(registry.has(key)).toBe(true)
  })

  test('has returns false for non-existent key', () => {
    const key = createSessionActorKey('dir1', 'session1')

    expect(registry.has(key)).toBe(false)
  })
})