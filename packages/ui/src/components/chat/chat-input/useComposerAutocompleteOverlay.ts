import React from 'react';

type AutocompleteOverlayPosition = {
    top: number;
    left: number;
    place: 'above' | 'below';
    maxHeight: number;
};

type UseComposerAutocompleteOverlayOptions = {
    isDesktopExpanded: boolean;
    messageLength: number;
    showCommandAutocomplete: boolean;
    showSkillAutocomplete: boolean;
    showFileMention: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    dropZoneRef: React.RefObject<HTMLDivElement | null>;
};

type ComposerAutocompleteOverlayState = {
    autocompleteOverlayPosition: AutocompleteOverlayPosition | null;
    updateAutocompleteOverlayPosition: () => void;
};

const measureCaretInTextarea = (textarea: HTMLTextAreaElement, cursorPosition: number): { top: number; left: number } | null => {
    const doc = textarea.ownerDocument;
    const win = doc.defaultView;
    if (!win) return null;

    const style = win.getComputedStyle(textarea);
    const mirror = doc.createElement('div');
    const mirrorStyle = mirror.style;

    mirrorStyle.position = 'absolute';
    mirrorStyle.visibility = 'hidden';
    mirrorStyle.pointerEvents = 'none';
    mirrorStyle.whiteSpace = 'pre-wrap';
    mirrorStyle.wordWrap = 'break-word';
    mirrorStyle.overflow = 'hidden';
    mirrorStyle.left = '-9999px';
    mirrorStyle.top = '0';

    mirrorStyle.width = `${textarea.clientWidth}px`;
    mirrorStyle.font = style.font;
    mirrorStyle.fontSize = style.fontSize;
    mirrorStyle.fontFamily = style.fontFamily;
    mirrorStyle.fontWeight = style.fontWeight;
    mirrorStyle.fontStyle = style.fontStyle;
    mirrorStyle.fontVariant = style.fontVariant;
    mirrorStyle.letterSpacing = style.letterSpacing;
    mirrorStyle.textTransform = style.textTransform;
    mirrorStyle.textIndent = style.textIndent;
    mirrorStyle.padding = style.padding;
    mirrorStyle.border = style.border;
    mirrorStyle.boxSizing = style.boxSizing;
    mirrorStyle.lineHeight = style.lineHeight;
    mirrorStyle.tabSize = style.tabSize;

    mirror.textContent = textarea.value.slice(0, cursorPosition);
    const marker = doc.createElement('span');
    marker.textContent = textarea.value.slice(cursorPosition, cursorPosition + 1) || ' ';
    mirror.appendChild(marker);

    doc.body.appendChild(mirror);
    const top = marker.offsetTop;
    const left = marker.offsetLeft;
    doc.body.removeChild(mirror);

    return { top, left };
};

export const useComposerAutocompleteOverlay = ({
    isDesktopExpanded,
    messageLength,
    showCommandAutocomplete,
    showSkillAutocomplete,
    showFileMention,
    textareaRef,
    dropZoneRef,
}: UseComposerAutocompleteOverlayOptions): ComposerAutocompleteOverlayState => {
    const [autocompleteOverlayPosition, setAutocompleteOverlayPosition] = React.useState<AutocompleteOverlayPosition | null>(null);

    const updateAutocompleteOverlayPosition = React.useCallback(() => {
        if (!isDesktopExpanded) {
            setAutocompleteOverlayPosition(null);
            return;
        }

        if (!showCommandAutocomplete && !showSkillAutocomplete && !showFileMention) {
            setAutocompleteOverlayPosition(null);
            return;
        }

        const textarea = textareaRef.current;
        const container = dropZoneRef.current;
        if (!textarea || !container) return;

        const cursor = textarea.selectionStart ?? messageLength;
        const caret = measureCaretInTextarea(textarea, cursor);
        if (!caret) return;

        const textareaRect = textarea.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        const caretY = textareaRect.top - containerRect.top + (caret.top - textarea.scrollTop);
        const caretX = textareaRect.left - containerRect.left + (caret.left - textarea.scrollLeft);

        const popupMargin = 8;
        const estimatedPopupHeight = 260;
        const spaceAbove = caretY - popupMargin;
        const spaceBelow = containerRect.height - caretY - popupMargin;
        const place: 'above' | 'below' = spaceBelow >= estimatedPopupHeight || spaceBelow >= spaceAbove ? 'below' : 'above';

        const desiredWidth = showFileMention ? 520 : showCommandAutocomplete ? 450 : 360;
        const clampedLeft = Math.max(
            popupMargin,
            Math.min(caretX - 24, containerRect.width - desiredWidth - popupMargin),
        );

        const maxHeight = Math.max(120, Math.min(estimatedPopupHeight, place === 'below' ? spaceBelow : spaceAbove));

        setAutocompleteOverlayPosition({
            top: place === 'below' ? caretY + 22 : caretY - 6,
            left: clampedLeft,
            place,
            maxHeight,
        });
    }, [
        dropZoneRef,
        isDesktopExpanded,
        messageLength,
        showCommandAutocomplete,
        showFileMention,
        showSkillAutocomplete,
        textareaRef,
    ]);

    React.useLayoutEffect(() => {
        updateAutocompleteOverlayPosition();
    }, [
        updateAutocompleteOverlayPosition,
        messageLength,
        showCommandAutocomplete,
        showSkillAutocomplete,
        showFileMention,
        isDesktopExpanded,
    ]);

    React.useEffect(() => {
        if (!isDesktopExpanded) return;
        const onResize = () => updateAutocompleteOverlayPosition();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [isDesktopExpanded, updateAutocompleteOverlayPosition]);

    return {
        autocompleteOverlayPosition,
        updateAutocompleteOverlayPosition,
    };
};
