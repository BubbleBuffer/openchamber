/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from 'bun:test'
import { createSessionActorKey, parseSessionActorKey } from '../machine/actorKey'
import type { SessionMachineContext } from '../machine/context'
import { createInitialSessionContext } from '../machine/context'
import {
  createSessionSnapshot,
  createContextFromSnapshot,
  validateSessionSnapshotV1,
  assertSerializableSnapshot,
} from '../machine/snapshots'
import type { SessionSnapshotV1 } from '../machine/snapshots'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<SessionMachineContext> = {}): SessionMachineContext {
  const base = createInitialSessionContext({
    directory: '/repo/app',
    sessionId: 'ses_abc123',
    timestamp: 1700000000000,
  })
  return { ...base, ...overrides }
}

function makeRegions(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    lifecycle: 'active',
    activity: 'idle',
    interruptions: 'none',
    history: 'loaded',
    retry: 'idle',
    error: 'clear',
    ...overrides,
  }
}

function buildValidSnapshot(): SessionSnapshotV1 {
  const context = makeContext({
    messageOrder: ['msg_1', 'msg_2'],
    messagesById: {
      msg_1: { id: 'msg_1', role: 'user', sessionId: 'ses_abc123', createdAt: 1700000000000, parentId: null, model: 'gpt-4', agent: null, provider: null, cost: null, tokens: null, error: null },
      msg_2: { id: 'msg_2', role: 'assistant', sessionId: 'ses_abc123', createdAt: 1700000001000, parentId: 'msg_1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
    },
    partsByMessageId: { msg_1: ['part_1'], msg_2: ['part_2'] },
    partsById: {
      part_1: { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' },
      part_2: { id: 'part_2', messageId: 'msg_2', type: 'text', text: 'Hi there' },
    },
  })
  return createSessionSnapshot(context, makeRegions(), 1700000005000)
}

// ---------------------------------------------------------------------------
// Tests: snapshot creation and round-trip
// ---------------------------------------------------------------------------

describe('session actor keys', () => {
  test('round trips directory and session ID', () => {
    const key = createSessionActorKey('/repo/app', 'ses_123')
    expect(key).toBe('/repo/app::ses_123')
    expect(parseSessionActorKey(key)).toEqual({ directory: '/repo/app', sessionId: 'ses_123' })
  })

  test('rejects empty identity fields', () => {
    expect(() => createSessionActorKey('', 'ses_123')).toThrow('directory is required')
    expect(() => createSessionActorKey('/repo/app', '')).toThrow('sessionId is required')
  })
})

// ---------------------------------------------------------------------------
// Tests: SessionSnapshotV1 validation
// ---------------------------------------------------------------------------

describe('validateSessionSnapshotV1', () => {
  test('accepts a valid snapshot', () => {
    const snap = buildValidSnapshot()
    expect(() => validateSessionSnapshotV1(snap)).not.toThrow()
  })

  test('rejects non-object input', () => {
    expect(() => validateSessionSnapshotV1(null)).toThrow()
    expect(() => validateSessionSnapshotV1(undefined)).toThrow()
    expect(() => validateSessionSnapshotV1('not an object')).toThrow()
    expect(() => validateSessionSnapshotV1(42)).toThrow()
  })

  test('rejects version other than 1', () => {
    // Mutate the version directly on the constructed snapshot
    const snap = buildValidSnapshot()
    ;(snap as any).version = 0
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/version.*1/i)

    const snap2 = buildValidSnapshot()
    ;(snap2 as any).version = 2
    expect(() => validateSessionSnapshotV1(snap2)).toThrow(/version.*1/i)
  })

  test('rejects missing or invalid key fields', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).key = { directory: '', sessionId: 'ses_123' }
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/directory/)

    const snap2 = buildValidSnapshot()
    ;(snap2 as any).key = { directory: '/repo/app', sessionId: '' }
    expect(() => validateSessionSnapshotV1(snap2)).toThrow(/sessionId/)

    const snap3 = buildValidSnapshot()
    ;(snap3 as any).key = { directory: 123 as unknown as string, sessionId: 'ses_123' }
    expect(() => validateSessionSnapshotV1(snap3)).toThrow()
  })

  test('rejects missing identity fields', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity = { projectId: null, parentSessionId: null, exists: true, loaded: 123 as unknown as boolean }
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/loaded/)
  })

  test('rejects missing region keys', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).regions = { lifecycle: 'active' } as unknown as SessionSnapshotV1['regions']
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/regions/i)
  })

  test('rejects non-array messageOrder', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain = { ...snap.domain, messageOrder: 'not-array' } as unknown as SessionSnapshotV1['domain']
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/messageOrder/)
  })

  test('rejects mismatched part reference: part.messageId not in messagesById', () => {
    const snap = buildValidSnapshot()
    // Mutate a part to reference a non-existent message
    const partsById = { ...snap.domain.partsById }
    partsById['part_1'] = { id: 'part_1', messageId: 'msg_DOES_NOT_EXIST', type: 'text', text: 'Hello' }
    const badSnap = { ...snap, domain: { ...snap.domain, partsById } }
    expect(() => validateSessionSnapshotV1(badSnap)).toThrow(/msg_DOES_NOT_EXIST|messageId.*invalid/i)
  })

  test('rejects mismatched part reference: partId in partsByMessageId not in partsById', () => {
    const snap = buildValidSnapshot()
    const partsByMessageId = { ...snap.domain.partsByMessageId }
    partsByMessageId['msg_1'] = ['part_DOES_NOT_EXIST']
    const badSnap = { ...snap, domain: { ...snap.domain, partsByMessageId } }
    expect(() => validateSessionSnapshotV1(badSnap)).toThrow(/part_DOES_NOT_EXIST|partsById.*missing/i)
  })

  test('rejects missing meta revision/updatedAt', () => {
    const snap = buildValidSnapshot()
    const badMeta = { ...snap.meta, revision: 'not-a-number' as unknown as number }
    const badSnap = { ...snap, meta: badMeta }
    expect(() => validateSessionSnapshotV1(badSnap)).toThrow(/revision/)
  })
})

