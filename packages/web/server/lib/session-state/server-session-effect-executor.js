/**
 * @file server-session-effect-executor.js
 *
 * Executes SessionMachineEffect values produced by the machine through injected
 * server runtime callbacks. Timers and abort handles are stored in executor-owned
 * maps keyed by SessionActorKey and cleared on actor eviction and shutdown.
 */

import { createSessionActorKey } from '@openchamber/session-state';

/**
 * @param {object} config
 * @param {EffectCallbacks} config.callbacks
 * @param {import('./server-session-snapshot-publisher.js').SnapshotPublisher} [config.publisher]
 * @param {import('./server-session-actor-registry.js').SessionActorRegistry} [config.registry]
 * @returns {EffectExecutor}
 */
export function createEffectExecutor({ callbacks, publisher = null, registry = null }) {
  /** @type {Map<string, NodeJS.Timeout>} */
  const cooldownTimers = new Map();

  /** @type {Map<string, AbortController>} */
  const abortControllers = new Map();

  /**
   * Executes a single effect.
   * @param {import('@openchamber/session-state').SessionMachineEffect} effect
   * @returns {Promise<void>}
   */
  const execute = async (effect) => {
    switch (effect.type) {
      case 'sendPrompt':
        await callbacks.sendPrompt(
          effect.directory,
          effect.sessionId,
          effect.prompt,
          effect.provider,
          effect.model,
          effect.agent,
        );
        break;

      case 'abort': {
        const key = createSessionActorKey(effect.directory, effect.sessionId);
        const controller = abortControllers.get(key) || new AbortController();
        abortControllers.set(key, controller);
        await callbacks.abort(effect.directory, effect.sessionId, controller.signal);
        break;
      }

      case 'retry':
        await callbacks.retry(effect.directory, effect.sessionId, effect.retryCount, effect.retryMessage);
        break;

      case 'loadOlder':
        await callbacks.loadOlder(effect.directory, effect.sessionId);
        break;

      case 'scheduleRetryCooldown': {
        const key = createSessionActorKey(effect.directory, effect.sessionId);
        const existing = cooldownTimers.get(key);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          cooldownTimers.delete(key);
        }, effect.delayMs);
        cooldownTimers.set(key, timer);
        break;
      }

      case 'cancelRetryCooldown': {
        const key = createSessionActorKey(effect.directory, effect.sessionId);
        const existing = cooldownTimers.get(key);
        if (existing) {
          clearTimeout(existing);
          cooldownTimers.delete(key);
        }
        break;
      }

      case 'publishSnapshot': {
        // publishSnapshot effect signals the machine wants to broadcast/persist state.
        // When registry is available, retrieve the authoritative SessionSnapshotV1
        // and publish it via the injected publisher.
        if (publisher && registry) {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          const snapshot = registry.getSnapshot(key);
          if (snapshot) {
            publisher.publish(snapshot);
          }
        }
        break;
      }

      case 'reportFatalInvariant':
        callbacks.reportFatalInvariant(
          effect.directory,
          effect.sessionId,
          effect.invariantName,
          effect.actorKey,
          effect.revision,
          effect.eventType,
        );
        break;

      default:
        console.warn('[EffectExecutor] Unknown effect type:', effect);
    }
  };

  /**
   * Executes all effects in sequence.
   * @param {import('@openchamber/session-state').SessionMachineEffect[]} effects
   * @returns {Promise<void>}
   */
  const executeAll = async (effects) => {
    for (const effect of effects) {
      try {
        await execute(effect);
      } catch (err) {
        console.error('[EffectExecutor] Effect execution failed:', err);
      }
    }
  };

  /**
   * Clears all timers and abort handles for a specific actor.
   * @param {string} key - SessionActorKey
   */
  const clearForActor = (key) => {
    const timer = cooldownTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      cooldownTimers.delete(key);
    }
    const controller = abortControllers.get(key);
    if (controller) {
      controller.abort();
      abortControllers.delete(key);
    }
  };

  /**
   * Disposes all timers and abort handles.
   */
  const dispose = () => {
    for (const timer of cooldownTimers.values()) clearTimeout(timer);
    cooldownTimers.clear();
    for (const controller of abortControllers.values()) controller.abort();
    abortControllers.clear();
  };

  return {
    execute,
    executeAll,
    clearForActor,
    dispose,
  };
}

/**
 * @typedef {{
 *   sendPrompt: (directory: string, sessionId: string, prompt: string, provider: string | null, model: string | null, agent: string | null) => Promise<void>
 *   abort: (directory: string, sessionId: string, signal: AbortSignal) => Promise<void>
 *   retry: (directory: string, sessionId: string, retryCount: number, retryMessage: string | null) => Promise<void>
 *   loadOlder: (directory: string, sessionId: string) => Promise<void>
 *   reportFatalInvariant: (directory: string, sessionId: string, invariantName: string, actorKey: string, revision: number, eventType: string) => void
 * }} EffectCallbacks
 */

/**
 * @typedef {{
 *   execute: (effect: import('@openchamber/session-state').SessionMachineEffect) => Promise<void>
 *   executeAll: (effects: import('@openchamber/session-state').SessionMachineEffect[]) => Promise<void>
 *   clearForActor: (key: string) => void
 *   dispose: () => void
 * }} EffectExecutor
 */
