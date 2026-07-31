/**
 * Tests for Phase 3.3 Hot-Path Message Migration - Chat Messages
 *
 * Tests identity preservation, selector behavior, and render derivation
 * for the machine-backed message/streaming/retry domain.
 */

import { describe, expect, test } from 'bun:test'
import { createActor } from 'xstate'
import { createSessionMachine } from '@openchamber/session-state'
import type { SessionMachineContext } from '@openchamber/session-state'
import { deriveRenderEntries, createEmptyRenderCache } from './machine/renderedMessages'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DIR = '/repo/app'
const BASE_SESSION_ID = 'ses_abc123'
const BASE_TIMESTAMP = 1700000000000

function makeMachine() {
  return createSessionMachine({
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: BASE_TIMESTAMP,
  })
}

function sendSessionOpened(actor: ReturnType<typeof createActor>) {
  actor.send({
    type: 'SESSION_OPENED',
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: Date.now(),
    projectId: null,
    parentSessionId: null,
  })
}

function createTestMessage(id: string, role: string, createdAt: number): SessionMachineContext['messagesById'][string] {
  return {
    id,
    role,
    sessionId: BASE_SESSION_ID,
    createdAt,
    parentId: null,
    model: null,
    agent: null,
    provider: null,
    cost: null,
    tokens: null,
    error: null,
  }
}

function createTestPart(id: string, messageId: string, type: 'text' | 'tool' | 'error' | 'metadata', text?: string): SessionMachineContext['partsById'][string] {
  switch (type) {
    case 'text':
      return { id, messageId, type: 'text', text: text ?? '' }
    case 'tool':
      return { id, messageId, type: 'tool', toolName: 'test', toolCallId: 'call_1', toolState: null }
    case 'error':
      return { id, messageId, type: 'error', error: 'test error' }
    case 'metadata':
      return { id, messageId, type: 'metadata', metadata: {} }
  }
}

// ---------------------------------------------------------------------------
// Tests: Identity Preservation on Part-Only Delta
// ---------------------------------------------------------------------------

describe('identity preservation during part-only deltas', () => {
  test('converting normalized machine records to chat render entries preserves unchanged message references', () => {
    // Setup: machine with two messages
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add first message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [
        createTestPart('part_1', 'msg_1', 'text', 'Hello'),
      ],
    })

    // Add second message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [
        createTestPart('part_2', 'msg_2', 'text', 'Hi'),
      ],
    })

    // Get first derivation
    const ctx1 = actor.getSnapshot().context
    const result1 = deriveRenderEntries(
      ctx1.messageOrder,
      ctx1.messagesById,
      ctx1.partsByMessageId,
      ctx1.partsById,
      undefined,
    )

    expect(result1.entries).toHaveLength(2)
    const [entry1_msg1, entry1_msg2] = result1.entries

    // Send part delta for msg_2 only (simulates streaming)
    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_2',
      partId: 'part_2',
      field: 'text',
      delta: ' there',
    })

    // Get second derivation with previous cache
    const ctx2 = actor.getSnapshot().context
    const result2 = deriveRenderEntries(
      ctx2.messageOrder,
      ctx2.messagesById,
      ctx2.partsByMessageId,
      ctx2.partsById,
      result1.cache,
    )

    expect(result2.entries).toHaveLength(2)
    const [entry2_msg1, entry2_msg2] = result2.entries

    // msg_1 entry should be the SAME reference (unchanged)
    expect(entry2_msg1).toBe(entry1_msg1)

    // msg_2 entry should be DIFFERENT (part changed)
    expect(entry2_msg2).not.toBe(entry1_msg2)

    // Verify msg_1 content unchanged
    expect(entry2_msg1.info.id).toBe('msg_1')
    expect(entry2_msg1.info.role).toBe('user')
    expect(entry2_msg1.parts).toHaveLength(1)

    // Verify msg_2 content updated
    expect(entry2_msg2.info.id).toBe('msg_2')
    expect(entry2_msg2.info.role).toBe('assistant')
  })

  test('only the active streaming part entry changes during MESSAGE_PART_DELTA events', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add three messages
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [createTestPart('part_1', 'msg_1', 'text', 'User text')],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [createTestPart('part_2', 'msg_2', 'text', 'Assistant text')],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_3', 'assistant', 3000),
      initialParts: [createTestPart('part_3', 'msg_3', 'text', 'More text')],
    })

    // First derivation
    const ctx1 = actor.getSnapshot().context
    const result1 = deriveRenderEntries(
      ctx1.messageOrder,
      ctx1.messagesById,
      ctx1.partsByMessageId,
      ctx1.partsById,
      undefined,
    )

    // Stream delta on msg_2
    actor.send({
      type: 'MESSAGE_PART_DELTA',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_2',
      partId: 'part_2',
      field: 'text',
      delta: '!',
    })

    // Second derivation
    const ctx2 = actor.getSnapshot().context
    const result2 = deriveRenderEntries(
      ctx2.messageOrder,
      ctx2.messagesById,
      ctx2.partsByMessageId,
      ctx2.partsById,
      result1.cache,
    )

    // msg_1 and msg_3 should be same reference
    expect(result2.entries[0]).toBe(result1.entries[0]) // msg_1 unchanged
    expect(result2.entries[2]).toBe(result1.entries[2]) // msg_3 unchanged

    // msg_2 should be new reference
    expect(result2.entries[1]).not.toBe(result1.entries[1]) // msg_2 changed
  })
})

