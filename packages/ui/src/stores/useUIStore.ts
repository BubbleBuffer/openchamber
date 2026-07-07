import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

import { getSafeStorage } from './utils/safeStorage';
import type { ShortcutCombo } from '@/lib/shortcuts';
import { useNavigationStore } from './useNavigationStore';
import type { MainTab, MainTabGuard } from './useNavigationStore';

export type { MainTab, MainTabGuard } from './useNavigationStore';

export type RightSidebarTab = 'git' | 'files' | 'context';
export type ContextPanelMode = 'diff' | 'file' | 'context' | 'plan' | 'chat';
export type MermaidRenderingMode = 'svg' | 'ascii';
export type UserMessageRenderingMode = 'markdown' | 'plain';
export type ChatRenderMode = 'sorted' | 'live';
export type ActivityRenderMode = 'collapsed' | 'summary';
export type SessionRetentionAction = 'archive' | 'delete';
export type TimeFormatPreference = 'auto' | '12h' | '24h';
export type WeekStartPreference = 'auto' | 'sunday' | 'monday';

type ContextPanelTab = {
  id: string;
  mode: ContextPanelMode;
  targetPath: string | null;
  dedupeKey: string;
  label: string | null;
  touchedAt: number;
};

type ContextPanelTabDescriptor = {
  mode: ContextPanelMode;
  targetPath?: string | null;
  dedupeKey?: string | null;
  label?: string | null;
};

type ContextPanelDirectoryState = {
  isOpen: boolean;
  expanded: boolean;
  tabs: ContextPanelTab[];
  activeTabId: string | null;
  width: number;
  touchedAt: number;
};

type PendingFileNavigation = {
  path: string;
  line: number;
  column: number;
};

export type EventStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'paused'
  | 'offline'
  | 'error';

const LEGACY_DEFAULT_NOTIFICATION_TEMPLATES = {
  completion: { title: '{agent_name} is ready', message: '{last_message}' },
  error: { title: 'Tool error', message: '{last_message}' },
  question: { title: '{agent_name} needs input', message: '{last_message}' },
  subtask: { title: 'Subtask complete', message: '{last_message}' },
} as const;

const EMPTY_NOTIFICATION_TEMPLATES = {
  completion: { title: '', message: '' },
  error: { title: '', message: '' },
  question: { title: '', message: '' },
  subtask: { title: '', message: '' },
} as const;

const isSameTemplateValue = (
  a: { title: string; message: string } | undefined,
  b: { title: string; message: string }
) => {
  if (!a) return false;
  return a.title === b.title && a.message === b.message;
};

const isLegacyDefaultTemplates = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, { title: string; message: string } | undefined>;
  return (
    isSameTemplateValue(candidate.completion, LEGACY_DEFAULT_NOTIFICATION_TEMPLATES.completion)
    && isSameTemplateValue(candidate.error, LEGACY_DEFAULT_NOTIFICATION_TEMPLATES.error)
    && isSameTemplateValue(candidate.question, LEGACY_DEFAULT_NOTIFICATION_TEMPLATES.question)
    && isSameTemplateValue(candidate.subtask, LEGACY_DEFAULT_NOTIFICATION_TEMPLATES.subtask)
  );
};

const CONTEXT_PANEL_DEFAULT_WIDTH = 600;
const CONTEXT_PANEL_MIN_WIDTH = 360;
const CONTEXT_PANEL_MAX_WIDTH = 1400;
const CONTEXT_PANEL_MAX_TABS = 12;
const CONTEXT_PANEL_MAX_LABEL_LENGTH = 120;
const normalizeDirectoryPath = (value: string): string => {
  if (!value) return '';

  const raw = value.replace(/\\/g, '/');
  const hadUncPrefix = raw.startsWith('//');
  let normalized = raw.replace(/\/+$/g, '');
  normalized = normalized.replace(/\/+/g, '/');

  if (hadUncPrefix && !normalized.startsWith('//')) {
    normalized = `/${normalized}`;
  }

  if (normalized === '') {
    return raw.startsWith('/') ? '/' : '';
  }

  return normalized;
};

