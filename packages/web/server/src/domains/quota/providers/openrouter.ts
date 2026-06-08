import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow, formatMoney } from "../formatters.js";
import { toNumber } from "../transformers.js";
import type { QuotaProviderResult, UsageWindow } from "../types.js";

export const providerId = "openrouter";
export const providerName = "OpenRouter";
export const aliases = ["openrouter"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async (): Promise<QuotaProviderResult> => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = (entry?.key ?? entry?.token) as string | undefined;

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    const credits = (payload?.data ?? {}) as Record<string, unknown>;
    const totalCredits = toNumber(credits.total_credits);
    const totalUsage = toNumber(credits.total_usage);
    const remaining = totalCredits !== null && totalUsage !== null
      ? Math.max(0, totalCredits - totalUsage)
      : null;
    const usedPercent = totalCredits && totalUsage !== null
      ? Math.max(0, Math.min(100, (totalUsage / totalCredits) * 100))
      : null;
    const valueLabel = remaining !== null ? `$${formatMoney(remaining)} remaining` : null;

    const windows: Record<string, UsageWindow> = {
      credits: toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: null,
        valueLabel,
      }),
    };

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