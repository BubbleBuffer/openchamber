/* eslint-disable @typescript-eslint/no-explicit-any */

import { createSessionActorKey } from "@openchamber/session-state";
import { normalizeOpenCodePayload } from "./event-normalizer.js";
import type { MachineBridgeDeps, ServerSessionMachineBridge } from "./types.js";

export function createServerSessionMachineBridge(deps: MachineBridgeDeps): ServerSessionMachineBridge {
  const { eventBus, registry, executor, publisher } = deps;
  let eventDisposers: Array<() => void> = [];
  const effectDisposers = new Map<string, Array<() => void>>();

  function ensureEffectSubscription(key: string, actor: any) {
    if (effectDisposers.has(key)) return;
    const disposers: Array<() => void> = [];

    if (actor.on) {
      const effectTypes = ["sendPrompt", "abort", "retry", "loadOlder", "scheduleRetryCooldown", "cancelRetryCooldown", "publishSnapshot", "reportFatalInvariant"];
      for (const type of effectTypes) {
        if (typeof actor.on === "function") {
          const unsub = actor.on(type, (emitted: any) => {
            executor.execute(emitted);
          });
          if (unsub) disposers.push(unsub);
        }
      }
    }

    effectDisposers.set(key, disposers);
  }

  function handleEventReceived(payload: any) {
    const directory = payload?.directory || "global";
    const results = normalizeOpenCodePayload(payload, directory);

    for (const result of results) {
      if ("error" in result) {
        console.warn("Session normalizer error:", result.error.message);
        continue;
      }
      const { event } = result;
      try {
        const key = createSessionActorKey(event.directory, event.sessionId);
        const actor = registry.getOrCreate(event.directory, event.sessionId);
        ensureEffectSubscription(key, actor);
        registry.send(key, event);
        const snapshot = registry.getSnapshot(key);
        if (snapshot) publisher.publish(snapshot);
      } catch (err) {
        console.warn("Session bridge error:", err);
      }
    }
  }

  return {
    start() {
      const eventBusWithOn = eventBus as { on?(event: string, handler: (payload: any) => void): unknown };
      const raw = eventBusWithOn.on?.("EVENT_RECEIVED", handleEventReceived);
      eventDisposers = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    },

    stop() {
      for (const dispose of eventDisposers) {
        try { dispose(); } catch { /* ignore */ }
      }
      eventDisposers = [];
      for (const disposers of effectDisposers.values()) {
        for (const dispose of disposers) {
          try { dispose(); } catch { /* ignore */ }
        }
      }
      effectDisposers.clear();
    },
  };
}
