import { describe, expect, test } from 'bun:test';
import {
    encodeFilePath,
    hasDraggedFiles,
    normalizeDroppedPath,
    toProjectRelativeMentionPath,
    toServerFileUrl,
} from './fileDropUtils';

describe('fileDropUtils', () => {
    test('encodes server file URLs without escaping path separators', () => {
        expect(encodeFilePath('/tmp/a file.ts')).toBe('/tmp/a%20file.ts');
        expect(toServerFileUrl('/tmp/a file.ts')).toBe('file:///tmp/a%20file.ts');
    });

    test('preserves existing file URLs', () => {
        expect(toServerFileUrl('file:///tmp/a.ts')).toBe('file:///tmp/a.ts');
    });

    test('normalizes dropped file URIs and project-relative mention paths', () => {
        expect(normalizeDroppedPath('file:///repo/src/App.tsx')).toBe('/repo/src/App.tsx');
        expect(toProjectRelativeMentionPath('/repo/src/App.tsx', '/repo')).toBe('src/App.tsx');
        expect(toProjectRelativeMentionPath('/other/App.tsx', '/repo')).toBe('/other/App.tsx');
    });

    test('recognizes actual File drags', () => {
        const transfer = {
            files: [new File(['contents'], 'file.ts', { type: 'text/plain' })],
            items: [],
            types: ['Files'],
        } as unknown as DataTransfer;

        expect(hasDraggedFiles(transfer)).toBe(true);
    });

    test('recognizes protected-mode browser file drags by their standard type', () => {
        const transfer = {
            files: [],
            items: [],
            types: ['Files'],
        } as unknown as DataTransfer;

        expect(hasDraggedFiles(transfer)).toBe(true);
    });

    test('does not claim URI, editor, or text-only drags', () => {
        for (const type of ['text/uri-list', 'codefiles', 'application/vnd.code.tree', 'text/plain']) {
            const transfer = {
                files: [],
                items: [],
                types: [type],
            } as unknown as DataTransfer;

            expect(hasDraggedFiles(transfer)).toBe(false);
        }
    });
});
