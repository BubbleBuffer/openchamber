import React from 'react';
import { cn } from '@/lib/utils';
import { useProviderConfigStore } from '@/stores/useProviderConfigStore';
import { getModelDisplayName } from './mobileControlsUtils';

interface MobileModelButtonProps {
    onOpenModel: () => void;
    className?: string;
}

export const MobileModelButton: React.FC<MobileModelButtonProps> = ({ onOpenModel, className }) => {
    const currentModelId = useProviderConfigStore((state) => state.currentModelId);
    const getCurrentProvider = useProviderConfigStore((state) => state.getCurrentProvider);
    const currentProvider = getCurrentProvider();
    const modelLabel = getModelDisplayName(currentProvider, currentModelId);

    return (
        <button
            type="button"
            onClick={onOpenModel}
            className={cn(
                'inline-flex min-w-0 items-center justify-center',
                'rounded-lg border border-border/50 px-1.5',
                'typography-micro font-medium text-foreground/80',
                'focus:outline-none hover:bg-[var(--interactive-hover)]',
                className
            )}
            style={{ height: '44px', maxHeight: '44px', minHeight: '44px' }}
            title={modelLabel}
        >
            <span className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap scrollbar-hidden">
                {modelLabel}
            </span>
        </button>
    );
};

export default MobileModelButton;
