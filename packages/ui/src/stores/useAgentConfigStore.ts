// packages/ui/src/stores/useAgentConfigStore.ts
// Agent configuration store: agents, OpenChamber settings defaults
import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Agent } from "@/lib/opencode/client";
import { opencodeClient } from "@/lib/opencode/client";
import { scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import { getSafeStorage } from "./utils/safeStorage";
import { filterVisibleAgents } from "./useAgentsStore";
import { getRegisteredRuntimeAPIs } from "@/contexts/runtimeAPIRegistry";
import { updateDesktopSettings } from "@/lib/persistence";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useSelectionStore } from "@/sync/selection-store";
import { useProviderConfigStore } from "./useProviderConfigStore";
import type { DirectoryScopedConfig } from "./useProviderConfigStore";

const GIT_UTILITY_PROVIDER_ID = "zen";
const GIT_UTILITY_PREFERRED_MODEL_ID = "big-pickle";

const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};

const parseModelString = (modelString: string): { providerId: string; modelId: string } | null => {
    if (!modelString || typeof modelString !== 'string') {
        return null;
    }
    const parts = modelString.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }
    return { providerId: parts[0], modelId: parts[1] };
};

const hasProviderModel = (
    providers: { id: string; models: { id: string }[] }[],
    providerId: string,
    modelId: string
): boolean => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) {
        return false;
    }
    return provider.models.some((model) => model.id === modelId);
};

const resolveGitGenerationModelSelection = ({
    providers,
    settingsZenModel,
}: {
    providers: { id: string; models: { id: string }[] }[];
    settingsZenModel?: string;
}): { providerId: string; modelId: string } | null => {
    const zenModel = normalizeOptionalString(settingsZenModel);

    if (!Array.isArray(providers) || providers.length === 0) {
        if (zenModel) {
            return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel };
        }
        return null;
    }

    if (zenModel && hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, zenModel)) {
        return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: zenModel };
    }

    if (hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, GIT_UTILITY_PREFERRED_MODEL_ID)) {
        return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: GIT_UTILITY_PREFERRED_MODEL_ID };
    }

    const zenProvider = providers.find((provider) => provider.id === GIT_UTILITY_PROVIDER_ID);
    if (zenProvider?.models.length) {
        const randomIndex = Math.floor(Math.random() * zenProvider.models.length);
        const randomModelId = normalizeOptionalString(zenProvider.models[randomIndex]?.id);
        if (randomModelId) {
            return { providerId: GIT_UTILITY_PROVIDER_ID, modelId: randomModelId };
        }
    }

    return null;
};

interface OpenChamberDefaults {
    defaultModel?: string;
    defaultVariant?: string;
    defaultAgent?: string;
    autoCreateWorktree?: boolean;
    gitmojiEnabled?: boolean;
    defaultFileViewerPreview?: boolean;
    zenModel?: string;
    messageStreamTransport?: 'auto' | 'ws' | 'sse';
}

