// packages/ui/src/stores/useConfigStore.ts
// Re-exports for backward compatibility during migration.
// New code should import directly from useProviderConfigStore / useAgentConfigStore.

export { useProviderConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "../agents/useAgentConfigStore";
export { useVoiceSettingsStore } from "../voice/useVoiceSettingsStore";
