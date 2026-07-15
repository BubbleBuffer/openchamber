import { describe, expect, test } from 'bun:test';
import {
    buildAutocompletePrefixedMessage,
    getComposerAutocompleteState,
} from './autocompleteUtils';

describe('autocompleteUtils', () => {
    test('opens command autocomplete at leading slash before whitespace', () => {
        expect(getComposerAutocompleteState({
            value: '/sum',
            cursorPosition: 4,
            inputMode: 'normal',
            currentTab: 'agents',
        })).toEqual(expect.objectContaining({
            showCommandAutocomplete: true,
            commandQuery: 'sum',
            autocompleteTab: 'commands',
        }));
    });

    test('opens skill autocomplete for slash tokens after whitespace', () => {
        expect(getComposerAutocompleteState({
            value: 'use /theme',
            cursorPosition: 'use /theme'.length,
            inputMode: 'normal',
            currentTab: 'agents',
        })).toEqual(expect.objectContaining({
            showSkillAutocomplete: true,
            skillQuery: 'theme',
            showCommandAutocomplete: false,
        }));
    });

    test('opens mention autocomplete and preserves files tab when active', () => {
        expect(getComposerAutocompleteState({
            value: 'read @src',
            cursorPosition: 'read @src'.length,
            inputMode: 'normal',
            currentTab: 'files',
        })).toEqual(expect.objectContaining({
            showFileMention: true,
            mentionQuery: 'src',
            autocompleteTab: 'files',
        }));
    });

    test('shell mode closes autocomplete', () => {
        expect(getComposerAutocompleteState({
            value: '/sum',
            cursorPosition: 4,
            inputMode: 'shell',
            currentTab: 'commands',
        })).toEqual(expect.objectContaining({
            showCommandAutocomplete: false,
            showSkillAutocomplete: false,
            showFileMention: false,
        }));
    });

    test('prefix helper replaces an existing command or mention prefix', () => {
        expect(buildAutocompletePrefixedMessage('', '/')).toBe('/');
        expect(buildAutocompletePrefixedMessage('@src', '/')).toBe('/src');
        expect(buildAutocompletePrefixedMessage('hello', '@')).toBe('@hello');
    });
});
