export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function normalizeTimestamp(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

const ZAI_TOKEN_WINDOW_SECONDS: Record<number, number> = { 3: 3600 };

export function resolveWindowSeconds(limit: { unit?: number; number?: number } | undefined): number | null {
  if (!limit || !limit.number) return null;
  const unitSeconds = ZAI_TOKEN_WINDOW_SECONDS[limit.unit ?? -1];
  if (!unitSeconds) return null;
  return unitSeconds * limit.number;
}

export function resolveWindowLabel(windowSeconds: number | null): string {
  if (!windowSeconds) return "tokens";
  if (windowSeconds % 86400 === 0) {
    const days = windowSeconds / 86400;
    return days === 7 ? "weekly" : `${days}d`;
  }
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600}h`;
  }
  return `${windowSeconds}s`;
}