import type { QuotaProviderResponse, QuotaProviderUsage, QuotaUsageWindow } from "../../contracts/quota.js";

export type UsageWindow = QuotaUsageWindow;
export type ProviderUsage = QuotaProviderUsage;
export type QuotaProviderResult = QuotaProviderResponse;

export interface ConfiguredProviderEntry {
  providerId: string;
  providerName: string;
  isConfigured: () => boolean;
  fetchQuota: () => Promise<QuotaProviderResult>;
}

export interface QuotaProviderRegistry {
  listConfiguredQuotaProviders(): string[];
  fetchQuotaForProvider(providerId: string): Promise<QuotaProviderResult>;
}

export interface GoogleAuthSource {
  sourceId: string;
  sourceLabel: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  projectId?: string | null;
  expires?: number | null;
  email?: string;
}

export interface QuotaProviderModule {
  providerId: string;
  providerName: string;
  aliases: string[];
  isConfigured: () => boolean;
  fetchQuota: () => Promise<QuotaProviderResult>;
}
