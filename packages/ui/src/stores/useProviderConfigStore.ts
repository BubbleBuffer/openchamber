// packages/ui/src/stores/useProviderConfigStore.ts
// Provider configuration store: providers, connection, model metadata
import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import type { Provider } from "@/lib/opencode/client";
import { opencodeClient } from "@/lib/opencode/client";
import { scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import type { ModelMetadata } from "@/types";
import { getSafeStorage } from "./utils/safeStorage";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { streamDebugEnabled } from "@/stores/utils/streamDebug";
import { useAgentConfigStore } from "./useAgentConfigStore";

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const MODELS_DEV_PROXY_URL = "/api/openchamber/models-metadata";

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

const normalizeProviderId = (value: string) => value?.toLowerCase?.() ?? '';

type ProviderModel = Provider["models"][string];
export type ProviderWithModelList = Omit<Provider, "models"> & { models: ProviderModel[] };

type GitModelSelection = { providerId: string; modelId: string };

const hasProviderModel = (
    providers: ProviderWithModelList[],
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
    providers: ProviderWithModelList[];
    settingsZenModel?: string;
}): GitModelSelection | null => {
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

interface ModelsDevModelEntry {
    id?: string;
    name?: string;
    tool_call?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
    attachment?: boolean;
    modalities?: {
        input?: string[];
        output?: string[];
    };
    cost?: {
        input?: number;
        output?: number;
        cache_read?: number;
        cache_write?: number;
    };
    limit?: {
        context?: number;
        output?: number;
    };
    knowledge?: string;
    release_date?: string;
    last_updated?: string;
}

interface ModelsDevProviderEntry {
    id?: string;
    models?: Record<string, ModelsDevModelEntry | undefined>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");

const isModelsDevModelEntry = (value: unknown): value is ModelsDevModelEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevModelEntry;
    if (candidate.modalities) {
        const { input, output } = candidate.modalities;
        if (input && !isStringArray(input)) {
            return false;
        }
        if (output && !isStringArray(output)) {
            return false;
        }
    }
    return true;
};

const isModelsDevProviderEntry = (value: unknown): value is ModelsDevProviderEntry => {
    if (!isRecord(value)) {
        return false;
    }
    const candidate = value as ModelsDevProviderEntry;
    return candidate.models === undefined || isRecord(candidate.models);
};

const buildModelMetadataKey = (providerId: string, modelId: string) => {
    const normalizedProvider = normalizeProviderId(providerId);
    if (!normalizedProvider || !modelId) {
        return '';
    }
    return `${normalizedProvider}/${modelId}`;
};

const mapModalities = (cap: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean } | undefined): string[] => {
    if (!cap) return [];
    const result: string[] = [];
    if (cap.text) result.push('text');
    if (cap.audio) result.push('audio');
    if (cap.image) result.push('image');
    if (cap.video) result.push('video');
    if (cap.pdf) result.push('pdf');
    return result;
};

const deriveModelMetadata = (providerId: string, model: ProviderModel): ModelMetadata => ({
    id: model.id,
    providerId,
    name: model.name,
    tool_call: model.capabilities?.toolcall,
    reasoning: model.capabilities?.reasoning,
    temperature: model.capabilities?.temperature,
    attachment: model.capabilities?.attachment,
    modalities: model.capabilities ? {
        input: mapModalities(model.capabilities.input),
        output: mapModalities(model.capabilities.output),
    } : undefined,
    cost: model.cost ? {
        input: model.cost.input,
        output: model.cost.output,
        cache_read: model.cost.cache?.read,
        cache_write: model.cost.cache?.write,
    } : undefined,
    limit: model.limit,
    release_date: model.release_date,
});

