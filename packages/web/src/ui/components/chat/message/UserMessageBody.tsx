import React from 'react';
import { RiArrowGoBackLine, RiCheckLine, RiFileCopyLine, RiGitBranchLine } from '@remixicon/react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { Part } from '@/lib/opencode/client';
import { cn } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';

import { MessageFilesDisplay } from '../FileAttachment';
import { extractTextContent, isEmptyTextPart } from './partUtils';
import UserTextPart from './parts/UserTextPart';
import type { AgentMentionInfo, ToolPopupContent } from './types';

type SubtaskPartLike = Part & {
    type: 'subtask';
    description?: unknown;
    command?: unknown;
    agent?: unknown;
    prompt?: unknown;
    taskSessionID?: unknown;
    model?: {
        providerID?: unknown;
        modelID?: unknown;
    };
};

type ShellActionPartLike = Part & {
    type: 'text';
    shellAction?: {
        command?: unknown;
        output?: unknown;
        status?: unknown;
    };
};

const isSubtaskPart = (part: Part): part is SubtaskPartLike => {
    return part.type === 'subtask';
};

const isShellActionPart = (part: Part): part is ShellActionPartLike => {
    const textPart = part as unknown as { type?: unknown; shellAction?: unknown };
    return textPart.type === 'text' && typeof textPart.shellAction === 'object' && textPart.shellAction !== null;
};

const normalizeSubtaskModel = (model: SubtaskPartLike['model']): string | null => {
    if (!model || typeof model !== 'object') return null;
    const providerID = typeof model.providerID === 'string' ? model.providerID.trim() : '';
    const modelID = typeof model.modelID === 'string' ? model.modelID.trim() : '';
    if (!providerID || !modelID) return null;
    return `${providerID}/${modelID}`;
};

const UserSubtaskPart: React.FC<{ part: SubtaskPartLike }> = ({ part }) => {
    const [expanded, setExpanded] = React.useState(false);
    const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);

    const description = typeof part.description === 'string' ? part.description.trim() : '';
    const command = typeof part.command === 'string' ? part.command.trim() : '';
    const agent = typeof part.agent === 'string' ? part.agent.trim() : '';
    const prompt = typeof part.prompt === 'string' ? part.prompt.trim() : '';
    const taskSessionID = typeof part.taskSessionID === 'string' ? part.taskSessionID.trim() : '';
    const model = normalizeSubtaskModel(part.model);

    return (
        <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="typography-meta font-semibold text-foreground">Delegated task</span>
                {command ? (
                    <span className="inline-flex h-5 items-center rounded px-1.5 text-[11px] leading-none bg-foreground/5 text-muted-foreground">
                        /{command}
                    </span>
                ) : null}
                {agent ? (
                    <span className="inline-flex h-5 items-center rounded px-1.5 text-[11px] leading-none bg-foreground/5 text-muted-foreground">
                        @{agent}
                    </span>
                ) : null}
                {model ? (
                    <span className="inline-flex h-5 items-center rounded px-1.5 text-[11px] leading-none bg-foreground/5 text-muted-foreground">
                        {model}
                    </span>
                ) : null}
            </div>

            {description ? (
                <div className="typography-ui-label text-foreground/90 mt-1.5">
                    {description}
                </div>
            ) : null}

            {prompt ? (
                <div className="mt-2 border-t border-border/60 pt-1.5">
                    <button
                        type="button"
                        className="typography-meta text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                        onClick={() => setExpanded((value) => !value)}
                    >
                        {expanded ? 'Hide prompt' : 'Show prompt'}
                    </button>
                    {expanded ? (
                        <pre className="typography-meta mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-foreground/85">
                            {prompt}
                        </pre>
                    ) : null}
                </div>
            ) : null}

            {taskSessionID ? (
                <div className="mt-1.5">
                    <button
                        type="button"
                        className="typography-meta text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                        onClick={() => {
                            void setCurrentSession(taskSessionID);
                        }}
                    >
                        Open subtask session
                    </button>
                </div>
            ) : null}
        </div>
    );
};

