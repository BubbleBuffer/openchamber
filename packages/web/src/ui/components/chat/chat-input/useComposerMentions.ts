import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { toServerFileUrl } from './fileDropUtils';

export interface ComposerMentionAgent {
    name: string;
}

export interface ComposerHighlightPart {
    text: string;
    mentionKind: 'none' | 'file' | 'agent';
}

interface ComposerMentionContext {
    agents: ComposerMentionAgent[];
    isConfirmedFilePath: (path: string) => boolean;
}

interface InlineMentionExtractionOptions extends ComposerMentionContext {
    rawText: string;
    rootDirectory: string;
    createAttachmentId?: () => string;
}

interface UseComposerMentionsOptions extends ComposerMentionContext {
    message: string;
    inputMode: 'normal' | 'shell';
    chatSearchDirectory: string | null | undefined;
}

const MENTION_PATTERN = /@([^\s]+)/g;
const MENTION_BOUNDARY_PATTERN = /(\s|\(|\)|\[|\]|\{|\}|"|'|`|,|\.|;|:)/;
const TRAILING_MENTION_PUNCTUATION_PATTERN = /[),.;:!?`"'>]+$/g;

function normalizeMention(rawMention: string): string {
    return rawMention.trim().replace(TRAILING_MENTION_PUNCTUATION_PATTERN, '');
}

function startsAtMentionBoundary(text: string, offset: number): boolean {
    const charBefore = offset > 0 ? text[offset - 1] : null;
    return !charBefore || MENTION_BOUNDARY_PATTERN.test(charBefore);
}

function getMentionKind(
    mention: string,
    knownAgentNames: Set<string>,
    isConfirmedFilePath: (path: string) => boolean,
): ComposerHighlightPart['mentionKind'] {
    if (!mention) {
        return 'none';
    }
    if (knownAgentNames.has(mention.toLowerCase())) {
        return 'agent';
    }
    return isConfirmedFilePath(mention) ? 'file' : 'none';
}

function getHighlightKind(
    message: string,
    start: number,
    mention: string,
    knownAgentNames: Set<string>,
    isConfirmedFilePath: (path: string) => boolean,
): ComposerHighlightPart['mentionKind'] {
    if (!startsAtMentionBoundary(message, start)) {
        return 'none';
    }
    return getMentionKind(mention, knownAgentNames, isConfirmedFilePath);
}

export function buildComposerMentionHighlight({
    message,
    inputMode,
    agents,
    isConfirmedFilePath,
}: Omit<UseComposerMentionsOptions, 'chatSearchDirectory'>): ComposerHighlightPart[] | null {
    if (!message || !message.includes('@') || inputMode === 'shell') {
        return null;
    }

    const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));
    const parts: ComposerHighlightPart[] = [];
    const mentionRegex = new RegExp(MENTION_PATTERN);
    let lastIndex = 0;
    let hasHighlightedMention = false;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(message)) !== null) {
        const fullMention = match[0];
        const start = match.index;
        const mention = normalizeMention(String(match[1] || ''));
        const mentionKind = getHighlightKind(
            message,
            start,
            mention,
            knownAgentNames,
            isConfirmedFilePath,
        );

        if (start > lastIndex) {
            parts.push({ text: message.slice(lastIndex, start), mentionKind: 'none' });
        }
        parts.push({ text: fullMention, mentionKind });
        lastIndex = start + fullMention.length;
        hasHighlightedMention ||= mentionKind !== 'none';
    }

    if (!hasHighlightedMention) {
        return null;
    }
    if (lastIndex < message.length) {
        parts.push({ text: message.slice(lastIndex), mentionKind: 'none' });
    }
    return parts;
}

export function sanitizeComposerAttachments(files: AttachedFile[] | undefined): AttachedFile[] {
    return (files ?? []).map((file) => ({
        ...file,
        dataUrl: file.source === 'server' && file.serverPath
            ? toServerFileUrl(file.serverPath)
            : file.dataUrl,
    }));
}

interface ResolvedInlineMention {
    filename: string;
    serverPath: string;
}

function normalizeConfirmedMentionPath(
    rawMention: string,
    knownAgentNames: Set<string>,
    isConfirmedFilePath: (path: string) => boolean,
): string | null {
    const mentionPath = normalizeMention(rawMention).replace(/^[`"'<(]+/, '');
    if (
        !mentionPath
        || knownAgentNames.has(mentionPath.toLowerCase())
        || !isConfirmedFilePath(mentionPath)
    ) {
        return null;
    }
    return mentionPath;
}