const transformModelsDevResponse = (payload: unknown): Map<string, ModelMetadata> => {
    const metadataMap = new Map<string, ModelMetadata>();

    if (!isRecord(payload)) {
        return metadataMap;
    }

    for (const [providerKey, providerValue] of Object.entries(payload)) {
        if (!isModelsDevProviderEntry(providerValue)) {
            continue;
        }

        const providerId = typeof providerValue.id === 'string' && providerValue.id.length > 0 ? providerValue.id : providerKey;
        const models = providerValue.models;
        if (!models || !isRecord(models)) {
            continue;
        }

        for (const [modelKey, modelValue] of Object.entries(models)) {
            if (!isModelsDevModelEntry(modelValue)) {
                continue;
            }

            const resolvedModelId =
                typeof modelKey === 'string' && modelKey.length > 0
                    ? modelKey
                    : modelValue.id;

            if (!resolvedModelId || typeof resolvedModelId !== 'string' || resolvedModelId.length === 0) {
                continue;
            }

            const metadata: ModelMetadata = {
                id: typeof modelValue.id === 'string' && modelValue.id.length > 0 ? modelValue.id : resolvedModelId,
                providerId,
                name: typeof modelValue.name === 'string' ? modelValue.name : undefined,
                tool_call: typeof modelValue.tool_call === 'boolean' ? modelValue.tool_call : undefined,
                reasoning: typeof modelValue.reasoning === 'boolean' ? modelValue.reasoning : undefined,
                temperature: typeof modelValue.temperature === 'boolean' ? modelValue.temperature : undefined,
                attachment: typeof modelValue.attachment === 'boolean' ? modelValue.attachment : undefined,
                modalities: modelValue.modalities
                    ? {
                          input: isStringArray(modelValue.modalities.input) ? modelValue.modalities.input : undefined,
                          output: isStringArray(modelValue.modalities.output) ? modelValue.modalities.output : undefined,
                      }
                    : undefined,
                cost: modelValue.cost,
                limit: modelValue.limit,
                knowledge: typeof modelValue.knowledge === 'string' ? modelValue.knowledge : undefined,
                release_date: typeof modelValue.release_date === 'string' ? modelValue.release_date : undefined,
                last_updated: typeof modelValue.last_updated === 'string' ? modelValue.last_updated : undefined,
            };

            const key = buildModelMetadataKey(providerId, resolvedModelId);
            if (key) {
                metadataMap.set(key, metadata);
            }
        }
    }

    return metadataMap;
};

const fetchModelsDevMetadata = async (): Promise<Map<string, ModelMetadata>> => {
    if (typeof fetch !== 'function') {
        return new Map();
    }

    const sources = [MODELS_DEV_PROXY_URL, MODELS_DEV_API_URL];

    for (const source of sources) {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timeout = controller ? setTimeout(() => controller.abort(), 8000) : undefined;

        try {
            const isAbsoluteUrl = /^https?:\/\//i.test(source);
            const requestInit: RequestInit = {
                signal: controller?.signal,
                headers: {
                    Accept: 'application/json',
                },
                cache: 'no-store',
            };

            if (isAbsoluteUrl) {
                requestInit.mode = 'cors';
            } else {
                requestInit.credentials = 'same-origin';
            }

            const response = await fetch(source, requestInit);

            if (!response.ok) {
                throw new Error(`Metadata request to ${source} returned status ${response.status}`);
            }

            const data = await response.json();
            return transformModelsDevResponse(data);
        } catch (error: unknown) {
            if ((error as Error)?.name === 'AbortError') {
                console.warn(`Model metadata request aborted (${source})`);
            } else {
                console.warn(`Failed to fetch model metadata from ${source}:`, error);
            }
        } finally {
            if (timeout) {
                clearTimeout(timeout);
            }
        }
    }

    return new Map();
};

let modelsMetadataInFlight: Promise<Map<string, ModelMetadata>> | null = null;

