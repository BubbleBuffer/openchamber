import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getSafeStorage } from './utils/safeStorage';

const EMPTY_NOTIFICATION_TEMPLATES = {
  completion: { title: '', message: '' },
  error: { title: '', message: '' },
  question: { title: '', message: '' },
  subtask: { title: '', message: '' },
} as const;

type NotificationTemplates = {
  completion: { title: string; message: string };
  error: { title: string; message: string };
  question: { title: string; message: string };
  subtask: { title: string; message: string };
};

type NotificationSettingsState = {
  nativeNotificationsEnabled: boolean;
  notificationMode: 'always' | 'hidden-only';
  notifyOnSubtasks: boolean;
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
  notifyOnQuestion: boolean;
  notificationTemplates: NotificationTemplates;
  summarizeLastMessage: boolean;
  summaryThreshold: number;
  summaryLength: number;
  maxLastMessageLength: number;

  setNativeNotificationsEnabled: (value: boolean) => void;
  setNotificationMode: (value: 'always' | 'hidden-only') => void;
  setNotifyOnSubtasks: (value: boolean) => void;
  setNotifyOnCompletion: (value: boolean) => void;
  setNotifyOnError: (value: boolean) => void;
  setNotifyOnQuestion: (value: boolean) => void;
  setNotificationTemplates: (templates: NotificationTemplates) => void;
  setSummarizeLastMessage: (value: boolean) => void;
  setSummaryThreshold: (value: number) => void;
  setSummaryLength: (value: number) => void;
  setMaxLastMessageLength: (value: number) => void;
};

export const useNotificationSettingsStore = create<NotificationSettingsState>()(
  persist(
    (set) => ({
      // ---- defaults ----
      nativeNotificationsEnabled: false,
      notificationMode: 'hidden-only',
      notifyOnSubtasks: true,
      notifyOnCompletion: true,
      notifyOnError: true,
      notifyOnQuestion: true,
      notificationTemplates: { ...EMPTY_NOTIFICATION_TEMPLATES },
      summarizeLastMessage: false,
      summaryThreshold: 200,
      summaryLength: 100,
      maxLastMessageLength: 250,

      // ---- setters ----

      setNativeNotificationsEnabled: (value) => {
        set({ nativeNotificationsEnabled: value });
      },

      setNotificationMode: (value) => {
        set({ notificationMode: value });
      },

      setNotifyOnSubtasks: (value) => {
        set({ notifyOnSubtasks: value });
      },

      setNotifyOnCompletion: (value) => {
        set({ notifyOnCompletion: value });
      },

      setNotifyOnError: (value) => {
        set({ notifyOnError: value });
      },

      setNotifyOnQuestion: (value) => {
        set({ notifyOnQuestion: value });
      },

      setNotificationTemplates: (templates) => {
        set({ notificationTemplates: templates });
      },

      setSummarizeLastMessage: (value) => {
        set({ summarizeLastMessage: value });
      },

      setSummaryThreshold: (value) => {
        set({ summaryThreshold: value });
      },

      setSummaryLength: (value) => {
        set({ summaryLength: value });
      },

      setMaxLastMessageLength: (value) => {
        set({ maxLastMessageLength: value });
      },
    }),
    {
      name: 'notification-settings-store',
      storage: createJSONStorage(() => getSafeStorage()),
      version: 1,
      partialize: (state) => ({
        nativeNotificationsEnabled: state.nativeNotificationsEnabled,
        notificationMode: state.notificationMode,
        notifyOnSubtasks: state.notifyOnSubtasks,
        notifyOnCompletion: state.notifyOnCompletion,
        notifyOnError: state.notifyOnError,
        notifyOnQuestion: state.notifyOnQuestion,
        notificationTemplates: state.notificationTemplates,
        summarizeLastMessage: state.summarizeLastMessage,
        summaryThreshold: state.summaryThreshold,
        summaryLength: state.summaryLength,
        maxLastMessageLength: state.maxLastMessageLength,
      }),
    },
  ),
);