const clampContextPanelWidth = (width: number): number => {
  if (!Number.isFinite(width)) {
    return CONTEXT_PANEL_DEFAULT_WIDTH;
  }

  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, Math.round(width)));
};

const normalizeContextTargetPath = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\\/g, '/');
};

const normalizeContextTabLabel = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.length > CONTEXT_PANEL_MAX_LABEL_LENGTH
    ? trimmed.slice(0, CONTEXT_PANEL_MAX_LABEL_LENGTH)
    : trimmed;
};

const buildDefaultContextPanelTabDedupeKey = (mode: ContextPanelMode, targetPath: string | null): string => {
  if (mode === 'file') {
    return targetPath || mode;
  }

  return mode;
};

const normalizeContextPanelTabDedupeKey = (
  mode: ContextPanelMode,
  targetPath: string | null,
  dedupeKey: string | null | undefined,
): string => {
  if (typeof dedupeKey === 'string') {
    const trimmed = dedupeKey.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return buildDefaultContextPanelTabDedupeKey(mode, targetPath);
};

const buildContextPanelTabID = (mode: ContextPanelMode, dedupeKey: string): string => {
  return dedupeKey === mode ? mode : `${mode}:${dedupeKey}`;
};

const createContextPanelTab = (descriptor: ContextPanelTabDescriptor): ContextPanelTab => {
  const normalizedTargetPath = normalizeContextTargetPath(descriptor.targetPath);
  const dedupeKey = normalizeContextPanelTabDedupeKey(
    descriptor.mode,
    normalizedTargetPath,
    descriptor.dedupeKey,
  );
  return {
    id: buildContextPanelTabID(descriptor.mode, dedupeKey),
    mode: descriptor.mode,
    targetPath: normalizedTargetPath,
    dedupeKey,
    label: normalizeContextTabLabel(descriptor.label),
    touchedAt: Date.now(),
  };
};

const clampContextPanelTabs = (tabs: ContextPanelTab[], maxTabs: number, activeTabId: string | null): ContextPanelTab[] => {
  if (tabs.length <= maxTabs) {
    return tabs;
  }

  const tabsByTouch = [...tabs].sort((a, b) => a.touchedAt - b.touchedAt);
  const removable = tabsByTouch.filter((tab) => tab.id !== activeTabId);
  const removeCount = tabs.length - maxTabs;
  if (removeCount <= 0 || removable.length === 0) {
    return tabs.slice(-maxTabs);
  }

  const removeSet = new Set(removable.slice(0, removeCount).map((tab) => tab.id));
  return tabs.filter((tab) => !removeSet.has(tab.id));
};

const sanitizeContextPanelTabs = (tabs: unknown): ContextPanelTab[] => {
  if (!Array.isArray(tabs)) {
    return [];
  }

  const result: ContextPanelTab[] = [];
  const seen = new Set<string>();

  for (const entry of tabs) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const candidate = entry as {
      mode?: unknown;
      targetPath?: unknown;
      dedupeKey?: unknown;
      label?: unknown;
      touchedAt?: unknown;
    };

    if (candidate.mode !== 'diff' && candidate.mode !== 'file' && candidate.mode !== 'context' && candidate.mode !== 'plan' && candidate.mode !== 'chat') {
      continue;
    }

    const targetPath = normalizeContextTargetPath(typeof candidate.targetPath === 'string' ? candidate.targetPath : null);
    const dedupeKey = normalizeContextPanelTabDedupeKey(
      candidate.mode,
      targetPath,
      typeof candidate.dedupeKey === 'string' ? candidate.dedupeKey : null,
    );
    const id = buildContextPanelTabID(candidate.mode, dedupeKey);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push({
      id,
      mode: candidate.mode,
      targetPath,
      dedupeKey,
      label: normalizeContextTabLabel(typeof candidate.label === 'string' ? candidate.label : null),
      touchedAt: typeof candidate.touchedAt === 'number' && Number.isFinite(candidate.touchedAt)
        ? candidate.touchedAt
        : Date.now(),
    });
  }

  return result;
};

const resolveActiveContextPanelTabID = (tabs: ContextPanelTab[], activeTabId: string | null): string | null => {
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) {
    return activeTabId;
  }

  if (tabs.length === 0) {
    return null;
  }

  return tabs[tabs.length - 1].id;
};

