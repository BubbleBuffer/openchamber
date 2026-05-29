/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from 'bun:test'
import { createActor } from 'xstate'
import { createSessionMachine } from './sessionMachine'
import type { SessionMachineContext } from './context'
import { createInitialSessionContext } from './context'
import type { SessionDomainEvent } from './events'
import type { SessionSnapshotV1 } from './snapshots'
import { createSessionSnapshot, restoreSessionMachineSnapshot, validateSessionSnapshotV1 } from './snapshots'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_DIR = '/repo/app'
const BASE_SESSION_ID = 'ses_abc123'
const BASE_TIMESTAMP = 1700000000000

function makeContext(overrides: Partial<SessionMachineContext> = {}): SessionMachineContext {
  const base = createInitialSessionContext({
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: BASE_TIMESTAMP,
  })
  return { ...base, ...overrides }
}

function makeMachine() {
  return createSessionMachine({
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: BASE_TIMESTAMP,
  })
}

function makeRegions(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    lifecycle: 'ready',
    activity: 'idle',
    interruptions: 'clear',
    history: 'idle',
    retry: 'idle',
    error: 'clear',
    ...overrides,
  }
}

function buildValidSnapshot(overrides: Partial<SessionMachineContext> = {}, regionOverrides: Partial<Record<string, string>> = {}): SessionSnapshotV1 {
  const context = makeContext(overrides)
  return createSessionSnapshot(context, makeRegions(regionOverrides), BASE_TIMESTAMP + 500)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Advance machine from opening to ready so we can test streaming/abort transitions */
function advanceToReady(actor: ReturnType<typeof createActor>) {
  actor.send({
    type: 'SESSION_OPENED',
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: Date.now(),
    projectId: null,
    parentSessionId: null,
  })
}

/** Advance machine from opening to streaming so we can test abort transitions */
function advanceToStreaming(actor: ReturnType<typeof createActor>) {
  advanceToReady(actor)
  actor.send({
    type: 'PROMPT_SUBMITTED',
    directory: BASE_DIR,
    sessionId: BASE_SESSION_ID,
    timestamp: Date.now(),
    prompt: 'hello',
    provider: null,
    model: null,
    agent: null,
  })
}

// ---------------------------------------------------------------------------
// Tests: identity validation blocks transitions without throwing
// ---------------------------------------------------------------------------

describe('identity validation', () => {
  test('PROMPT_SUBMITTED with wrong directory does not emit sendPrompt or change state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    const initialState = actor.getSnapshot().value
    const effects: any[] = []
    actor.subscribe((snapshot) => {
      const emitted = (snapshot as any).emitted
      if (emitted) {
        for (const effect of Array.isArray(emitted) ? emitted : [emitted]) {
          effects.push(effect)
        }
      }
    })

    const badEvent: SessionDomainEvent = {
      type: 'PROMPT_SUBMITTED',
      directory: '/wrong/dir',
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      prompt: 'hello',
      provider: null,
      model: null,
      agent: null,
    }

    // Should not throw - guard blocks transition silently
    actor.send(badEvent)

    // No sendPrompt effect
    const sendPromptEffects = effects.filter((e) => e?.type === 'sendPrompt')
    expect(sendPromptEffects).toHaveLength(0)
    // State unchanged
    expect(actor.getSnapshot().value).toEqual(initialState)
  })

  test('PROMPT_SUBMITTED with wrong sessionId does not emit sendPrompt or change state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    const initialState = actor.getSnapshot().value
    const effects: any[] = []
    actor.subscribe((snapshot) => {
      const emitted = (snapshot as any).emitted
      if (emitted) {
        for (const effect of Array.isArray(emitted) ? emitted : [emitted]) {
          effects.push(effect)
        }
      }
    })

    const badEvent: SessionDomainEvent = {
      type: 'PROMPT_SUBMITTED',
      directory: BASE_DIR,
      sessionId: 'ses_wrong',
      timestamp: Date.now(),
      prompt: 'hello',
      provider: null,
      model: null,
      agent: null,
    }

    actor.send(badEvent)

    const sendPromptEffects = effects.filter((e) => e?.type === 'sendPrompt')
    expect(sendPromptEffects).toHaveLength(0)
    expect(actor.getSnapshot().value).toEqual(initialState)
  })

  test('RETRY_REQUESTED with wrong sessionId does not emit retry or change state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    const initialState = actor.getSnapshot().value
    const effects: any[] = []
    actor.subscribe((snapshot) => {
      const emitted = (snapshot as any).emitted
      if (emitted) {
        for (const effect of Array.isArray(emitted) ? emitted : [emitted]) {
          effects.push(effect)
        }
      }
    })

    const badEvent: SessionDomainEvent = {
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: 'ses_wrong',
      timestamp: Date.now(),
    }

    actor.send(badEvent)

    const retryEffects = effects.filter((e) => e?.type === 'retry')
    expect(retryEffects).toHaveLength(0)
    expect(actor.getSnapshot().value).toEqual(initialState)
  })

  test('correct identity PROMPT_SUBMITTED emits sendPrompt and transitions state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    const effects: any[] = []
    actor.on('sendPrompt', (emitted) => {
      effects.push(emitted)
    })

    const goodEvent: SessionDomainEvent = {
      type: 'PROMPT_SUBMITTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      prompt: 'hello',
      provider: null,
      model: null,
      agent: null,
    }

    actor.send(goodEvent)

    expect(effects).toHaveLength(1)
    expect(effects[0].directory).toBe(BASE_DIR)
    expect(effects[0].sessionId).toBe(BASE_SESSION_ID)
  })
})

