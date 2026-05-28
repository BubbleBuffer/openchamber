import React from 'react';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { ChatInterruptionsState } from './types';

interface UseChatInterruptionsOptions {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
}

export function useChatInterruptions({ permissions, questions }: UseChatInterruptionsOptions): ChatInterruptionsState {
  return React.useMemo(
    () => ({
      permissions,
      questions,
      hasBlockingRequest: permissions.length > 0 || questions.length > 0,
    }),
    [permissions, questions],
  );
}