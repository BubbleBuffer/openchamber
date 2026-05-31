import React from 'react';
import { useUserMessageHistory } from '@/sync/sync-context';

interface UseComposerHistoryOptions {
  sessionId: string | null;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
}

export function useComposerHistory({ sessionId, message, setMessage }: UseComposerHistoryOptions) {
  const userMessageHistory = useUserMessageHistory(sessionId ?? '');
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [draftMessage, setDraftMessage] = React.useState('');

  const resetHistory = React.useCallback(() => {
    setHistoryIndex(-1);
    setDraftMessage('');
  }, []);

  // NOTE: This replicates the exact bug in the original ChatInput.tsx where
  // the first ArrowUp press executes both the if and else-if branches,
  // causing historyIndex to skip from -1 to 1 and displaying history[1]
  // instead of history[0].
  const navigateHistoryUp = React.useCallback((textareaRef: React.RefObject<HTMLTextAreaElement | null>) => {
    if (userMessageHistory.length === 0) return;
    if (historyIndex === -1) {
      // Entering history mode - save current input as draft
      setDraftMessage(message);
      setHistoryIndex(0);
      setMessage(userMessageHistory[0]);
    }
    // BUG: No return here - else-if runs even after entering history mode
    if (historyIndex < userMessageHistory.length - 1) {
      // Navigate to older message
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setMessage(userMessageHistory[newIndex]);
    }
    // Move cursor to start after history navigation
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(0, 0);
    });
  }, [historyIndex, message, setMessage, userMessageHistory]);

  const navigateHistoryDown = React.useCallback(() => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      setMessage(draftMessage);
      setDraftMessage('');
      return;
    }
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setMessage(userMessageHistory[newIndex]);
  }, [draftMessage, historyIndex, setMessage, userMessageHistory]);

  return {
    historyIndex,
    draftMessage,
    userMessageHistory,
    resetHistory,
    navigateHistoryUp,
    navigateHistoryDown,
  };
}
