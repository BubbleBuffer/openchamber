import { parseJsonBoolean, parseJsonObject, parseJsonString, type ParseResult } from "./common.js";

export const UI_AUTH_ERROR_CODES = ["ui_auth_invalid_request", "ui_auth_unauthorized", "ui_auth_forbidden", "ui_auth_not_found", "ui_auth_rate_limited", "internal_error"] as const;
export const UI_AUTH_RETRY_AFTER_HEADER = "Retry-After" as const;
export type UiAuthErrorCode = (typeof UI_AUTH_ERROR_CODES)[number];
export type PasswordSessionRequest = { password: string; trustDevice?: boolean };
export type OwnerSessionResponse = { authenticated: boolean; disabled?: boolean; locked?: boolean; code?: UiAuthErrorCode };
export type UiAuthErrorResponse = { error: string; code: UiAuthErrorCode; locked?: boolean; retryAfter?: number };
export type PasskeyRegistrationOptionsRequest = { label?: string };
export type PasskeyVerificationRequest = { requestId: string; response: unknown };
export type PasskeyAuthenticationVerifyRequest = PasskeyVerificationRequest & { trustDevice?: boolean };
export type PasskeyOptionsResponse = { requestId: string; optionsJSON: unknown };
export type PasskeyRegistrationVerifyResponse = { verified: true; passkeyCount: number };
export type PasskeyAuthenticationVerifyResponse = { verified: true; authenticated: true };
export type PasskeyStatusResponse = { enabled: boolean; hasPasskeys: boolean; passkeyCount: number; rpID: string | null };
export type StoredPasskeyResponse = { id: string; label: string; createdAt: number; lastUsedAt: number | null; deviceType: string; backedUp: boolean };
export type PasskeyListResponse = { passkeys: StoredPasskeyResponse[] };
export type PasskeyRevokeResponse = { revoked: true; passkeyCount: number };
export type ResetAuthResponse = { cleared: true; clearedPasskeys: number; signedOutEverywhere: true };
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
export function parseUiAuthErrorResponse(value: unknown): ParseResult<UiAuthErrorResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const code = parseOptionalErrorCode(object.value.code);
  if (!code.ok || code.value === undefined || typeof object.value.error !== "string") return invalid("invalid UI auth error response");
  if (object.value.locked !== undefined && typeof object.value.locked !== "boolean") return invalid("invalid UI auth error response");
  if (object.value.retryAfter !== undefined && (typeof object.value.retryAfter !== "number" || !Number.isFinite(object.value.retryAfter))) return invalid("invalid UI auth error response");
  return { ok: true, value: object.value as UiAuthErrorResponse };
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const parseRequestId = (value: unknown): ParseResult<string> => {
  const requestId = parseJsonString(value);
  return requestId.ok && requestId.value.trim() ? requestId : invalid("requestId is required");
};

export function parsePasskeyRegistrationOptionsRequest(value: unknown): ParseResult<PasskeyRegistrationOptionsRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.label !== undefined && typeof object.value.label !== "string") return invalid("label must be a string");
  return { ok: true, value: object.value.label === undefined ? {} : { label: object.value.label } };
}

export function parsePasskeyRegistrationVerifyRequest(value: unknown): ParseResult<PasskeyVerificationRequest> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const requestId = parseRequestId(object.value.requestId);
  if (!requestId.ok || !hasOwn(object.value, "response")) return invalid("invalid passkey verification request");
  return { ok: true, value: { requestId: requestId.value, response: object.value.response } };
}

export function parsePasskeyAuthenticationVerifyRequest(value: unknown): ParseResult<PasskeyAuthenticationVerifyRequest> {
  const verification = parsePasskeyRegistrationVerifyRequest(value);
  if (!verification.ok) return verification;
  const object = value as Record<string, unknown>;
  const trustDevice = parseOptionalBoolean(object.trustDevice);
  if (!trustDevice.ok) return invalid("trustDevice must be a boolean");
  return { ok: true, value: { ...verification.value, ...(trustDevice.value === undefined ? {} : { trustDevice: trustDevice.value }) } };
}

