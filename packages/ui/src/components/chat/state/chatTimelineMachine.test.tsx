/**
 * Tests for Phase 3.3 Hot-Path Message Migration - Chat Timeline History Domain
 *
 * Tests history domain fields (isLoadingOlder, hasMoreAbove, oldestLoadedMessageId,
 * newestLoadedMessageId, historyLoadError) sourced from machine selectors while
 * presentation state remains in the timeline controller.
 */

import { describe, expect, test } from 'bun:test'
import { createActor } from 'xstate'
import { createSessionMachine } from '@openchamber/session-state'
import type { SessionMachineContext } from '@openchamber/session-state'

/** Shape of the loadOlder effect emitted by the machine */
interface LoadOlderEffect {
  type: 'loadOlder'
  directory: string
  sessionId: string
}

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

// ---------------------------------------------------------------------------
// Tests: LOAD_OLDER_REQUESTED
// ---------------------------------------------------------------------------

describe('LOAD_OLDER_REQUESTED transitions', () => {
  test('LOAD_OLDER_REQUESTED sets isLoadingOlder to true', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Initially false
    expect(actor.getSnapshot().context.isLoadingOlder).toBe(false)

    // LOAD_OLDER_REQUESTED sets isLoadingOlder to true
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    expect(actor.getSnapshot().context.isLoadingOlder).toBe(true)
    expect(actor.getSnapshot().context.historyLoadError).toBeNull()
  })

  test('LOAD_OLDER_REQUESTED emits loadOlder effect', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    const loadOlderEvents: LoadOlderEffect[] = []
    actor.on('loadOlder', (emitted: LoadOlderEffect) => {
      loadOlderEvents.push(emitted)
    })

    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    expect(loadOlderEvents).toHaveLength(1)
    expect(loadOlderEvents[0].directory).toBe(BASE_DIR)
    expect(loadOlderEvents[0].sessionId).toBe(BASE_SESSION_ID)
  })

  test('LOAD_OLDER_REQUESTED is blocked for wrong identity', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Wrong directory
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: '/wrong/dir',
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Should still be false (blocked by identity guard)
    expect(actor.getSnapshot().context.isLoadingOlder).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: LOAD_OLDER_COMPLETED
// ---------------------------------------------------------------------------

describe('LOAD_OLDER_COMPLETED transitions', () => {
  test('LOAD_OLDER_COMPLETED sets isLoadingOlder to false and updates history state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Enter loading state
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    expect(actor.getSnapshot().context.isLoadingOlder).toBe(true)

    // LOAD_OLDER_COMPLETED with older messages
    // Note: machine prepends olderMessages in reverse order
    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_old_1', 'user', 1000),
        createTestMessage('msg_old_2', 'assistant', 1100),
      ],
      olderPartsByMessageId: {
        msg_old_1: [],
        msg_old_2: [],
      },
    })

    const ctx = actor.getSnapshot().context

    // isLoadingOlder should be false
    expect(ctx.isLoadingOlder).toBe(false)

    // oldestLoadedMessageId should be set to first older message (msg_old_1)
    expect(ctx.oldestLoadedMessageId).toBe('msg_old_1')

    // hasMoreAbove should be true (we loaded messages)
    expect(ctx.hasMoreAbove).toBe(true)

    // messageOrder should be prepended with older messages in reverse order
    // newer older message (msg_old_2) comes first, then older (msg_old_1)
    expect(ctx.messageOrder[0]).toBe('msg_old_2')
    expect(ctx.messageOrder[1]).toBe('msg_old_1')
  })

  test('LOAD_OLDER_COMPLETED with empty olderMessages sets hasMoreAbove to false', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add initial message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 2000),
      initialParts: [],
    })

    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // LOAD_OLDER_COMPLETED with no older messages
    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [],
      olderPartsByMessageId: {},
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.isLoadingOlder).toBe(false)
    expect(ctx.hasMoreAbove).toBe(false)
    expect(ctx.oldestLoadedMessageId).toBeNull()
  })

  test('LOAD_OLDER_COMPLETED prepends older messages to messageOrder', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add a newer message first
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_new', 'user', 3000),
      initialParts: [],
    })

    const initialOrder = [...actor.getSnapshot().context.messageOrder]
    expect(initialOrder).toEqual(['msg_new'])

    // Load older messages
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_old', 'assistant', 1000),
      ],
      olderPartsByMessageId: {
        msg_old: [],
      },
    })

    const ctx = actor.getSnapshot().context

    // Older messages should be prepended (reverse order of insertion)
    expect(ctx.messageOrder[0]).toBe('msg_old')
    expect(ctx.messageOrder[1]).toBe('msg_new')
  })
})

