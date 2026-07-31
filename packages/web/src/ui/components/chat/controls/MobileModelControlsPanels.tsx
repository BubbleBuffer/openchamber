import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    RiArrowDownSLine,
    RiArrowRightSLine,
    RiCheckLine,
    RiCloseCircleLine,
    RiSearchLine,
    RiSparklingLine,
    RiStarFill,
    RiStarLine,
    RiTimeLine,
} from '@remixicon/react';
import { Input } from '@/components/ui/input';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import type { ModelListItem } from '@/hooks/useModelLists';
import type { Agent, Provider } from '@/lib/opencode/client';
import { getAgentColor } from '@/lib/theme/agentColors';
import { cn } from '@/lib/utils';
import type { ModelMetadata } from '@/types';
import {
    filterMobileModelProviders,
    getModelDisplayName,
} from './modelSearch';
import {
    formatTokens,
    getCapabilityIcons,
    getModalityIcons,
} from './modelMetadata';
import type { MobileControlsPanel } from './mobileControlsUtils';

type ProviderModel = Provider['models'][string];

export type MobileModelProvider = Omit<Provider, 'models'> & {
    models: ProviderModel[];
};

interface MobileModelControlsPanelsProps {
    activePanel: MobileControlsPanel;
    agents: Agent[];
    availableVariants: string[];
    currentAgentName?: string | null;
    currentModelId?: string | null;
    currentProviderId?: string | null;
    currentVariant?: string;
    favoriteModels: ModelListItem[];
    getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
    isAutoModel: boolean;
    isFavoriteModel: (providerId: string, modelId: string) => boolean;
    onAgentChange: (agentName: string) => void;
    onAutoSelect: () => void;
    onClose: () => void;
    onMobilePanelSelection?: () => void;
    onModelChange: (providerId: string, modelId: string) => void;
    onToggleFavorite: (providerId: string, modelId: string) => void;
    onVariantSelect: (variant: string | undefined) => void;
    recentModels: ModelListItem[];
    visibleProviders: MobileModelProvider[];
}

const capitalizeAgentName = (name: string): string =>
    name.charAt(0).toUpperCase() + name.slice(1);

interface SavedModelsSectionProps {
    currentModelId?: string | null;
    currentProviderId?: string | null;
    getModelMetadata: MobileModelControlsPanelsProps['getModelMetadata'];
    icon: ReactNode;
    items: ModelListItem[];
    keyPrefix: 'fav-mobile' | 'recent-mobile';
    onModelChange: MobileModelControlsPanelsProps['onModelChange'];
    title: string;
}

