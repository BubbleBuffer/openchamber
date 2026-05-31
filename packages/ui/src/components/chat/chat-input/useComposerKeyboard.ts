import React from 'react';
import { isIMECompositionEvent } from '@/lib/ime';

const FILE_MENTION_TOKEN = /^@[^\s]+$/;

type Agent = { name: string; mode: string };

interface UseComposerKeyboardOptions {
  message: string;
  inputMode: 'normal' | 'shell';
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  agents: Agent[];
  confirmedMentionsRef: React.MutableRefObject<Set<string>>;
  isConfirmedFilePath: (text: string) => boolean;
  showCommandAutocomplete: boolean;
  showSkillAutocomplete: boolean;
  showFileMention: boolean;
  commandRef: React.RefObject<{ handleKeyDown: (key: string) => void } | null>;
  skillRef: React.RefObject<{ handleKeyDown: (key: string) => void } | null>;
  mentionRef: React.RefObject<{ handleKeyDown: (key: string) => void } | null>;
  isDesktopExpanded: boolean;
  isMobile: boolean;
  queueModeEnabled: boolean;
  sessionPhase: string;
  currentSessionId: string | null;
  hasContent: boolean;
  navigateHistoryUp: (textareaRef: React.RefObject<HTMLTextAreaElement | null>) => void;
  navigateHistoryDown: () => void;
  historyIndex: number;
  userMessageHistoryLength: number;
  updateAutocompleteState: (value: string, cursorPosition: number) => void;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  adjustTextareaHeight: () => void;
  setInputMode: React.Dispatch<React.SetStateAction<'normal' | 'shell'>>;
  setExpandedInput: (expanded: boolean) => void;
  handleCycleAgent: () => void;
  handleSubmit: () => void;
  handleQueueMessage: () => void;
}

