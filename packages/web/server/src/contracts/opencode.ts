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
  "opencode_unauthorized",
  "opencode_not_found",
  "opencode_unavailable",
  "opencode_upstream_error",
  "opencode_upstream_timeout",
  "opencode_internal_error",
] as const;

export type OpenCodeErrorCode = (typeof OPENCODE_ERROR_CODES)[number];
export interface OpenCodeErrorResponse { error: string; code: OpenCodeErrorCode; }
export function opencodeError(code: OpenCodeErrorCode): OpenCodeErrorResponse {
  return { error: code === "opencode_internal_error" ? "Internal server error" : "Request failed", code };
}
export function parseOpenCodeErrorResponse(value: unknown): ParseResult<OpenCodeErrorResponse> {
  const object = parseJsonObject(value);
  if (!object.ok || typeof object.value.error !== "string" || typeof object.value.code !== "string" || !(OPENCODE_ERROR_CODES as readonly string[]).includes(object.value.code)) return invalid("invalid OpenCode error response");
  const expected = opencodeError(object.value.code as OpenCodeErrorCode);
  return object.value.error === expected.error ? { ok: true, value: expected } : invalid("unsafe OpenCode error response");
}

export interface DirectorySwitchRequest { path: string; }
export interface DirectorySwitchResponse { success: true; restarted: boolean; path: string; settings: Record<string, unknown>; }
export interface ProviderSourceResponse { providerId: string; sources: Record<string, unknown>; }
export interface ProviderDisconnectResponse { success: true; removed: boolean; requiresReload: boolean; message: string; reloadDelayMs?: number; }
export interface OpenCodeResolutionResponse { configured?: string; resolved?: string; resolvedDir?: string; source?: string; detectedNow?: string; detectedSourceNow?: string; launchBinary?: string; launchArgs?: string[]; launchWrapperType?: string; node?: string; bun?: string; }
export interface ReloadResponse { success: boolean; requiresReload?: boolean; reloadFailed?: boolean; message?: string; warning?: string; reloadDelayMs?: number; }
export type ConfigEntityBody = Record<string, unknown>;
export interface PendingMcpAuthRequest { state: string | null; name: string | null; directory: string | null; }
export interface PendingMcpAuthContext { name: string; directory: string | null; }
export interface PendingMcpAuthResponse { success?: true; context?: PendingMcpAuthContext | null; name?: string; directory?: string | null; }
export type McpConfigResponse = Record<string, unknown> & { name: string };
export interface SessionFolderDto { id: string; name: string; sessionIds: string[]; createdAt: number; parentId?: string | null; }
export interface SessionFoldersResponse { version: number; foldersMap: Record<string, SessionFolderDto[]>; collapsedFolderIds: string[]; updatedAt?: number; }
export type SessionFoldersUpdateRequest = Required<SessionFoldersResponse>;
export interface SessionFoldersMutationResponse { success: true; }
export interface MagicPromptUpdateRequest { text: string; }
export interface MagicPromptStateResponse { version?: number; overrides: Record<string, string>; }

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
const MAGIC_PROMPT_ID_PATTERN = /^[a-z0-9._-]{1,160}$/;

export function parseMagicPromptId(value: unknown): ParseResult<string> {
  const id = requiredTrimmedString(value);
  return id && MAGIC_PROMPT_ID_PATTERN.test(id) ? { ok: true, value: id } : invalid("invalid magic prompt id");
}

export function parseMagicPromptUpdateRequest(value: unknown): ParseResult<MagicPromptUpdateRequest> {
  const object = parseJsonObject(value);
  return object.ok && typeof object.value.text === "string" ? { ok: true, value: { text: object.value.text } } : invalid("magic prompt text is required");
}

export function parseMagicPromptStateResponse(value: unknown): ParseResult<MagicPromptStateResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.version !== undefined && !parseJsonNumber(object.value.version).ok) return invalid("invalid magic prompt state");
  const overrides = parseJsonObject(object.value.overrides); if (!overrides.ok) return invalid("invalid magic prompt state");
  for (const [id, text] of Object.entries(overrides.value)) if (!MAGIC_PROMPT_ID_PATTERN.test(id) || typeof text !== "string") return invalid("invalid magic prompt state");
  return { ok: true, value: { ...(object.value.version === undefined ? {} : { version: object.value.version as number }), overrides: overrides.value as Record<string, string> } };
}

