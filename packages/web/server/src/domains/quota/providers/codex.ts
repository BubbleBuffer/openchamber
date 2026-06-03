import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow, formatMoney } from "../formatters.js";
import { toNumber, toTimestamp } from "../transformers.js";
import type { UsageWindow } from "../types.js";

export const providerId = "codex";
export const providerName = "Codex";
export const aliases = ["openai", "codex", "chatgpt"];

export const isConfigured = (): boolean => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};

export const fetchQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = (entry?.access ?? entry?.token) as string | undefined;
  const accountId = entry?.accountId as string | undefined;

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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    if (accountId) {
      headers["ChatGPT-Account-Id"] = accountId;
    }
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: response.status === 401
          ? "Session expired \u2014 please re-authenticate with OpenAI"
          : `API error: ${response.status}`,
      });
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const primary = (payload?.rate_limit as Record<string, unknown>)?.primary_window as Record<string, unknown> | undefined;
    const secondary = (payload?.rate_limit as Record<string, unknown>)?.secondary_window as Record<string, unknown> | undefined;
    const credits = payload?.credits as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(primary.used_percent),
        windowSeconds: toNumber(primary.limit_window_seconds),
        resetAt: toTimestamp(primary.reset_at),
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: toNumber(secondary.used_percent),
        windowSeconds: toNumber(secondary.limit_window_seconds),
        resetAt: toTimestamp(secondary.reset_at),
      });
    }
    if (credits) {
      const balance = toNumber(credits.balance);
      const unlimited = Boolean(credits.unlimited);
      const label = unlimited
        ? "Unlimited"
        : balance !== null
          ? `$${formatMoney(balance)} remaining`
          : null;
      windows["credits"] = toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: label,
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