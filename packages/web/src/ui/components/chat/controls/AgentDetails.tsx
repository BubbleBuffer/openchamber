import { memo } from 'react';
import {
    RiCheckboxCircleLine,
    RiCloseCircleLine,
    RiPencilAiLine,
    RiQuestionLine,
} from '@remixicon/react';
import type { Agent } from '@/lib/opencode/client';
import type { EditPermissionMode } from '@/stores/types/sessionTypes';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { TooltipContent } from '@/components/ui/tooltip';
import { getEditModeColors } from '@/lib/permissions/editModeColors';
import { cn } from '@/lib/utils';
import { summarizePermission, type PermissionSummary } from './agentMetadata';

interface AgentDetailsProps {
    agent?: Agent;
}

interface MobileAgentDetailsPanelProps {
    agent: Agent;
    onClose: () => void;
}

const capitalizeAgentName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

const EditModeIcon = ({
    mode,
    className = 'h-3.5 w-3.5',
}: {
    mode: EditPermissionMode;
    className?: string;
}) => {
    const combinedClassName = cn(className, 'flex-shrink-0');
    const modeColors = getEditModeColors(mode);
    const style = { color: modeColors ? modeColors.text : 'var(--foreground)' };

    if (mode === 'full') {
        return <RiPencilAiLine className={combinedClassName} style={style} />;
    }
    if (mode === 'allow') {
        return <RiCheckboxCircleLine className={combinedClassName} style={style} />;
    }
    if (mode === 'deny') {
        return <RiCloseCircleLine className={combinedClassName} style={style} />;
    }
    return <RiQuestionLine className={combinedClassName} style={style} />;
};

const PermissionValue = ({
    label,
    summary,
    mobile = false,
}: {
    label: string;
    summary: PermissionSummary;
    mobile?: boolean;
}) => (
    <div className={cn('flex items-center', mobile ? 'justify-between' : 'gap-3')}>
        <span className={cn('typography-meta text-muted-foreground/80', !mobile && 'w-16')}>{label}</span>
        <div className="flex items-center gap-1.5">
            <EditModeIcon mode={summary.mode} />
            <span className={cn('typography-meta font-medium text-foreground', !mobile && 'w-12')}>
                {summary.label}
            </span>
        </div>
    </div>
);

const getAgentDetails = (agent: Agent) => ({
    hasCustomPrompt: Boolean(agent.prompt && agent.prompt.trim().length > 0),
    hasModelConfig: Boolean(agent.model?.providerID && agent.model?.modelID),
    hasTemperatureOrTopP: agent.temperature !== undefined || agent.topP !== undefined,
    editPermission: summarizePermission(agent.permission, 'edit'),
    bashPermission: summarizePermission(agent.permission, 'bash'),
    webfetchPermission: summarizePermission(agent.permission, 'webfetch'),
});

