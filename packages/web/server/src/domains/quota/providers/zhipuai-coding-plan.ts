import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds } from "../transformers.js";
import type { QuotaProviderResult, UsageWindow } from "../types.js";

export const providerId = "zhipuai-coding-plan";
export const providerName = "Zhipu AI Coding Plan";
export const aliases = ["zhipuai-coding-plan"];

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
    const response = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
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
    const mcpToolsTimeLimit = limits.find((limit) => limit?.type === "TIME_LIMIT") as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};

    if (tokensLimit) {
      const ws = resolveWindowSeconds(tokensLimit as { unit?: number; number?: number } | undefined);
      const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
      const usedPercent = typeof tokensLimit?.percentage === "number" ? tokensLimit.percentage : null;
      windows["Tokens"] = toUsageWindow({
        usedPercent,
        windowSeconds: ws,
        resetAt,
      });
    }

    if (mcpToolsTimeLimit) {
      const monthSeconds = 30 * 24 * 60 * 60;
      const resetAt = mcpToolsTimeLimit?.nextResetTime ? normalizeTimestamp(mcpToolsTimeLimit.nextResetTime) : null;
      const usedPercent = typeof mcpToolsTimeLimit?.percentage === "number" ? mcpToolsTimeLimit.percentage : null;
      windows["MCP Tools"] = toUsageWindow({
        usedPercent,
        windowSeconds: monthSeconds,
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