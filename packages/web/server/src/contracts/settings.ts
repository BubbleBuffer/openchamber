import { parseJsonObject, type ParseResult } from "./common.js";

export const SETTINGS_ERROR_CODES = ["settings_invalid_request", "settings_invalid_response", "settings_write_failed"] as const;

export type SkillCatalogConfig = { id: string; label: string; source: string; subpath?: string; gitIdentityId?: string };
export type ProjectEntry = {
  id: string; path: string; label?: string | null; icon?: string | null;
  iconImage?: { mime: string; updatedAt: number; source: "custom" | "auto" } | null;
  iconBackground?: string | null; color?: string | null; addedAt?: number; lastOpenedAt?: number; sidebarCollapsed?: boolean;
};
export type NotificationTemplate = { title: string; message: string };
export type NotificationTemplates = { completion: NotificationTemplate; error: NotificationTemplate; question: NotificationTemplate; subtask: NotificationTemplate };
export type UsageModelGroup = { customGroups?: Array<{ id: string; label: string; models: string[]; order: number }>; modelAssignments?: Record<string, string>; renamedGroups?: Record<string, string> };

export interface AppSettings {
  themeId?: string; useSystemTheme?: boolean; themeVariant?: "light" | "dark"; lightThemeId?: string; darkThemeId?: string;
  splashBgLight?: string; splashFgLight?: string; splashBgDark?: string; splashFgDark?: string; lastDirectory?: string; homeDirectory?: string; opencodeBinary?: string;
  projects?: ProjectEntry[]; activeProjectId?: string; pinnedDirectories?: string[]; uiFont?: string; monoFont?: string; markdownDisplayMode?: string; githubClientId?: string; githubScopes?: string;
  showReasoningTraces?: boolean; showTextJustificationActivity?: boolean; showDeletionDialog?: boolean; nativeNotificationsEnabled?: boolean; notificationMode?: "always" | "hidden-only";
  notifyOnSubtasks?: boolean; notifyOnCompletion?: boolean; notifyOnError?: boolean; notifyOnQuestion?: boolean; notificationTemplates?: NotificationTemplates;
  summarizeLastMessage?: boolean; summaryThreshold?: number; summaryLength?: number; maxLastMessageLength?: number; usageAutoRefresh?: boolean; usageRefreshIntervalMs?: number; usageDisplayMode?: "usage" | "remaining";
  usageDropdownProviders?: string[]; usageSelectedModels?: Record<string, string[]>; usageCollapsedFamilies?: Record<string, string[]>; usageExpandedFamilies?: Record<string, string[]>; usageModelGroups?: Record<string, UsageModelGroup>;
  autoDeleteEnabled?: boolean; autoDeleteAfterDays?: number; sessionRetentionAction?: "archive" | "delete"; defaultModel?: string; defaultVariant?: string; defaultAgent?: string; defaultGitIdentityId?: string;
  autoCreateWorktree?: boolean; queueModeEnabled?: boolean; gitmojiEnabled?: boolean; defaultFileViewerPreview?: boolean; zenModel?: string; gitProviderId?: string; gitModelId?: string;
  pwaAppName?: string; pwaOrientation?: "system" | "portrait" | "landscape"; toolCallExpansion?: "collapsed" | "activity" | "detailed" | "changes";
  inputSpellcheckEnabled?: boolean; showToolFileIcons?: boolean; showExpandedBashTools?: boolean; showExpandedEditTools?: boolean; timeFormatPreference?: "auto" | "12h" | "24h"; weekStartPreference?: "auto" | "sunday" | "monday";
  chatRenderMode?: "sorted" | "live"; messageStreamTransport?: "auto" | "ws" | "sse"; activityRenderMode?: "collapsed" | "summary"; mermaidRenderingMode?: "svg" | "ascii"; userMessageRenderingMode?: "markdown" | "plain"; stickyUserHeader?: boolean;
  fontSize?: number; terminalFontSize?: number; padding?: number; cornerRadius?: number; inputBarOffset?: number; favoriteModels?: Array<{ providerID: string; modelID: string }>; recentModels?: Array<{ providerID: string; modelID: string }>;
  diffLayoutPreference?: "dynamic" | "inline" | "side-by-side"; diffViewMode?: "single" | "stacked"; gitChangesViewMode?: "flat" | "tree"; directoryShowHidden?: boolean; filesViewShowGitignored?: boolean; messageLimit?: number; skillCatalogs?: SkillCatalogConfig[]; reportUsage?: boolean; typographySizes?: Record<string, string>;
}

