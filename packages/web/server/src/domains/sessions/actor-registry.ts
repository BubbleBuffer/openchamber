import { createSessionActorKey, createSessionSnapshot } from "@openchamber/session-state";
import type { SessionDomainEvent, SessionSnapshotV1 } from "@openchamber/session-state";
import type { ActorRegistryDeps, SessionActorRegistry } from "./types.js";

const IDLE_EVICTION_TIMEOUT_MS = 30 * 60 * 1000;

interface ActorEntry {
  actor: unknown;
  lastTransition: number;
}

export function createSessionActorRegistry(deps: ActorRegistryDeps): SessionActorRegistry {
  const { createSessionMachine } = deps;
  const actors = new Map<string, ActorEntry>();
  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function resetIdleTimer(key: string) {
    const existing = idleTimers.get(key);
    if (existing) clearTimeout(existing);
    idleTimers.set(key, setTimeout(() => {
      evict(key);
    }, IDLE_EVICTION_TIMEOUT_MS));
  }

  function evict(key: string) {
    const entry = actors.get(key);
    if (entry) {
      try { (entry.actor as { stop?: () => void }).stop?.(); } catch { /* ignore */ }
      actors.delete(key);
    }
    const timer = idleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      idleTimers.delete(key);
    }
  }

  return {
    getOrCreate(directory: string, sessionId: string) {
      const key = createSessionActorKey(directory, sessionId);
      const existing = actors.get(key);
      if (existing) {
        existing.lastTransition = Date.now();
        resetIdleTimer(key);
        return existing.actor;
      }
      const machine = createSessionMachine({ directory, sessionId, timestamp: Date.now() });
      const actor = (machine as { createActor?: () => unknown }).createActor
        ? (machine as { createActor: () => unknown }).createActor()
        : machine;
      (actor as { start?: () => void }).start?.();
      actors.set(key, { actor, lastTransition: Date.now() });
      resetIdleTimer(key);
      return actor;
    },

    send(key: string, event: SessionDomainEvent) {
      const entry = actors.get(key);
      if (entry) {
        (entry.actor as { send: (event: SessionDomainEvent) => void }).send(event);
        entry.lastTransition = Date.now();
        resetIdleTimer(key);
      }
    },

    getSnapshot(key: string): SessionSnapshotV1 | null {
      const entry = actors.get(key);
      if (!entry) return null;
      const snapshot = (entry.actor as { getSnapshot?: () => { context: unknown; regions?: Record<string, string> } })?.getSnapshot?.() ?? entry.actor as { context: unknown; regions?: Record<string, string> };
      return createSessionSnapshot(snapshot.context as Parameters<typeof createSessionSnapshot>[0], snapshot.regions ?? {}, Date.now());
    },

    listKeys(): string[] {
      return Array.from(actors.keys());
    },

    entries(): Array<[string, SessionSnapshotV1]> {
      return Array.from(actors.entries()).map(([key, entry]) => {
        const img = (entry.actor as { getSnapshot?: () => { context: unknown; regions?: Record<string, string> } })?.getSnapshot?.() ?? entry.actor as { context: unknown; regions?: Record<string, string> };
        return [key, createSessionSnapshot(img.context as Parameters<typeof createSessionSnapshot>[0], img.regions ?? {}, Date.now())] as [string, SessionSnapshotV1];
      });
    },

    evict(key: string) {
      evict(key);
    },

    dispose() {
      for (const key of actors.keys()) {
        evict(key);
      }
      actors.clear();
      idleTimers.clear();
    },
  };
}