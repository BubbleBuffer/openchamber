/**
 * Pure text-composition helpers used by ChatInput when injecting external text
 * (pending input, inline mentions) into the composer message.
 *
 * Extracted from ChatInput.tsx to keep the parent component focused on
 * orchestration. No React imports — these are stateless string operations.
 */

export const appendWithLineBreaks = (base: string, next: string): string => {
    const separator = !base
        ? ''
        : base.endsWith('\n\n')
            ? ''
            : base.endsWith('\n')
                ? '\n'
                : '\n\n';

    const nextWithTrailingBreaks = next.endsWith('\n\n')
        ? next
        : next.endsWith('\n')
            ? `${next}\n`
            : `${next}\n\n`;

    return `${base}${separator}${nextWithTrailingBreaks}`;
};

export const appendInlineText = (base: string, next: string): string => {
    const nextTrimmed = next.trim();
    if (!nextTrimmed) {
        return base;
    }
    if (!base) {
        return `${nextTrimmed} `;
    }
    const separator = /[\s\n]$/.test(base) ? '' : ' ';
    return `${base}${separator}${nextTrimmed} `;
};
