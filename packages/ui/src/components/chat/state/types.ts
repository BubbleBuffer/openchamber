import type React from 'react';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { QueuedMessage } from '@/stores/messageQueueStore';
import type { ChatMessageEntry } from '../lib/turns/types';
import type { PermissionRequest } from '@/types/permission';
import type { QuestionRequest } from '@/types/question';
import type { ChatSessionData } from '../hooks/useChatSessionData';

export interface ChatHistoryMeta {
  limit: number;
  complete: boolean;
  loading: boolean;
}

export interface ChatSessionState {
  sessionId: string | null;
  activeSessionId: string | null;
  isActive: boolean;
  loaded: boolean;
  exists: boolean;
  isDraftOpen: boolean;
  parentSessionId: string | null;
}

export interface ChatMessagesState {
  messages: ChatMessageEntry[];
  renderedMessages: ChatMessageEntry[];
  messageCount: number;
  streamingMessageId: string | undefined;
  historyMeta: ChatHistoryMeta;
  retryOverlay: ChatSessionData['retryOverlay'];
}

export interface ChatActivityState {
  isWorking: boolean;
  isStreaming: boolean;
  isAborting: boolean;
  showAbortStatus: boolean;
  needsAttention: boolean;
}

export interface ChatInterruptionsState {
  permissions: PermissionRequest[];
  questions: QuestionRequest[];
  hasBlockingRequest: boolean;
}

export interface ChatTimelineState {
  turnStart: number;
  pendingRevealWork: boolean;
  hasMoreAboveTurns: boolean;
  isLoadingOlder: boolean;
  allEntries: ChatMessageEntry[];
}

export interface ChatComposerState {
  message: string;
  attachedFiles: AttachedFile[];
  queuedMessages: QueuedMessage[];
  queueModeEnabled: boolean;
  inputMode: 'normal' | 'shell';
  isMobile: boolean;
  isKeyboardOpen: boolean;
  isExpandedInput: boolean;
}

export interface ChatComposerActions {
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  submit: () => void | Promise<void>;
  queue: () => void;
  abort: () => void;
  clearAttachments: () => void;
}

export interface ChatSelectionState {
  agentName: string | null;
  modelId: string | null;
  providerId: string | null;
  variant: string | null;
  directory: string | null;
  projectId: string | null;
}
