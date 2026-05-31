import React from 'react';
import { RiExternalLinkLine, RiCloseLine } from '@remixicon/react';

interface LinkedIssue {
    number: number;
    title: string;
    url: string;
    contextText: string;
    author?: { login: string; avatarUrl?: string };
}

interface LinkedPr {
    number: number;
    title: string;
    url: string;
    head: string;
    base: string;
    includeDiff: boolean;
    instructionsText: string;
    contextText: string;
    author?: { login: string; avatarUrl?: string };
}

interface ComposerLinkedContextRowProps {
    linkedIssue: LinkedIssue | null;
    linkedPr: LinkedPr | null;
    isVSCode: boolean;
    onOpenIssuePicker: () => void;
    onOpenPrPicker: () => void;
    onClearIssue: () => void;
    onClearPr: () => void;
}

export const ComposerLinkedContextRow = React.memo(function ComposerLinkedContextRow({
    linkedIssue,
    linkedPr,
    isVSCode,
    onOpenIssuePicker,
    onOpenPrPicker,
    onClearIssue,
    onClearPr,
}: ComposerLinkedContextRowProps) {
    if (!linkedIssue && !linkedPr) return null;

    return (
        <>
            {/* Linked Issue row */}
            {linkedIssue && !isVSCode && (
                <div className="pb-2 w-full px-1">
                    <button
                        type="button"
                        onClick={onOpenIssuePicker}
                        className="flex w-full items-center gap-1.5 text-sm hover:opacity-80 transition-opacity text-left h-5 px-1"
                    >
                        {linkedIssue.author?.avatarUrl && (
                            <img
                                src={linkedIssue.author.avatarUrl}
                                alt={linkedIssue.author.login}
                                className="h-5 w-5 rounded-full flex-shrink-0"
                            />
                        )}
                        <span className="text-muted-foreground flex-shrink-0">
                            #{linkedIssue.number}
                            {linkedIssue.author && (
                                <span className="ml-1">by {linkedIssue.author.login}</span>
                            )}
                        </span>
                        <span className="text-foreground truncate">
                            {linkedIssue.title}
                        </span>
                        <span className="flex items-center gap-0.5 flex-shrink-0">
                            <a
                                href={linkedIssue.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center h-6 w-6 hover:bg-[var(--interactive-hover)] rounded-full transition-colors"
                                aria-label="Open issue in browser"
                            >
                                <RiExternalLinkLine className="h-4 w-4 text-muted-foreground" />
                            </a>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClearIssue();
                                }}
                                className="flex items-center justify-center h-6 w-6 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
                                aria-label="Remove linked issue"
                            >
                                <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                            </span>
                        </span>
                    </button>
                </div>
            )}
            {linkedPr && !isVSCode && (
                <div className="pb-2 w-full px-1">
                    <button
                        type="button"
                        onClick={onOpenPrPicker}
                        className="flex w-full items-center gap-1.5 text-sm hover:opacity-80 transition-opacity text-left h-5 px-1"
                    >
                        {linkedPr.author?.avatarUrl && (
                            <img
                                src={linkedPr.author.avatarUrl}
                                alt={linkedPr.author.login}
                                className="h-5 w-5 rounded-full flex-shrink-0"
                            />
                        )}
                        <span className="text-muted-foreground flex-shrink-0">
                            PR #{linkedPr.number}
                            {linkedPr.author && (
                                <span className="ml-1">by {linkedPr.author.login}</span>
                            )}
                        </span>
                        <span className="text-foreground truncate">
                            {linkedPr.title}
                        </span>
                        <span className="text-muted-foreground flex-shrink-0 typography-meta">
                            {linkedPr.head} → {linkedPr.base}
                        </span>
                        <span className="flex items-center gap-0.5 flex-shrink-0">
                            <a
                                href={linkedPr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center h-6 w-6 hover:bg-[var(--interactive-hover)] rounded-full transition-colors"
                                aria-label="Open pull request in browser"
                            >
                                <RiExternalLinkLine className="h-4 w-4 text-muted-foreground" />
                            </a>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClearPr();
                                }}
                                className="flex items-center justify-center h-6 w-6 hover:bg-[var(--interactive-hover)] rounded-full transition-colors cursor-pointer"
                                aria-label="Remove linked pull request"
                            >
                                <RiCloseLine className="h-4 w-4 text-muted-foreground" />
                            </span>
                        </span>
                    </button>
                </div>
            )}
        </>
    );
});
