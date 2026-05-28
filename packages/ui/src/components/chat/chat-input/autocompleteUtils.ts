export type AutocompleteTab = 'commands' | 'agents' | 'files';
export type ComposerInputMode = 'normal' | 'shell';

export type ComposerAutocompleteState = {
    showCommandAutocomplete: boolean;
    commandQuery: string;
    showSkillAutocomplete: boolean;
    skillQuery: string;
    showFileMention: boolean;
    mentionQuery: string;
    autocompleteTab: AutocompleteTab;
};

export const getComposerAutocompleteState = ({
    value,
    cursorPosition,
    inputMode,
    currentTab,
}: {
    value: string;
    cursorPosition: number;
    inputMode: ComposerInputMode;
    currentTab: AutocompleteTab;
}): ComposerAutocompleteState => {
    const closed = {
        showCommandAutocomplete: false,
        commandQuery: '',
        showSkillAutocomplete: false,
        skillQuery: '',
        showFileMention: false,
        mentionQuery: '',
        autocompleteTab: currentTab,
    };

    if (inputMode === 'shell') {
        return closed;
    }

    if (value.startsWith('/')) {
        const firstSpace = value.indexOf(' ');
        const firstNewline = value.indexOf('\n');
        const commandEnd = Math.min(
            firstSpace === -1 ? value.length : firstSpace,
            firstNewline === -1 ? value.length : firstNewline,
        );

        if (cursorPosition <= commandEnd && firstSpace === -1) {
            return {
                ...closed,
                showCommandAutocomplete: true,
                commandQuery: value.substring(1, commandEnd),
                autocompleteTab: 'commands',
            };
        }
    }

    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastSlashSymbol = textBeforeCursor.lastIndexOf('/');
    if (lastSlashSymbol !== -1) {
        const charBefore = lastSlashSymbol > 0 ? textBeforeCursor[lastSlashSymbol - 1] : null;
        const textAfterSlash = textBeforeCursor.substring(lastSlashSymbol + 1);
        const hasSeparator = textAfterSlash.includes(' ') || textAfterSlash.includes('\n');
        const isWordBoundary = !charBefore || /\s/.test(charBefore);

        if (isWordBoundary && !hasSeparator) {
            return {
                ...closed,
                showSkillAutocomplete: true,
                skillQuery: textAfterSlash,
            };
        }
    }

    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    if (lastAtSymbol !== -1) {
        const charBefore = lastAtSymbol > 0 ? textBeforeCursor[lastAtSymbol - 1] : null;
        const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);
        const isWordBoundary = !charBefore || /\s/.test(charBefore);
        if (isWordBoundary && !textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
            return {
                ...closed,
                showFileMention: true,
                mentionQuery: textAfterAt,
                autocompleteTab: currentTab === 'files' ? 'files' : 'agents',
            };
        }
    }

    return closed;
};

export const buildAutocompletePrefixedMessage = (message: string, prefix: '/' | '@'): string => {
    if (message.length === 0) {
        return prefix;
    }
    if (message[0] === '/' || message[0] === '@') {
        return `${prefix}${message.slice(1)}`;
    }
    return `${prefix}${message}`;
};
