import { createSessionActorKey } from "@openchamber/session-state";
import type { SessionMachineEffect } from "@openchamber/session-state";
import type { EffectExecutorDeps, SessionEffectExecutor } from "./types.js";

export function createEffectExecutor(deps: EffectExecutorDeps = {} as EffectExecutorDeps): SessionEffectExecutor {
  const { callbacks = {}, publisher = null, registry = null } = deps;
  const cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const abortControllers = new Map<string, AbortController>();

  return {
    async execute(effect: SessionMachineEffect) {
      switch (effect.type) {
        case "sendPrompt": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          if (callbacks.sendPrompt) {
            await callbacks.sendPrompt(effect.directory, effect.sessionId, effect.prompt, effect.provider, effect.model, effect.agent);
          }
          void key;
          break;
        }

        case "abort": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          let ctrl = abortControllers.get(key);
          if (!ctrl) {
            ctrl = new AbortController();
            abortControllers.set(key, ctrl);
          }
          if (callbacks.abort) {
            await callbacks.abort(effect.directory, effect.sessionId, ctrl.signal);
          }
          break;
        }

        case "retry": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          if (callbacks.retry) {
            await callbacks.retry(effect.directory, effect.sessionId, effect.retryCount, effect.retryMessage ?? "");
          }
          void key;
          break;
        }

        case "loadOlder": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          if (callbacks.loadOlder) {
            await callbacks.loadOlder(effect.directory, effect.sessionId);
          }
          void key;
          break;
        }

        case "scheduleRetryCooldown": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          const existing = cooldownTimers.get(key);
          if (existing) clearTimeout(existing);
          cooldownTimers.set(key, setTimeout(() => {
            cooldownTimers.delete(key);
          }, effect.delayMs));
          break;
        }

        case "cancelRetryCooldown": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          const timer = cooldownTimers.get(key);
          if (timer) { clearTimeout(timer); cooldownTimers.delete(key); }
          break;
        }

        case "publishSnapshot": {
          if (publisher && registry) {
            const ctx = effect.snapshot;
            const publishKey = createSessionActorKey(ctx.directory, ctx.sessionId);
            const snapshot = registry.getSnapshot(publishKey);
            if (snapshot) publisher.publish(snapshot);
          }
          break;
        }

        case "reportFatalInvariant": {
          const key = createSessionActorKey(effect.directory, effect.sessionId);
          if (callbacks.reportFatalInvariant) {
            callbacks.reportFatalInvariant(effect.directory, effect.sessionId, effect.invariantName, key, effect.revision, effect.eventType);
          }
          break;
        }
      }
    },

    dispose() {
      for (const timer of cooldownTimers.values()) clearTimeout(timer);
      cooldownTimers.clear();
      abortControllers.clear();
    },
  };
}
