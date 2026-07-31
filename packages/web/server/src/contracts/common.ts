export const COMMON_ERROR_CODES = [
  "invalid_request", "unauthorized", "forbidden", "not_found", "conflict",
  "payload_too_large", "unsupported_media", "rate_limited", "opencode_unavailable",
  "upstream_error", "upstream_timeout", "service_unavailable", "internal_error",
] as const;

export type CommonErrorCode = (typeof COMMON_ERROR_CODES)[number];
export interface ApiErrorResponse { error: string; code: CommonErrorCode | string; }
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const valid = <T>(value: T): ParseResult<T> => ({ ok: true, value });
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });

export const parseJsonObject = (value: unknown): ParseResult<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? valid(value as Record<string, unknown>) : invalid("expected object");
export const parseJsonArray = (value: unknown): ParseResult<unknown[]> => Array.isArray(value) ? valid(value) : invalid("expected array");
export const parseJsonString = (value: unknown): ParseResult<string> => typeof value === "string" ? valid(value) : invalid("expected string");
export const parseJsonNumber = (value: unknown): ParseResult<number> => typeof value === "number" && Number.isFinite(value) ? valid(value) : invalid("expected finite number");
export const parseJsonBoolean = (value: unknown): ParseResult<boolean> => typeof value === "boolean" ? valid(value) : invalid("expected boolean");

export function apiError(code: CommonErrorCode | string): ApiErrorResponse {
  const error = code === "internal_error" ? "Internal server error" : "Request failed";
  return { error, code };
}

export function parseApiErrorResponse(value: unknown): ParseResult<ApiErrorResponse> {
  const object = parseJsonObject(value);
  if (!object.ok || typeof object.value.code !== "string" || typeof object.value.error !== "string") return invalid("invalid API error response");
  const expected = apiError(object.value.code);
  return object.value.error === expected.error ? { ok: true, value: expected } : invalid("unsafe API error response");
}
