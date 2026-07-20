import { parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const UI_AUTH_ERROR_CODES = ["ui_auth_invalid_request", "ui_auth_unauthorized", "ui_auth_forbidden", "ui_auth_rate_limited"] as const;
export type PasswordSessionRequest = { password: string };
export type OwnerSessionResponse = { enabled: boolean; authenticated: boolean };
const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
export function parsePasswordSessionRequest(value: unknown): ParseResult<PasswordSessionRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const password = parseJsonString(object.value.password); return password.ok ? { ok: true, value: { password: password.value } } : invalid("password is required");
}
export function parseOwnerSessionResponse(value: unknown): ParseResult<OwnerSessionResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const enabled = parseJsonBoolean(object.value.enabled); const authenticated = parseJsonBoolean(object.value.authenticated);
  return enabled.ok && authenticated.ok ? { ok: true, value: { enabled: enabled.value, authenticated: authenticated.value } } : invalid("invalid owner session response");
}
