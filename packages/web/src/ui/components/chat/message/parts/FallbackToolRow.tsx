import React from 'react';

import type { ContentChangeReason } from '@/components/chat/timeline/types';
import { Text } from '@/components/ui/text';
import type { ToolPart as ToolPartType } from '@/lib/opencode/client';
import { detectToolOutputLanguage, getToolMetadata } from '@/lib/tools/toolHelpers';
import { cn } from '@/lib/utils';
import type { ToolPopupContent } from '../types';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import { MinDurationShineText } from './MinDurationShineText';
import ToolPart from './ToolPart';
import { getToolIcon } from './toolPresentation';
import { isExpandableTool } from './toolRenderUtils';

const serializeToolOutput = (output: unknown): string => {
    if (typeof output === 'string') return output;
    if (output === undefined || output === null) return '';
    try {
        return JSON.stringify(output, null, 2);
    } catch {
        return String(output);
    }
};

interface FallbackToolRowProps {
    part: ToolPartType;
    onShowPopup: (content: ToolPopupContent) => void;
    animateTailText: boolean;
}

const FallbackToolRowInner: React.FC<FallbackToolRowProps> = ({ part, onShowPopup, animateTailText }) => {
    const toolName = part.tool?.trim() || 'tool';
    const normalizedToolName = toolName.toLowerCase();
    const displayName = getToolMetadata(normalizedToolName).displayName;
    const state = part.state as {
        input?: Record<string, unknown>;
        metadata?: Record<string, unknown>;
        output?: unknown;
        status?: string;
    } | undefined;
    const output = serializeToolOutput(state?.output);
    const isRunning = state?.status === 'pending' || state?.status === 'running' || state?.status === 'started';

    const handleClick = React.useCallback(() => {
        if (!output) return;
        onShowPopup({
            open: true,
            title: displayName,
            content: output,
            language: detectToolOutputLanguage(normalizedToolName, output, state?.input),
            metadata: state?.metadata,
        });
    }, [displayName, normalizedToolName, onShowPopup, output, state?.input, state?.metadata]);

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={!output}
            className={cn(
                'group/tool flex w-full min-w-0 items-center gap-x-1.5 rounded-xl py-1.5 pr-2 pl-px text-left',
                output ? 'cursor-pointer' : 'cursor-default',
            )}
            aria-label={output ? `${displayName}: inspect output` : displayName}
        >
            <span className="inline-flex h-5 flex-shrink-0 items-center" style={{ color: 'var(--tools-icon)' }}>
                {getToolIcon(toolName)}
            </span>
            <MinDurationShineText
                active={isRunning}
                minDurationMs={300}
                className="typography-meta inline-flex h-5 flex-shrink-0 items-center font-medium leading-5 opacity-85"
                style={{ color: 'var(--tools-title)' }}
                title={displayName}
            >
                {displayName}
            </MinDurationShineText>
            {output ? (
                <Text
                    variant={animateTailText ? 'generate-effect' : 'static'}
                    className="typography-meta min-w-0 flex-1 truncate whitespace-nowrap leading-5"
                    style={{ color: 'var(--tools-description)' }}
                >
                    {output}
                </Text>
            ) : null}
        </button>
    );
};

export const FallbackToolRow = React.memo(FallbackToolRowInner, (prev, next) => (
    prev.onShowPopup === next.onShowPopup
    && prev.animateTailText === next.animateTailText
    && areRenderRelevantPartsEqual([prev.part], [next.part])
));

interface InspectableToolRowProps extends FallbackToolRowProps {
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    syntaxTheme: Record<string, React.CSSProperties>;
    isMobile: boolean;
    onContentChange?: (reason?: ContentChangeReason) => void;
}

export const InspectableToolRow: React.FC<InspectableToolRowProps> = (props) => {
    if (!isExpandableTool(props.part.tool)) {
        return <FallbackToolRow part={props.part} onShowPopup={props.onShowPopup} animateTailText={props.animateTailText} />;
    }
    return <ToolPart {...props} />;
};
