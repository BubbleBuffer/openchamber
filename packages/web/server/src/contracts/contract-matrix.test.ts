import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiError, parseJsonObject } from "./common.js";
import { MESSAGE_STREAM_PROTOCOL_VERSION, parseHealthResponse, parseSystemInfoResponse } from "./system.js";
import { parseSseEventEnvelope } from "./event-stream.js";
import { parseFileListResponse } from "./files.js";
import { parseAppSettingsResponse } from "./settings.js";
import { parsePushSubscribeRequest } from "./notifications.js";
import { parsePasswordSessionRequest } from "./ui-auth.js";
import { parseGitStatusResponse } from "./git.js";
import { parseGitHubAuthStatusResponse } from "./github.js";
import { parseQuotaProviderResponse, parseQuotaProvidersResponse } from "./quota.js";
import { parseSkillsInstallRequest } from "./skills.js";
import { parseProjectIconContentResponse, parseProjectIconMutationResponse } from "./project-assets.js";
import { parseThemesListResponse } from "./themes.js";
import { parseTerminalCreateRequest } from "./terminal.js";
import { parseDirectorySwitchRequest } from "./opencode.js";
import { SETTINGS_ERROR_CODES } from "./settings.js";
import { THEMES_ERROR_CODES } from "./themes.js";
import { UI_AUTH_ERROR_CODES } from "./ui-auth.js";
import { QUOTA_ERROR_CODES } from "./quota.js";
import { TERMINAL_ERROR_CODES } from "./terminal.js";
import { FS_ERROR_CODES } from "./files.js";
import { GITHUB_ERROR_CODES } from "./github.js";
import { GIT_ERROR_CODES } from "./git.js";
import { PROJECT_ASSETS_ERROR_CODES } from "./project-assets.js";
import { SKILLS_ERROR_CODES } from "./skills.js";
import { NOTIFICATION_ERROR_CODES } from "./notifications.js";
import { OPENCODE_ERROR_CODES } from "./opencode.js";

const parserMatrix: ReadonlyArray<{ domain: string; parse: (value: unknown) => { ok: boolean }; valid: unknown; invalid: unknown; authorization: () => unknown; internal: () => unknown; partialFailureException?: string }> = [
  ...([
    ["common", parseJsonObject, {}, null], ["system", parseHealthResponse, { status: "ok", timestamp: "now" }, {}], ["event-stream", parseSseEventEnvelope, { type: "message", properties: {} }, null], ["files", parseFileListResponse, { directory: "/", entries: [] }, { entries: [] }], ["settings", parseAppSettingsResponse, { themeId: "x" }, { themeId: 1 }], ["notifications", parsePushSubscribeRequest, { endpoint: "x", keys: { p256dh: "x", auth: "x" } }, {}], ["ui-auth", parsePasswordSessionRequest, { password: "x" }, {}], ["git", parseGitStatusResponse, { current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null }, {}], ["github", parseGitHubAuthStatusResponse, { connected: false }, {}], ["quota", parseQuotaProvidersResponse, { providers: [] }, {}], ["skills", parseSkillsInstallRequest, { source: "a/b", scope: "user", selections: [] }, {}], ["project-assets", parseProjectIconContentResponse, { mime: "image/png", contentType: "image/png" }, {}], ["themes", parseThemesListResponse, { themes: [] }, {}], ["terminal", parseTerminalCreateRequest, { cwd: "/", cols: 80, rows: 24 }, {}], ["opencode", parseDirectorySwitchRequest, { path: "/" }, {}], ["route-inventory", parseJsonObject, {}, null],
  ] as const).map(([domain, parse, valid, invalid]) => ({ domain, parse, valid, invalid, authorization: () => apiError("unauthorized"), internal: () => apiError("internal_error"), partialFailureException: domain === "quota" || domain === "project-assets" ? undefined : "No domain product-state envelope is maintained." })),
];

describe("network contract matrix", () => {
  it("keeps the aggregate runtime bridge free of owned wire DTOs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../src/ui/lib/api/types.ts"), "utf8");
    expect(source).not.toMatch(/export\s+interface\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*\{|export\s+type\s+\w*(?:Request|Response|Payload|Result|Event|Error)\b\s*=\s*\{|Promise\s*<\s*\{|payload\s*:\s*\{/);
  });

  it("executes success, invalid-input, centrally-owned authorization, and safe internal-error behavior for every maintained contract domain", () => {
    for (const row of parserMatrix) {
      expect(row.parse(row.valid), row.domain).toMatchObject({ ok: true });
      expect(row.parse(row.invalid), row.domain).toMatchObject({ ok: false });
      expect(row.authorization(), row.domain).toEqual(apiError("unauthorized"));
      expect(row.internal(), row.domain).toEqual(apiError("internal_error"));
    }
  });

  it("executes representative maintained partial-failure/product-state envelopes and records truthful exceptions", () => {
    expect(parseQuotaProviderResponse({ providerId: "openai", providerName: "OpenAI", ok: false, configured: true, usage: null, error: "Unavailable", errorCode: "quota_provider_error", fetchedAt: 1 })).toMatchObject({ ok: true });
    expect(parseProjectIconMutationResponse({ project: null, skipped: true, reason: "No icon" })).toMatchObject({ ok: true });
    expect(parserMatrix.filter((row) => row.partialFailureException).every((row) => row.partialFailureException?.length)).toBe(true);
  });

  it("keeps protocol parsing compatible with the published stream version", () => {
    const payload = { openchamberVersion: "1", runtime: "bun", pid: 1, startedAt: "now", protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION };
    expect(parseSystemInfoResponse(payload)).toMatchObject({ ok: true, value: { protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION } });
    expect(parseSystemInfoResponse({ ...payload, protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION + 1 })).toMatchObject({ ok: false });
  });

  it("preserves unique stable domain error-code exports", () => {
    const codeDeclarations = [SETTINGS_ERROR_CODES, THEMES_ERROR_CODES, UI_AUTH_ERROR_CODES, QUOTA_ERROR_CODES, TERMINAL_ERROR_CODES, FS_ERROR_CODES, GITHUB_ERROR_CODES, GIT_ERROR_CODES, PROJECT_ASSETS_ERROR_CODES, SKILLS_ERROR_CODES, NOTIFICATION_ERROR_CODES, OPENCODE_ERROR_CODES].flat();
    expect(new Set(codeDeclarations).size).toBe(codeDeclarations.length);
  });
});
