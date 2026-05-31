import React from 'react';
import { useInputStore } from '@/sync/input-store';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useUIStore } from '@/stores/useUIStore';
import { usePermissionStore } from '@/stores/permissionStore';

interface UseChatComposerStateOptions {
  sessionId: string | null;
}

export function useChatComposerState({ sessionId }: UseChatComposerStateOptions) {
  const attachedFiles = useInputStore((state) => state.attachedFiles);
  const queueModeEnabled = useMessageQueueStore((state) => state.queueModeEnabled);

  const queuedMessages = useMessageQueueStore(
    React.useCallback(
      (state) => {
        if (!sessionId) return [];
        return state.queuedMessages[sessionId] ?? [];
      },
      [sessionId],
    ),
  );

  const abortPromptSessionId = useSessionUIStore((state) => state.abortPromptSessionId);
  const clearAbortPrompt = useSessionUIStore((state) => state.clearAbortPrompt);
  const acknowledgeSessionAbort = useSessionUIStore((state) => state.acknowledgeSessionAbort);

  const isMobile = useUIStore((state) => state.isMobile);
  const isKeyboardOpen = useUIStore((state) => state.isKeyboardOpen);
  const isExpandedInput = useUIStore((state) => state.isExpandedInput);
  const inputBarOffset = useUIStore((state) => state.inputBarOffset);
  const inputSpellcheckEnabled = useUIStore((state) => state.inputSpellcheckEnabled);
  const persistChatDraft = useUIStore((state) => state.persistChatDraft);

  const setSessionAutoAccept = usePermissionStore((state) => state.setSessionAutoAccept);

  return React.useMemo(
    () => ({
      attachedFiles,
      queueModeEnabled,
      queuedMessages,
      abortPromptSessionId,
      clearAbortPrompt,
      acknowledgeSessionAbort,
      isMobile,
      isKeyboardOpen,
      isExpandedInput,
      inputBarOffset,
      inputSpellcheckEnabled,
      persistChatDraft,
      setSessionAutoAccept,
    }),
    [
      attachedFiles,
      queueModeEnabled,
      queuedMessages,
      abortPromptSessionId,
      clearAbortPrompt,
      acknowledgeSessionAbort,
      isMobile,
      isKeyboardOpen,
      isExpandedInput,
      inputBarOffset,
      inputSpellcheckEnabled,
      persistChatDraft,
      setSessionAutoAccept,
    ],
  );
}
