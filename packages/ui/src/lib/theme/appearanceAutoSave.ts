import { useUIStore } from '@/stores/useUIStore';
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
import { useNotificationSettingsStore } from '@/stores/useNotificationSettingsStore';
import { useVisualPreferencesStore } from '@/stores/useVisualPreferencesStore';
import { updateDesktopSettings } from '@/lib/config/persistence';
import type { DesktopSettings } from '@/lib/desktop/desktop';

// Appearance fields synced from useUIStore.
type AppearanceSlice = {
  showReasoningTraces: boolean;
  showDeletionDialog: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays: number;
  sessionRetentionAction: 'archive' | 'delete';
  inputSpellcheckEnabled: boolean;
  showToolFileIcons: boolean;
  showExpandedBashTools: boolean;
  showExpandedEditTools: boolean;
  timeFormatPreference: 'auto' | '12h' | '24h';
  weekStartPreference: 'auto' | 'sunday' | 'monday';
  chatRenderMode: 'sorted' | 'live';
  activityRenderMode: 'collapsed' | 'summary';
  mermaidRenderingMode: 'svg' | 'ascii';
  userMessageRenderingMode: 'markdown' | 'plain';
  stickyUserHeader: boolean;
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
    showReasoningTraces: uiState.showReasoningTraces,
    showDeletionDialog: uiState.showDeletionDialog,
    autoDeleteEnabled: uiState.autoDeleteEnabled,
    autoDeleteAfterDays: uiState.autoDeleteAfterDays,
    sessionRetentionAction: uiState.sessionRetentionAction,
    inputSpellcheckEnabled: uiState.inputSpellcheckEnabled,
    showToolFileIcons: uiState.showToolFileIcons,
    showExpandedBashTools: uiState.showExpandedBashTools,
    showExpandedEditTools: uiState.showExpandedEditTools,
    timeFormatPreference: uiState.timeFormatPreference,
    weekStartPreference: uiState.weekStartPreference,
    chatRenderMode: uiState.chatRenderMode,
    activityRenderMode: uiState.activityRenderMode,
    mermaidRenderingMode: uiState.mermaidRenderingMode,
    userMessageRenderingMode: uiState.userMessageRenderingMode,
    stickyUserHeader: uiState.stickyUserHeader,
    reportUsage: uiState.reportUsage,
  };

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
      showReasoningTraces: state.showReasoningTraces,
      showDeletionDialog: state.showDeletionDialog,
      autoDeleteEnabled: state.autoDeleteEnabled,
      autoDeleteAfterDays: state.autoDeleteAfterDays,
      sessionRetentionAction: state.sessionRetentionAction,
      inputSpellcheckEnabled: state.inputSpellcheckEnabled,
      showToolFileIcons: state.showToolFileIcons,
      showExpandedBashTools: state.showExpandedBashTools,
      showExpandedEditTools: state.showExpandedEditTools,
      timeFormatPreference: state.timeFormatPreference,
      weekStartPreference: state.weekStartPreference,
      chatRenderMode: state.chatRenderMode,
      activityRenderMode: state.activityRenderMode,
      mermaidRenderingMode: state.mermaidRenderingMode,
      userMessageRenderingMode: state.userMessageRenderingMode,
      stickyUserHeader: state.stickyUserHeader,
      reportUsage: state.reportUsage,
    };

    const diff: Partial<DesktopSettings> = {};

    if (current.showReasoningTraces !== previousAppearance.showReasoningTraces) {
      diff.showReasoningTraces = current.showReasoningTraces;
    }
    if (current.showDeletionDialog !== previousAppearance.showDeletionDialog) {
      diff.showDeletionDialog = current.showDeletionDialog;
    }
    if (current.autoDeleteEnabled !== previousAppearance.autoDeleteEnabled) {
      diff.autoDeleteEnabled = current.autoDeleteEnabled;
    }
    if (current.autoDeleteAfterDays !== previousAppearance.autoDeleteAfterDays) {
      diff.autoDeleteAfterDays = current.autoDeleteAfterDays;
    }
    if (current.sessionRetentionAction !== previousAppearance.sessionRetentionAction) {
      diff.sessionRetentionAction = current.sessionRetentionAction;
    }
    if (current.inputSpellcheckEnabled !== previousAppearance.inputSpellcheckEnabled) {
      diff.inputSpellcheckEnabled = current.inputSpellcheckEnabled;
    }
    if (current.showToolFileIcons !== previousAppearance.showToolFileIcons) {
      diff.showToolFileIcons = current.showToolFileIcons;
    }
    if (current.showExpandedBashTools !== previousAppearance.showExpandedBashTools) {
      diff.showExpandedBashTools = current.showExpandedBashTools;
    }
    if (current.showExpandedEditTools !== previousAppearance.showExpandedEditTools) {
      diff.showExpandedEditTools = current.showExpandedEditTools;
    }
    if (current.timeFormatPreference !== previousAppearance.timeFormatPreference) {
      diff.timeFormatPreference = current.timeFormatPreference;
    }
    if (current.weekStartPreference !== previousAppearance.weekStartPreference) {
      diff.weekStartPreference = current.weekStartPreference;
    }
    if (current.chatRenderMode !== previousAppearance.chatRenderMode) {
      diff.chatRenderMode = current.chatRenderMode;
    }
    if (current.activityRenderMode !== previousAppearance.activityRenderMode) {
      diff.activityRenderMode = current.activityRenderMode;
    }
    if (current.mermaidRenderingMode !== previousAppearance.mermaidRenderingMode) {
      diff.mermaidRenderingMode = current.mermaidRenderingMode;
    }
    if (current.userMessageRenderingMode !== previousAppearance.userMessageRenderingMode) {
      diff.userMessageRenderingMode = current.userMessageRenderingMode;
    }
    if (current.stickyUserHeader !== previousAppearance.stickyUserHeader) {
      diff.stickyUserHeader = current.stickyUserHeader;
    }
    if (current.reportUsage !== previousAppearance.reportUsage) {
      diff.reportUsage = current.reportUsage;
    }

    previousAppearance = current;

    if (Object.keys(diff).length > 0) {
      schedule(diff);
    }
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
