import React from 'react';
import { RiSendPlane2Line } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { StopIcon } from '@/components/icons/StopIcon';

export type ComposerActionButtonsProps = {
    isMobile: boolean;
    footerIconButtonClass: string;
    sendIconSizeClass: string;
    stopIconSizeClass: string;
    canSend: boolean;
    canAbort: boolean;
    hasContent: boolean;
    currentSessionId: string | null;
    newSessionDraftOpen: boolean;
    onPrimaryAction: () => void;
    onQueueMessage: () => void;
    onAbort: () => void;
};

export const ComposerActionButtons = React.memo(function ComposerActionButtons(props: ComposerActionButtonsProps) {
    const {
        isMobile,
        footerIconButtonClass,
        sendIconSizeClass,
        stopIconSizeClass,
        canSend,
        canAbort,
        hasContent,
        currentSessionId,
        newSessionDraftOpen,
        onPrimaryAction,
        onQueueMessage,
        onAbort,
    } = props;

    const sendButton = (
        <button
            type={isMobile ? 'button' : 'submit'}
            disabled={!canSend || (!currentSessionId && !newSessionDraftOpen)}
            onClick={(event) => {
                if (!isMobile) {
                    return;
                }

                event.preventDefault();
                onPrimaryAction();
            }}
            className={cn(
                footerIconButtonClass,
                canSend && (currentSessionId || newSessionDraftOpen)
                    ? 'text-primary hover:text-primary'
                    : 'opacity-30'
            )}
            aria-label="Send message"
        >
            <RiSendPlane2Line className={cn(sendIconSizeClass)} />
        </button>
    );

    if (!canAbort) {
        return sendButton;
    }

    return (
        <div className="relative">
            {hasContent ? (
                <button
                    type="button"
                    disabled={!currentSessionId}
                    onClick={(event) => {
                        if (isMobile) {
                            event.preventDefault();
                        }
                        onQueueMessage();
                    }}
                    className={cn(
                        footerIconButtonClass,
                        'absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1',
                        currentSessionId ? 'text-primary hover:text-primary' : 'opacity-30'
                    )}
                    aria-label="Queue message"
                >
                    <RiSendPlane2Line className={cn(sendIconSizeClass, '-rotate-90')} />
                </button>
            ) : null}
            <button
                type="button"
                onClick={onAbort}
                className={cn(
                    footerIconButtonClass,
                    'text-[var(--status-error)] hover:text-[var(--status-error)]'
                )}
                aria-label="Stop generating"
            >
                <StopIcon className={cn(stopIconSizeClass)} />
            </button>
        </div>
    );
}, (prev, next) => (
    prev.isMobile === next.isMobile
    && prev.footerIconButtonClass === next.footerIconButtonClass
    && prev.sendIconSizeClass === next.sendIconSizeClass
    && prev.stopIconSizeClass === next.stopIconSizeClass
    && prev.canSend === next.canSend
    && prev.canAbort === next.canAbort
    && prev.hasContent === next.hasContent
    && prev.currentSessionId === next.currentSessionId
    && prev.newSessionDraftOpen === next.newSessionDraftOpen
));
