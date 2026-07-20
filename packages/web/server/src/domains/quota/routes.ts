import type { Express } from "express";
import { parseQuotaProviderRequest, parseQuotaProviderResponse, parseQuotaProvidersResponse, quotaError } from "../../contracts/quota.js";
import type { QuotaProviderRegistry } from "./types.js";

export interface QuotaRoutesDeps {
  getQuotaProviders(): Promise<QuotaProviderRegistry>;
}

export function registerQuotaRoutes(app: Express, { getQuotaProviders }: QuotaRoutesDeps): void {
  app.get("/api/quota/providers", async (_req, res) => {
    try {
      const providers = await getQuotaProviders();
      const response = { providers: providers.listConfiguredQuotaProviders() };
      if (!parseQuotaProvidersResponse(response).ok) {
        res.status(500).json(quotaError("quota_internal_error"));
        return;
      }
      res.json(response);
    } catch {
      res.status(500).json(quotaError("quota_internal_error"));
    }
  });

  app.get("/api/quota/:providerId", async (req, res) => {
    try {
      const request = parseQuotaProviderRequest(req.params);
      if (!request.ok) {
        return res.status(400).json(quotaError("quota_invalid_request"));
      }
      const providers = await getQuotaProviders();
      const result = await providers.fetchQuotaForProvider(request.value.providerId);
      const response = result.ok ? result : {
        ...result,
        error: result.configured ? "Quota provider failed" : result.error === "Unsupported provider" ? "Unsupported provider" : "Not configured",
        errorCode: result.configured ? "quota_provider_error" as const : result.error === "Unsupported provider" ? "quota_unsupported_provider" as const : "quota_unconfigured" as const,
      };
      if (!parseQuotaProviderResponse(response).ok) {
        return res.status(500).json(quotaError("quota_internal_error"));
      }
      res.json(response);
    } catch {
      res.status(500).json(quotaError("quota_internal_error"));
    }
  });
}
