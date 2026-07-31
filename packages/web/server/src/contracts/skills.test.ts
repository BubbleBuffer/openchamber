import { describe, expect, it } from "vitest";
import {
  parseSkillDetailResponse,
  parseSkillNameRequest,
  parseSkillsFailure,
  parseSkillsListResponse,
  skillsError,
} from "./skills.js";

const installed = {
  name: "review-skill",
  description: "Reviews changes",
  path: "/skills/review-skill/SKILL.md",
  scope: "user",
  source: "opencode",
} as const;

describe("read-only installed skills contracts", () => {
  it("owns installed-skill names without accepting path-like input", () => {
    expect(parseSkillNameRequest("review-skill")).toEqual({
      ok: true,
      value: { name: "review-skill" },
    });
    expect(parseSkillNameRequest("../escape").ok).toBe(false);
    expect(parseSkillNameRequest("review/skill").ok).toBe(false);
    expect(parseSkillNameRequest({ name: "UPPERCASE" }).ok).toBe(false);
  });

  it("accepts complete list entries and rejects malformed summaries", () => {
    expect(parseSkillsListResponse({ skills: [installed] }).ok).toBe(true);
    expect(parseSkillsListResponse({ skills: [{ ...installed, path: "" }] }).ok).toBe(false);
    expect(parseSkillsListResponse({ skills: [{ ...installed, scope: "global" }] }).ok).toBe(false);
  });

  it("requires instructions on detail responses", () => {
    expect(parseSkillDetailResponse({ ...installed, instructions: "Follow these steps." }).ok).toBe(true);
    expect(parseSkillDetailResponse(installed).ok).toBe(false);
    expect(parseSkillDetailResponse({ ...installed, instructions: null }).ok).toBe(false);
  });

  it("parses only stable read-only skill failures", () => {
    expect(parseSkillsFailure(skillsError("skills_not_found", "Skill not found")).ok).toBe(true);
    expect(parseSkillsFailure({
      ok: false,
      error: { code: "skills_provider_error", message: "Removed marketplace error" },
    }).ok).toBe(false);
  });
});
