import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface TextareaSize {
    height: number;
    maxHeight: number;
}

interface ComposerTextareaProps {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    composerHighlightRef: React.RefObject<HTMLDivElement | null>;
    value: string;
    placeholder: string;
    disabled: boolean;
    spellCheck: boolean;
    isMobile: boolean;
    isDesktopExpanded: boolean;
    inputMode: 'normal' | 'shell';
    inputSpellcheckEnabled: boolean;
    currentSessionId: string | null;
    newSessionDraftOpen: boolean;
    highlightedComposerContent: { text: string; mentionKind: 'none' | 'file' | 'agent' }[] | null;
    textareaSize: TextareaSize | null;
    chatInputRadius: string;
    onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
    onBeforeInput: React.FormEventHandler<HTMLTextAreaElement>;
    onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
    onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
    onDragEnter: React.DragEventHandler<HTMLTextAreaElement>;
    onDragOver: React.DragEventHandler<HTMLTextAreaElement>;
    onDropCapture: React.DragEventHandler<HTMLTextAreaElement>;
    onDrop: React.DragEventHandler<HTMLTextAreaElement>;
    onDragEnd: React.DragEventHandler<HTMLTextAreaElement>;
    onKeyUp: () => void;
    onClick: () => void;
    onScroll: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void;
}

export const ComposerTextarea = React.memo(function ComposerTextarea({
    textareaRef,
    composerHighlightRef,
    value,
    placeholder,
    disabled,
    spellCheck,
    isMobile,
    isDesktopExpanded,
    inputMode,
    currentSessionId,
    newSessionDraftOpen,
    highlightedComposerContent,
    textareaSize,
    chatInputRadius,
    onChange,
    onBeforeInput,
    onKeyDown,
    onPaste,
    onDragEnter,
    onDragOver,
    onDropCapture,
    onDrop,
    onDragEnd,
    onKeyUp,
    onClick,
    onScroll,
    onSelect,
}: ComposerTextareaProps) {
    return (
        <div className={cn("relative overflow-hidden", isDesktopExpanded && 'flex flex-1 min-h-0 flex-col')}>
            {highlightedComposerContent && (
                <div
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute inset-0 z-0 whitespace-pre-wrap break-words px-3 rounded-b-none',
                        isDesktopExpanded
                            ? 'h-full min-h-0 py-4'
                            : isMobile
                                ? 'py-2.5'
                                : 'pt-4 pb-2',
                        inputMode === 'shell' ? 'font-mono' : 'typography-markdown md:typography-ui-label',
                    )}
                    ref={composerHighlightRef}
                >
                    {highlightedComposerContent.map((part, index) => (
                        <span
                            key={`${index}-${part.text.length}`}
                            className={
                                part.mentionKind === 'file'
                                    ? 'text-[var(--status-info)]'
                                    : part.mentionKind === 'agent'
                                        ? 'text-[var(--status-success)]'
                                        : 'text-foreground'
                            }
                        >
                            {part.text}
                        </span>
                    ))}
                </div>
            )}
            <Textarea
                simple
                ref={textareaRef}
                data-chat-input="true"
                value={value}
                onChange={onChange}
                onBeforeInput={onBeforeInput}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onDragEnter={onDragEnter}
                onDragOver={onDragOver}
                onDropCapture={onDropCapture}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onKeyUp={onKeyUp}
                onClick={onClick}
                onScroll={(event) => {
                    onScroll(event);
                    const scrollTop = event.currentTarget.scrollTop;
                    if (composerHighlightRef.current) {
                        composerHighlightRef.current.style.transform = `translateY(-${scrollTop}px)`;
                    }
                }}
                onSelect={(e) => {
                    onSelect(e);
                }}
                placeholder={currentSessionId || newSessionDraftOpen
                    ? inputMode === 'shell'
                        ? "Enter shell command..."
                        : "@ for files/agents; / for commands; ! for shell"
                    : "Select or create a session to start chatting"}
                disabled={disabled}
                autoCorrect={isMobile ? "on" : "off"}
                autoCapitalize={isMobile ? "sentences" : "off"}
                spellCheck={spellCheck}
                fillContainer={isDesktopExpanded}
                outerClassName={cn('ring-0 bg-transparent shadow-none hover:bg-transparent focus-within:ring-0', isDesktopExpanded && 'flex-1 min-h-0')}
                className={cn(
                    'min-h-[52px] resize-none border-0 px-3 rounded-b-none appearance-none hover:border-transparent bg-transparent relative z-10',
                    isDesktopExpanded
                        ? 'h-full min-h-0 py-4'
                        : isMobile
                            ? 'py-2.5'
                            : 'pt-4 pb-2',
                    inputMode === 'shell' && 'font-mono',
                    highlightedComposerContent && 'text-transparent caret-[var(--surface-foreground)]',
                )}
                style={{
                    flex: isDesktopExpanded ? '1 1 auto' : 'none',
                    height: !isDesktopExpanded && textareaSize ? `${textareaSize.height}px` : undefined,
                    maxHeight: !isDesktopExpanded && textareaSize ? `${textareaSize.maxHeight}px` : undefined,
                    borderTopLeftRadius: chatInputRadius,
                    borderTopRightRadius: chatInputRadius,
                }}
                rows={1}
            />
        </div>
    );
});
