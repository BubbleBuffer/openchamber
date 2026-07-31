import { describe, expect, it } from "vitest";
import { SETTINGS_FIELDS } from "../../contracts/settings.js";
import { createSettingsHelpers } from "./helpers.js";

describe("settings helper inventory", () => {
  it("accepts every browser field recorded in the authoritative contract", () => {
    const helpers = createSettingsHelpers({
      normalizePathForPersistence: (value) => value,
      normalizeDirectoryPath: (value) => value,
      sanitizeTypographySizesPartial: (value) => value as Record<string, string>,
      normalizeStringArray: (value) => value as string[],
      sanitizeModelRefs: (value) => value as Array<{ providerID: string; modelID: string }>,
      sanitizeSkillCatalogs: (value) => value as Array<{ id: string; label: string; source: string }>,
      sanitizeProjects: (value) => value as Array<Record<string, unknown>>,
    });
    const booleans = new Set(["useSystemTheme", "showReasoningTraces", "showTextJustificationActivity", "showDeletionDialog", "nativeNotificationsEnabled", "notifyOnSubtasks", "notifyOnCompletion", "notifyOnError", "notifyOnQuestion", "summarizeLastMessage", "usageAutoRefresh", "autoDeleteEnabled", "autoCreateWorktree", "queueModeEnabled", "gitmojiEnabled", "defaultFileViewerPreview", "inputSpellcheckEnabled", "showToolFileIcons", "showExpandedBashTools", "showExpandedEditTools", "stickyUserHeader", "directoryShowHidden", "filesViewShowGitignored", "reportUsage"]);
    const numbers = new Set(["summaryThreshold", "summaryLength", "maxLastMessageLength", "usageRefreshIntervalMs", "autoDeleteAfterDays", "fontSize", "terminalFontSize", "padding", "cornerRadius", "inputBarOffset", "messageLimit"]);
    const arrays = new Set(["projects", "pinnedDirectories", "usageDropdownProviders", "favoriteModels", "recentModels", "skillCatalogs"]);
    const payload: Record<string, unknown> = Object.fromEntries(Object.keys(SETTINGS_FIELDS).map((key) => [key,
      booleans.has(key) ? true : numbers.has(key) ? 1 : arrays.has(key) ? [] : "value",
    ]));
    Object.assign(payload, {
      themeVariant: "light", notificationMode: "always", usageDisplayMode: "usage", sessionRetentionAction: "archive",
      pwaOrientation: "system", toolCallExpansion: "collapsed", timeFormatPreference: "auto", weekStartPreference: "auto",
      chatRenderMode: "sorted", messageStreamTransport: "auto", activityRenderMode: "collapsed", mermaidRenderingMode: "svg", userMessageRenderingMode: "markdown",
      diffLayoutPreference: "dynamic", diffViewMode: "single", gitChangesViewMode: "flat",
      notificationTemplates: { completion: { title: "", message: "" }, error: { title: "", message: "" }, question: { title: "", message: "" }, subtask: { title: "", message: "" } },
      typographySizes: { body: "12px" }, usageSelectedModels: { provider: ["model"] }, usageCollapsedFamilies: { provider: ["family"] }, usageExpandedFamilies: { provider: ["family"] }, usageModelGroups: { provider: { modelAssignments: { model: "group" } } },
      favoriteModels: [{ providerID: "provider", modelID: "model" }], recentModels: [{ providerID: "provider", modelID: "model" }], skillCatalogs: [{ id: "id", label: "label", source: "source" }], projects: [],
    });

    expect(Object.keys(helpers.sanitizeSettingsUpdate(payload)).sort()).toEqual(Object.keys(SETTINGS_FIELDS).sort());
  });
});