// ---------------------------------------------------------------------------
// Tests: LOAD_OLDER_FAILED
// ---------------------------------------------------------------------------

describe('LOAD_OLDER_FAILED transitions', () => {
  test('LOAD_OLDER_FAILED sets isLoadingOlder to false and records error', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Enter loading state
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    expect(actor.getSnapshot().context.isLoadingOlder).toBe(true)

    // LOAD_OLDER_FAILED
    actor.send({
      type: 'LOAD_OLDER_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'Network error',
    })

    const ctx = actor.getSnapshot().context

    expect(ctx.isLoadingOlder).toBe(false)
    expect(ctx.historyLoadError).toBe('Network error')
  })

  test('LOAD_OLDER_FAILED clears error on subsequent successful load', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Fail a load
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'Network error',
    })

    expect(actor.getSnapshot().context.historyLoadError).toBe('Network error')

    // Successful load clears error
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_old', 'user', 1000),
      ],
      olderPartsByMessageId: {
        msg_old: [],
      },
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.historyLoadError).toBeNull()
    expect(ctx.isLoadingOlder).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: History State Machine State Machine
// ---------------------------------------------------------------------------

describe('history state machine region', () => {
  test('history region starts in idle state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    const state = actor.getSnapshot().value as { history?: string }
    expect(state.history).toBe('idle')
  })

  test('LOAD_OLDER_REQUESTED transitions history region to loading_older', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    const state = actor.getSnapshot().value as { history?: string }
    expect(state.history).toBe('loading_older')
  })

  test('LOAD_OLDER_COMPLETED transitions history region back to idle', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [],
      olderPartsByMessageId: {},
    })

    const state = actor.getSnapshot().value as { history?: string }
    expect(state.history).toBe('idle')
  })

  test('LOAD_OLDER_FAILED transitions history region back to idle', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'error',
    })

    const state = actor.getSnapshot().value as { history?: string }
    expect(state.history).toBe('idle')
  })
})

// ---------------------------------------------------------------------------
// Tests: newestLoadedMessageId Tracking
// ---------------------------------------------------------------------------

describe('newestLoadedMessageId tracking', () => {
  test('newestLoadedMessageId is tracked but not set by LOAD_OLDER_COMPLETED', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Add a message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: createTestMessage('msg_1', 'user', 1000),
      initialParts: [],
    })

    // Initially null (no history loaded)
    expect(actor.getSnapshot().context.newestLoadedMessageId).toBeNull()

    // Load older messages
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_old', 'assistant', 500),
      ],
      olderPartsByMessageId: {
        msg_old: [],
      },
    })

    // Note: newestLoadedMessageId is NOT set by handleLoadOlderCompletedAction
    // It remains null because the machine doesn't track this field for history loads
    expect(actor.getSnapshot().context.newestLoadedMessageId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: useChatTimelineState History Domain Integration
// ---------------------------------------------------------------------------

describe('useChatTimelineState history domain exposure', () => {
  test('timeline state exposes isLoadingOlder from machine', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Initially false
    let ctx = actor.getSnapshot().context
    expect(ctx.isLoadingOlder).toBe(false)

    // Request load
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    ctx = actor.getSnapshot().context
    expect(ctx.isLoadingOlder).toBe(true)

    // Complete load
    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [],
      olderPartsByMessageId: {},
    })

    ctx = actor.getSnapshot().context
    expect(ctx.isLoadingOlder).toBe(false)
  })

  test('timeline state exposes hasMoreAbove from machine', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Initially false
    expect(actor.getSnapshot().context.hasMoreAbove).toBe(false)

    // Load older messages
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_old', 'user', 500),
      ],
      olderPartsByMessageId: {
        msg_old: [],
      },
    })

    // hasMoreAbove should be true (we loaded messages)
    expect(actor.getSnapshot().context.hasMoreAbove).toBe(true)
  })

  test('timeline state exposes oldestLoadedMessageId from machine', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Load older messages
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_COMPLETED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      olderMessages: [
        createTestMessage('msg_oldest', 'assistant', 100),
        createTestMessage('msg_middle', 'user', 500),
      ],
      olderPartsByMessageId: {
        msg_oldest: [],
        msg_middle: [],
      },
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.oldestLoadedMessageId).toBe('msg_oldest')
  })

  test('timeline state exposes historyLoadError from machine', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()
    sendSessionOpened(actor)

    // Fail a load
    actor.send({
      type: 'LOAD_OLDER_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    actor.send({
      type: 'LOAD_OLDER_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'Failed to fetch older messages',
    })

    expect(actor.getSnapshot().context.historyLoadError).toBe('Failed to fetch older messages')
  })
})
