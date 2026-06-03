import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "claude";
export const providerName = "Claude";
export const aliases = ["anthropic", "claude"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;

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
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
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
    const fiveHour = payload?.five_hour as Record<string, unknown> | undefined;
    const sevenDay = payload?.seven_day as Record<string, unknown> | undefined;
    const sevenDaySonnet = payload?.seven_day_sonnet as Record<string, unknown> | undefined;
    const sevenDayOpus = payload?.seven_day_opus as Record<string, unknown> | undefined;

    if (fiveHour) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(fiveHour.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(fiveHour.resets_at),
      });
    }
    if (sevenDay) {
      windows["7d"] = toUsageWindow({
        usedPercent: toNumber(sevenDay.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDay.resets_at),
      });
    }
    if (sevenDaySonnet) {
      windows["7d-sonnet"] = toUsageWindow({
        usedPercent: toNumber(sevenDaySonnet.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDaySonnet.resets_at),
      });
    }
    if (sevenDayOpus) {
      windows["7d-opus"] = toUsageWindow({
        usedPercent: toNumber(sevenDayOpus.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDayOpus.resets_at),
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