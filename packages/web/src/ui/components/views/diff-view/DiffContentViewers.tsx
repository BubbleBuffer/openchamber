import React from 'react';

import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { getLanguageFromExtension, isImageFile } from '@/lib/tools/toolHelpers';
import { PierreDiffViewer } from '../PierreDiffViewer';
import type { DiffData } from './diffFileModel';

const BinaryDiffPlaceholder = React.memo(() => (
    <div className="rounded-lg border border-border/60 bg-background px-3 py-2">
        <div className="typography-meta text-muted-foreground">Content of this file cannot be viewed.</div>
    </div>
));

interface ImageDiffViewerProps {
    filePath: string;
    diff: DiffData;
    isVisible: boolean;
    renderSideBySide: boolean;
    inline?: boolean;
}

const ImageDiffViewer = React.memo<ImageDiffViewerProps>(({
    filePath,
    diff,
    isVisible,
    renderSideBySide,
    inline = false,
}) => {
    if (!isVisible) {
        return <div className="absolute inset-0 hidden" />;
    }

    const hasOriginal = diff.original.length > 0;
    const hasModified = diff.modified.length > 0;
    const containerClass = renderSideBySide
        ? `flex flex-row gap-6 items-start justify-center${inline ? '' : ' h-full'}`
        : 'flex flex-col gap-4 items-center';
    const imageContainerClass = renderSideBySide
        ? `flex flex-col items-center gap-2 flex-1 min-w-0${inline ? '' : ' h-full'}`
        : 'flex flex-col items-center gap-2';
    const imageClassName = renderSideBySide
        ? inline
            ? 'max-w-full max-h-[70vh] object-contain'
            : 'max-w-full max-h-[calc(100%-2rem)] object-contain'
        : 'max-w-full object-contain';

    return (
        <div
            className={inline ? 'w-full overflow-auto p-4' : 'absolute inset-0 overflow-auto p-4'}
            style={{ contain: inline ? 'layout' : 'size layout' }}
        >
            <div className={containerClass}>
                {hasOriginal ? (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">Original</span>
                        <img
                            src={diff.original}
                            alt={`Original: ${filePath}`}
                            className={imageClassName}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                ) : null}
                {hasModified ? (
                    <div className={imageContainerClass}>
                        <span className="typography-meta text-muted-foreground font-medium">
                            {hasOriginal ? 'Modified' : 'New'}
                        </span>
                        <img
                            src={diff.modified}
                            alt={`Modified: ${filePath}`}
                            className={imageClassName}
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
});

interface DiffViewerProps {
    filePath: string;
    diff: DiffData;
    renderSideBySide: boolean;
    wrapLines: boolean;
}

export const InlineDiffViewer = React.memo<DiffViewerProps>(({
    filePath,
    diff,
    renderSideBySide,
    wrapLines,
}) => {
    const language = React.useMemo(
        () => getLanguageFromExtension(filePath) || 'text',
        [filePath],
    );

    if (diff.isBinary) {
        return <BinaryDiffPlaceholder />;
    }

    if (isImageFile(filePath)) {
        return (
            <ImageDiffViewer
                filePath={filePath}
                diff={diff}
                isVisible
                renderSideBySide={renderSideBySide}
                inline
            />
        );
    }

    return (
        <div className="w-full" style={{ contain: 'layout' }}>
            <PierreDiffViewer
                original={diff.original}
                modified={diff.modified}
                language={language}
                fileName={filePath}
                renderSideBySide={renderSideBySide}
                wrapLines={wrapLines}
                layout="inline"
            />
        </div>
    );
});

export const SingleDiffViewer = React.memo<DiffViewerProps & { isVisible: boolean }>(({
    filePath,
    diff,
    isVisible,
    renderSideBySide,
    wrapLines,
}) => {
    const language = React.useMemo(
        () => getLanguageFromExtension(filePath) || 'text',
        [filePath],
    );

    if (diff.isBinary) {
        return <BinaryDiffPlaceholder />;
    }

    if (!isVisible) {
        return null;
    }

    if (isImageFile(filePath)) {
        return (
            <ImageDiffViewer
                filePath={filePath}
                diff={diff}
                isVisible={isVisible}
                renderSideBySide={renderSideBySide}
            />
        );
    }

    return (
        <ScrollableOverlay
            outerClassName="absolute inset-0"
            disableHorizontal={false}
            observeMutations={false}
            preventOverscroll
            data-diff-virtual-root
            data-diff-virtual-content
        >
            <PierreDiffViewer
                original={diff.original}
                modified={diff.modified}
                language={language}
                fileName={filePath}
                renderSideBySide={renderSideBySide}
                wrapLines={wrapLines}
                layout="inline"
            />
        </ScrollableOverlay>
    );
});
