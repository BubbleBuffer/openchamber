import type { Express } from "express";
import type { QuotaProviderRegistry } from "./types.js";

export interface QuotaRoutesDeps {
  getQuotaProviders(): Promise<QuotaProviderRegistry>;
}

export function registerQuotaRoutes(app: Express, { getQuotaProviders }: QuotaRoutesDeps): void {
  app.get("/api/quota/providers", async (_req, res) => {
    try {
      const providers = await getQuotaProviders();
      const result = providers.listConfiguredQuotaProviders();
      res.json({ providers: result });
    } catch (error) {
      console.error("Failed to list quota providers:", error);
      res.status(500).json({ error: (error as Error).message || "Failed to list quota providers" });
    }
  });

  app.get("/api/quota/:providerId", async (req, res) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        return res.status(400).json({ error: "Provider ID is required" });
      }
      const providers = await getQuotaProviders();
      const result = await providers.fetchQuotaForProvider(providerId);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch quota:", error);
      res.status(500).json({ error: (error as Error).message || "Failed to fetch quota" });
    }
  });
}