const touchContextPanelState = (prev?: ContextPanelDirectoryState): ContextPanelDirectoryState => {
  if (prev) {
    const tabs = sanitizeContextPanelTabs(prev.tabs);
    const activeTabId = resolveActiveContextPanelTabID(tabs, prev.activeTabId);
    return {
      ...prev,
      tabs,
      activeTabId,
      touchedAt: Date.now(),
    };
  }

  return {
    isOpen: false,
    expanded: false,
    tabs: [],
    activeTabId: null,
    width: CONTEXT_PANEL_DEFAULT_WIDTH,
    touchedAt: Date.now(),
  };
};

const upsertContextPanelTab = (
  current: ContextPanelDirectoryState,
  descriptor: ContextPanelTabDescriptor,
): ContextPanelDirectoryState => {
  const nextTab = createContextPanelTab(descriptor);
  const existingIndex = current.tabs.findIndex((tab) => tab.id === nextTab.id);
  const tabs = existingIndex === -1
    ? [...current.tabs, nextTab]
    : current.tabs.map((tab, index) => (index === existingIndex
      ? {
          ...tab,
          mode: nextTab.mode,
          targetPath: nextTab.targetPath,
          dedupeKey: nextTab.dedupeKey,
          label: nextTab.label,
          touchedAt: Date.now(),
        }
      : tab));

  const activeTabId = nextTab.id;
  const clampedTabs = clampContextPanelTabs(tabs, CONTEXT_PANEL_MAX_TABS, activeTabId);

  return {
    ...current,
    isOpen: true,
    tabs: clampedTabs,
    activeTabId: resolveActiveContextPanelTabID(clampedTabs, activeTabId),
    touchedAt: Date.now(),
  };
};

const closeContextPanelTab = (
  current: ContextPanelDirectoryState,
  tabID: string,
): ContextPanelDirectoryState => {
  const nextTabs = current.tabs.filter((tab) => tab.id !== tabID);
  const nextActiveTabId = current.activeTabId === tabID
    ? (nextTabs[nextTabs.length - 1]?.id ?? null)
    : resolveActiveContextPanelTabID(nextTabs, current.activeTabId);

  return {
    ...current,
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
    isOpen: nextTabs.length > 0 ? current.isOpen : false,
    touchedAt: Date.now(),
  };
};

const reorderContextPanelTabs = (
  current: ContextPanelDirectoryState,
  activeTabID: string,
  overTabID: string,
): ContextPanelDirectoryState => {
  if (activeTabID === overTabID) {
    return current;
  }

  const fromIndex = current.tabs.findIndex((tab) => tab.id === activeTabID);
  const toIndex = current.tabs.findIndex((tab) => tab.id === overTabID);
  if (fromIndex === -1 || toIndex === -1) {
    return current;
  }

  const tabs = [...current.tabs];
  const [moved] = tabs.splice(fromIndex, 1);
  if (!moved) {
    return current;
  }

  tabs.splice(toIndex, 0, moved);

  return {
    ...current,
    tabs,
    touchedAt: Date.now(),
  };
};

