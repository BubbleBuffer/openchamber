/* eslint-disable @typescript-eslint/no-explicit-any */
import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import { normalizeTimestamp, resolveWindowSeconds, resolveWindowLabel } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "zhipuai-coding-plan";
export const providerName = "ZhipuAI";
export const aliases = ["zhipuai-coding-plan", "zhipuai", "zhipu"];

function getApiKey(): string | null {
  const auth = readAuthFile();
  const oldEntry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKeyFromOld = (oldEntry?.key ?? oldEntry?.token) as string | undefined;

  if (apiKeyFromOld) {
    return apiKeyFromOld;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readConfigLayers } = require("../../../lib/opencode/shared.js") as any;
    const layers = readConfigLayers();
    const { mergedConfig } = layers;

    for (const alias of aliases) {
      const providerConfig = mergedConfig?.provider?.[alias];
      if (providerConfig?.options?.apiKey) {
        return providerConfig.options.apiKey;
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

export const isConfigured = (): boolean => {
  return Boolean(getApiKey());
};

export const fetchQuota = async () => {
  const apiKey = getApiKey();

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
    const limits = Array.isArray(data?.limits)
      ? (data.limits as Record<string, unknown>[])
      : [];
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