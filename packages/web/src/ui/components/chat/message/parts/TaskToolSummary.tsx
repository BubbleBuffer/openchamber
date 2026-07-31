import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine, RiExternalLinkLine } from '@remixicon/react';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { getToolMetadata } from '@/lib/tools/toolHelpers';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/text';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useChatRenderingStore } from '@/stores/useChatRenderingStore';
import type { ToolPopupContent } from '../types';
import { ToolRevealOnMount } from './ToolRevealOnMount';
import { getToolIcon } from './toolPresentation';
import { ToolScrollableSection } from './ToolScrollableSection';
import { renderAnimatedPathWithIcon } from './ToolPathLabel';
import {
    getTaskSummaryLabel,
    shouldRenderGitPathLabel,
    stripTaskMetadataFromOutput,
    type TaskToolSummaryEntry,
} from './taskToolSummary';

interface TaskToolSummaryProps {
    entries: TaskToolSummaryEntry[];
    isExpanded: boolean;
    isMobile: boolean;
    output?: string;
    sessionId?: string;
    onShowPopup?: (content: ToolPopupContent) => void;
    input?: Record<string, unknown>;
    animateTailText?: boolean;
    isActive?: boolean;
}

export const TaskToolSummary: React.FC<TaskToolSummaryProps> = ({
    entries,
    isExpanded,
    isMobile,
    output,
    sessionId,
    onShowPopup,
    input,
    animateTailText = true,
    isActive = false,
}) => {
    const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
    const showToolFileIcons = useChatRenderingStore((state) => state.showToolFileIcons);
    const trimmedOutput = typeof output === 'string' ? stripTaskMetadataFromOutput(output) : '';
    const hasOutput = trimmedOutput.length > 0;
    const [isOutputExpanded, setIsOutputExpanded] = React.useState(false);

    const handleOpenSession = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (sessionId) {
            setCurrentSession(sessionId);
        }
    };

    const agentType = typeof input?.subagent_type === 'string' ? input.subagent_type : 'subagent';

    if (entries.length === 0 && !hasOutput && !sessionId) {
        return (
            <div className="relative pr-2 pb-2 pt-2 space-y-2 pl-[1.4375rem]">
                <div className="typography-meta text-muted-foreground/70">
                    {isActive ? 'Waiting for subagent activity...' : 'No subagent session id on task metadata.'}
                </div>
            </div>
        );
    }

    const visibleEntries = isExpanded ? entries : entries.slice(-6);
    const hiddenCount = Math.max(0, entries.length - visibleEntries.length);

    return (
        <div
            className={cn(
                'relative pr-2 pb-2 pt-2 space-y-2 pl-[1.4375rem]',
                'before:absolute before:left-[0.4375rem] before:w-px before:bg-border/80 before:content-[""]',
                'before:top-[-0.25rem] before:bottom-0',
            )}
        >
            {entries.length > 0 ? (
                <ToolScrollableSection maxHeightClass={isExpanded ? 'max-h-[40vh]' : 'max-h-56'} disableHorizontal>
                    <div className="w-full min-w-0 space-y-1">
                        {hiddenCount > 0 ? (
                            <div className="typography-micro text-muted-foreground/70">+{hiddenCount} more…</div>
                        ) : null}

                        {visibleEntries.map((entry, idx) => {
                            const normalizedToolName = entry.tool?.trim().toLowerCase().split('.').filter(Boolean).pop() ?? '';
                            const toolName = normalizedToolName || 'tool';
                            const label = getTaskSummaryLabel(entry);
                            const status = entry.state?.status;
                            const displayName = getToolMetadata(toolName).displayName;

                            return (
                                <ToolRevealOnMount key={entry.id ?? `${toolName}-${idx}`} animate={animateTailText} wipe>
                                    <div className={cn('flex gap-2 min-w-0 w-full', isMobile ? 'items-start' : 'items-center')}>
                                        <span className="flex-shrink-0 text-foreground/80">{getToolIcon(toolName)}</span>
                                        <span
                                            className="typography-meta text-foreground/80 flex-shrink-0"
                                            style={{ color: 'var(--tools-title)' }}
                                            title={displayName}
                                        >
                                            {displayName}
                                        </span>
                                        {label.trim().length > 0 ? (
                                            status !== 'error' && shouldRenderGitPathLabel(toolName, label) ? (
                                                renderAnimatedPathWithIcon(label, animateTailText, true, showToolFileIcons)
                                            ) : status === 'error' ? (
                                                <span
                                                    className={cn(
                                                        'typography-meta flex-1 min-w-0 text-[var(--status-error)]',
                                                        isMobile ? 'whitespace-normal break-words' : 'truncate',
                                                    )}
                                                >
                                                    {label}
                                                </span>
                                            ) : (
                                                <Text
                                                    variant={animateTailText ? 'generate-effect' : 'static'}
                                                    className={cn(
                                                        'typography-meta flex-1 min-w-0 text-muted-foreground/70',
                                                        isMobile ? 'whitespace-normal break-words' : 'truncate',
                                                    )}
                                                    style={{ color: 'var(--tools-description)' }}
                                                    title={label}
                                                >
                                                    {label}
                                                </Text>
                                            )
                                        ) : null}
                                    </div>
                                </ToolRevealOnMount>
                            );
                        })}
                    </div>
                </ToolScrollableSection>
            ) : null}

            {sessionId ? (
                <button
                    type="button"
                    className="flex items-center gap-2 typography-meta text-primary hover:text-primary/80 w-full"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={handleOpenSession}
                >
                    <RiExternalLinkLine className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="typography-meta text-primary font-medium">
                        Open {agentType.charAt(0).toUpperCase() + agentType.slice(1)} subtask
                    </span>
                </button>
            ) : null}

            {hasOutput ? (
                <div className={cn('space-y-1', (entries.length > 0 || sessionId) && 'pt-1')}>
                    <button
                        type="button"
                        className="flex items-center gap-2 typography-meta text-foreground/80 hover:text-foreground w-full"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setIsOutputExpanded((previous) => !previous);
                        }}
                    >
                        {isOutputExpanded ? (
                            <RiArrowDownSLine className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : (
                            <RiArrowRightSLine className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span className="typography-meta text-foreground/80 font-medium">Output</span>
                    </button>
                    {isOutputExpanded ? (
                        <ToolScrollableSection maxHeightClass="max-h-[50vh]">
                            <div className="w-full min-w-0">
                                <SimpleMarkdownRenderer content={trimmedOutput} variant="tool" onShowPopup={onShowPopup} />
                            </div>
                        </ToolScrollableSection>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};