function resolveMentionServerPath(mentionPath: string, root: string): string | null {
    const normalizedMentionPath = mentionPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
    if (!normalizedMentionPath) {
        return null;
    }

    const serverPath = mentionPath.startsWith('/')
        ? mentionPath.replace(/\\/g, '/')
        : root
            ? `${root}/${normalizedMentionPath}`
            : null;
    return serverPath?.replace(/\/+/g, '/') ?? null;
}

function resolveInlineMention(
    rawText: string,
    match: RegExpExecArray,
    root: string,
    knownAgentNames: Set<string>,
    isConfirmedFilePath: (path: string) => boolean,
): ResolvedInlineMention | null {
    if (!startsAtMentionBoundary(rawText, match.index)) {
        return null;
    }

    const mentionPath = normalizeConfirmedMentionPath(
        String(match[1] || ''),
        knownAgentNames,
        isConfirmedFilePath,
    );
    if (!mentionPath) {
        return null;
    }

    const serverPath = resolveMentionServerPath(mentionPath, root);
    if (!serverPath) {
        return null;
    }

    const normalizedMentionPath = mentionPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return {
        filename: normalizedMentionPath.split('/').filter(Boolean).pop() || normalizedMentionPath,
        serverPath,
    };
}

function createServerMentionAttachment(
    resolvedMention: ResolvedInlineMention,
    createAttachmentId: () => string,
): AttachedFile {
    return {
        id: createAttachmentId(),
        file: new File([], resolvedMention.filename, { type: 'text/plain' }),
        filename: resolvedMention.filename,
        mimeType: 'text/plain',
        size: 0,
        dataUrl: toServerFileUrl(resolvedMention.serverPath),
        source: 'server',
        serverPath: resolvedMention.serverPath,
    };
}

export function extractInlineFileMentions({
    rawText,
    rootDirectory,
    agents,
    isConfirmedFilePath,
    createAttachmentId = () => `inline-server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
}: InlineMentionExtractionOptions): { sanitizedText: string; attachments: AttachedFile[] } {
    if (!rawText || !rawText.includes('@')) {
        return { sanitizedText: rawText, attachments: [] };
    }

    const root = rootDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
    const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));
    const seenPaths = new Set<string>();
    const attachments: AttachedFile[] = [];
    const mentionRegex = new RegExp(MENTION_PATTERN);
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(rawText)) !== null) {
        const resolvedMention = resolveInlineMention(
            rawText,
            match,
            root,
            knownAgentNames,
            isConfirmedFilePath,
        );
        if (!resolvedMention || seenPaths.has(resolvedMention.serverPath)) {
            continue;
        }
        seenPaths.add(resolvedMention.serverPath);
        attachments.push(createServerMentionAttachment(resolvedMention, createAttachmentId));
    }

    return { sanitizedText: rawText, attachments };
}

export function useComposerMentions({
    message,
    inputMode,
    agents,
    isConfirmedFilePath,
    chatSearchDirectory,
}: UseComposerMentionsOptions) {
    const highlightedComposerContent = React.useMemo(
        () => buildComposerMentionHighlight({ message, inputMode, agents, isConfirmedFilePath }),
        [agents, inputMode, isConfirmedFilePath, message],
    );

    const sanitizeAttachmentsForSend = React.useCallback(sanitizeComposerAttachments, []);

    const extractMentions = React.useCallback(
        (rawText: string) => extractInlineFileMentions({
            rawText,
            rootDirectory: chatSearchDirectory || opencodeClient.getDirectory() || '',
            agents,
            isConfirmedFilePath,
        }),
        [agents, chatSearchDirectory, isConfirmedFilePath],
    );

    return {
        highlightedComposerContent,
        sanitizeAttachmentsForSend,
        extractInlineFileMentions: extractMentions,
    };
}
