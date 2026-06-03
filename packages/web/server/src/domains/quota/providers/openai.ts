import { readAuthFile } from "../../auth/provider-auth.js";
import { getAuthEntry, normalizeAuthEntry } from "../auth-utils.js";
import { buildResult, toUsageWindow } from "../formatters.js";
import type { UsageWindow } from "../types.js";

export const providerId = "openai";
export const providerName = "OpenAI";
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
    const primary = (payload?.rate_limit as Record<string, unknown>)?.primary_window as Record<string, unknown> | undefined;
    const secondary = (payload?.rate_limit as Record<string, unknown>)?.secondary_window as Record<string, unknown> | undefined;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: (primary.used_percent as number) ?? null,
        windowSeconds: (primary.limit_window_seconds as number) ?? null,
        resetAt: primary.reset_at ? (primary.reset_at as number) * 1000 : null,
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: (secondary.used_percent as number) ?? null,
        windowSeconds: (secondary.limit_window_seconds as number) ?? null,
        resetAt: secondary.reset_at ? (secondary.reset_at as number) * 1000 : null,
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