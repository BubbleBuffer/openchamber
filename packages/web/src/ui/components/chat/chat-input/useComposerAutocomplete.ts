import React from 'react';
import {
    buildAutocompletePrefixedMessage,
    getComposerAutocompleteState,
    type AutocompleteTab,
    type ComposerInputMode,
} from './autocompleteUtils';

type UseComposerAutocompleteOptions = {
    message: string;
    setMessage: React.Dispatch<React.SetStateAction<string>>;
    inputMode: ComposerInputMode;
    isMobile: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    adjustTextareaHeight: () => void;
};

export type ComposerAutocompleteController = {
    showFileMention: boolean;
    mentionQuery: string;
    showCommandAutocomplete: boolean;
    commandQuery: string;
    autocompleteTab: AutocompleteTab;
    showSkillAutocomplete: boolean;
    skillQuery: string;
    setShowFileMention: React.Dispatch<React.SetStateAction<boolean>>;
    setMentionQuery: React.Dispatch<React.SetStateAction<string>>;
    setShowCommandAutocomplete: React.Dispatch<React.SetStateAction<boolean>>;
    setCommandQuery: React.Dispatch<React.SetStateAction<string>>;
    setAutocompleteTab: React.Dispatch<React.SetStateAction<AutocompleteTab>>;
    setShowSkillAutocomplete: React.Dispatch<React.SetStateAction<boolean>>;
    setSkillQuery: React.Dispatch<React.SetStateAction<string>>;
    updateAutocompleteState: (value: string, cursorPosition: number) => void;
    applyAutocompletePrefix: (prefix: '/' | '@') => void;
    handleAutocompleteTabSelect: (tab: AutocompleteTab) => void;
    handleOpenCommandMenu: () => void;
};

export const useComposerAutocomplete = ({
    message,
    setMessage,
    inputMode,
    isMobile,
    textareaRef,
    adjustTextareaHeight,
}: UseComposerAutocompleteOptions): ComposerAutocompleteController => {
    const [showFileMention, setShowFileMention] = React.useState(false);
    const [mentionQuery, setMentionQuery] = React.useState('');
    const [showCommandAutocomplete, setShowCommandAutocomplete] = React.useState(false);
    const [commandQuery, setCommandQuery] = React.useState('');
    const [autocompleteTab, setAutocompleteTab] = React.useState<AutocompleteTab>('commands');
    const [showSkillAutocomplete, setShowSkillAutocomplete] = React.useState(false);
    const [skillQuery, setSkillQuery] = React.useState('');

    const updateAutocompleteState = React.useCallback((value: string, cursorPosition: number) => {
        const next = getComposerAutocompleteState({
            value,
            cursorPosition,
            inputMode,
            currentTab: autocompleteTab,
        });
        setCommandQuery(next.commandQuery);
        setMentionQuery(next.mentionQuery);
        setSkillQuery(next.skillQuery);
        setAutocompleteTab(next.autocompleteTab);
        setShowCommandAutocomplete(next.showCommandAutocomplete);
        setShowSkillAutocomplete(next.showSkillAutocomplete);
        setShowFileMention(next.showFileMention);
    }, [autocompleteTab, inputMode]);

    const applyAutocompletePrefix = React.useCallback((prefix: '/' | '@') => {
        const nextMessage = buildAutocompletePrefixedMessage(message, prefix);
        setMessage(nextMessage);
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                const nextCursor = Math.min(nextMessage.length, textareaRef.current.value.length);
                textareaRef.current.selectionStart = nextCursor;
                textareaRef.current.selectionEnd = nextCursor;
            }
            adjustTextareaHeight();
            updateAutocompleteState(nextMessage, nextMessage.length);
        });
    }, [adjustTextareaHeight, message, setMessage, textareaRef, updateAutocompleteState]);

    const focusMobileTextareaAtEnd = React.useCallback(() => {
        const textarea = textareaRef.current;
        if (!isMobile || !textarea) {
            return textarea;
        }

        try {
            textarea.focus({ preventScroll: true });
        } catch {
            textarea.focus();
        }
        const len = textarea.value.length;
        try {
            textarea.setSelectionRange(len, len);
        } catch {
            // ignored
        }
        return textarea;
    }, [isMobile, textareaRef]);

    const handleAutocompleteTabSelect = React.useCallback((tab: AutocompleteTab) => {
        const textarea = focusMobileTextareaAtEnd();
        const cursorPosition = textarea?.selectionStart ?? message.length;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
        const nextMentionQuery = lastAtSymbol !== -1
            ? textBeforeCursor.substring(lastAtSymbol + 1).replace(/[\s\n].*$/, '')
            : '';

        setAutocompleteTab(tab);
        setCommandQuery('');
        if (tab === 'commands') {
            setMentionQuery('');
            applyAutocompletePrefix('/');
        }
        if (tab === 'agents') {
            setMentionQuery(nextMentionQuery);
            applyAutocompletePrefix('@');
        }
        if (tab === 'files') {
            setMentionQuery(nextMentionQuery);
            applyAutocompletePrefix('@');
        }
        setShowSkillAutocomplete(false);
        setShowCommandAutocomplete(tab === 'commands');
        setShowFileMention(tab === 'agents' || tab === 'files');
    }, [applyAutocompletePrefix, focusMobileTextareaAtEnd, message]);

    const handleOpenCommandMenu = React.useCallback(() => {
        if (!isMobile) {
            return;
        }
        focusMobileTextareaAtEnd();
        applyAutocompletePrefix('/');
        setCommandQuery('');
        setAutocompleteTab('commands');
        setShowCommandAutocomplete(true);
        setShowFileMention(false);
        setShowSkillAutocomplete(false);
    }, [applyAutocompletePrefix, focusMobileTextareaAtEnd, isMobile]);

    return {
        showFileMention,
        mentionQuery,
        showCommandAutocomplete,
        commandQuery,
        autocompleteTab,
        showSkillAutocomplete,
        skillQuery,
        setShowFileMention,
        setMentionQuery,
        setShowCommandAutocomplete,
        setCommandQuery,
        setAutocompleteTab,
        setShowSkillAutocomplete,
        setSkillQuery,
        updateAutocompleteState,
        applyAutocompletePrefix,
        handleAutocompleteTabSelect,
        handleOpenCommandMenu,
    };
};