const SavedModelsSection = memo(function SavedModelsSection({
    currentModelId,
    currentProviderId,
    getModelMetadata,
    icon,
    items,
    keyPrefix,
    onModelChange,
    title,
}: SavedModelsSectionProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {icon}
                {title}
            </div>
            <div className="flex flex-col border-t border-border/30">
                {items.map(({ model, providerID, modelID }) => {
                    const isSelected = providerID === currentProviderId && modelID === currentModelId;
                    const metadata = getModelMetadata(providerID, modelID);
                    return (
                        <button
                            key={`${keyPrefix}-${providerID}-${modelID}`}
                            type="button"
                            onClick={() => onModelChange(providerID, modelID)}
                            className={cn(
                                'flex w-full items-start gap-2 border-b border-border/30 px-2 py-1.5 text-left last:border-b-0',
                                'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                'first:rounded-t-xl last:rounded-b-xl transition-colors',
                                isSelected
                                    ? 'bg-interactive-selection/15 text-interactive-selection-foreground'
                                    : 'hover:bg-interactive-hover',
                            )}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <ProviderLogo providerId={providerID} className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="typography-meta font-medium text-foreground truncate">
                                    {getModelDisplayName(model)}
                                </span>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                                {(metadata?.limit?.context || metadata?.limit?.output) && (
                                    <div className="typography-micro text-muted-foreground whitespace-nowrap">
                                        {metadata.limit.context ? `${formatTokens(metadata.limit.context)} ctx` : ''}
                                        {metadata.limit.context && metadata.limit.output ? ' • ' : ''}
                                        {metadata.limit.output ? `${formatTokens(metadata.limit.output)} out` : ''}
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

export const MobileModelControlsPanels = memo(function MobileModelControlsPanels({
    activePanel,
    agents,
    availableVariants,
    currentAgentName,
    currentModelId,
    currentProviderId,
    currentVariant,
    favoriteModels,
    getModelMetadata,
    isAutoModel,
    isFavoriteModel,
    onAgentChange,
    onAutoSelect,
    onClose,
    onMobilePanelSelection,
    onModelChange,
    onToggleFavorite,
    onVariantSelect,
    recentModels,
    visibleProviders,
}: MobileModelControlsPanelsProps) {
    const [modelQuery, setModelQuery] = useState('');
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() =>
        currentProviderId ? new Set([currentProviderId]) : new Set()
    );

    useEffect(() => {
        if (activePanel !== 'model') {
            setModelQuery('');
            return;
        }
        setExpandedProviders(currentProviderId ? new Set([currentProviderId]) : new Set());
    }, [activePanel, currentProviderId]);

    const filteredProviders = useMemo(
        () => filterMobileModelProviders(visibleProviders, modelQuery),
        [modelQuery, visibleProviders],
    );

    const toggleProvider = (providerId: string) => {
        setExpandedProviders((previous) => {
            const next = new Set(previous);
            if (next.has(providerId)) {
                next.delete(providerId);
            } else {
                next.add(providerId);
            }
            return next;
        });
    };

    const selectVariant = (variant: string | undefined) => {
        onVariantSelect(variant);
        onClose();
        if (onMobilePanelSelection) {
            requestAnimationFrame(onMobilePanelSelection);
            return;
        }
        requestAnimationFrame(() => {
            document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]')?.focus();
        });
    };

    return (
        <>
            <MobileOverlayPanel open={activePanel === 'model'} onClose={onClose} title="Select model">
                <div className="flex flex-col gap-2">
                    <div className="relative">
                        <RiSearchLine className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            value={modelQuery}
                            onChange={(event) => setModelQuery(event.target.value)}
                            placeholder="Search providers or models"
                            className="pl-7 h-9 rounded-xl border-border/40 bg-[var(--surface-elevated)] typography-meta"
                        />
                        {modelQuery && (
                            <button
                                type="button"
                                onClick={() => setModelQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                aria-label="Clear search"
                            >
                                <RiCloseCircleLine className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {filteredProviders.length === 0 && (
                        <div className="px-3 py-8 text-center typography-meta text-muted-foreground">
                            No providers or models match your search.
                        </div>
                    )}

                    {!modelQuery && (
                        <>
                            <button
                                type="button"
                                onClick={onAutoSelect}
                                className={cn(
                                    'flex items-center gap-2 w-full rounded-xl px-3 py-2.5 border transition-colors text-left',
                                    isAutoModel
                                        ? 'border-primary/40 bg-primary/5'
                                        : 'border-border/40 bg-[var(--surface-elevated)] hover:bg-interactive-hover/50',
                                )}
                            >
                                <RiSparklingLine className="h-4 w-4 text-primary/70 flex-shrink-0" />
                                <span className="flex-1 typography-body font-medium text-foreground">Auto</span>
                                <span className="text-xs text-muted-foreground">use agent default</span>
                                {isAutoModel && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                            </button>
                            <SavedModelsSection
                                currentModelId={currentModelId}
                                currentProviderId={currentProviderId}
                                getModelMetadata={getModelMetadata}
                                icon={<RiStarFill className="h-3 w-3 inline-block mr-1.5 text-primary" />}
                                items={favoriteModels}
                                keyPrefix="fav-mobile"
                                onModelChange={onModelChange}
                                title="Favorites"
                            />
                            <SavedModelsSection
                                currentModelId={currentModelId}
                                currentProviderId={currentProviderId}
                                getModelMetadata={getModelMetadata}
                                icon={<RiTimeLine className="h-3 w-3 inline-block mr-1.5" />}
                                items={recentModels}
                                keyPrefix="recent-mobile"
                                onModelChange={onModelChange}
                                title="Recent"
                            />
                        </>
                    )}

                    {filteredProviders.map(({ provider, providerModels }) => {
                        if (providerModels.length === 0 && !modelQuery.trim()) {
                            return null;
                        }
                        const isActiveProvider = provider.id === currentProviderId;
                        const isExpanded = expandedProviders.has(provider.id) || modelQuery.trim().length > 0;

                        return (
                            <div
                                key={provider.id}
                                className="rounded-xl border border-border/40 bg-[var(--surface-elevated)] overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleProvider(provider.id)}
                                    className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 text-left"
                                    aria-expanded={isExpanded}
                                >
                                    <div className="flex items-center gap-2">
                                        <ProviderLogo providerId={provider.id} className="h-3.5 w-3.5" />
                                        <span className="typography-meta font-medium text-foreground">
                                            {provider.name}
                                        </span>
                                        {isActiveProvider && (
                                            <span className="typography-micro text-primary/80">Current</span>
                                        )}
                                    </div>
                                    {isExpanded
                                        ? <RiArrowDownSLine className="h-3 w-3 text-muted-foreground" />
                                        : <RiArrowRightSLine className="h-3 w-3 text-muted-foreground" />}
                                </button>

                                {isExpanded && providerModels.length > 0 && (
                                    <div className="flex flex-col border-t border-border/30">
                                        {providerModels.map((model) => {
                                            const modelId = model.id;
                                            if (!modelId) {
                                                return null;
                                            }
                                            const isSelected = isActiveProvider && modelId === currentModelId;
                                            const metadata = getModelMetadata(provider.id, modelId);
                                            const capabilityIcons = getCapabilityIcons(metadata).slice(0, 3);
                                            const inputIcons = getModalityIcons(metadata, 'input');
                                            const isFavorite = isFavoriteModel(provider.id, modelId);

                                            return (
                                                <div
                                                    key={modelId}
                                                    className={cn(
                                                        'flex w-full items-start gap-2 border-b border-border/30 px-2 py-1.5 last:border-b-0',
                                                        'rounded-lg transition-colors',
                                                        !isSelected && 'hover:bg-interactive-hover',
                                                        isSelected
                                                            ? 'bg-interactive-selection/15 text-interactive-selection-foreground'
                                                            : '',
                                                    )}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => onModelChange(provider.id, modelId)}
                                                        className={cn(
                                                            'flex flex-1 min-w-0 items-start gap-2 text-left',
                                                            'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                                        )}
                                                    >
                                                        <div className="flex min-w-0 flex-col">
                                                            <span className="typography-meta font-medium text-foreground">
                                                                {getModelDisplayName(model)}
                                                            </span>
                                                        </div>
                                                        <div className="ml-auto flex flex-col items-end gap-1 text-right">
                                                            {(metadata?.limit?.context || metadata?.limit?.output) && (
                                                                <div className="flex items-center gap-1 typography-micro text-muted-foreground">
                                                                    {metadata.limit.context
                                                                        ? <span>{formatTokens(metadata.limit.context)} ctx</span>
                                                                        : null}
                                                                    {metadata.limit.context && metadata.limit.output
                                                                        ? <span>•</span>
                                                                        : null}
                                                                    {metadata.limit.output
                                                                        ? <span>{formatTokens(metadata.limit.output)} out</span>
                                                                        : null}
                                                                </div>
                                                            )}
                                                            {(capabilityIcons.length > 0 || inputIcons.length > 0) && (
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {[...capabilityIcons, ...inputIcons].map(({
                                                                        key,
                                                                        icon: IconComponent,
                                                                        label,
                                                                    }) => (
                                                                        <span
                                                                            key={`meta-${provider.id}-${modelId}-${key}`}
                                                                            className="flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                            title={label}
                                                                            aria-label={label}
                                                                        >
                                                                            <IconComponent className="h-3 w-3" />
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            onToggleFavorite(provider.id, modelId);
                                                        }}
                                                        className={cn(
                                                            'model-favorite-button flex h-5 w-5 items-center justify-center hover:text-primary/80 flex-shrink-0',
                                                            isFavorite ? 'text-primary' : 'text-muted-foreground',
                                                        )}
                                                        aria-label={isFavorite ? 'Unfavorite' : 'Favorite'}
                                                        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                                    >
                                                        {isFavorite
                                                            ? <RiStarFill className="h-4 w-4" />
                                                            : <RiStarLine className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </MobileOverlayPanel>

            {availableVariants.length > 0 && (
                <MobileOverlayPanel
                    open={activePanel === 'variant'}
                    onClose={onClose}
                    title="Thinking"
                >
                    <div className="flex flex-col gap-1.5">
                        <button
                            type="button"
                            className={cn(
                                'flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-left',
                                'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                !currentVariant ? 'border-primary/30 bg-primary/10' : 'border-border/40',
                            )}
                            onClick={() => selectVariant(undefined)}
                        >
                            <span className="typography-meta font-medium text-foreground">Default</span>
                            {!currentVariant && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                        </button>
                        {availableVariants.map((variant) => {
                            const selected = currentVariant === variant;
                            const label = capitalizeAgentName(variant);
                            return (
                                <button
                                    key={variant}
                                    type="button"
                                    className={cn(
                                        'flex w-full items-center justify-between gap-2 rounded-xl border px-2 py-1.5 text-left',
                                        'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                                        selected ? 'border-primary/30 bg-primary/10' : 'border-border/40',
                                    )}
                                    onClick={() => selectVariant(variant)}
                                >
                                    <span className="typography-meta font-medium text-foreground">{label}</span>
                                    {selected && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </MobileOverlayPanel>
            )}

            <MobileOverlayPanel
                open={activePanel === 'agent'}
                onClose={onClose}
                title="Select agent"
                contentMaxHeightClassName="max-h-[min(52dvh,360px)]"
            >
                <div className="flex flex-col gap-2">
                    {agents.map((agent) => {
                        const isSelected = agent.name === currentAgentName;
                        const agentColor = getAgentColor(agent.name);
                        return (
                            <button
                                key={agent.name}
                                type="button"
                                className={cn(
                                    'flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    'touch-manipulation cursor-pointer transition-colors',
                                    'active:bg-interactive-hover',
                                    isSelected
                                        ? 'border-primary/50 bg-interactive-selection/20'
                                        : 'border-border/40 hover:bg-interactive-hover/50',
                                )}
                                onClick={() => onAgentChange(agent.name)}
                            >
                                <div className="flex items-center gap-2">
                                    <div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', agentColor.class)} />
                                    <span
                                        className="typography-ui-label font-semibold"
                                        style={isSelected ? { color: `var(${agentColor.var})` } : undefined}
                                    >
                                        {capitalizeAgentName(agent.name)}
                                    </span>
                                    {isSelected && (
                                        <RiCheckLine className="h-4 w-4 text-primary ml-auto flex-shrink-0" />
                                    )}
                                </div>
                                {agent.description && (
                                    <span className="typography-meta text-muted-foreground pl-4.5">
                                        {agent.description}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </MobileOverlayPanel>
        </>
    );
});
