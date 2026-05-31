/**
 * @file server-session-actor-registry.js
 *
 * Manages XState v5 session machine actors per directory::sessionId key.
 * Actors are created lazily, stored outside any closure-owned maps, and
 * evicted after30 minutes of idle (no state transitions).
 */

import { createActor, createSessionActorKey, createSessionSnapshot } from '@openchamber/session-state';

const IDLE_EVICTION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * @param {object} config
 * @param {(input: import('@openchamber/session-state').CreateInitialSessionContextInput) => import('xstate').Machine} config.createSessionMachine
 * @returns {SessionActorRegistry}
 */
export function createSessionActorRegistry({ createSessionMachine }) {
  /** @type {Map<string, { actor: import('xstate').AnyActor, lastTransition: number }>} */
  const actors = new Map();

  /** @type {Map<string, NodeJS.Timeout>} */
  const idleTimers = new Map();

  /**
   * @param {string} directory
   * @param {string} sessionId
   * @returns {import('@openchamber/session-state').SessionActorKey}
   */
  const makeKey = (directory, sessionId) => createSessionActorKey(directory, sessionId);

  /**
   * Resets the idle eviction timer for an actor.
   * @param {string} key
   */
  const resetIdleTimer = (key) => {
    const existing = idleTimers.get(key);
    if (existing) clearTimeout(existing);
    idleTimers.set(
      key,
      setTimeout(() => {
        evict(key);
      }, IDLE_EVICTION_TIMEOUT_MS),
    );
  };

  /**
   * Gets or creates an actor for the given directory::sessionId.
   * @param {string} directory
   * @param {string} sessionId
   * @returns {SessionActor}
   */
  const getOrCreate = (directory, sessionId) => {
    const key = makeKey(directory, sessionId);
    const existing = actors.get(key);
    if (existing) {
      resetIdleTimer(key);
      return existing.actor;
    }

    const machine = createSessionMachine({
      directory,
      sessionId,
      timestamp: Date.now(),
    });
    const actor = createActor(machine);

    actor.start();

    actors.set(key, { actor, lastTransition: Date.now() });
    resetIdleTimer(key);

    return actor;
  };

  /**
   * Registers an externally-created actor with explicit identity.
   * Throws if key already exists or identity doesn't match.
   * @param {string} directory
   * @param {string} sessionId
   * @param {import('xstate').AnyActor} actor
   */
  const registerActor = (directory, sessionId, actor) => {
    const key = makeKey(directory, sessionId);
    if (actors.has(key)) {
      throw new Error(`Actor already registered for key: ${key}`);
    }

    // Verify identity by checking machine initial context
    const snapshot = actor.getSnapshot();
    const ctx = snapshot?.context;
    if (ctx) {
      if (ctx.directory !== directory) {
        throw new Error(
          `SessionEvent identity mismatch: actor directory "${ctx.directory}" does not match registration directory "${directory}"`,
        );
      }
      if (ctx.sessionId !== sessionId) {
        throw new Error(
          `SessionEvent identity mismatch: actor sessionId "${ctx.sessionId}" does not match registration sessionId "${sessionId}"`,
        );
      }
    }

    actors.set(key, { actor, lastTransition: Date.now() });
    resetIdleTimer(key);
  };

  /**
   * Sends an event to an existing actor.
   * @param {string} key - SessionActorKey
   * @param {import('@openchamber/session-state').SessionDomainEvent} event
   */
  const send = (key, event) => {
    const entry = actors.get(key);
    if (!entry) return;

    entry.actor.send(event);
    entry.lastTransition = Date.now();
    resetIdleTimer(key);
  };

  /**
   * Gets a snapshot from an existing actor.
   * @param {string} key - SessionActorKey
   * @returns {import('@openchamber/session-state').SessionSnapshotV1 | null}
   */
  const getSnapshot = (key) => {
    const entry = actors.get(key);
    if (!entry) return null;

    const snapshot = entry.actor.getSnapshot();
    if (!snapshot) return null;

    // snapshot.value is Record<string, string> (regions)
    // snapshot.context is SessionMachineContext
    const regions = /** @type {Record<string, string>} */ (snapshot.value);
    const context = /** @type {import('@openchamber/session-state').SessionMachineContext} */ (snapshot.context);

    return createSessionSnapshot(context, regions, Date.now());
  };

  /**
   * Evicts an actor, stopping it and removing it from the registry.
   * @param {string} key - SessionActorKey
   */
  const evict = (key) => {
    const entry = actors.get(key);
    if (!entry) return;

    entry.actor.stop();
    actors.delete(key);

    const timer = idleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      idleTimers.delete(key);
    }
  };

  /**
   * Returns all actor keys currently registered.
   * @returns {string[]}
   */
  const listKeys = () => Array.from(actors.keys());

  /**
   * Iterates over all actor entries [key, snapshot].
   * @returns {Array<[string, import('@openchamber/session-state').SessionSnapshotV1]>}
   */
  const entries = () => {
    const result = [];
    for (const [key, entry] of actors) {
      if (!entry) continue;
      const snapshot = entry.actor.getSnapshot();
      if (!snapshot) continue;
      const regions = /** @type {Record<string, string>} */ (snapshot.value);
      const context = /** @type {import('@openchamber/session-state').SessionMachineContext} */ (snapshot.context);
      result.push([key, createSessionSnapshot(context, regions, Date.now())]);
    }
    return result;
  };

  /**
   * Disposes all actors and clears all timers.
   */
  const dispose = () => {
    for (const [key, { actor }] of actors) {
      actor.stop();
      const timer = idleTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        idleTimers.delete(key);
      }
    }
    actors.clear();
    idleTimers.clear();
  };

  return {
    getOrCreate,
    registerActor,
    send,
    getSnapshot,
    listKeys,
    entries,
    evict,
    dispose,
  };
}

/**
 * @typedef {{
 *   send: (event: import('@openchamber/session-state').SessionDomainEvent) => void
 *   getSnapshot: () => import('@openchamber/session-state').SessionSnapshotV1 | null
 * }} SessionActor
 */

/**
 * @typedef {{
 *   getOrCreate: (directory: string, sessionId: string) => SessionActor
 *   registerActor: (directory: string, sessionId: string, actor: import('xstate').AnyActor) => void
 *   send: (key: string, event: import('@openchamber/session-state').SessionDomainEvent) => void
 *   getSnapshot: (key: string) => import('@openchamber/session-state').SessionSnapshotV1 | null
 *   listKeys: () => string[]
 *   entries: () => Array<[string, import('@openchamber/session-state').SessionSnapshotV1]>
 *   evict: (key: string) => void
 *   dispose: () => void
 * }} SessionActorRegistry
 */
