import { validateSessionSnapshotV1, assertSerializableSnapshot } from "@openchamber/session-state";
import type { SessionSnapshotV1 } from "@openchamber/session-state";
import type { SnapshotPublisherDeps, SessionSnapshotPublisher, SnapshotTransport } from "./types.js";

export function createSnapshotPublisher(deps: SnapshotPublisherDeps): SessionSnapshotPublisher {
  let activeTransport: SnapshotTransport | null = deps.transport ?? null;

  return {
    publish(snapshot: SessionSnapshotV1) {
      if (!activeTransport) return;
      if (!validateSessionSnapshotV1(snapshot)) return;
      try {
        assertSerializableSnapshot(snapshot);
      } catch {
        return;
      }
      activeTransport.writeSseEvent(snapshot, { eventType: "session:snapshot" });
    },

    setTransport(transport: SnapshotTransport) {
      activeTransport = transport;
    },

    writeSseEvent(snapshot: SessionSnapshotV1, options?: Record<string, unknown>) {
      activeTransport?.writeSseEvent(snapshot, options);
    },
  };
}
