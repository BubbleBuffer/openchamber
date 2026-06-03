import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds, resolveWindowLabel } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "zai-coding-plan";
export const providerName = "z.ai";
export const aliases = ["zai-coding-plan", "zai", "z.ai"];

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
    const response = await fetch("https://api.z.ai/api/monitor/usage/quota/limit", {
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
    const data = payload?.data as { limits?: unknown[] } | null | undefined;
    const limits = Array.isArray(data?.limits) ? (data.limits as Record<string, unknown>[]) : [];
    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT") as Record<string, unknown> | undefined;
    const windowSeconds = resolveWindowSeconds(tokensLimit as { unit?: number; number?: number } | undefined);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
    const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null;

    const windows: Record<string, UsageWindow> = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
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