export interface PersistedSettings extends AppSettings { publicOrigin?: string; vapidKeys?: { publicKey: string; privateKey: string } }

type FieldDescriptor = { validate(value: unknown): boolean };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): boolean => typeof value === "string";
const boolean = (value: unknown): boolean => typeof value === "boolean";
const number = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);
const oneOf = <T extends string>(...values: T[]) => (value: unknown): value is T => typeof value === "string" && values.includes(value as T);
const strings = (value: unknown): boolean => Array.isArray(value) && value.every(string);
const stringRecord = (value: unknown): boolean => isObject(value) && Object.values(value).every(string);
const stringArrayRecord = (value: unknown): boolean => isObject(value) && Object.values(value).every(strings);
const modelRefs = (value: unknown): boolean => Array.isArray(value) && value.every((entry) => isObject(entry) && string(entry.providerID) && string(entry.modelID));
const projects = (value: unknown): boolean => Array.isArray(value) && value.every((entry) => isObject(entry) && string(entry.id) && string(entry.path)
  && (entry.label === undefined || entry.label === null || string(entry.label))
  && (entry.icon === undefined || entry.icon === null || string(entry.icon))
  && (entry.iconBackground === undefined || entry.iconBackground === null || string(entry.iconBackground))
  && (entry.color === undefined || entry.color === null || string(entry.color))
  && (entry.addedAt === undefined || number(entry.addedAt)) && (entry.lastOpenedAt === undefined || number(entry.lastOpenedAt))
  && (entry.sidebarCollapsed === undefined || boolean(entry.sidebarCollapsed))
  && (entry.iconImage === undefined || entry.iconImage === null || (isObject(entry.iconImage) && string(entry.iconImage.mime) && number(entry.iconImage.updatedAt) && oneOf("custom", "auto")(entry.iconImage.source))));
const notificationTemplates = (value: unknown): boolean => isObject(value) && ["completion", "error", "question", "subtask"].every((key) => isObject(value[key]) && string(value[key].title) && string(value[key].message));
const skillCatalogs = (value: unknown): boolean => Array.isArray(value) && value.every((entry) => isObject(entry) && string(entry.id) && string(entry.label) && string(entry.source) && (entry.subpath === undefined || string(entry.subpath)) && (entry.gitIdentityId === undefined || string(entry.gitIdentityId)));
const usageModelGroups = (value: unknown): boolean => isObject(value) && Object.values(value).every((group) => isObject(group)
  && (group.customGroups === undefined || (Array.isArray(group.customGroups) && group.customGroups.every((entry) => isObject(entry) && string(entry.id) && string(entry.label) && strings(entry.models) && number(entry.order))))
  && (group.modelAssignments === undefined || stringRecord(group.modelAssignments)) && (group.renamedGroups === undefined || stringRecord(group.renamedGroups)));
