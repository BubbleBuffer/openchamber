export type ContextPanelMode = 'diff' | 'file' | 'context' | 'plan' | 'chat';

export type ContextPanelTab = {
  id: string;
  mode: ContextPanelMode;
  targetPath: string | null;
  dedupeKey: string;
  label: string | null;
  touchedAt: number;
};

export type ContextPanelTabDescriptor = {
  mode: ContextPanelMode;
  targetPath?: string | null;
  dedupeKey?: string | null;
  label?: string | null;
};

export type ContextPanelDirectoryState = {
  isOpen: boolean;
  expanded: boolean;
  tabs: ContextPanelTab[];
  activeTabId: string | null;
  width: number;
  touchedAt: number;
};

export type PendingFileNavigation = {
  path: string;
  line: number;
  column: number;
};

export const CONTEXT_PANEL_DEFAULT_WIDTH = 600;
export const CONTEXT_PANEL_MIN_WIDTH = 360;
export const CONTEXT_PANEL_MAX_WIDTH = 1400;
export const CONTEXT_PANEL_MAX_TABS = 12;
export const CONTEXT_PANEL_MAX_LABEL_LENGTH = 120;

export const normalizeDirectoryPath = (value: string): string => {
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

export const clampContextPanelWidth = (width: number): number => {
  if (!Number.isFinite(width)) {
    return CONTEXT_PANEL_DEFAULT_WIDTH;
  }

  return Math.min(CONTEXT_PANEL_MAX_WIDTH, Math.max(CONTEXT_PANEL_MIN_WIDTH, Math.round(width)));
};

export const normalizeContextTargetPath = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\\/g, '/');
};

export const normalizeContextTabLabel = (value: string | null | undefined): string | null => {
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

export const buildDefaultContextPanelTabDedupeKey = (mode: ContextPanelMode, targetPath: string | null): string => {
  if (mode === 'file') {
    return targetPath || mode;
  }

  return mode;
};

export const normalizeContextPanelTabDedupeKey = (
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

export const buildContextPanelTabID = (mode: ContextPanelMode, dedupeKey: string): string => {
  return dedupeKey === mode ? mode : `${mode}:${dedupeKey}`;
};

export const createContextPanelTab = (descriptor: ContextPanelTabDescriptor): ContextPanelTab => {
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

export const clampContextPanelTabs = (tabs: ContextPanelTab[], maxTabs: number, activeTabId: string | null): ContextPanelTab[] => {
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

export const sanitizeContextPanelTabs = (tabs: unknown): ContextPanelTab[] => {
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

export const resolveActiveContextPanelTabID = (tabs: ContextPanelTab[], activeTabId: string | null): string | null => {
  if (activeTabId && tabs.some((tab) => tab.id === activeTabId)) {
    return activeTabId;
  }

  if (tabs.length === 0) {
    return null;
  }

  return tabs[tabs.length - 1].id;
};

export const touchContextPanelState = (prev?: ContextPanelDirectoryState): ContextPanelDirectoryState => {
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

export const upsertContextPanelTab = (
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

export const closeContextPanelTab = (
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

export const reorderContextPanelTabs = (
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

export const sanitizeContextPanelByDirectory = (
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

export const clampContextPanelRoots = (
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
