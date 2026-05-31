import React from 'react';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { ChatInterruptionsState } from './types';

// Machine hooks for state that was migrated
import {
    usePermissions as useMachinePermissions,
    useQuestions as useMachineQuestions,
    useHasBlockingInterruption,
} from './machine/selectors';

interface UseChatInterruptionsOptions {
  directory: string;
  sessionId: string;
}

export function useChatInterruptions({ directory, sessionId }: UseChatInterruptionsOptions): ChatInterruptionsState {
  // Get machine state — cast machine types to UI types during migration (Phase 3.2)
  const permissions = useMachinePermissions(directory, sessionId) as unknown as PermissionRequest[];
  const questions = useMachineQuestions(directory, sessionId) as unknown as QuestionRequest[];
  const hasBlockingRequest = useHasBlockingInterruption(directory, sessionId);

  return React.useMemo(
    () => ({
      permissions,
      questions,
      hasBlockingRequest,
    }),
    [hasBlockingRequest, permissions, questions],
  );
}