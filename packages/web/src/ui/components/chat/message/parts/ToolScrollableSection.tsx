import React from 'react';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { cn } from '@/lib/utils';

interface ToolScrollableSectionProps {
    children: React.ReactNode;
    maxHeightClass?: string;
    className?: string;
    outerClassName?: string;
    disableHorizontal?: boolean;
}

export const ToolScrollableSection: React.FC<ToolScrollableSectionProps> = ({
    children,
    maxHeightClass = 'max-h-[60vh]',
    className,
    outerClassName,
    disableHorizontal = false,
}) => (
    <div className={cn('w-full min-w-0 flex-none overflow-hidden', outerClassName)}>
        <ScrollShadow
            className={cn(
                'tool-output-surface p-2 rounded-xl w-full min-w-0',
                maxHeightClass,
                disableHorizontal ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto',
                className,
            )}
            size={24}
        >
            <div className="w-full min-w-0">
                {children}
            </div>
        </ScrollShadow>
    </div>
);
