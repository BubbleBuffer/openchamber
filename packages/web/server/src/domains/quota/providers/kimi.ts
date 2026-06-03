import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow, durationToLabel, durationToSeconds } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "kimi-for-coding";
export const providerName = "Kimi for Coding";
export const aliases = ["kimi-for-coding", "kimi"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};

export const fetchQuota = async () => {
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
    const response = await fetch("https://api.kimi.com/coding/v1/usages", {
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
    const usage = payload?.usage as Record<string, unknown> | undefined;

    if (usage) {
      const limit = toNumber(usage.limit);
      const remaining = toNumber(usage.remaining);
      const usedPercent = limit && remaining !== null
        ? Math.max(0, Math.min(100, 100 - (remaining / limit) * 100))
        : null;
      windows["weekly"] = toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: toTimestamp(usage.resetTime),
      });
    }

    const limits = Array.isArray(payload?.limits) ? payload.limits as Record<string, unknown>[] : [];
    for (const limit of limits) {
      const windowSpec = limit?.window as Record<string, unknown> | undefined;
      const detail = limit?.detail as Record<string, unknown> | undefined;
      const rawLabel = durationToLabel(windowSpec?.duration, windowSpec?.timeUnit);
      const windowSeconds = durationToSeconds(windowSpec?.duration, windowSpec?.timeUnit);
      const label = windowSeconds === 5 * 60 * 60 ? `Rate Limit (${rawLabel})` : rawLabel;
      const total = toNumber(detail?.limit);
      const remaining = toNumber(detail?.remaining);
      const usedPercent = total && remaining !== null
        ? Math.max(0, Math.min(100, 100 - (remaining / total) * 100))
        : null;
      windows[label] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt: toTimestamp(detail?.resetTime),
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