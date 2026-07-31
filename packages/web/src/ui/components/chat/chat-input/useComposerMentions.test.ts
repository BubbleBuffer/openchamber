import { describe, expect, test } from 'bun:test';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import {
    buildComposerMentionHighlight,
    extractInlineFileMentions,
    sanitizeComposerAttachments,
} from './useComposerMentions';

const agents = [{ name: 'reviewer' }];
const confirmedPaths = new Set(['src/app.ts', 'docs/guide.md']);
const isConfirmedFilePath = (path: string) => confirmedPaths.has(path);

describe('composer mentions', () => {
    test('highlights confirmed file and agent mentions without highlighting email-like text', () => {
        expect(buildComposerMentionHighlight({
            message: 'Ask @reviewer about @src/app.ts, not me@example.com',
            inputMode: 'normal',
            agents,
            isConfirmedFilePath,
        })).toEqual([
            { text: 'Ask ', mentionKind: 'none' },
            { text: '@reviewer', mentionKind: 'agent' },
            { text: ' about ', mentionKind: 'none' },
            { text: '@src/app.ts,', mentionKind: 'file' },
            { text: ' not me', mentionKind: 'none' },
            { text: '@example.com', mentionKind: 'none' },
        ]);
    });

    test('does not build a highlight layer for shell input or unconfirmed mentions', () => {
        expect(buildComposerMentionHighlight({
            message: '@src/app.ts',
            inputMode: 'shell',
            agents,
            isConfirmedFilePath,
        })).toBeNull();
        expect(buildComposerMentionHighlight({
            message: '@missing.ts',
            inputMode: 'normal',
            agents,
            isConfirmedFilePath,
        })).toBeNull();
    });

    test('extracts each confirmed file once and excludes agent mentions', () => {
        let nextId = 0;
        const result = extractInlineFileMentions({
            rawText: 'Ask @reviewer to compare @src/app.ts, with @src/app.ts.',
            rootDirectory: '/repo/',
            agents,
            isConfirmedFilePath,
            createAttachmentId: () => `attachment-${++nextId}`,
        });

        expect(result.sanitizedText).toBe('Ask @reviewer to compare @src/app.ts, with @src/app.ts.');
        expect(result.attachments).toHaveLength(1);
        expect(result.attachments[0]).toMatchObject({
            id: 'attachment-1',
            filename: 'app.ts',
            source: 'server',
            serverPath: '/repo/src/app.ts',
            dataUrl: 'file:///repo/src/app.ts',
        });
    });

    test('normalizes server attachments while preserving uploaded data URLs', () => {
        const serverFile = {
            id: 'server',
            file: new File([], 'app.ts'),
            filename: 'app.ts',
            mimeType: 'text/plain',
            size: 0,
            dataUrl: 'stale',
            source: 'server',
            serverPath: '/repo/src/app.ts',
        } satisfies AttachedFile;
        const localFile = {
            ...serverFile,
            id: 'local',
            source: 'local',
            serverPath: undefined,
            dataUrl: 'data:text/plain;base64,YQ==',
        } satisfies AttachedFile;

        expect(sanitizeComposerAttachments([serverFile, localFile]).map((file) => file.dataUrl)).toEqual([
            'file:///repo/src/app.ts',
            'data:text/plain;base64,YQ==',
        ]);
    });
});
