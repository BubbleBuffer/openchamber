import React from 'react';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { cn } from '@/lib/utils';

export const renderPathLikeGitChanges = (path: string, grow = true) => {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash === -1) {
        return (
            <span
                className={cn('min-w-0 truncate typography-ui-label text-foreground', grow && 'flex-1')}
                style={{ direction: 'rtl', textAlign: 'left' }}
                title={path}
            >
                {path}
            </span>
        );
    }

    const dir = path.slice(0, lastSlash);
    const name = path.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className={cn('min-w-0 flex items-baseline overflow-hidden typography-ui-label', grow && 'flex-1')} title={path}>
            {hasAbsoluteRoot ? <span className="flex-shrink-0 text-muted-foreground">/</span> : null}
            <span className="min-w-0 truncate text-muted-foreground" style={{ direction: 'rtl', textAlign: 'left' }}>
                {displayDir}
            </span>
            <span className="flex-shrink-0">
                <span className="text-muted-foreground">/</span>
                <span className="text-foreground">{name}</span>
            </span>
        </span>
    );
};

export const renderAnimatedPathWithIcon = (
    path: string,
    _animate = true,
    grow = true,
    showFileIcons = true,
) => {
    void _animate;
    const lastSlash = path.lastIndexOf('/');

    if (lastSlash === -1) {
        return (
            <span className={cn('min-w-0 inline-flex items-center gap-1 overflow-hidden', grow && 'flex-1')} title={path}>
                {showFileIcons ? <FileTypeIcon filePath={path} className="h-3.5 w-3.5 flex-shrink-0" /> : null}
                <span
                    className={cn('min-w-0 truncate whitespace-nowrap typography-meta', grow && 'flex-1')}
                    style={{ color: 'var(--tools-title)' }}
                >
                    {path}
                </span>
            </span>
        );
    }

    const dir = path.slice(0, lastSlash);
    const name = path.slice(lastSlash + 1);
    const hasAbsoluteRoot = dir.startsWith('/');
    const displayDir = hasAbsoluteRoot ? dir.slice(1) : dir;

    return (
        <span className={cn('min-w-0 inline-flex items-center gap-1 overflow-hidden', grow && 'flex-1')} title={path}>
            {showFileIcons ? <FileTypeIcon filePath={path} className="h-3.5 w-3.5 flex-shrink-0" /> : null}
            <span className={cn('min-w-0 inline-flex max-w-full items-baseline overflow-hidden typography-meta', grow && 'flex-1')}>
                {hasAbsoluteRoot ? <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }}>/</span> : null}
                <span
                    className="min-w-0 shrink truncate whitespace-nowrap"
                    style={{
                        color: 'var(--tools-description)',
                        direction: 'rtl',
                        textAlign: 'left',
                    }}
                >
                    {displayDir}
                </span>
                <span className="flex-shrink-0" style={{ color: 'var(--tools-description)' }}>/</span>
                <span className="flex-shrink-0" style={{ color: 'var(--tools-title)' }}>
                    {name}
                </span>
            </span>
        </span>
    );
};
