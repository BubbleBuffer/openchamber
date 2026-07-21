import { describe, expect, test } from 'bun:test';
import { getComposerSlashCommand, isComposerSlashCommand, shouldHandleSlashCommandLocally } from './composerSlashCommands';

describe('composerSlashCommands', () => {
    test('detects supported local slash commands', () => {
        expect(getComposerSlashCommand('/undo')).toBe('undo');
        expect(getComposerSlashCommand('/redo now')).toBe('redo');
        expect(getComposerSlashCommand('/compact')).toBe('compact');
        expect(getComposerSlashCommand('/summary')).toBe('summary');
        expect(getComposerSlashCommand('/review')).toBe('review');
    });

    test('ignores unsupported commands and normal text', () => {
        expect(getComposerSlashCommand('/unsupported')).toBeNull();
        expect(getComposerSlashCommand('hello /undo')).toBeNull();
        expect(getComposerSlashCommand('')).toBeNull();
    });

    test('does not treat shell-mode text as local slash commands', () => {
        expect(shouldHandleSlashCommandLocally({ message: '/undo', inputMode: 'normal' })).toBe(true);
        expect(shouldHandleSlashCommandLocally({ message: '/undo', inputMode: 'shell' })).toBe(false);
    });

    test('supports boolean command checks', () => {
        expect(isComposerSlashCommand('/compact')).toBe(true);
        expect(isComposerSlashCommand('/nope')).toBe(false);
    });
});
