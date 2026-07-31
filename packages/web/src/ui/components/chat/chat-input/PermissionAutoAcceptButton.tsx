import React from 'react';
import { RiShieldCheckLine, RiShieldUserLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type PermissionAutoAcceptButtonProps = {
    footerIconButtonClass: string;
    iconSizeClass: string;
    permissionScopeSessionId: string | null;
    permissionAutoAcceptEnabled: boolean;
    handlePermissionAutoAcceptToggle: () => void;
    withTooltip?: boolean;
};

export const PermissionAutoAcceptButton = React.memo(function PermissionAutoAcceptButton(props: PermissionAutoAcceptButtonProps) {
    const {
        footerIconButtonClass,
        iconSizeClass,
        permissionScopeSessionId,
        permissionAutoAcceptEnabled,
        handlePermissionAutoAcceptToggle,
        withTooltip = false,
    } = props;

    const ariaLabel = permissionAutoAcceptEnabled
        ? 'Disable permission auto-accept'
        : 'Enable permission auto-accept';
    const tooltipLabel = permissionAutoAcceptEnabled
        ? 'Permission auto-accept: on'
        : 'Permission auto-accept: off';

    const button = (
        <button
            type="button"
            onClick={handlePermissionAutoAcceptToggle}
            className={cn(
                footerIconButtonClass,
                'rounded-md hover:bg-transparent',
                !permissionScopeSessionId && 'opacity-30',
            )}
            onMouseDown={(event) => {
                event.preventDefault();
            }}
            onPointerDownCapture={(event) => {
                if (event.pointerType === 'touch') {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }}
            aria-pressed={permissionAutoAcceptEnabled}
            aria-label={ariaLabel}
            title={ariaLabel}
        >
            {permissionAutoAcceptEnabled ? (
                <RiShieldCheckLine className={cn(iconSizeClass)} style={{ color: 'var(--status-info)' }} />
            ) : (
                <RiShieldUserLine className={cn(iconSizeClass)} />
            )}
        </button>
    );

    if (!withTooltip) {
        return button;
    }

    return (
        <Tooltip delayDuration={600}>
            <TooltipTrigger asChild>
                {button}
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
                {tooltipLabel}
            </TooltipContent>
        </Tooltip>
    );
});
