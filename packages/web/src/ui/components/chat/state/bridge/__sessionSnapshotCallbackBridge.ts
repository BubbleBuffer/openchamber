import type { SessionSnapshotV1 } from '@openchamber/session-state'

// ---------------------------------------------------------------------------
// Module-level bridge for event pipeline snapshot restoration
//
// The event pipeline (handleEvent in sync-context.tsx) runs outside React
// and needs to restore actors when it receives openchamber:session-snapshot
// events. We register a callback here so handleEvent can call it without
// a React context dependency.
//
// ALLOWLIST: This is a temporary Phase 3.5 migration mechanism to bridge
// the non-React event pipeline to the React-owned actor registry. It should
// be removed once a proper event-bus / store-based approach is in place.
//
// Ownership safety: uses a generation counter so that an old cleanup
// (unregister from a previous mount) cannot accidentally clear a newer callback
// that was registered after the current bridge took ownership.
// ---------------------------------------------------------------------------

let __sessionSnapshotCallback: ((directory: string, sessionId: string, snapshot: SessionSnapshotV1) => void) | null = null
let __sessionSnapshotGeneration = 0

export function __registerSessionSnapshotCallback(
  cb: (directory: string, sessionId: string, snapshot: SessionSnapshotV1) => void,
): number {
  __sessionSnapshotGeneration++
  __sessionSnapshotCallback = cb
  return __sessionSnapshotGeneration
}

export function __unregisterSessionSnapshotCallback(generation: number): void {
  // Only unregister if the current generation has not been replaced by a newer one.
  // This prevents an old cleanup (from a previous mount cycle) from clearing
  // a callback that was registered by a more recent bridge instance.
  if (generation !== __sessionSnapshotGeneration) {
    return
  }
  __sessionSnapshotCallback = null
}

// Exposed for testing and for sync-context.tsx to trigger restoration
export function __triggerSessionSnapshotRestoration(directory: string, sessionId: string, snapshot: SessionSnapshotV1): void {
  __sessionSnapshotCallback?.(directory, sessionId, snapshot)
}
