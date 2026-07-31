import React from 'react';
import {
    RiAddLine,
    RiAiAgentLine,
    RiArrowDownSLine,
    RiArrowGoBackLine,
    RiArrowRightSLine,
    RiBrainAi3Line,
    RiCheckLine,
    RiPencilAiLine,
    RiSearchLine,
    RiSparklingLine,
    RiStarFill,
    RiStarLine,
    RiTimeLine,
} from '@remixicon/react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { TextLoop } from '@/components/ui/TextLoop';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAgentColor } from '@/lib/theme/agentColors';
import { useDeviceInfo } from '@/lib/device';
import { cn, fuzzyMatch } from '@/lib/utils';
import { useContextStore } from '@/stores/contextStore';
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { useDialogStore } from '@/stores/useDialogStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useDirectorySync, useSessionMessages } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { useUIStore } from '@/stores/useUIStore';
import { useModelPreferencesStore } from '@/stores/useModelPreferencesStore';
import { useModelLists } from '@/hooks/useModelLists';
import { useIsTextTruncated } from '@/hooks/useIsTextTruncated';
import { AgentDetailsTooltipContent, MobileAgentDetailsPanel } from './AgentDetails';
import { ModelDetailsTooltipContent, MobileModelDetailsPanel } from './ModelDetails';
import {
    MobileModelControlsPanels,
    type MobileModelProvider,
} from './MobileModelControlsPanels';
import { getModelDisplayName, matchesModelSearch } from './modelSearch';
import {
    formatCompactPrice,
    formatTokens,
    getCapabilityIcons,
    getModalityIcons,
} from './modelMetadata';
import type { MobileControlsPanel } from './mobileControlsUtils';

type ProviderModel = Record<string, unknown> & { id?: string; name?: string };

type ModelApplyResult = 'applied' | 'provider-missing' | 'model-missing';

const ADD_PROVIDER_ID = '__add_provider__';

interface ModelControlsProps {
    className?: string;
    mobilePanel?: MobileControlsPanel;
    onMobilePanelChange?: (panel: MobileControlsPanel) => void;
    onMobilePanelSelection?: () => void;
    onAgentPanelSelection?: () => void;
}

