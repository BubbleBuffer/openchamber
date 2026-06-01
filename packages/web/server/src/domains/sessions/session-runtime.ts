/* eslint-disable @typescript-eslint/no-explicit-any */

import { selectNeedsAttention } from "@openchamber/session-state";
import type { SessionActorKey, SessionRuntimeDeps, SessionRuntime } from "./types.js";

export function createSessionRuntime(deps: SessionRuntimeDeps): SessionRuntime {
  const { actorRegistry = null } = deps;

  const legacySessionStates = new Map<string, any>();
  const viewedSessions = new Set<string>();

  return {
    processOpenCodeSsePayload(payload: any) {
      if (!actorRegistry && payload?.session_id) {
        const existing = legacySessionStates.get(payload.session_id);
        legacySessionStates.set(payload.session_id, {
          ...existing,
          lastPayload: payload,
          updatedAt: Date.now(),
        });
      }
    },

    getSessionActivitySnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries().map(([key, snapshot]) => ({
          directory: (snapshot as any).directory ?? key.split("::")[0],
          sessionId: (snapshot as any).sessionId ?? key.split("::")[1],
          activity: (snapshot as any).regions?.activity ?? "idle",
        }));
      }
      return Array.from(legacySessionStates.entries()).map(([id, state]) => ({
        directory: state.directory ?? "global",
        sessionId: id,
        activity: state.lastPayload?.status === "busy" ? "busy" : "idle",
      }));
    },

    getSessionStateSnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries().map(([key, snapshot]) => ({
          directory: (snapshot as any).directory ?? key.split("::")[0],
          sessionId: (snapshot as any).sessionId ?? key.split("::")[1],
          status: (snapshot as any).regions?.lifecycle ?? "idle",
        }));
      }
      return [];
    },

    getSessionAttentionSnapshot() {
      if (actorRegistry) {
        return actorRegistry.entries()
          .map(([key, snapshot]) => ({
            directory: (snapshot as any).directory ?? key.split("::")[0],
            sessionId: (snapshot as any).sessionId ?? key.split("::")[1],
            needsAttention: selectNeedsAttention(snapshot as any),
          }));
      }
      return [];
    },

    getSessionState(sessionId: string) {
      if (actorRegistry) {
        const keys = actorRegistry.listKeys();
        for (const key of keys) {
          if (key.endsWith(`::${sessionId}`)) {
            return actorRegistry.getSnapshot(key as SessionActorKey);
          }
        }
        return null;
      }
      const state = legacySessionStates.get(sessionId);
      return state ? (state.lastSnapshot ?? null) : null;
    },

    getSessionAttentionState(sessionId: string): boolean {
      if (actorRegistry) {
        const keys = actorRegistry.listKeys();
        for (const key of keys) {
          if (key.endsWith(`::${sessionId}`)) {
            const snapshot = actorRegistry.getSnapshot(key as SessionActorKey);
            if (snapshot) return selectNeedsAttention(snapshot as any);
          }
        }
      }
      return !viewedSessions.has(sessionId);
    },

    markSessionViewed(_directory: string, sessionId: string) {
      viewedSessions.add(sessionId);
    },

    markSessionUnviewed(_directory: string, sessionId: string) {
      viewedSessions.delete(sessionId);
    },

    markUserMessageSent(_directory: string, sessionId: string) {
      viewedSessions.add(sessionId);
    },

    resetAllSessionActivityToIdle() {
      if (!actorRegistry) {
        for (const [, state] of legacySessionStates) {
          if (state.lastPayload) {
            state.lastPayload = { ...state.lastPayload, status: "idle" };
          }
        }
      }
    },

    dispose() {
      legacySessionStates.clear();
      viewedSessions.clear();
    },
  };
}