import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

export type ChatRenderMode = 'sorted' | 'live';
export type ActivityRenderMode = 'collapsed' | 'summary';
export type MermaidRenderingMode = 'svg' | 'ascii';
export type UserMessageRenderingMode = 'markdown' | 'plain';

type ChatRenderingState = {
  showReasoningTraces: boolean;
  chatRenderMode: ChatRenderMode;
  activityRenderMode: ActivityRenderMode;
  showDeletionDialog: boolean;
  showToolFileIcons: boolean;
  showExpandedBashTools: boolean;
  showExpandedEditTools: boolean;
  mermaidRenderingMode: MermaidRenderingMode;
  userMessageRenderingMode: UserMessageRenderingMode;
  stickyUserHeader: boolean;
  setShowReasoningTraces: (value: boolean) => void;
  setChatRenderMode: (value: ChatRenderMode) => void;
  setActivityRenderMode: (value: ActivityRenderMode) => void;
  setShowDeletionDialog: (value: boolean) => void;
  setShowToolFileIcons: (value: boolean) => void;
  setShowExpandedBashTools: (value: boolean) => void;
  setShowExpandedEditTools: (value: boolean) => void;
  setMermaidRenderingMode: (value: MermaidRenderingMode) => void;
  setUserMessageRenderingMode: (value: UserMessageRenderingMode) => void;
  setStickyUserHeader: (value: boolean) => void;
};

export const useChatRenderingStore = create<ChatRenderingState>()(
  persist(
    (set) => ({
      showReasoningTraces: true,
      chatRenderMode: 'live',
      activityRenderMode: 'summary',
      showDeletionDialog: true,
      showToolFileIcons: true,
      showExpandedBashTools: false,
      showExpandedEditTools: false,
      mermaidRenderingMode: 'svg',
      userMessageRenderingMode: 'markdown',
      stickyUserHeader: true,
      setShowReasoningTraces: (value) => { set({ showReasoningTraces: value }); },
      setChatRenderMode: (value) => { set({ chatRenderMode: value }); },
      setActivityRenderMode: (value) => { set({ activityRenderMode: value }); },
      setShowDeletionDialog: (value) => { set({ showDeletionDialog: value }); },
      setShowToolFileIcons: (value) => { set({ showToolFileIcons: value }); },
      setShowExpandedBashTools: (value) => { set({ showExpandedBashTools: value }); },
      setShowExpandedEditTools: (value) => { set({ showExpandedEditTools: value }); },
      setMermaidRenderingMode: (value) => { set({ mermaidRenderingMode: value }); },
      setUserMessageRenderingMode: (value) => { set({ userMessageRenderingMode: value }); },
      setStickyUserHeader: (value) => { set({ stickyUserHeader: value }); },
    }),
    {
      name: 'chat-rendering-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        showReasoningTraces: state.showReasoningTraces,
        chatRenderMode: state.chatRenderMode,
        activityRenderMode: state.activityRenderMode,
        showDeletionDialog: state.showDeletionDialog,
        showToolFileIcons: state.showToolFileIcons,
        showExpandedBashTools: state.showExpandedBashTools,
        showExpandedEditTools: state.showExpandedEditTools,
        mermaidRenderingMode: state.mermaidRenderingMode,
        userMessageRenderingMode: state.userMessageRenderingMode,
        stickyUserHeader: state.stickyUserHeader,
      }),
    },
  ),
);
