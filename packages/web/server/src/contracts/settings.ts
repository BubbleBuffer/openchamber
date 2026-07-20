import { parseJsonObject, type ParseResult } from "./common.js";

export const SETTINGS_ERROR_CODES = ["settings_invalid_request", "settings_invalid_response", "settings_write_failed"] as const;
export type SkillCatalogConfig = { id: string; label: string; source: string; subpath?: string; gitIdentityId?: string };
export type AppSettings = Record<string, unknown>;
export type PersistedSettings = AppSettings & { publicOrigin?: string; vapidKeys?: Record<string, unknown> };

// One inventory governs persisted sanitization. serverOnly fields never cross GET/PUT.
export const SETTINGS_FIELDS = [
  "themeId", "useSystemTheme", "themeVariant", "lightThemeId", "darkThemeId", "splashBgLight", "splashFgLight", "splashBgDark", "splashFgDark", "lastDirectory", "homeDirectory", "opencodeBinary", "projects", "activeProjectId", "pinnedDirectories", "uiFont", "monoFont", "markdownDisplayMode", "githubClientId", "githubScopes", "showReasoningTraces", "showTextJustificationActivity", "showDeletionDialog", "nativeNotificationsEnabled", "notificationMode", "notifyOnSubtasks", "notifyOnCompletion", "notifyOnError", "notifyOnQuestion", "notificationTemplates", "summarizeLastMessage", "summaryThreshold", "summaryLength", "maxLastMessageLength", "usageAutoRefresh", "usageRefreshIntervalMs", "usageDisplayMode", "usageDropdownProviders", "usageSelectedModels", "usageCollapsedFamilies", "usageExpandedFamilies", "usageModelGroups", "autoDeleteEnabled", "autoDeleteAfterDays", "sessionRetentionAction", "defaultModel", "defaultVariant", "defaultAgent", "defaultGitIdentityId", "autoCreateWorktree", "queueModeEnabled", "gitmojiEnabled", "defaultFileViewerPreview", "zenModel", "gitProviderId", "gitModelId", "pwaAppName", "pwaOrientation", "toolCallExpansion", "inputSpellcheckEnabled", "showToolFileIcons", "showExpandedBashTools", "showExpandedEditTools", "timeFormatPreference", "weekStartPreference", "chatRenderMode", "messageStreamTransport", "activityRenderMode", "mermaidRenderingMode", "userMessageRenderingMode", "stickyUserHeader", "fontSize", "terminalFontSize", "padding", "cornerRadius", "inputBarOffset", "favoriteModels", "recentModels", "diffLayoutPreference", "diffViewMode", "gitChangesViewMode", "directoryShowHidden", "filesViewShowGitignored", "messageLimit", "skillCatalogs", "reportUsage", "typographySizes",
] as const;
const SERVER_ONLY_FIELDS = ["publicOrigin", "vapidKeys"] as const;
const fields = new Set<string>(SETTINGS_FIELDS);
const serverOnly = new Set<string>(SERVER_ONLY_FIELDS);
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const isSerializable = (value: unknown): boolean => value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value) || (typeof value === "object" && value !== null);

export function parsePersistedSettings(value: unknown): ParseResult<PersistedSettings> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const result: PersistedSettings = {};
  for (const [key, entry] of Object.entries(object.value)) if ((fields.has(key) || serverOnly.has(key)) && isSerializable(entry)) result[key] = entry;
  return { ok: true, value: result };
}
export function parseAppSettingsResponse(value: unknown): ParseResult<AppSettings> {
  const persisted = parsePersistedSettings(value); if (!persisted.ok) return persisted;
  const settings: AppSettings = {};
  for (const [key, entry] of Object.entries(persisted.value)) {
    if (serverOnly.has(key)) continue;
    if (key.endsWith("Id") || key.endsWith("Mode") || key.endsWith("Font") || key === "pwaAppName" || key === "githubScopes" || key === "opencodeBinary") {
      if (typeof entry !== "string") return invalid(`invalid ${key}`);
    }
    settings[key] = entry;
  }
  return { ok: true, value: settings };
}
export const parseSettingsUpdateRequest = parseAppSettingsResponse;
