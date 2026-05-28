import { describe, expect, test } from 'bun:test';
import {
    collectDroppedFileUris,
    encodeFilePath,
    normalizeDroppedPath,
    parseDroppedFileReferences,
    toLikelyFileDropReference,
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

    test('recognizes absolute drop references only', () => {
        expect(toLikelyFileDropReference('/repo/file.ts')).toBe('/repo/file.ts');
        expect(toLikelyFileDropReference('file:///repo/file.ts')).toBe('file:///repo/file.ts');
        expect(toLikelyFileDropReference('relative/file.ts')).toBeNull();
    });

    test('extracts file references from text and nested JSON payloads', () => {
        const payload = JSON.stringify({
            resources: [{ uri: 'file:///repo/a.ts' }, { path: '/repo/b.ts' }],
            ignored: 'relative/c.ts',
        });

        expect(parseDroppedFileReferences(payload)).toEqual([
            'file:///repo/a.ts',
            '/repo/b.ts',
        ]);
    });

    test('normalizes dropped file URIs and project-relative mention paths', () => {
        expect(normalizeDroppedPath('file:///repo/src/App.tsx')).toBe('/repo/src/App.tsx');
        expect(toProjectRelativeMentionPath('/repo/src/App.tsx', '/repo')).toBe('src/App.tsx');
        expect(toProjectRelativeMentionPath('/other/App.tsx', '/repo')).toBe('/other/App.tsx');
    });

    test('collects dropped URI references from configured data types', () => {
        const data = new Map<string, string>([
            ['text/uri-list', 'file:///repo/a.ts\n/repo/b.ts'],
        ]);
        const transfer = {
            getData: (type: string) => data.get(type) ?? '',
        } as DataTransfer;

        expect(collectDroppedFileUris(transfer, ['text/uri-list'])).toEqual([
            'file:///repo/a.ts',
            '/repo/b.ts',
        ]);
    });
});
