// packages/web/src/ui/stores/config/useConfigStore.ts
// Re-exports for backward compatibility during migration.
// New code should import directly from useProviderConfigStore / useAgentConfigStore.

export { useProviderConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "../agents/useAgentConfigStore";
