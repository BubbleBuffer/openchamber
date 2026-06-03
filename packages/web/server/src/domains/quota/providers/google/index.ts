import { buildResult } from "../../formatters.js";
import {
  resolveGoogleAuthSources,
  resolveGoogleOAuthClient,
  DEFAULT_PROJECT_ID,
} from "./auth.js";
import { transformQuotaBucket, transformModelData } from "./transforms.js";
import {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels,
} from "./api.js";
import type { UsageWindow } from "../../types.js";

export {
  resolveGoogleOAuthClient,
  resolveGeminiCliAuth,
  resolveAntigravityAuth,
  resolveGoogleAuthSources,
  DEFAULT_PROJECT_ID,
} from "./auth.js";

export {
  resolveGoogleWindow,
  transformQuotaBucket,
  transformModelData,
} from "./transforms.js";

export {
  refreshGoogleAccessToken,
  fetchGoogleQuotaBuckets,
  fetchGoogleModels,
} from "./api.js";

export const fetchGoogleQuota = async () => {
  const authSources = resolveGoogleAuthSources();
  if (!authSources.length) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  const models: Record<string, { windows: Record<string, UsageWindow> }> = {};
  const sourceErrors: string[] = [];

  for (const source of authSources) {
    const now = Date.now();
    let accessToken: string | null | undefined = source.accessToken;

    if (
      !accessToken ||
      (typeof source.expires === "number" && source.expires <= now)
    ) {
      if (!source.refreshToken) {
        sourceErrors.push(`${source.sourceLabel}: Missing refresh token`);
        continue;
      }
      const { clientId, clientSecret } = resolveGoogleOAuthClient(
        source.sourceId
      );
      accessToken = await refreshGoogleAccessToken(
        source.refreshToken,
        clientId,
        clientSecret
      );
    }

    if (!accessToken) {
      sourceErrors.push(
        `${source.sourceLabel}: Failed to refresh OAuth token`
      );
      continue;
    }

    const projectId = source.projectId ?? DEFAULT_PROJECT_ID;
    let mergedAnyModel = false;

    if (source.sourceId === "gemini" && projectId) {
      const quotaPayload = await fetchGoogleQuotaBuckets(accessToken, projectId);
      const buckets = Array.isArray(quotaPayload?.buckets)
        ? (quotaPayload.buckets as Record<string, unknown>[])
        : [];

      for (const bucket of buckets) {
        const transformed = transformQuotaBucket(bucket, source.sourceId);
        if (transformed) {
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    if (projectId) {
      const payload = await fetchGoogleModels(accessToken, projectId);
      if (payload) {
        for (const [modelName, modelData] of Object.entries(
          (payload.models ?? {}) as Record<string, Record<string, unknown>>
        )) {
          const transformed = transformModelData(
            modelName,
            modelData,
            source.sourceId
          );
          Object.assign(models, transformed);
          mergedAnyModel = true;
        }
      }
    }

    if (!mergedAnyModel) {
      sourceErrors.push(
        `${source.sourceLabel}: Failed to fetch models`
      );
    }
  }

  if (!Object.keys(models).length) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: true,
      error: sourceErrors[0] ?? "Failed to fetch models",
    });
  }

  return buildResult({
    providerId: "google",
    providerName: "Google",
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined,
    },
  });
};