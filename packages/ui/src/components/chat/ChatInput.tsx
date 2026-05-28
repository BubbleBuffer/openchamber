import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import {
    RiAttachment2,
    RiCloseLine,
    RiExternalLinkLine,
} from '@remixicon/react';
import { BrowserVoiceButton } from '@/components/voice';
// sessionStore removed — currentSessionId comes from useSessionUIStore
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore, type QueuedMessage } from '@/stores/messageQueueStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useInputStore } from '@/sync/input-store';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import * as sessionActions from '@/sync/session-actions';
import { useInlineCommentDraftStore } from '@/stores/useInlineCommentDraftStore';
import { renderMagicPrompt } from '@/lib/tools/magicPrompts';
import { AttachedFilesList } from './FileAttachment';
import { QueuedMessageChips } from './QueuedMessageChips';
import { FileMentionAutocomplete, type FileMentionHandle } from './autocomplete/FileMentionAutocomplete';
import { CommandAutocomplete, type CommandAutocompleteHandle, type CommandInfo } from './autocomplete/CommandAutocomplete';
import { SkillAutocomplete, type SkillAutocompleteHandle } from './autocomplete/SkillAutocomplete';
import { cn } from '@/lib/utils';
import { ModelControls } from './controls/ModelControls';
import { UnifiedControlsDrawer } from './controls/UnifiedControlsDrawer';
import { StatusRow } from './status/StatusRow';
import { PendingChangesBar } from './diff/PendingChangesBar';
import { MobileAgentButton } from './controls/MobileAgentButton';
import { MobileModelButton } from './controls/MobileModelButton';
import { MobileSessionStatusBar } from './mobile-session-status-bar/MobileSessionStatusBar';
import { useCurrentSessionActivity } from '@/hooks/useSessionActivity';
import { toast } from '@/components/ui';
// useMessageStore removed — messages now come from sync system
import { isTauriShell, isVSCodeRuntime } from '@/lib/desktop/desktop';
import type { MobileControlsPanel } from './controls/mobileControlsUtils';
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { GitHubIssuePickerDialog } from '@/components/session/GitHubIssuePickerDialog';
import { GitHubPrPickerDialog } from '@/components/session/GitHubPrPickerDialog';
import { useChatSearchDirectory } from '@/hooks/useChatSearchDirectory';
import { opencodeClient } from '@/lib/opencode/client';
import { createWorktreeDraft } from '@/lib/session/worktreeSessionCreator';
import { usePermissionStore } from '@/stores/permissionStore';
import { ComposerAttachmentControls } from './chat-input/ComposerAttachmentControls';
import { PermissionAutoAcceptButton } from './chat-input/PermissionAutoAcceptButton';
import { FocusModeButton } from './chat-input/FocusModeButton';
import { ComposerActionButtons } from './chat-input/ComposerActionButtons';
import { ComposerLinkedContextRow } from './chat-input/ComposerLinkedContextRow';
import { ComposerAutocompleteLayer } from './chat-input/ComposerAutocompleteLayer';
import { ComposerHighlightLayer } from './chat-input/ComposerHighlightLayer';
import { ComposerTextarea } from './chat-input/ComposerTextarea';
import { useChatComposerState, useChatSelection } from './state';
import { ComposerMobileControls } from './chat-input/ComposerMobileControls';
import { ComposerFooter } from './chat-input/ComposerFooter';
import { appendInlineText, appendWithLineBreaks } from './chat-input/textUtils';
import {
    collectDroppedFileUris as collectDroppedFileUrisFromTransfer,
    collectDroppedFiles as collectDroppedFilesFromTransfer,
    hasDraggedFiles as hasDraggedFilesInTransfer,
    normalizeDroppedPath,
    toProjectRelativeMentionPath,
    toServerFileUrl,
} from './chat-input/fileDropUtils';
import {
    buildComposerSubmitPayload,
    buildQueuedMessageContent,
    getLocalSlashCommandName,
    isPayloadTooLargeError,
    isSoftNetworkSendError,
} from './chat-input/composerSubmit';
import { ProjectSelectLabel } from './chat-input/ProjectSelectLabel';
import { useDraftTargetSelector } from './chat-input/useDraftTargetSelector';
import { useComposerDraft } from './chat-input/useComposerDraft';
import { useComposerAutocomplete } from './chat-input/useComposerAutocomplete';
import { useComposerTextareaAutosize } from './chat-input/useComposerTextareaAutosize';
import { useComposerAutocompleteOverlay } from './chat-input/useComposerAutocompleteOverlay';
import { useComposerHistory } from './chat-input/useComposerHistory';
import { useComposerKeyboard } from './chat-input/useComposerKeyboard';

const EMPTY_QUEUE: QueuedMessage[] = [];
const VS_CODE_DROP_DATA_TYPES = [
    'CodeFiles',
    'codefiles',
    'application/vnd.code.tree',
    'application/vnd.code.tree.explorer',
    'text/uri-list',
    'text/plain',
];

const MemoModelControls = React.memo(ModelControls);
const MemoUnifiedControlsDrawer = React.memo(UnifiedControlsDrawer);
const MemoBrowserVoiceButton = React.memo(BrowserVoiceButton);
const MemoMobileAgentButton = React.memo(MobileAgentButton);
const MemoMobileModelButton = React.memo(MobileModelButton);
const MemoStatusRow = React.memo(StatusRow);

interface ChatInputProps {
    onOpenSettings?: () => void;
    scrollToBottom?: (options?: { instant?: boolean; force?: boolean }) => void;
}