export const ModelControls: React.FC<ModelControlsProps> = ({
    className,
    mobilePanel,
    onMobilePanelChange,
    onMobilePanelSelection,
    onAgentPanelSelection,
}) => {
    const providers = useProviderConfigStore((state) => state.providers);
    const currentProviderId = useProviderConfigStore((state) => state.currentProviderId);
    const currentModelId = useProviderConfigStore((state) => state.currentModelId);
    const currentVariant = useProviderConfigStore((state) => state.currentVariant);
    const currentAgentName = useAgentConfigStore((state) => state.currentAgentName);
    const settingsDefaultVariant = useAgentConfigStore((state) => state.settingsDefaultVariant);
    const settingsDefaultAgent = useAgentConfigStore((state) => state.settingsDefaultAgent);
    const setProvider = useProviderConfigStore((state) => state.setProvider);
    const setSelectedProvider = useProviderConfigStore((state) => state.setSelectedProvider);
    const setModel = useProviderConfigStore((state) => state.setModel);
    const setCurrentVariant = useProviderConfigStore((state) => state.setCurrentVariant);
    const getCurrentModelVariants = useProviderConfigStore((state) => state.getCurrentModelVariants);
    const setAgent = useAgentConfigStore((state) => state.setAgent);
    const getCurrentProvider = useProviderConfigStore((state) => state.getCurrentProvider);
    const getModelMetadata = useProviderConfigStore((state) => state.getModelMetadata);
    const getCurrentAgent = useAgentConfigStore((state) => state.getCurrentAgent);
    const getVisibleAgents = useAgentConfigStore((state) => state.getVisibleAgents);
    const isAutoModel = useProviderConfigStore((s) => s.isAutoModel);
    const setAutoModel = useProviderConfigStore((s) => s.setAutoModel);

    // Use visible agents (excludes hidden internal agents)
    const agents = getVisibleAgents();
    const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === 'primary'), [agents]);

    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const getDirectoryForSession = useSessionUIStore((s) => s.getDirectoryForSession);
    const sync = useSync();

    const getSessionModelSelection = useSelectionStore((state) => state.getSessionModelSelection);
    const saveSessionModelSelection = useSelectionStore((state) => state.saveSessionModelSelection);
    const saveSessionAgentSelection = useSelectionStore((state) => state.saveSessionAgentSelection);
    const saveAgentModelForSession = useSelectionStore((state) => state.saveAgentModelForSession);
    const getAgentModelForSession = useSelectionStore((state) => state.getAgentModelForSession);
    const saveAgentModelVariantForSession = useSelectionStore((state) => state.saveAgentModelVariantForSession);
    const getAgentModelVariantForSession = useSelectionStore((state) => state.getAgentModelVariantForSession);

    const contextHydrated = useContextStore((state) => state.hasHydrated);

    const sessionSavedAgentName = useSelectionStore((state) =>
        currentSessionId ? state.sessionAgentSelections.get(currentSessionId) ?? null : null
    );

    const stickySessionAgentRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!currentSessionId) {
            stickySessionAgentRef.current = null;
            return;
        }
        if (sessionSavedAgentName) {
            stickySessionAgentRef.current = sessionSavedAgentName;
        }
    }, [currentSessionId, sessionSavedAgentName]);

    const stickySessionAgentName = currentSessionId ? stickySessionAgentRef.current : null;

    // Prefer per-session selection over global config to avoid flicker during server-driven mode switches.
    const uiAgentName = currentSessionId
        ? (sessionSavedAgentName || stickySessionAgentName || currentAgentName)
        : currentAgentName;

    const toggleFavoriteModel = useModelPreferencesStore((state) => state.toggleFavoriteModel);
    const isFavoriteModel = useModelPreferencesStore((state) => state.isFavoriteModel);
    const collapsedModelProviders = useModelPreferencesStore((state) => state.collapsedModelProviders);
    const toggleModelProviderCollapsed = useModelPreferencesStore((state) => state.toggleModelProviderCollapsed);
    const addRecentModel = useModelPreferencesStore((state) => state.addRecentModel);
    const addRecentEffort = useModelPreferencesStore((state) => state.addRecentEffort);
    const isModelSelectorOpen = useDialogStore((state) => state.isModelSelectorOpen);
    const setModelSelectorOpen = useDialogStore((state) => state.setModelSelectorOpen);
    const setSettingsDialogOpen = useDialogStore((state) => state.setSettingsDialogOpen);
    const setSettingsPage = useUIStore((state) => state.setSettingsPage);
    const hiddenModels = useModelPreferencesStore((state) => state.hiddenModels);
    const collapsedProviderSet = React.useMemo(
        () => new Set(collapsedModelProviders.map((providerId) => providerId.trim()).filter(Boolean)),
        [collapsedModelProviders]
    );

    // Separate state for agent selector to avoid conflict with model selector
    const [isAgentSelectorOpen, setIsAgentSelectorOpen] = React.useState(false);
    const { favoriteModelsList, recentModelsList } = useModelLists();

    const { isMobile } = useDeviceInfo();
    const isDesktop = !isMobile;
    const isCompact = isMobile;
    const [localMobilePanel, setLocalMobilePanel] = React.useState<MobileControlsPanel>(null);
    const usingExternalMobilePanel = mobilePanel !== undefined && typeof onMobilePanelChange === 'function';
    const activeMobilePanel = usingExternalMobilePanel ? mobilePanel : localMobilePanel;
    const setActiveMobilePanel = usingExternalMobilePanel ? onMobilePanelChange : setLocalMobilePanel;
    const [mobileTooltipOpen, setMobileTooltipOpen] = React.useState<'model' | 'agent' | null>(null);
    const manualVariantSelectionRef = React.useRef(false);
    const closeMobilePanel = React.useCallback(() => setActiveMobilePanel(null), [setActiveMobilePanel]);
    const closeMobileTooltip = React.useCallback(() => setMobileTooltipOpen(null), []);
    const longPressTimerRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
    // Use global state for model selector (allows Ctrl+M shortcut)
    const agentMenuOpen = isModelSelectorOpen;
    const setAgentMenuOpen = setModelSelectorOpen;
    const openAddProviderSettings = React.useCallback(() => {
        setSelectedProvider(ADD_PROVIDER_ID);
        setSettingsPage('providers');
        setSettingsDialogOpen(true);
        setAgentMenuOpen(false);
        closeMobilePanel();
    }, [setSelectedProvider, setSettingsPage, setSettingsDialogOpen, setAgentMenuOpen, closeMobilePanel]);
    const [desktopModelQuery, setDesktopModelQuery] = React.useState('');
    const [modelSelectedIndex, setModelSelectedIndex] = React.useState(0);
    const modelItemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
    const [pendingThinkingVariants, setPendingThinkingVariants] = React.useState<Map<string, string | undefined>>(new Map());
    const [adjustedThinkingModels, setAdjustedThinkingModels] = React.useState<Set<string>>(new Set());

    // Handle model selector close behavior (separate from agent selector)
    const prevModelSelectorOpenRef = React.useRef(isModelSelectorOpen);
    React.useEffect(() => {
        const wasOpen = prevModelSelectorOpenRef.current;
        prevModelSelectorOpenRef.current = isModelSelectorOpen;

        if (!isModelSelectorOpen) {
            setDesktopModelQuery('');
            setModelSelectedIndex(0);
            setPendingThinkingVariants(new Map());
            setAdjustedThinkingModels(new Set());

            // Restore focus to chat input when model selector closes
            if (wasOpen && !isCompact) {
                requestAnimationFrame(() => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
                    textarea?.focus();
                });
            }
        }
    }, [isModelSelectorOpen, isCompact]);

    // Handle agent selector close behavior
    const [agentSearchQuery, setAgentSearchQuery] = React.useState('');
    React.useEffect(() => {
        if (!isAgentSelectorOpen) {
            setAgentSearchQuery('');
            if (!isCompact) {
                requestAnimationFrame(() => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
                    textarea?.focus();
                });
            }
        }
    }, [isAgentSelectorOpen, isCompact]);

    // Reset selected index when search query changes
    React.useEffect(() => {
        setModelSelectedIndex(0);
    }, [desktopModelQuery]);

    const selectableDesktopAgents = React.useMemo(() => {
        return agents.filter((agent) => agent.mode !== 'subagent');
    }, [agents]);

    const sortedAndFilteredAgents = React.useMemo(() => {
        const sorted = [...selectableDesktopAgents].sort((a, b) => a.name.localeCompare(b.name));
        if (!agentSearchQuery.trim()) {
            return sorted;
        }
        return sorted.filter((agent) =>
            fuzzyMatch(agent.name, agentSearchQuery) ||
            (agent.description && fuzzyMatch(agent.description, agentSearchQuery))
        );
    }, [selectableDesktopAgents, agentSearchQuery]);

    const defaultAgentName = React.useMemo(() => {
        if (settingsDefaultAgent) {
            const found = selectableDesktopAgents.find(a => a.name === settingsDefaultAgent);
            if (found) return found.name;
        }
        const buildAgent = selectableDesktopAgents.find(a => a.name === 'build');
        if (buildAgent) return buildAgent.name;
        return selectableDesktopAgents[0]?.name;
    }, [settingsDefaultAgent, selectableDesktopAgents]);

    const currentAgent = React.useMemo(() => {
        if (uiAgentName) {
            return agents.find((agent) => agent.name === uiAgentName);
        }
        return getCurrentAgent?.();
    }, [agents, getCurrentAgent, uiAgentName]);

    const buttonHeight = isMobile ? 'h-9' : 'h-8';
    const controlIconSize = isMobile ? 'h-5 w-5' : 'h-4 w-4';
    const controlTextSize = isCompact ? 'typography-micro' : 'typography-meta';
    const inlineGapClass = isMobile ? 'gap-x-1' : 'gap-x-3';

    const currentProvider = getCurrentProvider();
    const models = Array.isArray(currentProvider?.models) ? currentProvider.models : [];

    const visibleProviders = React.useMemo(() => {
        return providers
            .map((provider) => {
                const providerModels = Array.isArray(provider.models) ? provider.models : [];
                const visibleModels = providerModels.filter((model: ProviderModel) => {
                    const modelId = typeof model?.id === 'string' ? model.id : '';
                    return !hiddenModels.some(
                        (item) => item.providerID === String(provider.id) && item.modelID === modelId
                    );
                });
                return { ...provider, models: visibleModels };
            })
            .filter((provider) => provider.models.length > 0);
    }, [providers, hiddenModels]);

    const currentMetadata =
        currentProviderId && currentModelId ? getModelMetadata(currentProviderId, currentModelId) : undefined;

    // Compute from current model each render to avoid stale variants
    // in draft/session transitions.
    const availableVariants = getCurrentModelVariants();
    const hasVariants = availableVariants.length > 0;

    const prevAgentNameRef = React.useRef<string | undefined>(undefined);
    const latestLoadedUserChoiceRestoreRef = React.useRef<string | null>(null);

    const currentSessionDirectory = currentSessionId ? getDirectoryForSession(currentSessionId) : undefined;
    const hasCurrentSessionMessagesEntry = useDirectorySync(
        React.useCallback(
            (state) => (currentSessionId ? state.message[currentSessionId] !== undefined : false),
            [currentSessionId],
        ),
        currentSessionDirectory ?? undefined,
    );
    const currentSessionMessagesFromSync = useSessionMessages(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const latestLoadedUserChoice = React.useMemo(() => {
        for (let i = currentSessionMessagesFromSync.length - 1; i >= 0; i -= 1) {
            const message = currentSessionMessagesFromSync[i] as typeof currentSessionMessagesFromSync[number] & {
                model?: { providerID?: string; modelID?: string; variant?: string };
                variant?: string;
                mode?: string;
            };
            if (message.role !== 'user') {
                continue;
            }

            const providerID = typeof message.model?.providerID === 'string' && message.model.providerID.trim().length > 0
                ? message.model.providerID
                : undefined;
            const modelID = typeof message.model?.modelID === 'string' && message.model.modelID.trim().length > 0
                ? message.model.modelID
                : undefined;
            const agent = typeof message.agent === 'string' && message.agent.trim().length > 0
                ? message.agent
                : (typeof message.mode === 'string' && message.mode.trim().length > 0 ? message.mode : undefined);
            // OpenCode 1.4.0 moved variant from top-level to model.variant.
            // Prefer the new location, fall back to the legacy one for older servers.
            const variantCandidate = message.model?.variant ?? message.variant;
            const variant = typeof variantCandidate === 'string' && variantCandidate.trim().length > 0
                ? variantCandidate
                : undefined;

            return { id: message.id, agent, providerID, modelID, variant };
        }
        return null;
    }, [currentSessionMessagesFromSync]);

    const tryApplyModelSelection = React.useCallback(
        (providerId: string, modelId: string, agentName?: string): ModelApplyResult => {
            if (!providerId || !modelId) {
                return 'model-missing';
            }

            const provider = providers.find(p => p.id === providerId);
            if (!provider) {
                return 'provider-missing';
            }

            const providerModels = Array.isArray(provider.models) ? provider.models : [];
            const modelExists = providerModels.find((m: ProviderModel) => m.id === modelId);
            if (!modelExists) {
                return 'model-missing';
            }

            const providerMatches = currentProviderId === providerId;
            const modelMatches = currentModelId === modelId;
            if (providerMatches && modelMatches) {
                return 'applied';
            }

            setProvider(providerId);
            setModel(modelId);

            if (currentSessionId) {
                saveSessionModelSelection(currentSessionId, providerId, modelId);
                if (agentName) {
                    saveAgentModelForSession(currentSessionId, agentName, providerId, modelId);
                }
            }

            return 'applied';
        },
        [providers, currentProviderId, currentModelId, setProvider, setModel, currentSessionId, saveAgentModelForSession, saveSessionModelSelection],
    );

    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            return;
        }

        if (!contextHydrated || providers.length === 0 || !hasCurrentSessionMessagesEntry || !latestLoadedUserChoice?.providerID || !latestLoadedUserChoice.modelID) {
            return;
        }

        const restoreKey = [
            currentSessionId,
            latestLoadedUserChoice.id,
            latestLoadedUserChoice.agent ?? '',
            latestLoadedUserChoice.providerID,
            latestLoadedUserChoice.modelID,
            latestLoadedUserChoice.variant ?? '',
        ].join('|');

        if (latestLoadedUserChoiceRestoreRef.current === restoreKey) {
            return;
        }

        if (latestLoadedUserChoice.agent && currentAgentName !== latestLoadedUserChoice.agent) {
            setAgent(latestLoadedUserChoice.agent);
        }

        const applyResult = tryApplyModelSelection(
            latestLoadedUserChoice.providerID,
            latestLoadedUserChoice.modelID,
            latestLoadedUserChoice.agent || currentAgentName || undefined,
        );
        if (applyResult !== 'applied') {
            return;
        }

        if (latestLoadedUserChoice.agent) {
            saveSessionAgentSelection(currentSessionId, latestLoadedUserChoice.agent);
            saveAgentModelVariantForSession(
                currentSessionId,
                latestLoadedUserChoice.agent,
                latestLoadedUserChoice.providerID,
                latestLoadedUserChoice.modelID,
                latestLoadedUserChoice.variant,
            );
        }
        saveSessionModelSelection(currentSessionId, latestLoadedUserChoice.providerID, latestLoadedUserChoice.modelID);
        latestLoadedUserChoiceRestoreRef.current = restoreKey;

    }, [
        currentSessionId,
        currentAgentName,
        contextHydrated,
        providers,
        hasCurrentSessionMessagesEntry,
        latestLoadedUserChoice,
        setAgent,
        tryApplyModelSelection,
        saveSessionAgentSelection,
        saveAgentModelVariantForSession,
        saveSessionModelSelection,
    ]);

    React.useEffect(() => {
        if (!currentSessionId) {
            latestLoadedUserChoiceRestoreRef.current = null;
            return;
        }

        if (!contextHydrated || providers.length === 0 || agents.length === 0) {
            return;
        }

        const applySavedSelections = (): 'resolved' | 'waiting' | 'continue' => {
            const savedSessionModel = getSessionModelSelection(currentSessionId);
            const savedAgentName = currentSessionId
                ? useSelectionStore.getState().getSessionAgentSelection(currentSessionId)
                : null;
            if (savedAgentName) {
                if (currentAgentName !== savedAgentName) {
                    setAgent(savedAgentName);
                }

                const savedModel = getAgentModelForSession(currentSessionId, savedAgentName);
                if (savedModel) {
                    const result = tryApplyModelSelection(savedModel.providerId, savedModel.modelId, savedAgentName);
                    if (result === 'applied') {
                        return 'resolved';
                    }
                    if (result === 'provider-missing') {
                        return 'waiting';
                    }
                }
            }

            if (savedSessionModel) {
                const result = tryApplyModelSelection(savedSessionModel.providerId, savedSessionModel.modelId, savedAgentName || currentAgentName || undefined);
                if (result === 'applied') {
                    return 'resolved';
                }
                if (result === 'provider-missing') {
                    return 'waiting';
                }
            }

            for (const agent of agents) {
                const selection = getAgentModelForSession(currentSessionId, agent.name);
                if (!selection) {
                    continue;
                }

                if (currentAgentName !== agent.name) {
                    setAgent(agent.name);
                }

                const existingSelection = useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current;
                if (!existingSelection) {
                    saveSessionAgentSelection(currentSessionId, agent.name);
                }
                const result = tryApplyModelSelection(selection.providerId, selection.modelId, agent.name);
                if (result === 'applied') {
                    return 'resolved';
                }
                if (result === 'provider-missing') {
                    return 'waiting';
                }
            }

            return 'continue';
        };

        const applyFallbackAgent = () => {
            if (agents.length === 0) {
                return;
            }

            const existingSelection = currentSessionId
                ? (useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current)
                : null;

            // If we already have a valid agent selected (often from server-injected mode switch),
            // don't override it with a fallback.
            const preferred =
                (currentSessionId
                    ? (useSelectionStore.getState().getSessionAgentSelection(currentSessionId) || stickySessionAgentRef.current)
                    : null) ||
                currentAgentName;
            if (preferred && agents.some((agent) => agent.name === preferred)) {
                if (currentAgentName !== preferred) {
                    setAgent(preferred);
                }
                return;
            }

            const fallbackAgent = agents.find(agent => agent.name === 'build') || primaryAgents[0] || agents[0];
            if (!fallbackAgent) {
                return;
            }

            if (!existingSelection) {
                saveSessionAgentSelection(currentSessionId, fallbackAgent.name);
            }

            if (currentAgentName !== fallbackAgent.name) {
                setAgent(fallbackAgent.name);
            }

            if (fallbackAgent.model?.providerID && fallbackAgent.model?.modelID) {
                tryApplyModelSelection(fallbackAgent.model.providerID, fallbackAgent.model.modelID, fallbackAgent.name);
            }
        };

        const savedOutcome = applySavedSelections();
        if (savedOutcome === 'resolved' || savedOutcome === 'waiting') {
            return;
        }

        if (!hasCurrentSessionMessagesEntry) {
            if (!sync.isLoading(currentSessionId)) {
                void sync.syncSession(currentSessionId);
            }
            return;
        }

        if (latestLoadedUserChoice) {
            return;
        }

        applyFallbackAgent();
    }, [
        currentSessionId,
        hasCurrentSessionMessagesEntry,
        latestLoadedUserChoice,
        agents,
        primaryAgents,
        currentAgentName,
        getSessionModelSelection,
        getAgentModelForSession,
        setAgent,
        tryApplyModelSelection,
        saveSessionAgentSelection,
        contextHydrated,
        providers,
        sync,
    ]);

    React.useEffect(() => {
        if (!contextHydrated) {
            return;
        }

        const handleAgentSwitch = async () => {
            try {
                if (currentAgentName !== prevAgentNameRef.current) {
                    prevAgentNameRef.current = currentAgentName;

                    if (currentAgentName && currentSessionId) {
                        await new Promise(resolve => setTimeout(resolve, 50));

                        const persistedChoice = getAgentModelForSession(currentSessionId, currentAgentName);

                        if (persistedChoice) {
                            const result = tryApplyModelSelection(
                                persistedChoice.providerId,
                                persistedChoice.modelId,
                                currentAgentName,
                            );
                            if (result === 'applied' || result === 'provider-missing') {
                                return;
                            }
                        }

                        const agent = agents.find(a => a.name === currentAgentName);
                        if (agent?.model?.providerID && agent?.model?.modelID) {
                            const result = tryApplyModelSelection(
                                agent.model.providerID,
                                agent.model.modelID,
                                currentAgentName,
                            );
                            if (result === 'provider-missing') {
                                return;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('[ModelControls] Agent change error:', error);
            }
        };

        handleAgentSwitch();
    }, [currentAgentName, currentSessionId, getAgentModelForSession, tryApplyModelSelection, agents, contextHydrated]);

    React.useEffect(() => {
        if (!contextHydrated || !currentAgentName) {
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
            return;
        }

        if (!currentProviderId || !currentModelId) {
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
            return;
        }

        if (availableVariants.length === 0) {
            manualVariantSelectionRef.current = false;
            setCurrentVariant(undefined);
            return;
        }

        if (currentVariant && !availableVariants.includes(currentVariant)) {
            setCurrentVariant(undefined);
            return;
        }

        // Draft state (no session yet): seed from settings default, but don't override
        // user selection while drafting.
        if (!currentSessionId) {
            if (!currentVariant && !manualVariantSelectionRef.current) {
                const desired = settingsDefaultVariant && availableVariants.includes(settingsDefaultVariant)
                    ? settingsDefaultVariant
                    : undefined;
                setCurrentVariant(desired);
            }
            return;
        }

        const savedVariant = getAgentModelVariantForSession(
            currentSessionId,
            currentAgentName,
            currentProviderId,
            currentModelId,
        );

        const resolvedSaved = savedVariant && availableVariants.includes(savedVariant)
            ? savedVariant
            : undefined;

        setCurrentVariant(resolvedSaved);
        manualVariantSelectionRef.current = false;
    }, [
        availableVariants,
        contextHydrated,
        currentSessionId,
        currentAgentName,
        currentProviderId,
        currentModelId,
        currentVariant,
        getAgentModelVariantForSession,
        setCurrentVariant,
        settingsDefaultVariant,
    ]);

    React.useEffect(() => {
        manualVariantSelectionRef.current = false;
    }, [currentProviderId, currentModelId]);

    const handleVariantSelect = React.useCallback((variant: string | undefined) => {
        manualVariantSelectionRef.current = true;
        setCurrentVariant(variant);

        if (currentProviderId && currentModelId) {
            addRecentEffort(currentProviderId, currentModelId, variant);
        }

        if (currentSessionId && currentAgentName && currentProviderId && currentModelId) {
            saveAgentModelVariantForSession(
                currentSessionId,
                currentAgentName,
                currentProviderId,
                currentModelId,
                variant,
            );
        }
    }, [
        addRecentEffort,
        currentAgentName,
        currentModelId,
        currentProviderId,
        currentSessionId,
        saveAgentModelVariantForSession,
        setCurrentVariant,
    ]);

    const handleAgentChange = React.useCallback((agentName: string) => {
        try {
            setAgent(agentName);
            setAgentMenuOpen(false);

            if (currentSessionId) {
                saveSessionAgentSelection(currentSessionId, agentName);
            }
            if (isCompact) {
                closeMobilePanel();
                const callback = onAgentPanelSelection || onMobilePanelSelection;
                if (callback) {
                    requestAnimationFrame(() => {
                        callback();
                    });
                }
            }
        } catch (error) {
            console.error('[ModelControls] Handle agent change error:', error);
        }
    }, [
        closeMobilePanel,
        currentSessionId,
        isCompact,
        onAgentPanelSelection,
        onMobilePanelSelection,
        saveSessionAgentSelection,
        setAgent,
        setAgentMenuOpen,
    ]);

    const handleProviderAndModelChange = React.useCallback((providerId: string, modelId: string) => {
        try {
            // Close panels immediately on any selection attempt
            setAgentMenuOpen(false);
            if (isCompact) {
                closeMobilePanel();
            }

            const result = tryApplyModelSelection(providerId, modelId, currentAgentName || undefined);
            if (result !== 'applied') {
                if (result === 'provider-missing') {
                    console.error('[ModelControls] Provider not available for selection:', providerId);
                } else if (result === 'model-missing') {
                    console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
                }
                return;
            }
            // Add to recent models on successful selection
            addRecentModel(providerId, modelId);
            setAutoModel(false);

            if (isCompact) {
                if (onMobilePanelSelection) {
                    requestAnimationFrame(() => {
                        onMobilePanelSelection();
                    });
                }
            }
            if (!isCompact || !onMobilePanelSelection) {
                // Restore focus to chat input after model selection
                requestAnimationFrame(() => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
                    textarea?.focus();
                });
            }
        } catch (error) {
            console.error('[ModelControls] Handle model change error:', error);
        }
    }, [
        addRecentModel,
        closeMobilePanel,
        currentAgentName,
        isCompact,
        onMobilePanelSelection,
        setAgentMenuOpen,
        setAutoModel,
        tryApplyModelSelection,
    ]);

    const handleAutoSelect = React.useCallback(() => {
        setAgentMenuOpen(false);
        if (isCompact) {
            closeMobilePanel();
            if (onMobilePanelSelection) {
                requestAnimationFrame(() => {
                    onMobilePanelSelection();
                });
            }
        }
        setAutoModel(true);
    }, [closeMobilePanel, isCompact, onMobilePanelSelection, setAgentMenuOpen, setAutoModel]);

    const getProviderDisplayName = () => {
        const provider = providers.find(p => p.id === currentProviderId);
        return provider?.name || currentProviderId;
    };

    const getCurrentModelDisplayName = () => {
        if (isAutoModel) return 'Auto';
        if (!currentProviderId || !currentModelId) return 'Not selected';
        if (models.length === 0) return 'Not selected';
        const currentModel = models.find((m: ProviderModel) => m.id === currentModelId);
        return getModelDisplayName(currentModel);
    };

    const currentModelDisplayName = getCurrentModelDisplayName();
    const modelLabelRef = React.useRef<HTMLSpanElement>(null);
    const isModelLabelTruncated = useIsTextTruncated(modelLabelRef, [currentModelDisplayName, isCompact]);

    const getAgentDisplayName = () => {
        if (!uiAgentName) {
            const buildAgent = primaryAgents.find(agent => agent.name === 'build');
            const defaultAgent = buildAgent || primaryAgents[0];
            return defaultAgent ? capitalizeAgentName(defaultAgent.name) : 'Select Agent';
        }
        const agent = agents.find(a => a.name === uiAgentName);
        return agent ? capitalizeAgentName(agent.name) : capitalizeAgentName(uiAgentName);
    };

    const capitalizeAgentName = (name: string) => {
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const handleLongPressStart = React.useCallback((type: 'model' | 'agent') => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = setTimeout(() => {
            setMobileTooltipOpen(type);
        }, 500);
    }, []);

    const handleLongPressEnd = React.useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
        }
    }, []);

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    // Helper to render a single model row in the flat dropdown
    const renderModelRow = (
        model: ProviderModel,
        providerID: string,
        modelID: string,
        keyPrefix: string,
        flatIndex: number,
        isHighlighted: boolean
    ) => {
        const metadata = getModelMetadata(providerID, modelID);
        const capabilityIcons = getCapabilityIcons(metadata).map((icon) => ({
            ...icon,
            id: `cap-${icon.key}`,
        }));
        const modalityIcons = [
            ...getModalityIcons(metadata, 'input'),
            ...getModalityIcons(metadata, 'output'),
        ];
        const uniqueModalityIcons = Array.from(
            new Map(modalityIcons.map((icon) => [icon.key, icon])).values()
        ).map((icon) => ({ ...icon, id: `mod-${icon.key}` }));
        const indicatorIcons = [...capabilityIcons, ...uniqueModalityIcons];
        const contextTokens = formatTokens(metadata?.limit?.context);
        const isSelected = currentProviderId === providerID && currentModelId === modelID;
        const isFavorite = isFavoriteModel(providerID, modelID);

        const showProviderLogo = keyPrefix === 'fav' || keyPrefix === 'recent';

        // Check if model supports thinking variants - variants are on the model object, not metadata
        const modelVariants = (model as { variants?: Record<string, unknown> } | undefined)?.variants;
        const hasThinkingVariants = modelVariants && Object.keys(modelVariants).length > 0;
        const mapKey = `${providerID}:${modelID}`;
        const wasAdjusted = adjustedThinkingModels.has(mapKey);
        const pendingVariant = pendingThinkingVariants.get(mapKey);
        const effectiveVariant = pendingVariant ?? (isSelected ? currentVariant : undefined);

        // Build thinking variant display - only show for models that were adjusted with arrow keys
        let thinkingDisplay: React.ReactNode = null;
        if (hasThinkingVariants && wasAdjusted && (isHighlighted || isSelected)) {
            const displayLabel = effectiveVariant
                ? effectiveVariant.charAt(0).toUpperCase() + effectiveVariant.slice(1)
                : 'Default';
            thinkingDisplay = (
                <span key="thinking" className="typography-micro text-muted-foreground whitespace-nowrap">
                    Thinking: {displayLabel}
                </span>
            );
        }

        // Build animated metadata slides for desktop (price/capabilities) - only shown when not showing thinking
        const priceText = formatCompactPrice(metadata);
        const hasPrice = priceText !== null;
        const hasCapabilities = indicatorIcons.length > 0;

        const slides: React.ReactNode[] = [];
        if (hasPrice) {
            slides.push(
                <span key="price" className="typography-micro text-muted-foreground whitespace-nowrap">
                    {priceText}
                </span>
            );
        }
        if (hasCapabilities) {
            slides.push(
                <div key="capabilities" className="flex items-center gap-0.5">
                    {indicatorIcons.map(({ id, icon: Icon, label }) => (
                        <span
                            key={id}
                            className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground"
                            aria-label={label}
                            role="img"
                            title={label}
                        >
                            <Icon className="h-2.5 w-2.5" />
                        </span>
                    ))}
                </div>
            );
        }

        const shouldShowThinking = hasThinkingVariants && wasAdjusted;
        const shouldAnimate = slides.length > 1 && (isHighlighted || isSelected) && !shouldShowThinking;
        const staticMetadataSlide = slides[0];

        return (
            <div
                key={`${keyPrefix}-${providerID}-${modelID}`}
                ref={(el) => { modelItemRefs.current[flatIndex] = el; }}
                className={cn(
                    "typography-meta group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer",
                    isHighlighted ? "bg-interactive-selection" : "hover:bg-interactive-hover/50"
                )}
                onClick={() => handleProviderAndModelChange(providerID, modelID)}
                onPointerEnter={() => setModelSelectedIndex(flatIndex)}
            >
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {showProviderLogo && (
                        <ProviderLogo providerId={providerID} className="h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    <span className="font-medium truncate">
                        {getModelDisplayName(model)}
                    </span>
                    {metadata?.limit?.context ? (
                        <span className="typography-micro text-muted-foreground flex-shrink-0">
                            {contextTokens}
                        </span>
                    ) : null}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Metadata slot: thinking variant for adjusted models, otherwise price/capabilities carousel */}
                    {shouldShowThinking && (isHighlighted || isSelected) ? (
                        <div className="flex w-[140px] justify-end items-center">
                            {thinkingDisplay}
                        </div>
                    ) : slides.length > 0 ? (
                        <div className={cn(
                            "items-center",
                            shouldAnimate ? "flex w-[140px] justify-end" : ((isHighlighted || isSelected) ? "flex" : "hidden group-hover:flex")
                        )}>
                            {shouldAnimate ? (
                                <TextLoop interval={2.1} transition={{ duration: 0.25 }} trigger={shouldAnimate}>
                                    {slides}
                                </TextLoop>
                            ) : (
                                <>
                                    {staticMetadataSlide}
                                </>
                            )}
                        </div>
                    ) : null}
                    {isSelected && (
                        <RiCheckLine className="h-4 w-4 text-primary" />
                    )}
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavoriteModel(providerID, modelID);
                        }}
                        className={cn(
                            "model-favorite-button flex h-4 w-4 items-center justify-center hover:text-primary/80",
                            isFavorite ? "text-primary" : "text-muted-foreground"
                        )}
                        aria-label={isFavorite ? "Unfavorite" : "Favorite"}
                        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                        {isFavorite ? (
                            <RiStarFill className="h-3.5 w-3.5" />
                        ) : (
                            <RiStarLine className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        );
    };

    // Filter models based on search query
    const filterByQuery = (modelName: string, providerName: string, query: string) => {
        if (!query.trim()) return true;
        return (
            matchesModelSearch(modelName, query) ||
            matchesModelSearch(providerName, query)
        );
    };

    const renderModelSelector = () => {
        const normalizedDesktopQuery = desktopModelQuery.trim();
        const forceExpandProviders = normalizedDesktopQuery.length > 0;

        // Filter favorites
        const filteredFavorites = favoriteModelsList.filter(({ model, providerID }) => {
            const provider = providers.find(p => p.id === providerID);
            const providerName = provider?.name || providerID;
            const modelName = getModelDisplayName(model);
            return filterByQuery(modelName, providerName, desktopModelQuery);
        });

        // Filter recents
        const filteredRecents = recentModelsList.filter(({ model, providerID }) => {
            const provider = providers.find(p => p.id === providerID);
            const providerName = provider?.name || providerID;
            const modelName = getModelDisplayName(model);
            return filterByQuery(modelName, providerName, desktopModelQuery);
        });

        // Filter providers and their models
        const filteredProviders = visibleProviders
            .map((provider) => {
                const providerModels = Array.isArray(provider.models) ? provider.models : [];
                const filteredModels = providerModels.filter((model: ProviderModel) => {
                    const modelName = getModelDisplayName(model);
                    return filterByQuery(modelName, provider.name || provider.id || '', desktopModelQuery);
                });
                return { ...provider, models: filteredModels };
            })
            .filter((provider) => provider.models.length > 0);

        const providerSections = filteredProviders.map((provider) => {
            const providerId = typeof provider.id === 'string' ? provider.id : '';
            const isExpanded = forceExpandProviders || !collapsedProviderSet.has(providerId);
            const models = Array.isArray(provider.models) ? (provider.models as ProviderModel[]) : [];
            return {
                provider,
                isExpanded,
                models,
                visibleModels: isExpanded ? models : [],
            };
        });

        const hasResults =
            filteredFavorites.length > 0 ||
            filteredRecents.length > 0 ||
            filteredProviders.length > 0;

        // Build flat list for keyboard navigation
        type FlatModelItem = { model: ProviderModel; providerID: string; modelID: string; section: string };
        const flatModelList: FlatModelItem[] = [];

        filteredFavorites.forEach(({ model, providerID, modelID }) => {
            flatModelList.push({ model, providerID, modelID, section: 'fav' });
        });
        filteredRecents.forEach(({ model, providerID, modelID }) => {
            flatModelList.push({ model, providerID, modelID, section: 'recent' });
        });
        providerSections.forEach(({ provider, visibleModels }) => {
            visibleModels.forEach((model) => {
                flatModelList.push({ model, providerID: provider.id as string, modelID: model.id as string, section: 'provider' });
            });
        });

        const totalItems = flatModelList.length;

        // Check if currently highlighted model supports thinking variants
        const highlightedItem = flatModelList[modelSelectedIndex];
        const highlightedSupportsThinking = highlightedItem ? (() => {
            const modelVariants = (highlightedItem.model as { variants?: Record<string, unknown> } | undefined)?.variants;
            return modelVariants && Object.keys(modelVariants).length > 0;
        })() : false;

        // Handle keyboard navigation
        const handleModelKeyDown = (e: React.KeyboardEvent) => {
            e.stopPropagation();

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setModelSelectedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
                // Scroll into view
                setTimeout(() => {
                    const nextIndex = (modelSelectedIndex + 1) % Math.max(1, totalItems);
                    modelItemRefs.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setModelSelectedIndex((prev) => (prev - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems));
                // Scroll into view
                setTimeout(() => {
                    const prevIndex = (modelSelectedIndex - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems);
                    modelItemRefs.current[prevIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 0);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const selectedItem = flatModelList[modelSelectedIndex];
                if (!selectedItem) return;

                const { providerID, modelID, model } = selectedItem;
                const modelVariants = (model as { variants?: Record<string, unknown> } | undefined)?.variants;
                if (!modelVariants) return;

                const variantKeys = Object.keys(modelVariants);
                if (variantKeys.length === 0) return;

                const mapKey = `${providerID}:${modelID}`;
                const currentPending = pendingThinkingVariants.get(mapKey);
                const activeModelVariant = currentPending ?? (currentProviderId === providerID && currentModelId === modelID ? currentVariant : undefined);

                const variantsWithDefault: Array<string | undefined> = [undefined, ...variantKeys];
                const currentVariantIndex = variantsWithDefault.indexOf(activeModelVariant);
                const safeCurrentIndex = currentVariantIndex >= 0 ? currentVariantIndex : 0;
                const direction = e.key === 'ArrowRight' ? 1 : -1;
                const nextVariantIndex = (safeCurrentIndex + direction + variantsWithDefault.length) % variantsWithDefault.length;
                const nextVariant = variantsWithDefault[nextVariantIndex];

                setPendingThinkingVariants((prev) => {
                    const next = new Map(prev);
                    next.set(mapKey, nextVariant);
                    return next;
                });
                setAdjustedThinkingModels((prev) => {
                    const next = new Set(prev);
                    next.add(mapKey);
                    return next;
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selectedItem = flatModelList[modelSelectedIndex];
                if (selectedItem) {
                    const { providerID, modelID } = selectedItem;
                    const mapKey = `${providerID}:${modelID}`;
                    const pendingVariant = pendingThinkingVariants.get(mapKey);
                    const wasAdjusted = adjustedThinkingModels.has(mapKey);

                    handleProviderAndModelChange(providerID, modelID);

                    if (wasAdjusted) {
                        setTimeout(() => {
                            handleVariantSelect(pendingVariant);
                        }, 0);
                    }
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setAgentMenuOpen(false);
            }
        };

        // Build index mapping for rendering
        let currentFlatIndex = 0;

        return (
            <Tooltip delayDuration={1000}>
                {!isCompact ? (
                    <DropdownMenu open={agentMenuOpen} onOpenChange={setAgentMenuOpen}>
                        <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                                <div
                                    className={cn(
                                        'model-controls__model-trigger flex items-center gap-1.5 cursor-pointer hover:bg-transparent hover:opacity-70 min-w-0',
                                        buttonHeight
                                    )}
                                >
                                    {isAutoModel ? (
                                        <RiSparklingLine className={cn(controlIconSize, 'text-primary/70 flex-shrink-0')} />
                                    ) : currentProviderId ? (
                                        <>
                                            <ProviderLogo
                                                providerId={currentProviderId}
                                                className={cn(controlIconSize, 'flex-shrink-0')}
                                            />
                                            <RiPencilAiLine className={cn(controlIconSize, 'text-primary/60 hidden')} />
                                        </>
                                    ) : (
                                        <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
                                    )}
                                    <span
                                        ref={modelLabelRef}
                                        key={`${currentProviderId}-${currentModelId}`}
                                        className={cn(
                                            'model-controls__model-label overflow-hidden',
                                            controlTextSize,
                                            'font-medium whitespace-nowrap text-foreground min-w-0',
                                            'max-w-[260px]'
                                        )}
                                    >
                                        <span className={cn('marquee-text', isModelLabelTruncated && 'marquee-text--active')}>
                                            {currentModelDisplayName}
                                        </span>
                                    </span>
                                </div>
                            </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <DropdownMenuContent className="w-[min(380px,calc(100vw-2rem))] p-0 flex flex-col" align="end" alignOffset={-40}>
                            {/* Search Input */}
                            <div className="p-2 border-b border-border/40">
                                <div className="relative">
                                    <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder="Search models"
                                        value={desktopModelQuery}
                                        onChange={(e) => setDesktopModelQuery(e.target.value)}
                                        onKeyDown={handleModelKeyDown}
                                        className="pl-8 h-8 typography-meta"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {!desktopModelQuery && (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleAutoSelect}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            handleAutoSelect();
                                        }
                                    }}
                                    className={cn(
                                        'typography-meta group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer',
                                        isAutoModel
                                            ? 'bg-primary/10 hover:bg-primary/10'
                                            : 'hover:bg-interactive-hover/50',
                                    )}
                                >
                                    <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                                        <RiSparklingLine className="h-4 w-4" />
                                    </span>
                                    <span className="flex-1 font-medium text-foreground">Auto</span>
                                    <span className="text-[10px] text-muted-foreground font-normal">use agent default</span>
                                    {isAutoModel && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                                </div>
                            )}

                            {/* Scrollable content */}
                            <ScrollableOverlay
                                outerClassName="max-h-[min(400px,calc(100dvh-12rem))] flex-1"
                                className="overlay-scrollbar-target--no-gutter"
                            >
                                <div className="p-1">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={openAddProviderSettings}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                openAddProviderSettings();
                                            }
                                        }}
                                        className="typography-meta group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-interactive-hover/50"
                                    >
                                        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                                            <RiAddLine className="h-4 w-4 -mr-0.5" />
                                        </span>
                                        <span className="font-medium text-foreground">Add new provider</span>
                                    </div>

                                    <DropdownMenuSeparator />

                                    {!hasResults && (
                                        <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                                            No models found
                                        </div>
                                    )}

                                    {/* Favorites Section */}
                                    {filteredFavorites.length > 0 && (
                                        <div>
                                            <DropdownMenuLabel
                                                className="typography-micro font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 -mx-1 px-3 py-1.5 border-b border-border/30"
                                            >
                                                <RiStarFill className="h-4 w-4 text-primary" />
                                                Favorites
                                            </DropdownMenuLabel>
                                            {filteredFavorites.map(({ model, providerID, modelID }) => {
                                                const idx = currentFlatIndex++;
                                                return renderModelRow(model, providerID, modelID, 'fav', idx, modelSelectedIndex === idx);
                                            })}
                                        </div>
                                    )}

                                    {/* Recents Section */}
                                    {filteredRecents.length > 0 && (
                                        <div>
                                            {filteredFavorites.length > 0 && <DropdownMenuSeparator />}
                                            <DropdownMenuLabel
                                                className="typography-micro font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 -mx-1 px-3 py-1.5 border-b border-border/30"
                                            >
                                                <RiTimeLine className="h-4 w-4" />
                                                Recent
                                            </DropdownMenuLabel>
                                            {filteredRecents.map(({ model, providerID, modelID }) => {
                                                const idx = currentFlatIndex++;
                                                return renderModelRow(model, providerID, modelID, 'recent', idx, modelSelectedIndex === idx);
                                            })}
                                        </div>
                                    )}

                                    {/* Separator before providers */}
                                    {(filteredFavorites.length > 0 || filteredRecents.length > 0) && filteredProviders.length > 0 && (
                                        <DropdownMenuSeparator />
                                    )}

                                    {/* All Providers - Flat List */}
                                    {providerSections.map(({ provider, isExpanded, visibleModels }, index) => (
                                        <div key={provider.id}>
                                            {index > 0 && <DropdownMenuSeparator />}
                                            <div
                                                role="button"
                                                tabIndex={forceExpandProviders ? -1 : 0}
                                                aria-disabled={forceExpandProviders}
                                                onClick={() => {
                                                    if (forceExpandProviders) {
                                                        return;
                                                    }
                                                    toggleModelProviderCollapsed(String(provider.id));
                                                    setModelSelectedIndex(0);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (forceExpandProviders) {
                                                        return;
                                                    }
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        toggleModelProviderCollapsed(String(provider.id));
                                                        setModelSelectedIndex(0);
                                                    }
                                                }}
                                                className={cn(
                                                    'typography-micro font-semibold text-muted-foreground uppercase tracking-wider flex w-full items-center gap-2 -mx-1 px-3 py-1.5 border-b border-border/30',
                                                    'text-left transition-colors',
                                                    forceExpandProviders ? 'cursor-default' : 'cursor-pointer'
                                                )}
                                                aria-expanded={isExpanded}
                                                title={forceExpandProviders ? undefined : (isExpanded ? 'Collapse provider' : 'Expand provider')}
                                            >
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <ProviderLogo
                                                        providerId={provider.id}
                                                        className="h-4 w-4 flex-shrink-0"
                                                    />
                                                    <span className="min-w-0 truncate">{provider.name}</span>
                                                    <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground">
                                                        {isExpanded ? (
                                                            <RiArrowDownSLine className="h-4 w-4" />
                                                        ) : (
                                                            <RiArrowRightSLine className="h-4 w-4" />
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                            {isExpanded && visibleModels.map((model: ProviderModel) => {
                                                const idx = currentFlatIndex++;
                                                return renderModelRow(model, provider.id as string, model.id as string, 'provider', idx, modelSelectedIndex === idx);
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </ScrollableOverlay>

                            {/* Keyboard hints footer */}
                            <div className="px-3 pt-1 pb-1.5 border-t border-border/40 typography-micro text-muted-foreground">
                                ↑↓ navigate{highlightedSupportsThinking ? ' • ←→ thinking' : ''} • Enter select • Esc close
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <button
                        type="button"
                        onClick={() => setActiveMobilePanel('model')}
                        onTouchStart={() => handleLongPressStart('model')}
                        onTouchEnd={handleLongPressEnd}
                        onTouchCancel={handleLongPressEnd}
                        className={cn(
                            'model-controls__model-trigger flex items-center gap-1.5 min-w-0 focus:outline-none',
                            'cursor-pointer hover:bg-transparent hover:opacity-70',
                            buttonHeight
                        )}
                    >
                        {isAutoModel ? (
                            <RiSparklingLine className={cn(controlIconSize, 'text-primary/70 flex-shrink-0')} />
                        ) : currentProviderId ? (
                            <ProviderLogo
                                providerId={currentProviderId}
                                className={cn(controlIconSize, 'flex-shrink-0')}
                            />
                        ) : (
                            <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
                        )}
                        <span
                            ref={modelLabelRef}
                            className={cn(
                                'model-controls__model-label typography-micro font-medium overflow-hidden min-w-0',
                                isMobile ? 'max-w-[120px]' : 'max-w-[220px]',
                            )}
                        >
                            <span className={cn('marquee-text', isModelLabelTruncated && 'marquee-text--active')}>
                                {currentModelDisplayName}
                            </span>
                        </span>
                    </button>
                )}
                <ModelDetailsTooltipContent
                    metadata={currentMetadata}
                    modelDisplayName={currentModelDisplayName}
                    providerDisplayName={getProviderDisplayName()}
                />
            </Tooltip>
        );
    };

    const renderVariantSelector = () => {
        if (!hasVariants) {
            return null;
        }

        const displayVariant = currentVariant ?? 'Default';
        const isDefault = !currentVariant;
        const colorClass = isDefault ? 'text-muted-foreground' : 'text-[color:var(--status-info)]';

        if (isCompact) {
            return (
                <button
                    type="button"
                    onClick={() => setActiveMobilePanel('variant')}
                    className={cn(
                        'model-controls__variant-trigger flex items-center gap-1.5 transition-opacity min-w-0 focus:outline-none',
                        buttonHeight,
                        'cursor-pointer hover:bg-transparent hover:opacity-70',
                    )}
                >
                    <RiBrainAi3Line className={cn(controlIconSize, 'flex-shrink-0', colorClass)} />
                    <span className={cn(
                        'model-controls__variant-label',
                        controlTextSize,
                        'font-medium truncate min-w-0',
                        isMobile && 'max-w-[60px]',
                        colorClass
                    )}>
                        {displayVariant}
                    </span>
                </button>
            );
        }

        return (
            <Tooltip delayDuration={800}>
                <DropdownMenu>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <div
                                className={cn(
                                    'model-controls__variant-trigger flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-transparent hover:opacity-70 min-w-0',
                                    buttonHeight,
                                )}
                            >
                                <RiBrainAi3Line className={cn(controlIconSize, 'flex-shrink-0', colorClass)} />
                                <span
                                    className={cn(
                                        'model-controls__variant-label',
                                        controlTextSize,
                                        'font-medium min-w-0 truncate',
                                        isDesktop ? 'max-w-[180px]' : undefined,
                                        colorClass,
                                    )}
                                >
                                    {displayVariant}
                                </span>
                            </div>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <DropdownMenuContent align="end" alignOffset={-40} className="w-[min(180px,calc(100vw-2rem))]">
                        <DropdownMenuLabel className="typography-ui-header font-semibold text-foreground">Thinking</DropdownMenuLabel>
                        <DropdownMenuItem className="typography-meta" onSelect={() => handleVariantSelect(undefined)}>
                            <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                <span className="typography-meta font-medium text-foreground truncate min-w-0">Default</span>
                                {isDefault && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                            </div>
                        </DropdownMenuItem>
                        {availableVariants.length > 0 && <DropdownMenuSeparator />}
                        {availableVariants.map((variant) => {
                            const selected = currentVariant === variant;
                            const label = variant.charAt(0).toUpperCase() + variant.slice(1);
                            return (
                                <DropdownMenuItem
                                    key={variant}
                                    className="typography-meta"
                                    onSelect={() => handleVariantSelect(variant)}
                                >
                                    <div className="flex items-center justify-between gap-2 w-full min-w-0">
                                        <span className="typography-meta font-medium text-foreground truncate min-w-0">{label}</span>
                                        {selected && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                                    </div>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
                <TooltipContent side="top">
                    <p className="typography-meta">Thinking: {displayVariant}</p>
                </TooltipContent>
            </Tooltip>
        );
    };

    const renderAgentSelector = () => {
        if (!isCompact) {
            return (
                <div className="flex items-center gap-2 min-w-0">
                    <Tooltip delayDuration={1000}>
                        <DropdownMenu open={isAgentSelectorOpen} onOpenChange={setIsAgentSelectorOpen}>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <div className={cn(
                                        'flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-transparent hover:opacity-70 min-w-0',
                                        buttonHeight
                                    )}>
                                        <RiAiAgentLine
                                            className={cn(
                                                controlIconSize,
                                                'flex-shrink-0',
                                                uiAgentName ? '' : 'text-muted-foreground'
                                            )}
                                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                        />
                                        <span
                                            className={cn(
                                                'model-controls__agent-label',
                                                controlTextSize,
                                                'font-medium min-w-0 truncate',
                                                isDesktop ? 'max-w-[220px]' : undefined
                                            )}
                                            style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                                        >
                                            {getAgentDisplayName()}
                                        </span>
                                    </div>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <DropdownMenuContent align="end" alignOffset={-40} className="w-[min(280px,calc(100vw-2rem))] p-0 flex flex-col">
                                <div className="p-2 border-b border-border/40">
                                    <div className="relative">
                                        <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder="Search agents"
                                            value={agentSearchQuery}
                                            onChange={(e) => setAgentSearchQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                e.stopPropagation();
                                            }}
                                            className="pl-8 h-8 typography-meta"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                <ScrollableOverlay outerClassName="max-h-[min(400px,calc(100dvh-12rem))] flex-1">
                                    <div className="p-1">
                                        {!agentSearchQuery.trim() && defaultAgentName && (
                                            <>
                                                <DropdownMenuItem
                                                    className="typography-meta"
                                                    onSelect={() => handleAgentChange(defaultAgentName)}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <RiArrowGoBackLine className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="font-medium">Reset to default</span>
                                                    </div>
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </>
                                        )}
                                        {sortedAndFilteredAgents.length === 0 ? (
                                            <div className="px-2 py-4 text-center typography-meta text-muted-foreground">
                                                No agents found
                                            </div>
                                        ) : (
                                            sortedAndFilteredAgents.map((agent) => (
                                                <DropdownMenuItem
                                                    key={agent.name}
                                                    className="typography-meta"
                                                    onSelect={() => handleAgentChange(agent.name)}
                                                >
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <div className={cn(
                                                                'h-1 w-1 rounded-full agent-dot',
                                                                getAgentColor(agent.name).class
                                                            )} />
                                                            <span className="font-medium">{capitalizeAgentName(agent.name)}</span>
                                                        </div>
                                                        {agent.description && (
                                                            <span className="typography-meta text-muted-foreground max-w-[200px] ml-2.5 break-words">
                                                                {agent.description}
                                                            </span>
                                                        )}
                                                    </div>
                                                </DropdownMenuItem>
                                            ))
                                        )}
                                    </div>
                                </ScrollableOverlay>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <AgentDetailsTooltipContent agent={currentAgent} />
                    </Tooltip>
                </div>
            );
        }

        return (
            <button
                type="button"
                onClick={() => setActiveMobilePanel('agent')}
                onTouchStart={() => handleLongPressStart('agent')}
                onTouchEnd={handleLongPressEnd}
                onTouchCancel={handleLongPressEnd}
                className={cn(
                    'model-controls__agent-trigger flex items-center gap-1.5 transition-colors min-w-0 focus:outline-none',
                    buttonHeight,
                    'cursor-pointer hover:bg-transparent hover:opacity-70',
                )}
            >
                <RiAiAgentLine
                    className={cn(
                        controlIconSize,
                        'flex-shrink-0',
                        uiAgentName ? '' : 'text-muted-foreground'
                    )}
                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                />
                <span
                    className={cn(
                        'model-controls__agent-label',
                        controlTextSize,
                        'font-medium truncate min-w-0',
                        isMobile && 'max-w-[60px]'
                    )}
                    style={uiAgentName ? { color: `var(${getAgentColor(uiAgentName).var})` } : undefined}
                >
                    {getAgentDisplayName()}
                </span>
            </button>
        );
    };

    const inlineClassName = cn(
        '@container/model-controls flex items-center min-w-0',
        isMobile && 'w-full',
        className,
    );

    return (
        <>
            <div className={inlineClassName}>
                <div
                    className={cn(
                        'flex items-center min-w-0 flex-1 justify-end',
                        inlineGapClass,
                        isMobile && 'overflow-hidden'
                    )}
                >
                    {renderVariantSelector()}
                    {renderModelSelector()}
                    {renderAgentSelector()}
                </div>
            </div>

            {isCompact && (
                <MobileModelControlsPanels
                    activePanel={activeMobilePanel}
                    agents={selectableDesktopAgents}
                    availableVariants={availableVariants}
                    currentAgentName={uiAgentName}
                    currentModelId={currentModelId}
                    currentProviderId={currentProviderId}
                    currentVariant={currentVariant}
                    favoriteModels={favoriteModelsList}
                    getModelMetadata={getModelMetadata}
                    isAutoModel={isAutoModel}
                    isFavoriteModel={isFavoriteModel}
                    onAgentChange={handleAgentChange}
                    onAutoSelect={handleAutoSelect}
                    onClose={closeMobilePanel}
                    onMobilePanelSelection={onMobilePanelSelection}
                    onModelChange={handleProviderAndModelChange}
                    onToggleFavorite={toggleFavoriteModel}
                    onVariantSelect={handleVariantSelect}
                    recentModels={recentModelsList}
                    visibleProviders={visibleProviders as MobileModelProvider[]}
                />
            )}
            {isCompact && mobileTooltipOpen === 'model' && (
                <MobileModelDetailsPanel
                    metadata={currentMetadata}
                    modelDisplayName={currentModelDisplayName}
                    providerDisplayName={getProviderDisplayName()}
                    onClose={closeMobileTooltip}
                />
            )}
            {isCompact && mobileTooltipOpen === 'agent' && currentAgent && (
                <MobileAgentDetailsPanel agent={currentAgent} onClose={closeMobileTooltip} />
            )}
        </>
    );

};
