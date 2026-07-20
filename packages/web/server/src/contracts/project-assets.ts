import { parseJsonObject, type ParseResult } from "./common.js";
import type { AppSettings, ProjectEntry } from "./settings.js";

/** Runtime-neutral transport contract for project icon upload, discovery, and mutation routes. */
export const PROJECT_ASSETS_ERROR_CODES = [
  "project_assets_invalid_request", "project_assets_not_found", "project_assets_unsupported_media",
  "project_assets_payload_too_large", "project_assets_internal_error",
] as const;
export type ProjectAssetsErrorCode = (typeof PROJECT_ASSETS_ERROR_CODES)[number];
export type ProjectAssetsErrorResponse = { error: string; code: ProjectAssetsErrorCode };
export type ProjectIconUploadRequest = { dataUrl: string };
export type ProjectIconDiscoverRequest = { force?: boolean };
export type ProjectIconMutationResponse = { project: ProjectEntry | null; settings?: AppSettings; skipped?: boolean; reason?: string; discoveredPath?: string };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const object = (value: unknown) => { const parsed = parseJsonObject(value); return parsed.ok ? parsed.value : null; };
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const dataUrl = (value: unknown): value is string => typeof value === "string" && /^data:[^;,]+;base64,[A-Za-z0-9+/=\s]+$/i.test(value.trim());
const project = (value: unknown): value is ProjectEntry => {
  const input = object(value);
  return !!input && nonEmpty(input.id) && nonEmpty(input.path);
};

export function parseProjectIconId(value: unknown): ParseResult<string> {
  return nonEmpty(value) ? { ok: true, value: value.trim() } : invalid("invalid project id");
}

export function parseProjectIconUploadRequest(value: unknown): ParseResult<ProjectIconUploadRequest> {
  const input = object(value);
  return input && dataUrl(input.dataUrl) ? { ok: true, value: { dataUrl: input.dataUrl.trim() } } : invalid("invalid project icon upload request");
}

export function parseProjectIconDiscoverRequest(value: unknown): ParseResult<ProjectIconDiscoverRequest> {
  const input = object(value);
  return input && (input.force === undefined || typeof input.force === "boolean") ? { ok: true, value: input.force === undefined ? {} : { force: input.force } } : invalid("invalid project icon discovery request");
}

export function parseProjectIconErrorResponse(value: unknown): ParseResult<ProjectAssetsErrorResponse> {
  const input = object(value);
  return input && nonEmpty(input.error) && typeof input.code === "string" && (PROJECT_ASSETS_ERROR_CODES as readonly string[]).includes(input.code)
    ? { ok: true, value: input as ProjectAssetsErrorResponse }
    : invalid("invalid project assets error response");
}

export function parseProjectIconMutationResponse(value: unknown): ParseResult<ProjectIconMutationResponse> {
  const input = object(value);
  return input && (input.project === null || project(input.project)) && (input.settings === undefined || !!object(input.settings))
    && (input.skipped === undefined || typeof input.skipped === "boolean")
    && (input.reason === undefined || typeof input.reason === "string")
    && (input.discoveredPath === undefined || typeof input.discoveredPath === "string")
    ? { ok: true, value: input as ProjectIconMutationResponse }
    : invalid("invalid project icon mutation response");
}

export const projectAssetsError = (code: ProjectAssetsErrorCode, error = "Project icon request failed"): ProjectAssetsErrorResponse => ({ error, code });
