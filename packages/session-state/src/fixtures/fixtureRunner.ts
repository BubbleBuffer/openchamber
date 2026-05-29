/* eslint-disable @typescript-eslint/no-explicit-any */
import { createActor } from 'xstate'
import { createSessionMachine } from '../machine/sessionMachine'
import type { SessionMachineContext } from '../machine/context'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_DIR = '/repo/app'
const DEFAULT_SESSION_ID = 'ses_abc123'
const DEFAULT_TIMESTAMP = 1700000000000

// ---------------------------------------------------------------------------
// Fixture runner
// ---------------------------------------------------------------------------

/**
 * Create a fresh session machine with default test identity.
 */
export function createSessionMachineForTest(
  directory = DEFAULT_DIR,
  sessionId = DEFAULT_SESSION_ID,
  timestamp = DEFAULT_TIMESTAMP,
) {
  return createSessionMachine({ directory, sessionId, timestamp })
}

/**
 * Start a fresh actor from a fresh machine.
 */
export function createTestActor(
  directory = DEFAULT_DIR,
  sessionId = DEFAULT_SESSION_ID,
  timestamp = DEFAULT_TIMESTAMP,
) {
  const machine = createSessionMachineForTest(directory, sessionId, timestamp)
  const actor = createActor(machine)
  actor.start()
  return actor
}

/**
 * Advance machine from `opening` -> `ready` via SESSION_OPENED.
 */
export function advanceToReady(actor: ReturnType<typeof createActor>): void {
  actor.send({
    type: 'SESSION_OPENED',
    directory: DEFAULT_DIR,
    sessionId: DEFAULT_SESSION_ID,
    timestamp: Date.now(),
    projectId: null,
    parentSessionId: null,
  })
}

/**
 * Advance machine from `opening` -> `ready` -> `streaming` via PROMPT_SUBMITTED.
 */
export function advanceToStreaming(actor: ReturnType<typeof createActor>): void {
  advanceToReady(actor)
  actor.send({
    type: 'PROMPT_SUBMITTED',
    directory: DEFAULT_DIR,
    sessionId: DEFAULT_SESSION_ID,
    timestamp: Date.now(),
    prompt: 'hello',
    provider: null,
    model: null,
    agent: null,
  })
}

/**
 * Collect all emitted effects of a given type from an actor.
 * Returns the captured effect objects in order of emission.
 */
export function collectEffects(
  actor: ReturnType<typeof createActor>,
  effectType: string,
): any[] {
  const effects: any[] = []
  actor.on(effectType, (emitted: any) => {
    effects.push(emitted)
  })
  return effects
}

/**
 * Wait for a condition to become true, resolving with the final snapshot.
 * Times out after `timeoutMs`.
 */
export async function waitForSnapshot(
  actor: ReturnType<typeof createActor>,
  condition: (ctx: SessionMachineContext) => boolean,
  timeoutMs = 1000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`waitForSnapshot timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const subscription = actor.subscribe((snapshot) => {
      if (condition(snapshot.context)) {
        clearTimeout(timeout)
        subscription.unsubscribe()
        resolve(snapshot)
      }
    })
  })
}

// Re-export the machine creator for convenience in tests
export { createSessionMachine }

// Re-export constants for test use
export { DEFAULT_DIR, DEFAULT_SESSION_ID, DEFAULT_TIMESTAMP }