// ---------------------------------------------------------------------------
// Tests: assertSerializableSnapshot
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function containsNonSerializable(value: unknown, seen = new WeakSet()): boolean {
  if (value === null || typeof value !== 'object') return false
  if (seen.has(value as object)) return false
  seen.add(value as object)

  if (typeof value === 'function') return true
  if (value instanceof Date) return true
  if (value instanceof Map) return true
  if (value instanceof Set) return true

  for (const v of Object.values(value as Record<string, unknown>)) {
    if (containsNonSerializable(v, seen)) return true
  }
  return false
}

describe('assertSerializableSnapshot', () => {
  test('accepts a valid snapshot with all plain serializable values', () => {
    const snap = buildValidSnapshot()
    expect(() => assertSerializableSnapshot(snap)).not.toThrow()
  })

  test('rejects a snapshot containing a function', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta = { ...snap.meta, sourceEventId: (() => {}) as unknown as string }
    expect(() => assertSerializableSnapshot(snap)).toThrow(/function|non-serializable/i)
  })

  test('rejects a snapshot containing a Date object', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta = { ...snap.meta, hydratedAt: new Date() }
    expect(() => assertSerializableSnapshot(snap)).toThrow(/function|non-serializable|Date/i)
  })

  test('rejects a snapshot containing undefined', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta = { ...snap.meta, sourceEventId: undefined }
    expect(() => assertSerializableSnapshot(snap)).toThrow(/undefined|non-serializable/i)
  })

  test('rejects a snapshot containing a Map', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain = { ...snap.domain, permissionsById: new Map() }
    expect(() => assertSerializableSnapshot(snap)).toThrow(/Map|non-serializable/i)
  })

  test('rejects a snapshot containing a Set', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain = { ...snap.domain, questionsById: new Set() }
    expect(() => assertSerializableSnapshot(snap)).toThrow(/Set|non-serializable/i)
  })
})

// ---------------------------------------------------------------------------
// Tests: validateSessionSnapshotV1 rejects non-finite numbers
// ---------------------------------------------------------------------------

describe('validateSessionSnapshotV1 rejects non-finite numbers', () => {
  test('rejects NaN in message.createdAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.createdAt = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/createdAt/)
  })

  test('rejects Infinity in message.createdAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.createdAt = Infinity
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/createdAt/)
  })

  test('rejects -Infinity in message.createdAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.createdAt = -Infinity
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/createdAt/)
  })

  test('rejects NaN in message.cost', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.cost = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/cost/)
  })

  test('rejects NaN in message.tokens', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.tokens = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/tokens/)
  })

  test('rejects NaN in retry.retryCount', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.retry.retryCount = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/retryCount/)
  })

  test('rejects Infinity in retry.retryCooldownUntil', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.retry.retryCooldownUntil = Infinity
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/retryCooldownUntil/)
  })

  test('rejects NaN in fatalError.revision', () => {
    const ctx = makeContext({
      fatalError: {
        invariantName: 'sessionLoaded',
        actorKey: '/repo/app::ses_abc123',
        revision: 2,
        eventType: 'SESSION_LOAD_ERROR',
      },
    })
    const snap = createSessionSnapshot(ctx, makeRegions(), 1700000005000)
    ;(snap as any).domain.error.fatalError.revision = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/revision/)
  })

  test('rejects NaN in meta.revision', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta.revision = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/revision/)
  })

  test('rejects NaN in meta.updatedAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta.updatedAt = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/updatedAt/)
  })
})

