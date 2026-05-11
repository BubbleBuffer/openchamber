import React from 'react';
import { useStreamingStore } from '@/sync/streaming';

const MAX_MOUNTED_SESSIONS = 10;

export type SessionMountState = {
  id: string;
  isActive: boolean;
};

export interface UseSessionMountPoolResult {
  mountedSessions: Map<string, SessionMountState>;
  activeSessionId: string | null;
  activateSession: (sessionId: string | null) => void;
}

function isStreaming(sessionId: string): boolean {
  return useStreamingStore.getState().streamingMessageIds.get(sessionId) != null;
}

export function useSessionMountPool(): UseSessionMountPoolResult {
  const [mountedSessions, setMountedSessions] = React.useState<Map<string, SessionMountState>>(() => new Map());
  const activeSessionIdRef = React.useRef<string | null>(null);

  const activateSession = React.useCallback((sessionId: string | null) => {
    if (!sessionId) {
      activeSessionIdRef.current = null;
      setMountedSessions((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const state of next.values()) {
          state.isActive = false;
        }
        return next;
      });
      return;
    }

    activeSessionIdRef.current = sessionId;

    setMountedSessions((prev) => {
      const existing = prev.get(sessionId);
      if (existing) {
        const next = new Map(prev);
        next.delete(sessionId);
        for (const s of next.values()) {
          s.isActive = false;
        }
        next.set(sessionId, { ...existing, isActive: true });
        return next;
      }

      const next = new Map(prev);
      for (const s of next.values()) {
        s.isActive = false;
      }

      if (next.size >= MAX_MOUNTED_SESSIONS) {
        let evicted = false;
        for (const [key] of next) {
          if (key === sessionId) continue;
          if (!isStreaming(key)) {
            next.delete(key);
            evicted = true;
            break;
          }
        }
        if (!evicted) {
          const first = next.keys().next().value;
          if (first && first !== sessionId) {
            next.delete(first);
          }
        }
      }

      next.set(sessionId, { id: sessionId, isActive: true });
      return next;
    });
  }, []);

  return {
    mountedSessions,
    activeSessionId: Array.from(mountedSessions.values()).find((s) => s.isActive)?.id ?? null,
    activateSession,
  };
}
