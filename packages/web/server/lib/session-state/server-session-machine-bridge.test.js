import { afterEach, describe, expect, it, beforeEach } from 'vitest';
import { createEventBus } from '../../lib/core/event-bus.js';
import { EVENTS } from '../../lib/core/events.js';

/**
 * Polls for a condition to become true, failing fast rather than using arbitrary sleeps.
 * @param {() => T | undefined | null | false} condition
 * @param {string} description
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<NonNullable<T>>}
 * @template T
 */
async function waitFor(condition, description, timeoutMs = 5000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = condition();
    if (result) return /** @type {NonNullable<T>} */ (result);
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

// We test the module by importing its factory functions after implementation.
// For now, define the test interface based on the documented API.

const TEST_DIR = '/test/project';
const TEST_SESSION = 'session-test-1';

describe('server-session-actor-registry', () => {
  /** @type {Array<() => void>} */
  const cleanupFns = [];

  afterEach(() => {
    for (const fn of cleanupFns) fn();
    cleanupFns.length = 0;
  });

  describe('getOrCreate', () => {
    it('creates an actor for a directory::sessionId key', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const actor = registry.getOrCreate(TEST_DIR, TEST_SESSION);
      expect(actor).toBeDefined();
      expect(typeof actor.send).toBe('function');
      expect(typeof actor.getSnapshot).toBe('function');
    });

    it('returns the same actor on repeated getOrCreate for same key', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const actor1 = registry.getOrCreate(TEST_DIR, TEST_SESSION);
      const actor2 = registry.getOrCreate(TEST_DIR, TEST_SESSION);
      expect(actor1).toBe(actor2);
    });

    it('rejects duplicate explicit registration with same key', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const { createSessionMachine } = await import('@openchamber/session-state');
      const { createActor } = await import('xstate');
      const machine = createSessionMachine({ directory: TEST_DIR, sessionId: TEST_SESSION, timestamp: Date.now() });
      const actor = createActor(machine);
      registry.registerActor(TEST_DIR, TEST_SESSION, actor);

      expect(() => registry.registerActor(TEST_DIR, TEST_SESSION, actor)).toThrow();
    });

    it('rejects registration with identity mismatch', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const { createSessionMachine } = await import('@openchamber/session-state');
      const { createActor } = await import('xstate');
      const machine = createSessionMachine({ directory: '/other/dir', sessionId: TEST_SESSION, timestamp: Date.now() });
      const actor = createActor(machine);

      expect(() => registry.registerActor(TEST_DIR, TEST_SESSION, actor)).toThrow();
    });
  });

  describe('send and getSnapshot', () => {
    it('sends an event to an actor and returns a snapshot', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const actor = registry.getOrCreate(TEST_DIR, TEST_SESSION);
      const key = `${TEST_DIR}::${TEST_SESSION}`;

      actor.send({
        type: 'SESSION_OPENED',
        directory: TEST_DIR,
        sessionId: TEST_SESSION,
        timestamp: Date.now(),
        projectId: 'proj-1',
        parentSessionId: null,
      });

      const snapshot = registry.getSnapshot(key);
      expect(snapshot).not.toBeNull();
      expect(snapshot.key.directory).toBe(TEST_DIR);
      expect(snapshot.key.sessionId).toBe(TEST_SESSION);
    });
  });

  describe('evict', () => {
    it('removes an actor and returns null for getSnapshot after evict', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });
      cleanupFns.push(() => registry.dispose());

      const key = `${TEST_DIR}::${TEST_SESSION}`;
      registry.getOrCreate(TEST_DIR, TEST_SESSION);
      registry.evict(key);

      expect(registry.getSnapshot(key)).toBeNull();
    });
  });

  describe('dispose', () => {
    it('stops all actors and clears state', async () => {
      const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
      const registry = createSessionActorRegistry({
        createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
      });

      registry.getOrCreate(TEST_DIR, TEST_SESSION);
      registry.getOrCreate(TEST_DIR, 'session-test-2');
      registry.dispose();

      const key1 = `${TEST_DIR}::${TEST_SESSION}`;
      const key2 = `${TEST_DIR}::session-test-2`;
      expect(registry.getSnapshot(key1)).toBeNull();
      expect(registry.getSnapshot(key2)).toBeNull();
    });
  });
});

