import { describe, expect, it } from "vitest";
import {
  QUOTA_ROUTE_CONTRACTS,
  parseQuotaErrorResponse,
  parseQuotaProviderRequest,
  parseQuotaProviderResponse,
  parseQuotaProvidersResponse,
} from "./quota.js";

const configured = {
  providerId: "claude",
  providerName: "Claude",
  ok: true,
  configured: true,
  usage: {
    windows: {
      weekly: {
        usedPercent: 12,
        remainingPercent: 88,
        windowSeconds: 604800,
        resetAfterSeconds: null,
        resetAt: null,
        resetAtFormatted: null,
        resetAfterFormatted: null,
      },
    },
  },
  fetchedAt: 1,
};

describe("quota contracts", () => {
  it("accepts configured, unconfigured, and partial provider results", () => {
    expect(parseQuotaProviderResponse(configured).ok).toBe(true);
    expect(parseQuotaProviderResponse({ ...configured, ok: false, configured: false, usage: null, error: "Not configured", errorCode: "quota_unconfigured" }).ok).toBe(true);
    expect(parseQuotaProviderResponse({ ...configured, usage: { windows: {}, models: { "gemini/pro": { windows: {} } } } }).ok).toBe(true);
  });

  it("rejects malformed provider success bodies while preserving nullable and optional fields", () => {
    expect(parseQuotaProviderResponse({ ...configured, usage: { windows: { weekly: { ...configured.usage.windows.weekly, valueLabel: null } } } }).ok).toBe(true);
    expect(parseQuotaProviderResponse({ ...configured, fetchedAt: "now" }).ok).toBe(false);
    expect(parseQuotaProviderResponse({ ...configured, usage: { windows: { weekly: { ...configured.usage.windows.weekly, usedPercent: "12" } } } }).ok).toBe(false);
  });

  it("parses requests, provider lists, and only safe coded errors", () => {
    expect(parseQuotaProviderRequest({ providerId: "claude" }).ok).toBe(true);
    expect(parseQuotaProviderRequest({ providerId: " " }).ok).toBe(false);
    expect(parseQuotaProvidersResponse({ providers: ["claude", "google"] }).ok).toBe(true);
    expect(parseQuotaProvidersResponse({ providers: ["claude", 1] }).ok).toBe(false);
    expect(parseQuotaErrorResponse({ error: "Quota request failed", code: "quota_provider_error" }).ok).toBe(true);
    expect(parseQuotaErrorResponse({ error: "token=secret", code: "quota_provider_error" }).ok).toBe(false);
  });

  it("owns every active quota route with request and response parsers", () => {
    expect(Object.keys(QUOTA_ROUTE_CONTRACTS)).toEqual(["GET /api/quota/providers", "GET /api/quota/:providerId"]);
  });
});
