import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine, RiEditLine, RiLoader4Line } from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { DiffViewToggle } from '@/components/chat/message/DiffViewToggle';
import type { DiffViewMode } from '@/components/chat/message/types';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { cn } from '@/lib/utils';
import { useDiffPreferencesStore } from '@/stores/useDiffPreferencesStore';
import { useGitStore } from '@/stores/git/useGitStore';
import { InlineDiffViewer } from './DiffContentViewers';
import { DiffTotals } from './DiffTotals';
import { describeChange, type DiffData, type FileEntry } from './diffFileModel';

const DIFF_REQUEST_TIMEOUT_MS = 15000;
const LARGE_DIFF_CHANGED_LINES = 500;

interface MultiFileDiffEntryProps {
    directory: string;
    file: FileEntry;
    layout: 'inline' | 'side-by-side';
    wrapLines: boolean;
    scrollRootRef: React.RefObject<HTMLElement | null>;
    isSelected: boolean;
    onSelect: (path: string) => void;
    registerSectionRef: (path: string, node: HTMLDivElement | null) => void;
    defaultCollapsed?: boolean;
    expandRequestPath?: string | null;
    expandRequestNonce?: number;
    showOpenInEditorAction?: boolean;
    isOpeningInEditor?: boolean;
    onOpenInEditor?: (filePath: string, diffData: DiffData | null) => void;
}