const sanitizeContextPanelByDirectory = (
  value: unknown,
): Record<string, ContextPanelDirectoryState> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  const next: Record<string, ContextPanelDirectoryState> = {};

  for (const [rawDirectory, rawState] of Object.entries(source)) {
    const directory = normalizeDirectoryPath(rawDirectory);
    if (!directory || !rawState || typeof rawState !== 'object') {
      continue;
    }

    const candidate = rawState as {
      isOpen?: unknown;
      expanded?: unknown;
      tabs?: unknown;
      activeTabId?: unknown;
      width?: unknown;
      touchedAt?: unknown;
      mode?: unknown;
      targetPath?: unknown;
      dedupeKey?: unknown;
      label?: unknown;
    };

    let tabs = sanitizeContextPanelTabs(candidate.tabs);
    let activeTabId = typeof candidate.activeTabId === 'string' ? candidate.activeTabId : null;

    if (tabs.length === 0 && (candidate.mode === 'diff' || candidate.mode === 'file' || candidate.mode === 'context' || candidate.mode === 'plan' || candidate.mode === 'chat')) {
      tabs = [createContextPanelTab({
        mode: candidate.mode,
        targetPath: typeof candidate.targetPath === 'string' ? candidate.targetPath : null,
        dedupeKey: typeof candidate.dedupeKey === 'string' ? candidate.dedupeKey : null,
        label: typeof candidate.label === 'string' ? candidate.label : null,
      })];
      activeTabId = tabs[0]?.id ?? null;
    }

    const resolvedActiveTabId = resolveActiveContextPanelTabID(tabs, activeTabId);
    const clampedTabs = clampContextPanelTabs(tabs, CONTEXT_PANEL_MAX_TABS, resolvedActiveTabId);

    next[directory] = {
      isOpen: candidate.isOpen === true,
      expanded: candidate.expanded === true,
      tabs: clampedTabs,
      activeTabId: resolveActiveContextPanelTabID(clampedTabs, resolvedActiveTabId),
      width: clampContextPanelWidth(typeof candidate.width === 'number' ? candidate.width : CONTEXT_PANEL_DEFAULT_WIDTH),
      touchedAt: typeof candidate.touchedAt === 'number' && Number.isFinite(candidate.touchedAt)
        ? candidate.touchedAt
        : Date.now(),
    };
  }

  return next;
};

const clampContextPanelRoots = (
  byDirectory: Record<string, ContextPanelDirectoryState>,
  maxRoots: number
): Record<string, ContextPanelDirectoryState> => {
  const entries = Object.entries(byDirectory);
  if (entries.length <= maxRoots) {
    return byDirectory;
  }

  entries.sort((a, b) => (b[1]?.touchedAt ?? 0) - (a[1]?.touchedAt ?? 0));
  const next: Record<string, ContextPanelDirectoryState> = {};
  for (const [directory, state] of entries.slice(0, maxRoots)) {
    next[directory] = state;
  }
  return next;
};

interface UIStore {

  theme: 'light' | 'dark' | 'system';
  contextPanelByDirectory: Record<string, ContextPanelDirectoryState>;
  pendingDiffFile: string | null;
  pendingFileNavigation: PendingFileNavigation | null;
  pendingFileFocusPath: string | null;

  // Settings IA (new shell)
  settingsPage: string;
  settingsProjectsSelectedId: string | null;
  settingsRemoteInstancesSelectedId: string | null;
  eventStreamStatus: EventStreamStatus;
  showReasoningTraces: boolean;
  chatRenderMode: ChatRenderMode;
  activityRenderMode: ActivityRenderMode;
  showDeletionDialog: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteAfterDays: number;
  sessionRetentionAction: SessionRetentionAction;
  autoDeleteLastRunAt: number | null;

