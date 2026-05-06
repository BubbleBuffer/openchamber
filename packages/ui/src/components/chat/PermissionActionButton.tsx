import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared button used across permission UIs (PermissionRequest,
 * PermissionToastActions, PermissionCard). Uses CSS `:hover` so the visual
 * affordance works for keyboard focus and touch — the prior pattern of
 * `onMouseEnter` / `onMouseLeave` inline style toggling silently broke on
 * touch devices.
 *
 * Two visual variants:
 * - `solid`  — tinted background fill (default for toast/card)
 * - `outline` — colored border with transparent fill (used by inline request)
 *
 * Three semantic tones aligned with theme status tokens.
 */

type PermissionTone = 'success' | 'info' | 'neutral' | 'error';
type PermissionVariant = 'solid' | 'outline';

interface PermissionActionButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    tone: PermissionTone;
    variant?: PermissionVariant;
    children: React.ReactNode;
}

const SOLID_TONE: Record<PermissionTone, string> = {
    success:
        'bg-[rgb(var(--status-success)/0.1)] text-[var(--status-success)] hover:bg-[rgb(var(--status-success)/0.2)]',
    info:
        'bg-[rgb(var(--status-info)/0.1)] text-[var(--status-info)] hover:bg-[rgb(var(--status-info)/0.2)]',
    neutral:
        'bg-[rgb(var(--muted)/0.5)] text-[var(--muted-foreground)] hover:bg-[rgb(var(--muted)/0.7)]',
    error:
        'bg-[rgb(var(--status-error)/0.1)] text-[var(--status-error)] hover:bg-[rgb(var(--status-error)/0.2)]',
};

const OUTLINE_TONE: Record<PermissionTone, string> = {
    success:
        'border border-[var(--status-success)] text-[var(--status-success)] bg-transparent hover:bg-[var(--status-success-background)]',
    info:
        'border border-[var(--status-info)] text-[var(--status-info)] bg-transparent hover:bg-[var(--status-info-background)]',
    neutral:
        'border border-border text-muted-foreground bg-transparent hover:bg-[rgb(var(--muted)/0.5)]',
    error:
        'border border-[var(--status-error)] text-[var(--status-error)] bg-transparent hover:bg-[var(--status-error-background)]',
};

export const PermissionActionButton = React.forwardRef<HTMLButtonElement, PermissionActionButtonProps>(
    function PermissionActionButton({ tone, variant = 'solid', className, children, ...rest }, ref) {
        const toneClasses = variant === 'outline' ? OUTLINE_TONE[tone] : SOLID_TONE[tone];
        return (
            <button
                ref={ref}
                {...rest}
                className={cn(
                    'flex items-center gap-1 px-2 py-1 typography-meta font-medium rounded h-6 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    toneClasses,
                    className,
                )}
            >
                {children}
            </button>
        );
    },
);
