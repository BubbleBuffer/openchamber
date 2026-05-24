import { afterEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../../core/event-bus.js';
import { createSessionRuntime } from './session-runtime.js';

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
});
