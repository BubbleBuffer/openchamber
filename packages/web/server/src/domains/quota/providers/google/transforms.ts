import { asNonEmptyString, toNumber, toTimestamp } from "../../transformers.js";
import { toUsageWindow } from "../../formatters.js";
import type { UsageWindow } from "../../types.js";

const GOOGLE_FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
const GOOGLE_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

export function parseGoogleRefreshToken(rawRefreshToken: unknown): {
  refreshToken: string | null;
  projectId: string | null;
  managedProjectId: string | null;
} {
  const token = asNonEmptyString(rawRefreshToken);
  if (!token) {
    return { refreshToken: null, projectId: null, managedProjectId: null };
  }

  const [rawToken = "", rawProject = "", rawManagedProject = ""] = token.split("|");
  return {
    refreshToken: asNonEmptyString(rawToken),
    projectId: asNonEmptyString(rawProject),
    managedProjectId: asNonEmptyString(rawManagedProject),
  };
}

export function resolveGoogleWindow(
  sourceId: string,
  resetAt: number | null
): { label: string; seconds: number } {
  if (sourceId === "gemini") {
    return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
  }

  if (sourceId === "antigravity") {
    const remainingSeconds = typeof resetAt === "number"
      ? Math.max(0, Math.round((resetAt - Date.now()) / 1000))
      : null;

    if (remainingSeconds !== null && remainingSeconds > 10 * 60 * 60) {
      return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
    }

    return { label: "5h", seconds: GOOGLE_FIVE_HOUR_WINDOW_SECONDS };
  }

  return { label: "daily", seconds: GOOGLE_DAILY_WINDOW_SECONDS };
}

export function transformQuotaBucket(
  bucket: Record<string, unknown> | null,
  sourceId: string
): Record<string, { windows: Record<string, UsageWindow> }> | null {
  const modelId = asNonEmptyString(bucket?.modelId);
  if (!modelId) return null;

  const scopedName = modelId.startsWith(`${sourceId}/`)
    ? modelId
    : `${sourceId}/${modelId}`;

  const remainingFraction = toNumber(bucket?.remainingFraction);
  const remainingPercent = remainingFraction !== null
    ? Math.round(remainingFraction * 100)
    : null;
  const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
  const resetAt = toTimestamp(bucket?.resetTime);
  const window = resolveGoogleWindow(sourceId, resetAt);

  return {
    [scopedName]: {
      windows: {
        [window.label]: toUsageWindow({
          usedPercent,
          windowSeconds: window.seconds,
          resetAt,
        }),
      },
    },
  };
}

export function transformModelData(
  modelName: string,
  modelData: Record<string, unknown>,
  sourceId: string
): Record<string, { windows: Record<string, UsageWindow> }> {
  const scopedName = modelName.startsWith(`${sourceId}/`)
    ? modelName
    : `${sourceId}/${modelName}`;

  const quotaInfo = modelData?.quotaInfo as Record<string, unknown> | undefined;
  const remainingFraction = quotaInfo?.remainingFraction;
  const remainingPercent = typeof remainingFraction === "number"
    ? Math.round(remainingFraction * 100)
    : null;
  const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
  const resetAt = quotaInfo?.resetTime
    ? new Date(quotaInfo.resetTime as string).getTime()
    : null;
  const window = resolveGoogleWindow(sourceId, resetAt);

  return {
    [scopedName]: {
      windows: {
        [window.label]: toUsageWindow({
          usedPercent,
          windowSeconds: window.seconds,
          resetAt,
        }),
      },
    },
  };
}