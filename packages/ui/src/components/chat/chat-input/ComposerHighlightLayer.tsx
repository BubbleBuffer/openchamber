import React from 'react';
import { cn } from '@/lib/utils';

interface HighlightPart {
    text: string;
    mentionKind: 'none' | 'file' | 'agent';
}

interface ComposerHighlightLayerProps {
    highlightedComposerContent: HighlightPart[] | null;
    composerHighlightRef: React.RefObject<HTMLDivElement | null>;
    isDesktopExpanded: boolean;
    isMobile: boolean;
    inputMode: 'normal' | 'shell';
}

export const ComposerHighlightLayer = React.memo(function ComposerHighlightLayer({
    highlightedComposerContent,
    composerHighlightRef,
    isDesktopExpanded,
    isMobile,
    inputMode,
}: ComposerHighlightLayerProps) {
    if (!highlightedComposerContent) return null;

    return (
        <div
            aria-hidden
            className={cn(
                'pointer-events-none absolute inset-0 z-0 whitespace-pre-wrap break-words px-3 rounded-b-none',
                isDesktopExpanded
                    ? 'h-full min-h-0 py-4'
                    : isMobile
                        ? 'py-2.5'
                        : 'pt-4 pb-2',
                inputMode === 'shell' ? 'font-mono' : 'typography-markdown md:typography-ui-label',
            )}
            ref={composerHighlightRef}
        >
            {highlightedComposerContent.map((part, index) => (
                <span
                    key={`${index}-${part.text.length}`}
                    className={
                        part.mentionKind === 'file'
                            ? 'text-[var(--status-info)]'
                            : part.mentionKind === 'agent'
                                ? 'text-[var(--status-success)]'
                                : 'text-foreground'
                    }
                >
                    {part.text}
                </span>
            ))}
        </div>
    );
});