const ChatInputComponent: React.FC<ChatInputProps> = ({ onOpenSettings, scrollToBottom }) => {
    const [inputMode, setInputMode] = React.useState<'normal' | 'shell'>('normal');
    const [isDragging, setIsDragging] = React.useState(false);
    const [isInternalDrag, setIsInternalDrag] = React.useState(false);
    const [mobileControlsOpen, setMobileControlsOpen] = React.useState(false);
    const [mobileControlsPanel, setMobileControlsPanel] = React.useState<MobileControlsPanel>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const cursorPosRef = React.useRef(0);
    const dropZoneRef = React.useRef<HTMLDivElement>(null);
    const dragEnterCountRef = React.useRef(0);
    const suppressNextFileDropTextInsertRef = React.useRef(false);
    const suppressNextFileDropTextInsertTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDroppedAbsolutePathsRef = React.useRef<string[]>([]);
    const canAcceptDropRef = React.useRef(false);
    const nativeDragInsideDropZoneRef = React.useRef(false);
    const mentionRef = React.useRef<FileMentionHandle>(null);
    const commandRef = React.useRef<CommandAutocompleteHandle>(null);
    const skillRef = React.useRef<SkillAutocompleteHandle>(null);

    // TODO: port sendMessage to session-actions (complex — creates sessions, handles attachments, etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendMessage = React.useRef((...args: any[]) =>
        Promise.resolve((useSessionUIStore.getState().sendMessage as (...a: unknown[]) => unknown)(...args)),
    ).current;
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);
    const persistChatDraft = useUIStore((state) => state.persistChatDraft);
    // Adapter hooks — available for future use; currently using direct store reads
    // const composerState = useChatComposerState({ sessionId: currentSessionId });
    // const selection = useChatSelection();

    const handleComposerSessionChanged = React.useCallback(() => {
        setInputMode('normal');
    }, []);
    const {
        message,
        setMessage,
        messageRef,
        confirmedMentionsRef,
        isConfirmedFilePath,
        clearSubmittedDraft,
    } = useComposerDraft({
        currentSessionId,
        persistChatDraft,
        textareaRef,
        onSessionChanged: handleComposerSessionChanged,
    });
    const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);
    const newSessionDraftOpen = Boolean(newSessionDraft?.open);
    const abortPromptSessionId = useSessionUIStore((s) => s.abortPromptSessionId);
    const clearAbortPrompt = useSessionUIStore((s) => s.clearAbortPrompt);
    const attachedFiles = useInputStore((s) => s.attachedFiles);
    const addAttachedFile = useInputStore((s) => s.addAttachedFile);
    const clearAttachedFiles = useInputStore((s) => s.clearAttachedFiles);
    const saveSessionAgentSelection = useSelectionStore((s) => s.saveSessionAgentSelection);
    const consumePendingInputText = useInputStore((s) => s.consumePendingInputText);
    const setPendingInputText = useInputStore((s) => s.setPendingInputText);
    const pendingInputText = useInputStore((s) => s.pendingInputText);
    const consumePendingSyntheticParts = useInputStore((s) => s.consumePendingSyntheticParts);
    const acknowledgeSessionAbort = useSessionUIStore((s) => s.acknowledgeSessionAbort);
    const abortCurrentOperation = React.useCallback(
        (sessionIdOverride?: string) => sessionActions.abortCurrentOperation(sessionIdOverride ?? currentSessionId ?? ''),
        [currentSessionId],
    );
    const currentManagementSessionId = currentSessionId;
    const getEffectiveModel = useProviderConfigStore((state) => state.getEffectiveModel);
    const currentVariant = useProviderConfigStore((state) => state.currentVariant);
    const currentAgentName = useAgentConfigStore((state) => state.currentAgentName);
    const setAgent = useAgentConfigStore((state) => state.setAgent);
    const getVisibleAgents = useAgentConfigStore((state) => state.getVisibleAgents);
    const agents = getVisibleAgents();
    const primaryAgents = React.useMemo(() => agents.filter((agent) => agent.mode === 'primary'), [agents]);
    const isMobile = useUIStore((state) => state.isMobile);
    const isKeyboardOpen = useUIStore((state) => state.isKeyboardOpen);
    const inputBarOffset = useUIStore((state) => state.inputBarOffset);
    const inputSpellcheckEnabled = useUIStore((state) => state.inputSpellcheckEnabled);
    const isExpandedInput = useUIStore((state) => state.isExpandedInput);
    const setExpandedInput = useUIStore((state) => state.setExpandedInput);
    const { currentTheme } = useThemeSystem();
    const chatSearchDirectory = useChatSearchDirectory();
    const [showAbortStatus, setShowAbortStatus] = React.useState(false);
    const setSessionAutoAccept = usePermissionStore((state) => state.setSessionAutoAccept);
    const composerHighlightRef = React.useRef<HTMLDivElement | null>(null);

    const isDesktopExpanded = isExpandedInput && !isMobile;
    const chatInputRadius = 'var(--radius-xl)';

    const sendableAttachedFiles = attachedFiles;

    const hasInlineMentionForHighlight = React.useMemo(() => {
        if (!message || !message.includes('@') || inputMode === 'shell') {
            return false;
        }
        const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));
        const mentionRegex = /@([^\s]+)/g;
        let match: RegExpExecArray | null;
        while ((match = mentionRegex.exec(message)) !== null) {
            const offset = match.index;
            const charBefore = offset > 0 ? message[offset - 1] : null;
            if (charBefore && !/(\s|\(|\)|\[|\]|\{|\}|"|'|`|,|\.|;|:)/.test(charBefore)) {
                continue;
            }
            const mentionPath = String(match[1] || '').trim().replace(/[),.;:!?`"'>]+$/g, '');
            if (!mentionPath) {
                continue;
            }
            if (knownAgentNames.has(mentionPath.toLowerCase())) {
                return true;
            }
            if (isConfirmedFilePath(mentionPath)) {
                return true;
            }
        }
        return false;
    }, [agents, inputMode, isConfirmedFilePath, message]);

    const highlightedComposerContent = React.useMemo(() => {
        if (!hasInlineMentionForHighlight) {
            return null;
        }

        const parts: Array<{ text: string; mentionKind: 'none' | 'file' | 'agent' }> = [];
        const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));
        const mentionRegex = /@([^\s]+)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = mentionRegex.exec(message)) !== null) {
            const full = match[0];
            const mention = String(match[1] || '').trim().replace(/[),.;:!?`"'>]+$/g, '');
            const start = match.index;
            const end = start + full.length;
            const charBefore = start > 0 ? message[start - 1] : null;
            const isBoundary = !charBefore || /(\s|\(|\)|\[|\]|\{|\}|"|'|`|,|\.|;|:)/.test(charBefore);
            const isAgentMention = isBoundary && mention.length > 0 && knownAgentNames.has(mention.toLowerCase());
            const isFileMention = isBoundary
                && mention.length > 0
                && !knownAgentNames.has(mention.toLowerCase())
                && isConfirmedFilePath(mention);

            if (start > lastIndex) {
                parts.push({ text: message.slice(lastIndex, start), mentionKind: 'none' });
            }
            parts.push({
                text: full,
                mentionKind: isFileMention ? 'file' : isAgentMention ? 'agent' : 'none',
            });
            lastIndex = end;
        }

        if (lastIndex < message.length) {
            parts.push({ text: message.slice(lastIndex), mentionKind: 'none' });
        }

        return parts;
    }, [agents, hasInlineMentionForHighlight, isConfirmedFilePath, message]);

    const sanitizeAttachmentsForSend = React.useCallback(
        (files: AttachedFile[] | undefined): AttachedFile[] => (files ?? [])
            .map((file) => ({
                ...file,
                dataUrl: file.source === 'server' && file.serverPath
                    ? toServerFileUrl(file.serverPath)
                    : file.dataUrl,
            })),
        [],
    );

    const extractInlineFileMentions = React.useCallback((rawText: string): { sanitizedText: string; attachments: AttachedFile[] } => {
        if (!rawText || !rawText.includes('@')) {
            return { sanitizedText: rawText, attachments: [] };
        }

        const clientDirectory = opencodeClient.getDirectory() || '';
        const root = (chatSearchDirectory || clientDirectory).replace(/\\/g, '/').replace(/\/+$/, '');
        const knownAgentNames = new Set(agents.map((agent) => agent.name.toLowerCase()));
        const seenPaths = new Set<string>();
        const attachments: AttachedFile[] = [];

        const mentionRegex = /@([^\s]+)/g;
        let match: RegExpExecArray | null;
        while ((match = mentionRegex.exec(rawText)) !== null) {
            const rawMentionPath = match[1];
            const offset = match.index;
            const original = rawText;
            const charBefore = offset > 0 ? original[offset - 1] : null;
            if (charBefore && !/(\s|\(|\)|\[|\]|\{|\}|"|'|`|,|\.|;|:)/.test(charBefore)) {
                continue;
            }

            const mentionPath = String(rawMentionPath || '')
                .trim()
                .replace(/^[`"'<(]+/, '')
                .replace(/[),.;:!?`"'>]+$/g, '');
            if (!mentionPath) {
                continue;
            }

            if (knownAgentNames.has(mentionPath.toLowerCase())) {
                continue;
            }

            const looksLikeFilePath = isConfirmedFilePath(mentionPath);
            if (!looksLikeFilePath) {
                continue;
            }

            const normalizedMentionPath = mentionPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
            if (!normalizedMentionPath) {
                continue;
            }

            const serverPath = mentionPath.startsWith('/')
                ? mentionPath.replace(/\\/g, '/')
                : root
                    ? `${root}/${normalizedMentionPath}`
                    : null;

            if (!serverPath) {
                continue;
            }

            const normalizedServerPath = serverPath.replace(/\/+/g, '/');
            if (seenPaths.has(normalizedServerPath)) {
                continue;
            }
            seenPaths.add(normalizedServerPath);

            const filename = normalizedMentionPath.split('/').filter(Boolean).pop() || normalizedMentionPath;
            attachments.push({
                id: `inline-server-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                file: new File([], filename, { type: 'text/plain' }),
                filename,
                mimeType: 'text/plain',
                size: 0,
                dataUrl: toServerFileUrl(normalizedServerPath),
                source: 'server',
                serverPath: normalizedServerPath,
            });
        }

        return {
            sanitizedText: rawText,
            attachments,
        };
    }, [agents, chatSearchDirectory, isConfirmedFilePath]);
    const abortTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevWasAbortedRef = React.useRef(false);

    // Issue linking state
    const [issuePickerOpen, setIssuePickerOpen] = React.useState(false);
    const [prPickerOpen, setPrPickerOpen] = React.useState(false);
    const [linkedIssue, setLinkedIssue] = React.useState<{
        number: number;
        title: string;
        url: string;
        contextText: string;
        author?: { login: string; avatarUrl?: string };
    } | null>(null);
    const [linkedPr, setLinkedPr] = React.useState<{
        number: number;
        title: string;
        url: string;
        head: string;
        base: string;
        includeDiff: boolean;
        instructionsText: string;
        contextText: string;
        author?: { login: string; avatarUrl?: string };
    } | null>(null);

    // Message queue
    const queueModeEnabled = useMessageQueueStore((state) => state.queueModeEnabled);
    const queuedMessages = useMessageQueueStore(
        React.useCallback(
            (state) => {
                if (!currentSessionId) return EMPTY_QUEUE;
                return state.queuedMessages[currentSessionId] ?? EMPTY_QUEUE;
            },
            [currentSessionId]
        )
    );
    const addToQueue = useMessageQueueStore((state) => state.addToQueue);
    const clearQueue = useMessageQueueStore((state) => state.clearQueue);

    // Inline comment drafts
    const draftCount = useInlineCommentDraftStore(
        React.useCallback(
            (state) => {
                const sessionKey = currentSessionId ?? (newSessionDraftOpen ? 'draft' : '');
                if (!sessionKey) return 0;
                return (state.drafts[sessionKey] ?? []).length;
            },
            [currentSessionId, newSessionDraftOpen]
        )
    );
    const consumeDrafts = useInlineCommentDraftStore((state) => state.consumeDrafts);
    const hasDrafts = draftCount > 0;

    // Message history navigation state (up/down arrow to recall previous messages)
    const history = useComposerHistory({
        sessionId: currentSessionId,
        message,
        setMessage,
    });

    // Focus textarea when new session draft is opened
    const prevNewSessionDraftOpenRef = React.useRef(newSessionDraftOpen);
    React.useEffect(() => {
        if (!prevNewSessionDraftOpenRef.current && newSessionDraftOpen) {
            // New session draft just opened - focus the textarea
            requestAnimationFrame(() => {
                if (isMobile) {
                    // On mobile, use preventScroll to avoid viewport jumping
                    textareaRef.current?.focus({ preventScroll: true });
                } else {
                    textareaRef.current?.focus();
                }
            });
        }
        prevNewSessionDraftOpenRef.current = newSessionDraftOpen;
    }, [newSessionDraftOpen, isMobile]);

    // Session activity for queue availability and controls
    const { phase: sessionPhase } = useCurrentSessionActivity();

    const handleOpenMobileControls = React.useCallback(() => {
        if (!isMobile) {
            return;
        }

        if (mobileControlsOpen) {
            setMobileControlsOpen(false);
            return;
        }

        setMobileControlsPanel(null);

        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        setMobileControlsOpen(true);
    }, [isMobile, mobileControlsOpen]);

    const handleCloseMobileControls = React.useCallback(() => {
        setMobileControlsOpen(false);
    }, []);

    const handleOpenMobilePanel = React.useCallback((panel: MobileControlsPanel) => {
        if (!isMobile) {
            return;
        }
        setMobileControlsOpen(false);
        textareaRef.current?.blur();
        requestAnimationFrame(() => {
            setMobileControlsPanel(panel);
        });
    }, [isMobile]);

    const handleReturnToUnifiedControls = React.useCallback(() => {
        if (!isMobile) {
            return;
        }
        setMobileControlsPanel(null);
        requestAnimationFrame(() => {
            setMobileControlsOpen(true);
        });
    }, [isMobile]);

    // Consume pending input text (e.g., from revert action)
    React.useEffect(() => {
        if (pendingInputText !== null) {
            const pending = consumePendingInputText();
            if (pending?.text) {
                if (pending.mode === 'append') {
                    setMessage((prev) => {
                        const next = pending.text;
                        if (!next.trim()) return prev;
                        return appendWithLineBreaks(prev, next);
                    });
                } else if (pending.mode === 'append-inline') {
                    setMessage((prev) => appendInlineText(prev, pending.text));
                } else {
                    setMessage(pending.text);
                }
                // Focus textarea after setting message
                setTimeout(() => {
                    textareaRef.current?.focus();
                }, 0);
            }
        }
    }, [pendingInputText, consumePendingInputText, setMessage]);

    const hasContent = message.trim().length > 0 || sendableAttachedFiles.length > 0 || hasDrafts;
    const hasQueuedMessages = queuedMessages.length > 0;
    const canSend = hasContent || hasQueuedMessages;

    const canAbort = sessionPhase !== 'idle';

    // Keep a ref to handleSubmit so callbacks don't depend on it.
    type SubmitOptions = {
        queuedOnly?: boolean;
    };
    const handleSubmitRef = React.useRef<(options?: SubmitOptions) => Promise<void>>(async () => { });

    // Add message to queue instead of sending
    const handleQueueMessage = React.useCallback(() => {
        if (!hasContent || !currentSessionId) return;

        const drafts = consumeDrafts(currentSessionId);

        const messageToQueue = buildQueuedMessageContent(message, drafts);
        const attachmentsToQueue = sanitizeAttachmentsForSend(sendableAttachedFiles);
        const queueEffectiveModel = getEffectiveModel();

        addToQueue(currentSessionId, {
            content: messageToQueue,
            attachments: attachmentsToQueue.length > 0 ? attachmentsToQueue : undefined,
            sendConfig: queueEffectiveModel.providerId && queueEffectiveModel.modelId ? {
                providerID: queueEffectiveModel.providerId,
                modelID: queueEffectiveModel.modelId,
                agent: currentAgentName ?? undefined,
                variant: currentVariant ?? undefined,
            } : undefined,
        });

        // Clear input and attachments
        // Note: confirmedMentionsRef is NOT cleared here because queued messages
        // are processed later in handleSubmit which reads the ref via extractInlineFileMentions.
        // The ref is cleared in handleSubmit after all queued messages are sent.
        setMessage('');
        if (attachmentsToQueue.length > 0) {
            clearAttachedFiles();
        }

        if (!isMobile) {
            textareaRef.current?.focus();
        }
    }, [hasContent, currentSessionId, message, sendableAttachedFiles, sanitizeAttachmentsForSend, addToQueue, clearAttachedFiles, isMobile, consumeDrafts, getEffectiveModel, currentAgentName, currentVariant, setMessage]);

    const handleQueuedMessageEdit = React.useCallback((content: string) => {
        setMessage(content);
        setTimeout(() => {
            textareaRef.current?.focus();
        }, 0);
    }, [setMessage]);

    const handleOpenAgentPanel = React.useCallback(() => {
        setMobileControlsPanel('agent');
    }, []);

    const handleToggleExpandedInput = React.useCallback(() => {
        setExpandedInput(!isExpandedInput);
    }, [isExpandedInput, setExpandedInput]);

    const openIssuePicker = React.useCallback(() => {
        setIssuePickerOpen(true);
    }, []);

    const openPrPicker = React.useCallback(() => {
        setPrPickerOpen(true);
    }, []);

    const handleSubmit = async (options?: SubmitOptions) => {
        const queuedOnly = options?.queuedOnly ?? false;

        if (queuedOnly) {
            if (!hasQueuedMessages || !currentSessionId) return;
        } else if (!canSend || (!currentSessionId && !newSessionDraftOpen)) {
            return;
        }

        const effectiveModel = getEffectiveModel();
        if (!effectiveModel.providerId || !effectiveModel.modelId) {
            console.warn('Cannot send message: provider or model not selected');
            return;
        }

        const syntheticParts = consumePendingSyntheticParts();
        const sessionKey = currentSessionId ?? (newSessionDraftOpen ? 'draft' : null);
        const drafts = (!queuedOnly && sessionKey) ? consumeDrafts(sessionKey) : [];
        const submitPayload = buildComposerSubmitPayload({
            queuedOnly,
            hasContent,
            currentSessionId,
            newSessionDraftOpen,
            message,
            queuedMessages,
            agents,
            sendableAttachedFiles,
            inlineDrafts: drafts,
            syntheticParts,
            linkedIssue,
            linkedPr,
            sanitizeAttachmentsForSend,
            extractInlineFileMentions,
        });

        if (!submitPayload) return;

        const {
            primaryText,
            primaryAttachments,
            agentMentionName,
            additionalParts,
            allAttachments,
        } = submitPayload;

        // Clear queue and input
        if (currentSessionId && hasQueuedMessages) {
            clearQueue(currentSessionId);
        }
        if (!queuedOnly) {
            setMessage('');
            clearSubmittedDraft(currentSessionId);
            // Reset message history navigation state
            history.resetHistory();
            if (attachedFiles.length > 0) {
                clearAttachedFiles();
            }
            // Close expanded input overlay when submitting
            setExpandedInput(false);
        }

        if (isMobile) {
            textareaRef.current?.blur();
        }

        // Handle local slash commands only in normal mode
        const commandName = getLocalSlashCommandName(inputMode, primaryText);
        if (commandName) {
            if (commandName === 'undo' && currentSessionId) {
                await useSessionUIStore.getState().handleSlashUndo(currentSessionId);
                scrollToBottom?.({ instant: true, force: true });
                return;
            }
            else if (commandName === 'redo' && currentSessionId) {
                await useSessionUIStore.getState().handleSlashRedo(currentSessionId);
                scrollToBottom?.({ instant: true, force: true });
                return;
            }
            else if (commandName === 'compact' && currentSessionId) {
                try {
                    await sessionActions.waitForConnectionOrThrow();
                    const { opencodeClient } = await import('@/lib/opencode/client');
                    const sdk = opencodeClient.getSdkClient();
                    const configState = useProviderConfigStore.getState();
                    const compactEffectiveModel = configState.getEffectiveModel();
                    await sdk.session.summarize({
                        sessionID: currentSessionId,
                        modelID: compactEffectiveModel.modelId || '',
                        providerID: compactEffectiveModel.providerId || '',
                    });
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to compact session');
                }
                return;
            }
            else if (commandName === 'summary' && currentSessionId) {
                try {
                    await sessionActions.waitForConnectionOrThrow();
                    // Everything after `/summary ` is an optional topic hint
                    // the user wants the summary focused on.
                    const normalizedCommand = primaryText.trimStart();
                    const topic = normalizedCommand.replace(/^\/summary\b/i, '').trim();
                    const topicLine = topic ? ` focused on: ${topic}` : '';
                    const topicBlock = topic
                        ? `The user asked you to focus this summary on: ${topic}. Prioritize that topic; mention unrelated threads only in passing.`
                        : '';
                    const visibleText = await renderMagicPrompt('session.summary.visible', { topic_line: topicLine });
                    const instructionsText = await renderMagicPrompt('session.summary.instructions', { topic_block: topicBlock });
                    await sendMessage(
                        visibleText,
                        effectiveModel.providerId,
                        effectiveModel.modelId,
                        currentAgentName,
                        [],
                        agentMentionName,
                        [{ text: instructionsText, synthetic: true }],
                        currentVariant,
                        inputMode,
                    );
                    scrollToBottom?.({ instant: true, force: true });
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to generate summary');
                }
                return;
            }
            else if (commandName === 'review' && currentSessionId) {
                try {
                    await sessionActions.waitForConnectionOrThrow();
                    const visibleText = await renderMagicPrompt('session.review.visible');
                    const instructionsText = await renderMagicPrompt('session.review.instructions');
                    await sendMessage(
                        visibleText,
                        effectiveModel.providerId,
                        effectiveModel.modelId,
                        currentAgentName,
                        [],
                        agentMentionName,
                        [{ text: instructionsText, synthetic: true }],
                        currentVariant,
                        inputMode,
                    );
                    scrollToBottom?.({ instant: true, force: true });
                } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Failed to review changes');
                }
                return;
            }
        }

        const sendPromise = sendMessage(
            primaryText,
            effectiveModel.providerId,
            effectiveModel.modelId,
            currentAgentName,
            primaryAttachments,
            agentMentionName,
            additionalParts.length > 0 ? additionalParts : undefined,
            currentVariant,
            inputMode
        );

        if (typeof window === 'undefined') {
            scrollToBottom?.({ instant: true, force: true });
        } else {
            window.requestAnimationFrame(() => {
                scrollToBottom?.({ instant: true, force: true });
            });
        }

        void sendPromise.then(() => {
            // Clear linked issue after successful message send
            if (linkedIssue) {
                setLinkedIssue(null);
            }
            if (linkedPr) {
                setLinkedPr(null);
            }
        }).catch((error: unknown) => {
            const rawMessage =
                error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                        ? error
                        : String(error ?? '');
            console.error('Message send failed:', rawMessage || error);

            if (isPayloadTooLargeError(rawMessage)) {
                toast.error('Attachments are too large to send. Please try reducing the number or size of images.');
                if (allAttachments.length > 0) {
                    useInputStore.setState({ attachedFiles: allAttachments });
                }
                return;
            }

            if (isSoftNetworkSendError(rawMessage)) {
                if (allAttachments.length > 0) {
                    useInputStore.setState({ attachedFiles: allAttachments });
                    toast.error('Failed to send attachments. Try fewer files or smaller images.');
                }
                return;
            }

            if (allAttachments.length > 0) {
                useInputStore.setState({ attachedFiles: allAttachments });
            }
            toast.error(rawMessage || 'Message failed to send. Attachments restored.');
        });

        if (!isMobile) {
            textareaRef.current?.focus();
        }
    };

    // Update ref with latest handleSubmit on every render
    handleSubmitRef.current = handleSubmit;

    // Primary action for send button - respects queue mode setting
    const handlePrimaryAction = React.useCallback(() => {
        const canQueue = inputMode === 'normal' && hasContent && currentSessionId && sessionPhase !== 'idle';
        if (queueModeEnabled && canQueue) {
            handleQueueMessage();
        } else {
            void handleSubmitRef.current();
        }
    }, [inputMode, hasContent, currentSessionId, sessionPhase, queueModeEnabled, handleQueueMessage]);

    const {
        textareaSize,
        adjustTextareaHeight,
    } = useComposerTextareaAutosize({
        message,
        isDesktopExpanded,
        viewportSignal: isMobile,
        textareaRef,
    });

    const {
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
        setShowSkillAutocomplete,
        setSkillQuery,
        updateAutocompleteState,
        handleAutocompleteTabSelect,
        handleOpenCommandMenu,
    } = useComposerAutocomplete({
        message,
        setMessage,
        inputMode,
        isMobile,
        textareaRef,
        adjustTextareaHeight,
    });

    const {
        autocompleteOverlayPosition,
        updateAutocompleteOverlayPosition,
    } = useComposerAutocompleteOverlay({
        isDesktopExpanded,
        messageLength: message.length,
        showCommandAutocomplete,
        showSkillAutocomplete,
        showFileMention,
        textareaRef,
        dropZoneRef,
    });

    const startAbortIndicator = React.useCallback(() => {
        if (abortTimeoutRef.current) {
            clearTimeout(abortTimeoutRef.current);
            abortTimeoutRef.current = null;
        }

        setShowAbortStatus(true);

        abortTimeoutRef.current = setTimeout(() => {
            setShowAbortStatus(false);
            abortTimeoutRef.current = null;
        }, 1800);
    }, []);

    const handleAbort = React.useCallback(() => {
        clearAbortPrompt();
        startAbortIndicator();

        void abortCurrentOperation(currentSessionId || undefined);
    }, [abortCurrentOperation, clearAbortPrompt, currentSessionId, startAbortIndicator]);

    const handleCycleAgent = React.useCallback(() => {
        if (primaryAgents.length <= 1) return;

        const currentIndex = primaryAgents.findIndex(agent => agent.name === currentAgentName);
        const nextIndex = (currentIndex + 1) % primaryAgents.length;
        const nextAgent = primaryAgents[nextIndex];

        setAgent(nextAgent.name);

        if (currentSessionId) {
            saveSessionAgentSelection(currentSessionId, nextAgent.name);
        }
    }, [primaryAgents, currentAgentName, currentSessionId, setAgent, saveSessionAgentSelection]);

    const { handleKeyDown } = useComposerKeyboard({
        message,
        inputMode,
        textareaRef,
        agents,
        confirmedMentionsRef,
        isConfirmedFilePath,
        showCommandAutocomplete,
        showSkillAutocomplete,
        showFileMention,
        commandRef,
        skillRef,
        mentionRef,
        isDesktopExpanded,
        isMobile,
        queueModeEnabled,
        sessionPhase,
        currentSessionId,
        hasContent,
        navigateHistoryUp: history.navigateHistoryUp,
        navigateHistoryDown: history.navigateHistoryDown,
        historyIndex: history.historyIndex,
        userMessageHistoryLength: history.userMessageHistory.length,
        updateAutocompleteState,
        setMessage,
        adjustTextareaHeight,
        setInputMode,
        setExpandedInput,
        handleCycleAgent,
        handleSubmit,
        handleQueueMessage,
    });

    const insertTextAtSelection = React.useCallback((text: string) => {
        if (!text) {
            return;
        }

        const textarea = textareaRef.current;
        if (!textarea) {
            const nextValue = message + text;
            setMessage(nextValue);
            updateAutocompleteState(nextValue, nextValue.length);
            requestAnimationFrame(() => adjustTextareaHeight());
            return;
        }

        const start = textarea.selectionStart ?? message.length;
        const end = textarea.selectionEnd ?? message.length;
        const nextValue = `${message.substring(0, start)}${text}${message.substring(end)}`;
        setMessage(nextValue);
        const cursorPosition = start + text.length;

        requestAnimationFrame(() => {
            const currentTextarea = textareaRef.current;
            if (currentTextarea) {
                currentTextarea.selectionStart = cursorPosition;
                currentTextarea.selectionEnd = cursorPosition;
            }
            adjustTextareaHeight();
        });

        updateAutocompleteState(nextValue, cursorPosition);
    }, [adjustTextareaHeight, message, setMessage, updateAutocompleteState]);

    const clearDropTextSuppression = React.useCallback(() => {
        suppressNextFileDropTextInsertRef.current = false;
        pendingDroppedAbsolutePathsRef.current = [];
        if (suppressNextFileDropTextInsertTimeoutRef.current) {
            clearTimeout(suppressNextFileDropTextInsertTimeoutRef.current);
            suppressNextFileDropTextInsertTimeoutRef.current = null;
        }
    }, []);

    const scheduleDropTextSuppressionExpiry = React.useCallback(() => {
        if (suppressNextFileDropTextInsertTimeoutRef.current) {
            clearTimeout(suppressNextFileDropTextInsertTimeoutRef.current);
        }
        suppressNextFileDropTextInsertTimeoutRef.current = setTimeout(() => {
            clearDropTextSuppression();
        }, 700);
    }, [clearDropTextSuppression]);

    const handleBeforeInput = React.useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
        if (!isVSCodeRuntime() || !suppressNextFileDropTextInsertRef.current) {
            return;
        }

        const nativeInputEvent = e.nativeEvent as InputEvent | undefined;
        if (nativeInputEvent?.inputType === 'insertFromDrop') {
            e.preventDefault();
            clearDropTextSuppression();
        }
    }, [clearDropTextSuppression]);

    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const nativeInputEvent = e.nativeEvent as InputEvent | undefined;
        if (isVSCodeRuntime() && suppressNextFileDropTextInsertRef.current) {
            const candidateAbsolutePaths = pendingDroppedAbsolutePathsRef.current;
            const isLikelyDropTextInsertion = nativeInputEvent?.inputType === 'insertFromDrop'
                || candidateAbsolutePaths.some((path) => path.length > 0 && e.target.value.includes(path));

            if (isLikelyDropTextInsertion) {
                clearDropTextSuppression();
                return;
            }
        }

        const value = e.target.value;
        const cursorPosition = e.target.selectionStart ?? value.length;

        if (inputMode === 'normal' && value.startsWith('!')) {
            const shellCommand = value.slice(1);
            const nextCursor = Math.max(0, cursorPosition - 1);
            setInputMode('shell');
            setMessage(shellCommand);
            adjustTextareaHeight();
            setShowCommandAutocomplete(false);
            setShowSkillAutocomplete(false);
            setShowFileMention(false);
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
            });
            return;
        }

        setMessage(value);
        adjustTextareaHeight();
        updateAutocompleteState(value, cursorPosition);
    };

    React.useEffect(() => {
        return () => {
            clearDropTextSuppression();
        };
    }, [clearDropTextSuppression]);

    const handlePaste = React.useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const fileMap = new Map<string, File>();

        Array.from(e.clipboardData.files || []).forEach(file => {
            if (file.type.startsWith('image/')) {
                fileMap.set(`${file.name}-${file.size}`, file);
            }
        });

        Array.from(e.clipboardData.items || []).forEach(item => {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    fileMap.set(`${file.name}-${file.size}`, file);
                }
            }
        });

        const imageFiles = Array.from(fileMap.values());
        if (imageFiles.length === 0) {
            return;
        }

        if (!currentSessionId && !newSessionDraftOpen) {
            return;
        }

        e.preventDefault();

        const pastedText = e.clipboardData.getData('text');
        if (pastedText) {
            insertTextAtSelection(pastedText);
        }

        for (const file of imageFiles) {
            try {
                await addAttachedFile(file);
            } catch (error) {
                console.error('Clipboard image attach failed', error);
                toast.error(error instanceof Error ? error.message : 'Failed to attach image from clipboard');
            }
        }
    }, [addAttachedFile, currentSessionId, newSessionDraftOpen, insertTextAtSelection]);

    const handleFileSelect = (file: { name: string; path: string; relativePath?: string }) => {

        const cursorPosition = textareaRef.current?.selectionStart || 0;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

        const mentionPath = (file.relativePath && file.relativePath.trim().length > 0)
            ? file.relativePath.trim()
            : (toProjectRelativeMentionPath(file.path, chatSearchDirectory) || file.name);

        confirmedMentionsRef.current.add(mentionPath);

        if (lastAtSymbol !== -1) {
            const newMessage =
                message.substring(0, lastAtSymbol) +
                `@${mentionPath} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);
            const nextCursor = lastAtSymbol + mentionPath.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        } else if (textareaRef.current) {
            const newMessage =
                message.substring(0, cursorPosition) +
                `@${mentionPath} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);
            const nextCursor = cursorPosition + mentionPath.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        }

        setShowFileMention(false);
        setMentionQuery('');

        textareaRef.current?.focus();
    };

    const handleAgentSelect = (agentName: string) => {
        const textarea = textareaRef.current;
        const cursorPosition = textarea?.selectionStart ?? message.length;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

        if (lastAtSymbol !== -1) {
            const newMessage =
                message.substring(0, lastAtSymbol) +
                `@${agentName} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);

            const nextCursor = lastAtSymbol + agentName.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        } else if (textareaRef.current) {
            const newMessage =
                message.substring(0, cursorPosition) +
                `@${agentName} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);

            const nextCursor = cursorPosition + agentName.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        }

        setShowFileMention(false);
        setMentionQuery('');

        textareaRef.current?.focus();
    };

    const handleSkillSelect = (skillName: string) => {
        const textarea = textareaRef.current;
        const cursorPosition = textarea?.selectionStart ?? message.length;
        const textBeforeCursor = message.substring(0, cursorPosition);
        const lastSlashSymbol = textBeforeCursor.lastIndexOf('/');

        if (lastSlashSymbol !== -1) {
            const newMessage =
                message.substring(0, lastSlashSymbol) +
                `/${skillName} ` +
                message.substring(cursorPosition);
            setMessage(newMessage);

            const nextCursor = lastSlashSymbol + skillName.length + 2;
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = nextCursor;
                    textareaRef.current.selectionEnd = nextCursor;
                }
                adjustTextareaHeight();
                updateAutocompleteState(newMessage, nextCursor);
            });
        }

        setShowSkillAutocomplete(false);
        setSkillQuery('');

        textareaRef.current?.focus();
    };

    const handleCommandSelect = (command: CommandInfo) => {

        setMessage(`/${command.name} `);

        const textareaElement = textareaRef.current as HTMLTextAreaElement & { _commandMetadata?: typeof command };
        if (textareaElement) {
            textareaElement._commandMetadata = command;
        }

        setShowCommandAutocomplete(false);
        setCommandQuery('');

        const refocus = () => {
            if (textareaRef.current) {
                try {
                    textareaRef.current.focus({ preventScroll: true });
                } catch {
                    textareaRef.current.focus();
                }
                textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
            }
        };

        requestAnimationFrame(() => {
            refocus();
            requestAnimationFrame(refocus);
        });
        setTimeout(refocus, 60);
    };

    React.useEffect(() => {

        if (currentSessionId && textareaRef.current && !isMobile) {
            textareaRef.current.focus();
        }
    }, [currentSessionId, isMobile]);

    React.useEffect(() => {
        if (!isMobile) {
            setMobileControlsOpen(false);
            setMobileControlsPanel(null);
        }
    }, [isMobile]);

    React.useEffect(() => {
        if (abortPromptSessionId && abortPromptSessionId !== currentSessionId) {
            clearAbortPrompt();
        }
    }, [abortPromptSessionId, currentSessionId, clearAbortPrompt]);

    React.useEffect(() => {
        canAcceptDropRef.current = Boolean(currentSessionId || newSessionDraftOpen);
    }, [currentSessionId, newSessionDraftOpen]);

    const hasDraggedFiles = React.useCallback((dataTransfer: DataTransfer | null | undefined): boolean => {
        return hasDraggedFilesInTransfer(dataTransfer, VS_CODE_DROP_DATA_TYPES);
    }, []);

    const collectDroppedFiles = React.useCallback((dataTransfer: DataTransfer | null | undefined): File[] => {
        return collectDroppedFilesFromTransfer(dataTransfer);
    }, []);

    const collectDroppedFileUris = React.useCallback((dataTransfer: DataTransfer | null | undefined): string[] => {
        return collectDroppedFileUrisFromTransfer(dataTransfer, VS_CODE_DROP_DATA_TYPES);
    }, []);

    const addVSCodeDroppedUrisAsMentions = React.useCallback((uris: string[]) => {
        if (uris.length === 0) return;

        const paths = uris
            .map((entry) => normalizeDroppedPath(entry))
            .map((entry) => toProjectRelativeMentionPath(entry, chatSearchDirectory))
            .map((entry) => entry.trim().replace(/^\.\//, ''))
            .filter((entry) => entry.length > 0);

        for (const p of paths) {
            confirmedMentionsRef.current.add(p);
        }

        const mentions = Array.from(new Set(paths.map((entry) => `@${entry}`)));

        if (mentions.length === 0) {
            return;
        }

        setPendingInputText(mentions.join(' '), 'append-inline');
        toast.success(`Added ${mentions.length} file mention${mentions.length > 1 ? 's' : ''}`);
    }, [chatSearchDirectory, confirmedMentionsRef, setPendingInputText]);

    const handleDragEnter = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        dragEnterCountRef.current++;
        const isInternal = e.dataTransfer.types?.includes('application/x-openchamber-file-path') ?? false;
        if (isInternal !== isInternalDrag) {
            setIsInternalDrag(isInternal);
        }
        if ((currentSessionId || newSessionDraftOpen) && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        if ((currentSessionId || newSessionDraftOpen) && !isDragging) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragEnterCountRef.current--;
        if (dragEnterCountRef.current <= 0) {
            dragEnterCountRef.current = 0;
            setIsDragging(false);
            setIsInternalDrag(false);
            clearDropTextSuppression();
        }
    };

    const handleDragEnd = () => {
        dragEnterCountRef.current = 0;
        setIsDragging(false);
        setIsInternalDrag(false);
        clearDropTextSuppression();
    };

    const handleDrop = async (e: React.DragEvent) => {
        dragEnterCountRef.current = 0;
        const draggedFiles = hasDraggedFiles(e.dataTransfer);
        if (!draggedFiles) {
            clearDropTextSuppression();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!currentSessionId && !newSessionDraftOpen) return;

        // Internal drag: file tree → chat input (relative path as @mention)
        const internalPath = e.dataTransfer.getData('application/x-openchamber-file-path');
        if (internalPath && internalPath !== '.') {
            confirmedMentionsRef.current.add(internalPath);
            const mention = `@${internalPath}`;
            const textarea = textareaRef.current;
            const currentMessage = messageRef.current;
            if (textarea) {
                const pos = textarea.selectionStart ?? cursorPosRef.current;
                const end = textarea.selectionEnd ?? pos;
                const before = currentMessage.slice(0, pos);
                const after = currentMessage.slice(end);
                const needSpaceBefore = before.length > 0 && !/\s$/.test(before);
                const needSpaceAfter = after.length > 0 && !/^\s/.test(after);
                const insert = `${needSpaceBefore ? ' ' : ''}${mention}${needSpaceAfter ? ' ' : ''}`;
                const nextMessage = `${before}${insert}${after}`;
                setMessage(nextMessage);
                requestAnimationFrame(() => {
                    const cursorPos = pos + insert.length;
                    textarea.selectionStart = cursorPos;
                    textarea.selectionEnd = cursorPos;
                    cursorPosRef.current = cursorPos;
                    textarea.focus();
                });
            } else {
                setMessage((prev) => appendInlineText(prev, mention));
            }
            clearDropTextSuppression();
            return;
        }

        const files = collectDroppedFiles(e.dataTransfer);

        if (files.length === 0 && isVSCodeRuntime()) {
            const droppedUris = collectDroppedFileUris(e.dataTransfer);
            if (droppedUris.length > 0) {
                pendingDroppedAbsolutePathsRef.current = droppedUris
                    .map((entry) => normalizeDroppedPath(entry))
                    .map((entry) => entry.trim())
                    .filter((entry) => entry.length > 0);
                addVSCodeDroppedUrisAsMentions(droppedUris);
            } else {
                clearDropTextSuppression();
            }
            return;
        }

        if (files.length > 0) {
            for (const file of files) {
                try {
                    await addAttachedFile(file);
                } catch (error) {
                    console.error('File attach failed', error);
                    toast.error(error instanceof Error ? error.message : 'Failed to attach file');
                }
            }
        }
        clearDropTextSuppression();
    };

    const handleDropCapture = (e: React.DragEvent) => {
        if (!hasDraggedFiles(e.dataTransfer)) {
            return;
        }
        // Prevent native textarea drop text insertion for all runtimes
        e.preventDefault();
        if (isVSCodeRuntime()) {
            suppressNextFileDropTextInsertRef.current = true;
            scheduleDropTextSuppressionExpiry();
        }
    };

    // Tauri desktop: handle native file drops via onDragDropEvent
    React.useEffect(() => {
        if (!isTauriShell()) return;
        let cancelled = false;
        let unlisten: (() => void) | null = null;

        void (async () => {
            try {
                const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                const webviewWindow = getCurrentWebviewWindow();
                const removeListener = await webviewWindow.onDragDropEvent(async (event) => {
                    if (!canAcceptDropRef.current) return;

                    const payload = (event as { payload?: unknown }).payload;
                    if (!payload || typeof payload !== 'object') return;

                    const typed = payload as { type?: string; paths?: string[]; position?: { x?: number; y?: number } };
                    const type = typed.type;
                    const x = typed.position?.x;
                    const y = typed.position?.y;

                    // Check if drop is inside the chat input area
                    const zone = dropZoneRef.current;
                    let inZone: boolean | null = null;
                    if (zone && typeof x === 'number' && typeof y === 'number') {
                        const rect = zone.getBoundingClientRect();
                        inZone = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
                        // Handle retina displays where Tauri might report physical pixels
                        if (!inZone && window.devicePixelRatio > 1) {
                            const sx = x / window.devicePixelRatio;
                            const sy = y / window.devicePixelRatio;
                            inZone = sx >= rect.left && sx <= rect.right && sy >= rect.top && sy <= rect.bottom;
                        }
                    }

                    if (type === 'enter' || type === 'over') {
                        if (inZone !== null) {
                            nativeDragInsideDropZoneRef.current = inZone;
                        }
                        setIsDragging(nativeDragInsideDropZoneRef.current);
                        return;
                    }
                    if (type === 'leave') {
                        nativeDragInsideDropZoneRef.current = false;
                        setIsDragging(false);
                        return;
                    }
                    if (type === 'drop') {
                        const shouldHandleDrop = inZone ?? nativeDragInsideDropZoneRef.current;
                        nativeDragInsideDropZoneRef.current = false;
                        setIsDragging(false);
                        if (!shouldHandleDrop) return;

                        const paths = Array.isArray(typed.paths)
                            ? typed.paths.filter((p): p is string => typeof p === 'string')
                            : [];
                        if (paths.length === 0) return;

                        for (const path of paths) {
                            try {
                                const normalizedPath = normalizeDroppedPath(path);
                                const fileName = normalizedPath.split(/[\\/]/).pop() || normalizedPath;
                                let file: File;

                                // In Tauri shell, dropped paths are local machine paths.
                                // Read bytes via native command to avoid workspace-bound /api/fs/raw restrictions.
                                if (isTauriShell()) {
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    const result = await invoke<{ mime: string; base64: string }>('desktop_read_file', { path: normalizedPath });
                                    const byteCharacters = atob(result.base64);
                                    const byteNumbers = new Array(byteCharacters.length);
                                    for (let i = 0; i < byteCharacters.length; i++) {
                                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                                    }
                                    const byteArray = new Uint8Array(byteNumbers);
                                    const blob = new Blob([byteArray], { type: result.mime || 'application/octet-stream' });
                                    file = new File([blob], fileName, { type: result.mime || 'application/octet-stream' });
                                } else {
                                    const response = await fetch(`/api/fs/raw?path=${encodeURIComponent(normalizedPath)}`);
                                    if (!response.ok) {
                                        throw new Error(`Failed to read dropped file (${response.status})`);
                                    }
                                    const blob = await response.blob();
                                    file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
                                }

                                await addAttachedFile(file);
                            } catch (error) {
                                console.error('Failed to attach dropped file:', path, error);
                                toast.error(`Failed to attach ${path.split(/[\\/]/).pop() || 'file'}`);
                            }
                        }
                    }
                });

                if (cancelled) {
                    removeListener();
                    return;
                }
                unlisten = removeListener;
            } catch (error) {
                if (!cancelled) {
                    console.warn('Failed to register Tauri drag-drop listener:', error);
                }
            }
        })();

        return () => {
            cancelled = true;
            if (unlisten) unlisten();
        };
    }, [addAttachedFile]);

    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const attachFiles = React.useCallback(async (files: FileList | File[]) => {
        const list = Array.isArray(files) ? files : Array.from(files);

        for (const file of list) {
            try {
                await addAttachedFile(file);
            } catch (error) {
                console.error('File attach failed', error);
                toast.error(error instanceof Error ? error.message : 'Failed to attach file');
            }
        }
    }, [addAttachedFile]);

    const handleVSCodePickFiles = React.useCallback(async () => {
        try {
            const response = await fetch('/api/vscode/pick-files');
            const data = await response.json();
            const picked = Array.isArray(data?.files) ? data.files : [];
            const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

            if (skipped.length > 0) {
                const summary = skipped
                    .map((s: { name?: string; reason?: string }) => `${s?.name || 'file'}: ${s?.reason || 'skipped'}`)
                    .join('\n');
                toast.error(`Some files were skipped:\n${summary}`);
            }

            const asFiles = picked
                .map((file: { name: string; mimeType?: string; dataUrl?: string }) => {
                    if (!file?.dataUrl) return null;
                    try {
                        const [meta, base64] = file.dataUrl.split(',');
                        const mime = file.mimeType || (meta?.match(/data:(.*);base64/)?.[1] || 'application/octet-stream');
                        if (!base64) return null;
                        const binary = atob(base64);
                        const bytes = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) {
                            bytes[i] = binary.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: mime });
                        return new File([blob], file.name || 'file', { type: mime });
                    } catch (err) {
                        console.error('Failed to decode VS Code picked file', err);
                        return null;
                    }
                })
                .filter(Boolean) as File[];

            if (asFiles.length > 0) {
                await attachFiles(asFiles);
            }
        } catch (error) {
            console.error('VS Code file pick failed', error);
            toast.error(error instanceof Error ? error.message : 'Failed to pick files in VS Code');
        }
    }, [attachFiles]);

    const handlePickLocalFiles = React.useCallback(() => {
        if (isVSCodeRuntime()) {
            void handleVSCodePickFiles();
            return;
        }
        fileInputRef.current?.click();
    }, [handleVSCodePickFiles]);

    const handleLocalFileSelect = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;
        await attachFiles(files);
        event.target.value = '';
    }, [attachFiles]);

    const footerGapClass = 'gap-x-1.5 gap-y-0';
    const isVSCode = isVSCodeRuntime();
    const {
        projects,
        selectedDraftProject,
        selectedDraftDirectory,
        selectedDraftBranchLabel,
        selectedDraftBranchIsKnown,
        projectRootBranchOption,
        worktreeBranchOptions,
        shouldShowDraftBranchSelector,
        showDraftTargetSelectors,
        hasPendingChanges,
        fallbackSelectedDirectory,
        handleDraftProjectChange,
        handleDraftDirectoryChange,
    } = useDraftTargetSelector({
        newSessionDraftOpen,
        isVSCode,
    });

    const footerPaddingClass = isMobile ? 'px-1.5 py-1.5' : (isVSCode ? 'px-1.5 py-1' : 'px-2.5 py-1.5');
    const buttonSizeClass = isMobile ? 'h-11 w-11' : (isVSCode ? 'h-5 w-5' : 'h-6 w-6');
    const sendIconSizeClass = isMobile ? 'h-4 w-4' : (isVSCode ? 'h-3.5 w-3.5' : 'h-4 w-4');
    const stopIconSizeClass = isMobile ? 'h-6 w-6' : (isVSCode ? 'h-4 w-4' : 'h-5 w-5');
    const iconSizeClass = isMobile ? 'h-[18px] w-[18px]' : (isVSCode ? 'h-4 w-4' : 'h-[18px] w-[18px]');

    const iconButtonBaseClass = 'flex cursor-pointer items-center justify-center text-foreground transition-none outline-none focus:outline-none flex-shrink-0 disabled:cursor-not-allowed';
    const footerIconButtonClass = cn(iconButtonBaseClass, buttonSizeClass);
    const permissionScopeSessionId = currentSessionId ?? currentManagementSessionId;
    const permissionAutoAcceptEnabled = usePermissionStore((state) => {
        if (!permissionScopeSessionId) {
            return false;
        }
        return state.isSessionAutoAccepting(permissionScopeSessionId);
    });

    const handlePermissionAutoAcceptToggle = React.useCallback(() => {
        if (!permissionScopeSessionId) {
            toast.error('Open a session first');
            return;
        }

        const nextEnabled = !permissionAutoAcceptEnabled;
        setSessionAutoAccept(permissionScopeSessionId, nextEnabled).catch(() => {
            toast.error('Failed to toggle permission auto-accept');
        });
    }, [permissionAutoAcceptEnabled, permissionScopeSessionId, setSessionAutoAccept]);

    React.useEffect(() => {
        const pendingAbortBanner = Boolean(abortPromptSessionId) && abortPromptSessionId === currentSessionId;
        if (!prevWasAbortedRef.current && pendingAbortBanner && !showAbortStatus) {
            startAbortIndicator();
            if (currentSessionId) {
                acknowledgeSessionAbort(currentSessionId);
            }
        }
        prevWasAbortedRef.current = pendingAbortBanner;
    }, [
        abortPromptSessionId,
        acknowledgeSessionAbort,
        currentSessionId,
        showAbortStatus,
        startAbortIndicator,
    ]);

    React.useEffect(() => {
        return () => {
            if (abortTimeoutRef.current) {
                clearTimeout(abortTimeoutRef.current);
                abortTimeoutRef.current = null;
            }
        };
    }, []);

    return (
        <>
            <form
                onSubmit={(e) => { e.preventDefault(); handlePrimaryAction(); }}
                className={cn(
                    "relative pt-0 pb-4",
                    isDesktopExpanded && 'flex h-full min-h-0 flex-col pt-4',
                    isMobile && (isKeyboardOpen ? 'ios-keyboard-safe-area' : 'bottom-safe-area')
                )}
                data-keyboard-avoid="none"
                style={isMobile && inputBarOffset > 0 && !isKeyboardOpen ? { marginBottom: `${inputBarOffset}px` } : undefined}
            >
                <div className={cn('chat-column relative overflow-visible', isDesktopExpanded && 'flex flex-1 min-h-0 flex-col')}>
                    <AttachedFilesList />
                    <QueuedMessageChips
                        onEditMessage={handleQueuedMessageEdit}
                    />
                    {hasDrafts && (
                        <div className="pb-2">
                            <div
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border"
                                style={{
                                    backgroundColor: currentTheme?.colors?.surface?.elevated,
                                    borderColor: currentTheme?.colors?.interactive?.border,
                                }}
                            >
                                <span className="text-xs font-medium text-muted-foreground">Review comments:</span>
                                <span className="text-xs font-semibold" style={{ color: currentTheme?.colors?.status?.info }}>
                                    {draftCount}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Linked Issue row */}
                    <ComposerLinkedContextRow
                        linkedIssue={linkedIssue}
                        linkedPr={linkedPr}
                        isVSCode={isVSCode}
                        onOpenIssuePicker={() => setIssuePickerOpen(true)}
                        onOpenPrPicker={() => setPrPickerOpen(true)}
                        onClearIssue={() => setLinkedIssue(null)}
                        onClearPr={() => setLinkedPr(null)}
                    />
                    <MemoStatusRow
                        showAbortStatus={showAbortStatus}
                        showAssistantStatus={false}
                        showTodos
                        leftAccessory={newSessionDraftOpen || !hasPendingChanges ? null : <PendingChangesBar />}
                    />
                    {showDraftTargetSelectors && selectedDraftProject ? (
                        <div className="mb-1.5 flex min-w-0 items-center gap-1.5 px-0.5">
                            <Select
                                value={selectedDraftProject.id}
                                onValueChange={handleDraftProjectChange}
                            >
                                <SelectTrigger
                                    size="sm"
                                    className="h-7 min-w-0 w-fit max-w-[42vw] sm:max-w-[18rem] border-transparent bg-transparent px-1.5 hover:bg-transparent data-[popup-open]:bg-transparent"
                                >
                                    <SelectValue>
                                        <ProjectSelectLabel project={selectedDraftProject} />
                                    </SelectValue>
                                </SelectTrigger>
                                <SelectContent fitContent>
                                    {projects.map((project) => (
                                        <SelectItem key={project.id} value={project.id} className="max-w-[24rem] truncate">
                                            <ProjectSelectLabel project={project} />
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {shouldShowDraftBranchSelector ? (
                                <Select
                                    value={fallbackSelectedDirectory}
                                    onValueChange={handleDraftDirectoryChange}
                                >
                                    <SelectTrigger
                                        size="sm"
                                        className="h-7 min-w-0 w-fit max-w-[48vw] sm:max-w-[20rem] border-transparent bg-transparent px-1.5 hover:bg-transparent data-[popup-open]:bg-transparent"
                                    >
                                        <SelectValue>
                                            {selectedDraftBranchLabel ?? 'Branch'}
                                        </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent fitContent>
                                        {projectRootBranchOption ? (
                                            <SelectGroup>
                                                <SelectLabel>Project root</SelectLabel>
                                                <SelectItem key={projectRootBranchOption.value} value={projectRootBranchOption.value} className="max-w-[24rem] truncate">
                                                    {projectRootBranchOption.label}
                                                </SelectItem>
                                            </SelectGroup>
                                        ) : null}
                                        {projectRootBranchOption ? <SelectSeparator /> : null}
                                        <SelectGroup>
                                            <div className="flex items-center justify-between px-2 py-1.5">
                                                <span className="text-muted-foreground typography-meta">Worktrees</span>
                                                <button
                                                    type="button"
                                                    className="text-muted-foreground typography-meta hover:text-foreground cursor-pointer"
                                                    onPointerDown={(e) => { e.stopPropagation(); }}
                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); void createWorktreeDraft(); }}
                                                >
                                                    + New
                                                </button>
                                            </div>
                                            {worktreeBranchOptions.map((option) => (
                                                <SelectItem key={option.value} value={option.value} className="max-w-[24rem] truncate">
                                                    {option.pending ? '⏳ ' : ''}{option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                        {selectedDraftDirectory && !selectedDraftBranchIsKnown ? (
                                            <SelectItem value={selectedDraftDirectory} className="max-w-[24rem] truncate">
                                                {selectedDraftBranchLabel}
                                            </SelectItem>
                                        ) : null}
                                    </SelectContent>
                                </Select>
                            ) : null}
                        </div>
                    ) : null}
                    <div
                        className={cn(
                            "flex flex-col relative overflow-visible",
                            isDesktopExpanded && 'flex-1 min-h-0',
                            "border border-border/80",
                            "focus-within:ring-1",
                            inputMode === 'shell'
                                ? 'focus-within:ring-[var(--status-info)]'
                                : 'focus-within:ring-primary/50',
                            isDragging && "ring-2 ring-primary ring-offset-2"
                        )}
                        style={{
                            borderRadius: chatInputRadius,
                            backgroundColor: currentTheme?.colors?.surface?.subtle,
                        }}
                        ref={dropZoneRef}
                        onDropCapture={handleDropCapture}
                        onDragEnter={handleDragEnter}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                    >
                        {isDragging && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 rounded-xl">
                                <div className="text-center">
                                    <div className="inline-flex justify-center">
                                        <button
                                            type="button"
                                            className={iconButtonBaseClass}
                                            onClick={() => handlePickLocalFiles()}
                                            title="Attach files"
                                            aria-label="Attach files"
                                        >
                                            <RiAttachment2 className={cn(iconSizeClass, 'text-current')} />
                                        </button>
                                    </div>
                                    <p className="mt-2 typography-ui-label text-muted-foreground">{isInternalDrag ? 'Drop to insert as mention' : 'Drop files here to attach'}</p>
                                </div>
                            </div>
                        )}

                        <ComposerAutocompleteLayer
                                showCommandAutocomplete={showCommandAutocomplete}
                                showSkillAutocomplete={showSkillAutocomplete}
                                showFileMention={showFileMention}
                                commandRef={commandRef}
                                skillRef={skillRef}
                                mentionRef={mentionRef}
                                commandQuery={commandQuery}
                                skillQuery={skillQuery}
                                mentionQuery={mentionQuery}
                                isMobile={isMobile}
                                autocompleteTab={autocompleteTab}
                                isDesktopExpanded={isDesktopExpanded}
                                autocompleteOverlayPosition={autocompleteOverlayPosition}
                                onCommandSelect={handleCommandSelect}
                                onSkillSelect={handleSkillSelect}
                                onFileSelect={handleFileSelect}
                                onAgentSelect={handleAgentSelect}
                                onAutocompleteTabSelect={handleAutocompleteTabSelect}
                                onCloseCommandAutocomplete={() => setShowCommandAutocomplete(false)}
                                onCloseSkillAutocomplete={() => setShowSkillAutocomplete(false)}
                                onCloseFileMention={() => setShowFileMention(false)}
                            />
                            <ComposerTextarea
                                textareaRef={textareaRef}
                                composerHighlightRef={composerHighlightRef}
                                value={message}
                                placeholder={currentSessionId || newSessionDraftOpen
                                    ? inputMode === 'shell'
                                        ? "Enter shell command..."
                                        : "@ for files/agents; / for commands; ! for shell"
                                    : "Select or create a session to start chatting"}
                                disabled={!currentSessionId && !newSessionDraftOpen}
                                spellCheck={isMobile || inputSpellcheckEnabled}
                                isMobile={isMobile}
                                isDesktopExpanded={isDesktopExpanded}
                                inputMode={inputMode}
                                inputSpellcheckEnabled={inputSpellcheckEnabled}
                                currentSessionId={currentSessionId}
                                newSessionDraftOpen={newSessionDraftOpen}
                                highlightedComposerContent={highlightedComposerContent}
                                textareaSize={textareaSize}
                                chatInputRadius={chatInputRadius}
                                onChange={handleTextChange}
                                onBeforeInput={handleBeforeInput}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                onDragEnter={handleDragEnter}
                                onDragOver={handleDragOver}
                                onDropCapture={handleDropCapture}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onKeyUp={updateAutocompleteOverlayPosition}
                                onClick={updateAutocompleteOverlayPosition}
                                onScroll={(event) => {
                                    updateAutocompleteOverlayPosition();
                                    const scrollTop = event.currentTarget.scrollTop;
                                    if (composerHighlightRef.current) {
                                        composerHighlightRef.current.style.transform = `translateY(-${scrollTop}px)`;
                                    }
                                }}
                                onSelect={(e) => {
                                    const ta = e.currentTarget;
                                    cursorPosRef.current = ta.selectionStart ?? 0;
                                    updateAutocompleteOverlayPosition();
                                }}
                            />
                        <div
                            className={cn(
                                'bg-transparent flex-shrink-0',
                                footerPaddingClass,
                                isMobile ? 'flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
                            )}
                            style={{
                                borderBottomLeftRadius: chatInputRadius,
                                borderBottomRightRadius: chatInputRadius,
                            }}
                            data-chat-input-footer="true"
                        >
                            {isMobile ? (
                                <ComposerMobileControls
                                    isVSCode={isVSCode}
                                    footerIconButtonClass={footerIconButtonClass}
                                    iconSizeClass={iconSizeClass}
                                    sendIconSizeClass={sendIconSizeClass}
                                    stopIconSizeClass={stopIconSizeClass}
                                    canSend={canSend}
                                    canAbort={canAbort}
                                    hasContent={!!hasContent}
                                    currentSessionId={currentSessionId}
                                    newSessionDraftOpen={newSessionDraftOpen}
                                    mobileControlsPanel={mobileControlsPanel}
                                    onOpenSettings={onOpenSettings}
                                    fileInputRef={fileInputRef}
                                    handleLocalFileSelect={handleLocalFileSelect}
                                    handlePickLocalFiles={handlePickLocalFiles}
                                    handleOpenCommandMenu={handleOpenCommandMenu}
                                    openIssuePicker={openIssuePicker}
                                    openPrPicker={openPrPicker}
                                    permissionScopeSessionId={permissionScopeSessionId}
                                    permissionAutoAcceptEnabled={permissionAutoAcceptEnabled}
                                    handlePermissionAutoAcceptToggle={handlePermissionAutoAcceptToggle}
                                    onPrimaryAction={handlePrimaryAction}
                                    onQueueMessage={handleQueueMessage}
                                    onAbort={handleAbort}
                                    onOpenMobileControls={handleOpenMobileControls}
                                    onOpenAgentPanel={handleOpenAgentPanel}
                                    onCycleAgent={handleCycleAgent}
                                    onMobilePanelChange={setMobileControlsPanel}
                                    onMobilePanelSelection={handleReturnToUnifiedControls}
                                    onAgentPanelSelection={() => setMobileControlsPanel(null)}
                                    mobileControlsOpen={mobileControlsOpen}
                                    onCloseMobileControls={handleCloseMobileControls}
                                    handleOpenMobilePanel={handleOpenMobilePanel}
                                    handleReturnToUnifiedControls={handleReturnToUnifiedControls}
                                />
                            ) : (
                                <ComposerFooter
                                    isVSCode={isVSCode}
                                    footerIconButtonClass={footerIconButtonClass}
                                    footerGapClass={footerGapClass}
                                    iconSizeClass={iconSizeClass}
                                    sendIconSizeClass={sendIconSizeClass}
                                    stopIconSizeClass={stopIconSizeClass}
                                    canSend={canSend}
                                    canAbort={canAbort}
                                    hasContent={!!hasContent}
                                    currentSessionId={currentSessionId}
                                    newSessionDraftOpen={newSessionDraftOpen}
                                    isExpandedInput={isExpandedInput}
                                    onOpenSettings={onOpenSettings}
                                    fileInputRef={fileInputRef}
                                    handleLocalFileSelect={handleLocalFileSelect}
                                    handlePickLocalFiles={handlePickLocalFiles}
                                    handleOpenCommandMenu={handleOpenCommandMenu}
                                    openIssuePicker={openIssuePicker}
                                    openPrPicker={openPrPicker}
                                    permissionScopeSessionId={permissionScopeSessionId}
                                    permissionAutoAcceptEnabled={permissionAutoAcceptEnabled}
                                    handlePermissionAutoAcceptToggle={handlePermissionAutoAcceptToggle}
                                    onPrimaryAction={handlePrimaryAction}
                                    onQueueMessage={handleQueueMessage}
                                    onAbort={handleAbort}
                                    onToggleExpandedInput={handleToggleExpandedInput}
                                />
                            )}
                        </div>

                        {/* Mobile Session Status Bar - above input */}
                        {isMobile && <MobileSessionStatusBar />}
                    </div>
                </div>
            </form>

            {/* Issue Picker Dialog */}
            <GitHubIssuePickerDialog
                open={issuePickerOpen}
                onOpenChange={setIssuePickerOpen}
                mode="select"
                onSelect={(issue) => {
                    setLinkedIssue(issue);
                    setLinkedPr(null);
                }}
            />
            <GitHubPrPickerDialog
                open={prPickerOpen}
                onOpenChange={setPrPickerOpen}
                onSelect={(pr) => {
                    setLinkedPr(pr);
                    setLinkedIssue(null);
                }}
            />
        </>
    );
};

ChatInputComponent.displayName = 'ChatInput';

export const ChatInput = React.memo(ChatInputComponent);