export const MobileAgentDetailsPanel = memo(function MobileAgentDetailsPanel({
    agent,
    onClose,
}: MobileAgentDetailsPanelProps) {
    const details = getAgentDetails(agent);

    return (
        <MobileOverlayPanel open={true} onClose={onClose} title={capitalizeAgentName(agent.name)}>
            <div className="flex flex-col gap-1.5">
                {agent.description && (
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-meta text-foreground">{agent.description}</div>
                    </div>
                )}

                <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                    <div className="typography-micro text-muted-foreground mb-0.5">Mode</div>
                    <div className="typography-meta text-foreground font-medium">
                        {agent.mode === 'primary'
                            ? 'Primary'
                            : agent.mode === 'subagent'
                                ? 'Subagent'
                                : agent.mode === 'all' ? 'All' : '—'}
                    </div>
                </div>

                {(details.hasModelConfig || details.hasTemperatureOrTopP) && (
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="typography-micro text-muted-foreground mb-1">Model</div>
                        {details.hasModelConfig && (
                            <div className="typography-meta text-foreground font-medium mb-1">
                                {agent.model!.providerID} / {agent.model!.modelID}
                            </div>
                        )}
                        {details.hasTemperatureOrTopP && (
                            <div className="flex flex-col gap-0.5">
                                {agent.temperature !== undefined && (
                                    <div className="flex items-center justify-between">
                                        <span className="typography-meta text-muted-foreground/80">Temperature</span>
                                        <span className="typography-meta font-medium text-foreground">{agent.temperature}</span>
                                    </div>
                                )}
                                {agent.topP !== undefined && (
                                    <div className="flex items-center justify-between">
                                        <span className="typography-meta text-muted-foreground/80">Top P</span>
                                        <span className="typography-meta font-medium text-foreground">{agent.topP}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                    <div className="typography-micro text-muted-foreground mb-1">Permissions</div>
                    <div className="flex flex-col gap-1">
                        <PermissionValue label="Edit" summary={details.editPermission} mobile />
                        <PermissionValue label="Bash" summary={details.bashPermission} mobile />
                        <PermissionValue label="WebFetch" summary={details.webfetchPermission} mobile />
                    </div>
                </div>

                {details.hasCustomPrompt && (
                    <div className="rounded-xl border border-border/40 bg-sidebar/30 px-2 py-1.5">
                        <div className="flex items-center justify-between">
                            <span className="typography-meta text-muted-foreground/80">Custom Prompt</span>
                            <RiCheckboxCircleLine className="h-4 w-4 text-foreground" />
                        </div>
                    </div>
                )}
            </div>
        </MobileOverlayPanel>
    );
});

export const AgentDetailsTooltipContent = memo(function AgentDetailsTooltipContent({ agent }: AgentDetailsProps) {
    if (!agent) {
        return (
            <TooltipContent align="start" sideOffset={8} className="max-w-[320px]">
                <div className="min-w-[200px] typography-meta text-muted-foreground">No agent selected.</div>
            </TooltipContent>
        );
    }

    const details = getAgentDetails(agent);
    return (
        <TooltipContent align="start" sideOffset={8} className="max-w-[280px]">
            <div className="flex min-w-[200px] flex-col gap-2.5">
                <div className="flex flex-col gap-0.5">
                    <span className="typography-micro font-semibold text-foreground">
                        {capitalizeAgentName(agent.name)}
                    </span>
                    {agent.description && (
                        <span className="typography-meta text-muted-foreground">{agent.description}</span>
                    )}
                </div>

                <div className="flex flex-col gap-1">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Mode
                    </span>
                    <span className="typography-meta text-foreground">
                        {agent.mode === 'primary'
                            ? 'Primary'
                            : agent.mode === 'subagent'
                                ? 'Subagent'
                                : agent.mode === 'all' ? 'All' : '—'}
                    </span>
                </div>

                {(details.hasModelConfig || details.hasTemperatureOrTopP) && (
                    <div className="flex flex-col gap-1">
                        <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                            Model
                        </span>
                        {details.hasModelConfig ? (
                            <span className="typography-meta text-foreground">
                                {agent.model!.providerID} / {agent.model!.modelID}
                            </span>
                        ) : (
                            <span className="typography-meta text-muted-foreground">—</span>
                        )}
                        {details.hasTemperatureOrTopP && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                                {agent.temperature !== undefined && (
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="typography-meta text-muted-foreground/80">Temperature</span>
                                        <span className="typography-meta font-medium text-foreground">{agent.temperature}</span>
                                    </div>
                                )}
                                {agent.topP !== undefined && (
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="typography-meta text-muted-foreground/80">Top P</span>
                                        <span className="typography-meta font-medium text-foreground">{agent.topP}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col gap-1">
                    <span className="typography-meta font-semibold uppercase tracking-wide text-muted-foreground/90">
                        Permissions
                    </span>
                    <PermissionValue label="Edit" summary={details.editPermission} />
                    <PermissionValue label="Bash" summary={details.bashPermission} />
                    <PermissionValue label="WebFetch" summary={details.webfetchPermission} />
                </div>

                {details.hasCustomPrompt && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="typography-meta text-muted-foreground/80">Custom Prompt</span>
                        <RiCheckboxCircleLine className="h-4 w-4 text-foreground" />
                    </div>
                )}
            </div>
        </TooltipContent>
    );
});
