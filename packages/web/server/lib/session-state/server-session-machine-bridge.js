/**
 * @file server-session-machine-bridge.js
 *
 * Wires the EventBus → normalizer → registry → executor → publisher chain.
 * Subscribes to EVENT_RECEIVED, normalizes payloads, sends events to actors,
 * executes effects, and publishes snapshots.
 */

import { EVENTS } from '../core/events.js';
import { createSessionActorKey } from '@openchamber/session-state';
import { normalizeOpenCodePayload } from './server-session-event-normalizer.js';

/**
 * @param {object} config
 * @param {import('../../core/event-bus.js').EventBus<import('../../core/events.js').ServerEvents>} config.eventBus
 * @param {import('./server-session-actor-registry.js').SessionActorRegistry} config.registry
 * @param {import('./server-session-effect-executor.js').EffectExecutor} config.executor
 * @param {import('./server-session-snapshot-publisher.js').SnapshotPublisher} config.publisher
 * @returns {ServerSessionMachineBridge}
 */
export function createServerSessionMachineBridge({ eventBus, registry, executor, publisher }) {
  /** @type {(() => void)[]} */
  const disposers = [];

  /**
   * Map of actor keys to effect subscription disposers.
   * @type {Map<string, () => void>}
   */
  const actorSubscriptions = new Map();

  /**
   * Effect types emitted by the session machine.
   * Using actor.on(type, handler) for XState v5 emitted effects.
   * @type {Array<import('@openchamber/session-state').SessionMachineEffect['type']>}
   */
  const EFFECT_TYPES = [
    'sendPrompt',
    'abort',
    'retry',
    'loadOlder',
    'scheduleRetryCooldown',
    'cancelRetryCooldown',
    'publishSnapshot',
    'reportFatalInvariant',
  ];

  /**
   * Sets up effect listeners for an actor using XState v5 actor.on() API.
   * actor.on(type, handler) receives emitted effects, unlike actor.subscribe()
   * which receives state snapshots.
   * @param {string} key - SessionActorKey
   * @param {import('xstate').AnyActor} actor
   */
  const ensureEffectSubscription = (key, actor) => {
    if (actorSubscriptions.has(key)) return;

    /** @type {() => void} */
    const disposeFns = [];

    for (const effectType of EFFECT_TYPES) {
      const subscription = actor.on(effectType, (emitted) => {
        executor.execute(emitted);
      });
      disposeFns.push(() => subscription.unsubscribe());
    }

    actorSubscriptions.set(key, () => {
      for (const dispose of disposeFns) dispose();
    });
  };

  /**
   * @param {string} directory
   * @param {string} sessionId
   * @param {import('@openchamber/session-state').SessionDomainEvent} event
   * @param {string | null} sourceEventId
   */
  const routeEvent = (directory, sessionId, event, sourceEventId) => {
    const key = createSessionActorKey(directory, sessionId);

    // Ensure actor exists
    const actor = registry.getOrCreate(directory, sessionId);

    // Subscribe to actor's effect emissions
    ensureEffectSubscription(key, actor);

    // Send event to actor
    registry.send(key, event);
  };

  /**
   * @param {{ payload: Record<string, unknown>; directory?: string }} params
   */
  const handleEventReceived = ({ payload, directory }) => {
    try {
      const results = normalizeOpenCodePayload(payload, directory);

      for (const result of results) {
        if ('error' in result) {
          console.warn('[Bridge] Normalization error:', result.error.message);
          continue;
        }

        const { event, sourceEventId } = result;
        const dir = event.directory || directory || '';
        const sid = event.sessionId;

        if (!sid) continue;

        // Route event to actor
        routeEvent(dir, sid, event, sourceEventId);

        // Publish snapshot after event processing
        const key = createSessionActorKey(dir, sid);
        const snapshot = registry.getSnapshot(key);
        if (snapshot) {
          publisher.publish(snapshot);
        }
      }
    } catch (err) {
      console.error('[Bridge] Error processing event:', err);
    }
  };

  /**
   * Handles OPENCODE_READY — resets all actor activity on server restart.
   */
  const handleOpenCodeReady = () => {
    // The registry maintains all active actors. Reset is handled via
    // SESSION_LOADED events from the OpenCode stream. This is a no-op
    // unless we decide to actively reset actors on server restart.
  };

  const start = () => {
    disposers.push(
      eventBus.on(EVENTS.EVENT_RECEIVED, handleEventReceived),
      eventBus.on(EVENTS.OPENCODE_READY, handleOpenCodeReady),
    );
  };

  const stop = () => {
    // Dispose all actor subscriptions
    for (const dispose of actorSubscriptions.values()) {
      dispose();
    }
    actorSubscriptions.clear();

    disposers.forEach((fn) => fn());
    disposers.length = 0;
  };

  return {
    start,
    stop,
  };
}

/**
 * @typedef {{
 *   start: () => void
 *   stop: () => void
 * }} ServerSessionMachineBridge
 */
