import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMMON_ERROR_CODES, apiError, parseApiErrorResponse, parseJsonObject, type CommonErrorCode } from "./common.js";
import { MESSAGE_STREAM_PROTOCOL_VERSION, parseHealthResponse, parseSystemInfoResponse, parseUpdateCheckResult } from "./system.js";
import { MESSAGE_STREAM_DIRECTORY_WS_PATH, MESSAGE_STREAM_GLOBAL_WS_PATH, parseMessageStreamWsFrame, parseSseEventEnvelope } from "./event-stream.js";
import { FS_ERROR_CODES, parseFileListResponse, parseFsErrorResponse, parseFsExecResponse } from "./files.js";
import { SETTINGS_ERROR_CODES, parseAppSettingsResponse, parseSettingsErrorResponse } from "./settings.js";
import { NOTIFICATION_ERROR_CODES, NOTIFICATION_SSE_CONTENT_TYPE, parseNotificationErrorResponse, parseNotificationSseEvent, parsePushSubscribeRequest } from "./notifications.js";
import { UI_AUTH_ERROR_CODES, UI_AUTH_RETRY_AFTER_HEADER, parseOwnerSessionResponse, parsePasswordSessionRequest, parseUiAuthErrorResponse } from "./ui-auth.js";
import { GIT_ERROR_CODES, gitError, parseGitErrorResponse, parseGitStatusResponse, parseGitWorktreeBootstrapStatus } from "./git.js";
import { GITHUB_ERROR_CODES, githubError, parseGitHubAuthStatusResponse, parseGitHubErrorResponse, parseGitHubPullRequestStatusResponse } from "./github.js";
import { QUOTA_ERROR_CODES, parseQuotaErrorResponse, parseQuotaProviderResponse, parseQuotaProvidersResponse, quotaError } from "./quota.js";
import { SKILLS_ERROR_CODES, parseSkillsCatalogResponse, parseSkillsInstallRequest, skillsError } from "./skills.js";
import { PROJECT_ASSETS_ERROR_CODES, PROJECT_ASSETS_UNSUPPORTED_MEDIA_STATUS, parseProjectIconContentResponse, parseProjectIconErrorResponse, parseProjectIconMutationResponse, projectAssetsError } from "./project-assets.js";
import { THEMES_ERROR_CODES, parseThemesErrorResponse, parseThemesListResponse, themesError } from "./themes.js";
import { TERMINAL_ERROR_CODES, TERMINAL_SSE_CONTENT_TYPE, TERMINAL_WS_PATH, parseTerminalCreateRequest, parseTerminalErrorResponse, parseTerminalSessionResponse, terminalError } from "./terminal.js";
import { OPENCODE_ERROR_CODES, opencodeError, parseDirectorySwitchRequest, parseOpenCodeErrorResponse, parseReloadResponse } from "./opencode.js";

type Parser = (value: unknown) => { ok: boolean };
type MatrixRow = {
  domain: string;
  success: readonly [Parser, unknown];
  invalid: readonly [Parser, unknown];
  authorization: readonly [Parser, unknown];
  internal: readonly [Parser, unknown];
  partial: readonly [Parser, unknown];
};