// This is the complete browser settings inventory. Persistence and response
// parsing both use it, while server-only fields are intentionally separate.
export const SETTINGS_FIELDS = {
  themeId: { validate: string }, useSystemTheme: { validate: boolean }, themeVariant: { validate: oneOf("light", "dark") }, lightThemeId: { validate: string }, darkThemeId: { validate: string },
  splashBgLight: { validate: string }, splashFgLight: { validate: string }, splashBgDark: { validate: string }, splashFgDark: { validate: string }, lastDirectory: { validate: string }, homeDirectory: { validate: string }, opencodeBinary: { validate: string },
  projects: { validate: projects }, activeProjectId: { validate: string }, pinnedDirectories: { validate: strings }, uiFont: { validate: string }, monoFont: { validate: string }, markdownDisplayMode: { validate: string }, githubClientId: { validate: string }, githubScopes: { validate: string },
  showReasoningTraces: { validate: boolean }, showTextJustificationActivity: { validate: boolean }, showDeletionDialog: { validate: boolean }, nativeNotificationsEnabled: { validate: boolean }, notificationMode: { validate: oneOf("always", "hidden-only") },
  notifyOnSubtasks: { validate: boolean }, notifyOnCompletion: { validate: boolean }, notifyOnError: { validate: boolean }, notifyOnQuestion: { validate: boolean }, notificationTemplates: { validate: notificationTemplates },
  summarizeLastMessage: { validate: boolean }, summaryThreshold: { validate: number }, summaryLength: { validate: number }, maxLastMessageLength: { validate: number }, usageAutoRefresh: { validate: boolean }, usageRefreshIntervalMs: { validate: number }, usageDisplayMode: { validate: oneOf("usage", "remaining") },
  usageDropdownProviders: { validate: strings }, usageSelectedModels: { validate: stringArrayRecord }, usageCollapsedFamilies: { validate: stringArrayRecord }, usageExpandedFamilies: { validate: stringArrayRecord }, usageModelGroups: { validate: usageModelGroups },
  autoDeleteEnabled: { validate: boolean }, autoDeleteAfterDays: { validate: number }, sessionRetentionAction: { validate: oneOf("archive", "delete") }, defaultModel: { validate: string }, defaultVariant: { validate: string }, defaultAgent: { validate: string }, defaultGitIdentityId: { validate: string },
  autoCreateWorktree: { validate: boolean }, queueModeEnabled: { validate: boolean }, gitmojiEnabled: { validate: boolean }, defaultFileViewerPreview: { validate: boolean }, zenModel: { validate: string }, gitProviderId: { validate: string }, gitModelId: { validate: string },
  pwaAppName: { validate: string }, pwaOrientation: { validate: oneOf("system", "portrait", "landscape") }, toolCallExpansion: { validate: oneOf("collapsed", "activity", "detailed", "changes") },
  inputSpellcheckEnabled: { validate: boolean }, showToolFileIcons: { validate: boolean }, showExpandedBashTools: { validate: boolean }, showExpandedEditTools: { validate: boolean }, timeFormatPreference: { validate: oneOf("auto", "12h", "24h") }, weekStartPreference: { validate: oneOf("auto", "sunday", "monday") },
  chatRenderMode: { validate: oneOf("sorted", "live") }, messageStreamTransport: { validate: oneOf("auto", "ws", "sse") }, activityRenderMode: { validate: oneOf("collapsed", "summary") }, mermaidRenderingMode: { validate: oneOf("svg", "ascii") }, userMessageRenderingMode: { validate: oneOf("markdown", "plain") }, stickyUserHeader: { validate: boolean },
  fontSize: { validate: number }, terminalFontSize: { validate: number }, padding: { validate: number }, cornerRadius: { validate: number }, inputBarOffset: { validate: number }, favoriteModels: { validate: modelRefs }, recentModels: { validate: modelRefs },
  diffLayoutPreference: { validate: oneOf("dynamic", "inline", "side-by-side") }, diffViewMode: { validate: oneOf("single", "stacked") }, gitChangesViewMode: { validate: oneOf("flat", "tree") }, directoryShowHidden: { validate: boolean }, filesViewShowGitignored: { validate: boolean }, messageLimit: { validate: number }, skillCatalogs: { validate: skillCatalogs }, reportUsage: { validate: boolean }, typographySizes: { validate: stringRecord },
} satisfies Record<keyof AppSettings, FieldDescriptor>;

const SERVER_ONLY_FIELDS = {
  publicOrigin: { validate: string },
  vapidKeys: { validate: (value: unknown): boolean => isObject(value) && string(value.publicKey) && string(value.privateKey) },
} satisfies Record<keyof Pick<PersistedSettings, "publicOrigin" | "vapidKeys">, FieldDescriptor>;

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });

export function parsePersistedSettings(value: unknown): ParseResult<PersistedSettings> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(object.value)) {
    const descriptor = (SETTINGS_FIELDS as Record<string, FieldDescriptor>)[key] ?? (SERVER_ONLY_FIELDS as Record<string, FieldDescriptor>)[key];
    if (!descriptor) continue;
    if (!descriptor.validate(entry)) return invalid(`invalid ${key}`);
    result[key] = entry;
  }
  return { ok: true, value: result as PersistedSettings };
}

export function parseAppSettingsResponse(value: unknown): ParseResult<AppSettings> {
  const persisted = parsePersistedSettings(value); if (!persisted.ok) return persisted;
  const settings: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(persisted.value)) if (key in SETTINGS_FIELDS) settings[key] = entry;
  return { ok: true, value: settings as AppSettings };
}

export const parseSettingsUpdateRequest = parseAppSettingsResponse;
