import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { asNonEmptyString, asObject, toNumber, toTimestamp } from "../transformers.js";
import type { QuotaProviderResult, UsageWindow } from "../types.js";

export const providerId = "openai";
export const providerName = "OpenAI";
export const aliases = ["openai", "codex", "chatgpt"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async (): Promise<QuotaProviderResult> => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = asNonEmptyString(entry?.access) ?? asNonEmptyString(entry?.token);

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rateLimit = asObject(payload?.rate_limit);
    const primary = rateLimit ? asObject(rateLimit.primary_window) : null;
    const secondary = rateLimit ? asObject(rateLimit.secondary_window) : null;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(primary?.used_percent),
        windowSeconds: toNumber(primary?.limit_window_seconds),
        resetAt: toTimestamp(primary?.reset_at),
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: toNumber(secondary?.used_percent),
        windowSeconds: toNumber(secondary?.limit_window_seconds),
        resetAt: toTimestamp(secondary?.reset_at),
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};