const commonError = (code: CommonErrorCode) => [parseApiErrorResponse, apiError(code)] as const;
const parserMatrix: readonly MatrixRow[] = [
  { domain: "common", success: [parseJsonObject, {}], invalid: [parseJsonObject, null], authorization: commonError("unauthorized"), internal: commonError("internal_error"), partial: [parseApiErrorResponse, apiError("service_unavailable")] },
  { domain: "system", success: [parseHealthResponse, { status: "ok", timestamp: "now" }], invalid: [parseHealthResponse, {}], authorization: commonError("unauthorized"), internal: commonError("internal_error"), partial: [parseUpdateCheckResult, { available: false, currentVersion: "1.0.0", nextSuggestedCheckInSec: 60 }] },
  { domain: "event-stream", success: [parseSseEventEnvelope, { type: "message", properties: {} }], invalid: [parseSseEventEnvelope, null], authorization: commonError("unauthorized"), internal: commonError("internal_error"), partial: [parseMessageStreamWsFrame, { type: "data_stalled", duration: 20_000 }] },
  { domain: "files", success: [parseFileListResponse, { directory: "/", entries: [] }], invalid: [parseFileListResponse, { entries: [] }], authorization: commonError("forbidden"), internal: [parseFsErrorResponse, { error: "File operation failed", code: "fs_internal_error" }], partial: [parseFsExecResponse, { jobId: "job", status: "done", success: false, results: [{ command: "bad", success: false, exitCode: 1, stdout: "", stderr: "failed" }] }] },
  { domain: "settings", success: [parseAppSettingsResponse, { themeId: "x" }], invalid: [parseAppSettingsResponse, { themeId: 1 }], authorization: commonError("unauthorized"), internal: [parseSettingsErrorResponse, { error: "Failed to save settings", code: "settings_write_failed" }], partial: [parseAppSettingsResponse, { themeId: "retained", unknown: { ignored: true } }] },
  { domain: "notifications", success: [parsePushSubscribeRequest, { endpoint: "x", keys: { p256dh: "x", auth: "x" } }], invalid: [parsePushSubscribeRequest, {}], authorization: [parseNotificationErrorResponse, { error: "Invalid body", code: "notification_invalid_request" }], internal: commonError("internal_error"), partial: [parseNotificationSseEvent, { type: "openchamber:notification-stream-ready", properties: {} }] },
  { domain: "ui-auth", success: [parsePasswordSessionRequest, { password: "x" }], invalid: [parsePasswordSessionRequest, {}], authorization: [parseUiAuthErrorResponse, { error: "Authentication failed", code: "ui_auth_unauthorized" }], internal: [parseUiAuthErrorResponse, { error: "Internal server error", code: "internal_error" }], partial: [parseOwnerSessionResponse, { authenticated: false, locked: true, code: "ui_auth_rate_limited" }] },
  { domain: "git", success: [parseGitStatusResponse, { current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null }], invalid: [parseGitStatusResponse, {}], authorization: [parseGitErrorResponse, gitError("git_unauthorized")], internal: [parseGitErrorResponse, gitError("git_internal_error")], partial: [parseGitWorktreeBootstrapStatus, { status: "failed", error: "bootstrap failed", updatedAt: 1 }] },
  { domain: "github", success: [parseGitHubAuthStatusResponse, { connected: false }], invalid: [parseGitHubAuthStatusResponse, {}], authorization: [parseGitHubErrorResponse, githubError("github_unauthorized")], internal: [parseGitHubErrorResponse, githubError("github_internal_error")], partial: [parseGitHubPullRequestStatusResponse, { connected: true, repo: null, pr: null, checks: { state: "pending", total: 1, success: 0, failure: 0, pending: 1 }, canMerge: false }] },
  { domain: "quota", success: [parseQuotaProvidersResponse, { providers: [] }], invalid: [parseQuotaProvidersResponse, {}], authorization: commonError("unauthorized"), internal: [parseQuotaErrorResponse, quotaError("quota_internal_error")], partial: [parseQuotaProviderResponse, { providerId: "openai", providerName: "OpenAI", ok: false, configured: true, usage: null, error: "Unavailable", errorCode: "quota_provider_error", fetchedAt: 1 }] },
  { domain: "skills", success: [parseSkillsInstallRequest, { source: "a/b", scope: "user", selections: [] }], invalid: [parseSkillsInstallRequest, {}], authorization: [parseSkillsCatalogResponse, skillsError("skills_auth_required")], internal: [parseSkillsCatalogResponse, skillsError("skills_internal_error")], partial: [parseSkillsCatalogResponse, skillsError("skills_conflict", "Conflicts found")] },
  { domain: "project-assets", success: [parseProjectIconContentResponse, { mime: "image/png", contentType: "image/png" }], invalid: [parseProjectIconContentResponse, {}], authorization: commonError("unauthorized"), internal: [parseProjectIconErrorResponse, projectAssetsError("project_assets_internal_error")], partial: [parseProjectIconMutationResponse, { project: null, skipped: true, reason: "No icon" }] },
  { domain: "themes", success: [parseThemesListResponse, { themes: [] }], invalid: [parseThemesListResponse, {}], authorization: commonError("unauthorized"), internal: [parseThemesErrorResponse, themesError("themes_internal_error")], partial: [parseThemesListResponse, { themes: [] }] },
  { domain: "terminal", success: [parseTerminalCreateRequest, { cwd: "/", cols: 80, rows: 24 }], invalid: [parseTerminalCreateRequest, {}], authorization: [parseTerminalErrorResponse, terminalError("terminal_unauthorized")], internal: [parseTerminalErrorResponse, terminalError("terminal_process_failed")], partial: [parseTerminalSessionResponse, { sessionId: "s", cols: 80, rows: 24, capabilities: { input: { preferred: "http", transports: ["http"] }, stream: { preferred: "sse", transports: ["sse"] } } }] },
  { domain: "opencode", success: [parseDirectorySwitchRequest, { path: "/" }], invalid: [parseDirectorySwitchRequest, {}], authorization: [parseOpenCodeErrorResponse, opencodeError("opencode_unauthorized")], internal: [parseOpenCodeErrorResponse, opencodeError("opencode_internal_error")], partial: [parseReloadResponse, { success: false, requiresReload: true, reloadFailed: true, warning: "Reload required" }] },
];

