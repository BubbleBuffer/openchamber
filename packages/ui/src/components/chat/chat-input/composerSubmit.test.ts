import { describe, expect, test } from 'bun:test';
import type { Agent } from '@/lib/opencode/client';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import {
    buildComposerSubmitPayload,
    buildQueuedMessageContent,
    getLocalSlashCommandName,
    isPayloadTooLargeError,
    isSoftNetworkSendError,
} from './composerSubmit';

const agents = [
    { name: 'reviewer', mode: 'subagent' },
    { name: 'build', mode: 'primary' },
] as Agent[];

const makeFile = (id: string): AttachedFile => ({
    id,
    file: new File([], `${id}.txt`, { type: 'text/plain' }),
    filename: `${id}.txt`,
    mimeType: 'text/plain',
    size: 0,
    dataUrl: `file:///repo/${id}.txt`,
    source: 'server',
    serverPath: `/repo/${id}.txt`,
});

const makeDraft = (): InlineCommentDraft => ({
    id: 'draft-1',
    sessionKey: 'session-a',
    source: 'file',
    fileLabel: 'app.ts',
    startLine: 3,
    endLine: 4,
    code: 'const x = 1;',
    language: 'ts',
    text: 'Needs cleanup',
    createdAt: 1,
});

const baseParams = {
    queuedOnly: false,
    hasContent: true,
    currentSessionId: 'session-a',
    newSessionDraftOpen: false,
    message: 'hello',
    queuedMessages: [],
    agents,
    sendableAttachedFiles: [],
    inlineDrafts: [],
    syntheticParts: [],
    linkedIssue: null,
    linkedPr: null,
    sanitizeAttachmentsForSend: (files: AttachedFile[] | undefined) => files ?? [],
    extractInlineFileMentions: (text: string) => ({ sanitizedText: text, attachments: [] }),
};

describe('composerSubmit', () => {
    test('builds a simple current-message payload', () => {
        const payload = buildComposerSubmitPayload(baseParams);

        expect(payload?.primaryText).toBe('hello');
        expect(payload?.primaryAttachments).toEqual([]);
        expect(payload?.additionalParts).toEqual([]);
    });

    test('merges queued messages before current input', () => {
        const queuedAttachment = makeFile('queued');
        const currentAttachment = makeFile('current');
        const payload = buildComposerSubmitPayload({
            ...baseParams,
            message: 'current body',
            sendableAttachedFiles: [currentAttachment],
            queuedMessages: [
                { id: 'q1', content: 'first queued', attachments: [queuedAttachment], createdAt: 1 },
                { id: 'q2', content: 'second queued', createdAt: 2 },
            ],
        });

        expect(payload?.primaryText).toBe('first queued');
        expect(payload?.primaryAttachments).toEqual([queuedAttachment]);
        expect(payload?.additionalParts.map((part) => part.text)).toEqual(['second queued', 'current body']);
        expect(payload?.allAttachments).toEqual([queuedAttachment, currentAttachment]);
    });

    test('adds inline drafts to the last user-authored part', () => {
        const payload = buildComposerSubmitPayload({
            ...baseParams,
            message: 'please inspect',
            inlineDrafts: [makeDraft()],
        });

        expect(payload?.primaryText).toContain('please inspect');
        expect(payload?.primaryText).toContain('Comment on `app.ts` lines 3-4');
        expect(buildQueuedMessageContent('queued', [makeDraft()])).toContain('Needs cleanup');
    });

    test('appends synthetic and linked context parts', () => {
        const payload = buildComposerSubmitPayload({
            ...baseParams,
            syntheticParts: [{ text: 'synthetic conflict context' }],
            linkedIssue: { contextText: 'issue context' },
            linkedPr: { instructionsText: 'pr instructions', contextText: 'pr context' },
        });

        expect(payload?.additionalParts).toEqual([
            { text: 'synthetic conflict context', synthetic: true },
            { text: 'issue context', synthetic: true },
            { text: 'pr instructions', synthetic: true },
            { text: 'pr context', synthetic: true },
        ]);
    });

    test('extracts slash command names and classifies send errors', () => {
        expect(getLocalSlashCommandName('normal', '  /summary auth')).toBe('summary');
        expect(getLocalSlashCommandName('shell', '/summary auth')).toBeNull();
        expect(isSoftNetworkSendError('Gateway Timeout')).toBe(true);
        expect(isPayloadTooLargeError('413 entity too large')).toBe(true);
    });
});
