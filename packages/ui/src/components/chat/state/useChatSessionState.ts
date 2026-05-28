import React from 'react';
import type { Session } from '@/lib/opencode/client';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import type { ChatSessionState } from './types';

interface UseChatSessionStateOptions {
  sessionId: string | null;
  isActive: boolean;
  loaded: boolean;
}

export function useChatSessionState({ sessionId, isActive, loaded }: UseChatSessionStateOptions): ChatSessionState {
  const activeSessionId = useSessionUIStore((state) => state.currentSessionId);
  const isDraftOpen = useSessionUIStore((state) => state.newSessionDraft.open);
  const sessions = useSessions();

  return React.useMemo(() => {
    const session = sessionId ? sessions.find((candidate: Session) => candidate.id === sessionId) : undefined;
    const parentSessionId = session?.parentID ?? null;

    return {
      sessionId,
      activeSessionId,
      isActive,
      loaded,
      exists: Boolean(session),
      isDraftOpen,
      parentSessionId,
    };
  }, [activeSessionId, isActive, isDraftOpen, loaded, sessionId, sessions]);
}