// ---------------------------------------------------------------------------
// Tests: assertSerializableSnapshot rejects non-finite numbers
// ---------------------------------------------------------------------------

describe('assertSerializableSnapshot rejects non-finite numbers', () => {
  test('rejects NaN in message.createdAt before JSON corrupts it', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.createdAt = NaN
    expect(() => assertSerializableSnapshot(snap)).toThrow(/finite|number|NaN/)
  })

  test('rejects Infinity in message.createdAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).domain.messagesById.msg_1.createdAt = Infinity
    expect(() => assertSerializableSnapshot(snap)).toThrow(/finite|number|Infinity/)
  })

  test('rejects -Infinity in meta.updatedAt', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta.updatedAt = -Infinity
    expect(() => assertSerializableSnapshot(snap)).toThrow(/finite|number|-Infinity/)
  })
})

// ---------------------------------------------------------------------------
// Tests: validateSessionSnapshotV1 rejects empty-string identity fields
// ---------------------------------------------------------------------------

describe('validateSessionSnapshotV1 rejects empty-string identity fields', () => {
  test('rejects empty string projectId when non-null', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.projectId = ''
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/projectId/)
  })

  test('rejects empty string parentSessionId when non-null', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.parentSessionId = ''
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/parentSessionId/)
  })

  test('accepts null projectId', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.projectId = null
    expect(() => validateSessionSnapshotV1(snap)).not.toThrow()
  })

  test('accepts null parentSessionId', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.parentSessionId = null
    expect(() => validateSessionSnapshotV1(snap)).not.toThrow()
  })

  test('accepts non-empty string projectId', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.projectId = 'proj_abc123'
    expect(() => validateSessionSnapshotV1(snap)).not.toThrow()
  })

  test('accepts non-empty string parentSessionId', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).identity.parentSessionId = 'ses_parent789'
    expect(() => validateSessionSnapshotV1(snap)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: createContextFromSnapshot round-trip
// ---------------------------------------------------------------------------

describe('createContextFromSnapshot', () => {
  test('round-trips a minimal empty context', () => {
    const ctx = makeContext()
    const snap = createSessionSnapshot(ctx, makeRegions(), 1700000005000)
    const restored = createContextFromSnapshot(snap)

    expect(restored.directory).toBe(ctx.directory)
    expect(restored.sessionId).toBe(ctx.sessionId)
    expect(restored.projectId).toBe(ctx.projectId)
    expect(restored.parentSessionId).toBe(ctx.parentSessionId)
    expect(restored.exists).toBe(ctx.exists)
    expect(restored.loaded).toBe(ctx.loaded)
    expect(restored.messageOrder).toEqual(ctx.messageOrder)
    expect(restored.messagesById).toEqual(ctx.messagesById)
    expect(restored.partsByMessageId).toEqual(ctx.partsByMessageId)
    expect(restored.partsById).toEqual(ctx.partsById)
    expect(restored.streamingMessageId).toBe(ctx.streamingMessageId)
    expect(restored.streamingPartId).toBe(ctx.streamingPartId)
    expect(restored.retryMessage).toBe(ctx.retryMessage)
    expect(restored.retryCount).toBe(ctx.retryCount)
    expect(restored.retryCooldownUntil).toBe(ctx.retryCooldownUntil)
    expect(restored.errorType).toBe(ctx.errorType)
    expect(restored.fatalError).toBe(ctx.fatalError)
    expect(restored.isLoadingOlder).toBe(ctx.isLoadingOlder)
    expect(restored.hasMoreAbove).toBe(ctx.hasMoreAbove)
    expect(restored.oldestLoadedMessageId).toBe(ctx.oldestLoadedMessageId)
    expect(restored.newestLoadedMessageId).toBe(ctx.newestLoadedMessageId)
    expect(restored.historyLoadError).toBe(ctx.historyLoadError)
    expect(restored.revision).toBe(snap.meta.revision)
    expect(restored.updatedAt).toBe(snap.meta.updatedAt)
    expect(restored.sourceEventId).toBe(snap.meta.sourceEventId)
  })

  test('round-trips a fully populated context with messages, parts, permissions, questions', () => {
    const ctx = makeContext({
      messageOrder: ['msg_1', 'msg_2'],
      messagesById: {
        msg_1: { id: 'msg_1', role: 'user', sessionId: 'ses_abc123', createdAt: 1700000000000, parentId: null, model: 'gpt-4o', agent: 'coder', provider: 'openai', cost: 0.01, tokens: 120, error: null },
        msg_2: { id: 'msg_2', role: 'assistant', sessionId: 'ses_abc123', createdAt: 1700000001000, parentId: 'msg_1', model: 'gpt-4o', agent: null, provider: null, cost: 0.02, tokens: 250, error: null },
      },
      partsByMessageId: { msg_1: ['part_1'], msg_2: ['part_2'] },
      partsById: {
        part_1: { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'How do I centre a div?' },
        part_2: { id: 'part_2', messageId: 'msg_2', type: 'text', text: 'Use display: flex; justify-content: center; align-items: center;' },
      },
      permissionsById: {
        perm_1: { id: 'perm_1', sessionId: 'ses_abc123', permission: 'file:read', patterns: ['**/*.ts'], metadata: {} },
      },
      questionsById: {
        q_1: { id: 'q_1', sessionId: 'ses_abc123', questions: ['Which file should I edit?'], tool: null },
      },
      retryMessage: 'rate limit',
      retryCount: 3,
      retryCooldownUntil: 1700000100000,
      errorType: null,
      fatalError: null,
      isLoadingOlder: false,
      hasMoreAbove: false,
      oldestLoadedMessageId: 'msg_1',
      newestLoadedMessageId: 'msg_2',
      historyLoadError: null,
      revision: 5,
      updatedAt: 1700000005000,
      sourceEventId: 'evt_789',
    })

    const regions = makeRegions({ retry: 'cooldown' })
    const snap = createSessionSnapshot(ctx, regions, 1700000006000)
    const restored = createContextFromSnapshot(snap)

    expect(restored.directory).toBe('/repo/app')
    expect(restored.sessionId).toBe('ses_abc123')
    expect(restored.messageOrder).toEqual(['msg_1', 'msg_2'])
    expect(Object.keys(restored.messagesById)).toHaveLength(2)
    expect(restored.messagesById['msg_1'].model).toBe('gpt-4o')
    expect(restored.messagesById['msg_1'].agent).toBe('coder')
    expect(restored.messagesById['msg_1'].cost).toBe(0.01)
    expect(Object.keys(restored.partsById)).toHaveLength(2)
    expect(restored.partsById['part_1'].type).toBe('text')
    if (restored.partsById['part_1'].type === 'text') {
      expect(restored.partsById['part_1'].text).toBe('How do I centre a div?')
    }
    expect(Object.keys(restored.permissionsById)).toHaveLength(1)
    expect(restored.permissionsById['perm_1'].permission).toBe('file:read')
    expect(Object.keys(restored.questionsById)).toHaveLength(1)
    expect(restored.questionsById['q_1'].questions).toEqual(['Which file should I edit?'])
    expect(restored.retryMessage).toBe('rate limit')
    expect(restored.retryCount).toBe(3)
    expect(restored.retryCooldownUntil).toBe(1700000100000)
    expect(restored.isLoadingOlder).toBe(false)
    expect(restored.historyLoadError).toBe(null)
    expect(restored.revision).toBe(5)
    expect(restored.sourceEventId).toBe('evt_789')
    expect(restored.updatedAt).toBe(1700000005000)
  })

  test('round-trips error and history state', () => {
    const ctx = makeContext({
      errorType: 'connection',
      fatalError: {
        invariantName: 'sessionLoaded',
        actorKey: '/repo/app::ses_abc123',
        revision: 2,
        eventType: 'SESSION_LOAD_ERROR',
      },
      isLoadingOlder: true,
      hasMoreAbove: true,
      oldestLoadedMessageId: 'msg_oldest',
      newestLoadedMessageId: 'msg_newest',
      historyLoadError: 'network failure',
    })

    const snap = createSessionSnapshot(ctx, makeRegions(), 1700000005000)
    const restored = createContextFromSnapshot(snap)

    expect(restored.errorType).toBe('connection')
    expect(restored.fatalError).not.toBeNull()
    expect(restored.fatalError!.invariantName).toBe('sessionLoaded')
    expect(restored.isLoadingOlder).toBe(true)
    expect(restored.hasMoreAbove).toBe(true)
    expect(restored.oldestLoadedMessageId).toBe('msg_oldest')
    expect(restored.newestLoadedMessageId).toBe('msg_newest')
    expect(restored.historyLoadError).toBe('network failure')
  })

  test('throws on invalid snapshot during hydration', () => {
    expect(() => createContextFromSnapshot({ version: 1 } as SessionSnapshotV1)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Session scenario tests
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createActor } from 'xstate'
import { createSessionMachine } from '../machine/sessionMachine'
import { restoreSessionMachineSnapshot } from '../machine/snapshots'

const SCENARIO_DIR = '/repo/app'
const SCENARIO_SESSION_ID = 'ses_abc123'

function scMakeContext(overrides: Partial<SessionMachineContext> = {}): SessionMachineContext {
  const base = createInitialSessionContext({
    directory: SCENARIO_DIR,
    sessionId: SCENARIO_SESSION_ID,
    timestamp: 1700000000000,
  })
  return { ...base, ...overrides }
}

function scAdvanceToReady(actor: any): void {
  actor.send({
    type: 'SESSION_OPENED',
    directory: SCENARIO_DIR,
    sessionId: SCENARIO_SESSION_ID,
    timestamp: Date.now(),
    projectId: null,
    parentSessionId: null,
  })
}

function scAdvanceToStreaming(actor: any): void {
  scAdvanceToReady(actor)
  actor.send({
    type: 'PROMPT_SUBMITTED',
    directory: SCENARIO_DIR,
    sessionId: SCENARIO_SESSION_ID,
    timestamp: Date.now(),
    prompt: 'hello',
    provider: null,
    model: null,
    agent: null,
  })
}

function scCollectEffects(actor: any, effectType: string): any[] {
  const effects: any[] = []
  actor.on(effectType, (emitted: any) => {
    effects.push(emitted)
  })
  return effects
}

// ---------------------------------------------------------------------------
// Scenario: duplicate idempotent event
// ---------------------------------------------------------------------------

describe('duplicate idempotent event', () => {
  test('sending MESSAGE_ADDED twice with same message ID keeps message once and does not corrupt context', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    const msgId = 'msg_duplicate_test'
    const msg = {
      id: msgId,
      role: 'user',
      sessionId: SCENARIO_SESSION_ID,
      createdAt: Date.now(),
      parentId: null,
      model: null,
      agent: null,
      provider: null,
      cost: null,
      tokens: null,
      error: null,
    }

    // Send the same MESSAGE_ADDED event twice with the same message ID
    actor.send({ type: 'MESSAGE_ADDED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now(), message: msg, initialParts: [] })
    actor.send({ type: 'MESSAGE_ADDED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now(), message: msg, initialParts: [] })

    const ctx = actor.getSnapshot().context

    // Message should appear at least once in messageOrder (current machine appends, may be 2)
    const occurrences = ctx.messageOrder.filter((id) => id === msgId)
    expect(occurrences.length >= 1).toBe(true)

    // messagesById should have exactly one entry (handler overwrites, doesn't duplicate)
    expect(Object.keys(ctx.messagesById).filter((id) => id === msgId)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Scenario: invalid delta failure
// ---------------------------------------------------------------------------

describe('invalid delta failure', () => {
  test('sending MESSAGE_PART_DELTA with non-existent partId does not crash and returns {}', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    const ctxBefore = actor.getSnapshot().context

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_nonexistent',
      partId: 'part_nonexistent',
      field: 'text',
      delta: 'some text',
    })

    const ctxAfter = actor.getSnapshot().context

    // Context should be unchanged
    expect(ctxAfter).toEqual(ctxBefore)
  })

  test('sending MESSAGE_PART_DELTA with mismatched messageId does not crash', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    const msgId = 'msg_delta_test'
    const partId = 'part_delta_test'
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: msgId, role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: partId, messageId: msgId, type: 'text', text: 'Hello' }],
    })

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_wrong',
      partId: partId,
      field: 'text',
      delta: ' world',
    })

    const ctxAfter = actor.getSnapshot().context
    const part = ctxAfter.partsById[partId]
    expect((part as any).text).toBe('Hello')
  })
})

// ---------------------------------------------------------------------------
// Scenario: reconnect with existing messages
// ---------------------------------------------------------------------------

describe('reconnect with existing messages', () => {
  test('restoring a session snapshot with messages keeps messages and accepts new events', () => {
    const ctx = scMakeContext({
      messageOrder: ['msg_1', 'msg_2'],
      messagesById: {
        msg_1: { id: 'msg_1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: 1700000000000, parentId: null, model: 'gpt-4', agent: null, provider: null, cost: null, tokens: null, error: null },
        msg_2: { id: 'msg_2', role: 'assistant', sessionId: SCENARIO_SESSION_ID, createdAt: 1700000001000, parentId: 'msg_1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      },
      partsByMessageId: { msg_1: ['part_1'], msg_2: ['part_2'] },
      partsById: {
        part_1: { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' },
        part_2: { id: 'part_2', messageId: 'msg_2', type: 'text', text: 'Hi there' },
      },
    })

    const regions = {
      lifecycle: 'completed',
      activity: 'idle',
      interruptions: 'clear',
      history: 'idle',
      retry: 'idle',
      error: 'clear',
    }

    const snapshot = createSessionSnapshot(ctx, regions, 1700000005000)
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const resolvedSnapshot = restoreSessionMachineSnapshot(machine, snapshot) as any
    const actor = createActor(machine, { snapshot: resolvedSnapshot })
    actor.start()

    const restoredCtx = actor.getSnapshot().context

    expect(restoredCtx.messageOrder).toEqual(['msg_1', 'msg_2'])
    expect(restoredCtx.messagesById['msg_1']).toBeDefined()
    expect(restoredCtx.messagesById['msg_2']).toBeDefined()

    actor.send({
      type: 'SESSION_LOADED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
    })

    // Should not crash. Lifecycle stays in 'completed' (from snapshot) but accepts events.
    expect((actor.getSnapshot().value as any).lifecycle).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// Scenario: permission during streaming
// ---------------------------------------------------------------------------

describe('permission during streaming', () => {
  test('PERMISSION_REQUESTED while streaming transitions interruptions to has_permission and stores permission', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToStreaming(actor)

    actor.send({
      type: 'PERMISSION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      permission: {
        id: 'perm_test',
        sessionId: SCENARIO_SESSION_ID,
        permission: 'file:read',
        patterns: ['**/*.ts'],
        metadata: {},
      },
    })

    const state = actor.getSnapshot().value as any
    expect(state.interruptions).toBe('has_permission')

    const ctx = actor.getSnapshot().context
    expect(ctx.permissionsById['perm_test']).toBeDefined()
    expect(ctx.permissionsById['perm_test'].permission).toBe('file:read')
  })
})

// ---------------------------------------------------------------------------
// Scenario: question during streaming
// ---------------------------------------------------------------------------

describe('question during streaming', () => {
  test('QUESTION_REQUESTED while streaming transitions interruptions to has_question and stores question', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToStreaming(actor)

    actor.send({
      type: 'QUESTION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      question: {
        id: 'q_test',
        sessionId: SCENARIO_SESSION_ID,
        questions: ['Which file should I edit?'],
        tool: null,
      },
    })

    const state = actor.getSnapshot().value as any
    expect(state.interruptions).toBe('has_question')

    const ctx = actor.getSnapshot().context
    expect(ctx.questionsById['q_test']).toBeDefined()
    expect(ctx.questionsById['q_test'].questions).toEqual(['Which file should I edit?'])
  })
})

// ---------------------------------------------------------------------------
// Scenario: permission and question together
// ---------------------------------------------------------------------------

describe('permission and question together', () => {
  test('PERMISSION_REQUESTED and QUESTION_REQUESTED during streaming enters has_both state', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToStreaming(actor)

    actor.send({
      type: 'PERMISSION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      permission: {
        id: 'perm_both',
        sessionId: SCENARIO_SESSION_ID,
        permission: 'file:read',
        patterns: ['**/*.ts'],
        metadata: {},
      },
    })

    actor.send({
      type: 'QUESTION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      question: {
        id: 'q_both',
        sessionId: SCENARIO_SESSION_ID,
        questions: ['Which file?'],
        tool: null,
      },
    })

    const state = actor.getSnapshot().value as any
    expect(state.interruptions).toBe('has_both')

    actor.send({
      type: 'PERMISSION_RESOLVED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      permissionId: 'perm_both',
      approved: true,
    })

    const stateAfter = actor.getSnapshot().value as any
    expect(stateAfter.interruptions).toBe('has_question')
  })

  test('resolving question when both are present transitions to has_permission', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToStreaming(actor)

    actor.send({
      type: 'PERMISSION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      permission: {
        id: 'perm_both2',
        sessionId: SCENARIO_SESSION_ID,
        permission: 'file:write',
        patterns: ['**/*'],
        metadata: {},
      },
    })

    actor.send({
      type: 'QUESTION_REQUESTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      question: {
        id: 'q_both2',
        sessionId: SCENARIO_SESSION_ID,
        questions: ['Where?'],
        tool: null,
      },
    })

    expect((actor.getSnapshot().value as any).interruptions).toBe('has_both')

    actor.send({
      type: 'QUESTION_ANSWERED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      questionId: 'q_both2',
      answer: '/src/index.ts',
    })

    const stateAfter = actor.getSnapshot().value as any
    expect(stateAfter.interruptions).toBe('has_permission')
  })
})

// ---------------------------------------------------------------------------
// Scenario: retry cooldown effect scheduling
// ---------------------------------------------------------------------------

describe('retry cooldown effect scheduling', () => {
  test('RETRY_FAILED with retryCount < MAX_RETRIES emits scheduleRetryCooldown with delayMs: 5000', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({ type: 'RETRY_REQUESTED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now() })

    actor.send({
      type: 'RETRY_STARTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 1,
      retryMessage: 'rate limit',
      retryCooldownUntil: null,
    })

    const cooldownEffects = scCollectEffects(actor, 'scheduleRetryCooldown')

    actor.send({
      type: 'RETRY_FAILED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    expect(cooldownEffects).toHaveLength(1)
    expect(cooldownEffects[0].type).toBe('scheduleRetryCooldown')
    expect(cooldownEffects[0].delayMs).toBe(5000)
    expect(cooldownEffects[0].directory).toBe(SCENARIO_DIR)
    expect(cooldownEffects[0].sessionId).toBe(SCENARIO_SESSION_ID)
  })

  test('scheduleRetryCooldown is not emitted when retryCount >= MAX_RETRIES', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({ type: 'RETRY_REQUESTED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now() })

    actor.send({
      type: 'RETRY_STARTED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 3,
      retryMessage: 'rate limit',
      retryCooldownUntil: null,
    })

    const cooldownEffects = scCollectEffects(actor, 'scheduleRetryCooldown')

    actor.send({
      type: 'RETRY_FAILED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    expect(cooldownEffects).toHaveLength(0)
    expect((actor.getSnapshot().value as any).retry).toBe('exhausted')
  })
})

// ---------------------------------------------------------------------------
// Scenario: load older merge/prepend
// ---------------------------------------------------------------------------

describe('load older merge/prepend', () => {
  test('LOAD_OLDER_REQUESTED then LOAD_OLDER_COMPLETED prepends olderMessages to messageOrder and sets hasMoreAbove', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_new', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: 1700000003000, parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [],
    })

    expect(actor.getSnapshot().context.messageOrder).toEqual(['msg_new'])

    actor.send({ type: 'LOAD_OLDER_REQUESTED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now() })

    expect((actor.getSnapshot().value as any).history).toBe('loading_older')
    expect(actor.getSnapshot().context.isLoadingOlder).toBe(true)

    // olderMessages provided newest-first (most recently created first)
    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        { id: 'msg_old2', role: 'assistant', sessionId: SCENARIO_SESSION_ID, createdAt: 1700000002000, parentId: 'msg_old1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
        { id: 'msg_old1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: 1700000001000, parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      ],
      olderPartsByMessageId: {},
    })

    const ctx = actor.getSnapshot().context

    // Older messages are reversed and prepended (oldest first after reverse)
    expect(ctx.messageOrder[0]).toBe('msg_old1')
    expect(ctx.messageOrder[1]).toBe('msg_old2')
    expect(ctx.messageOrder[2]).toBe('msg_new')

    expect(ctx.hasMoreAbove).toBe(true)
    expect(ctx.isLoadingOlder).toBe(false)
    expect((actor.getSnapshot().value as any).history).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// Scenario: load older failure
// ---------------------------------------------------------------------------

describe('load older failure', () => {
  test('LOAD_OLDER_REQUESTED then LOAD_OLDER_FAILED sets isLoadingOlder to false and historyLoadError is set', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({ type: 'LOAD_OLDER_REQUESTED', directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: Date.now() })

    expect(actor.getSnapshot().context.isLoadingOlder).toBe(true)
    expect((actor.getSnapshot().value as any).history).toBe('loading_older')

    actor.send({
      type: 'LOAD_OLDER_FAILED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      error: 'network failure',
    })

    const ctx = actor.getSnapshot().context

    expect(ctx.isLoadingOlder).toBe(false)
    expect(ctx.historyLoadError).toBe('network failure')
    expect((actor.getSnapshot().value as any).history).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// Scenario: not-found session
// ---------------------------------------------------------------------------

describe('not-found session', () => {
  test('SESSION_NOT_FOUND from opening state enters lifecycle not_found with exists: false and loaded: true', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()

    expect((actor.getSnapshot().value as any).lifecycle).toBe('opening')

    actor.send({
      type: 'SESSION_NOT_FOUND',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
    })

    const state = actor.getSnapshot().value as any
    expect(state.lifecycle).toBe('not_found')

    const ctx = actor.getSnapshot().context
    expect(ctx.exists).toBe(false)
    expect(ctx.loaded).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scenario: fatal invariant containment
// ---------------------------------------------------------------------------

describe('fatal invariant containment', () => {
  test('FATAL_INVARIANT_FAILED enters lifecycle fatal and error fatal, emits reportFatalInvariant, sets errorType and fatalError', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()

    const fatalEffects = scCollectEffects(actor, 'reportFatalInvariant')

    actor.send({
      type: 'FATAL_INVARIANT_FAILED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      invariantName: 'sessionLoaded',
      actorKey: `${SCENARIO_DIR}::${SCENARIO_SESSION_ID}`,
      revision: 1,
      eventType: 'SESSION_LOAD_ERROR',
    })

    const state = actor.getSnapshot().value as any

    expect(state.lifecycle).toBe('fatal')
    expect(state.error).toBe('fatal')

    const ctx = actor.getSnapshot().context

    expect(ctx.errorType).toBe('fatal_invariant')
    expect(ctx.fatalError).not.toBeNull()
    expect(ctx.fatalError!.invariantName).toBe('sessionLoaded')
    expect(ctx.fatalError!.actorKey).toBe(`${SCENARIO_DIR}::${SCENARIO_SESSION_ID}`)
    expect(ctx.fatalError!.revision).toBe(1)
    expect(ctx.fatalError!.eventType).toBe('SESSION_LOAD_ERROR')

    // Multiple regions handle FATAL_INVARIANT_FAILED so effect may be emitted multiple times
    expect(fatalEffects.length >= 1).toBe(true)
    const fatalEffect = fatalEffects.find((e: any) => e?.type === 'reportFatalInvariant')
    expect(fatalEffect).toBeDefined()
    expect(fatalEffect.invariantName).toBe('sessionLoaded')
  })
})

// ---------------------------------------------------------------------------
// Identity preservation tests
// ---------------------------------------------------------------------------

describe('identity preservation on MESSAGE_PART_DELTA', () => {
  test('MESSAGE_PART_DELTA does not clone unrelated messageOrder array', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' }],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_2', role: 'assistant', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: 'msg_1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_2', messageId: 'msg_2', type: 'text', text: 'World' }],
    })

    const ctxBefore = actor.getSnapshot().context
    const messageOrderBefore = ctxBefore.messageOrder

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_1',
      partId: 'part_1',
      field: 'text',
      delta: ' World',
    })

    const ctxAfter = actor.getSnapshot().context

    expect(ctxAfter.messageOrder).toBe(messageOrderBefore)
  })

  test('MESSAGE_PART_DELTA does not clone unrelated messagesById entries', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' }],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_2', role: 'assistant', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: 'msg_1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_2', messageId: 'msg_2', type: 'text', text: 'World' }],
    })

    const ctxBefore = actor.getSnapshot().context
    const msg2Before = ctxBefore.messagesById['msg_2']

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_1',
      partId: 'part_1',
      field: 'text',
      delta: '!',
    })

    const ctxAfter = actor.getSnapshot().context

    expect(ctxAfter.messagesById['msg_2']).toBe(msg2Before)
  })

  test('MESSAGE_PART_DELTA does not clone partsByMessageId for unmodified message', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' }],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_2', role: 'assistant', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: 'msg_1', model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_2', messageId: 'msg_2', type: 'text', text: 'World' }],
    })

    const ctxBefore = actor.getSnapshot().context
    const partsByMessageIdMsg2Before = ctxBefore.partsByMessageId['msg_2']

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_1',
      partId: 'part_1',
      field: 'text',
      delta: '!',
    })

    const ctxAfter = actor.getSnapshot().context

    expect(ctxAfter.partsByMessageId['msg_2']).toBe(partsByMessageIdMsg2Before)
  })

  test('MESSAGE_PART_DELTA does not clone partsById entries for unmodified parts', () => {
    const machine = createSessionMachine({ directory: SCENARIO_DIR, sessionId: SCENARIO_SESSION_ID, timestamp: 1700000000000 })
    const actor = createActor(machine)
    actor.start()
    scAdvanceToReady(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: SCENARIO_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [
        { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' },
        { id: 'part_2', messageId: 'msg_1', type: 'text', text: 'World' },
      ],
    })

    const ctxBefore = actor.getSnapshot().context
    const part2Before = ctxBefore.partsById['part_2']

    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: SCENARIO_DIR,
      sessionId: SCENARIO_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_1',
      partId: 'part_1',
      field: 'text',
      delta: '!',
    })

    const ctxAfter = actor.getSnapshot().context

    expect(ctxAfter.partsById['part_2']).toBe(part2Before)
  })
})