describe("network contract matrix", () => {
  it("keeps the aggregate runtime bridge free of owned wire DTOs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../src/ui/lib/api/types.ts"), "utf8");
    expect(source).not.toMatch(/export\s+interface\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*\{|export\s+type\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*=\s*\{|Promise\s*<\s*\{|payload\s*:\s*\{/);
  });

  it("executes success, invalid input, owned authorization/error, safe internal failure, and product state for every maintained domain", () => {
    expect(parserMatrix.map((row) => row.domain)).toEqual(["common", "system", "event-stream", "files", "settings", "notifications", "ui-auth", "git", "github", "quota", "skills", "project-assets", "themes", "terminal", "opencode"]);
    for (const row of parserMatrix) {
      for (const [parser, value] of [row.success, row.authorization, row.internal, row.partial]) expect(parser(value), row.domain).toMatchObject({ ok: true });
      expect(row.invalid[0](row.invalid[1]), row.domain).toMatchObject({ ok: false });
      const safe = row.internal[0](row.internal[1]);
      const rawProviderFailure = "provider /private/raw-secret-provider-error";
      expect(JSON.stringify(safe), row.domain).not.toContain(rawProviderFailure);
      expect(JSON.stringify(safe), row.domain).not.toContain("/private/");
    }
  });

  it("keeps protocol versions and portable transport authorities compatible with active routes", () => {
    const payload = { openchamberVersion: "1", runtime: "bun", pid: 1, startedAt: "now", protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION };
    expect(parseSystemInfoResponse(payload)).toMatchObject({ ok: true, value: { protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION } });
    expect(parseSystemInfoResponse({ ...payload, protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION + 1 })).toMatchObject({ ok: false });
    expect(UI_AUTH_RETRY_AFTER_HEADER).toBe("Retry-After");
    expect(NOTIFICATION_SSE_CONTENT_TYPE).toBe("text/event-stream; charset=utf-8");
    expect(TERMINAL_SSE_CONTENT_TYPE).toBe("text/event-stream");
    expect(MESSAGE_STREAM_GLOBAL_WS_PATH).toBe("/api/global/event/ws");
    expect(MESSAGE_STREAM_DIRECTORY_WS_PATH).toBe("/api/event/ws");
    expect(TERMINAL_WS_PATH).toBe("/api/terminal/ws");
    expect(PROJECT_ASSETS_UNSUPPORTED_MEDIA_STATUS).toBe(415);
  });

  it("keeps exported error-code authorities non-empty, stable, and unique except explicit common aliases", () => {
    const authorities = [
      ["common", COMMON_ERROR_CODES, ["unauthorized", "unsupported_media", "rate_limited", "internal_error"]],
      ["files", FS_ERROR_CODES, ["fs_forbidden", "fs_internal_error"]], ["settings", SETTINGS_ERROR_CODES, ["settings_write_failed"]], ["notifications", NOTIFICATION_ERROR_CODES, ["notification_unauthorized", "notification_unavailable"]], ["ui-auth", UI_AUTH_ERROR_CODES, ["ui_auth_rate_limited", "internal_error"]], ["git", GIT_ERROR_CODES, ["git_conflict", "git_internal_error"]], ["github", GITHUB_ERROR_CODES, ["github_not_connected", "github_internal_error"]], ["quota", QUOTA_ERROR_CODES, ["quota_provider_error", "quota_internal_error"]], ["skills", SKILLS_ERROR_CODES, ["skills_conflict", "skills_internal_error"]], ["project-assets", PROJECT_ASSETS_ERROR_CODES, ["project_assets_unsupported_media", "project_assets_internal_error"]], ["themes", THEMES_ERROR_CODES, ["themes_internal_error"]], ["terminal", TERMINAL_ERROR_CODES, ["terminal_process_failed", "terminal_unavailable"]], ["opencode", OPENCODE_ERROR_CODES, ["opencode_unavailable", "opencode_internal_error"]],
    ] as const;
    const allowedAliases = new Set(["internal_error", "opencode_unavailable"]);
    const seen = new Set<string>();
    for (const [domain, codes, sentinels] of authorities) {
      expect(codes.length, domain).toBeGreaterThan(0);
      expect([...codes], domain).toEqual(expect.arrayContaining([...sentinels]));
      expect(new Set(codes).size, domain).toBe(codes.length);
      for (const code of codes) {
        if (seen.has(code)) expect(allowedAliases.has(code), `${domain}:${code}`).toBe(true);
        seen.add(code);
      }
    }
  });
});
