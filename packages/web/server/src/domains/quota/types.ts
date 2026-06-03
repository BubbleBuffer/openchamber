export interface UsageWindow {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
  valueLabel?: string | null;
}

export interface ProviderUsage {
  windows: Record<string, UsageWindow>;
  models?: Record<string, { windows: Record<string, UsageWindow> }>;
}

export interface QuotaProviderResult {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage: ProviderUsage | null;
  error?: string | null;
  fetchedAt: number;
}

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