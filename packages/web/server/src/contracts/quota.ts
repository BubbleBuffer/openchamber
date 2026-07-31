import { parseJsonObject, type ParseResult } from "./common.js";

export const QUOTA_ERROR_CODES = [
  "quota_invalid_request",
  "quota_unconfigured",
  "quota_unsupported_provider",
  "quota_provider_error",
  "quota_internal_error",
] as const;
export type QuotaErrorCode = (typeof QUOTA_ERROR_CODES)[number];
export type QuotaErrorResponse = { error: "Quota request failed"; code: QuotaErrorCode };
export const quotaError = (code: QuotaErrorCode): QuotaErrorResponse => ({ error: "Quota request failed", code });

export type QuotaUsageWindow = {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
  valueLabel?: string | null;
};
export type QuotaProviderUsage = {
  windows: Record<string, QuotaUsageWindow>;
  models?: Record<string, { windows: Record<string, QuotaUsageWindow> }>;
};
export type QuotaProviderResponse = {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage: QuotaProviderUsage | null;
  error?: string | null;
  errorCode?: QuotaErrorCode;
  fetchedAt: number;
};
export type QuotaProvidersResponse = { providers: string[] };
export type QuotaProviderRequest = { providerId: string };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const object = (value: unknown): Record<string, unknown> | null => {
  const result = parseJsonObject(value);
  return result.ok ? result.value : null;
};
const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const nullableString = (value: unknown) => value === null || typeof value === "string";
const nullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value));
const optionalErrorCode = (value: unknown) => value === undefined || (typeof value === "string" && (QUOTA_ERROR_CODES as readonly string[]).includes(value));

const usageWindow = (value: unknown): value is QuotaUsageWindow => {
  const input = object(value);
  return !!input
    && ["usedPercent", "remainingPercent", "windowSeconds", "resetAfterSeconds", "resetAt"].every((key) => nullableNumber(input[key]))
    && ["resetAtFormatted", "resetAfterFormatted"].every((key) => nullableString(input[key]))
    && (input.valueLabel === undefined || nullableString(input.valueLabel));
};
const windows = (value: unknown): value is Record<string, QuotaUsageWindow> => {
  const input = object(value);
  return !!input && Object.values(input).every(usageWindow);
};
const usage = (value: unknown): value is QuotaProviderUsage => {
  const input = object(value);
  if (!input || !windows(input.windows)) return false;
  if (input.models === undefined) return true;
  const models = object(input.models);
  return !!models && Object.values(models).every((model) => {
    const entry = object(model);
    return !!entry && windows(entry.windows);
  });
};

export function parseQuotaProviderRequest(value: unknown): ParseResult<QuotaProviderRequest> {
  const input = object(value);
  return input && nonEmptyString(input.providerId)
    ? { ok: true, value: { providerId: input.providerId } }
    : invalid("invalid quota provider request");
}

export function parseQuotaProvidersResponse(value: unknown): ParseResult<QuotaProvidersResponse> {
  const input = object(value);
  return input && Array.isArray(input.providers) && input.providers.every(nonEmptyString)
    ? { ok: true, value: { providers: input.providers } }
    : invalid("invalid quota providers response");
}

export function parseQuotaProviderResponse(value: unknown): ParseResult<QuotaProviderResponse> {
  const input = object(value);
  if (!input) return invalid("invalid quota provider response");
  const valid = [
    nonEmptyString(input.providerId),
    nonEmptyString(input.providerName),
    typeof input.ok === "boolean",
    typeof input.configured === "boolean",
    input.usage === null ? true : usage(input.usage),
    input.error === undefined ? true : nullableString(input.error),
    optionalErrorCode(input.errorCode),
    typeof input.fetchedAt === "number" && Number.isFinite(input.fetchedAt),
  ].every(Boolean);
  return valid ? { ok: true, value: input as QuotaProviderResponse } : invalid("invalid quota provider response");
}

export function parseQuotaErrorResponse(value: unknown): ParseResult<QuotaErrorResponse> {
  const input = object(value);
  return input && input.error === "Quota request failed" && optionalErrorCode(input.code) && input.code !== undefined
    ? { ok: true, value: input as QuotaErrorResponse }
    : invalid("invalid quota error response");
}

type RouteParser = (value: unknown) => ParseResult<unknown>;
const emptyRequest = (value: unknown): ParseResult<Record<string, never>> => value === undefined || object(value) !== null ? { ok: true, value: {} } : invalid("invalid quota request");
export const QUOTA_ROUTE_CONTRACTS: Record<string, { request: RouteParser; response: RouteParser }> = {
  "GET /api/quota/providers": { request: emptyRequest, response: parseQuotaProvidersResponse },
  "GET /api/quota/:providerId": { request: parseQuotaProviderRequest, response: parseQuotaProviderResponse },
};
