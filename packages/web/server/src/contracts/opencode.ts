import { parseJsonBoolean, parseJsonNumber, parseJsonObject, type ParseResult } from "./common.js";

/**
 * Runtime-neutral DTOs owned by OpenChamber at its OpenCode integration seams.
 *
 * Requests and responses owned by @opencode-ai/sdk/v2 (including proxy payloads,
 * events, sessions, messages, and tools) are deliberately pass-through and are
 * not represented or decoded here.
 */
export const OPENCODE_ERROR_CODES = [
  "opencode_invalid_request",
  "opencode_invalid_response",
  "opencode_not_found",
  "opencode_unavailable",
  "opencode_upstream_error",
  "opencode_upstream_timeout",
  "opencode_internal_error",
] as const;

export type OpenCodeErrorCode = (typeof OPENCODE_ERROR_CODES)[number];
export interface OpenCodeErrorResponse { error: string; code: OpenCodeErrorCode; }

export interface DirectorySwitchRequest { path: string; }
export interface DirectorySwitchResponse { success: true; restarted: boolean; path: string; settings: Record<string, unknown>; }
export interface ProviderSourceResponse { providerId: string; sources: Record<string, unknown>; }
export interface ReloadResponse { success: boolean; requiresReload?: boolean; reloadFailed?: boolean; message?: string; warning?: string; reloadDelayMs?: number; }
export interface PendingMcpAuthRequest { state: string | null; name: string | null; directory: string | null; }
export interface PendingMcpAuthContext { name: string; directory: string | null; }
export interface PendingMcpAuthResponse { success?: true; context?: PendingMcpAuthContext | null; name?: string; directory?: string | null; }
export type McpConfigResponse = Record<string, unknown> & { name: string };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const optionalTrimmedString = (value: unknown): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
};
const requiredTrimmedString = (value: unknown): string | null => {
  const parsed = optionalTrimmedString(value);
  return typeof parsed === "string" ? parsed : null;
};

export function parseDirectorySwitchRequest(value: unknown): ParseResult<DirectorySwitchRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const path = requiredTrimmedString(object.value.path);
  return path ? { ok: true, value: { path } } : invalid("directory path is required");
}

export function parseDirectorySwitchResponse(value: unknown): ParseResult<DirectorySwitchResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success); const restarted = parseJsonBoolean(object.value.restarted);
  const path = requiredTrimmedString(object.value.path); const settings = parseJsonObject(object.value.settings);
  if (!success.ok || success.value !== true || !restarted.ok || !path || !settings.ok) return invalid("invalid directory switch response");
  return { ok: true, value: { success: true, restarted: restarted.value, path, settings: settings.value } };
}

export function parseProviderSourceResponse(value: unknown): ParseResult<ProviderSourceResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const providerId = requiredTrimmedString(object.value.providerId); const sources = parseJsonObject(object.value.sources);
  if (!providerId || !sources.ok) return invalid("invalid provider source response");
  for (const key of ["auth", "user", "project"]) {
    const source = parseJsonObject(sources.value[key]);
    if (!source.ok || typeof source.value.exists !== "boolean") return invalid("invalid provider source response");
  }
  return { ok: true, value: { providerId, sources: sources.value } };
}

export function parseReloadResponse(value: unknown): ParseResult<ReloadResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success); if (!success.ok) return invalid("reload response requires success");
  for (const key of ["requiresReload", "reloadFailed"]) if (object.value[key] !== undefined && typeof object.value[key] !== "boolean") return invalid("invalid reload response");
  if (object.value.reloadDelayMs !== undefined && !parseJsonNumber(object.value.reloadDelayMs).ok) return invalid("invalid reload delay");
  for (const key of ["message", "warning"]) if (object.value[key] !== undefined && typeof object.value[key] !== "string") return invalid("invalid reload response");
  return { ok: true, value: object.value as unknown as ReloadResponse };
}

export const parseMcpMutationResponse = parseReloadResponse;

export function parsePendingMcpAuthRequest(value: unknown): ParseResult<PendingMcpAuthRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const state = object.value.state === undefined ? null : optionalTrimmedString(object.value.state);
  const name = object.value.name === undefined ? null : optionalTrimmedString(object.value.name);
  const directory = object.value.directory === undefined ? null : optionalTrimmedString(object.value.directory);
  if (state === undefined || name === undefined || directory === undefined) return invalid("invalid pending MCP auth request");
  if (state !== null && name === null) return invalid("MCP server name is required");
  return { ok: true, value: { state, name, directory } };
}

export function parsePendingMcpAuthResponse(value: unknown): ParseResult<PendingMcpAuthResponse | null> {
  if (value === null) return { ok: true, value: null };
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.success !== undefined && object.value.success !== true) return invalid("invalid pending MCP auth response");
  if (object.value.context !== undefined) {
    if (object.value.context === null) return { ok: true, value: { success: true, context: null } };
    const context = parseJsonObject(object.value.context); const name = context.ok ? requiredTrimmedString(context.value.name) : null;
    const directory = context.ok ? optionalTrimmedString(context.value.directory) : undefined;
    if (!context.ok || !name || directory === undefined) return invalid("invalid pending MCP auth context");
    return { ok: true, value: { success: true, context: { name, directory } } };
  }
  const name = optionalTrimmedString(object.value.name); const directory = optionalTrimmedString(object.value.directory);
  if (!name || directory === undefined) return invalid("invalid pending MCP auth response");
  return { ok: true, value: { name, directory } };
}

export function parseMcpConfigListResponse(value: unknown): ParseResult<McpConfigResponse[]> {
  if (!Array.isArray(value)) return invalid("MCP config response requires an array");
  const configs: McpConfigResponse[] = [];
  for (const entry of value) {
    const object = parseJsonObject(entry); const name = object.ok ? requiredTrimmedString(object.value.name) : null;
    if (!object.ok || !name || (object.value.type !== "local" && object.value.type !== "remote") || typeof object.value.enabled !== "boolean") return invalid("invalid MCP config response");
    if (object.value.type === "local" && (!Array.isArray(object.value.command) || object.value.command.some((item) => typeof item !== "string"))) return invalid("invalid MCP config response");
    if (object.value.type === "remote" && !requiredTrimmedString(object.value.url)) return invalid("invalid MCP config response");
    configs.push({ ...object.value, name });
  }
  return { ok: true, value: configs };
}

export function parseMcpConfigRequest(value: unknown): ParseResult<Record<string, unknown>> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.scope !== undefined && object.value.scope !== "user" && object.value.scope !== "project") return invalid("invalid MCP scope");
  if (object.value.type !== undefined && object.value.type !== "local" && object.value.type !== "remote") return invalid("invalid MCP type");
  if (object.value.command !== undefined && (!Array.isArray(object.value.command) || object.value.command.some((item) => typeof item !== "string"))) return invalid("invalid MCP command");
  if (object.value.url !== undefined && typeof object.value.url !== "string") return invalid("invalid MCP URL");
  return { ok: true, value: object.value };
}
