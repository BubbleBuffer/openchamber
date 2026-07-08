import { useUIStore } from '@/stores/useUIStore';
import { useChatRenderingStore } from '@/stores/useChatRenderingStore';
import { useSessionRetentionStore } from '@/stores/useSessionRetentionStore';
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
import { useNotificationSettingsStore } from '@/stores/useNotificationSettingsStore';
import { useVisualPreferencesStore } from '@/stores/useVisualPreferencesStore';
import { updateDesktopSettings } from '@/lib/config/persistence';
import type { DesktopSettings } from '@/lib/desktop/desktop';

// Appearance fields synced from useUIStore.
type AppearanceSlice = {
  inputSpellcheckEnabled: boolean;
  timeFormatPreference: 'auto' | '12h' | '24h';
  weekStartPreference: 'auto' | 'sunday' | 'monday';
  reportUsage: boolean;
};

// Notification fields synced from useNotificationSettingsStore.
type NotificationSlice = {
  nativeNotificationsEnabled: boolean;
  notificationMode: 'always' | 'hidden-only';
  notifyOnSubtasks: boolean;
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
  notifyOnQuestion: boolean;
  notificationTemplates: {
    completion: { title: string; message: string };
    error: { title: string; message: string };
    question: { title: string; message: string };
    subtask: { title: string; message: string };
  };
  summarizeLastMessage: boolean;
  summaryThreshold: number;
  summaryLength: number;
  maxLastMessageLength: number;
};

// Visual-scale fields synced from useVisualPreferencesStore.
type VisualSlice = {
  fontSize: number;
  terminalFontSize: number;
  padding: number;
  cornerRadius: number;
  inputBarOffset: number;
};

// Diff-preference fields synced from useDiffPreferencesStore.
// diffFileLayout is runtime-only — never synced to desktop.
type DiffPreferencesSlice = {
  diffLayoutPreference: 'dynamic' | 'inline' | 'side-by-side';
  diffViewMode: 'single' | 'stacked';
  gitChangesViewMode: 'flat' | 'tree';
};

let initialized = false;

