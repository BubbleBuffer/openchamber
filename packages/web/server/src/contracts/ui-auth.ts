import { parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const UI_AUTH_ERROR_CODES = ["ui_auth_invalid_request", "ui_auth_unauthorized", "ui_auth_forbidden", "ui_auth_rate_limited", "internal_error"] as const;
export type UiAuthErrorCode = (typeof UI_AUTH_ERROR_CODES)[number];
export type PasswordSessionRequest = { password: string; trustDevice?: boolean };
export type OwnerSessionResponse = { authenticated: boolean; disabled?: boolean; locked?: boolean; code?: UiAuthErrorCode };
export type UiAuthErrorResponse = { error: string; code: UiAuthErrorCode; locked?: boolean; retryAfter?: number };
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const parseOptionalBoolean = (value: unknown): ParseResult<boolean | undefined> =>
  value === undefined ? { ok: true, value: undefined } : parseJsonBoolean(value);
const parseOptionalErrorCode = (value: unknown): ParseResult<UiAuthErrorCode | undefined> =>
  value === undefined
    ? { ok: true, value: undefined }
    : typeof value === "string" && UI_AUTH_ERROR_CODES.includes(value as UiAuthErrorCode)
      ? { ok: true, value: value as UiAuthErrorCode }
      : invalid("invalid owner session response");
export function parsePasswordSessionRequest(value: unknown): ParseResult<PasswordSessionRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const password = parseJsonString(object.value.password);
  if (!password.ok) return invalid("password is required");
  if (object.value.trustDevice !== undefined && !parseJsonBoolean(object.value.trustDevice).ok) return invalid("trustDevice must be a boolean");
  return { ok: true, value: { password: password.value, ...(typeof object.value.trustDevice === "boolean" ? { trustDevice: object.value.trustDevice } : {}) } };
}
export function parseOwnerSessionResponse(value: unknown): ParseResult<OwnerSessionResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const authenticated = parseJsonBoolean(object.value.authenticated);
  const disabled = parseOptionalBoolean(object.value.disabled);
  const locked = parseOptionalBoolean(object.value.locked);
  const code = parseOptionalErrorCode(object.value.code);
  if (!authenticated.ok || !disabled.ok || !locked.ok || !code.ok) return invalid("invalid owner session response");
  return { ok: true, value: { authenticated: authenticated.value, ...(disabled.value === undefined ? {} : { disabled: disabled.value }), ...(locked.value === undefined ? {} : { locked: locked.value }), ...(code.value === undefined ? {} : { code: code.value }) } };
}