export function useComposerKeyboard(options: UseComposerKeyboardOptions) {
  const {
    message,
    inputMode,
    textareaRef,
    agents,
    confirmedMentionsRef,
    isConfirmedFilePath,
    showCommandAutocomplete,
    showSkillAutocomplete,
    showFileMention,
    commandRef,
    skillRef,
    mentionRef,
    isDesktopExpanded,
    isMobile,
    queueModeEnabled,
    sessionPhase,
    currentSessionId,
    hasContent,
    navigateHistoryUp,
    navigateHistoryDown,
    historyIndex,
    userMessageHistoryLength,
    updateAutocompleteState,
    setMessage,
    adjustTextareaHeight,
    setInputMode,
    setExpandedInput,
    handleCycleAgent,
    handleSubmit,
    handleQueueMessage,
  } = options;

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Early return during IME composition to prevent interference with autocomplete.
    // Uses keyCode === 229 fallback for WebKit where compositionend fires before keydown.
    if (isIMECompositionEvent(e)) return;

    if (inputMode === 'shell' && e.key === 'Escape') {
      e.preventDefault();
      setInputMode('normal');
      return;
    }

    if (inputMode === 'shell' && e.key === 'Backspace' && message.length === 0) {
      e.preventDefault();
      setInputMode('normal');
      return;
    }

    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const textarea = textareaRef.current;
      const selectionStart = textarea?.selectionStart ?? message.length;
      const selectionEnd = textarea?.selectionEnd ?? message.length;
      const hasCollapsedSelection = selectionStart === selectionEnd;
      const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));

      if (hasCollapsedSelection) {
        const probeIndex = e.key === 'Backspace' ? selectionStart - 1 : selectionStart;
        if (probeIndex >= 0 && probeIndex < message.length) {
          let tokenStart = probeIndex;
          while (tokenStart > 0 && !/\s/.test(message[tokenStart - 1])) {
            tokenStart -= 1;
          }

          let tokenEnd = probeIndex + 1;
          while (tokenEnd < message.length && !/\s/.test(message[tokenEnd])) {
            tokenEnd += 1;
          }

          const token = message.slice(tokenStart, tokenEnd);
          const mentionContent = token.slice(1);
          const looksLikeFileMention = FILE_MENTION_TOKEN.test(token)
            && !knownAgentNames.has(mentionContent.toLowerCase())
            && isConfirmedFilePath(mentionContent);

          if (looksLikeFileMention) {
            confirmedMentionsRef.current.delete(mentionContent);
            const removeUntil = message[tokenEnd] === ' ' ? tokenEnd + 1 : tokenEnd;
            const nextMessage = `${message.slice(0, tokenStart)}${message.slice(removeUntil)}`;
            e.preventDefault();
            setMessage(nextMessage);
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = tokenStart;
                textareaRef.current.selectionEnd = tokenStart;
              }
              adjustTextareaHeight();
            });
            updateAutocompleteState(nextMessage, tokenStart);
            return;
          }
        }
      }
    }

    if (showCommandAutocomplete && commandRef.current) {
      if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        commandRef.current.handleKeyDown(e.key);
        return;
      }
    }

    if (showSkillAutocomplete && skillRef.current) {
      if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        skillRef.current.handleKeyDown(e.key);
        return;
      }
    }

    if (showFileMention && mentionRef.current) {
      if (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        mentionRef.current.handleKeyDown(e.key);
        return;
      }
    }

    if (isDesktopExpanded && e.key === 'Escape') {
      e.preventDefault();
      setExpandedInput(false);
      return;
    }

    if (e.key === 'Tab' && !showCommandAutocomplete && !showFileMention) {
      e.preventDefault();
      handleCycleAgent();
      return;
    }

    // Handle ArrowUp/ArrowDown for message history navigation
    // ArrowUp: only when cursor at start (position 0) or input is empty
    // ArrowDown: also works when cursor at end (to cycle forward through history)
    const isAnyAutocompleteOpen = showCommandAutocomplete || showSkillAutocomplete || showFileMention;
    const cursorAtStart = textareaRef.current?.selectionStart === 0 && textareaRef.current?.selectionEnd === 0;
    const cursorAtEnd = textareaRef.current?.selectionStart === message.length && textareaRef.current?.selectionEnd === message.length;
    const canNavigateHistoryUp = !isAnyAutocompleteOpen && (message.length === 0 || cursorAtStart);
    const canNavigateHistoryDown = !isAnyAutocompleteOpen && (message.length === 0 || cursorAtEnd);

    if (e.key === 'ArrowUp' && canNavigateHistoryUp && userMessageHistoryLength > 0) {
      e.preventDefault();
      navigateHistoryUp(textareaRef);
      return;
    }

    if (e.key === 'ArrowDown' && canNavigateHistoryDown && historyIndex >= 0) {
      e.preventDefault();
      navigateHistoryDown();
      return;
    }

    // Handle Enter/Ctrl+Enter based on queue mode
    if (e.key === 'Enter' && !e.shiftKey && (!isMobile || e.ctrlKey || e.metaKey)) {
      e.preventDefault();

      const isCtrlEnter = e.ctrlKey || e.metaKey;

      // Queue mode: Enter queues, Ctrl+Enter sends
      // Normal mode: Enter sends, Ctrl+Enter queues
      // Note: Queueing only works when there's an existing session (currentSessionId)
      // For new sessions (draft), always send immediately
      const canQueue = inputMode === 'normal' && hasContent && currentSessionId && sessionPhase !== 'idle';

      if (queueModeEnabled) {
        if (isCtrlEnter || !canQueue) {
          // Ctrl+Enter sends, or Enter when can't queue (new session)
          handleSubmit();
        } else {
          // Enter queues when we have a session
          handleQueueMessage();
        }
      } else {
        if (isCtrlEnter && canQueue) {
          // Ctrl+Enter queues when we have a session
          handleQueueMessage();
        } else {
          // Enter sends
          handleSubmit();
        }
      }
    }
  }, [
    inputMode,
    message,
    textareaRef,
    agents,
    confirmedMentionsRef,
    isConfirmedFilePath,
    showCommandAutocomplete,
    showSkillAutocomplete,
    showFileMention,
    commandRef,
    skillRef,
    mentionRef,
    isDesktopExpanded,
    isMobile,
    queueModeEnabled,
    sessionPhase,
    currentSessionId,
    hasContent,
    navigateHistoryUp,
    navigateHistoryDown,
    historyIndex,
    userMessageHistoryLength,
    updateAutocompleteState,
    setMessage,
    adjustTextareaHeight,
    setInputMode,
    setExpandedInput,
    handleCycleAgent,
    handleSubmit,
    handleQueueMessage,
  ]);

  return { handleKeyDown };
}
