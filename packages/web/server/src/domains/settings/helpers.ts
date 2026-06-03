/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SettingsHelpersDeps, SettingsHelpers } from "./types.js";

export function createSettingsHelpers(deps: SettingsHelpersDeps): SettingsHelpers {
  const {
    normalizePathForPersistence,
    normalizeDirectoryPath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  } = deps;

  const PWA_APP_NAME_MAX_LENGTH = 64;
  const PWA_ORIENTATION_VALUES = new Set(["system", "portrait", "landscape"]);

  const normalizePwaAppName = (value: unknown, fallback = ""): string => {
    if (typeof value !== "string") {
      return fallback;
    }
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
      return fallback;
    }
    return normalized.slice(0, PWA_APP_NAME_MAX_LENGTH);
  };

  const normalizePwaOrientation = (value: unknown, fallback = "system"): string => {
    if (typeof value !== "string") {
      return fallback;
    }
    const normalized = value.trim();
    if (PWA_ORIENTATION_VALUES.has(normalized)) {
      return normalized;
    }
    return fallback;
  };

  const sanitizeSettingsUpdate = (payload: any): any => {
    if (!payload || typeof payload !== "object") {
      return {};
    }

    const candidate = payload as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    if (typeof candidate.themeId === "string" && candidate.themeId.length > 0) {
      result.themeId = candidate.themeId;
    }
    if (typeof candidate.themeVariant === "string" && (candidate.themeVariant === "light" || candidate.themeVariant === "dark")) {
      result.themeVariant = candidate.themeVariant;
    }
    if (typeof candidate.useSystemTheme === "boolean") {
      result.useSystemTheme = candidate.useSystemTheme;
    }
    if (typeof candidate.lightThemeId === "string" && candidate.lightThemeId.length > 0) {
      result.lightThemeId = candidate.lightThemeId;
    }
    if (typeof candidate.darkThemeId === "string" && candidate.darkThemeId.length > 0) {
      result.darkThemeId = candidate.darkThemeId;
    }
    if (typeof candidate.splashBgLight === "string" && candidate.splashBgLight.trim().length > 0) {
      result.splashBgLight = (candidate.splashBgLight as string).trim();
    }
    if (typeof candidate.splashFgLight === "string" && candidate.splashFgLight.trim().length > 0) {
      result.splashFgLight = (candidate.splashFgLight as string).trim();
    }
    if (typeof candidate.splashBgDark === "string" && candidate.splashBgDark.trim().length > 0) {
      result.splashBgDark = (candidate.splashBgDark as string).trim();
    }
    if (typeof candidate.splashFgDark === "string" && candidate.splashFgDark.trim().length > 0) {
      result.splashFgDark = (candidate.splashFgDark as string).trim();
    }
    if (typeof candidate.lastDirectory === "string" && candidate.lastDirectory.length > 0) {
      const normalized = normalizePathForPersistence(candidate.lastDirectory);
      if (typeof normalized === "string" && normalized.length > 0) {
        result.lastDirectory = normalized;
      }
    }
    if (typeof candidate.homeDirectory === "string" && candidate.homeDirectory.length > 0) {
      const normalized = normalizePathForPersistence(candidate.homeDirectory);
      if (typeof normalized === "string" && normalized.length > 0) {
        result.homeDirectory = normalized;
      }
    }

    // Absolute path to the opencode CLI binary (optional override).
    // Accept empty-string to clear (we persist an empty string sentinel so the running
    // process can reliably drop a previously applied OPENCODE_BINARY override).
    if (typeof candidate.opencodeBinary === "string") {
      const normalized = (normalizeDirectoryPath(candidate.opencodeBinary) as string).trim();
      result.opencodeBinary = normalized;
    }
    if (typeof candidate.desktopLanAccessEnabled === "boolean") {
      result.desktopLanAccessEnabled = candidate.desktopLanAccessEnabled;
    }
    if (Array.isArray(candidate.projects)) {
      const projects = sanitizeProjects(candidate.projects);
      if (projects) {
        result.projects = projects;
      }
    }
    if (typeof candidate.activeProjectId === "string" && candidate.activeProjectId.length > 0) {
      result.activeProjectId = candidate.activeProjectId;
    }

    if (Array.isArray(candidate.approvedDirectories)) {
      result.approvedDirectories = normalizeStringArray(
        (candidate.approvedDirectories as unknown[])
          .map((entry) => (typeof entry === "string" ? normalizePathForPersistence(entry) : entry))
          .filter((entry) => typeof entry === "string" && (entry as string).length > 0),
      );
    }
    if (Array.isArray(candidate.securityScopedBookmarks)) {
      result.securityScopedBookmarks = normalizeStringArray(candidate.securityScopedBookmarks as unknown[]);
    }
    if (Array.isArray(candidate.pinnedDirectories)) {
      result.pinnedDirectories = normalizeStringArray(
        (candidate.pinnedDirectories as unknown[])
          .map((entry) => (typeof entry === "string" ? normalizePathForPersistence(entry) : entry))
          .filter((entry) => typeof entry === "string" && (entry as string).length > 0),
      );
    }

    if (typeof candidate.uiFont === "string" && candidate.uiFont.length > 0) {
      result.uiFont = candidate.uiFont;
    }
    if (typeof candidate.monoFont === "string" && candidate.monoFont.length > 0) {
      result.monoFont = candidate.monoFont;
    }
    if (typeof candidate.markdownDisplayMode === "string" && candidate.markdownDisplayMode.length > 0) {
      result.markdownDisplayMode = candidate.markdownDisplayMode;
    }
    if (typeof candidate.githubClientId === "string") {
      const trimmed = (candidate.githubClientId as string).trim();
      if (trimmed.length > 0) {
        result.githubClientId = trimmed;
      }
    }
    if (typeof candidate.githubScopes === "string") {
      const trimmed = (candidate.githubScopes as string).trim();
      if (trimmed.length > 0) {
        result.githubScopes = trimmed;
      }
    }
    if (typeof candidate.showReasoningTraces === "boolean") {
      result.showReasoningTraces = candidate.showReasoningTraces;
    }
    if (typeof candidate.showTextJustificationActivity === "boolean") {
      result.showTextJustificationActivity = candidate.showTextJustificationActivity;
    }
    if (typeof candidate.showDeletionDialog === "boolean") {
      result.showDeletionDialog = candidate.showDeletionDialog;
    }
    if (typeof candidate.nativeNotificationsEnabled === "boolean") {
      result.nativeNotificationsEnabled = candidate.nativeNotificationsEnabled;
    }
    if (typeof candidate.notificationMode === "string") {
      const mode = (candidate.notificationMode as string).trim();
      if (mode === "always" || mode === "hidden-only") {
        result.notificationMode = mode;
      }
    }
    if (typeof candidate.notifyOnSubtasks === "boolean") {
      result.notifyOnSubtasks = candidate.notifyOnSubtasks;
    }
    if (typeof candidate.notifyOnCompletion === "boolean") {
      result.notifyOnCompletion = candidate.notifyOnCompletion;
    }
    if (typeof candidate.notifyOnError === "boolean") {
      result.notifyOnError = candidate.notifyOnError;
    }
    if (typeof candidate.notifyOnQuestion === "boolean") {
      result.notifyOnQuestion = candidate.notifyOnQuestion;
    }
    if (candidate.notificationTemplates && typeof candidate.notificationTemplates === "object") {
      result.notificationTemplates = candidate.notificationTemplates;
    }
    if (typeof candidate.summarizeLastMessage === "boolean") {
      result.summarizeLastMessage = candidate.summarizeLastMessage;
    }
    if (typeof candidate.summaryThreshold === "number" && Number.isFinite(candidate.summaryThreshold as number)) {
      result.summaryThreshold = Math.max(0, Math.round(candidate.summaryThreshold as number));
    }
    if (typeof candidate.summaryLength === "number" && Number.isFinite(candidate.summaryLength as number)) {
      result.summaryLength = Math.max(10, Math.round(candidate.summaryLength as number));
    }
    if (typeof candidate.maxLastMessageLength === "number" && Number.isFinite(candidate.maxLastMessageLength as number)) {
      result.maxLastMessageLength = Math.max(10, Math.round(candidate.maxLastMessageLength as number));
    }
    if (typeof candidate.usageAutoRefresh === "boolean") {
      result.usageAutoRefresh = candidate.usageAutoRefresh;
    }
    if (typeof candidate.usageRefreshIntervalMs === "number" && Number.isFinite(candidate.usageRefreshIntervalMs as number)) {
      result.usageRefreshIntervalMs = Math.max(30000, Math.min(300000, Math.round(candidate.usageRefreshIntervalMs as number)));
    }
    if (candidate.usageDisplayMode === "usage" || candidate.usageDisplayMode === "remaining") {
      result.usageDisplayMode = candidate.usageDisplayMode;
    }
    if (Array.isArray(candidate.usageDropdownProviders)) {
      result.usageDropdownProviders = normalizeStringArray(candidate.usageDropdownProviders as unknown[]);
    }
    if (typeof candidate.autoDeleteEnabled === "boolean") {
      result.autoDeleteEnabled = candidate.autoDeleteEnabled;
    }
    if (typeof candidate.autoDeleteAfterDays === "number" && Number.isFinite(candidate.autoDeleteAfterDays as number)) {
      const normalizedDays = Math.max(1, Math.min(365, Math.round(candidate.autoDeleteAfterDays as number)));
      result.autoDeleteAfterDays = normalizedDays;
    }
    const typography = sanitizeTypographySizesPartial(candidate.typographySizes);
    if (typography) {
      result.typographySizes = typography;
    }

    if (typeof candidate.defaultModel === "string") {
      const trimmed = (candidate.defaultModel as string).trim();
      result.defaultModel = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.defaultVariant === "string") {
      const trimmed = (candidate.defaultVariant as string).trim();
      result.defaultVariant = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.defaultAgent === "string") {
      const trimmed = (candidate.defaultAgent as string).trim();
      result.defaultAgent = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.defaultGitIdentityId === "string") {
      const trimmed = (candidate.defaultGitIdentityId as string).trim();
      result.defaultGitIdentityId = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.queueModeEnabled === "boolean") {
      result.queueModeEnabled = candidate.queueModeEnabled;
    }
    if (typeof candidate.autoCreateWorktree === "boolean") {
      result.autoCreateWorktree = candidate.autoCreateWorktree;
    }
    if (typeof candidate.gitmojiEnabled === "boolean") {
      result.gitmojiEnabled = candidate.gitmojiEnabled;
    }
    if (typeof candidate.defaultFileViewerPreview === "boolean") {
      result.defaultFileViewerPreview = candidate.defaultFileViewerPreview;
    }
    if (typeof candidate.zenModel === "string") {
      const trimmed = (candidate.zenModel as string).trim();
      result.zenModel = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.gitProviderId === "string") {
      const trimmed = (candidate.gitProviderId as string).trim();
      result.gitProviderId = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.gitModelId === "string") {
      const trimmed = (candidate.gitModelId as string).trim();
      result.gitModelId = trimmed.length > 0 ? trimmed : undefined;
    }
    if (typeof candidate.pwaAppName === "string") {
      result.pwaAppName = normalizePwaAppName(candidate.pwaAppName, undefined);
    }
    if (typeof candidate.pwaOrientation === "string") {
      result.pwaOrientation = normalizePwaOrientation(candidate.pwaOrientation, undefined);
    }
    if (typeof candidate.toolCallExpansion === "string") {
      const mode = (candidate.toolCallExpansion as string).trim();
      if (mode === "collapsed" || mode === "activity" || mode === "detailed" || mode === "changes") {
        result.toolCallExpansion = mode;
      }
    }
    if (typeof candidate.inputSpellcheckEnabled === "boolean") {
      result.inputSpellcheckEnabled = candidate.inputSpellcheckEnabled;
    }
    if (typeof candidate.showToolFileIcons === "boolean") {
      result.showToolFileIcons = candidate.showToolFileIcons;
    }
    if (typeof candidate.showExpandedBashTools === "boolean") {
      result.showExpandedBashTools = candidate.showExpandedBashTools;
    }
    if (typeof candidate.showExpandedEditTools === "boolean") {
      result.showExpandedEditTools = candidate.showExpandedEditTools;
    }
    if (typeof candidate.timeFormatPreference === "string") {
      const mode = (candidate.timeFormatPreference as string).trim();
      if (mode === "auto" || mode === "12h" || mode === "24h") {
        result.timeFormatPreference = mode;
      }
    }
    if (typeof candidate.weekStartPreference === "string") {
      const mode = (candidate.weekStartPreference as string).trim();
      if (mode === "auto" || mode === "sunday" || mode === "monday") {
        result.weekStartPreference = mode;
      }
    }
    if (typeof candidate.chatRenderMode === "string") {
      const mode = (candidate.chatRenderMode as string).trim();
      if (mode === "sorted" || mode === "live") {
        result.chatRenderMode = mode;
      }
    }
    if (typeof candidate.messageStreamTransport === "string") {
      const mode = (candidate.messageStreamTransport as string).trim();
      if (mode === "auto" || mode === "ws" || mode === "sse") {
        result.messageStreamTransport = mode;
      }
    }
    if (typeof candidate.activityRenderMode === "string") {
      const mode = (candidate.activityRenderMode as string).trim();
      if (mode === "collapsed" || mode === "summary") {
        result.activityRenderMode = mode;
      }
    }
    if (typeof candidate.mermaidRenderingMode === "string") {
      const mode = (candidate.mermaidRenderingMode as string).trim();
      if (mode === "svg" || mode === "ascii") {
        result.mermaidRenderingMode = mode;
      }
    }
    if (typeof candidate.userMessageRenderingMode === "string") {
      const mode = (candidate.userMessageRenderingMode as string).trim();
      if (mode === "markdown" || mode === "plain") {
        result.userMessageRenderingMode = mode;
      }
    }
    if (typeof candidate.stickyUserHeader === "boolean") {
      result.stickyUserHeader = candidate.stickyUserHeader;
    }
    if (typeof candidate.fontSize === "number" && Number.isFinite(candidate.fontSize as number)) {
      result.fontSize = Math.max(50, Math.min(200, Math.round(candidate.fontSize as number)));
    }
    if (typeof candidate.terminalFontSize === "number" && Number.isFinite(candidate.terminalFontSize as number)) {
      result.terminalFontSize = Math.max(9, Math.min(52, Math.round(candidate.terminalFontSize as number)));
    }
    if (typeof candidate.padding === "number" && Number.isFinite(candidate.padding as number)) {
      result.padding = Math.max(50, Math.min(200, Math.round(candidate.padding as number)));
    }
    if (typeof candidate.cornerRadius === "number" && Number.isFinite(candidate.cornerRadius as number)) {
      result.cornerRadius = Math.max(0, Math.min(32, Math.round(candidate.cornerRadius as number)));
    }
    if (typeof candidate.inputBarOffset === "number" && Number.isFinite(candidate.inputBarOffset as number)) {
      result.inputBarOffset = Math.max(0, Math.min(100, Math.round(candidate.inputBarOffset as number)));
    }

    const favoriteModels = sanitizeModelRefs(candidate.favoriteModels, 64);
    if (favoriteModels) {
      result.favoriteModels = favoriteModels;
    }

    const recentModels = sanitizeModelRefs(candidate.recentModels, 16);
    if (recentModels) {
      result.recentModels = recentModels;
    }
    if (typeof candidate.diffLayoutPreference === "string") {
      const mode = (candidate.diffLayoutPreference as string).trim();
      if (mode === "dynamic" || mode === "inline" || mode === "side-by-side") {
        result.diffLayoutPreference = mode;
      }
    }
    if (typeof candidate.diffViewMode === "string") {
      const mode = (candidate.diffViewMode as string).trim();
      if (mode === "single" || mode === "stacked") {
        result.diffViewMode = mode;
      }
    }
    if (typeof candidate.gitChangesViewMode === "string") {
      const mode = (candidate.gitChangesViewMode as string).trim();
      if (mode === "flat" || mode === "tree") {
        result.gitChangesViewMode = mode;
      }
    }
    if (typeof candidate.directoryShowHidden === "boolean") {
      result.directoryShowHidden = candidate.directoryShowHidden;
    }
    if (typeof candidate.filesViewShowGitignored === "boolean") {
      result.filesViewShowGitignored = candidate.filesViewShowGitignored;
    }
    if (typeof candidate.openInAppId === "string") {
      const trimmed = (candidate.openInAppId as string).trim();
      if (trimmed.length > 0) {
        result.openInAppId = trimmed;
      }
    }

    // Message limit — single setting for fetch / trim / Load More chunk
    if (typeof candidate.messageLimit === "number" && Number.isFinite(candidate.messageLimit as number)) {
      result.messageLimit = Math.max(10, Math.min(500, Math.round(candidate.messageLimit as number)));
    }

    const skillCatalogs = sanitizeSkillCatalogs(candidate.skillCatalogs);
    if (skillCatalogs) {
      result.skillCatalogs = skillCatalogs;
    }

    // Usage model selections - which models appear in dropdown
    if (candidate.usageSelectedModels && typeof candidate.usageSelectedModels === "object") {
      const sanitized: Record<string, string[]> = {};
      for (const [providerId, models] of Object.entries(candidate.usageSelectedModels as Record<string, unknown>)) {
        if (typeof providerId === "string" && Array.isArray(models)) {
          const validModels = (models as unknown[]).filter((m) => typeof m === "string" && (m as string).length > 0);
          if (validModels.length > 0) {
            sanitized[providerId] = validModels as string[];
          }
        }
      }
      if (Object.keys(sanitized).length > 0) {
        result.usageSelectedModels = sanitized;
      }
    }

    // Usage page collapsed families - for "Other Models" section
    if (candidate.usageCollapsedFamilies && typeof candidate.usageCollapsedFamilies === "object") {
      const sanitized: Record<string, string[]> = {};
      for (const [providerId, families] of Object.entries(candidate.usageCollapsedFamilies as Record<string, unknown>)) {
        if (typeof providerId === "string" && Array.isArray(families)) {
          const validFamilies = (families as unknown[]).filter((f) => typeof f === "string" && (f as string).length > 0);
          if (validFamilies.length > 0) {
            sanitized[providerId] = validFamilies as string[];
          }
        }
      }
      if (Object.keys(sanitized).length > 0) {
        result.usageCollapsedFamilies = sanitized;
      }
    }

    // Header dropdown expanded families (inverted - stores EXPANDED, default all collapsed)
    if (candidate.usageExpandedFamilies && typeof candidate.usageExpandedFamilies === "object") {
      const sanitized: Record<string, string[]> = {};
      for (const [providerId, families] of Object.entries(candidate.usageExpandedFamilies as Record<string, unknown>)) {
        if (typeof providerId === "string" && Array.isArray(families)) {
          const validFamilies = (families as unknown[]).filter((f) => typeof f === "string" && (f as string).length > 0);
          if (validFamilies.length > 0) {
            sanitized[providerId] = validFamilies as string[];
          }
        }
      }
      if (Object.keys(sanitized).length > 0) {
        result.usageExpandedFamilies = sanitized;
      }
    }

    // Custom model groups configuration
    if (candidate.usageModelGroups && typeof candidate.usageModelGroups === "object") {
      const sanitized: Record<string, any> = {};
      for (const [providerId, config] of Object.entries(candidate.usageModelGroups as Record<string, unknown>)) {
        if (typeof providerId !== "string") continue;

        const providerConfig: Record<string, unknown> = {};

        // customGroups: array of {id, label, models, order}
        if (Array.isArray((config as any).customGroups)) {
          const validGroups = ((config as any).customGroups as any[])
            .filter((g: any) => g && typeof g.id === "string" && typeof g.label === "string")
            .map((g: any) => ({
              id: (g.id as string).slice(0, 64),
              label: (g.label as string).slice(0, 128),
              models: Array.isArray(g.models)
                ? (g.models as string[]).filter((m: unknown) => typeof m === "string").slice(0, 500)
                : [],
              order: typeof g.order === "number" ? g.order : 0,
            }));
          if (validGroups.length > 0) {
            providerConfig.customGroups = validGroups;
          }
        }

        // modelAssignments: Record<modelName, groupId>
        if ((config as any).modelAssignments && typeof (config as any).modelAssignments === "object") {
          const assignments: Record<string, string> = {};
          for (const [model, groupId] of Object.entries((config as any).modelAssignments as Record<string, unknown>)) {
            if (typeof model === "string" && typeof groupId === "string") {
              assignments[model] = groupId;
            }
          }
          if (Object.keys(assignments).length > 0) {
            providerConfig.modelAssignments = assignments;
          }
        }

        // renamedGroups: Record<groupId, label>
        if ((config as any).renamedGroups && typeof (config as any).renamedGroups === "object") {
          const renamed: Record<string, string> = {};
          for (const [groupId, label] of Object.entries((config as any).renamedGroups as Record<string, unknown>)) {
            if (typeof groupId === "string" && typeof label === "string") {
              renamed[groupId] = (label as string).slice(0, 128);
            }
          }
          if (Object.keys(renamed).length > 0) {
            providerConfig.renamedGroups = renamed;
          }
        }

        if (Object.keys(providerConfig).length > 0) {
          sanitized[providerId] = providerConfig;
        }
      }
      if (Object.keys(sanitized).length > 0) {
        result.usageModelGroups = sanitized;
      }
    }

    // Usage reporting opt-out (default: true/enabled)
    if (typeof candidate.reportUsage === "boolean") {
      result.reportUsage = candidate.reportUsage;
    }

    return result;
  };

  const mergePersistedSettings = (current: any, changes: any): any => {
    const baseApproved = Array.isArray(changes.approvedDirectories)
      ? changes.approvedDirectories
      : Array.isArray(current.approvedDirectories)
        ? current.approvedDirectories
        : [];

    const additionalApproved: string[] = [];
    if (typeof changes.lastDirectory === "string" && changes.lastDirectory.length > 0) {
      additionalApproved.push(changes.lastDirectory);
    }
    if (typeof changes.homeDirectory === "string" && changes.homeDirectory.length > 0) {
      additionalApproved.push(changes.homeDirectory);
    }
    const projectEntries = Array.isArray(changes.projects)
      ? changes.projects
      : Array.isArray(current.projects)
        ? current.projects
        : [];
    (projectEntries as any[]).forEach((project) => {
      if (project && typeof project.path === "string" && project.path.length > 0) {
        additionalApproved.push(project.path);
      }
    });
    const approvedSource = [...baseApproved, ...additionalApproved];

    const baseBookmarks = Array.isArray(changes.securityScopedBookmarks)
      ? changes.securityScopedBookmarks
      : Array.isArray(current.securityScopedBookmarks)
        ? current.securityScopedBookmarks
        : [];

    const nextTypographySizes = changes.typographySizes
      ? {
          ...(current.typographySizes || {}),
          ...changes.typographySizes,
        }
      : current.typographySizes;

    const next = {
      ...current,
      ...changes,
      approvedDirectories: Array.from(
        new Set(
          (approvedSource as string[]).filter((entry) => typeof entry === "string" && entry.length > 0),
        ),
      ),
      securityScopedBookmarks: Array.from(
        new Set(
          (baseBookmarks as string[]).filter((entry) => typeof entry === "string" && entry.length > 0),
        ),
      ),
      typographySizes: nextTypographySizes,
    };

    return next;
  };

  const formatSettingsResponse = (settings: any): any => {
    const sanitized = sanitizeSettingsUpdate(settings);
    const approved = normalizeStringArray(settings?.approvedDirectories);
    const bookmarks = normalizeStringArray(settings?.securityScopedBookmarks);
    const pwaAppName = normalizePwaAppName(settings?.pwaAppName, "");
    const pwaOrientation = normalizePwaOrientation(settings?.pwaOrientation, "system");

    return {
      ...sanitized,
      ...(pwaAppName ? { pwaAppName } : {}),
      pwaOrientation,
      approvedDirectories: approved,
      securityScopedBookmarks: bookmarks,
      pinnedDirectories: normalizeStringArray(settings?.pinnedDirectories),
      typographySizes: sanitizeTypographySizesPartial(settings?.typographySizes),
      showReasoningTraces:
        typeof settings.showReasoningTraces === "boolean"
          ? settings.showReasoningTraces
          : typeof sanitized.showReasoningTraces === "boolean"
            ? sanitized.showReasoningTraces
            : false,
    };
  };

  return {
    normalizePwaAppName,
    normalizePwaOrientation,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    formatSettingsResponse,
  };
}