export const startAppearanceAutoSave = (): void => {
  if (initialized || typeof window === 'undefined') {
    return;
  }

  initialized = true;

  // Initial snapshots
  const uiState = useUIStore.getState();
  let previousAppearance: AppearanceSlice = {
    inputSpellcheckEnabled: uiState.inputSpellcheckEnabled,
    timeFormatPreference: uiState.timeFormatPreference,
    weekStartPreference: uiState.weekStartPreference,
    reportUsage: uiState.reportUsage,
  };

  const chatState = useChatRenderingStore.getState();
  let prevShowReasoningTraces = chatState.showReasoningTraces;
  let prevShowDeletionDialog = chatState.showDeletionDialog;
  let prevShowToolFileIcons = chatState.showToolFileIcons;
  let prevShowExpandedBashTools = chatState.showExpandedBashTools;
  let prevShowExpandedEditTools = chatState.showExpandedEditTools;
  let prevChatRenderMode = chatState.chatRenderMode;
  let prevActivityRenderMode = chatState.activityRenderMode;
  let prevMermaidRenderingMode = chatState.mermaidRenderingMode;
  let prevUserMessageRenderingMode = chatState.userMessageRenderingMode;
  let prevStickyUserHeader = chatState.stickyUserHeader;

  const retentionState = useSessionRetentionStore.getState();
  let prevAutoDeleteEnabled = retentionState.autoDeleteEnabled;
  let prevAutoDeleteAfterDays = retentionState.autoDeleteAfterDays;
  let prevSessionRetentionAction = retentionState.sessionRetentionAction;

  let previousNotification: NotificationSlice = {
    nativeNotificationsEnabled: useNotificationSettingsStore.getState().nativeNotificationsEnabled,
    notificationMode: useNotificationSettingsStore.getState().notificationMode,
    notifyOnSubtasks: useNotificationSettingsStore.getState().notifyOnSubtasks,
    notifyOnCompletion: useNotificationSettingsStore.getState().notifyOnCompletion,
    notifyOnError: useNotificationSettingsStore.getState().notifyOnError,
    notifyOnQuestion: useNotificationSettingsStore.getState().notifyOnQuestion,
    notificationTemplates: useNotificationSettingsStore.getState().notificationTemplates,
    summarizeLastMessage: useNotificationSettingsStore.getState().summarizeLastMessage,
    summaryThreshold: useNotificationSettingsStore.getState().summaryThreshold,
    summaryLength: useNotificationSettingsStore.getState().summaryLength,
    maxLastMessageLength: useNotificationSettingsStore.getState().maxLastMessageLength,
  };

  let previousVisual: VisualSlice = {
    fontSize: useVisualPreferencesStore.getState().fontSize,
    terminalFontSize: useVisualPreferencesStore.getState().terminalFontSize,
    padding: useVisualPreferencesStore.getState().padding,
    cornerRadius: useVisualPreferencesStore.getState().cornerRadius,
    inputBarOffset: useVisualPreferencesStore.getState().inputBarOffset,
  };

  let previousDiff: DiffPreferencesSlice = {
    diffLayoutPreference: useDiffPreferencesStore.getState().diffLayoutPreference,
    diffViewMode: useDiffPreferencesStore.getState().diffViewMode,
    gitChangesViewMode: useDiffPreferencesStore.getState().gitChangesViewMode,
  };

  let pending: Partial<DesktopSettings> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const payload = pending;
    pending = null;
    timer = null;
    if (payload && Object.keys(payload).length > 0) {
      void updateDesktopSettings(payload);
    }
  };

  const schedule = (changes: Partial<DesktopSettings>) => {
    pending = { ...(pending ?? {}), ...changes };
    if (timer) {
      return;
    }
    timer = setTimeout(flush, 150);
  };

  useUIStore.subscribe((state) => {
    const current: AppearanceSlice = {
      inputSpellcheckEnabled: state.inputSpellcheckEnabled,
      timeFormatPreference: state.timeFormatPreference,
      weekStartPreference: state.weekStartPreference,
      reportUsage: state.reportUsage,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.inputSpellcheckEnabled !== previousAppearance.inputSpellcheckEnabled) {
      diff.inputSpellcheckEnabled = current.inputSpellcheckEnabled;
    }
    if (current.timeFormatPreference !== previousAppearance.timeFormatPreference) {
      diff.timeFormatPreference = current.timeFormatPreference;
    }
    if (current.weekStartPreference !== previousAppearance.weekStartPreference) {
      diff.weekStartPreference = current.weekStartPreference;
    }
    if (current.reportUsage !== previousAppearance.reportUsage) {
      diff.reportUsage = current.reportUsage;
    }

    previousAppearance = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });

  useChatRenderingStore.subscribe((state) => {
    const diff: Partial<DesktopSettings> = {};
    if (state.showReasoningTraces !== prevShowReasoningTraces) {
      diff.showReasoningTraces = state.showReasoningTraces;
      prevShowReasoningTraces = state.showReasoningTraces;
    }
    if (state.showDeletionDialog !== prevShowDeletionDialog) {
      diff.showDeletionDialog = state.showDeletionDialog;
      prevShowDeletionDialog = state.showDeletionDialog;
    }
    if (state.showToolFileIcons !== prevShowToolFileIcons) {
      diff.showToolFileIcons = state.showToolFileIcons;
      prevShowToolFileIcons = state.showToolFileIcons;
    }
    if (state.showExpandedBashTools !== prevShowExpandedBashTools) {
      diff.showExpandedBashTools = state.showExpandedBashTools;
      prevShowExpandedBashTools = state.showExpandedBashTools;
    }
    if (state.showExpandedEditTools !== prevShowExpandedEditTools) {
      diff.showExpandedEditTools = state.showExpandedEditTools;
      prevShowExpandedEditTools = state.showExpandedEditTools;
    }
    if (state.chatRenderMode !== prevChatRenderMode) {
      diff.chatRenderMode = state.chatRenderMode;
      prevChatRenderMode = state.chatRenderMode;
    }
    if (state.activityRenderMode !== prevActivityRenderMode) {
      diff.activityRenderMode = state.activityRenderMode;
      prevActivityRenderMode = state.activityRenderMode;
    }
    if (state.mermaidRenderingMode !== prevMermaidRenderingMode) {
      diff.mermaidRenderingMode = state.mermaidRenderingMode;
      prevMermaidRenderingMode = state.mermaidRenderingMode;
    }
    if (state.userMessageRenderingMode !== prevUserMessageRenderingMode) {
      diff.userMessageRenderingMode = state.userMessageRenderingMode;
      prevUserMessageRenderingMode = state.userMessageRenderingMode;
    }
    if (state.stickyUserHeader !== prevStickyUserHeader) {
      diff.stickyUserHeader = state.stickyUserHeader;
      prevStickyUserHeader = state.stickyUserHeader;
    }
    if (Object.keys(diff).length > 0) schedule(diff);
  });

  useSessionRetentionStore.subscribe((state) => {
    const diff: Partial<DesktopSettings> = {};
    if (state.autoDeleteEnabled !== prevAutoDeleteEnabled) {
      diff.autoDeleteEnabled = state.autoDeleteEnabled;
      prevAutoDeleteEnabled = state.autoDeleteEnabled;
    }
    if (state.autoDeleteAfterDays !== prevAutoDeleteAfterDays) {
      diff.autoDeleteAfterDays = state.autoDeleteAfterDays;
      prevAutoDeleteAfterDays = state.autoDeleteAfterDays;
    }
    if (state.sessionRetentionAction !== prevSessionRetentionAction) {
      diff.sessionRetentionAction = state.sessionRetentionAction;
      prevSessionRetentionAction = state.sessionRetentionAction;
    }
    if (Object.keys(diff).length > 0) schedule(diff);
  });

  useNotificationSettingsStore.subscribe((state) => {
    const current: NotificationSlice = {
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
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.nativeNotificationsEnabled !== previousNotification.nativeNotificationsEnabled) {
      diff.nativeNotificationsEnabled = current.nativeNotificationsEnabled;
    }
    if (current.notificationMode !== previousNotification.notificationMode) {
      diff.notificationMode = current.notificationMode;
    }
    if (current.notifyOnSubtasks !== previousNotification.notifyOnSubtasks) {
      diff.notifyOnSubtasks = current.notifyOnSubtasks;
    }
    if (current.notifyOnCompletion !== previousNotification.notifyOnCompletion) {
      diff.notifyOnCompletion = current.notifyOnCompletion;
    }
    if (current.notifyOnError !== previousNotification.notifyOnError) {
      diff.notifyOnError = current.notifyOnError;
    }
    if (current.notifyOnQuestion !== previousNotification.notifyOnQuestion) {
      diff.notifyOnQuestion = current.notifyOnQuestion;
    }
    if (JSON.stringify(current.notificationTemplates) !== JSON.stringify(previousNotification.notificationTemplates)) {
      diff.notificationTemplates = current.notificationTemplates;
    }
    if (current.summarizeLastMessage !== previousNotification.summarizeLastMessage) {
      diff.summarizeLastMessage = current.summarizeLastMessage;
    }
    if (current.summaryThreshold !== previousNotification.summaryThreshold) {
      diff.summaryThreshold = current.summaryThreshold;
    }
    if (current.summaryLength !== previousNotification.summaryLength) {
      diff.summaryLength = current.summaryLength;
    }
    if (current.maxLastMessageLength !== previousNotification.maxLastMessageLength) {
      diff.maxLastMessageLength = current.maxLastMessageLength;
    }

    previousNotification = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });

  useVisualPreferencesStore.subscribe((state) => {
    const current: VisualSlice = {
      fontSize: state.fontSize,
      terminalFontSize: state.terminalFontSize,
      padding: state.padding,
      cornerRadius: state.cornerRadius,
      inputBarOffset: state.inputBarOffset,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.fontSize !== previousVisual.fontSize) {
      diff.fontSize = current.fontSize;
    }
    if (current.terminalFontSize !== previousVisual.terminalFontSize) {
      diff.terminalFontSize = current.terminalFontSize;
    }
    if (current.padding !== previousVisual.padding) {
      diff.padding = current.padding;
    }
    if (current.cornerRadius !== previousVisual.cornerRadius) {
      diff.cornerRadius = current.cornerRadius;
    }
    if (current.inputBarOffset !== previousVisual.inputBarOffset) {
      diff.inputBarOffset = current.inputBarOffset;
    }

    previousVisual = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });

  useDiffPreferencesStore.subscribe((state) => {
    const current: DiffPreferencesSlice = {
      diffLayoutPreference: state.diffLayoutPreference,
      diffViewMode: state.diffViewMode,
      gitChangesViewMode: state.gitChangesViewMode,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.diffLayoutPreference !== previousDiff.diffLayoutPreference) {
      diff.diffLayoutPreference = current.diffLayoutPreference;
    }
    if (current.diffViewMode !== previousDiff.diffViewMode) {
      diff.diffViewMode = current.diffViewMode;
    }
    if (current.gitChangesViewMode !== previousDiff.gitChangesViewMode) {
      diff.gitChangesViewMode = current.gitChangesViewMode;
    }

    previousDiff = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
  });

};
