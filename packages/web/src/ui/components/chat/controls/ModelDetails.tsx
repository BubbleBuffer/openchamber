import { memo } from 'react';
import type { ModelMetadata } from '@/types';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { TooltipContent } from '@/components/ui/tooltip';
import {
    formatCost,
    formatDate,
    formatKnowledge,
    formatTokens,
    getCapabilityIcons,
    getModalityIcons,
    type MetadataIconComponent,
} from './modelMetadata';

interface ModelDetailsProps {
    metadata?: ModelMetadata;
    modelDisplayName: string;
    providerDisplayName?: string;
}

interface MobileModelDetailsPanelProps extends ModelDetailsProps {
    onClose: () => void;
}

const IconBadge = ({
    icon: Icon,
    label,
}: {
    icon: MetadataIconComponent;
    label: string;
}) => (
    <span
        className="flex h-5 w-5 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground"
        title={label}
        aria-label={label}
        role="img"
    >
        <Icon className="h-3.5 w-3.5" />
    </span>
);

export const MobileModelDetailsPanel = memo(function MobileModelDetailsPanel({
    metadata,
    modelDisplayName,
    providerDisplayName,
    onClose,
}: MobileModelDetailsPanelProps) {
    const capabilityIcons = getCapabilityIcons(metadata);
    const inputModalityIcons = getModalityIcons(metadata, 'input');
    const outputModalityIcons = getModalityIcons(metadata, 'output');

    return (
        <MobileOverlayPanel
            open={true}
            onClose={onClose}
            title={metadata?.name || modelDisplayName}
        >
            <div className="flex flex-col gap-1.5">
                <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                    <div className="typography-micro text-muted-foreground mb-0.5">Provider</div>
                    <div className="typography-meta text-foreground font-medium">{providerDisplayName}</div>
                </div>

                {capabilityIcons.length > 0 && (
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Capabilities</div>
                        <div className="flex flex-wrap gap-1.5">
                            {capabilityIcons.map(({ key, icon, label }) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <IconBadge icon={icon} label={label} />
                                    <span className="typography-meta text-foreground">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(inputModalityIcons.length > 0 || outputModalityIcons.length > 0) && (
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Modalities</div>
                        <div className="flex flex-col gap-1">
                            {inputModalityIcons.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="typography-meta text-muted-foreground/80 w-12">Input</span>
                                    <div className="flex gap-1">
                                        {inputModalityIcons.map(({ key, icon, label }) => (
                                            <IconBadge key={key} icon={icon} label={`${label} input`} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {outputModalityIcons.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="typography-meta text-muted-foreground/80 w-12">Output</span>
                                    <div className="flex gap-1">
                                        {outputModalityIcons.map(({ key, icon, label }) => (
                                            <IconBadge key={key} icon={icon} label={`${label} output`} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                    <div className="typography-micro text-muted-foreground mb-1">Limits</div>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                            <span className="typography-meta text-muted-foreground/80">Context</span>
                            <span className="typography-meta font-medium text-foreground">
                                {formatTokens(metadata?.limit?.context)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="typography-meta text-muted-foreground/80">Output</span>
                            <span className="typography-meta font-medium text-foreground">
                                {formatTokens(metadata?.limit?.output)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                    <div className="typography-micro text-muted-foreground mb-1">Metadata</div>
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                            <span className="typography-meta text-muted-foreground/80">Knowledge</span>
                            <span className="typography-meta font-medium text-foreground">
                                {formatKnowledge(metadata?.knowledge)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="typography-meta text-muted-foreground/80">Release</span>
                            <span className="typography-meta font-medium text-foreground">
                                {formatDate(metadata?.release_date)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </MobileOverlayPanel>
    );
});

export const ModelDetailsTooltipContent = memo(function ModelDetailsTooltipContent({
    metadata,
    modelDisplayName,
    providerDisplayName,
}: ModelDetailsProps) {
    if (!metadata) {
        return (
            <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
                <div className="min-w-[200px] typography-meta text-muted-foreground">
                    Model metadata unavailable.
                </div>
            </TooltipContent>
        );
    }

    const capabilityIcons = getCapabilityIcons(metadata);
    const inputModalityIcons = getModalityIcons(metadata, 'input');
    const outputModalityIcons = getModalityIcons(metadata, 'output');
    const costRows = [
        { label: 'Input', value: formatCost(metadata.cost?.input) },
        { label: 'Output', value: formatCost(metadata.cost?.output) },
        { label: 'Cache read', value: formatCost(metadata.cost?.cache_read) },
        { label: 'Cache write', value: formatCost(metadata.cost?.cache_write) },
    ];
    const limitRows = [
        { label: 'Context', value: formatTokens(metadata.limit?.context) },
        { label: 'Output', value: formatTokens(metadata.limit?.output) },
    ];

    return (
        <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
            <div className="flex min-w-[240px] flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                    <span className="typography-micro font-semibold text-foreground">
                        {metadata.name || modelDisplayName}
                    </span>
                    <span className="typography-meta text-muted-foreground">{providerDisplayName}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Capabilities
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {capabilityIcons.length > 0
                            ? capabilityIcons.map(({ key, icon, label }) => (
                                <IconBadge key={key} icon={icon} label={label} />
                            ))
                            : <span className="typography-meta text-muted-foreground">—</span>}
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Modalities
                    </span>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">Input</span>
                            <div className="flex items-center gap-1.5">
                                {inputModalityIcons.length > 0
                                    ? inputModalityIcons.map(({ key, icon, label }) => (
                                        <IconBadge key={key} icon={icon} label={`${label} input`} />
                                    ))
                                    : <span className="typography-meta text-muted-foreground">—</span>}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">Output</span>
                            <div className="flex items-center gap-1.5">
                                {outputModalityIcons.length > 0
                                    ? outputModalityIcons.map(({ key, icon, label }) => (
                                        <IconBadge key={key} icon={icon} label={`${label} output`} />
                                    ))
                                    : <span className="typography-meta text-muted-foreground">—</span>}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Cost ($/1M tokens)
                    </span>
                    {costRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                            <span className="typography-meta font-medium text-foreground">{row.value}</span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Limits
                    </span>
                    {limitRows.map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3">
                            <span className="typography-meta font-medium text-muted-foreground/80">{row.label}</span>
                            <span className="typography-meta font-medium text-foreground">{row.value}</span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Metadata
                    </span>
                    <div className="flex items-center justify-between gap-3">
                        <span className="typography-meta font-medium text-muted-foreground/80">Knowledge</span>
                        <span className="typography-meta font-medium text-foreground">
                            {formatKnowledge(metadata.knowledge)}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="typography-meta font-medium text-muted-foreground/80">Release</span>
                        <span className="typography-meta font-medium text-foreground">
                            {formatDate(metadata.release_date)}
                        </span>
                    </div>
                </div>
            </div>
        </TooltipContent>
    );
});
