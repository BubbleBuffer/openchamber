import { parseJsonObject, type ParseResult } from "./common.js";

/** Runtime-neutral transport contract for read-only installed-skill discovery. */
export const SKILLS_ERROR_CODES = [
  "skills_invalid_request",
  "skills_invalid_name",
  "skills_invalid_path",
  "skills_not_found",
  "skills_internal_error",
] as const;

export type SkillsErrorCode = (typeof SKILLS_ERROR_CODES)[number];
export type SkillsError = { code: SkillsErrorCode; message: string };
export type SkillsFailure = { ok: false; error: SkillsError };
export type SkillScope = "user" | "project";
export type SkillSource = "opencode" | "claude" | "agents";

export type InstalledSkill = {
  name: string;
  description?: string;
  scope: SkillScope;
  source: SkillSource;
  path: string;
};

export type SkillsListResponse = { skills: InstalledSkill[] };
export type SkillDetailResponse = InstalledSkill & { instructions: string };
export type SkillNameRequest = { name: string };

const invalid = <T = never>(error: string): ParseResult<T> => ({
  ok: false,
  error,
});

const object = (value: unknown) => {
  const parsed = parseJsonObject(value);
  return parsed.ok ? parsed.value : null;
};

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const optionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

const scope = (value: unknown): value is SkillScope =>
  value === "user" || value === "project";

const source = (value: unknown): value is SkillSource =>
  value === "opencode" || value === "claude" || value === "agents";

const skillName = (value: unknown): value is string =>
  nonEmpty(value) &&
  (/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) || /^[a-z0-9]$/.test(value)) &&
  value.length <= 64;

const installedSkill = (value: unknown): value is InstalledSkill => {
  const input = object(value);
  return Boolean(
    input &&
      skillName(input.name) &&
      nonEmpty(input.path) &&
      scope(input.scope) &&
      source(input.source) &&
      optionalString(input.description),
  );
};

export function parseSkillNameRequest(value: unknown): ParseResult<SkillNameRequest> {
  const name = typeof value === "string" ? value : object(value)?.name;
  return skillName(name)
    ? { ok: true, value: { name } }
    : invalid("invalid skill name");
}

export function parseSkillsListResponse(value: unknown): ParseResult<SkillsListResponse> {
  const input = object(value);
  return input && Array.isArray(input.skills) && input.skills.every(installedSkill)
    ? { ok: true, value: input as SkillsListResponse }
    : invalid("invalid skills list response");
}

export function parseSkillDetailResponse(value: unknown): ParseResult<SkillDetailResponse> {
  const input = object(value);
  const instructions = input?.instructions;
  return input && typeof instructions === "string" && installedSkill(input)
    ? { ok: true, value: input as SkillDetailResponse }
    : invalid("invalid skill detail response");
}

export function parseSkillsFailure(value: unknown): ParseResult<SkillsFailure> {
  const input = object(value);
  const error = object(input?.error);
  return input?.ok === false &&
    error &&
    (SKILLS_ERROR_CODES as readonly unknown[]).includes(error.code) &&
    nonEmpty(error.message)
    ? { ok: true, value: input as SkillsFailure }
    : invalid("invalid skills failure");
}

export const skillsError = (
  code: SkillsErrorCode,
  message = "Skills request failed",
): SkillsFailure => ({ ok: false, error: { code, message } });
