/**
 * @file session-runtime.js
 *
 * Compatibility wrapper over the server session machine bridge.
 * When actorRegistry is provided, derives session activity, state, and
 * attention snapshots from machine actors via the registry's snapshots
 * and the shared package selectors. Legacy Maps are non-authoritative
 * caches populated from processOpenCodeSsePayload for backward compat.
 *
 * Route payload shapes remain unchanged until Phase 3.5 transport removal.
 */

import { EVENTS } from '../../core/events.js';
import {
  selectNeedsAttention,
} from '@openchamber/session-state';

const SESSION_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_ATTENTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_STATE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * @param {object} config
 * @param {import('../../core/event-bus.js').EventBus<import('../../core/events.js').ServerEvents>} config.eventBus
 * @param {import('../../session-state/server-session-machine-bridge.js').ServerSessionMachineBridge} [config.bridge]
 * @param {import('../../session-state/server-session-actor-registry.js').SessionActorRegistry} [config.actorRegistry]
 */
export const createSessionRuntime = ({ eventBus, bridge = null, actorRegistry = null }) => {
  const disposers = [];

  // ── Legacy non-authoritative caches ──────────────────────────────────
  // These caches are populated from processOpenCodeSsePayload and exist
  // for backward compatibility. They are NOT derived from machine state.
  // When actorRegistry is available, machine-derived data takes priority.

  /** @type {Map<string, { status: string; lastUpdateAt: number; lastEventId: string; metadata: Record<string, unknown> }>} */
  const sessionStates = new Map();

  /** @type {Map<string, { needsAttention: boolean; lastUserMessageAt: number | null; lastStatusChangeAt: number; viewedByClients: Set<string>; status: string }>} */
  const sessionAttentionStates = new Map();

  // ── Activity cache (derived from machine when registry available) ────
  // When actorRegistry is passed, this is derived from machine snapshots.
  // Otherwise populated from processOpenCodeSsePayload for backward compat.

  /** @type {Map<string, { phase: string; updatedAt: number }>} */
  const sessionActivityCache = new Map();

  // ── Snapshot derivation helpers ──────────────────────────────────────

  /**
   * Derives session activity snapshot from machine actors via registry.
   * Falls back to legacy activity cache when registry is not available.
   * @returns {Record<string, { type: string }>}
   */
  const getSessionActivitySnapshot = () => {
    if (!actorRegistry) {
      // Backward compat: derive from legacy cache
      const result = {};
      for (const [sessionId, cache] of sessionActivityCache) {
        result[sessionId] = { type: cache.phase };
      }
      return result;
    }

    // Derive from machine actors — scan all active keys in registry
    const result = {};
    for (const [key, snapshot] of actorRegistry.entries()) {
      const { sessionId } = snapshot.key;
      if (!sessionId) continue;

      // Activity region drives phase: streaming|aborting → busy, else idle
      const activityRegion = snapshot.regions?.activity;
      const phase = (activityRegion === 'streaming' || activityRegion === 'aborting') ? 'busy' : 'idle';
      result[sessionId] = { type: phase };
    }
    return result;
  };

  /**
   * Derives session state snapshot from machine actors via registry.
   * Falls back to legacy sessionStates map when registry not available.
   * @returns {Record<string, { status: string; lastUpdateAt: number; metadata: Record<string, unknown> }>}
   */
  const getSessionStateSnapshot = () => {
    if (!actorRegistry) {
      const result = {};
      const now = Date.now();
      for (const [sessionId, data] of sessionStates) {
        if (now - data.lastUpdateAt > SESSION_STATE_MAX_AGE_MS) continue;
        result[sessionId] = {
          status: data.status,
          lastUpdateAt: data.lastUpdateAt,
          metadata: data.metadata,
        };
      }
      return result;
    }

    // Derive from machine actors via registry entries
    const result = {};
    for (const [key, snapshot] of actorRegistry.entries()) {
      const { sessionId } = snapshot.key;
      if (!sessionId) continue;

      // Lifecycle region maps to status
      const lc = snapshot.regions?.lifecycle;
      let status = 'idle';
      if (lc === 'streaming') status = 'busy';
      else if (lc === 'error') status = 'error';
      else if (lc === 'fatal') status = 'fatal';
      else if (lc === 'not_found') status = 'not_found';

      result[sessionId] = {
        status,
        lastUpdateAt: snapshot.meta?.updatedAt ?? Date.now(),
        metadata: {}, // machine state doesn't carry legacy metadata
      };
    }
    return result;
  };

  /**
   * Derives session attention snapshot from machine actors via registry.
   * Falls back to legacy sessionAttentionStates when registry not available.
   * @returns {Record<string, { needsAttention: boolean; lastUserMessageAt: number | null; lastStatusChangeAt: number; status: string; isViewed: boolean }>}
   */
  const getSessionAttentionSnapshot = () => {
    if (!actorRegistry) {
      const result = {};
      const now = Date.now();
      for (const [sessionId, state] of sessionAttentionStates) {
        if (now - state.lastStatusChangeAt > SESSION_ATTENTION_MAX_AGE_MS) continue;
        result[sessionId] = {
          needsAttention: state.needsAttention,
          lastUserMessageAt: state.lastUserMessageAt,
          lastStatusChangeAt: state.lastStatusChangeAt,
          status: state.status,
          isViewed: state.viewedByClients.size > 0,
        };
      }
      return result;
    }

    // Derive from machine actors via registry entries
    const result = {};
    for (const [key, snapshot] of actorRegistry.entries()) {
      const { sessionId } = snapshot.key;
      if (!sessionId) continue;

      // Use shared selector from session-state package
      const needsAttention = selectNeedsAttention(snapshot.domain);

      // Merge with legacy attention state for client-view tracking
      const legacyState = sessionAttentionStates.get(sessionId);
      result[sessionId] = {
        needsAttention,
        lastUserMessageAt: legacyState?.lastUserMessageAt ?? null,
        lastStatusChangeAt: snapshot.meta?.updatedAt ?? Date.now(),
        status: legacyState?.status ?? 'idle',
        isViewed: legacyState ? legacyState.viewedByClients.size > 0 : false,
      };
    }
    return result;
  };

  const getSessionState = (sessionId) => {
    if (!sessionId) return null;

    // Derive from machine when registry is available
    if (actorRegistry) {
      // Scan all registry keys to find matching sessionId
      for (const k of actorRegistry.listKeys()) {
        if (k.endsWith(`::${sessionId}`)) {
          const snapshot = actorRegistry.getSnapshot(k);
          if (snapshot) {
            const lc = snapshot.regions?.lifecycle;
            let status = 'idle';
            if (lc === 'streaming') status = 'busy';
            else if (lc === 'error') status = 'error';
            else if (lc === 'fatal') status = 'fatal';
            else if (lc === 'not_found') status = 'not_found';
            return {
              status,
              lastUpdateAt: snapshot.meta?.updatedAt ?? Date.now(),
              lastEventId: `machine-${sessionId}`,
              metadata: {},
            };
          }
        }
      }
      return null;
    }

    return sessionStates.get(sessionId) || null;
  };

  const getSessionAttentionState = (sessionId) => {
    if (!sessionId) return null;

    // Derive from machine when registry is available
    if (actorRegistry) {
      for (const k of actorRegistry.listKeys()) {
        if (k.endsWith(`::${sessionId}`)) {
          const snapshot = actorRegistry.getSnapshot(k);
          if (snapshot) {
            const needsAttention = selectNeedsAttention(snapshot.domain);
            const legacyState = sessionAttentionStates.get(sessionId);
            return {
              needsAttention,
              lastUserMessageAt: legacyState?.lastUserMessageAt ?? null,
              lastStatusChangeAt: snapshot.meta?.updatedAt ?? Date.now(),
              status: legacyState?.status ?? 'idle',
              isViewed: legacyState ? legacyState.viewedByClients.size > 0 : false,
            };
          }
        }
      }
      return null;
    }

    const state = sessionAttentionStates.get(sessionId);
    if (!state) return null;
    return {
      needsAttention: state.needsAttention,
      lastUserMessageAt: state.lastUserMessageAt,
      lastStatusChangeAt: state.lastStatusChangeAt,
      status: state.status,
      isViewed: state.viewedByClients.size > 0,
    };
  };

  const markSessionViewed = (sessionId, clientId) => {
    const state = sessionAttentionStates.get(sessionId);
    if (!state) return;

    const wasNeedsAttention = state.needsAttention;
    state.viewedByClients.add(clientId);

    if (wasNeedsAttention) {
      state.needsAttention = false;
      eventBus.emit(EVENTS.SESSION_NEEDS_ATTENTION, { sessionId, needsAttention: false });
    }
  };

  const markSessionUnviewed = (sessionId, clientId) => {
    const state = sessionAttentionStates.get(sessionId);
    if (!state) return;
    state.viewedByClients.delete(clientId);
  };

  const markUserMessageSent = (sessionId) => {
    const state = sessionAttentionStates.get(sessionId);
    if (!state) return;
    state.lastUserMessageAt = Date.now();
  };

  /**
   * Resets all session activity to idle — used on OPENCODE_READY.
   * With the machine bridge, actors handle their own reset via SESSION_LOADED.
   * This method clears the legacy caches only.
   */
  const resetAllSessionActivityToIdle = () => {
    const now = Date.now();
    for (const [sessionId] of sessionActivityCache) {
      sessionActivityCache.set(sessionId, { phase: 'idle', updatedAt: now });
    }
  };

  const cleanupOldSessionStates = () => {
    const now = Date.now();
    for (const [sessionId, data] of sessionStates) {
      if (now - data.lastUpdateAt > SESSION_STATE_MAX_AGE_MS) {
        sessionStates.delete(sessionId);
      }
    }
    for (const [sessionId, state] of sessionAttentionStates) {
      if (now - state.lastStatusChangeAt > SESSION_ATTENTION_MAX_AGE_MS) {
        sessionAttentionStates.delete(sessionId);
      }
    }
    for (const [sessionId, data] of sessionActivityCache) {
      if (now - data.updatedAt > SESSION_STATE_MAX_AGE_MS) {
        sessionActivityCache.delete(sessionId);
      }
    }
  };

  const cleanupInterval = setInterval(cleanupOldSessionStates, SESSION_STATE_CLEANUP_INTERVAL_MS);

  // ── Legacy payload processing ──────────────────────────────────────
  // processOpenCodeSsePayload is kept for backward compatibility with
  // code that calls it directly. It updates the legacy caches.

  const processOpenCodeSsePayload = (payload) => {
    if (!payload || typeof payload !== 'object') return;

    // @ts-ignore
    const type = payload.type;
    // @ts-ignore
    const properties = payload.properties || {};
    // @ts-ignore
    const info = properties.info || {};
    const sessionId = typeof properties.sessionID === 'string' ? properties.sessionID.trim() : '';
    const status = typeof info.type === 'string' ? info.type.trim() : '';

    if (!sessionId || !type) return;

    // Update legacy activity cache
    if (type === 'session.status') {
      const phase = status === 'busy' || status === 'retry' ? 'busy' : 'idle';
      sessionActivityCache.set(sessionId, { phase, updatedAt: Date.now() });

      // Update legacy state cache
      const now = Date.now();
      sessionStates.set(sessionId, {
        status,
        lastUpdateAt: now,
        lastEventId: typeof payload.id === 'string' ? payload.id : `sse-${now}`,
        metadata: { attempt: info.attempt, message: info.message, next: info.next },
      });

      // Update legacy attention cache
      updateLegacyAttentionState(sessionId, status);
    }
  };

  /**
   * Updates the legacy attention cache from a status string.
   * @param {string} sessionId
   * @param {string} status
   */
  const updateLegacyAttentionState = (sessionId, status) => {
    let state = sessionAttentionStates.get(sessionId);
    if (!state) {
      state = {
        needsAttention: false,
        lastUserMessageAt: null,
        lastStatusChangeAt: Date.now(),
        viewedByClients: new Set(),
        status: 'idle',
      };
      sessionAttentionStates.set(sessionId, state);
    }

    const prevStatus = state.status;
    state.status = status;
    state.lastStatusChangeAt = Date.now();

    if ((prevStatus === 'busy' || prevStatus === 'retry') && status === 'idle') {
      if (state.lastUserMessageAt && state.viewedByClients.size === 0) {
        state.needsAttention = true;
        eventBus.emit(EVENTS.SESSION_NEEDS_ATTENTION, { sessionId, needsAttention: true });
      }
    }

    eventBus.emit(EVENTS.SESSION_ACTIVITY_CHANGED, {
      sessionId,
      phase: status === 'busy' || status === 'retry' ? 'busy' : 'idle',
    });
  };

  const dispose = () => {
    disposers.forEach((fn) => fn());
    disposers.length = 0;
    clearInterval(cleanupInterval);
    sessionStates.clear();
    sessionAttentionStates.clear();
    sessionActivityCache.clear();
  };

  return {
    processOpenCodeSsePayload,
    getSessionActivitySnapshot,
    getSessionStateSnapshot,
    getSessionAttentionSnapshot,
    getSessionState,
    getSessionAttentionState,
    markSessionViewed,
    markSessionUnviewed,
    markUserMessageSent,
    resetAllSessionActivityToIdle,
    dispose,
  };
};
