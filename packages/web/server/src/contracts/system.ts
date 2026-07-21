import { parseJsonArray, parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const MESSAGE_STREAM_PROTOCOL_VERSION = 1 as const;
export interface HealthResponse { status: "ok"; timestamp: string; [key: string]: unknown; }
export interface SystemInfoResponse { openchamberVersion: string; runtime: string; pid: number; startedAt: string; protocolVersion: typeof MESSAGE_STREAM_PROTOCOL_VERSION; }
export interface UpdateCheckResult { available: boolean; version?: string; currentVersion?: string; body?: string; nextSuggestedCheckInSec?: number; packageManager?: string; updateCommand?: string; }
export interface UpdateInstallResult { success: boolean; message?: string; version?: string; packageManager?: string; autoRestart?: boolean; }
export interface ZenModel { id: string; name?: string; }
export type ModelMetadataResponse = Record<string, { id?: string; models?: Record<string, Record<string, unknown>> }>;
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const optionalString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
export function parseHealthResponse(value: unknown): ParseResult<HealthResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  return object.value.status === "ok" && typeof object.value.timestamp === "string" ? { ok: true, value: object.value as HealthResponse } : invalid("invalid health response");
}
export function parseSystemInfoResponse(value: unknown): ParseResult<SystemInfoResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (typeof object.value.openchamberVersion !== "string" || typeof object.value.runtime !== "string" || typeof object.value.pid !== "number" || typeof object.value.startedAt !== "string" || object.value.protocolVersion !== MESSAGE_STREAM_PROTOCOL_VERSION) return invalid("invalid system info");
  return { ok: true, value: {
    openchamberVersion: object.value.openchamberVersion as string,
    runtime: object.value.runtime as string,
    pid: object.value.pid as number,
    startedAt: object.value.startedAt as string,
    protocolVersion: MESSAGE_STREAM_PROTOCOL_VERSION,
  } };
}

export function parseUpdateCheckResult(value: unknown): ParseResult<UpdateCheckResult> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const available = parseJsonBoolean(object.value.available); if (!available.ok) return invalid("update result requires available");
  const number = object.value.nextSuggestedCheckInSec;
  if (number !== undefined && (typeof number !== "number" || !Number.isFinite(number))) return invalid("invalid update check interval");
  return { ok: true, value: { available: available.value, version: optionalString(object.value.version), currentVersion: optionalString(object.value.currentVersion), body: optionalString(object.value.body), nextSuggestedCheckInSec: number, packageManager: optionalString(object.value.packageManager), updateCommand: optionalString(object.value.updateCommand) } };
}
export function parseUpdateInstallResult(value: unknown): ParseResult<UpdateInstallResult> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const success = parseJsonBoolean(object.value.success); if (!success.ok) return invalid("install result requires success");
  if (object.value.autoRestart !== undefined && typeof object.value.autoRestart !== "boolean") return invalid("invalid autoRestart");
  return { ok: true, value: { success: success.value, message: optionalString(object.value.message), version: optionalString(object.value.version), packageManager: optionalString(object.value.packageManager), autoRestart: object.value.autoRestart as boolean | undefined } };
}
export function parseModelMetadataResponse(value: unknown): ParseResult<ModelMetadataResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  for (const provider of Object.values(object.value)) { const entry = parseJsonObject(provider); if (!entry.ok || (entry.value.models !== undefined && !parseJsonObject(entry.value.models).ok)) return invalid("invalid model metadata"); }
  return { ok: true, value: object.value as ModelMetadataResponse };
}
export function parseZenModelsResponse(value: unknown): ParseResult<{ models: ZenModel[] }> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const models = parseJsonArray(object.value.models); if (!models.ok) return invalid("Zen models requires models array");
  const result: ZenModel[] = [];
  for (const model of models.value) { const entry = parseJsonObject(model); if (!entry.ok) return invalid("invalid Zen model"); const id = parseJsonString(entry.value.id); if (!id.ok || !id.value) return invalid("Zen model requires id"); result.push({ id: id.value, name: optionalString(entry.value.name) }); }
  return { ok: true, value: { models: result } };
}
