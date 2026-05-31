import React from 'react';

// NOTE: The submit/queue/abort implementations remain in ChatInput.tsx.
// This hook provides the stable callback interface that ChatInput will use
// once the action implementations are migrated in a follow-up task.

export interface UseChatComposerActionsOptions {
  sessionId: string | null;
  /** Placeholder — ChatInput passes this from its own implementation */
  submit?: () => void | Promise<void>;
  /** Placeholder — ChatInput passes this from its own implementation */
  queue?: () => void;
  /** Placeholder — ChatInput passes this from its own implementation */
  abort?: () => void;
}

export function useChatComposerActions() {
  // Stubs — actual submit/queue/abort logic stays in ChatInput until
  // a follow-up task extracts these implementations properly.
  const submit = React.useCallback(() => {
    // TODO: migrate handleSubmit from ChatInput
  }, []);

  const queue = React.useCallback(() => {
    // TODO: migrate handleQueueMessage from ChatInput
  }, []);

  const abort = React.useCallback(() => {
    // TODO: migrate handleAbort from ChatInput
  }, []);

  return { submit, queue, abort };
}
