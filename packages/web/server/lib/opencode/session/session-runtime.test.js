import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createSessionRuntime } from './session-runtime.js';
import { createSessionActorRegistry } from '../../session-state/server-session-actor-registry.js';
import { EVENTS } from '../../core/events.js';

const TEST_DIR = '/test/project';

describe('session-runtime', () => {
  /** @type {ReturnType<typeof createSessionRuntime>[]} */
  const runtimes = [];

  afterEach(() => {
    for (const r of runtimes) r.dispose();
    runtimes.length = 0;
  });

  it('broadcasts attention clears through emitted events', () => {
    /** @type {Array<{ type: string; payload: unknown }>} */
    const events = [];
    const eventBus = createEventBus();
    eventBus.on('session:activity-changed', (payload) => {
      events.push({ type: 'session:activity-changed', payload });
    });
    eventBus.on('session:needs-attention', (payload) => {
      events.push({ type: 'session:needs-attention', payload });
    });

    const runtime = createSessionRuntime({ eventBus });
    runtimes.push(runtime);

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'busy' } },
    });

    runtime.markUserMessageSent('session-1');

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'done' } },
    });

    runtime.markSessionViewed('session-1', 'client-1');

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'session:activity-changed')).toBe(true);
  });

  it('resets all session activity to idle', () => {
    const eventBus = createEventBus();
    const runtime = createSessionRuntime({ eventBus });
    runtimes.push(runtime);

    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-1', info: { type: 'busy' } },
    });

    expect(runtime.getSessionActivitySnapshot()).toEqual({
      'session-1': { type: 'busy' },
    });

    runtime.resetAllSessionActivityToIdle();

    expect(runtime.getSessionActivitySnapshot()).toEqual({
      'session-1': { type: 'idle' },
    });
  });

  it('derives getSessionState from machine actors when actorRegistry present, not legacy cache', async () => {
    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });

    // Create a runtime WITH actorRegistry
    const runtime = createSessionRuntime({ eventBus, actorRegistry: registry });
    runtimes.push(runtime);

    // Populate legacy cache with stale data for legacy-session
    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'legacy-session', info: { type: 'busy' } },
    });

    // Create a machine actor for machine-session (not through SSE payload)
    registry.getOrCreate(TEST_DIR, 'machine-session');

    // getSessionState for machine-session should derive from machine actor
    // (not from any SSE-populated cache, which is empty for this sessionId)
    const machineState = runtime.getSessionState('machine-session');
    // Machine actor exists in idle state — should return valid machine-derived state
    expect(machineState).not.toBeNull();
    expect(machineState.status).toBe('idle');

    // legacy-session only exists in legacy cache (no machine actor for it).
    // With actorRegistry present, this session should NOT appear in machine-derived
    // state (Phase 3 no-fallback rule: machine authority, not stale cache)
    const legacyState = runtime.getSessionState('legacy-session');
    expect(legacyState).toBeNull();

    registry.dispose();
  });

  it('getSessionActivitySnapshot derives from machine entries, not legacy cache', async () => {
    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });

    const runtime = createSessionRuntime({ eventBus, actorRegistry: registry });
    runtimes.push(runtime);

    // Populate legacy cache with session-legacy
    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'session-legacy', info: { type: 'busy' } },
    });

    // Create machine actor for session-machine
    const actor = registry.getOrCreate('/test/dir', 'session-machine');

    // Advance actor to streaming state so activity region is 'streaming'
    actor.send({
      type: 'STREAM_STARTED',
      directory: '/test/dir',
      sessionId: 'session-machine',
      timestamp: Date.now(),
    });

    // When actorRegistry is present, getSessionActivitySnapshot must only
    // return sessions that have machine actors (not legacy-only sessions)
    const snapshot = runtime.getSessionActivitySnapshot();

    // session-machine is in the machine, so it should appear with correct phase
    expect(snapshot['session-machine']).toBeDefined();
    // session-legacy exists only in legacy cache — with machine authority,
    // it must NOT appear (no machine actor = no authority)
    expect(snapshot['session-legacy']).toBeUndefined();

    registry.dispose();
  });

  it('getSessionAttentionSnapshot merges machine needsAttention with legacy viewedByClients', async () => {
    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });

    const runtime = createSessionRuntime({ eventBus, actorRegistry: registry });
    runtimes.push(runtime);

    // Create a machine actor for merged-session
    const actor = registry.getOrCreate('/test/dir', 'merged-session');

    // Populate legacy cache so viewedByClients merge has something to work with.
    // Phase 3.5: When actorRegistry is present, needsAttention comes from machine
    // authority, but legacy viewedByClients are still merged (no legacy fallback for
    // needsAttention, but legacy state IS merged for isViewed).
    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'merged-session', info: { type: 'idle' } },
    });

    // Mark the session as viewed via legacy mechanism
    runtime.markSessionViewed('merged-session', 'client-viewer');

    // Advance actor to a state that triggers needsAttention=true.
    // selectNeedsAttention returns true when: permissions, questions, retryMessage,
    // or fatalError are present. Send PERMISSION_REQUESTED to set needsAttention=true.
    actor.send({
      type: 'PERMISSION_REQUESTED',
      directory: '/test/dir',
      sessionId: 'merged-session',
      timestamp: Date.now(),
      permission: {
        id: 'perm-1',
        sessionId: 'merged-session',
        permission: 'read',
        patterns: ['*'],
        metadata: {},
      },
    });

    const snapshot = runtime.getSessionAttentionSnapshot();

    // Machine authority provides needsAttention=true (permission pending)
    expect(snapshot['merged-session']).toBeDefined();
    // Phase 3.5: machine needsAttention used, legacy viewedByClients merged for isViewed
    expect(snapshot['merged-session'].needsAttention).toBe(true);
    // Legacy viewedByClients merged into snapshot (isViewed from legacy state)
    expect(snapshot['merged-session'].isViewed).toBe(true);

    registry.dispose();
  });

  it('getSessionAttentionSnapshot does not fall back to legacy cache for unmapped sessionIds', async () => {
    const eventBus = createEventBus();
    const registry = createSessionActorRegistry({
      createSessionMachine: (await import('@openchamber/session-state')).createSessionMachine,
    });

    const runtime = createSessionRuntime({ eventBus, actorRegistry: registry });
    runtimes.push(runtime);

    // Only legacy cache entry, no machine actor
    runtime.processOpenCodeSsePayload({
      type: 'session.status',
      properties: { sessionID: 'legacy-only', info: { type: 'idle' } },
    });

    // With actorRegistry present, session-ids only in legacy cache must NOT
    // appear in the machine-derived snapshot (Phase 3 no-fallback rule)
    const snapshot = runtime.getSessionAttentionSnapshot();
    expect(snapshot['legacy-only']).toBeUndefined();

    registry.dispose();
  });
});