const UserShellActionPart: React.FC<{ part: ShellActionPartLike }> = ({ part }) => {
    const [expanded, setExpanded] = React.useState(false);
    const [copiedOutput, setCopiedOutput] = React.useState(false);
    const copiedResetTimeoutRef = React.useRef<number | null>(null);

    const command = typeof part.shellAction?.command === 'string' ? part.shellAction.command.trim() : '';
    const output = typeof part.shellAction?.output === 'string' ? part.shellAction.output : '';
    const status = typeof part.shellAction?.status === 'string' ? part.shellAction.status.trim().toLowerCase() : '';
    const hasOutput = output.trim().length > 0;

    const clearCopiedResetTimeout = React.useCallback(() => {
        if (copiedResetTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(copiedResetTimeoutRef.current);
            copiedResetTimeoutRef.current = null;
        }
    }, []);

    React.useEffect(() => {
        return () => {
            clearCopiedResetTimeout();
        };
    }, [clearCopiedResetTimeout]);

    const copyOutputToClipboard = React.useCallback(async () => {
        if (!hasOutput) return;

        const result = await copyTextToClipboard(output);
        if (!result.ok) return;

        clearCopiedResetTimeout();
        setCopiedOutput(true);
        if (typeof window !== 'undefined') {
            copiedResetTimeoutRef.current = window.setTimeout(() => {
                setCopiedOutput(false);
                copiedResetTimeoutRef.current = null;
            }, 2000);
        }
    }, [clearCopiedResetTimeout, hasOutput, output]);

    return (
        <div className="mt-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="typography-meta font-semibold text-foreground">Shell command</span>
                {status ? (
                    <span className={cn(
                        'inline-flex h-5 items-center rounded px-1.5 text-[11px] leading-none',
                        status === 'error'
                            ? 'bg-[var(--status-error-background)] text-[var(--status-error)]'
                            : 'bg-foreground/5 text-muted-foreground'
                    )}>
                        {status}
                    </span>
                ) : null}
            </div>

            {command ? (
                <pre className="typography-meta mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-foreground/90 font-mono">
                    {command}
                </pre>
            ) : null}

            {hasOutput ? (
                <div className="mt-2 border-t border-border/60 pt-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            className="typography-meta text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                            onClick={() => setExpanded((value) => !value)}
                        >
                            {expanded ? 'Hide output' : 'Show output'}
                        </button>
                        <button
                            type="button"
                            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => {
                                void copyOutputToClipboard();
                            }}
                            aria-label={copiedOutput ? 'Copied' : 'Copy output'}
                            title={copiedOutput ? 'Copied' : 'Copy output'}
                        >
                            {copiedOutput ? <RiCheckLine className="h-3.5 w-3.5" /> : <RiFileCopyLine className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    {expanded ? (
                        <pre className="typography-meta mt-1.5 max-h-56 overflow-auto whitespace-pre-wrap break-words text-foreground/85 font-mono">
                            {output}
                        </pre>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export interface UserMessageBodyProps {
    messageId: string;
    parts: Part[];
    isMobile: boolean;
    hasTouchInput?: boolean;
    hasTextContent?: boolean;
    onCopyMessage?: () => void;
    copiedMessage?: boolean;
    onShowPopup: (content: ToolPopupContent) => void;
    agentMention?: AgentMentionInfo;
    onRevert?: () => void;
    onFork?: () => void;
    userActionsMode?: 'inline' | 'external-content' | 'external-actions';
    stickyUserHeaderEnabled?: boolean;
}

export const UserMessageBody: React.FC<UserMessageBodyProps> = ({
    messageId,
    parts,
    isMobile,
    hasTouchInput,
    hasTextContent,
    onCopyMessage,
    copiedMessage,
    onShowPopup,
    agentMention,
    onRevert,
    onFork,
    userActionsMode = 'inline',
    stickyUserHeaderEnabled = true,
}) => {
    const [copyHintVisible, setCopyHintVisible] = React.useState(false);
    const copyHintTimeoutRef = React.useRef<number | null>(null);

    const userContentParts = React.useMemo(() => {
        return parts.filter((part) => {
            if (part.type === 'text') {
                return !isEmptyTextPart(part);
            }
            if (isSubtaskPart(part)) {
                return true;
            }
            if (isShellActionPart(part)) {
                return true;
            }
            return false;
        });
    }, [parts]);

    const mentionToken = agentMention?.token;
    let mentionInjected = false;

    const canCopyMessage = Boolean(onCopyMessage);
    const isMessageCopied = Boolean(copiedMessage);
    const isTouchContext = Boolean(hasTouchInput ?? isMobile);
    const hasCopyableText = Boolean(hasTextContent);
    const showUserContent = userActionsMode !== 'external-actions';
    const showUserActions = userActionsMode !== 'external-content';
    const useStickyScrollableUserContent = stickyUserHeaderEnabled && userActionsMode === 'inline';

    const clearCopyHintTimeout = React.useCallback(() => {
        if (copyHintTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(copyHintTimeoutRef.current);
            copyHintTimeoutRef.current = null;
        }
    }, []);

    const revealCopyHint = React.useCallback(() => {
        if (!isTouchContext || !canCopyMessage || !hasCopyableText || typeof window === 'undefined') {
            return;
        }

        clearCopyHintTimeout();
        setCopyHintVisible(true);
        copyHintTimeoutRef.current = window.setTimeout(() => {
            setCopyHintVisible(false);
            copyHintTimeoutRef.current = null;
        }, 1800);
    }, [canCopyMessage, clearCopyHintTimeout, hasCopyableText, isTouchContext]);

    React.useEffect(() => {
        if (!hasCopyableText) {
            setCopyHintVisible(false);
            clearCopyHintTimeout();
        }
    }, [clearCopyHintTimeout, hasCopyableText]);

    const handleCopyButtonClick = React.useCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            if (!onCopyMessage || !hasCopyableText) {
                return;
            }

            event.stopPropagation();
            event.preventDefault();
            onCopyMessage();

            if (isTouchContext) {
                revealCopyHint();
            }
        },
        [hasCopyableText, isTouchContext, onCopyMessage, revealCopyHint]
    );

    const actionsBlock = ((canCopyMessage && hasCopyableText) || onRevert || onFork) && showUserActions ? (
        <div className={cn(
            'group/user-actions',
            isMobile
                ? userActionsMode === 'inline'
                    ? 'flex items-center justify-end pt-2 pb-3'
                    : stickyUserHeaderEnabled
                        ? 'flex h-9 items-start justify-end pt-0'
                        : 'flex h-11 items-start justify-end pt-0'
                : userActionsMode === 'inline'
                    ? 'absolute top-full left-0 right-0 z-10 pt-5'
                    : 'flex h-8 items-start justify-end pt-2'
        )}>
            <div
                className={cn(
                    'flex items-center justify-end gap-1',
                    isMobile
                        ? userActionsMode === 'inline'
                            ? 'translate-x-5'
                            : 'translate-x-0'
                        : userActionsMode === 'inline'
                            ? 'translate-x-5'
                            : 'translate-x-0',
                    isMobile
                        ? 'pointer-events-auto opacity-100'
                        : 'pointer-events-none opacity-0 transition-opacity duration-150 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-hover/user-actions:pointer-events-auto group-hover/user-actions:opacity-100 group-hover/user-shell:pointer-events-auto group-hover/user-shell:opacity-100'
                )}
            >
                {onRevert && (
                    <Tooltip delayDuration={1000}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-primary/50"
                                aria-label="Revert to this message"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onRevert();
                                }}
                            >
                                <RiArrowGoBackLine className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>Revert from here</TooltipContent>
                    </Tooltip>
                )}
                {onFork && (
                    <Tooltip delayDuration={1000}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-primary/50"
                                aria-label="Fork from this message"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onFork();
                                }}
                            >
                                <RiGitBranchLine className="h-3 w-3" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>Fork from here</TooltipContent>
                    </Tooltip>
                )}
                {canCopyMessage && hasCopyableText && (
                    <Tooltip delayDuration={1000}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                data-visible={copyHintVisible || isMessageCopied ? 'true' : undefined}
                                className="h-6 w-6 text-muted-foreground bg-transparent hover:text-foreground hover:!bg-transparent active:!bg-transparent focus-visible:!bg-transparent focus-visible:ring-2 focus-visible:ring-primary/50"
                                aria-label="Copy message text"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={handleCopyButtonClick}
                                onFocus={() => setCopyHintVisible(true)}
                                onBlur={() => {
                                    if (!isMessageCopied) {
                                        setCopyHintVisible(false);
                                    }
                                }}
                            >
                                {isMessageCopied ? (
                                    <RiCheckLine className="h-3 w-3 text-[color:var(--status-success)]" />
                                ) : (
                                    <RiFileCopyLine className="h-3 w-3" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={6}>Copy message</TooltipContent>
                    </Tooltip>
                )}
            </div>
        </div>
    ) : null;

    if (!showUserContent) {
        return <>{actionsBlock}</>;
    }

    return (
        <div
            className="relative w-full group/message"
            style={{ contain: 'layout', transform: 'translateZ(0)' }}
            onTouchStart={isTouchContext && canCopyMessage && hasCopyableText ? revealCopyHint : undefined}
        >
            <div
                className={cn(
                    'leading-relaxed text-foreground/90 text-base overflow-x-hidden',
                    useStickyScrollableUserContent
                        ? 'overflow-y-auto overscroll-contain scrollbar-none'
                        : 'overflow-y-hidden'
                )}
                style={useStickyScrollableUserContent ? { maxHeight: 'calc(var(--chat-scroll-height, 100dvh) * 0.4)' } : undefined}
            >
                {userContentParts.map((part, index) => {
                    if (isSubtaskPart(part)) {
                        return (
                            <React.Fragment key={part.id ?? `user-subtask-${index}`}>
                                <UserSubtaskPart part={part} />
                            </React.Fragment>
                        );
                    }

                    if (isShellActionPart(part)) {
                        return (
                            <React.Fragment key={part.id ?? `user-shell-${index}`}>
                                <UserShellActionPart part={part} />
                            </React.Fragment>
                        );
                    }

                    let mentionForPart: AgentMentionInfo | undefined;
                    if (agentMention && mentionToken && !mentionInjected) {
                        const candidateText = extractTextContent(part);
                        if (candidateText.includes(mentionToken)) {
                            mentionForPart = agentMention;
                            mentionInjected = true;
                        }
                    }
                    return (
                        <React.Fragment key={part.id ?? `user-text-${index}`}>
                            <UserTextPart
                                part={part}
                                messageId={messageId}
                                isMobile={isMobile}
                                agentMention={mentionForPart}
                            />
                        </React.Fragment>
                    );
                })}
            </div>
            <MessageFilesDisplay files={parts} onShowPopup={onShowPopup} compact />
            {actionsBlock}
        </div>
    );
};
