import { describe, expect, it } from "vitest";
import {
  parseSkillsInstallRequest,
  parseSkillsInstallResponse,
  parseSkillDetailResponse,
  parseSkillMutationResponse,
  parseSkillNameRequest,
  parseSkillSupportingFileRequest,
  parseSkillsScanResponse,
  parseSkillsSupportingFileResponse,
} from "./skills.js";

describe("skills contracts", () => {
  it("accepts valid install requests and rejects malformed selections", () => {
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: "skill" }] }).ok).toBe(true);
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: 1 }] }).ok).toBe(false);
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: "../escape" }] }).ok).toBe(false);
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: "/etc" }] }).ok).toBe(false);
    expect(parseSkillsInstallRequest({ source: "owner/repo", scope: "user", selections: [{ skillDir: "skills/nested" }] }).ok).toBe(true);
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

  it("owns installed-skill names, supporting-file paths, and CRUD responses", () => {
    expect(parseSkillNameRequest("review-skill").ok).toBe(true);
    expect(parseSkillNameRequest("../escape").ok).toBe(false);
    expect(parseSkillSupportingFileRequest({ name: "review-skill", filePath: "notes/setup.md", content: "hello" }).ok).toBe(true);
    expect(parseSkillSupportingFileRequest({ name: "review-skill", filePath: "../setup.md" }).ok).toBe(false);
    expect(parseSkillMutationResponse({ success: true, requiresReload: true, message: "Saved", reloadDelayMs: 10 }).ok).toBe(true);
    expect(parseSkillMutationResponse({ success: true, reloadDelayMs: "soon" }).ok).toBe(false);
    expect(parseSkillDetailResponse({ name: "review-skill", scope: "user", source: "opencode", sources: { md: { exists: true, path: null, dir: null, fields: [], supportingFiles: [] } } }).ok).toBe(true);
  });
});