export const MultiFileDiffEntry = React.memo<MultiFileDiffEntryProps>(({
    directory,
    file,
    layout,
    wrapLines,
    scrollRootRef,
    isSelected,
    onSelect,
    registerSectionRef,
    defaultCollapsed = false,
    expandRequestPath = null,
    expandRequestNonce = 0,
    showOpenInEditorAction = false,
    isOpeningInEditor = false,
    onOpenInEditor,
}) => {
    const { git } = useRuntimeAPIs();
    const cachedDiff = useGitStore(
        React.useCallback((state) => {
            return state.directories.get(directory)?.diffCache.get(file.path) ?? null;
        }, [directory, file.path]),
    );
    const setDiff = useGitStore((state) => state.setDiff);
    const setDiffFileLayout = useDiffPreferencesStore((state) => state.setDiffFileLayout);

    const [isExpanded, setIsExpanded] = React.useState(!defaultCollapsed);
    const [hasBeenVisible, setHasBeenVisible] = React.useState(false);
    const [diffRetryNonce, setDiffRetryNonce] = React.useState(0);
    const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [forceRenderLarge, setForceRenderLarge] = React.useState(false);
    const lastDiffRequestRef = React.useRef<string | null>(null);
    const sectionRef = React.useRef<HTMLDivElement | null>(null);

    const descriptor = React.useMemo(() => describeChange(file), [file]);
    const renderSideBySide = layout === 'side-by-side';
    const changedLineCount = file.insertions + file.deletions;

    const diffData = React.useMemo<DiffData | null>(() => {
        if (!cachedDiff) return null;
        return {
            original: cachedDiff.original,
            modified: cachedDiff.modified,
            isBinary: cachedDiff.isBinary,
        };
    }, [cachedDiff]);

    const setSectionRef = React.useCallback((node: HTMLDivElement | null) => {
        sectionRef.current = node;
        registerSectionRef(file.path, node);
    }, [file.path, registerSectionRef]);

    const handleOpenChange = React.useCallback((open: boolean) => {
        setIsExpanded(open);
        if (open) {
            setHasBeenVisible(true);
        }
    }, []);

    const handleSelect = React.useCallback(() => {
        onSelect(file.path);
    }, [file.path, onSelect]);

    React.useEffect(() => {
        if (!isExpanded || hasBeenVisible) return;
        const target = sectionRef.current;
        if (!target) return;

        if (!scrollRootRef.current || typeof IntersectionObserver === 'undefined') {
            setHasBeenVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setHasBeenVisible(true);
                    observer.disconnect();
                }
            },
            { root: scrollRootRef.current, rootMargin: '200px 0px', threshold: 0.1 },
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [hasBeenVisible, isExpanded, scrollRootRef]);

    React.useEffect(() => {
        if (expandRequestNonce <= 0 || expandRequestPath !== file.path) {
            return;
        }

        setIsExpanded(true);
        setHasBeenVisible(true);
    }, [expandRequestNonce, expandRequestPath, file.path]);

    React.useEffect(() => {
        if (!isExpanded || !hasBeenVisible) return;
        if (!directory || diffData) {
            lastDiffRequestRef.current = null;
            setIsLoading(false);
            return;
        }

        const requestKey = `${directory}::${file.path}::${diffRetryNonce}`;
        if (lastDiffRequestRef.current === requestKey) {
            return;
        }
        lastDiffRequestRef.current = requestKey;
        setDiffLoadError(null);
        setIsLoading(true);

        let cancelled = false;
        const fetchPromise = git.getGitFileDiff(directory, { path: file.path });
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () => reject(new Error(`Timed out after ${DIFF_REQUEST_TIMEOUT_MS}ms`)),
                DIFF_REQUEST_TIMEOUT_MS,
            );
        });

        void Promise.race([fetchPromise, timeoutPromise])
            .then((response) => {
                if (cancelled) return;

                setDiff(directory, file.path, {
                    original: response.original ?? '',
                    modified: response.modified ?? '',
                    isBinary: response.isBinary,
                });
                setIsLoading(false);
            })
            .catch((error) => {
                if (cancelled) return;
                setDiffLoadError(error instanceof Error ? error.message : String(error));
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
            if (lastDiffRequestRef.current === requestKey) {
                lastDiffRequestRef.current = null;
            }
        };
    }, [directory, diffData, diffRetryNonce, file.path, git, hasBeenVisible, isExpanded, setDiff]);

    const handleToggle = React.useCallback(() => {
        handleOpenChange(!isExpanded);
        handleSelect();
    }, [handleOpenChange, handleSelect, isExpanded]);

    const lastSlash = file.path.lastIndexOf('/');
    const directoryPath = lastSlash === -1 ? null : file.path.slice(0, lastSlash);
    const fileName = lastSlash === -1 ? file.path : file.path.slice(lastSlash + 1);

    return (
        <div ref={setSectionRef} className="scroll-mt-4">
            <div className="sticky top-0 z-10 bg-background">
                <button
                    type="button"
                    onClick={handleToggle}
                    className={cn(
                        'group/header relative flex w-full items-center gap-2 px-3 py-1.5 rounded-t-xl border border-border/60 overflow-hidden',
                        'bg-background',
                        isExpanded ? 'rounded-b-none' : 'rounded-b-xl',
                        'text-muted-foreground hover:text-foreground',
                        isSelected ? 'ring-1 ring-inset ring-[var(--interactive-selection)]' : null,
                    )}
                >
                    <div className="absolute inset-0 pointer-events-none group-hover/header:bg-interactive-hover" />
                    <div className="relative flex min-w-0 flex-1 items-center gap-2">
                        <span className="flex size-5 items-center justify-center opacity-70 group-hover/header:opacity-100">
                            {isExpanded ? (
                                <RiArrowDownSLine className="size-4" />
                            ) : (
                                <RiArrowRightSLine className="size-4" />
                            )}
                        </span>
                        <span
                            className="typography-micro font-semibold leading-none w-4 text-center uppercase"
                            style={{ color: descriptor.color }}
                            title={descriptor.description}
                            aria-label={descriptor.description}
                        >
                            {descriptor.code}
                        </span>
                        <span
                            className="min-w-0 flex-1 overflow-hidden typography-ui-label"
                            title={file.path}
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                <FileTypeIcon filePath={file.path} className="h-3.5 w-3.5 flex-shrink-0 align-middle" />
                                {directoryPath !== null ? (
                                    <span className="flex min-w-0 items-baseline overflow-hidden">
                                        <span
                                            className="min-w-0 truncate typography-ui-label text-muted-foreground"
                                            style={{ direction: 'rtl', textAlign: 'left' }}
                                        >
                                            {directoryPath}
                                        </span>
                                        <span className="flex-shrink-0 typography-ui-label">
                                            <span className="text-muted-foreground">/</span>
                                            <span className="text-foreground">{fileName}</span>
                                        </span>
                                    </span>
                                ) : (
                                    <span
                                        className="block min-w-0 truncate typography-ui-label text-foreground"
                                        style={{ direction: 'rtl', textAlign: 'left' }}
                                    >
                                        {fileName}
                                    </span>
                                )}
                            </span>
                        </span>
                    </div>
                    <div className="relative flex items-center gap-2">
                        <DiffTotals insertions={file.insertions} deletions={file.deletions} />
                        {showOpenInEditorAction && onOpenInEditor ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                                title="Open this file in editor at change"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenInEditor(file.path, diffData);
                                }}
                                disabled={isOpeningInEditor}
                            >
                                {isOpeningInEditor ? (
                                    <RiLoader4Line className="size-3.5 animate-spin" />
                                ) : (
                                    <RiEditLine className="size-3.5" />
                                )}
                            </Button>
                        ) : null}
                        <DiffViewToggle
                            mode={renderSideBySide ? 'side-by-side' : 'unified'}
                            onModeChange={(mode: DiffViewMode) => {
                                setDiffFileLayout(
                                    file.path,
                                    mode === 'side-by-side' ? 'side-by-side' : 'inline',
                                );
                            }}
                            className="opacity-70"
                        />
                    </div>
                </button>
            </div>
            {isExpanded ? (
                <div className="relative border border-t-0 border-border/60 bg-background rounded-b-xl overflow-hidden">
                    {diffLoadError ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                            <div className="typography-ui-label font-semibold text-foreground">
                                Failed to load diff
                            </div>
                            <div className="typography-meta text-muted-foreground max-w-[32rem] text-center">
                                {diffLoadError}
                            </div>
                            <button
                                type="button"
                                className="typography-ui-label text-primary hover:underline"
                                onClick={() => setDiffRetryNonce((nonce) => nonce + 1)}
                            >
                                Retry
                            </button>
                        </div>
                    ) : null}
                    {isLoading && !diffData && !diffLoadError ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                            <RiLoader4Line size={16} className="animate-spin" />
                            Loading diff…
                        </div>
                    ) : null}
                    {diffData && !forceRenderLarge && changedLineCount > LARGE_DIFF_CHANGED_LINES ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                            <div className="typography-ui-label font-semibold text-foreground">
                                Large diff ({changedLineCount} changed lines)
                            </div>
                            <div className="typography-meta text-muted-foreground">
                                Rendering may be slow. You can still view the diff by clicking below.
                            </div>
                            <button
                                type="button"
                                className="typography-ui-label text-primary hover:underline"
                                onClick={() => setForceRenderLarge(true)}
                            >
                                Render anyway
                            </button>
                        </div>
                    ) : null}
                    {diffData && (forceRenderLarge || changedLineCount <= LARGE_DIFF_CHANGED_LINES) ? (
                        <InlineDiffViewer
                            filePath={file.path}
                            diff={diffData}
                            renderSideBySide={renderSideBySide}
                            wrapLines={wrapLines}
                        />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
});