export function parsePasskeyRevokeRequest(value: unknown): ParseResult<{ id: string }> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const id = parseJsonString(object.value.id);
  if (!id.ok || !id.value.trim()) return invalid("passkey id is required");
  return { ok: true, value: { id: id.value } };
}

export function parsePasskeyOptionsResponse(value: unknown): ParseResult<PasskeyOptionsResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  const requestId = parseRequestId(object.value.requestId);
  if (!requestId.ok || !hasOwn(object.value, "optionsJSON") || !parseJsonObject(object.value.optionsJSON).ok) return invalid("invalid passkey options response");
  return { ok: true, value: { requestId: requestId.value, optionsJSON: object.value.optionsJSON } };
}

export function parsePasskeyRegistrationVerifyResponse(value: unknown): ParseResult<PasskeyRegistrationVerifyResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.verified !== true || !isNonNegativeInteger(object.value.passkeyCount)) return invalid("invalid passkey registration result");
  return { ok: true, value: { verified: true, passkeyCount: object.value.passkeyCount } };
}

export function parsePasskeyAuthenticationVerifyResponse(value: unknown): ParseResult<PasskeyAuthenticationVerifyResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.verified !== true || object.value.authenticated !== true) return invalid("invalid passkey authentication result");
  return { ok: true, value: { verified: true, authenticated: true } };
}

export function parsePasskeyStatusResponse(value: unknown): ParseResult<PasskeyStatusResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (typeof object.value.enabled !== "boolean" || typeof object.value.hasPasskeys !== "boolean" || !isNonNegativeInteger(object.value.passkeyCount) || (typeof object.value.rpID !== "string" && object.value.rpID !== null)) return invalid("invalid passkey status response");
  return { ok: true, value: { enabled: object.value.enabled, hasPasskeys: object.value.hasPasskeys, passkeyCount: object.value.passkeyCount, rpID: object.value.rpID } };
}

const parseStoredPasskeyResponse = (value: unknown): ParseResult<StoredPasskeyResponse> => {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (typeof object.value.id !== "string" || typeof object.value.label !== "string" || !isNonNegativeInteger(object.value.createdAt) || (typeof object.value.lastUsedAt !== "number" && object.value.lastUsedAt !== null) || (typeof object.value.lastUsedAt === "number" && !Number.isFinite(object.value.lastUsedAt)) || typeof object.value.deviceType !== "string" || typeof object.value.backedUp !== "boolean") return invalid("invalid stored passkey response");
  return { ok: true, value: object.value as StoredPasskeyResponse };
};

export function parsePasskeyListResponse(value: unknown): ParseResult<PasskeyListResponse> {
  const object = parseJsonObject(value); if (!object.ok || !Array.isArray(object.value.passkeys)) return invalid("invalid passkey list response");
  const passkeys = object.value.passkeys.map(parseStoredPasskeyResponse);
  if (passkeys.some((passkey) => !passkey.ok)) return invalid("invalid passkey list response");
  return { ok: true, value: { passkeys: passkeys.map((passkey) => (passkey as { ok: true; value: StoredPasskeyResponse }).value) } };
}

export function parsePasskeyRevokeResponse(value: unknown): ParseResult<PasskeyRevokeResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.revoked !== true || !isNonNegativeInteger(object.value.passkeyCount)) return invalid("invalid passkey revoke result");
  return { ok: true, value: { revoked: true, passkeyCount: object.value.passkeyCount } };
}

export function parseResetAuthResponse(value: unknown): ParseResult<ResetAuthResponse> {
  const object = parseJsonObject(value); if (!object.ok) return object;
  if (object.value.cleared !== true || !isNonNegativeInteger(object.value.clearedPasskeys) || object.value.signedOutEverywhere !== true) return invalid("invalid auth reset result");
  return { ok: true, value: { cleared: true, clearedPasskeys: object.value.clearedPasskeys, signedOutEverywhere: true } };
}