describe('server-session-event-normalizer', () => {
  let normalizeOpenCodePayload;

  beforeEach(async () => {
    ({ normalizeOpenCodePayload } = await import('./server-session-event-normalizer.js'));
  });

  it('normalizes session.status busy to STREAM_STARTED', () => {
    const payload = {
      type: 'session.status',
      id: 'evt-1',
      properties: {
        sessionID: TEST_SESSION,
        info: { type: 'busy' },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    expect(results.length).toBeGreaterThan(0);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'STREAM_STARTED')).toBe(true);
  });

  it('normalizes session.status idle to STREAM_COMPLETED', () => {
    const payload = {
      type: 'session.status',
      id: 'evt-2',
      properties: {
        sessionID: TEST_SESSION,
        info: { type: 'idle' },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'STREAM_COMPLETED')).toBe(true);
  });

  it('normalizes message.updated', () => {
    const payload = {
      type: 'message.updated',
      id: 'evt-3',
      properties: {
        sessionID: TEST_SESSION,
        messageID: 'msg-1',
        updates: { role: 'user' },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'MESSAGE_UPDATED')).toBe(true);
  });

  it('normalizes message.part.updated', () => {
    const payload = {
      type: 'message.part.updated',
      id: 'evt-4',
      properties: {
        sessionID: TEST_SESSION,
        partID: 'part-1',
        updates: { toolState: 'done' },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'MESSAGE_PART_UPDATED')).toBe(true);
  });

  it('normalizes message.part.delta', () => {
    const payload = {
      type: 'message.part.delta',
      id: 'evt-5',
      properties: {
        sessionID: TEST_SESSION,
        partID: 'part-1',
        messageID: 'msg-1',
        delta: ' hello',
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'MESSAGE_PART_DELTA')).toBe(true);
  });

  it('normalizes permission asked', () => {
    const payload = {
      type: 'permission.asked',
      id: 'evt-6',
      properties: {
        sessionID: TEST_SESSION,
        permission: {
          id: 'perm-1',
          sessionId: TEST_SESSION,
          permission: 'filesystem.read',
          patterns: ['/home/**'],
          metadata: {},
        },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'PERMISSION_REQUESTED')).toBe(true);
  });

  it('normalizes question asked', () => {
    const payload = {
      type: 'question.asked',
      id: 'evt-7',
      properties: {
        sessionID: TEST_SESSION,
        question: {
          id: 'q-1',
          sessionId: TEST_SESSION,
          questions: ['Continue?'],
          tool: null,
        },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'QUESTION_REQUESTED')).toBe(true);
  });

  it('normalizes stream failure', () => {
    const payload = {
      type: 'stream.failed',
      id: 'evt-8',
      properties: {
        sessionID: TEST_SESSION,
        error: 'Network error',
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'STREAM_FAILED')).toBe(true);
  });

  it('normalizes load failure', () => {
    const payload = {
      type: 'load.failed',
      id: 'evt-9',
      properties: {
        sessionID: TEST_SESSION,
        error: 'Session not found',
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const streamed = results.filter(r => !('error' in r));
    expect(streamed.some(r => r.event.type === 'SESSION_LOAD_FAILED')).toBe(true);
  });

  it('rejects malformed payloads with error objects', () => {
    const badPayload = { type: 'unknown.type' };
    const results = normalizeOpenCodePayload(badPayload, TEST_DIR);
    expect(results.some(r => 'error' in r)).toBe(true);
  });

  it('preserves source metadata on normalized events', () => {
    const payload = {
      type: 'session.status',
      id: 'evt-src-1',
      properties: {
        sessionID: TEST_SESSION,
        info: { type: 'busy' },
      },
    };
    const results = normalizeOpenCodePayload(payload, TEST_DIR);
    const evt = results.find(r => !('error' in r));
    expect(evt).toBeDefined();
    expect(evt.event.directory).toBe(TEST_DIR);
    expect(evt.event.sessionId).toBe(TEST_SESSION);
    expect(evt.event.timestamp).toBeDefined();
    expect(evt.sourceEventId).toBe('evt-src-1');
  });
});

describe('server-session-effect-executor', () => {
  it('executes sendPrompt effect', async () => {
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    let called = false;
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: (dir, sid, prompt, prov, model, agent) => {
          expect(dir).toBe(TEST_DIR);
          expect(sid).toBe(TEST_SESSION);
          expect(prompt).toBe('hello');
          called = true;
        },
        abort: () => {},
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });

    await executor.execute({
      type: 'sendPrompt',
      directory: TEST_DIR,
      sessionId: TEST_SESSION,
      prompt: 'hello',
      provider: null,
      model: null,
      agent: null,
    });

    expect(called).toBe(true);
  });

  it('executes abort effect', async () => {
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    let called = false;
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: () => {},
        abort: (dir, sid) => {
          expect(dir).toBe(TEST_DIR);
          expect(sid).toBe(TEST_SESSION);
          called = true;
        },
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });

    await executor.execute({
      type: 'abort',
      directory: TEST_DIR,
      sessionId: TEST_SESSION,
    });

    expect(called).toBe(true);
  });

  it('clears timers on clearForActor', async () => {
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: () => {},
        abort: () => {},
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });

    const key = `${TEST_DIR}::${TEST_SESSION}`;

    // Schedule a cooldown
    await executor.execute({
      type: 'scheduleRetryCooldown',
      directory: TEST_DIR,
      sessionId: TEST_SESSION,
      delayMs: 5000,
    });

    // Clear should not throw
    executor.clearForActor(key);
  });
});