const fetchOpenChamberDefaults = async (): Promise<OpenChamberDefaults> => {
    try {
        // 1. Runtime settings API (VSCode)
        const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
        if (runtimeSettings) {
            try {
                const result = await runtimeSettings.load();
                const data = result?.settings;
                if (data) {
                    const defaultModel = typeof data?.defaultModel === 'string' ? data.defaultModel.trim() : '';
                    const defaultVariant = typeof data?.defaultVariant === 'string' ? data.defaultVariant.trim() : '';
                    const defaultAgent = typeof data?.defaultAgent === 'string' ? data.defaultAgent.trim() : '';
                    const gitmojiEnabled = typeof data?.gitmojiEnabled === 'boolean' ? data.gitmojiEnabled : undefined;
                    const defaultFileViewerPreview = typeof data?.defaultFileViewerPreview === 'boolean' ? data.defaultFileViewerPreview : undefined;
                    const zenModel = typeof data?.zenModel === 'string' ? data.zenModel.trim() : '';
                    const messageStreamTransport =
                        data?.messageStreamTransport === 'ws' || data?.messageStreamTransport === 'sse' || data?.messageStreamTransport === 'auto'
                            ? data.messageStreamTransport
                            : undefined;

                    return {
                        defaultModel: defaultModel.length > 0 ? defaultModel : undefined,
                        defaultVariant: defaultVariant.length > 0 ? defaultVariant : undefined,
                        defaultAgent: defaultAgent.length > 0 ? defaultAgent : undefined,
                        autoCreateWorktree: typeof data?.autoCreateWorktree === 'boolean' ? data.autoCreateWorktree : undefined,
                        gitmojiEnabled,
                        defaultFileViewerPreview,
                        zenModel: zenModel.length > 0 ? zenModel : undefined,
                        messageStreamTransport,
                    };
                }
            } catch {
                // Fall through to fetch
            }
        }

        // 2. Fetch API (Web/server)
        const response = await fetch('/api/config/settings', {
            method: 'GET',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
            return {};
        }
        const data = await response.json();
        const defaultModel = typeof data?.defaultModel === 'string' ? data.defaultModel.trim() : '';
        const defaultVariant = typeof data?.defaultVariant === 'string' ? data.defaultVariant.trim() : '';
        const defaultAgent = typeof data?.defaultAgent === 'string' ? data.defaultAgent.trim() : '';
        const gitmojiEnabled = typeof data?.gitmojiEnabled === 'boolean' ? data.gitmojiEnabled : undefined;
        const defaultFileViewerPreview = typeof data?.defaultFileViewerPreview === 'boolean' ? data.defaultFileViewerPreview : undefined;
        const zenModel = typeof data?.zenModel === 'string' ? data.zenModel.trim() : '';
        const messageStreamTransport =
            data?.messageStreamTransport === 'ws' || data?.messageStreamTransport === 'sse' || data?.messageStreamTransport === 'auto'
                ? data.messageStreamTransport
                : undefined;

        return {
            defaultModel: defaultModel.length > 0 ? defaultModel : undefined,
            defaultVariant: defaultVariant.length > 0 ? defaultVariant : undefined,
            defaultAgent: defaultAgent.length > 0 ? defaultAgent : undefined,
            autoCreateWorktree: typeof data?.autoCreateWorktree === 'boolean' ? data.autoCreateWorktree : undefined,
            gitmojiEnabled,
            defaultFileViewerPreview,
            zenModel: zenModel.length > 0 ? zenModel : undefined,
            messageStreamTransport,
        };
    } catch {
        return {};
    }
};

const isPrimaryMode = (mode?: string) => mode === "primary" || mode === "all" || mode === undefined || mode === null;

const DIRECTORY_KEY_GLOBAL = "__global__";

const toDirectoryKey = (directory: string | null | undefined): string => {
    const trimmed = typeof directory === 'string' ? directory.trim() : '';
    return trimmed.length > 0 ? trimmed : DIRECTORY_KEY_GLOBAL;
};

const fromDirectoryKey = (key: string): string | null => (key === DIRECTORY_KEY_GLOBAL ? null : key);

export interface AgentConfigStore {
    agents: Agent[];
    currentAgentName: string | undefined;
    settingsDefaultModel: string | undefined;
    settingsDefaultVariant: string | undefined;
    settingsDefaultAgent: string | undefined;
    settingsAutoCreateWorktree: boolean;
    settingsGitmojiEnabled: boolean;
    settingsDefaultFileViewerPreview: boolean;
    settingsZenModel: string | undefined;
    settingsMessageStreamTransport: 'auto' | 'ws' | 'sse';

    loadAgents: (options?: { directory?: string | null }) => Promise<boolean>;
    setAgent: (agentName: string | undefined) => void;
    setSettingsDefaultModel: (model: string | undefined) => void;
    setSettingsDefaultVariant: (variant: string | undefined) => void;
    setSettingsDefaultAgent: (agent: string | undefined) => void;
    setSettingsAutoCreateWorktree: (enabled: boolean) => void;
    setSettingsGitmojiEnabled: (enabled: boolean) => void;
    setSettingsDefaultFileViewerPreview: (enabled: boolean) => void;
    setSettingsZenModel: (model: string | undefined) => void;
    setSettingsMessageStreamTransport: (transport: 'auto' | 'ws' | 'sse') => void;
    getCurrentAgent: () => Agent | undefined;
    getVisibleAgents: () => Agent[];
}

// In-flight dedup: prevent concurrent duplicate loadAgents calls for the same directory
const _inFlightAgents = new Map<string, Promise<boolean>>();

export const useAgentConfigStore = create<AgentConfigStore>()(
    devtools(
        persist(
            (set, get) => ({

                agents: [],
                currentAgentName: undefined,
                settingsDefaultModel: undefined,
                settingsDefaultVariant: undefined,
                settingsDefaultAgent: undefined,
                settingsAutoCreateWorktree: false,
                settingsGitmojiEnabled: false,
                settingsDefaultFileViewerPreview: false,
                settingsZenModel: undefined,
                settingsMessageStreamTransport: 'auto',

                loadAgents: async (options) => {
                    // Read directory key from provider store
                    const providerState = useProviderConfigStore.getState();
                    const directoryKey = toDirectoryKey(options?.directory ?? fromDirectoryKey(providerState.activeDirectoryKey));

                    // Dedup: if a load is already in-flight for this directory, reuse it
                    const existing = _inFlightAgents.get(directoryKey);
                    if (existing) return existing;

                    const promise = (async (): Promise<boolean> => {
                    let lastError: unknown = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            // Fetch agents and OpenChamber settings in parallel
                            const [agents, openChamberDefaults] = await Promise.all([
                                opencodeClient.withDirectory(fromDirectoryKey(directoryKey), () => opencodeClient.listAgents()),
                                fetchOpenChamberDefaults(),
                            ]);

                            const safeAgents = Array.isArray(agents) ? agents : [];

                            // Read providers again (may have changed since loop start)
                            const providerStateForAgents = useProviderConfigStore.getState();
                            const currentProviders = providerStateForAgents.activeDirectoryKey === directoryKey
                                ? providerStateForAgents.providers
                                : (providerStateForAgents.directoryScoped[directoryKey]?.providers ?? []);

                            const existingZenModel = normalizeOptionalString(get().settingsZenModel);

                            const defaultZenModel = normalizeOptionalString(openChamberDefaults.zenModel);

                            const resolvedExistingGitSelection = resolveGitGenerationModelSelection({
                                providers: currentProviders,
                                settingsZenModel: existingZenModel,
                            });

                            const resolvedDefaultGitSelection = resolveGitGenerationModelSelection({
                                providers: currentProviders,
                                settingsZenModel: defaultZenModel,
                            });

                            const resolvedGitSelection = resolvedExistingGitSelection || resolvedDefaultGitSelection;
                            const resolvedGitModelId = resolvedGitSelection?.modelId;
                            const resolvedZenModel = resolvedGitModelId || defaultZenModel || existingZenModel;

                            // Update agent store state
                            set((state) => ({
                                agents: safeAgents,
                                settingsDefaultModel: openChamberDefaults.defaultModel,
                                settingsDefaultVariant: openChamberDefaults.defaultVariant,
                                settingsDefaultAgent: openChamberDefaults.defaultAgent,
                                settingsAutoCreateWorktree: openChamberDefaults.autoCreateWorktree ?? false,
                                settingsGitmojiEnabled: openChamberDefaults.gitmojiEnabled ?? false,
                                settingsDefaultFileViewerPreview: openChamberDefaults.defaultFileViewerPreview ?? false,
                                settingsZenModel: resolvedZenModel,
                                settingsMessageStreamTransport: openChamberDefaults.messageStreamTransport ?? state.settingsMessageStreamTransport ?? 'auto',
                            }));

                            // Update provider store's directoryScoped (agent fields are stored separately)
                            useProviderConfigStore.setState((ps) => {
                                const baseSnapshot: DirectoryScopedConfig = ps.directoryScoped[directoryKey] ?? {
                                    providers: currentProviders,
                                    currentProviderId: "",
                                    currentModelId: "",
                                    currentVariant: undefined,
                                    selectedProviderId: "",
                                    agentModelSelections: {},
                                    defaultProviders: {},
                                };

                                const nextSnapshot: DirectoryScopedConfig = {
                                    ...baseSnapshot,
                                    providers: currentProviders,
                                };

                                const nextState: Partial<typeof ps> = {
                                    directoryScoped: {
                                        ...ps.directoryScoped,
                                        [directoryKey]: nextSnapshot,
                                    },
                                };

                                return nextState;
                            });

                            const shouldPersistResolvedZenModel =
                                !!resolvedZenModel &&
                                resolvedZenModel !== defaultZenModel;

                            if (shouldPersistResolvedZenModel && resolvedZenModel) {
                                updateDesktopSettings({
                                    zenModel: resolvedZenModel,
                                    gitProviderId: '',
                                    gitModelId: '',
                                }).catch(() => {
                                    // Ignore errors - best effort cleanup
                                });
                            }

                            if (safeAgents.length === 0) {
                                set({ currentAgentName: undefined });

                                useProviderConfigStore.setState((ps) => {
                                    const baseSnapshot: DirectoryScopedConfig = ps.directoryScoped[directoryKey] ?? {
                                        providers: currentProviders,
                                        currentProviderId: "",
                                        currentModelId: "",
                                        currentVariant: undefined,
                                        selectedProviderId: "",
                                        agentModelSelections: {},
                                        defaultProviders: {},
                                    };

                                    const nextSnapshot: DirectoryScopedConfig = {
                                        ...baseSnapshot,
                                        providers: currentProviders,
                                    };

                                    const nextState: Partial<typeof ps> = {
                                        directoryScoped: {
                                            ...ps.directoryScoped,
                                            [directoryKey]: nextSnapshot,
                                        },
                                    };

                                    return nextState;
                                });

                                return true;
                            }

                            // Helper to validate model exists in providers
                            const validateModel = (providerId: string, modelId: string): boolean => {
                                const provider = currentProviders.find((p) => p.id === providerId);
                                if (!provider) return false;
                                return provider.models.some((m) => m.id === modelId);
                            };

                            // --- Agent Selection ---
                            // Priority: settings.defaultAgent → build → first primary → first agent
                            const primaryAgents = safeAgents.filter((agent) => isPrimaryMode(agent.mode));
                            const buildAgent = primaryAgents.find((agent) => agent.name === "build");
                            const fallbackAgent = buildAgent || primaryAgents[0] || safeAgents[0];

                            let resolvedAgent: Agent = fallbackAgent;

                            // Track invalid settings to clear
                             const invalidSettings: { defaultModel?: string; defaultVariant?: string; defaultAgent?: string } = {};

                            // 1. Check OpenChamber settings for default agent
                            if (openChamberDefaults.defaultAgent) {
                                const settingsAgent = safeAgents.find((agent) => agent.name === openChamberDefaults.defaultAgent);
                                if (settingsAgent) {
                                    resolvedAgent = settingsAgent;
                                } else {
                                    // Agent no longer exists - mark for clearing
                                    invalidSettings.defaultAgent = '';
                                }
                            }

                             // --- Model Selection ---
                             // Priority: settings.defaultModel → agent's preferred model → first provider/first model
                             let resolvedProviderId: string | undefined;
                             let resolvedModelId: string | undefined;
                             let resolvedVariant: string | undefined;

                             // 1. Check OpenChamber settings for default model
                             if (openChamberDefaults.defaultModel) {
                                 const parsed = parseModelString(openChamberDefaults.defaultModel);
                                 if (parsed && validateModel(parsed.providerId, parsed.modelId)) {
                                     resolvedProviderId = parsed.providerId;
                                     resolvedModelId = parsed.modelId;

                                     if (openChamberDefaults.defaultVariant) {
                                         const provider = currentProviders.find((p) => p.id === parsed.providerId);
                                         const model = provider?.models.find((m) => m.id === parsed.modelId) as { variants?: Record<string, unknown> } | undefined;
                                         const variants = model?.variants;
                                         if (variants && Object.prototype.hasOwnProperty.call(variants, openChamberDefaults.defaultVariant)) {
                                             resolvedVariant = openChamberDefaults.defaultVariant;
                                         } else {
                                             invalidSettings.defaultVariant = '';
                                         }
                                     }
                                 } else {
                                     // Model no longer exists - mark for clearing
                                     invalidSettings.defaultModel = '';
                                 }
                             }

                            // 2. Fall back to agent's preferred model
                            if (!resolvedProviderId && resolvedAgent?.model?.providerID && resolvedAgent?.model?.modelID) {
                                const { providerID, modelID } = resolvedAgent.model;
                                if (validateModel(providerID, modelID)) {
                                    resolvedProviderId = providerID;
                                    resolvedModelId = modelID;
                                }
                            }

                            // 3. Last resort: first provider's first model
                            if (!resolvedProviderId) {
                                const firstProvider = currentProviders[0];
                                const firstModel = firstProvider?.models[0];
                                if (firstProvider && firstModel) {
                                    resolvedProviderId = firstProvider.id;
                                    resolvedModelId = firstModel.id;
                                }
                            }

                            // Update agent store with resolved currentAgentName
                            set({ currentAgentName: resolvedAgent.name });

                            // Update provider store with resolved provider/model/variant
                            useProviderConfigStore.setState((ps) => {
                                const baseSnapshot: DirectoryScopedConfig = ps.directoryScoped[directoryKey] ?? {
                                    providers: currentProviders,
                                    currentProviderId: "",
                                    currentModelId: "",
                                    currentVariant: undefined,
                                    selectedProviderId: "",
                                    agentModelSelections: {},
                                    defaultProviders: {},
                                };

                                const nextSnapshot: DirectoryScopedConfig = {
                                    ...baseSnapshot,
                                    providers: currentProviders,
                                    currentProviderId: resolvedProviderId ?? baseSnapshot.currentProviderId,
                                    currentModelId: resolvedModelId ?? baseSnapshot.currentModelId,
                                    currentVariant: resolvedVariant,
                                };

                                const nextState: Partial<typeof ps> = {
                                    directoryScoped: {
                                        ...ps.directoryScoped,
                                        [directoryKey]: nextSnapshot,
                                    },
                                };

                                if (ps.activeDirectoryKey === directoryKey) {
                                    if (resolvedProviderId && resolvedModelId) {
                                        nextState.currentProviderId = resolvedProviderId;
                                        nextState.currentModelId = resolvedModelId;
                                        nextState.currentVariant = resolvedVariant;
                                    }
                                }

                                return nextState;
                            });

                            // Clear invalid settings from storage (best-effort cleanup)
                            if (Object.keys(invalidSettings).length > 0) {
                                set({
                                    settingsDefaultModel: invalidSettings.defaultModel !== undefined ? undefined : get().settingsDefaultModel,
                                    settingsDefaultVariant: invalidSettings.defaultVariant !== undefined ? undefined : get().settingsDefaultVariant,
                                    settingsDefaultAgent: invalidSettings.defaultAgent !== undefined ? undefined : get().settingsDefaultAgent,
                                });
                                updateDesktopSettings(invalidSettings).catch(() => {
                                    // Ignore errors - best effort cleanup
                                });
                            }

                            return true;
                        } catch (error) {
                            lastError = error;
                            const waitMs = 200 * (attempt + 1);
                            await new Promise((resolve) => setTimeout(resolve, waitMs));
                        }
                    }

                    console.error("Failed to load agents:", lastError);

                    return false;
                    })().finally(() => _inFlightAgents.delete(directoryKey));

                    _inFlightAgents.set(directoryKey, promise);
                    return promise;
                },

                setAgent: (agentName: string | undefined) => {
                    const { agents, settingsDefaultModel, settingsDefaultVariant } = get();
                    const { providers } = useProviderConfigStore.getState();

                    // Set agent name in agent store
                    set({ currentAgentName: agentName });

                    // Update directoryScoped in provider store (agents managed separately)
                    useProviderConfigStore.setState((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            currentVariant: state.currentVariant,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        return {
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: baseSnapshot,
                            },
                        };
                    });

                    if (agentName) {
                        const { currentSessionId } = useSessionUIStore.getState();
                        const selState = useSelectionStore.getState();

                        if (currentSessionId) {
                            selState.saveSessionAgentSelection(currentSessionId, agentName);
                        }

                        if (currentSessionId && useSessionUIStore.getState().isOpenChamberCreatedSession(currentSessionId)) {
                            const existingAgentModel = selState.getAgentModelForSession(currentSessionId, agentName);
                            if (!existingAgentModel) {
                                useSessionUIStore.getState().initializeNewOpenChamberSession(currentSessionId, agents);
                            }
                        }
                    }

                    if (agentName) {
                        const { currentSessionId } = useSessionUIStore.getState();

                        if (currentSessionId) {
                            const existingAgentModel = useSelectionStore.getState().getAgentModelForSession(currentSessionId, agentName);
                            if (existingAgentModel) {
                                return;
                            }
                        }

                        // If settings has a default model, use it instead of agent's preferred
                        if (settingsDefaultModel) {
                            const parsed = parseModelString(settingsDefaultModel);
                            if (parsed) {
                                const settingsProvider = providers.find((p) => p.id === parsed.providerId);
                                if (settingsProvider?.models.some((m) => m.id === parsed.modelId)) {
                                    useProviderConfigStore.setState((state) => {
                                        const directoryKey = state.activeDirectoryKey;
                                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                            providers: state.providers,
                                            currentProviderId: state.currentProviderId,
                                            currentModelId: state.currentModelId,
                                            currentVariant: state.currentVariant,
                                            selectedProviderId: state.selectedProviderId,
                                            agentModelSelections: state.agentModelSelections,
                                            defaultProviders: state.defaultProviders,
                                        };

                                        let nextVariant: string | undefined;
                                        if (settingsDefaultVariant) {
                                            const settingsProvider = providers.find((p) => p.id === parsed.providerId);
                                            const model = settingsProvider?.models.find((m) => m.id === parsed.modelId) as { variants?: Record<string, unknown> } | undefined;
                                            const variants = model?.variants;
                                            if (variants && Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) {
                                                nextVariant = settingsDefaultVariant;
                                            }
                                        }

                                        const nextSnapshot: DirectoryScopedConfig = {
                                            ...baseSnapshot,
                                            currentProviderId: parsed.providerId,
                                            currentModelId: parsed.modelId,
                                            currentVariant: nextVariant,
                                        };

                                        return {
                                            currentProviderId: parsed.providerId,
                                            currentModelId: parsed.modelId,
                                            currentVariant: nextVariant,
                                            directoryScoped: {
                                                ...state.directoryScoped,
                                                [directoryKey]: nextSnapshot,
                                            },
                                        };
                                    });
                                    return;
                                }
                            }
                        }

                        // Fall back to agent's preferred model
                        const agent = agents.find((candidate) => candidate.name === agentName);
                        const agentModelSelection = agent?.model;
                        if (agentModelSelection?.providerID && agentModelSelection?.modelID) {
                            const { providerID, modelID } = agentModelSelection;
                            const agentProvider = providers.find((provider) => provider.id === providerID);
                            const agentModel = agentProvider?.models.find((model) => model.id === modelID);

                            if (agentModel) {
                                useProviderConfigStore.setState((state) => {
                                    const directoryKey = state.activeDirectoryKey;
                                    const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                        providers: state.providers,
                                        currentProviderId: state.currentProviderId,
                                        currentModelId: state.currentModelId,
                                        currentVariant: state.currentVariant,
                                        selectedProviderId: state.selectedProviderId,
                                        agentModelSelections: state.agentModelSelections,
                                        defaultProviders: state.defaultProviders,
                                    };

                                    const nextSnapshot: DirectoryScopedConfig = {
                                        ...baseSnapshot,
                                        currentProviderId: providerID,
                                        currentModelId: modelID,
                                        selectedProviderId: providerID,
                                    };

                                    return {
                                        currentProviderId: providerID,
                                        currentModelId: modelID,
                                        selectedProviderId: providerID,
                                        directoryScoped: {
                                            ...state.directoryScoped,
                                            [directoryKey]: nextSnapshot,
                                        },
                                    };
                                });
                            }
                        }
                    }
                },

                setSettingsDefaultModel: (model: string | undefined) => {
                    set({ settingsDefaultModel: model });
                },

                setSettingsDefaultVariant: (variant: string | undefined) => {
                    set({ settingsDefaultVariant: variant });
                },

                setSettingsDefaultAgent: (agent: string | undefined) => {
                    set({ settingsDefaultAgent: agent });
                },

                setSettingsAutoCreateWorktree: (enabled: boolean) => {
                    set({ settingsAutoCreateWorktree: enabled });
                },

                setSettingsGitmojiEnabled: (enabled: boolean) => {
                    set({ settingsGitmojiEnabled: enabled });
                },

                setSettingsDefaultFileViewerPreview: (enabled: boolean) => {
                    set({ settingsDefaultFileViewerPreview: enabled });
                },

                setSettingsZenModel: (model: string | undefined) => {
                    set({ settingsZenModel: model });
                },

                setSettingsMessageStreamTransport: (transport: 'auto' | 'ws' | 'sse') => {
                    set({ settingsMessageStreamTransport: transport });
                },

                getCurrentAgent: () => {
                    const { agents, currentAgentName } = get();
                    if (!currentAgentName) return undefined;
                    return agents.find((a) => a.name === currentAgentName);
                },

                getVisibleAgents: () => {
                    const { agents } = get();
                    return filterVisibleAgents(agents);
                },
            }),
            {
                name: "agent-config-store",
                // RC-11: Bump version + add migrate when partialize fields change.
                version: 1,
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state) => ({
                    currentAgentName: state.currentAgentName,
                    settingsDefaultModel: state.settingsDefaultModel,
                    settingsDefaultVariant: state.settingsDefaultVariant,
                    settingsDefaultAgent: state.settingsDefaultAgent,
                    settingsAutoCreateWorktree: state.settingsAutoCreateWorktree,
                    settingsGitmojiEnabled: state.settingsGitmojiEnabled,
                    settingsDefaultFileViewerPreview: state.settingsDefaultFileViewerPreview,
                    settingsZenModel: state.settingsZenModel,
                    settingsMessageStreamTransport: state.settingsMessageStreamTransport,
                }),
             },
         ),
         {
             name: "agent-config-store-devtools",
         }
    ),
);

let unsubscribeAgentsConfigChanges: (() => void) | null = null;

if (!unsubscribeAgentsConfigChanges) {
    unsubscribeAgentsConfigChanges = subscribeToConfigChanges(async (event) => {
        if (scopeMatches(event, "agents")) {
            const { loadAgents } = useAgentConfigStore.getState();
            await loadAgents();
        }
    });
}
