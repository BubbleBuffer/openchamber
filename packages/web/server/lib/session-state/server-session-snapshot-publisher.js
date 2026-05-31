/**
 * @file server-session-snapshot-publisher.js
 *
 * Publishes validated SessionSnapshotV1 payloads to the active transport integration.
 * Does NOT emit old global session.status / session.activity events.
 */

import { validateSessionSnapshotV1, assertSerializableSnapshot } from '@openchamber/session-state';

/**
 * @param {object} config
 * @param {SnapshotTransport | null} [config.transport]
 * @returns {SnapshotPublisher}
 */
export function createSnapshotPublisher({ transport = null } = {}) {
  /** @type {SnapshotTransport | null} */
  let activeTransport = transport;

  /**
   * Sets the active transport for snapshot publishing.
   * @param {SnapshotTransport} t
   */
  const setTransport = (t) => {
    activeTransport = t;
  };

  /**
   * Publishes a validated snapshot to the active transport.
   * @param {import('@openchamber/session-state').SessionSnapshotV1} snapshot
   */
  const publish = (snapshot) => {
    try {
      // Validate before publishing
      validateSessionSnapshotV1(snapshot);
      assertSerializableSnapshot(snapshot);

      if (!activeTransport) return;

      activeTransport.writeSseEvent(snapshot, {
        eventType: 'session:snapshot',
        directory: snapshot.key.directory,
        sessionId: snapshot.key.sessionId,
      });
    } catch (err) {
      console.error('[SnapshotPublisher] Failed to publish snapshot:', err);
    }
  };

  /**
   * @param {import('@openchamber/session-state').SessionSnapshotV1} snapshot
   * @param {{ eventType?: string; directory?: string; sessionId?: string }} [options]
   */
  const writeSseEvent = (snapshot, options = {}) => {
    if (!activeTransport) return;
    activeTransport.writeSseEvent(snapshot, options);
  };

  return {
    publish,
    setTransport,
    writeSseEvent,
  };
}

/**
 * @typedef {{
 *   writeSseEvent: (snapshot: import('@openchamber/session-state').SessionSnapshotV1, options?: { eventType?: string; directory?: string; sessionId?: string }) => void
 * }} SnapshotTransport
 */

/**
 * @typedef {{
 *   publish: (snapshot: import('@openchamber/session-state').SessionSnapshotV1) => void
 *   setTransport: (transport: SnapshotTransport) => void
 *   writeSseEvent: (snapshot: import('@openchamber/session-state').SessionSnapshotV1, options?: { eventType?: string; directory?: string; sessionId?: string }) => void
 * }} SnapshotPublisher
 */
