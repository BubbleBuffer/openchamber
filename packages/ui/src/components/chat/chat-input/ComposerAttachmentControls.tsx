import React from 'react';
import {
    RiAddCircleLine,
    RiAiAgentLine,
    RiAttachment2,
    RiCommandLine,
    RiGitPullRequestLine,
    RiGithubLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ComposerAttachmentControlsProps = {
    isMobile: boolean;
    isVSCode: boolean;
    footerIconButtonClass: string;
    iconSizeClass: string;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    handleLocalFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
    handlePickLocalFiles: () => void;
    handleOpenCommandMenu: () => void;
    openIssuePicker: () => void;
    openPrPicker: () => void;
    onOpenSettings?: () => void;
};

export const ComposerAttachmentControls = React.memo(function ComposerAttachmentControls(props: ComposerAttachmentControlsProps) {
    const {
        isMobile,
        isVSCode,
        footerIconButtonClass,
        iconSizeClass,
        fileInputRef,
        handleLocalFileSelect,
        handlePickLocalFiles,
        handleOpenCommandMenu,
        openIssuePicker,
        openPrPicker,
        onOpenSettings,
    } = props;

    return (
        <div className="flex items-center gap-x-1.5">
            {isMobile ? (
                <button
                    type="button"
                    className={cn(
                        footerIconButtonClass,
                        'rounded-md',
                        'hover:bg-interactive-hover/40'
                    )}
                    onPointerDownCapture={(event) => {
                        if (event.pointerType === 'touch') {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }}
                    onClick={handleOpenCommandMenu}
                    title="Commands"
                    aria-label="Commands"
                >
                    <RiCommandLine className={cn(iconSizeClass)} />
                </button>
            ) : null}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleLocalFileSelect}
                accept="*/*"
            />

            <div className="relative inline-flex">
                {isVSCode ? (
                    <button
                        type="button"
                        className={footerIconButtonClass}
                        onClick={handlePickLocalFiles}
                        title="Attach files"
                        aria-label="Attach files"
                    >
                        <RiAttachment2 className={cn(iconSizeClass, 'text-current')} />
                    </button>
                ) : (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className={footerIconButtonClass}
                                title="Add attachment"
                                aria-label="Add attachment"
                            >
                                <RiAddCircleLine className={cn(iconSizeClass, 'text-current')} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem
                                onSelect={() => {
                                    requestAnimationFrame(handlePickLocalFiles);
                                }}
                            >
                                <RiAttachment2 />
                                Attach files
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    requestAnimationFrame(openIssuePicker);
                                }}
                            >
                                <RiGithubLine />
                                Link GitHub Issue
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    requestAnimationFrame(openPrPicker);
                                }}
                            >
                                <RiGitPullRequestLine />
                                Link GitHub PR
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {onOpenSettings ? (
                <button
                    type="button"
                    onClick={onOpenSettings}
                    className={footerIconButtonClass}
                    title="Model and agent settings"
                    aria-label="Model and agent settings"
                >
                    <RiAiAgentLine className={cn(iconSizeClass, 'text-current')} />
                </button>
            ) : null}
        </div>
    );
}, (prev, next) => (
    prev.isMobile === next.isMobile
    && prev.isVSCode === next.isVSCode
    && prev.footerIconButtonClass === next.footerIconButtonClass
    && prev.iconSizeClass === next.iconSizeClass
    && prev.onOpenSettings === next.onOpenSettings
));