describe('server-session-snapshot-publisher', () => {
  it('validates snapshot before publishing', async () => {
    const { createSnapshotPublisher } = await import('./server-session-snapshot-publisher.js');
    let published = false;
    const publisher = createSnapshotPublisher({
      transport: {
        writeSseEvent: () => { published = true; },
      },
    });

    // Invalid snapshot should not be published
    try {
      publisher.publish({ invalid: 'snapshot' });
    } catch {
      // expected
    }
    expect(published).toBe(false);
  });
});

describe('server-session-machine-bridge', () => {
  it('subscribes to EVENT_RECEIVED and bridges to actor', async () => {
    const { createServerSessionMachineBridge } = await import('./server-session-machine-bridge.js');
    const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    const { createSnapshotPublisher } = await import('./server-session-snapshot-publisher.js');

    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: () => {},
        abort: () => {},
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });
    const publisher = createSnapshotPublisher({
      transport: { writeSseEvent: () => {} },
    });

    const bridge = createServerSessionMachineBridge({
      eventBus,
      registry,
      executor,
      publisher,
 });

    bridge.start();

    // Send a payload through the event bus
    eventBus.emit(EVENTS.EVENT_RECEIVED, {
      payload: {
        type: 'session.status',
        id: 'bridge-test-1',
        properties: {
          sessionID: TEST_SESSION,
          info: { type: 'busy' },
        },
      },
      directory: TEST_DIR,
    });

    // Actor should exist now
    const key = `${TEST_DIR}::${TEST_SESSION}`;
    expect(registry.getSnapshot(key)).not.toBeNull();

    bridge.stop();
    registry.dispose();
  });

  it('executes emitted effects via actor.on() (not actor.subscribe)', async () => {
    const { createServerSessionMachineBridge } = await import('./server-session-machine-bridge.js');
    const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    const { createSnapshotPublisher } = await import('./server-session-snapshot-publisher.js');

    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });

    /** @type {Array<import('@openchamber/session-state').SessionMachineEffect>} */
    const capturedEffects = [];
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: (dir, sid, prompt) => {
          capturedEffects.push({ type: 'sendPrompt', directory: dir, sessionId: sid, prompt });
        },
        abort: () => {},
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });
    const publisher = createSnapshotPublisher({
      transport: { writeSseEvent: () => {} },
    });

    const bridge = createServerSessionMachineBridge({
      eventBus,
      registry,
      executor,
      publisher,
    });

    bridge.start();

    // First, transition the machine to 'ready' state so it can accept PROMPT_SUBMITTED
    eventBus.emit(EVENTS.EVENT_RECEIVED, {
      payload: {
        type: 'session.status',
        id: 'effect-setup-1',
        properties: {
          sessionID: TEST_SESSION,
          info: { type: 'busy' },
        },
      },
      directory: TEST_DIR,
    });

    // Wait for the actor to be created with the session key
    const key = `${TEST_DIR}::${TEST_SESSION}`;
    await waitFor(() => registry.getSnapshot(key) !== null);

    // Now send SESSION_OPENED to move the machine from 'opening' to 'ready' state.
    // session.opened (not session.status) is the correct event for this transition.
    eventBus.emit(EVENTS.EVENT_RECEIVED, {
      payload: {
        type: 'session.opened',
        id: 'effect-setup-2',
        properties: {
          sessionID: TEST_SESSION,
          projectId: null,
          parentSessionId: null,
        },
      },
      directory: TEST_DIR,
    });

    // Send PROMPT_SUBMITTED which emits the 'sendPrompt' effect via actor.on()
    // The identity fields (directory, sessionId) must match the actor's context.
    eventBus.emit(EVENTS.EVENT_RECEIVED, {
      payload: {
        type: 'message.updated',
        id: 'effect-test-1',
        properties: {
          sessionID: TEST_SESSION,
          messageID: 'msg-1',
          updates: { role: 'user', content: 'hello' },
        },
      },
      directory: TEST_DIR,
    });

    // PROMPT_SUBMITTED is a domain event sent directly to the actor, not an OpenCode event.
    // Send it directly via the registry so the machine can emit the sendPrompt effect.
    registry.send(key, {
      type: 'PROMPT_SUBMITTED',
      directory: TEST_DIR,
      sessionId: TEST_SESSION,
      timestamp: Date.now(),
      prompt: 'hello world',
      provider: null,
      model: null,
      agent: null,
    });

    // Wait for the sendPrompt effect to be captured via actor.on() listeners.
    // This will fail if the bridge used actor.subscribe() instead of actor.on(),
    // because subscribe() does not receive emitted effects.
    await waitFor(
      () => capturedEffects.find(e => e.type === 'sendPrompt'),
      'sendPrompt effect via actor.on()',
    );

    const effect = capturedEffects.find(e => e.type === 'sendPrompt');
    expect(effect).toBeDefined();
    expect(effect.type).toBe('sendPrompt');
    expect(effect.directory).toBe(TEST_DIR);
    expect(effect.sessionId).toBe(TEST_SESSION);
    expect(effect.prompt).toBe('hello world');

    bridge.stop();
    registry.dispose();
  });

  it('starts gracefully when OpenCode is not ready', async () => {
    const { createServerSessionMachineBridge } = await import('./server-session-machine-bridge.js');
    const { createSessionActorRegistry } = await import('./server-session-actor-registry.js');
    const { createEffectExecutor } = await import('./server-session-effect-executor.js');
    const { createSnapshotPublisher } = await import('./server-session-snapshot-publisher.js');

    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });
    const executor = createEffectExecutor({
      callbacks: {
        sendPrompt: () => {},
        abort: () => {},
        retry: () => {},
        loadOlder: () => {},
        reportFatalInvariant: () => {},
      },
    });
    const publisher = createSnapshotPublisher({
      transport: { writeSseEvent: () => {} },
    });

    const bridge = createServerSessionMachineBridge({
      eventBus,
      registry,
      executor,
      publisher,
    });

    // Should not throw
    bridge.start();
    bridge.stop();
    registry.dispose();
  });
});