  showTerminalQuickKeysOnDesktop: boolean;
  persistChatDraft: boolean;
  inputSpellcheckEnabled: boolean;
  showToolFileIcons: boolean;
  showExpandedBashTools: boolean;
  showExpandedEditTools: boolean;
  timeFormatPreference: TimeFormatPreference;
  weekStartPreference: WeekStartPreference;
  mermaidRenderingMode: MermaidRenderingMode;
  userMessageRenderingMode: UserMessageRenderingMode;
  stickyUserHeader: boolean;
  showMobileSessionStatusBar: boolean;
  isMobileSessionStatusBarCollapsed: boolean;
  isExpandedInput: boolean;
  reportUsage: boolean;
  shortcutOverrides: Record<string, ShortcutCombo>;

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  openContextPanelTab: (directory: string, tab: ContextPanelTabDescriptor) => void;
  openContextDiff: (directory: string, filePath: string) => void;
  openContextFile: (directory: string, filePath: string) => void;
  openContextFileAtLine: (directory: string, filePath: string, line: number, column?: number) => void;
  openContextOverview: (directory: string) => void;
  openContextPlan: (directory: string) => void;
  setActiveContextPanelTab: (directory: string, tabID: string) => void;
  reorderContextPanelTabs: (directory: string, activeTabID: string, overTabID: string) => void;
  closeContextPanelTab: (directory: string, tabID: string) => void;
  closeContextPanel: (directory: string) => void;
  toggleContextPanelExpanded: (directory: string) => void;
  setContextPanelWidth: (directory: string, width: number) => void;
  setPendingDiffFile: (filePath: string | null) => void;
  setPendingFileNavigation: (navigation: PendingFileNavigation | null) => void;
  setPendingFileFocusPath: (path: string | null) => void;
  navigateToDiff: (filePath: string) => void;
  consumePendingDiffFile: () => string | null;
  setSettingsPage: (slug: string) => void;
  setSettingsProjectsSelectedId: (projectId: string | null) => void;
  setSettingsRemoteInstancesSelectedId: (instanceId: string | null) => void;
  setEventStreamStatus: (status: EventStreamStatus) => void;
  setShowReasoningTraces: (value: boolean) => void;
  setChatRenderMode: (value: ChatRenderMode) => void;
  setActivityRenderMode: (value: ActivityRenderMode) => void;
  setShowDeletionDialog: (value: boolean) => void;
  setAutoDeleteEnabled: (value: boolean) => void;
  setAutoDeleteAfterDays: (days: number) => void;
  setSessionRetentionAction: (value: SessionRetentionAction) => void;
  setAutoDeleteLastRunAt: (timestamp: number | null) => void;
  setShowTerminalQuickKeysOnDesktop: (value: boolean) => void;
  setPersistChatDraft: (value: boolean) => void;
  setInputSpellcheckEnabled: (value: boolean) => void;
  setShowToolFileIcons: (value: boolean) => void;
  setShowExpandedBashTools: (value: boolean) => void;
  setShowExpandedEditTools: (value: boolean) => void;
  setTimeFormatPreference: (value: TimeFormatPreference) => void;
  setWeekStartPreference: (value: WeekStartPreference) => void;
  setMermaidRenderingMode: (value: MermaidRenderingMode) => void;
  setUserMessageRenderingMode: (value: UserMessageRenderingMode) => void;
  setStickyUserHeader: (value: boolean) => void;
  setShowMobileSessionStatusBar: (value: boolean) => void;
  setIsMobileSessionStatusBarCollapsed: (value: boolean) => void;
  toggleExpandedInput: () => void;
  setExpandedInput: (value: boolean) => void;
  setReportUsage: (value: boolean) => void;
  setShortcutOverride: (actionId: string, combo: ShortcutCombo) => void;
  clearShortcutOverride: (actionId: string) => void;
  resetAllShortcutOverrides: () => void;
}