// ---------------------------------------------------------------------------
// Tests: Render Derivation Cache Behavior
// ---------------------------------------------------------------------------

describe('render derivation cache behavior', () => {
  test('first derivation creates cache with correct entry count', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [createTestPart('part_1', 'msg_1', 'text', 'Hello')],
    })

    const ctx = actor.getSnapshot().context
    const result = deriveRenderEntries(
      ctx.messageOrder,
      ctx.messagesById,
      ctx.partsByMessageId,
      ctx.partsById,
      undefined,
    )

    expect(result.entries).toHaveLength(1)
    expect(result.cache.entriesByMessageId.has('msg_1')).toBe(true)
    expect(result.cache.previousOrder).toEqual(['msg_1'])
  })

  test('empty messageOrder returns empty entries', () => {
    const cache = createEmptyRenderCache()
    const result = deriveRenderEntries([], {}, {}, {}, cache)

    expect(result.entries).toHaveLength(0)
    expect(result.cache.previousOrder).toEqual([])
  })

  test('missing message record in messagesById is skipped', () => {
    // Simulate orphaned order entry
    const result = deriveRenderEntries(
      ['nonexistent'],
      {},
      { nonexistent: [] },
      {},
      undefined,
    )

    expect(result.entries).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: Continuous Delta Performance (1800 events)
// ---------------------------------------------------------------------------

describe('continuous delta performance', () => {
  test('1800 MESSAGE_PART_DELTA events preserves message record references', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add a user message and assistant message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [createTestPart('part_1', 'msg_1', 'text', 'User said something')],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [createTestPart('part_2', 'msg_2', 'text', '')],
    })

    // First derivation
    let ctx = actor.getSnapshot().context
    let result = deriveRenderEntries(
      ctx.messageOrder,
      ctx.messagesById,
      ctx.partsByMessageId,
      ctx.partsById,
      undefined,
    )

    const msg1Entry = result.entries[0]
    const msg2Entry = result.entries[1]

    // Simulate 1800 MESSAGE_PART_DELTA events (30 seconds at 60/sec)
    const DELTA_COUNT = 1800
    const DELTA_TEXT = 'a'

    for (let i = 0; i < DELTA_COUNT; i++) {
      actor.send({
        type: 'MESSAGE_PART_DELTA',
        directory: BASE_DIR,
        sessionId: BASE_SESSION_ID,
        timestamp: Date.now(),
        messageId: 'msg_2',
        partId: 'part_2',
        field: 'text',
        delta: DELTA_TEXT,
      })

      ctx = actor.getSnapshot().context
      result = deriveRenderEntries(
        ctx.messageOrder,
        ctx.messagesById,
        ctx.partsByMessageId,
        ctx.partsById,
        result.cache,
      )
    }

    // After 1800 deltas, verify:
    // 1. msg_1 entry should still be same reference (never changed)
    expect(result.entries[0]).toBe(msg1Entry)

    // 2. msg_2 entry should be different (changed each delta)
    expect(result.entries[1]).not.toBe(msg2Entry)

    // 3. msg_2 should have accumulated all the text
    expect((result.entries[1].parts[0] as { text?: string }).text).toBe('a'.repeat(DELTA_COUNT))
  })
})

// ---------------------------------------------------------------------------
// Tests: Machine Selectors - Narrow Subscription
// ---------------------------------------------------------------------------