const ensureModelsMetadataFetch = (
    getModelsMetadata: () => Map<string, ModelMetadata>,
    setModelsMetadata: (metadata: Map<string, ModelMetadata>) => void,
) => {
    const existing = getModelsMetadata();
    if (existing.size > 0) {
        return;
    }

    if (modelsMetadataInFlight) {
        return;
    }

    modelsMetadataInFlight = fetchModelsDevMetadata()
        .then((metadata) => {
            if (metadata.size > 0) {
                setModelsMetadata(metadata);
            }
            return metadata;
        })
        .catch(() => new Map<string, ModelMetadata>())
        .finally(() => {
            modelsMetadataInFlight = null;
        });
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONNECTION_PROBE_TIMEOUT_MS = 800;

const probeOpenCodeHealth = async (timeoutMs = CONNECTION_PROBE_TIMEOUT_MS): Promise<boolean> => {
    return Promise.race([
        opencodeClient.checkHealth().catch(() => false),
        sleep(Math.max(1, timeoutMs)).then(() => false),
    ]);
};

const DIRECTORY_KEY_GLOBAL = "__global__";

const toDirectoryKey = (directory: string | null | undefined): string => {
    const trimmed = typeof directory === 'string' ? directory.trim() : '';
    return trimmed.length > 0 ? trimmed : DIRECTORY_KEY_GLOBAL;
};

const fromDirectoryKey = (key: string): string | null => (key === DIRECTORY_KEY_GLOBAL ? null : key);

const resolveInitialDirectoryKey = (): string => {
    if (typeof window === 'undefined') {
        return DIRECTORY_KEY_GLOBAL;
    }

    const directory = opencodeClient.getDirectory() ?? useDirectoryStore.getState().currentDirectory;
    return toDirectoryKey(directory);
};

export interface DirectoryScopedConfig {
    providers: ProviderWithModelList[];
    currentProviderId: string;
    currentModelId: string;
    currentVariant?: string | undefined;
    selectedProviderId: string;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
}

export interface ProviderConfigStore {
    activeDirectoryKey: string;
    directoryScoped: Record<string, DirectoryScopedConfig>;

    providers: ProviderWithModelList[];
    currentProviderId: string;
    currentModelId: string;
    currentVariant: string | undefined;
    isAutoModel: boolean;
    selectedProviderId: string;
    agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
    defaultProviders: { [key: string]: string };
    isConnected: boolean;
    hasEverConnected: boolean;
    connectionPhase: "connecting" | "connected" | "reconnecting";
    lastDisconnectReason: string | null;
    isInitialized: boolean;
    modelsMetadata: Map<string, ModelMetadata>;

    activateDirectory: (directory: string | null | undefined) => Promise<void>;
    loadProviders: (options?: { directory?: string | null }) => Promise<void>;
    setProvider: (providerId: string) => void;
    setModel: (modelId: string) => void;
    setAutoModel: (isAuto: boolean) => void;
    setCurrentVariant: (variant: string | undefined) => void;
    cycleCurrentVariant: () => void;
    getCurrentModelVariants: () => string[];
    setSelectedProvider: (providerId: string) => void;
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
    getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null;
    probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>;
    checkConnection: () => Promise<boolean>;
    initializeProviders: () => Promise<void>;
    getCurrentProvider: () => ProviderWithModelList | undefined;
    getCurrentModel: () => ProviderModel | undefined;
    getEffectiveModel: () => { providerId: string; modelId: string };
    getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
    getResolvedGitGenerationModel: () => { providerId: string; modelId: string } | null;
}

declare global {
    interface Window {
        __zustand_provider_config_store__?: import("zustand").StoreApi<ProviderConfigStore>;
    }
}

// In-flight dedup: prevent concurrent duplicate loadProviders calls for the same directory
const _inFlightProviders = new Map<string, Promise<void>>();

export const useProviderConfigStore = create<ProviderConfigStore>()(
    devtools(
        persist(
            (set, get) => ({

                activeDirectoryKey: resolveInitialDirectoryKey(),
                directoryScoped: {},

                providers: [],
                currentProviderId: "",
                currentModelId: "",
                isAutoModel: true,
                currentVariant: undefined,
                selectedProviderId: "",
                agentModelSelections: {},
                defaultProviders: {},
                isConnected: false,
                hasEverConnected: false,
                connectionPhase: "connecting",
                lastDisconnectReason: null,
                isInitialized: false,
                modelsMetadata: new Map<string, ModelMetadata>(),

                activateDirectory: async (directory) => {
                    const directoryKey = toDirectoryKey(directory);

                    set((state) => {
                        const snapshot = state.directoryScoped[directoryKey];
                        if (snapshot) {
                            return {
                                activeDirectoryKey: directoryKey,
                                providers: snapshot.providers,
                                currentProviderId: snapshot.currentProviderId,
                                currentModelId: snapshot.currentModelId,
                                currentVariant: snapshot.currentVariant,
                                selectedProviderId: snapshot.selectedProviderId,
                                agentModelSelections: snapshot.agentModelSelections,
                                defaultProviders: snapshot.defaultProviders,
                            };
                        }

                        return {
                            activeDirectoryKey: directoryKey,
                            providers: [],
                            currentProviderId: "",
                            currentModelId: "",
                            selectedProviderId: "",
                            agentModelSelections: {},
                            defaultProviders: {},
                        };
                    });

                    if (!get().isConnected) {
                        return;
                    }

                    await get().loadProviders({ directory: fromDirectoryKey(directoryKey) });
                    // NOTE: loadAgents is not called here - App bootstrap handles agent loading separately
                },

                loadProviders: async (options) => {
                    const directoryKey = toDirectoryKey(options?.directory ?? fromDirectoryKey(get().activeDirectoryKey));

                    // Dedup: if a load is already in-flight for this directory, reuse it
                    const existing = _inFlightProviders.get(directoryKey);
                    if (existing) return existing;

                    const promise = (async () => {
                    const existingSnapshot = get().directoryScoped[directoryKey];
                    const previousProviders = existingSnapshot?.providers ?? (get().activeDirectoryKey === directoryKey ? get().providers : []);
                    const previousDefaults = existingSnapshot?.defaultProviders ?? (get().activeDirectoryKey === directoryKey ? get().defaultProviders : {});
                    let lastError: unknown = null;

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            ensureModelsMetadataFetch(
                                () => get().modelsMetadata,
                                (metadata) => set({ modelsMetadata: metadata }),
                            );
                            const apiResult = await opencodeClient.withDirectory(
                                fromDirectoryKey(directoryKey),
                                () => opencodeClient.getProviders()
                            );
                            const providers = Array.isArray(apiResult?.providers) ? apiResult.providers : [];
                            const defaults = apiResult?.default || {};

                            const processedProviders: ProviderWithModelList[] = providers.map((provider) => {
                                const modelRecord = provider.models ?? {};
                                const models: ProviderModel[] = Object.keys(modelRecord).map((modelId) => modelRecord[modelId]);
                                return {
                                    ...provider,
                                    models,
                                };
                            });

                            set((state) => {
                                const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                                    providers: [],
                                    currentProviderId: "",
                                    currentModelId: "",
                                    selectedProviderId: "",
                                    agentModelSelections: {},
                                    defaultProviders: {},
                                };

                                const nextSnapshot: DirectoryScopedConfig = {
                                    ...baseSnapshot,
                                    providers: processedProviders,
                                    defaultProviders: defaults,
                                };

                                const nextState: Partial<ProviderConfigStore> = {
                                    directoryScoped: {
                                        ...state.directoryScoped,
                                        [directoryKey]: nextSnapshot,
                                    },
                                };

                                if (state.activeDirectoryKey === directoryKey) {
                                    nextState.providers = processedProviders;
                                    nextState.defaultProviders = defaults;

                                    if (!state.currentProviderId && !state.currentModelId) {
                                        const settingsDefaultModel = useAgentConfigStore.getState().settingsDefaultModel;
                                        if (settingsDefaultModel) {
                                            const parsed = parseModelString(settingsDefaultModel);
                                            if (parsed) {
                                                const settingsProvider = processedProviders.find((p) => p.id === parsed.providerId);
                                                if (settingsProvider?.models.some((m) => m.id === parsed.modelId)) {
                                                    const model = settingsProvider.models.find((m) => m.id === parsed.modelId);
                                                    const settingsDefaultVariant = useAgentConfigStore.getState().settingsDefaultVariant;
                                                    const currentVariant = settingsDefaultVariant && (model as { variants?: Record<string, unknown> } | undefined)?.variants?.[settingsDefaultVariant]
                                                        ? settingsDefaultVariant
                                                        : undefined;

                                                    nextState.currentProviderId = parsed.providerId;
                                                    nextState.currentModelId = parsed.modelId;
                                                    nextState.currentVariant = currentVariant;
                                                    nextState.selectedProviderId = parsed.providerId;

                                                    nextSnapshot.currentProviderId = parsed.providerId;
                                                    nextSnapshot.currentModelId = parsed.modelId;
                                                    nextSnapshot.currentVariant = currentVariant;
                                                    nextSnapshot.selectedProviderId = parsed.providerId;
                                                }
                                            }
                                        }
                                    }
                                }

                                return nextState;
                            });

                            return;
                        } catch (error) {
                            lastError = error;
                            const waitMs = 200 * (attempt + 1);
                            await new Promise((resolve) => setTimeout(resolve, waitMs));
                        }
                    }

                    console.error("Failed to load providers:", lastError);

                    set((state) => {
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: [],
                            currentProviderId: "",
                            currentModelId: "",
                            selectedProviderId: "",
                            agentModelSelections: {},
                            defaultProviders: {},
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            providers: previousProviders,
                            defaultProviders: previousDefaults,
                        };

                        const nextState: Partial<ProviderConfigStore> = {
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };

                        if (state.activeDirectoryKey === directoryKey) {
                            nextState.providers = previousProviders;
                            nextState.defaultProviders = previousDefaults;

                            if (!state.currentProviderId && !state.currentModelId) {
                                const settingsDefaultModel = useAgentConfigStore.getState().settingsDefaultModel;
                                if (settingsDefaultModel) {
                                    const parsed = parseModelString(settingsDefaultModel);
                                    if (parsed) {
                                        const settingsProvider = previousProviders.find((p) => p.id === parsed.providerId);
                                        if (settingsProvider?.models.some((m) => m.id === parsed.modelId)) {
                                            const model = settingsProvider.models.find((m) => m.id === parsed.modelId);
                                            const settingsDefaultVariant = useAgentConfigStore.getState().settingsDefaultVariant;
                                            const currentVariant = settingsDefaultVariant && (model as { variants?: Record<string, unknown> } | undefined)?.variants?.[settingsDefaultVariant]
                                                ? settingsDefaultVariant
                                                : undefined;

                                            nextState.currentProviderId = parsed.providerId;
                                            nextState.currentModelId = parsed.modelId;
                                            nextState.currentVariant = currentVariant;
                                            nextState.selectedProviderId = parsed.providerId;

                                            nextSnapshot.currentProviderId = parsed.providerId;
                                            nextSnapshot.currentModelId = parsed.modelId;
                                            nextSnapshot.currentVariant = currentVariant;
                                            nextSnapshot.selectedProviderId = parsed.providerId;
                                        }
                                    }
                                }
                            }
                        }

                        return nextState;
                    });
                    })().finally(() => _inFlightProviders.delete(directoryKey));

                    _inFlightProviders.set(directoryKey, promise);
                    return promise;
                },

                setProvider: (providerId: string) => {
                    const { providers } = get();
                    const provider = providers.find((p) => p.id === providerId);
 
                    if (!provider) {
                        return;
                    }
 
                    const firstModel = provider.models[0];
                    const newModelId = firstModel?.id || "";

                    set((state) => {
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
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                            selectedProviderId: providerId,
                        };

                        return {
                            currentProviderId: providerId,
                            currentModelId: newModelId,
                            selectedProviderId: providerId,
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                setModel: (modelId: string) => {
                    set((state) => {
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
                            currentModelId: modelId,
                        };
 
                        return {
                            currentModelId: modelId,
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                setAutoModel: (isAuto: boolean) => {
                    set({ isAutoModel: isAuto });
                },

                setCurrentVariant: (variant: string | undefined) => {
                    set((state) => {
                        if (state.currentVariant === variant) {
                            return state;
                        }

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
                            currentVariant: variant,
                        };

                        return {
                            currentVariant: variant,
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                getCurrentModelVariants: () => {
                    const model = get().getCurrentModel();
                    const variants = (model as { variants?: Record<string, unknown> } | undefined)?.variants;
                    if (!variants) {
                        return [];
                    }
                    return Object.keys(variants);
                },

                cycleCurrentVariant: () => {
                    const variantKeys = get().getCurrentModelVariants();
                    if (variantKeys.length === 0) {
                        return;
                    }

                    const current = get().currentVariant;
                    if (!current) {
                        get().setCurrentVariant(variantKeys[0]);
                        return;
                    }

                    const index = variantKeys.indexOf(current);
                    if (index === -1 || index === variantKeys.length - 1) {
                        get().setCurrentVariant(undefined);
                        return;
                    }

                    get().setCurrentVariant(variantKeys[index + 1]);
                },
 
                setSelectedProvider: (providerId: string) => {
                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            selectedProviderId: providerId,
                        };

                        return {
                            selectedProviderId: providerId,
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => {
                    set((state) => {
                        const directoryKey = state.activeDirectoryKey;
                        const nextSelections = {
                            ...state.agentModelSelections,
                            [agentName]: { providerId, modelId },
                        };

                        const baseSnapshot: DirectoryScopedConfig = state.directoryScoped[directoryKey] ?? {
                            providers: state.providers,
                            currentProviderId: state.currentProviderId,
                            currentModelId: state.currentModelId,
                            selectedProviderId: state.selectedProviderId,
                            agentModelSelections: state.agentModelSelections,
                            defaultProviders: state.defaultProviders,
                        };

                        const nextSnapshot: DirectoryScopedConfig = {
                            ...baseSnapshot,
                            agentModelSelections: nextSelections,
                        };

                        return {
                            agentModelSelections: nextSelections,
                            directoryScoped: {
                                ...state.directoryScoped,
                                [directoryKey]: nextSnapshot,
                            },
                        };
                    });
                },

                getAgentModelSelection: (agentName: string) => {
                    const { agentModelSelections } = get();
                    return agentModelSelections[agentName] || null;
                },

                probeConnection: async (options?: { timeoutMs?: number }) => {
                    const isHealthy = await probeOpenCodeHealth(options?.timeoutMs);
                    if (isHealthy) {
                        set({ isConnected: true, hasEverConnected: true, connectionPhase: "connected" });
                        return true;
                    }

                    const state = get();
                    if (state.isConnected) {
                        return true;
                    }

                    set({
                        isConnected: false,
                        connectionPhase: state.hasEverConnected ? "reconnecting" : "connecting",
                        lastDisconnectReason: 'health_probe_unhealthy',
                    });
                    return false;
                },

                checkConnection: async () => {
                    const maxAttempts = 5;
                    let attempt = 0;
                    let lastError: unknown = null;

                    while (attempt < maxAttempts) {
                        try {
                            const isHealthy = await opencodeClient.checkHealth();
                            const hasEverConnected = get().hasEverConnected;
                            set(isHealthy
                                ? { isConnected: true, hasEverConnected: true, connectionPhase: "connected" }
                                : {
                                    isConnected: false,
                                    connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
                                    lastDisconnectReason: 'health_check_unhealthy',
                                });
                            return isHealthy;
                        } catch (error) {
                            lastError = error;
                            attempt += 1;
                            const delay = 400 * attempt;
                            await sleep(delay);
                        }
                    }

                    if (lastError) {
                        console.warn("[ProviderConfigStore] Failed to reach OpenCode after retrying:", lastError);
                    }
                    set({
                        isConnected: false,
                        connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                        lastDisconnectReason: 'health_check_failed',
                    });
                    return false;
                },

                initializeProviders: async () => {
                    try {
                        const debug = streamDebugEnabled();
                        if (debug) console.log("Starting provider initialization...");

                        const isConnected = await get().checkConnection();
                        if (debug) console.log("Connection check result:", isConnected);

                        if (!isConnected) {
                            if (debug) console.log("Server not connected");
                            set({
                                isConnected: false,
                                connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                            });
                            return;
                        }

                        if (debug) console.log("Initializing app...");
                        await opencodeClient.initApp();

                        if (debug) console.log("Loading providers...");
                        await get().loadProviders();

                        set({ isInitialized: true, isConnected: true, hasEverConnected: true, connectionPhase: "connected" });
                        if (debug) console.log("Provider initialization completed successfully");
                    } catch (error) {
                        console.error("Failed to initialize providers:", error);
                        set({
                            isInitialized: false,
                            isConnected: false,
                            connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                            lastDisconnectReason: 'init_error',
                        });
                    }
                },

                getCurrentProvider: () => {
                    const { providers, currentProviderId } = get();
                    return providers.find((p) => p.id === currentProviderId);
                },

                getCurrentModel: () => {
                    const provider = get().getCurrentProvider();
                    const { currentModelId } = get();
                    if (!provider) {
                        return undefined;
                    }
                    return provider.models.find((model) => model.id === currentModelId);
                },

                getEffectiveModel: () => {
                    const { isAutoModel, currentProviderId, currentModelId, providers } = get();
                    if (!isAutoModel) {
                        return { providerId: currentProviderId, modelId: currentModelId };
                    }
                    // Cross-read from agent store
                    const agentState = useAgentConfigStore.getState();
                    const agents = agentState.agents;
                    const currentAgentName = agentState.currentAgentName;
                    const agent = agents.find((a) => a.name === currentAgentName);
                    if (agent?.model?.providerID && agent?.model?.modelID) {
                        const provider = providers.find((p) => p.id === agent.model!.providerID);
                        const model = provider?.models.find((m) => m.id === agent.model!.modelID);
                        if (model) {
                            return { providerId: agent.model!.providerID, modelId: agent.model!.modelID };
                        }
                    }
                    return { providerId: currentProviderId, modelId: currentModelId };
                },

                getModelMetadata: (providerId: string, modelId: string) => {
                    const key = buildModelMetadataKey(providerId, modelId);
                    if (!key) {
                        return undefined;
                    }
                    const { modelsMetadata, providers } = get();
                    const cached = modelsMetadata.get(key);
                    if (cached) {
                        return cached;
                    }

                    // Fallback: derive metadata from provider model data
                    const provider = providers.find((p) => p.id === providerId);
                    if (!provider) {
                        return undefined;
                    }
                    const model = provider.models.find((m) => m.id === modelId);
                    if (!model) {
                        return undefined;
                    }

                    return deriveModelMetadata(providerId, model);
                },

                getResolvedGitGenerationModel: () => {
                    const { providers } = get();
                    // Cross-read from agent store
                    const { settingsZenModel } = useAgentConfigStore.getState();
                    return resolveGitGenerationModelSelection({
                        providers,
                        settingsZenModel,
                    });
                },
            }),
            {
                name: "provider-config-store",
                storage: createJSONStorage(() => getSafeStorage()),
                partialize: (state) => ({
                    activeDirectoryKey: state.activeDirectoryKey,
                    directoryScoped: state.directoryScoped,
                    currentProviderId: state.currentProviderId,
                    currentModelId: state.currentModelId,
                    currentVariant: state.currentVariant,
                    isAutoModel: state.isAutoModel,
                    selectedProviderId: state.selectedProviderId,
                    agentModelSelections: state.agentModelSelections,
                    defaultProviders: state.defaultProviders,
                }),
             },
         ),
         {
             name: "provider-config-store-devtools",
         }
    ),
);

if (typeof window !== "undefined") {
    window.__zustand_provider_config_store__ = useProviderConfigStore;
}

let unsubscribeProvidersConfigChanges: (() => void) | null = null;

if (!unsubscribeProvidersConfigChanges) {
    unsubscribeProvidersConfigChanges = subscribeToConfigChanges(async (event) => {
        if (scopeMatches(event, "providers")) {
            const { loadProviders } = useProviderConfigStore.getState();
            await loadProviders();
        }
    });
}

let unsubscribeProviderDirectoryChanges: (() => void) | null = null;

if (typeof window !== "undefined" && !unsubscribeProviderDirectoryChanges) {
    unsubscribeProviderDirectoryChanges = useDirectoryStore.subscribe((state, prevState) => {
        const nextKey = toDirectoryKey(state.currentDirectory);
        const prevKey = toDirectoryKey(prevState.currentDirectory);
        if (nextKey === prevKey) return;
        void useProviderConfigStore.getState().activateDirectory(state.currentDirectory);
    });
}
