import React from 'react';

const MAX_VISIBLE_TEXTAREA_LINES = 8;

type TextareaSize = {
    height: number;
    maxHeight: number;
};

type UseComposerTextareaAutosizeOptions = {
    message: string;
    isDesktopExpanded: boolean;
    viewportSignal: unknown;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

type ComposerTextareaAutosizeState = {
    textareaSize: TextareaSize | null;
    adjustTextareaHeight: (options?: { allowShrink?: boolean }) => void;
};

export const useComposerTextareaAutosize = ({
    message,
    isDesktopExpanded,
    viewportSignal,
    textareaRef,
}: UseComposerTextareaAutosizeOptions): ComposerTextareaAutosizeState => {
    const [textareaSize, setTextareaSize] = React.useState<TextareaSize | null>(null);
    const previousMessageLengthRef = React.useRef(message.length);

    const adjustTextareaHeight = React.useCallback((options?: { allowShrink?: boolean }) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            return;
        }

        const previousScrollTop = textarea.scrollTop;

        if (isDesktopExpanded) {
            textarea.style.height = '100%';
            textarea.style.maxHeight = 'none';
            setTextareaSize(null);
            if (textarea.scrollTop !== previousScrollTop) {
                textarea.scrollTop = previousScrollTop;
            }
            return;
        }

        if (options?.allowShrink ?? true) {
            textarea.style.height = 'auto';
        }

        const view = textarea.ownerDocument?.defaultView;
        const computedStyle = view ? view.getComputedStyle(textarea) : null;
        const lineHeight = computedStyle ? parseFloat(computedStyle.lineHeight) : NaN;
        const paddingTop = computedStyle ? parseFloat(computedStyle.paddingTop) : NaN;
        const paddingBottom = computedStyle ? parseFloat(computedStyle.paddingBottom) : NaN;
        const fallbackLineHeight = 22;
        const fallbackPadding = 16;
        const paddingTotal = Number.isNaN(paddingTop) || Number.isNaN(paddingBottom)
            ? fallbackPadding
            : paddingTop + paddingBottom;
        const targetLineHeight = Number.isNaN(lineHeight) ? fallbackLineHeight : lineHeight;
        const maxHeight = targetLineHeight * MAX_VISIBLE_TEXTAREA_LINES + paddingTotal;
        const scrollHeight = textarea.scrollHeight || textarea.offsetHeight;
        const nextHeight = Math.min(scrollHeight, maxHeight);

        textarea.style.height = `${nextHeight}px`;
        textarea.style.maxHeight = `${maxHeight}px`;
        if (textarea.scrollTop !== previousScrollTop) {
            textarea.scrollTop = previousScrollTop;
        }

        setTextareaSize((prev) => {
            if (prev && prev.height === nextHeight && prev.maxHeight === maxHeight) {
                return prev;
            }
            return { height: nextHeight, maxHeight };
        });
    }, [isDesktopExpanded, textareaRef]);

    React.useLayoutEffect(() => {
        const allowShrink = message.length < previousMessageLengthRef.current;
        previousMessageLengthRef.current = message.length;
        adjustTextareaHeight({ allowShrink });
    }, [adjustTextareaHeight, message, viewportSignal]);

    return {
        textareaSize,
        adjustTextareaHeight,
    };
};
