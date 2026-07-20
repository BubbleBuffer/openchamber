import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseJsonObject } from "./common.js";
import { parseHealthResponse } from "./system.js";
import { parseSseEventEnvelope } from "./event-stream.js";
import { parseFileListResponse } from "./files.js";
import { parseAppSettingsResponse } from "./settings.js";
import { parsePushSubscribeRequest } from "./notifications.js";
import { parsePasswordSessionRequest } from "./ui-auth.js";
import { parseGitStatusResponse } from "./git.js";
import { parseGitHubAuthStatusResponse } from "./github.js";
import { parseQuotaProvidersResponse } from "./quota.js";
import { parseSkillsInstallRequest } from "./skills.js";
import { parseProjectIconContentResponse } from "./project-assets.js";
import { parseThemesListResponse } from "./themes.js";
import { parseTerminalCreateRequest } from "./terminal.js";
import { parseDirectorySwitchRequest } from "./opencode.js";

const parserMatrix: ReadonlyArray<{ domain: string; parse: (value: unknown) => { ok: boolean }; valid: unknown; invalid: unknown }> = [
  { domain: "common", parse: parseJsonObject, valid: {}, invalid: null },
  { domain: "system", parse: parseHealthResponse, valid: { status: "ok", timestamp: "now" }, invalid: {} },
  { domain: "event-stream", parse: parseSseEventEnvelope, valid: { type: "message", properties: {} }, invalid: null },
  { domain: "files", parse: parseFileListResponse, valid: { directory: "/", entries: [] }, invalid: { entries: [] } },
  { domain: "settings", parse: parseAppSettingsResponse, valid: { themeId: "x" }, invalid: { themeId: 1 } },
  { domain: "notifications", parse: parsePushSubscribeRequest, valid: { endpoint: "x", keys: { p256dh: "x", auth: "x" } }, invalid: {} },
  { domain: "ui-auth", parse: parsePasswordSessionRequest, valid: { password: "x" }, invalid: {} },
  { domain: "git", parse: parseGitStatusResponse, valid: { current: null, tracking: null, ahead: 0, behind: 0, files: [], isClean: true, mergeInProgress: null, rebaseInProgress: null }, invalid: {} },
  { domain: "github", parse: parseGitHubAuthStatusResponse, valid: { connected: false }, invalid: {} },
  { domain: "quota", parse: parseQuotaProvidersResponse, valid: { providers: [] }, invalid: {} },
  { domain: "skills", parse: parseSkillsInstallRequest, valid: { source: "a/b", scope: "user", selections: [] }, invalid: {} },
  { domain: "project-assets", parse: parseProjectIconContentResponse, valid: { mime: "image/png", contentType: "image/png" }, invalid: {} },
  { domain: "themes", parse: parseThemesListResponse, valid: { themes: [] }, invalid: {} },
  { domain: "terminal", parse: parseTerminalCreateRequest, valid: { cwd: "/", cols: 80, rows: 24 }, invalid: {} },
  { domain: "opencode", parse: parseDirectorySwitchRequest, valid: { path: "/" }, invalid: {} },
];

describe("network contract matrix", () => {
  it("keeps the aggregate runtime bridge free of owned wire DTOs", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../../../src/ui/lib/api/types.ts"), "utf8");
    expect(source).not.toMatch(/export\s+(?:interface|type)\s+(?!Runtime(?:APIs|Descriptor|APISelector)|Subscription)\w*(?:Request|Response|Payload|Result|Event|Error)\b|Promise\s*<\s*\{|payload\s*:\s*\{/);
  });

  it("executes representative success and invalid parsers for every maintained contract domain", () => {
    for (const row of parserMatrix) {
      expect(row.parse(row.valid), row.domain).toMatchObject({ ok: true });
      expect(row.parse(row.invalid), row.domain).toMatchObject({ ok: false });
    }
  });

  it("preserves compatibility metadata and unique stable error-code namespaces", () => {
    const modules = ["common", "settings", "themes", "ui-auth", "quota", "terminal", "files", "github", "git", "project-assets", "skills", "notifications", "opencode"];
    const codeDeclarations = modules.filter((module) => module !== "common").flatMap((module) => {
      const source = readFileSync(resolve(import.meta.dirname, `${module}.ts`), "utf8");
      const declaration = source.match(/export const \w+_ERROR_CODES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
      return [...declaration.matchAll(/"([a-z]+(?:_[a-z]+)+)"/g)].map((match) => match[1]);
    });
    expect(new Set(codeDeclarations).size).toBe(codeDeclarations.length);
  });
});
