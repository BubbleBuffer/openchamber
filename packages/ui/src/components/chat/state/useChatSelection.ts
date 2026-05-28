import React from 'react';
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';

interface UseChatSelectionOptions {
  sessionId: string | null;
}

export function useChatSelection({ sessionId }: UseChatSelectionOptions) {
  const getEffectiveModel = useProviderConfigStore((state) => state.getEffectiveModel);
  const effectiveModel = getEffectiveModel();

  const currentAgentName = useAgentConfigStore((state) => state.currentAgentName);
  const currentVariant = useProviderConfigStore((state) => state.currentVariant);

  return React.useMemo(
    () => ({
      agentName: currentAgentName ?? null,
      modelId: effectiveModel?.modelId ?? null,
      providerId: effectiveModel?.providerId ?? null,
      variant: currentVariant ?? null,
      directory: null, // TODO: read from session/directory store if needed
      projectId: null,
    }),
    [effectiveModel, currentAgentName, currentVariant],
  );
}
