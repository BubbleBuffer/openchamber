import React from 'react';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';

/**
 * Touch-friendly color picker used for project icon backgrounds.
 *
 * Combines:
 *  - A row of preset swatches (large enough for touch).
 *  - A hex text input for arbitrary values.
 *  - The native `<input type="color">` for fine-grained picking on
 *    devices that have a usable native picker (kept as fallback —
 *    swatches cover the common case).
 *  - A Clear button that resets to `null`.
 */

const PRESET_COLORS = [
    '#0F172A', // slate-900
    '#1F2937', // gray-800
    '#7F1D1D', // red-900
    '#9A3412', // orange-800
    '#854D0E', // yellow-800
    '#166534', // green-800
    '#0E7490', // cyan-700
    '#1E40AF', // blue-800
    '#5B21B6', // violet-800
    '#86198F', // fuchsia-800
    '#9F1239', // rose-800
    '#FFFFFF', // white
];

interface IconBackgroundPickerProps {
    value: string | null;
    onChange: (value: string | null) => void;
    size?: 'sm' | 'md';
    className?: string;
    'aria-label'?: string;
}

export const IconBackgroundPicker: React.FC<IconBackgroundPickerProps> = ({
    value,
    onChange,
    size = 'md',
    className,
    'aria-label': ariaLabel = 'Icon background color',
}) => {
    const swatchSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
    const nativeSize = size === 'sm' ? 'h-9 w-10 sm:h-7 sm:w-9' : 'h-10 w-12 sm:h-8 sm:w-10';
    const inputSize = size === 'sm' ? 'h-7 w-[8rem]' : 'h-8 w-[8.5rem]';

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preset colors">
                {PRESET_COLORS.map((preset) => {
                    const isActive = value?.toLowerCase() === preset.toLowerCase();
                    return (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => onChange(preset)}
                            aria-label={`Set ${ariaLabel} to ${preset}`}
                            aria-pressed={isActive}
                            className={cn(
                                'rounded border transition-shadow',
                                swatchSize,
                                isActive
                                    ? 'border-primary ring-2 ring-primary/40'
                                    : 'border-border hover:border-primary/60',
                            )}
                            style={{ backgroundColor: preset }}
                        />
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="color"
                    value={value ?? '#000000'}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        'cursor-pointer rounded border border-border bg-transparent p-1',
                        nativeSize,
                    )}
                    aria-label={`${ariaLabel} (custom)`}
                />
                <Input
                    value={value ?? ''}
                    onChange={(event) => onChange(event.target.value || null)}
                    placeholder="#000000"
                    className={inputSize}
                    aria-label={`${ariaLabel} hex value`}
                />
                <Button
                    type="button"
                    size={size === 'sm' ? 'xs' : 'sm'}
                    variant="outline"
                    onClick={() => onChange(null)}
                    disabled={!value}
                >
                    Clear
                </Button>
            </div>
        </div>
    );
};
