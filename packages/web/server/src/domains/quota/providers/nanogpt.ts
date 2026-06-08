import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { QuotaProviderResult, UsageWindow } from "../types.js";

const NANO_GPT_DAILY_WINDOW_SECONDS = 86400;

export const providerId = "nano-gpt";
export const providerName = "NanoGPT";
export const aliases = ["nano-gpt", "nanogpt", "nano_gpt"];

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
    const response = await fetch("https://nano-gpt.com/api/subscription/v1/usage", {
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
    const windows: Record<string, UsageWindow> = {};
    const daily = payload?.daily as Record<string, unknown> | undefined;
    const monthly = payload?.monthly as Record<string, unknown> | undefined;
    const period = payload?.period as Record<string, unknown> | undefined;
    const state = (payload?.state as string) ?? "active";

    if (daily) {
      let usedPercent: number | null = null;
      const percentUsed = daily?.percentUsed;
      if (typeof percentUsed === "number") {
        usedPercent = Math.max(0, Math.min(100, percentUsed * 100));
      } else {
        const used = toNumber(daily?.used);
        const limit = toNumber(daily?.limit ?? (daily?.limits as Record<string, unknown>)?.daily);
        if (used !== null && limit !== null && limit > 0) {
          usedPercent = Math.max(0, Math.min(100, (used / limit) * 100));
        }
      }
      const resetAt = toTimestamp(daily?.resetAt);
      const valueLabel = state !== "active" ? `(${state})` : null;
      windows["daily"] = toUsageWindow({
        usedPercent,
        windowSeconds: NANO_GPT_DAILY_WINDOW_SECONDS,
        resetAt,
        valueLabel,
      });
    }

    if (monthly) {
      let usedPercent: number | null = null;
      const percentUsed = monthly?.percentUsed;
      if (typeof percentUsed === "number") {
        usedPercent = Math.max(0, Math.min(100, percentUsed * 100));
      } else {
        const used = toNumber(monthly?.used);
        const limit = toNumber(monthly?.limit ?? (monthly?.limits as Record<string, unknown>)?.monthly);
        if (used !== null && limit !== null && limit > 0) {
          usedPercent = Math.max(0, Math.min(100, (used / limit) * 100));
        }
      }
      const resetAt = toTimestamp(monthly?.resetAt ?? period?.currentPeriodEnd);
      const valueLabel = state !== "active" ? `(${state})` : null;
      windows["monthly"] = toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt,
        valueLabel,
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