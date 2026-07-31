import type { QueuedMessage } from '@/stores/messageQueueStore';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import { appendInlineComments } from '@/lib/messages/inlineComments';
import { parseAgentMentions } from '@/lib/messages/agentMentions';
import { getComposerSlashCommand } from './composerSlashCommands';

export type ComposerInputMode = 'normal' | 'shell';

export type ComposerAdditionalPart = {
    text: string;
    attachments?: AttachedFile[];
    synthetic?: boolean;
};

export type LinkedIssueContext = {
    contextText: string;
} | null;

export type LinkedPrContext = {
    instructionsText: string;
    contextText: string;
} | null;

export type InlineFileMentionExtractor = (rawText: string) => {
    sanitizedText: string;
    attachments: AttachedFile[];
};

export type AttachmentSanitizer = (files: AttachedFile[] | undefined) => AttachedFile[];

export type ComposerSubmitPayload = {
    primaryText: string;
    primaryAttachments: AttachedFile[];
    agentMentionName: string | undefined;
    additionalParts: ComposerAdditionalPart[];
    allAttachments: AttachedFile[];
};

export type SyntheticPart = {
    text: string;
};

export const trimComposerMessage = (value: string): string => value.replace(/^\n+|\n+$/g, '');

export const getLocalSlashCommandName = (
    inputMode: ComposerInputMode,
    primaryText: string,
): string | null => {
    return inputMode === 'shell' ? null : getComposerSlashCommand(primaryText);
};

export const isSoftNetworkSendError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('timeout')
        || normalized.includes('timed out')
        || normalized.includes('may still be processing')
        || normalized.includes('being processed')
        || normalized.includes('failed to fetch')
        || normalized.includes('networkerror')
        || normalized.includes('network error')
        || normalized.includes('gateway timeout')
        || normalized === 'failed to send message';
};

export const isPayloadTooLargeError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes('payload too large')
        || normalized.includes('413')
        || normalized.includes('entity too large');
};

export const buildComposerSubmitPayload = ({
    queuedOnly,
    hasContent,
    currentSessionId,
    newSessionDraftOpen,
    message,
    queuedMessages,
    agents,
    sendableAttachedFiles,
    inlineDrafts,
    syntheticParts,
    linkedIssue,
    linkedPr,
    sanitizeAttachmentsForSend,
    extractInlineFileMentions,
}: {
    queuedOnly: boolean;
    hasContent: boolean;
    currentSessionId: string | null;
    newSessionDraftOpen: boolean;
    message: string;
    queuedMessages: QueuedMessage[];
    agents: Parameters<typeof parseAgentMentions>[1];
    sendableAttachedFiles: AttachedFile[];
    inlineDrafts: InlineCommentDraft[];
    syntheticParts: SyntheticPart[] | null | undefined;
    linkedIssue: LinkedIssueContext;
    linkedPr: LinkedPrContext;
    sanitizeAttachmentsForSend: AttachmentSanitizer;
    extractInlineFileMentions: InlineFileMentionExtractor;
}): ComposerSubmitPayload | null => {
    const hasQueuedMessages = queuedMessages.length > 0;

    if (queuedOnly) {
        if (!hasQueuedMessages || !currentSessionId) return null;
    } else if ((!hasContent && !hasQueuedMessages) || (!currentSessionId && !newSessionDraftOpen)) {
        return null;
    }

    let primaryText = '';
    let primaryAttachments: AttachedFile[] = [];
    let agentMentionName: string | undefined;
    const additionalParts: ComposerAdditionalPart[] = [];

    for (let index = 0; index < queuedMessages.length; index += 1) {
        const queuedMessage = queuedMessages[index];
        const { sanitizedText, mention } = parseAgentMentions(queuedMessage.content, agents);
        const { sanitizedText: queuedText, attachments: mentionAttachments } = extractInlineFileMentions(sanitizedText);

        if (!agentMentionName && mention?.name) {
            agentMentionName = mention.name;
        }

        if (index === 0) {
            primaryText = queuedText;
            primaryAttachments = [
                ...sanitizeAttachmentsForSend(queuedMessage.attachments),
                ...mentionAttachments,
            ];
        } else {
            const queuedAttachments = sanitizeAttachmentsForSend(queuedMessage.attachments);
            additionalParts.push({
                text: queuedText,
                attachments: [...queuedAttachments, ...mentionAttachments],
            });
        }
    }

    if (!queuedOnly && hasContent) {
        const messageToSend = trimComposerMessage(message);
        const { sanitizedText, mention } = parseAgentMentions(messageToSend, agents);
        const { sanitizedText: messageText, attachments: mentionAttachments } = extractInlineFileMentions(sanitizedText);
        const attachmentsToSend = sanitizeAttachmentsForSend(sendableAttachedFiles);

        if (!agentMentionName && mention?.name) {
            agentMentionName = mention.name;
        }

        if (queuedMessages.length === 0) {
            primaryText = messageText;
            primaryAttachments = [...attachmentsToSend, ...mentionAttachments];
        } else {
            additionalParts.push({
                text: messageText,
                attachments: [...attachmentsToSend, ...mentionAttachments],
            });
        }
    }

    if (inlineDrafts.length > 0) {
        if (queuedMessages.length === 0) {
            primaryText = appendInlineComments(primaryText, inlineDrafts);
        } else if (additionalParts.length > 0) {
            const lastPart = additionalParts[additionalParts.length - 1];
            lastPart.text = appendInlineComments(lastPart.text, inlineDrafts);
        } else {
            primaryText = appendInlineComments(primaryText, inlineDrafts);
        }
    }

    if (syntheticParts && syntheticParts.length > 0) {
        for (const part of syntheticParts) {
            additionalParts.push({
                text: part.text,
                synthetic: true,
            });
        }
    }

    if (linkedIssue) {
        additionalParts.push({
            text: linkedIssue.contextText,
            synthetic: true,
        });
    }

    if (linkedPr) {
        additionalParts.push({
            text: linkedPr.instructionsText,
            synthetic: true,
        });
        additionalParts.push({
            text: linkedPr.contextText,
            synthetic: true,
        });
    }

    if (!primaryText && additionalParts.length === 0) {
        return null;
    }

    const allAttachments = [
        ...primaryAttachments,
        ...additionalParts.flatMap((part) => part.attachments ?? []),
    ];

    return {
        primaryText,
        primaryAttachments,
        agentMentionName,
        additionalParts,
        allAttachments,
    };
};

export const buildQueuedMessageContent = (
    message: string,
    drafts: InlineCommentDraft[],
): string => {
    const trimmed = trimComposerMessage(message);
    return drafts.length > 0 ? appendInlineComments(trimmed, drafts) : trimmed;
};
