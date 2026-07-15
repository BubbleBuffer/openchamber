const LOCAL_SLASH_COMMANDS = new Set(['undo', 'redo', 'compact', 'summary', 'review'] as const);

export type ComposerSlashCommand = 'undo' | 'redo' | 'compact' | 'summary' | 'review';

interface ShouldHandleSlashCommandLocallyOptions {
    message: string;
    inputMode: 'normal' | 'shell';
}

export function getComposerSlashCommand(message: string): ComposerSlashCommand | null {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) return null;

    const [rawCommand] = trimmed.slice(1).split(/\s+/, 1);
    if (!rawCommand) return null;

    return LOCAL_SLASH_COMMANDS.has(rawCommand as ComposerSlashCommand)
        ? (rawCommand as ComposerSlashCommand)
        : null;
}

export function isComposerSlashCommand(message: string): boolean {
    return getComposerSlashCommand(message) !== null;
}

export function shouldHandleSlashCommandLocally({
    message,
    inputMode,
}: ShouldHandleSlashCommandLocallyOptions): boolean {
    return inputMode !== 'shell' && isComposerSlashCommand(message);
}
