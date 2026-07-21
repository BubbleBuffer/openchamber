export type QuotaProviderId =
  | 'openai'
  | 'codex'
  | 'claude'
  | 'github-copilot'
  | 'github-copilot-addon'
  | 'google'
  | 'kimi-for-coding'
  | 'nano-gpt'
  | 'openrouter'
  | 'zai-coding-plan'
  | 'zhipuai-coding-plan'
  | 'minimax-coding-plan'
  | 'minimax-cn-coding-plan'
  | 'ollama-cloud'
  | 'zhipuai-coding-plan';

import type { QuotaProviderResponse, QuotaProviderUsage, QuotaUsageWindow } from '@contracts/quota';

export type UsageWindow = QuotaUsageWindow;
export type UsageWindows = Pick<QuotaProviderUsage, 'windows'>;
export type ProviderUsage = QuotaProviderUsage;
/** Feature view: supported provider IDs are narrower than the transport contract. */
export type ProviderResult = Omit<QuotaProviderResponse, 'providerId' | 'error'> & {
  providerId: QuotaProviderId;
  error?: string;
};
