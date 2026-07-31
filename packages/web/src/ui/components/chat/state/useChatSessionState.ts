import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSyncDirectory } from '@/sync/sync-context';
import type { ChatSessionState } from './types';

// Machine hooks for state that was migrated
import {
    useLoaded,
    useSessionExists,
    useParentSessionId,
} from './machine/selectors';

interface UseChatSessionStateOptions {
  directory?: string; // Optional - will use sync context if not provided
  sessionId: string | null;
  isActive: boolean;
  resourceLoaded?: boolean;
}

export function useChatSessionState({
  directory: providedDirectory,
  sessionId,
  isActive,
  resourceLoaded = false,
}: UseChatSessionStateOptions): ChatSessionState {
  const syncDirectory = useSyncDirectory();
  const directory = providedDirectory ?? syncDirectory;

  const activeSessionId = useSessionUIStore((state) => state.currentSessionId);
  const isDraftOpen = useSessionUIStore((state) => state.newSessionDraft.open);

  // Machine hooks for machine-owned fields
  const machineLoaded = useLoaded(directory, sessionId ?? '');
  const loaded = machineLoaded || resourceLoaded;
  const exists = useSessionExists(directory, sessionId ?? '');
  const parentSessionId = useParentSessionId(directory, sessionId ?? '');

  return React.useMemo(() => {
    return {
      sessionId,
      activeSessionId,
      isActive,
      loaded,
      exists,
      isDraftOpen,
      parentSessionId,
    };
  }, [activeSessionId, isActive, isDraftOpen, loaded, exists, parentSessionId, sessionId]);
}