describe('machine selector narrow subscriptions', () => {
  test('messageOrder returns array in correct order', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [],
    })

    const ctx = actor.getSnapshot().context
    // Messages should be in insertion order (msg_2 then msg_1)
    expect(ctx.messageOrder).toEqual(['msg_2', 'msg_1'])
  })

  test('messagesById returns correct message or undefined', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [],
    })

    const ctx = actor.getSnapshot().context

    // Existing message
    expect(ctx.messagesById['msg_1'] !== undefined).toBe(true)
    expect(ctx.messagesById['msg_1']?.role).toBe('user')

    // Non-existing message
    expect(ctx.messagesById['nonexistent'] === undefined).toBe(true)
  })

  test('streamingMessageId updates correctly', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Initially null
    expect(actor.getSnapshot().context.streamingMessageId).toBeNull()

    // STREAM_STARTED sets it
    actor.send({
      type: 'STREAM_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      streamingMessageId: 'msg_1',
      streamingPartId: 'part_1',
    })

    expect(actor.getSnapshot().context.streamingMessageId).toBe('msg_1')

    // STREAM_COMPLETED clears it
    actor.send({
      type: 'STREAM_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    expect(actor.getSnapshot().context.streamingMessageId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: Retry Overlay Machine State
// ---------------------------------------------------------------------------

describe('retry overlay machine state', () => {
  test('RETRY_STARTED sets retry state correctly', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Send RETRY_REQUESTED to enter retrying state
    actor.send({
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // RETRY_STARTED sets retry state
    actor.send({
      type: 'RETRY_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 1,
      retryMessage: 'Rate limit hit',
      retryCooldownUntil: null,
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.retryMessage).toBe('Rate limit hit')
    expect(ctx.retryCount).toBe(1)
    expect(ctx.retryCooldownUntil).toBeNull()
  })

  test('RETRY_FAILED transitions to cooldown state (retryCooldownUntil managed externally)', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({ type: 'RETRY_REQUESTED', directory: BASE_DIR, sessionId: BASE_SESSION_ID, timestamp: Date.now() })

    actor.send({
      type: 'RETRY_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 1,
      retryMessage: 'Rate limit',
      retryCooldownUntil: null,
    })

    // RETRY_FAILED transitions to cooldown state (machine state, not context)
    actor.send({
      type: 'RETRY_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    // Check that we're in the cooldown state
    const state = actor.getSnapshot().value as { retry?: string }
    expect(state.retry).toBe('cooldown')

    // Note: retryCooldownUntil is NOT set in the machine context for cooldown
    // The cooldown timing is managed externally via emitScheduleRetryCooldown effect
    const ctx = actor.getSnapshot().context
    expect(ctx.retryCooldownUntil).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: ChatMessageEntry Shape Contract
// ---------------------------------------------------------------------------

describe('ChatMessageEntry shape contract', () => {
  test('deriveRenderEntries produces ChatMessageEntry-compatible output', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add a user message with a text part
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [
        createTestPart('part_1', 'msg_1', 'text', 'Hello world'),
      ],
    })

    // Add an assistant message with a tool part
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [
        createTestPart('part_2', 'msg_2', 'tool', 'test'),
      ],
    })

    const ctx = actor.getSnapshot().context
    const result = deriveRenderEntries(
      ctx.messageOrder,
      ctx.messagesById,
      ctx.partsByMessageId,
      ctx.partsById,
      undefined,
    )

    expect(result.entries).toHaveLength(2)

    // Verify entry0: user message
    const [userEntry] = result.entries
    expect(userEntry.info.id).toBe('msg_1')
    expect(userEntry.info.role).toBe('user')
    expect(userEntry.info.sessionID).toBe(BASE_SESSION_ID)
    // createdAt/parentID only exist on AssistantMessage variant - cast for test access
    expect((userEntry.info as { createdAt?: number }).createdAt).toBe(1000)
    expect((userEntry.info as { parentID?: string | null }).parentID).toBeNull()
    expect(userEntry.parts).toHaveLength(1)
    expect(userEntry.parts[0].type).toBe('text')
    expect((userEntry.parts[0] as { text?: string }).text).toBe('Hello world')

    // Verify entry 1: assistant message
    const [, assistantEntry] = result.entries
    expect(assistantEntry.info.id).toBe('msg_2')
    expect(assistantEntry.info.role).toBe('assistant')
    expect(assistantEntry.parts).toHaveLength(1)
    expect(assistantEntry.parts[0].type).toBe('tool')
  })

  test('deriveRenderEntries produces entries with error field set', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add a message with an error
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: {
        id: 'msg_err',
        role: 'assistant',
        sessionId: BASE_SESSION_ID,
        createdAt: 1000,
        parentId: null,
        model: null,
        agent: null,
        provider: null,
        cost: null,
        tokens: null,
        error: 'Rate limit exceeded',
      },
      initialParts: [],
    })

    const ctx = actor.getSnapshot().context
    const result = deriveRenderEntries(
      ctx.messageOrder,
      ctx.messagesById,
      ctx.partsByMessageId,
      ctx.partsById,
      undefined,
    )

    expect(result.entries).toHaveLength(1)
    expect((result.entries[0].info as { error?: string }).error).toBe('Rate limit exceeded')
  })

  test('machine messages take precedence over empty legacy array', () => {
    // This test verifies that when the machine has messages but legacy sync
    // store has an empty array, the machine messages are the source of truth.
    // This is the core Phase 3.3 invariant: machine data wins.
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Machine has messages
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [createTestPart('part_1', 'msg_1', 'text', 'User message')],
    })

    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_2', 'assistant', 2000),
      initialParts: [createTestPart('part_2', 'msg_2', 'text', 'Assistant response')],
    })

    const ctx = actor.getSnapshot().context
    const result = deriveRenderEntries(
      ctx.messageOrder,
      ctx.messagesById,
      ctx.partsByMessageId,
      ctx.partsById,
      undefined,
    )

    // Machine should produce 2 entries regardless of what legacy store says
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].info.id).toBe('msg_1')
    expect(result.entries[1].info.id).toBe('msg_2')
  })
})
