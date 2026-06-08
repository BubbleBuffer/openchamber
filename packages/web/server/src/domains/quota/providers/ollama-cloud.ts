import { homedir } from "node:os";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildResult, toUsageWindow } from "../formatters.js";
import { toNumber } from "../transformers.js";
import type { QuotaProviderResult, UsageWindow } from "../types.js";

const COOKIE_PATH = join(homedir(), ".config", "ollama-quota", "cookie");

function readCookieFile(): string | null {
  try {
    if (!existsSync(COOKIE_PATH)) return null;
    const content = readFileSync(COOKIE_PATH, "utf-8");
    const trimmed = content.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function parseOllamaSettingsHtml(html: string): Record<string, UsageWindow> {
  const windows: Record<string, UsageWindow> = {};
  const sessionMatch = html.match(/Session\s+usage[^0-9]*([0-9.]+)%/i);
  if (sessionMatch) {
    windows["session"] = toUsageWindow({
      usedPercent: toNumber(sessionMatch[1]),
      windowSeconds: null,
      resetAt: null,
    });
  }
  const weeklyMatch = html.match(/Weekly\s+usage[^0-9]*([0-9.]+)%/i);
  if (weeklyMatch) {
    windows["weekly"] = toUsageWindow({
      usedPercent: toNumber(weeklyMatch[1]),
      windowSeconds: null,
      resetAt: null,
    });
  }
  const premiumMatch = html.match(/Premium[^0-9]*([0-9]+)\s*\/\s*([0-9]+)/i);
  if (premiumMatch) {
    const used = toNumber(premiumMatch[1]);
    const total = toNumber(premiumMatch[2]);
    const usedPercent = total && used !== null ? Math.min(100, (used / total) * 100) : null;
    windows["premium"] = toUsageWindow({
      usedPercent,
      windowSeconds: null,
      resetAt: null,
      valueLabel: `${used ?? 0} / ${total ?? 0}`,
    });
  }
  return windows;
}

export const providerId = "ollama-cloud";
export const providerName = "Ollama Cloud";
export const aliases = ["ollama-cloud", "ollamacloud"];

export const isConfigured = (): boolean => {
  const cookie = readCookieFile();
  return Boolean(cookie);
};

export const fetchQuota = async (): Promise<QuotaProviderResult> => {
  const cookie = readCookieFile();

  if (!cookie) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://ollama.com/settings", {
      method: "GET",
      headers: {
        Cookie: cookie,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
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

    const html = await response.text();
    const windows = parseOllamaSettingsHtml(html);

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