export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({

        theme: 'system',
        contextPanelByDirectory: {},
        pendingDiffFile: null,
        pendingFileNavigation: null,
        pendingFileFocusPath: null,
        settingsPage: 'home',
        settingsProjectsSelectedId: null,
        settingsRemoteInstancesSelectedId: null,
        eventStreamStatus: 'idle',
        showReasoningTraces: true,
        chatRenderMode: 'live',
        activityRenderMode: 'summary',
        showDeletionDialog: true,
        autoDeleteEnabled: false,
        autoDeleteAfterDays: 30,
        sessionRetentionAction: 'archive',
        autoDeleteLastRunAt: null,

        showTerminalQuickKeysOnDesktop: false,
        persistChatDraft: true,
        inputSpellcheckEnabled: false,
        showToolFileIcons: true,
        showExpandedBashTools: false,
        showExpandedEditTools: false,
        timeFormatPreference: 'auto',
        weekStartPreference: 'auto',
        mermaidRenderingMode: 'svg',
        userMessageRenderingMode: 'markdown',
        stickyUserHeader: true,
        showMobileSessionStatusBar: true,
        isMobileSessionStatusBarCollapsed: false,
        isExpandedInput: false,
        reportUsage: true,
        shortcutOverrides: {},

        setTheme: (theme) => {
          set({ theme });
        },

        openContextPanelTab: (directory, tab) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: upsertContextPanelTab(current, tab),
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        openContextDiff: (directory, filePath) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedFilePath = (filePath || '').trim();
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          get().openContextPanelTab(normalizedDirectory, { mode: 'diff', targetPath: normalizedFilePath });
          get().setPendingDiffFile(normalizedFilePath);
        },

        openContextFile: (directory, filePath) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedFilePath = normalizeContextTargetPath(filePath);
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          get().openContextPanelTab(normalizedDirectory, { mode: 'file', targetPath: normalizedFilePath });
          get().setPendingFileFocusPath(normalizedFilePath);
          get().setPendingFileNavigation(null);
        },

        openContextFileAtLine: (directory, filePath, line, column) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedFilePath = normalizeContextTargetPath(filePath);
          const normalizedLine = Number.isFinite(line) ? Math.max(1, Math.trunc(line)) : 1;
          const normalizedColumn = Number.isFinite(column) ? Math.max(1, Math.trunc(column as number)) : 1;
          if (!normalizedDirectory || !normalizedFilePath) {
            return;
          }

          get().openContextPanelTab(normalizedDirectory, { mode: 'file', targetPath: normalizedFilePath });
          get().setPendingFileFocusPath(null);
          get().setPendingFileNavigation({
            path: normalizedFilePath,
            line: normalizedLine,
            column: normalizedColumn,
          });
        },

        openContextOverview: (directory) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          get().openContextPanelTab(normalizedDirectory, { mode: 'context' });
        },

        openContextPlan: (directory) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          get().openContextPanelTab(normalizedDirectory, { mode: 'plan' });
        },

        setActiveContextPanelTab: (directory, tabID) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedTabID = (tabID || '').trim();
          if (!normalizedDirectory || !normalizedTabID) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            if (!current.tabs.some((tab) => tab.id === normalizedTabID)) {
              return state;
            }

            if (current.activeTabId === normalizedTabID && current.isOpen) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: {
                ...current,
                isOpen: true,
                activeTabId: normalizedTabID,
                touchedAt: Date.now(),
                tabs: current.tabs.map((tab) => (tab.id === normalizedTabID
                  ? { ...tab, touchedAt: Date.now() }
                  : tab)),
              },
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        reorderContextPanelTabs: (directory, activeTabID, overTabID) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedActiveTabID = (activeTabID || '').trim();
          const normalizedOverTabID = (overTabID || '').trim();
          if (!normalizedDirectory || !normalizedActiveTabID || !normalizedOverTabID) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            if (!current.tabs.some((tab) => tab.id === normalizedActiveTabID) || !current.tabs.some((tab) => tab.id === normalizedOverTabID)) {
              return state;
            }

            const next = reorderContextPanelTabs(current, normalizedActiveTabID, normalizedOverTabID);
            if (next.tabs === current.tabs) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: next,
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        closeContextPanelTab: (directory, tabID) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          const normalizedTabID = (tabID || '').trim();
          if (!normalizedDirectory || !normalizedTabID) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            if (!current.tabs.some((tab) => tab.id === normalizedTabID)) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: closeContextPanelTab(current, normalizedTabID),
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        closeContextPanel: (directory) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            if (!prev || !prev.isOpen) {
              return state;
            }

            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: {
                ...touchContextPanelState(prev),
                isOpen: false,
              },
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        toggleContextPanelExpanded: (directory) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: {
                ...current,
                expanded: !current.expanded,
              },
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        setContextPanelWidth: (directory, width) => {
          const normalizedDirectory = normalizeDirectoryPath((directory || '').trim());
          if (!normalizedDirectory) {
            return;
          }

          set((state) => {
            const prev = state.contextPanelByDirectory[normalizedDirectory];
            const current = touchContextPanelState(prev);
            const byDirectory = {
              ...state.contextPanelByDirectory,
              [normalizedDirectory]: {
                ...current,
                width: clampContextPanelWidth(width),
              },
            };

            return { contextPanelByDirectory: clampContextPanelRoots(byDirectory, 20) };
          });
        },

        setPendingDiffFile: (filePath) => {
          set({ pendingDiffFile: filePath });
        },

        setPendingFileNavigation: (navigation) => {
          set({ pendingFileNavigation: navigation });
        },

        setPendingFileFocusPath: (path) => {
          set({ pendingFileFocusPath: path });
        },

        navigateToDiff: (filePath) => {
          const { mainTabGuard, setActiveMainTab } = useNavigationStore.getState();
          if (mainTabGuard && !mainTabGuard('diff')) {
            return;
          }
          set({ pendingDiffFile: filePath });
          setActiveMainTab('diff');
        },

        consumePendingDiffFile: () => {
          const { pendingDiffFile } = get();
          if (pendingDiffFile) {
            set({ pendingDiffFile: null });
          }
          return pendingDiffFile;
        },

        setSettingsPage: (slug) => {
          set({ settingsPage: slug });
        },

        setSettingsProjectsSelectedId: (projectId) => {
          set({ settingsProjectsSelectedId: projectId });
        },

        setSettingsRemoteInstancesSelectedId: (instanceId) => {
          set({ settingsRemoteInstancesSelectedId: instanceId });
        },

        setEventStreamStatus: (status) => {
          set({
            eventStreamStatus: status,
          });
        },

        setShowReasoningTraces: (value) => {
          set({ showReasoningTraces: value });
        },

        setChatRenderMode: (value) => {
          set({ chatRenderMode: value });
        },

        setActivityRenderMode: (value) => {
          set({ activityRenderMode: value });
        },

        setShowDeletionDialog: (value) => {
          set({ showDeletionDialog: value });
        },

        setAutoDeleteEnabled: (value) => {
          set({ autoDeleteEnabled: value });
        },

        setAutoDeleteAfterDays: (days) => {
          const clampedDays = Math.max(1, Math.min(365, days));
          set({ autoDeleteAfterDays: clampedDays });
        },

        setSessionRetentionAction: (value) => {
          set({ sessionRetentionAction: value });
        },

        setAutoDeleteLastRunAt: (timestamp) => {
          set({ autoDeleteLastRunAt: timestamp });
        },

        setShowTerminalQuickKeysOnDesktop: (value) => {
          set({ showTerminalQuickKeysOnDesktop: value });
        },

        setPersistChatDraft: (value) => {
          set({ persistChatDraft: value });
        },
        setInputSpellcheckEnabled: (value) => {
          set({ inputSpellcheckEnabled: value });
        },
        setShowToolFileIcons: (value) => {
          set({ showToolFileIcons: value });
        },
        setShowExpandedBashTools: (value) => {
          set({ showExpandedBashTools: value });
        },
        setShowExpandedEditTools: (value) => {
          set({ showExpandedEditTools: value });
        },

        setTimeFormatPreference: (value) => {
          set({ timeFormatPreference: value });
        },

        setWeekStartPreference: (value) => {
          set({ weekStartPreference: value });
        },
        setMermaidRenderingMode: (value) => {
          set({ mermaidRenderingMode: value });
        },
        setUserMessageRenderingMode: (value) => {
          set({ userMessageRenderingMode: value });
        },
        setStickyUserHeader: (value) => {
          set({ stickyUserHeader: value });
        },
        setShowMobileSessionStatusBar: (value) => {
          set({ showMobileSessionStatusBar: value });
        },
        setIsMobileSessionStatusBarCollapsed: (value) => {
          set({ isMobileSessionStatusBarCollapsed: value });
        },
        setReportUsage: (value) => {
          set({ reportUsage: value });
        },

        setShortcutOverride: (actionId, combo) => {
          set((state) => ({
            shortcutOverrides: {
              ...state.shortcutOverrides,
              [actionId]: combo,
            },
          }));
        },

        clearShortcutOverride: (actionId) => {
          set((state) => {
            const rest = { ...state.shortcutOverrides };
            delete rest[actionId];
            return { shortcutOverrides: rest };
          });
        },

        resetAllShortcutOverrides: () => {
          set({ shortcutOverrides: {} });
        },

        toggleExpandedInput: () => {
          set((state) => ({ isExpandedInput: !state.isExpandedInput }));
        },

        setExpandedInput: (value) => {
          set({ isExpandedInput: value });
        },
      }),
      {
        name: 'ui-store',
        storage: createJSONStorage(() => getSafeStorage()),
        version: 10,
        migrate: (persistedState, version) => {
          if (!persistedState || typeof persistedState !== 'object') {
            return persistedState;
          }
          const state = persistedState as Record<string, unknown>;

          // v0 -> v1: reset legacy notification templates
          if (version < 1) {
            if (isLegacyDefaultTemplates(state.notificationTemplates)) {
              state.notificationTemplates = {
                completion: { ...EMPTY_NOTIFICATION_TEMPLATES.completion },
                error: { ...EMPTY_NOTIFICATION_TEMPLATES.error },
                question: { ...EMPTY_NOTIFICATION_TEMPLATES.question },
                subtask: { ...EMPTY_NOTIFICATION_TEMPLATES.subtask },
              };
            }
          }

          // v2 -> v3: remove obsolete memory-limit fields. messageLimit was
          // removed in a later cleanup, so we just drop the legacy keys.
          if (version < 3) {
            delete state.memoryLimitHistorical;
            delete state.memoryLimitViewport;
            delete state.memoryLimitActiveSession;
          }

          if (
            typeof state.rightSidebarTab !== 'string'
            || (state.rightSidebarTab !== 'git' && state.rightSidebarTab !== 'files' && state.rightSidebarTab !== 'context')
          ) {
            state.rightSidebarTab = 'git';
          }

          state.contextPanelByDirectory = sanitizeContextPanelByDirectory(state.contextPanelByDirectory);

          if (version < 5) {
            if (!state.shortcutOverrides || typeof state.shortcutOverrides !== 'object') {
              state.shortcutOverrides = {};
            } else {
              const overrides = state.shortcutOverrides as Record<string, unknown>;
              const cleaned: Record<string, string> = {};
              for (const [key, value] of Object.entries(overrides)) {
                if (typeof key === 'string' && typeof value === 'string') {
                  cleaned[key] = value;
                }
              }
              state.shortcutOverrides = cleaned;
            }
          }

          if (version < 6) {
            state.contextPanelByDirectory = sanitizeContextPanelByDirectory(state.contextPanelByDirectory);
          }

          if (version < 7) {
            state.contextPanelByDirectory = sanitizeContextPanelByDirectory(state.contextPanelByDirectory);
          }

          // v8 -> v9: drop dead fields removed in Phase 4 audit so they don't
          // linger as inert properties on existing users' persisted state.
          if (version < 9) {
            delete state.hasManuallyResizedLeftSidebar;
            delete state.hasManuallyResizedRightSidebar;
            delete state.sidebarOpenBeforeFullscreenTab;
            delete state.sidebarSection;
            delete state.settingsHasOpenedOnce;
            delete state.eventStreamHint;
            delete state.messageLimit;
            delete state.recentAgents;
            delete state.viewPagerPage;
          }

          return state;
        },
        partialize: (state) => ({
          theme: state.theme,
          contextPanelByDirectory: state.contextPanelByDirectory,
          settingsPage: state.settingsPage,
          settingsProjectsSelectedId: state.settingsProjectsSelectedId,
          settingsRemoteInstancesSelectedId: state.settingsRemoteInstancesSelectedId,
          showReasoningTraces: state.showReasoningTraces,
          chatRenderMode: state.chatRenderMode,
          activityRenderMode: state.activityRenderMode,
          showDeletionDialog: state.showDeletionDialog,
          autoDeleteEnabled: state.autoDeleteEnabled,
          autoDeleteAfterDays: state.autoDeleteAfterDays,
          sessionRetentionAction: state.sessionRetentionAction,
          autoDeleteLastRunAt: state.autoDeleteLastRunAt,
          showTerminalQuickKeysOnDesktop: state.showTerminalQuickKeysOnDesktop,
          persistChatDraft: state.persistChatDraft,
          inputSpellcheckEnabled: state.inputSpellcheckEnabled,
          showToolFileIcons: state.showToolFileIcons,
          showExpandedBashTools: state.showExpandedBashTools,
          showExpandedEditTools: state.showExpandedEditTools,
          timeFormatPreference: state.timeFormatPreference,
          weekStartPreference: state.weekStartPreference,
          mermaidRenderingMode: state.mermaidRenderingMode,
          userMessageRenderingMode: state.userMessageRenderingMode,
          stickyUserHeader: state.stickyUserHeader,
          showMobileSessionStatusBar: state.showMobileSessionStatusBar,
          isMobileSessionStatusBarCollapsed: state.isMobileSessionStatusBarCollapsed,
          shortcutOverrides: state.shortcutOverrides,
        })
      }
    ),
    {
      name: 'ui-store'
    }
  )
);
