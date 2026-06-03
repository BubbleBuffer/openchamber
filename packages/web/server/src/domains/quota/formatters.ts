import type { UsageWindow, QuotaProviderResult, ProviderUsage } from "./types.js";

export function formatResetTime(timestamp: number): string | null {
  try {
    const resetDate = new Date(timestamp);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();

    if (isToday) {
      return resetDate.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function calculateResetAfterSeconds(resetAt: number | null): number | null {
  if (!resetAt) return null;
  const delta = Math.floor((resetAt - Date.now()) / 1000);
  return delta < 0 ? 0 : delta;
}

export function toUsageWindow({
  usedPercent,
  windowSeconds,
  resetAt,
  valueLabel,
}: {
  usedPercent: number | null;
  windowSeconds: number | null;
  resetAt: number | null;
  valueLabel?: string | null;
}): UsageWindow {
  const resetAfterSeconds = calculateResetAfterSeconds(resetAt);
  const resetFormatted = resetAt ? formatResetTime(resetAt) : null;
  const result: UsageWindow = {
    usedPercent,
    remainingPercent: usedPercent !== null ? Math.max(0, 100 - usedPercent) : null,
    windowSeconds: windowSeconds ?? null,
    resetAfterSeconds,
    resetAt,
    resetAtFormatted: resetFormatted,
    resetAfterFormatted: resetFormatted,
  };
  if (valueLabel) {
    result.valueLabel = valueLabel;
  }
  return result;
}

export function buildResult({
  providerId,
  providerName,
  ok,
  configured,
  usage,
  error,
}: {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage?: ProviderUsage | null;
  error?: string | null;
}): QuotaProviderResult {
  const result: QuotaProviderResult = {
    providerId,
    providerName,
    ok,
    configured,
    usage: usage ?? null,
    fetchedAt: Date.now(),
  };
  if (error) {
    result.error = error;
  }
  return result;
}

export function durationToLabel(duration: unknown, unit: unknown): string {
  if (!duration || !unit) return "limit";
  if (unit === "TIME_UNIT_MINUTE") return `${duration}m`;
  if (unit === "TIME_UNIT_HOUR") return `${duration}h`;
  if (unit === "TIME_UNIT_DAY") return `${duration}d`;
  return "limit";
}

export function durationToSeconds(duration: unknown, unit: unknown): number | null {
  if (!duration || !unit) return null;
  if (unit === "TIME_UNIT_MINUTE") return (duration as number) * 60;
  if (unit === "TIME_UNIT_HOUR") return (duration as number) * 3600;
  if (unit === "TIME_UNIT_DAY") return (duration as number) * 86400;
  return null;
}

export function formatMoney(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toFixed(2);
}