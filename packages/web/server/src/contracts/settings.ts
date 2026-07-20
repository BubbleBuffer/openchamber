import { parseJsonObject, type ParseResult } from "./common.js";

export const SETTINGS_ERROR_CODES = ["settings_invalid_request", "settings_invalid_response", "settings_write_failed"] as const;
export type SkillCatalogConfig = { id: string; label: string; source: string; subpath?: string; gitIdentityId?: string };
export type ProjectEntry = { id: string; path: string; label?: string | null; icon?: string | null; color?: string | null; addedAt?: number; lastOpenedAt?: number; sidebarCollapsed?: boolean };
export interface AppSettings {
  themeId?: string; useSystemTheme?: boolean; themeVariant?: "light" | "dark"; lightThemeId?: string; darkThemeId?: string;
  splashBgLight?: string; splashFgLight?: string; splashBgDark?: string; splashFgDark?: string; lastDirectory?: string; homeDirectory?: string; opencodeBinary?: string;
  projects?: ProjectEntry[]; activeProjectId?: string; pinnedDirectories?: string[]; uiFont?: string; monoFont?: string; markdownDisplayMode?: string; githubClientId?: string; githubScopes?: string;
  showReasoningTraces?: boolean; showTextJustificationActivity?: boolean; showDeletionDialog?: boolean; nativeNotificationsEnabled?: boolean; notificationMode?: "always" | "hidden-only";
  notifyOnSubtasks?: boolean; notifyOnCompletion?: boolean; notifyOnError?: boolean; notifyOnQuestion?: boolean;
  notificationTemplates?: { completion: { title: string; message: string }; error: { title: string; message: string }; question: { title: string; message: string }; subtask: { title: string; message: string } };
  summarizeLastMessage?: boolean; summaryThreshold?: number; summaryLength?: number; maxLastMessageLength?: number; usageAutoRefresh?: boolean; usageRefreshIntervalMs?: number; usageDisplayMode?: "usage" | "remaining";
  usageDropdownProviders?: string[]; usageSelectedModels?: Record<string, string[]>; usageCollapsedFamilies?: Record<string, string[]>; usageExpandedFamilies?: Record<string, string[]>;
  usageModelGroups?: Record<string, { customGroups?: Array<{ id: string; label: string; models: string[]; order: number }>; modelAssignments?: Record<string, string>; renamedGroups?: Record<string, string> }>;
  autoDeleteEnabled?: boolean; autoDeleteAfterDays?: number; sessionRetentionAction?: "archive" | "delete"; defaultModel?: string; defaultVariant?: string; defaultAgent?: string; defaultGitIdentityId?: string;
  autoCreateWorktree?: boolean; queueModeEnabled?: boolean; gitmojiEnabled?: boolean; defaultFileViewerPreview?: boolean; zenModel?: string; gitProviderId?: string; gitModelId?: string;
  pwaAppName?: string; pwaOrientation?: "system" | "portrait" | "landscape"; toolCallExpansion?: "collapsed" | "activity" | "detailed" | "changes";
  inputSpellcheckEnabled?: boolean; showToolFileIcons?: boolean; showExpandedBashTools?: boolean; showExpandedEditTools?: boolean; timeFormatPreference?: "auto" | "12h" | "24h"; weekStartPreference?: "auto" | "sunday" | "monday";
  chatRenderMode?: "sorted" | "live"; messageStreamTransport?: "auto" | "ws" | "sse"; activityRenderMode?: "collapsed" | "summary"; mermaidRenderingMode?: "svg" | "ascii"; userMessageRenderingMode?: "markdown" | "plain"; stickyUserHeader?: boolean;
  fontSize?: number; terminalFontSize?: number; padding?: number; cornerRadius?: number; inputBarOffset?: number; favoriteModels?: Array<{ providerID: string; modelID: string }>; recentModels?: Array<{ providerID: string; modelID: string }>;
  diffLayoutPreference?: "dynamic" | "inline" | "side-by-side"; diffViewMode?: "single" | "stacked"; gitChangesViewMode?: "flat" | "tree"; directoryShowHidden?: boolean; filesViewShowGitignored?: boolean; messageLimit?: number; skillCatalogs?: SkillCatalogConfig[]; reportUsage?: boolean; typographySizes?: Record<string, number>;
}
export interface PersistedSettings extends AppSettings { publicOrigin?: string; vapidKeys?: { publicKey: string; privateKey: string } }

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
  for (const [key, entry] of Object.entries(object.value)) if ((fields.has(key) || serverOnly.has(key)) && isSerializable(entry)) (result as Record<string, unknown>)[key] = entry;
  if (result.publicOrigin !== undefined && typeof result.publicOrigin !== "string") return invalid("invalid publicOrigin");
  if (result.vapidKeys !== undefined && (typeof result.vapidKeys?.publicKey !== "string" || typeof result.vapidKeys?.privateKey !== "string")) return invalid("invalid vapid keys");
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
    (settings as Record<string, unknown>)[key] = entry;
  }
  return { ok: true, value: settings };
}
export const parseSettingsUpdateRequest = parseAppSettingsResponse;