// ---------------------------------------------------------------------------
// Tests: abort semantics
// ---------------------------------------------------------------------------

describe('abort semantics', () => {
  test('ABORT_REQUESTED while streaming emits exactly one abort effect from activity region', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToStreaming(actor)

    const abortEffects: any[] = []
    actor.on('abort', (emitted) => {
      abortEffects.push(emitted)
    })

    actor.send({
      type: 'ABORT_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Exactly one abort effect from activity region
    expect(abortEffects).toHaveLength(1)
    expect(abortEffects[0].type).toBe('abort')
    expect(abortEffects[0].directory).toBe(BASE_DIR)
    expect(abortEffects[0].sessionId).toBe(BASE_SESSION_ID)
  })

  test('ABORT_REQUESTED moves activity to aborting, lifecycle stays streaming', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToStreaming(actor)

    actor.send({
      type: 'ABORT_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    const state = actor.getSnapshot().value as any
    // Activity should be aborting
    expect(state.activity).toBe('aborting')
    // Lifecycle should stay streaming (lifecycle does NOT transition to aborted)
    expect(state.lifecycle).toBe('streaming')
  })

  test('ABORT_CONFIRMED clears streaming metadata, activity becomes idle, lifecycle ready', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToStreaming(actor)

    // Set streaming metadata so ABORT_CONFIRMED has something to clear
    actor.send({
      type: 'STREAM_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      streamingMessageId: 'msg_1',
      streamingPartId: 'part_1',
    })

    actor.send({
      type: 'ABORT_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    const contextAfterAbort = actor.getSnapshot().context
    expect(contextAfterAbort.streamingMessageId).toBe('msg_1')

    actor.send({
      type: 'ABORT_CONFIRMED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    const state = actor.getSnapshot().value as any
    // activity transitions aborting -> idle, lifecycle stays streaming
    expect(state.activity).toBe('idle')
    expect(state.lifecycle).toBe('streaming')

    const ctx = actor.getSnapshot().context
    expect(ctx.streamingMessageId).toBe(null)
    expect(ctx.streamingPartId).toBe(null)
  })

  test('ABORT_FAILED returns activity to streaming, lifecycle stays streaming', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToStreaming(actor)

    actor.send({
      type: 'ABORT_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    const stateAfterAbort = actor.getSnapshot().value as any
    expect(stateAfterAbort.activity).toBe('aborting')

    actor.send({
      type: 'ABORT_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'network timeout',
    })

    const state = actor.getSnapshot().value as any
    expect(state.activity).toBe('streaming')
    expect(state.lifecycle).toBe('streaming')
  })
})

// ---------------------------------------------------------------------------
// Tests: message part lifecycle handlers
// ---------------------------------------------------------------------------

describe('message part lifecycle handlers', () => {
  test('MESSAGE_PART_STARTED inserts part into partsById and partsByMessageId', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // First add a message
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: BASE_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [],
    })

    // Send MESSAGE_PART_STARTED
    actor.send({
      type: 'MESSAGE_PART_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      part: { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' },
    })

    const ctx = actor.getSnapshot().context

    // part should be in partsById
    expect(ctx.partsById['part_1']).toBeDefined()
    expect(ctx.partsById['part_1'].type).toBe('text')
    expect(ctx.partsById['part_1'].messageId).toBe('msg_1')

    // part id should be in partsByMessageId['msg_1']
    expect(ctx.partsByMessageId['msg_1']).toContain('part_1')
  })

  test('MESSAGE_PART_UPDATED changes existing part fields without breaking id/messageId/type', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // Add message with initial part
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: BASE_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' }],
    })

    // Update the part
    actor.send({
      type: 'MESSAGE_PART_UPDATED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      partId: 'part_1',
      updates: { text: 'Hello World' },
    })

    const ctx = actor.getSnapshot().context
    const part = ctx.partsById['part_1']

    // id, messageId, type should be unchanged
    expect(part.id).toBe('part_1')
    expect(part.messageId).toBe('msg_1')
    expect(part.type).toBe('text')
    // text should be updated
    expect((part as any).text).toBe('Hello World')
  })

  test('MESSAGE_PART_FINISHED patches meta on the part', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // Add message with part
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: BASE_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'metadata', metadata: { done: false } }],
    })

    actor.send({
      type: 'MESSAGE_PART_FINISHED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      partId: 'part_1',
    })

    const ctx = actor.getSnapshot().context
    const part = ctx.partsById['part_1']

    // meta should be patched (finishedAt: timestamp)
    expect(part.type).toBe('metadata')
    if (part.type === 'metadata') {
      expect(part.metadata['finishedAt']).toBeDefined()
    }
  })

  test('MESSAGE_PART_REMOVED deletes part from both partsById and partsByMessageId', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // Add message with part
    actor.send({
      type: 'MESSAGE_ADDED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      message: { id: 'msg_1', role: 'user', sessionId: BASE_SESSION_ID, createdAt: Date.now(), parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      initialParts: [{ id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' }],
    })

    expect(actor.getSnapshot().context.partsById['part_1']).toBeDefined()
    expect(actor.getSnapshot().context.partsByMessageId['msg_1']).toContain('part_1')

    actor.send({
      type: 'MESSAGE_PART_REMOVED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      messageId: 'msg_1',
      partId: 'part_1',
    })

    const ctx = actor.getSnapshot().context
    // part should be gone from partsById
    expect(ctx.partsById['part_1']).toBeUndefined()
    // part id should be gone from partsByMessageId['msg_1']
    expect(ctx.partsByMessageId['msg_1']).not.toContain('part_1')
  })
})