const parseSessionFolders = (value: unknown, requireUpdatedAt: boolean): ParseResult<SessionFoldersResponse> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (!parseJsonNumber(object.value.version).ok) return invalid("invalid session folders state");
  const foldersMap = parseJsonObject(object.value.foldersMap); if (!foldersMap.ok || !Array.isArray(object.value.collapsedFolderIds)) return invalid("invalid session folders state");
  if (requireUpdatedAt ? !parseJsonNumber(object.value.updatedAt).ok : object.value.updatedAt !== undefined && !parseJsonNumber(object.value.updatedAt).ok) return invalid("invalid session folders state");
  const parsedFoldersMap: Record<string, SessionFolderDto[]> = {};
  for (const [scope, folders] of Object.entries(foldersMap.value)) {
    if (!requiredTrimmedString(scope) || !Array.isArray(folders)) return invalid("invalid session folders state");
    parsedFoldersMap[scope] = [];
    for (const folder of folders) {
      const entry = parseJsonObject(folder); const id = entry.ok ? requiredTrimmedString(entry.value.id) : null; const name = entry.ok ? requiredTrimmedString(entry.value.name) : null;
      if (!entry.ok || !id || !name || !Array.isArray(entry.value.sessionIds) || entry.value.sessionIds.some((sessionId) => !requiredTrimmedString(sessionId)) || !parseJsonNumber(entry.value.createdAt).ok || (entry.value.parentId !== undefined && entry.value.parentId !== null && !requiredTrimmedString(entry.value.parentId))) return invalid("invalid session folders state");
      parsedFoldersMap[scope].push({ id, name, sessionIds: entry.value.sessionIds as string[], createdAt: entry.value.createdAt as number, ...(entry.value.parentId === undefined ? {} : { parentId: entry.value.parentId as string | null }) });
    }
  }
  if (object.value.collapsedFolderIds.some((id) => !requiredTrimmedString(id))) return invalid("invalid session folders state");
  return { ok: true, value: { version: object.value.version as number, foldersMap: parsedFoldersMap, collapsedFolderIds: object.value.collapsedFolderIds as string[], ...(object.value.updatedAt === undefined ? {} : { updatedAt: object.value.updatedAt as number }) } };
};
export const parseSessionFoldersResponse = (value: unknown): ParseResult<SessionFoldersResponse> => parseSessionFolders(value, false);
export const parseSessionFoldersUpdateRequest = (value: unknown): ParseResult<SessionFoldersUpdateRequest> => {
  const parsed = parseSessionFolders(value, true);
  return parsed.ok && parsed.value.updatedAt !== undefined ? { ok: true, value: parsed.value as SessionFoldersUpdateRequest } : invalid("invalid session folders update");
};
export function parseSessionFoldersMutationResponse(value: unknown): ParseResult<SessionFoldersMutationResponse> {
  const object = parseJsonObject(value);
  return object.ok && object.value.success === true ? { ok: true, value: { success: true } } : invalid("invalid session folders mutation response");
}

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
export function parseProviderId(value: unknown): ParseResult<string> {
  const id = requiredTrimmedString(value);
  return id && !/[\\/%]/.test(id) ? { ok: true, value: id } : invalid("invalid provider id");
}
export function parseProviderDisconnectResponse(value: unknown): ParseResult<ProviderDisconnectResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.success !== true || typeof object.value.removed !== "boolean" || typeof object.value.requiresReload !== "boolean" || typeof object.value.message !== "string") return invalid("invalid provider disconnect response");
  if (object.value.reloadDelayMs !== undefined && !parseJsonNumber(object.value.reloadDelayMs).ok) return invalid("invalid provider disconnect response");
  return { ok: true, value: object.value as unknown as ProviderDisconnectResponse };
}
export function parseOpenCodeResolutionResponse(value: unknown): ParseResult<OpenCodeResolutionResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const result: OpenCodeResolutionResponse = {};
  for (const key of ["configured", "resolved", "resolvedDir", "source", "detectedNow", "detectedSourceNow", "launchBinary", "launchWrapperType", "node", "bun"] as const) {
    if (object.value[key] !== undefined && typeof object.value[key] !== "string") return invalid("invalid OpenCode resolution response");
    if (typeof object.value[key] === "string") result[key] = object.value[key] as never;
  }
  if (object.value.launchArgs !== undefined) {
    if (!Array.isArray(object.value.launchArgs) || object.value.launchArgs.some((arg) => typeof arg !== "string")) return invalid("invalid OpenCode resolution response");
    result.launchArgs = object.value.launchArgs as string[];
  }
  return { ok: true, value: result };
}

export function parseReloadResponse(value: unknown): ParseResult<ReloadResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success); if (!success.ok) return invalid("reload response requires success");
  for (const key of ["requiresReload", "reloadFailed"]) if (object.value[key] !== undefined && typeof object.value[key] !== "boolean") return invalid("invalid reload response");
  if (object.value.reloadDelayMs !== undefined && !parseJsonNumber(object.value.reloadDelayMs).ok) return invalid("invalid reload delay");
  for (const key of ["message", "warning"]) if (object.value[key] !== undefined && typeof object.value[key] !== "string") return invalid("invalid reload response");
  return { ok: true, value: object.value as unknown as ReloadResponse };
}

export function parseMcpMutationResponse(value: unknown): ParseResult<ReloadResponse & { success: true }> {
  const parsed = parseReloadResponse(value);
  return parsed.ok && parsed.value.success === true
    ? { ok: true, value: parsed.value as ReloadResponse & { success: true } }
    : invalid("MCP mutation response requires success");
}

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

const CONFIG_ENTITY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function parseConfigEntityName(value: unknown): ParseResult<string> {
  if (typeof value !== "string") return invalid("invalid config entity name");
  let decoded: string;
  try { decoded = decodeURIComponent(value); } catch { return invalid("invalid config entity name"); }
  const name = requiredTrimmedString(decoded);
  return name && CONFIG_ENTITY_NAME_PATTERN.test(name) ? { ok: true, value: name } : invalid("invalid config entity name");
}
export function parseConfigEntityBody(value: unknown): ParseResult<ConfigEntityBody> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.scope !== undefined && object.value.scope !== "user" && object.value.scope !== "project") return invalid("invalid config entity scope");
  return { ok: true, value: object.value };
}
export function parseConfigEntityResponse(value: unknown): ParseResult<Record<string, unknown>> {
  return parseJsonObject(value);
}
