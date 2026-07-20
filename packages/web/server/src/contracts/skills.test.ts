import { describe, expect, it } from "vitest";
import {
  parseSkillsInstallRequest,
  parseSkillsInstallResponse,
  parseSkillsScanResponse,
  parseSkillsSupportingFileResponse,
} from "./skills.js";

describe("skills contracts", () => {
  it("accepts valid install requests and rejects malformed selections", () => {
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: "skill" }] }).ok).toBe(true);
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: 1 }] }).ok).toBe(false);
  });

  it("preserves partial install outcomes and rejects malformed success payloads", () => {
    expect(parseSkillsInstallResponse({ ok: true, installed: [{ skillName: "one", scope: "user", source: "opencode" }], skipped: [{ skillName: "two", reason: "conflict" }] }).ok).toBe(true);
    expect(parseSkillsInstallResponse({ ok: true, installed: "nope", skipped: [] }).ok).toBe(false);
  });

  it("accepts coded provider scan failures and nullable catalog fields", () => {
    expect(parseSkillsScanResponse({ ok: false, error: { code: "skills_provider_error", message: "Scan failed" } }).ok).toBe(true);
    expect(parseSkillsSupportingFileResponse({ path: "notes/file.md", content: "" }).ok).toBe(true);
    expect(parseSkillsSupportingFileResponse({ path: null, content: "" }).ok).toBe(false);
  });
});