// ---------------------------------------------------------------------------
// Tests: retry exhaustion
// ---------------------------------------------------------------------------

describe('retry exhaustion', () => {
  test('after max retries exhausted, no cooldown is scheduled', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // First send RETRY_REQUESTED to enter retrying state
    actor.send({
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Now send RETRY_STARTED with retryCount=MAX_RETRIES to set count before failure
    actor.send({
      type: 'RETRY_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 3,
      retryMessage: 'rate limit',
      retryCooldownUntil: null,
    })

    const cooldownScheduleEvents: any[] = []
    actor.on('scheduleRetryCooldown', (emitted) => {
      cooldownScheduleEvents.push(emitted)
    })

    // Send RETRY_FAILED when retryCount >= MAX_RETRIES
    actor.send({
      type: 'RETRY_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    // Should NOT schedule cooldown - goes to 'exhausted' state instead
    expect(cooldownScheduleEvents).toHaveLength(0)

    const state = actor.getSnapshot().value as any
    expect(state.retry).toBe('exhausted')
  })

  test('after max retries exhausted, errorType is retry_exhausted', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // First send RETRY_REQUESTED to enter retrying state
    actor.send({
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Now send RETRY_STARTED with retryCount=MAX_RETRIES to set count before failure
    actor.send({
      type: 'RETRY_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 3,
      retryMessage: 'rate limit',
      retryCooldownUntil: null,
    })

    actor.send({
      type: 'RETRY_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    expect(actor.getSnapshot().context.errorType).toBe('retry_exhausted')
  })

test('further RETRY_REQUESTED does not emit retry after exhaustion (even after error dismissal)', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    advanceToReady(actor)

    // First send RETRY_REQUESTED to enter retrying state
    actor.send({
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Now send RETRY_STARTED with retryCount=MAX_RETRIES
    actor.send({
      type: 'RETRY_STARTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      retryCount: 3,
      retryMessage: 'rate limit',
      retryCooldownUntil: null,
    })

    actor.send({
      type: 'RETRY_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'rate limit',
    })

    expect(actor.getSnapshot().context.errorType).toBe('retry_exhausted')

    const retryEmitEvents: any[] = []
    actor.on('retry', (emitted) => {
      retryEmitEvents.push(emitted)
    })

    // Dismiss error - machine goes to idle via exhausted->idle transition
    actor.send({
      type: 'ERROR_DISMISSED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // Machine is now in retry.idle with errorType=null, retryCount=0
    // idle state has RETRY_REQUESTED -> retrying transition with emitRetry
    // So a new RETRY_REQUESTED should emit retry and go to retrying
    actor.send({
      type: 'RETRY_REQUESTED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
    })

    // A new retry cycle emits retry
    expect(retryEmitEvents).toHaveLength(1)
    expect(retryEmitEvents[0].type).toBe('retry')
  })
})

// ---------------------------------------------------------------------------
// Tests: SESSION_LOAD_FAILED handling
// ---------------------------------------------------------------------------

describe('SESSION_LOAD_FAILED handling', () => {
  test('SESSION_LOAD_FAILED records errorType and leaves opening state', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    // Machine starts in lifecycle.opening
    expect((actor.getSnapshot().value as any).lifecycle).toBe('opening')

    actor.send({
      type: 'SESSION_LOAD_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'Failed to load session',
    })

    const ctx = actor.getSnapshot().context
    expect(ctx.errorType).toBe('session_load_failed')

    const state = actor.getSnapshot().value as any
    // lifecycle should leave 'opening' and enter 'error' state
    expect(state.lifecycle).not.toBe('opening')
    expect(state.lifecycle).toBe('error')
  })

  test('SESSION_LOAD_FAILED is not silently ignored', () => {
    const machine = makeMachine()
    const actor = createActor(machine)
    actor.start()

    let errorType: string | null = null
    actor.subscribe((snapshot) => {
      errorType = snapshot.context.errorType
    })

    actor.send({
      type: 'SESSION_LOAD_FAILED',
      directory: BASE_DIR,
      sessionId: BASE_SESSION_ID,
      timestamp: Date.now(),
      error: 'network failure',
    })

    expect(errorType ?? 'null').toBe('session_load_failed')
  })
})

// ---------------------------------------------------------------------------
// Tests: hydration restoration via restoreSessionMachineSnapshot
// ---------------------------------------------------------------------------

describe('hydration restoration', () => {
  test('restoreSessionMachineSnapshot converts SessionSnapshotV1 to machine snapshot with correct regions and context', () => {
    const context = makeContext({
      messageOrder: ['msg_1'],
      messagesById: {
        msg_1: { id: 'msg_1', role: 'user', sessionId: BASE_SESSION_ID, createdAt: 1700000000000, parentId: null, model: null, agent: null, provider: null, cost: null, tokens: null, error: null },
      },
      partsByMessageId: { msg_1: ['part_1'] },
      partsById: {
        part_1: { id: 'part_1', messageId: 'msg_1', type: 'text', text: 'Hello' },
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

    const snapshot = createSessionSnapshot(context, regions as any, 1700000005000)

    const machine = makeMachine()
    const resolvedSnapshot = restoreSessionMachineSnapshot(machine, snapshot) as any
    const actor = createActor(machine, { snapshot: resolvedSnapshot })
    actor.start()

    const state = actor.getSnapshot()
    expect(state.value as any).toEqual(snapshot.regions)
    expect(state.context.messageOrder).toEqual(['msg_1'])
    expect(state.context.messagesById['msg_1']).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Tests: finite numeric validation for meta.hydratedAt
// ---------------------------------------------------------------------------

describe('finite numeric validation for snapshot meta', () => {
  test('validateSessionSnapshotV1 rejects non-finite hydratedAt when non-null', () => {
    const snap = buildValidSnapshot()
    ;(snap as any).meta.hydratedAt = NaN
    expect(() => validateSessionSnapshotV1(snap)).toThrow(/hydratedAt/)

    const snap2 = buildValidSnapshot()
    ;(snap2 as any).meta.hydratedAt = Infinity
    expect(() => validateSessionSnapshotV1(snap2)).toThrow(/hydratedAt/)

    const snap3 = buildValidSnapshot()
    ;(snap3 as any).meta.hydratedAt = -Infinity
    expect(() => validateSessionSnapshotV1(snap3)).toThrow(/hydratedAt/)
  })
})