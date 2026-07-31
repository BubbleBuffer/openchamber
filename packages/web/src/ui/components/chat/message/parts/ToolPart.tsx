
import React from 'react';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { RiArrowDownSLine, RiArrowRightSLine } from '@remixicon/react';
import { PatchDiff } from '@pierre/diffs/react';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import { getToolMetadata } from '@/lib/tools/toolHelpers';
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@/lib/opencode/client';
import { toolDisplayStyles } from '@/lib/theme/typography';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { useOptionalThemeSystem } from '@/contexts/useThemeSystem';
import { useDirectoryStore } from '@/stores/files/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionMessageRecords, useEnsureSessionMessages } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';
import { useChatRenderingStore } from '@/stores/useChatRenderingStore';
import { useSessionActivity } from '@/hooks/useSessionActivity';
import { opencodeClient } from '@/lib/opencode/client';
import { sessionEvents } from '@/lib/session/sessionEvents';
import { Text } from '@/components/ui/text';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import type { ContentChangeReason } from '@/components/chat/timeline/types';
import type { ToolPopupContent } from '../types';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';
import type { MessageRecord } from '@/lib/messages/messageCompletion';

import {
    formatEditOutput,
    detectLanguageFromOutput,
    formatInputForDisplay,
    tryParseJsonOutput,
} from '../toolRenderers';
import { JsonTreeViewer } from '@/components/ui/JsonTreeViewer';
import { DiffViewToggle, type DiffViewMode } from '../DiffViewToggle';
import { MinDurationShineText } from './MinDurationShineText';
import { getToolIcon } from './toolPresentation';
import { useDurationTickerNow } from './useDurationTicker';
import { resolveFallbackTaskSessionId } from './resolveFallbackTaskSessionId';
import { areRenderRelevantPartsEqual } from '../renderCompare';
import {
    buildTaskSessionMessagesSignature,
    buildTaskSummaryEntriesFromSession,
    normalizeTaskSummaryEntries,
    parseTaskMetadataBlock,
    readTaskSessionIdFromOutput,
    readTaskSessionIdFromRecord,
    renderAnimatedPathWithIcon,
    renderPathLikeGitChanges,
    TaskToolSummary,
    type TaskToolSummaryEntry,
    ToolScrollableSection,
} from './toolPartSupport';

type ToolStateWithMetadata = ToolStateUnion & { metadata?: Record<string, unknown>; input?: Record<string, unknown>; output?: string; error?: string; time?: { start: number; end?: number } };

interface ToolPartProps {
    part: ToolPartType;
    isExpanded: boolean;
    onToggle: (toolId: string) => void;
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
    onContentChange?: (reason?: ContentChangeReason) => void;
    onShowPopup?: (content: ToolPopupContent) => void;
    animateTailText?: boolean;
}

const getMultiFileDescription = (
    metadata: Record<string, unknown> | undefined,
    animate = true,
    showFileIcons = true,
): React.ReactNode => {
    const files = Array.isArray(metadata?.files) ? metadata?.files : [];
    if (files.length <= 1) return null;

    const parseCount = (value: unknown): number | null => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Math.max(0, Math.trunc(value));
        }
        if (typeof value === 'string') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) {
                return Math.max(0, parsed);
            }
        }
        return null;
    };

    const combineCounts = (base: number | null, incoming: number | null): number | null => {
        if (base === null) return incoming;
        if (incoming === null) return base;
        return base + incoming;
    };

    const entriesByPath = new Map<string, { path: string; name: string; added: number | null; removed: number | null }>();

    for (const file of files) {
        const fileObj = file as { relativePath?: string; filePath?: string; additions?: unknown; deletions?: unknown };
        const filePath = fileObj.relativePath || fileObj.filePath || '';
        if (!filePath) continue;
        const fileName = filePath.split('/').pop() || filePath;
        const added = parseCount(fileObj.additions);
        const removed = parseCount(fileObj.deletions);

        const existing = entriesByPath.get(filePath);
        if (existing) {
            existing.added = combineCounts(existing.added, added);
            existing.removed = combineCounts(existing.removed, removed);
            continue;
        }

        entriesByPath.set(filePath, { path: filePath, name: fileName, added, removed });
    }

    const entries = Array.from(entriesByPath.values());

    return (
        <>
            {entries.map((entry) => {
                const hasPerFileDiff = entry.added !== null || entry.removed !== null;
                return (
                    <span key={entry.path} className="inline-flex min-w-0 max-w-full items-center gap-1 typography-meta leading-5" style={{ color: 'var(--tools-description)' }}>
                        {showFileIcons ? <FileTypeIcon filePath={entry.path} className="h-3.5 w-3.5" /> : null}
                        <Text
                            variant={animate ? 'generate-effect' : 'static'}
                            className="min-w-0 max-w-full truncate typography-meta leading-5"
                            style={{ color: 'var(--tools-description)' }}
                            title={entry.path}
                        >
                            {entry.name}
                        </Text>
                        {hasPerFileDiff ? (
                            <span className="flex-shrink-0 inline-flex items-center gap-0 typography-meta" style={{ fontSize: '0.8rem', lineHeight: '1' }}>
                                <span style={{ color: 'var(--status-success)' }}>+{entry.added ?? 0}</span>
                                <span style={{ color: 'var(--tools-description)' }}>/</span>
                                <span style={{ color: 'var(--status-error)' }}>-{entry.removed ?? 0}</span>
                            </span>
                        ) : null}
                    </span>
                );
            })}
        </>
    );
};

const normalizeToolName = (toolName: string | undefined | null): string => {
    if (typeof toolName !== 'string') {
        return '';
    }

    const trimmed = toolName.trim().toLowerCase();
    if (!trimmed) {
        return '';
    }

    if (trimmed.includes('.')) {
        const dotParts = trimmed.split('.').filter(Boolean);
        const last = dotParts[dotParts.length - 1];
        if (last) return last;
    }

    return trimmed;
};

const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes cap
const TASK_TOOL_POLL_FAST_MS = 1200;
const TASK_TOOL_POLL_IDLE_MS = 3200;
const TASK_TOOL_POLL_HIDDEN_MS = 6000;
const TASK_TOOL_INITIAL_FETCH_LIMIT = 500;
const TASK_TOOL_ACTIVE_FETCH_LIMIT = 160;
const TASK_TOOL_IDLE_FETCH_LIMIT = 80;
const TASK_TOOL_NO_CHANGE_BACKOFF_AFTER_POLLS = 3;
const TASK_TOOL_SETTLE_GRACE_MS = 2500;
const TASK_TOOL_FALLBACK_RETRY_MS = 3000;
const GIT_REFRESH_MUTATING_TOOLS = new Set([
    'bash',
    'edit',
    'write',
    'apply_patch',
    'patch',
    'task',
]);

const formatDuration = (start: number, end?: number, now: number = Date.now()) => {
    const duration = Math.min(Math.max(0, (end ?? now) - start), MAX_DURATION_MS);
    const seconds = duration / 1000;

    const displaySeconds = seconds < 0.05 && end !== undefined ? 0.1 : seconds;
    return `${displaySeconds.toFixed(1)}s`;
};

const LiveDuration: React.FC<{ start: number; end?: number; active: boolean }> = ({ start, end, active }) => {
    const now = useDurationTickerNow(active, 250);

    return <>{formatDuration(start, end, now)}</>;
};

const parseDiffStats = (metadata?: Record<string, unknown>): { added: number; removed: number } | null => {
    const diffText = getPatchText((metadata as { patch?: unknown } | undefined)?.patch)
        ?? getPatchText(metadata?.diff);
    if (!diffText) return null;

    const lines = diffText.split('\n');
    let added = 0;
    let removed = 0;

    for (const line of lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++;
        if (line.startsWith('-') && !line.startsWith('---')) removed++;
    }

    if (added === 0 && removed === 0) return null;
    return { added, removed };
};

const parseWriteLineCount = (input?: Record<string, unknown>): number | null => {
    if (!input?.content || typeof input.content !== 'string') return null;
    const lines = input.content.split('\n');
    return lines.length;
};

const extractFirstChangedLineFromDiff = (diffText: string): number | undefined => {
    if (!diffText || typeof diffText !== 'string') {
        return undefined;
    }

    const lines = diffText.split('\n');
    let currentNewLine: number | undefined;
    let firstHunkStart: number | undefined;

    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, '');
        const hunkMatch = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
        if (hunkMatch) {
            const parsed = Number.parseInt(hunkMatch[1] ?? '', 10);
            if (Number.isFinite(parsed)) {
                currentNewLine = Math.max(1, parsed);
                if (!Number.isFinite(firstHunkStart)) {
                    firstHunkStart = currentNewLine;
                }
            }
            continue;
        }

        if (currentNewLine === undefined || !Number.isFinite(currentNewLine)) {
            continue;
        }

        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
            continue;
        }

        if (line.startsWith('+')) {
            return currentNewLine;
        }

        if (line.startsWith(' ')) {
            currentNewLine += 1;
            continue;
        }

        if (line.startsWith('-') || line.startsWith('\\')) {
            continue;
        }
    }

    return firstHunkStart;
};

const getPatchText = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    if (value && typeof value === 'object') {
        const patch = (value as { patch?: unknown }).patch;
        if (typeof patch === 'string') {
            const trimmed = patch.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
    }

    return undefined;
};

const buildWritePreviewPatch = (filePath: string | undefined, content: string): string | undefined => {
    const normalizedContent = content.replace(/\r\n/g, '\n');
    if (!normalizedContent.trim()) {
        return undefined;
    }

    const normalizedPath = (() => {
        const candidate = (filePath ?? '').trim();
        if (!candidate) {
            return 'new-file';
        }
        return candidate.startsWith('/') ? candidate.slice(1) : candidate;
    })();

    const lines = normalizedContent.split('\n');
    const hunkSize = lines.length;
    const body = lines.map((line) => `+${line}`).join('\n');

    return [
        '--- /dev/null',
        `+++ b/${normalizedPath}`,
        `@@ -0,0 +1,${hunkSize} @@`,
        body,
    ].join('\n');
};

const getFirstChangedLineFromMetadata = (tool: string, metadata?: Record<string, unknown>): number | undefined => {
    if (!metadata || (tool !== 'edit' && tool !== 'multiedit' && tool !== 'apply_patch')) {
        return undefined;
    }

    const topLevelPatch = getPatchText((metadata as { patch?: unknown }).patch) ?? getPatchText(metadata.diff);
    if (topLevelPatch) {
        const line = extractFirstChangedLineFromDiff(topLevelPatch);
        if (Number.isFinite(line)) {
            return line;
        }
    }

    const files = Array.isArray(metadata.files) ? metadata.files : [];
    const firstFile = files[0] as { patch?: unknown; diff?: unknown } | undefined;
    const filePatch = getPatchText(firstFile?.patch) ?? getPatchText(firstFile?.diff);
    if (filePatch) {
        const line = extractFirstChangedLineFromDiff(filePatch);
        if (Number.isFinite(line)) {
            return line;
        }
    }

    return undefined;
};

const normalizeDisplayPath = (value: string): string => {
    const trimmed = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    if (!trimmed || trimmed === '/') {
        return trimmed;
    }
    return trimmed.replace(/\/+$/, '');
};

const getRelativePath = (absolutePath: string, currentDirectory: string): string => {
    const normalizedAbsolutePath = normalizeDisplayPath(absolutePath);
    const normalizedCurrentDirectory = normalizeDisplayPath(currentDirectory);

    if (!normalizedAbsolutePath) {
        return '';
    }

    if (!normalizedCurrentDirectory) {
        return normalizedAbsolutePath;
    }

    if (normalizedAbsolutePath === normalizedCurrentDirectory) {
        return '.';
    }

    const prefix = `${normalizedCurrentDirectory}/`;
    if (normalizedAbsolutePath.startsWith(prefix)) {
        return normalizedAbsolutePath.slice(prefix.length);
    }

    return normalizedAbsolutePath;
};

type ToolDiagnostic = {
    message: string;
    line: number;
    character: number;
};

type ToolDiagnosticSection = {
    displayPath: string;
    diagnostics: ToolDiagnostic[];
    remaining: number;
};

const TOOL_DIAGNOSTICS_MAX_PER_FILE = 5;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

const normalizeToolDiagnostic = (value: unknown): ToolDiagnostic | null => {
    if (!isRecord(value)) {
        return null;
    }

    const message = typeof value.message === 'string' ? value.message.trim() : '';
    if (!message) {
        return null;
    }

    const severity = typeof value.severity === 'number' && Number.isFinite(value.severity) ? Math.trunc(value.severity) : undefined;
    if (severity !== undefined && severity !== 1) {
        return null;
    }

    const range = isRecord(value.range) ? value.range : undefined;
    const start = range && isRecord(range.start) ? range.start : undefined;
    const rawLine = typeof start?.line === 'number' && Number.isFinite(start.line) ? Math.max(0, Math.trunc(start.line)) : 0;
    const rawCharacter = typeof start?.character === 'number' && Number.isFinite(start.character)
        ? Math.max(0, Math.trunc(start.character))
        : 0;

    return {
        message,
        line: rawLine + 1,
        character: rawCharacter + 1,
    };
};

const getPrimaryToolPath = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
): string | null => {
    if (toolName === 'apply_patch') {
        const files = Array.isArray(metadata?.files) ? metadata.files : [];
        const first = files.find((entry) => {
            if (!isRecord(entry)) {
                return false;
            }
            return entry.type !== 'delete';
        });
        if (!isRecord(first)) {
            return null;
        }
        return typeof first.movePath === 'string'
            ? first.movePath
            : typeof first.filePath === 'string'
                ? first.filePath
                : typeof first.relativePath === 'string'
                    ? first.relativePath
                    : null;
    }

    if (toolName === 'edit' || toolName === 'multiedit') {
        const fileDiff = isRecord(metadata?.filediff) ? metadata.filediff : undefined;
        if (isRecord(fileDiff) && typeof fileDiff.file === 'string') {
            return fileDiff.file;
        }
        return typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : typeof input?.path === 'string'
                    ? input.path
                    : null;
    }

    if (toolName === 'write') {
        return typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : typeof input?.path === 'string'
                    ? input.path
                    : null;
    }

    return null;
};

const getToolDiagnosticSection = (
    toolName: string,
    input: Record<string, unknown> | undefined,
    metadata: Record<string, unknown> | undefined,
    currentDirectory: string,
): ToolDiagnosticSection | null => {
    if (!['edit', 'multiedit', 'write', 'apply_patch'].includes(toolName)) {
        return null;
    }

    const primaryPath = getPrimaryToolPath(toolName, input, metadata);
    if (!primaryPath || !metadata || !isRecord(metadata.diagnostics)) {
        return null;
    }

    const normalizedPath = normalizeDisplayPath(primaryPath);
    const absolutePath = normalizedPath.startsWith('/')
        ? normalizedPath
        : `${normalizeDisplayPath(currentDirectory)}/${normalizedPath}`.replace(/\/+/g, '/');

    const rawDiagnostics = (metadata.diagnostics as Record<string, unknown>)[normalizedPath]
        ?? (metadata.diagnostics as Record<string, unknown>)[absolutePath];
    if (!Array.isArray(rawDiagnostics)) {
        return null;
    }

    const diagnostics = rawDiagnostics
        .map((entry) => normalizeToolDiagnostic(entry))
        .filter((entry): entry is ToolDiagnostic => !!entry);
    if (diagnostics.length === 0) {
        return null;
    }

    const visible = diagnostics.slice(0, TOOL_DIAGNOSTICS_MAX_PER_FILE);
    return {
        displayPath: normalizedPath.startsWith('/') ? getRelativePath(normalizedPath, currentDirectory) : normalizedPath,
        diagnostics: visible,
        remaining: Math.max(0, diagnostics.length - visible.length),
    };
};

const usePierreThemeConfig = () => {
    const themeSystem = useOptionalThemeSystem();
    const fallbackLightTheme = React.useMemo(() => getDefaultTheme(false), []);
    const fallbackDarkTheme = React.useMemo(() => getDefaultTheme(true), []);

    const availableThemes = React.useMemo(
        () => themeSystem?.availableThemes ?? [fallbackLightTheme, fallbackDarkTheme],
        [fallbackDarkTheme, fallbackLightTheme, themeSystem?.availableThemes],
    );
    const lightThemeId = themeSystem?.lightThemeId ?? fallbackLightTheme.metadata.id;
    const darkThemeId = themeSystem?.darkThemeId ?? fallbackDarkTheme.metadata.id;

    const lightTheme = React.useMemo(
        () => availableThemes.find((theme) => theme.metadata.id === lightThemeId) ?? fallbackLightTheme,
        [availableThemes, fallbackLightTheme, lightThemeId],
    );
    const darkTheme = React.useMemo(
        () => availableThemes.find((theme) => theme.metadata.id === darkThemeId) ?? fallbackDarkTheme,
        [availableThemes, darkThemeId, fallbackDarkTheme],
    );

    React.useEffect(() => {
        ensurePierreThemeRegistered(lightTheme);
        ensurePierreThemeRegistered(darkTheme);
    }, [darkTheme, lightTheme]);

    const currentVariant = themeSystem?.currentTheme.metadata.variant ?? 'light';

    return {
        pierreTheme: { light: lightTheme.metadata.id, dark: darkTheme.metadata.id },
        pierreThemeType: currentVariant === 'dark' ? ('dark' as const) : ('light' as const),
    };
};

// Parse question tool output: "User has answered your questions: "Q1"="A1", "Q2"="A2". You can now..."
const parseQuestionOutput = (output: string): Array<{ question: string; answer: string }> | null => {
    const match = output.match(/^User has answered your questions:\s*(.+?)\.\s*You can now/s);
    if (!match) return null;

    const pairs: Array<{ question: string; answer: string }> = [];
    const content = match[1];

    // Match "question"="answer" pairs, handling multiline answers
    const pairRegex = /"([^"]+)"="([^"]*(?:[^"\\]|\\.)*)"/g;
    let pairMatch;
    while ((pairMatch = pairRegex.exec(content)) !== null) {
        pairs.push({
            question: pairMatch[1],
            answer: pairMatch[2],
        });
    }

    return pairs.length > 0 ? pairs : null;
};

const getToolDescriptionPath = (part: ToolPartType, state: ToolStateUnion, currentDirectory: string): string | null => {
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;

    if (part.tool === 'apply_patch') {
        const files = Array.isArray(metadata?.files) ? metadata?.files : [];
        const firstFile = files[0] as { relativePath?: string; filePath?: string } | undefined;
        const filePath = firstFile?.relativePath || firstFile?.filePath;
        if (files.length > 1) return null;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory);
        }
        return null;
    }

    if ((part.tool === 'edit' || part.tool === 'multiedit') && input) {
        const filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory);
        }
    }

    if (part.tool === 'read' && input) {
        const filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory);
        }
    }

    if (['write', 'create', 'file_write'].includes(part.tool) && input) {
        const filePath = input?.filePath || input?.file_path || input?.path;
        if (typeof filePath === 'string') {
            return getRelativePath(filePath, currentDirectory);
        }
    }

    return null;
};

const getToolDescription = (part: ToolPartType, state: ToolStateUnion, currentDirectory: string): string => {
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;

    const filePathLabel = getToolDescriptionPath(part, state, currentDirectory);
    if (filePathLabel) {
        return filePathLabel;
    }

    if (part.tool === 'apply_patch') {
        const files = Array.isArray(metadata?.files) ? metadata?.files : [];
        if (files.length > 1) {
            return `${files.length} files`;
        }
        return '';
    }

    // Question tool: show "Asked N question(s)"
    if (part.tool === 'question' && input?.questions && Array.isArray(input.questions)) {
        const count = input.questions.length;
        return `Asked ${count} question${count !== 1 ? 's' : ''}`;
    }

    if (part.tool === 'bash' && input?.command && typeof input.command === 'string') {
        const firstLine = input.command.split('\n')[0];
        return firstLine.substring(0, 100);
    }

    if (part.tool === 'task' && input?.description && typeof input.description === 'string') {
        return input.description.substring(0, 80);
    }

    const desc = input?.description || metadata?.description || ('title' in state && state.title) || '';
    return typeof desc === 'string' ? desc : '';
};

const getToolOutputLanguage = (
    output: string,
    part: ToolPartType,
    metadata: Record<string, unknown> | undefined,
    input: Record<string, unknown> | undefined,
): string => {
    if (part.tool === 'bash') {
        return 'bash';
    }

    return detectLanguageFromOutput(formatEditOutput(output, part.tool, metadata), part.tool, input);
};

const getToolOutputText = (
    output: string,
    part: ToolPartType,
    metadata: Record<string, unknown> | undefined,
): string => {
    if (part.tool === 'bash') {
        return output;
    }

    return formatEditOutput(output, part.tool, metadata);
};

const ToolScrollableTextOutput: React.FC<{
    output: string;
    part: ToolPartType;
    metadata: Record<string, unknown> | undefined;
    input: Record<string, unknown> | undefined;
    syntaxTheme: { [key: string]: React.CSSProperties };
}> = ({ output, part, metadata, input, syntaxTheme }) => {
    const renderedOutput = getToolOutputText(output, part, metadata);
    const outputLanguage = getToolOutputLanguage(output, part, metadata, input);
    const jsonResult = React.useMemo(() => tryParseJsonOutput(renderedOutput), [renderedOutput]);

    if (jsonResult.isJson) {
        return (
            <div className="tool-output-surface p-2 rounded-xl w-full min-w-0">
                <JsonTreeViewer
                    data={jsonResult.data}
                    initiallyExpandedDepth={1}
                    maxHeight="400px"
                />
            </div>
        );
    }

    return (
        <div className={part.tool === 'bash' ? 'typography-code text-muted-foreground/90' : undefined}>
            <SyntaxHighlighter
                style={syntaxTheme}
                language={outputLanguage}
                PreTag="div"
                customStyle={{
                    ...toolDisplayStyles.getCollapsedStyles(),
                    padding: 0,
                    overflow: 'visible',
                }}
                codeTagProps={{
                    style: {
                        background: 'transparent',
                        backgroundColor: 'transparent',
                    },
                }}
                wrapLongLines
            >
                {renderedOutput}
            </SyntaxHighlighter>
        </div>
    );
};

ToolScrollableTextOutput.displayName = 'ToolScrollableTextOutput';

interface DiffPreviewProps {
    diff: string;
    pierreTheme: { light: string; dark: string };
    pierreThemeType: 'light' | 'dark';
    diffViewMode: DiffViewMode;
}

const TOOL_DIFF_UNSAFE_CSS = `
  [data-diff-header],
  [data-diff] {
    [data-separator] {
      height: 24px !important;
    }
  }
`;

const TOOL_DIFF_METRICS = {
    hunkLineCount: 50,
    lineHeight: 24,
    diffHeaderHeight: 44,
    hunkSeparatorHeight: 24,
    fileGap: 0,
};

type DiffPatchEntry = {
    id: string;
    title: string;
    patch: string;
};

const getDiffPatchEntries = (
    metadata: Record<string, unknown> | undefined,
    fallbackDiff: string,
    currentDirectory: string,
): DiffPatchEntry[] => {
    const files = Array.isArray(metadata?.files) ? metadata.files : [];

    const entries = files
        .map((file, index) => {
            if (!file || typeof file !== 'object') {
                return null;
            }

            const record = file as { relativePath?: unknown; filePath?: unknown; patch?: unknown; diff?: unknown };
            const patch = getPatchText(record.patch) ?? getPatchText(record.diff) ?? '';
            if (!patch) {
                return null;
            }

            const rawPath = typeof record.relativePath === 'string'
                ? record.relativePath
                : typeof record.filePath === 'string'
                    ? record.filePath
                    : `File ${index + 1}`;

            const title = typeof rawPath === 'string'
                ? getRelativePath(rawPath, currentDirectory)
                : `File ${index + 1}`;

            return {
                id: `${title}-${index}`,
                title,
                patch,
            } satisfies DiffPatchEntry;
        })
        .filter((entry): entry is DiffPatchEntry => entry !== null);

    if (entries.length > 0) {
        return entries;
    }

    return [
        {
            id: 'diff-0',
            title: 'Diff',
            patch: fallbackDiff,
        },
    ];
};

const DiffPreview: React.FC<DiffPreviewProps> = React.memo(({ diff, pierreTheme, pierreThemeType, diffViewMode }) => {
    return (
        <div className="typography-code px-1 pb-1 pt-0">
            <PatchDiff
                patch={diff}
                metrics={TOOL_DIFF_METRICS}
                options={{
                    diffStyle: diffViewMode === 'side-by-side' ? 'split' : 'unified',
                    diffIndicators: 'none',
                    hunkSeparators: 'line-info-basic',
                    lineDiffType: 'none',
                    disableFileHeader: true,
                    maxLineDiffLength: 1000,
                    expansionLineCount: 20,
                    overflow: 'wrap',
                    theme: pierreTheme,
                    themeType: pierreThemeType,
                    unsafeCSS: TOOL_DIFF_UNSAFE_CSS,
                }}
                className="block w-full"
            />
        </div>
    );
});

DiffPreview.displayName = 'DiffPreview';

interface ToolExpandedContentProps {
    part: ToolPartType;
    state: ToolStateUnion;
    syntaxTheme: { [key: string]: React.CSSProperties };
    currentDirectory: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}

const ToolExpandedContent: React.FC<ToolExpandedContentProps> = React.memo(({
    part,
    state,
    syntaxTheme,
    currentDirectory,
    onShowPopup,
}) => {
    const { pierreTheme, pierreThemeType } = usePierreThemeConfig();
    const [diffViewMode, setDiffViewMode] = React.useState<DiffViewMode>('unified');
    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const input = stateWithData.input;
    const rawOutput = stateWithData.output;
    const hasStringOutput = typeof rawOutput === 'string' && rawOutput.length > 0;
    const outputString = typeof rawOutput === 'string' ? rawOutput : '';

    const diffContent = getPatchText((metadata as { patch?: unknown } | undefined)?.patch)
        ?? getPatchText(metadata?.diff)
        ?? null;
    const diffEntries = React.useMemo(
        () => (diffContent ? getDiffPatchEntries(metadata, diffContent, currentDirectory) : []),
        [currentDirectory, diffContent, metadata]
    );
    const hideToolInputPreview = part.tool === 'apply_patch'
        || part.tool === 'edit'
        || part.tool === 'multiedit';
    const diagnosticSection = React.useMemo(
        () => getToolDiagnosticSection(part.tool, input, metadata, currentDirectory),
        [currentDirectory, input, metadata, part.tool],
    );

    const inputTextContent = React.useMemo(() => {
        if (!input || typeof input !== 'object' || Object.keys(input).length === 0) {
            return '';
        }

        if ('command' in input && typeof input.command === 'string' && part.tool === 'bash') {
            return formatInputForDisplay(input, part.tool);
        }

        if (typeof (input as { content?: unknown }).content === 'string') {
            return (input as { content?: string }).content ?? '';
        }

        return formatInputForDisplay(input, part.tool);
    }, [input, part.tool]);
    const hasInputText = !hideToolInputPreview && inputTextContent.trim().length > 0;
    const isWriteLikeTool = part.tool === 'write' || part.tool === 'create' || part.tool === 'file_write';
    const writeLikeInputPatch = React.useMemo(() => {
        if (!isWriteLikeTool || !hasInputText) {
            return undefined;
        }
        const filePath = typeof input?.filePath === 'string'
            ? input.filePath
            : typeof input?.file_path === 'string'
                ? input.file_path
                : typeof input?.path === 'string'
                    ? input.path
                    : undefined;
        return buildWritePreviewPatch(filePath, inputTextContent);
    }, [hasInputText, input?.filePath, input?.file_path, input?.path, inputTextContent, isWriteLikeTool]);

    React.useEffect(() => {
        setDiffViewMode('unified');
    }, [part.id]);

    const renderScrollableBlock = (
        content: React.ReactNode,
        options?: { maxHeightClass?: string; className?: string; disableHorizontal?: boolean; outerClassName?: string }
    ) => (
        <ToolScrollableSection
            maxHeightClass={options?.maxHeightClass}
            className={options?.className}
            disableHorizontal={options?.disableHorizontal}
            outerClassName={options?.outerClassName}
        >
            {content}
        </ToolScrollableSection>
    );

    const renderResultContent = () => {
        const renderDiagnosticsSection = () => {
            if (!diagnosticSection) {
                return null;
            }

            return (
                <div
                    className="tool-output-surface rounded-xl border p-2 space-y-2"
                    style={{
                        borderColor: 'var(--status-error-border)',
                        backgroundColor: 'var(--status-error-background)',
                    }}
                >
                    <div className="typography-meta font-medium" style={{ color: 'var(--status-error)' }}>
                        LSP errors
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1 min-w-0">
                            {renderPathLikeGitChanges(diagnosticSection.displayPath, false)}
                        </div>
                        <div className="space-y-1">
                            {diagnosticSection.diagnostics.map((diagnostic, index) => (
                                <div key={`${diagnosticSection.displayPath}:${diagnostic.line}:${diagnostic.character}:${index}`} className="rounded-md border px-2 py-1" style={{ borderColor: 'var(--status-error-border)', backgroundColor: 'var(--surface-elevated)' }}>
                                    <div className="flex items-start gap-2 min-w-0">
                                        <span className="typography-micro shrink-0" style={{ color: 'var(--status-error)' }}>
                                            [{diagnostic.line}:{diagnostic.character}]
                                        </span>
                                        <span className="typography-meta text-foreground whitespace-pre-wrap break-words">
                                            {diagnostic.message}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {diagnosticSection.remaining > 0 ? (
                            <div className="typography-micro text-muted-foreground">
                                +{diagnosticSection.remaining} more errors
                            </div>
                        ) : null}
                    </div>
                </div>
            );
        };

        // Question tool: show parsed Q&A summary or question content from input
        if (part.tool === 'question') {
            if (state.status === 'completed' && hasStringOutput) {
                const parsedQA = parseQuestionOutput(outputString);
                if (parsedQA && parsedQA.length > 0) {
                    return renderScrollableBlock(
                        <div className="space-y-2">
                            {parsedQA.map((qa, index) => (
                                <div key={index} className="space-y-0.5">
                                    <div className="typography-micro text-muted-foreground">{qa.question}</div>
                                    <div className="typography-meta text-foreground whitespace-pre-wrap">{qa.answer}</div>
                                </div>
                            ))}
                        </div>,
                        { maxHeightClass: 'max-h-[40vh]' }
                    );
                }
            }

            if (state.status === 'error' && 'error' in state) {
                return (
                    <div>
                        <div className="typography-meta font-medium text-muted-foreground mb-1">Error:</div>
                        <div className="typography-meta p-2 rounded-xl border" style={{
                            backgroundColor: 'var(--status-error-background)',
                            color: 'var(--status-error)',
                            borderColor: 'var(--status-error-border)',
                        }}>
                            {state.error}
                        </div>
                    </div>
                );
            }

            // Show question content from input whenever available, whether the tool is
            // pending/running or completed without parseable output. This ensures question
            // text persists across refreshes even if the QuestionCard store data is lost.
            const questionInput = input as { questions?: Array<{ question?: string; header?: string; options?: Array<{ label: string; description: string }>; multiple?: boolean }> } | undefined;
            if (questionInput?.questions && Array.isArray(questionInput.questions) && questionInput.questions.length > 0) {
                return renderScrollableBlock(
                    <div className="space-y-2">
                        {questionInput.questions.map((q, index) => (
                            <div key={index} className="space-y-0.5">
                                {q.header ? (
                                    <div className="typography-micro text-muted-foreground">{q.header}</div>
                                ) : null}
                                <div className="typography-meta text-foreground">{q.question}</div>
                                {Array.isArray(q.options) && q.options.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {q.options.map((opt) => (
                                            <span key={opt.label} className="typography-micro px-1.5 py-0.5 rounded bg-muted/30 border border-border/30 text-muted-foreground">
                                                {opt.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>,
                    { maxHeightClass: 'max-h-[40vh]' }
                );
            }

            return <div className="typography-meta text-muted-foreground">Awaiting response...</div>;
        }

        if (part.tool === 'task' && hasStringOutput) {
            return renderScrollableBlock(
                <div className="w-full min-w-0">
                    <SimpleMarkdownRenderer content={outputString} variant="tool" onShowPopup={onShowPopup} />
                </div>
            );
        }

        if ((part.tool === 'edit' || part.tool === 'multiedit' || part.tool === 'apply_patch' || part.tool === 'write') && (diffEntries.length > 0 || !!diagnosticSection)) {
            return renderScrollableBlock(
                <div className="space-y-3">
                    {diffEntries.map((entry) => (
                        <div key={entry.id} className="w-full min-w-0">
                            {diffEntries.length > 1 ? (
                                <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground rounded-lg mb-1">
                                    {renderPathLikeGitChanges(entry.title)}
                                </div>
                            ) : null}
                            <DiffPreview
                                diff={entry.patch}
                                pierreTheme={pierreTheme}
                                pierreThemeType={pierreThemeType}
                                diffViewMode={diffViewMode}
                            />
                        </div>
                    ))}
                    {renderDiagnosticsSection()}
                </div>,
                { className: 'p-1' }
            );
        }

        if (part.tool === 'write' && diagnosticSection) {
            return renderScrollableBlock(
                <div className="space-y-3">
                    {renderDiagnosticsSection()}
                </div>,
                { className: 'p-1' },
            );
        }

        if (isWriteLikeTool) {
            return null;
        }

        if (hasStringOutput && outputString.trim()) {
            return renderScrollableBlock(
                <ToolScrollableTextOutput
                    output={outputString}
                    part={part}
                    metadata={metadata}
                    input={input}
                    syntaxTheme={syntaxTheme}
                />,
                {
                    className: 'p-1',
                    maxHeightClass: part.tool === 'bash' ? 'max-h-[46vh]' : undefined,
                }
            );
        }

        return renderScrollableBlock(
            <div className="typography-meta text-muted-foreground/70">No output produced</div>,
            { maxHeightClass: 'max-h-60' }
        );
    };

    return (
        <div
            className={cn(
                'relative pr-2 pb-2 pt-2 space-y-2 pl-4'
            )}
        >
            {part.tool === 'question' ? (
                renderResultContent()
            ) : (
                <>
                    {hasInputText ? (
                        <div className="my-1">
                            {renderScrollableBlock(
                                part.tool === 'bash' ? (
                                    <pre className="tool-input-text whitespace-pre-wrap break-words typography-code text-muted-foreground/90 m-0 p-0">
                                        {inputTextContent}
                                    </pre>
                                ) : isWriteLikeTool && writeLikeInputPatch ? (
                                    <DiffPreview
                                        diff={writeLikeInputPatch}
                                        pierreTheme={pierreTheme}
                                        pierreThemeType={pierreThemeType}
                                        diffViewMode={diffViewMode}
                                    />
                                ) : (
                                    <blockquote className="tool-input-text whitespace-pre-wrap break-words typography-meta italic text-muted-foreground/70">
                                        {inputTextContent}
                                    </blockquote>
                                ),
                                {
                                    maxHeightClass: 'max-h-60',
                                    className: part.tool === 'bash' ? 'tool-input-surface p-0' : 'tool-input-surface',
                                }
                            )}
                        </div>
                    ) : null}

                    {state.status === 'completed' && 'output' in state && (
                        <div>
                            {(part.tool === 'edit' || part.tool === 'multiedit' || part.tool === 'apply_patch' || part.tool === 'write') && diffContent ? (
                                <div className="mb-1 flex items-center justify-end gap-2">
                                    <DiffViewToggle
                                        mode={diffViewMode}
                                        onModeChange={setDiffViewMode}
                                        className="h-5 w-5 p-0"
                                    />
                                </div>
                            ) : null}
                            {renderResultContent()}
                        </div>
                    )}

                    {state.status === 'error' && 'error' in state && (
                        <div>
                            <div className="typography-meta font-medium text-muted-foreground/80 mb-1">Error:</div>
                            <div className="typography-meta p-2 rounded-xl border" style={{
                                backgroundColor: 'var(--status-error-background)',
                                color: 'var(--status-error)',
                                borderColor: 'var(--status-error-border)',
                            }}>
                                {state.error}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
});

ToolExpandedContent.displayName = 'ToolExpandedContent';

const ToolPart: React.FC<ToolPartProps> = ({
    part,
    isExpanded,
    onToggle,
    syntaxTheme,
    isMobile,
    onContentChange,
    onShowPopup,
    animateTailText = true,
}) => {
    const state = part.state;
    const showToolFileIcons = useChatRenderingStore((s) => s.showToolFileIcons);
    const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
    const currentSessionId = useSessionUIStore((s) => s.currentSessionId);

    const normalizedPartTool = normalizeToolName(part.tool);
    const isTaskTool = normalizedPartTool === 'task';

    const status = state?.status as string | undefined;
    const isFinalized = status === 'completed' || status === 'error' || status === 'aborted' || status === 'failed' || status === 'timeout' || status === 'cancelled';
    const isError = status === 'error' || status === 'failed';

    const [activeLatched, setActiveLatched] = React.useState<boolean>(!isFinalized);
    const previousPartIdRef = React.useRef<string | undefined>(part.id);
    const lastGitRefreshSignatureRef = React.useRef<string>('');

    React.useEffect(() => {
        if (previousPartIdRef.current === part.id) {
            return;
        }
        previousPartIdRef.current = part.id;
        lastGitRefreshSignatureRef.current = '';
        // Reset latch only when tool identity changes.
        setActiveLatched(!isFinalized);
    }, [isFinalized, part.id]);

    React.useEffect(() => {
        if (!isFinalized) {
            setActiveLatched(true);
        }
    }, [isFinalized]);

    React.useEffect(() => {
        if (!isFinalized || isError || !currentDirectory) {
            return;
        }
        if (!GIT_REFRESH_MUTATING_TOOLS.has(normalizedPartTool)) {
            return;
        }

        const signature = `${part.id}:${status ?? 'unknown'}`;
        if (lastGitRefreshSignatureRef.current === signature) {
            return;
        }
        lastGitRefreshSignatureRef.current = signature;
        sessionEvents.requestGitRefresh({ directory: currentDirectory });
    }, [currentDirectory, isError, isFinalized, normalizedPartTool, part.id, status]);



    const shouldNotifyStructuralChange = isFinalized || isTaskTool;

    React.useEffect(() => {
        if (!shouldNotifyStructuralChange) {
            return;
        }
        if (typeof isExpanded === 'boolean') {
            onContentChange?.('structural');
        }
    }, [isExpanded, onContentChange, shouldNotifyStructuralChange]);

    const stateWithData = state as ToolStateWithMetadata;
    const metadata = stateWithData.metadata;
    const partMetadata = (part as unknown as { metadata?: unknown }).metadata;
    const input = stateWithData.input;
    const time = stateWithData.time;

    const [pinnedTime, setPinnedTime] = React.useState<{ start?: number; end?: number }>({});
    const [localStartAt, setLocalStartAt] = React.useState<number | undefined>(undefined);
    const [localFinalizedAt, setLocalFinalizedAt] = React.useState<number | undefined>(undefined);

    React.useEffect(() => {
        setPinnedTime({});
        setLocalStartAt(undefined);
        setLocalFinalizedAt(undefined);
    }, [part.id]);

    React.useEffect(() => {
        if (isFinalized) {
            return;
        }
        if (typeof time?.start === 'number') {
            return;
        }
        setLocalStartAt((prev) => prev ?? Date.now());
    }, [isFinalized, time?.start]);

    React.useEffect(() => {
        setPinnedTime((prev) => {
            const next = { ...prev };
            let changed = false;

            if (typeof time?.start === 'number' && (typeof prev.start !== 'number' || time.start < prev.start)) {
                next.start = time.start;
                changed = true;
            }

            if (typeof time?.end === 'number' && (typeof prev.end !== 'number' || time.end > prev.end)) {
                next.end = time.end;
                changed = true;
            }

            return changed ? next : prev;
        });
    }, [time?.end, time?.start]);

    const effectiveTimeStart = React.useMemo(() => {
        // Once we captured a local start (during pending, before server sends time.start),
        // always prefer it so the timer never jumps when server start arrives later.
        if (typeof localStartAt === 'number') {
            return localStartAt;
        }
        const candidates = [pinnedTime.start, time?.start].filter(
            (value): value is number => typeof value === 'number'
        );
        if (candidates.length === 0) {
            return undefined;
        }
        return Math.min(...candidates);
    }, [localStartAt, pinnedTime.start, time?.start]);

    const taskSessionResolutionStart = React.useMemo(() => {
        if (typeof pinnedTime.start === 'number') {
            return pinnedTime.start;
        }
        if (typeof time?.start === 'number') {
            return time.start;
        }
        return localStartAt;
    }, [localStartAt, pinnedTime.start, time?.start]);

    const taskOutputString = React.useMemo(() => {
        return typeof stateWithData.output === 'string' ? stateWithData.output : undefined;
    }, [stateWithData.output]);

    const parsedTaskMetadata = React.useMemo(() => {
        return parseTaskMetadataBlock(taskOutputString);
    }, [taskOutputString]);

    // Track whether fallback session resolution has failed at least once.
    // When true, resolveFallbackTaskSessionId widens its time window (3s → 8s).
    const [taskFallbackRetried, setTaskFallbackRetried] = React.useState(false);

    const explicitTaskSessionId = React.useMemo<string | undefined>(() => {
        if (!isTaskTool) {
            return undefined;
        }

        const metadataSessionId = readTaskSessionIdFromRecord(metadata);
        if (metadataSessionId) {
            return metadataSessionId;
        }

        const partLevelSessionId = readTaskSessionIdFromRecord(partMetadata);
        if (partLevelSessionId) {
            return partLevelSessionId;
        }

        if (parsedTaskMetadata.sessionId) {
            return parsedTaskMetadata.sessionId;
        }
        return readTaskSessionIdFromOutput(taskOutputString);
    }, [isTaskTool, metadata, parsedTaskMetadata.sessionId, partMetadata, taskOutputString]);

    const fallbackTaskSessionId = useDirectorySync(
        React.useCallback((storeState) => {
            if (explicitTaskSessionId) {
                return undefined;
            }

            return resolveFallbackTaskSessionId({
                isTaskTool,
                parentSessionId: currentSessionId ?? undefined,
                taskStartTime: taskSessionResolutionStart,
                isTaskFinalized: isFinalized,
                sessions: storeState.session,
                sessionStatusMap: storeState.session_status,
                hasRetried: taskFallbackRetried,
            });
        }, [explicitTaskSessionId, isTaskTool, currentSessionId, taskSessionResolutionStart, isFinalized, taskFallbackRetried]),
        currentDirectory,
    );

    const taskSessionId = explicitTaskSessionId ?? fallbackTaskSessionId;

    const childSessionMessages = useSessionMessageRecords(taskSessionId ?? '', currentDirectory);
    useEnsureSessionMessages(taskSessionId ?? '', currentDirectory);

    const metadataTaskSummaryEntries = React.useMemo<TaskToolSummaryEntry[]>(() => {
        if (!isTaskTool) {
            return [];
        }
        const candidateSummary = (metadata as { summary?: unknown; entries?: unknown; tools?: unknown; calls?: unknown } | undefined);
        const normalized = normalizeTaskSummaryEntries(
            candidateSummary?.summary ?? candidateSummary?.entries ?? candidateSummary?.tools ?? candidateSummary?.calls
        );

        if (normalized.length > 0) {
            return normalized;
        }

        return parsedTaskMetadata.summaryEntries;
    }, [isTaskTool, metadata, parsedTaskMetadata.summaryEntries]);

    const childSessionTaskSummaryEntries = React.useMemo<TaskToolSummaryEntry[]>(() => {
        if (!isTaskTool || !taskSessionId) {
            return [];
        }
        if (!Array.isArray(childSessionMessages) || childSessionMessages.length === 0) {
            return [];
        }
        return buildTaskSummaryEntriesFromSession(childSessionMessages);
    }, [childSessionMessages, isTaskTool, taskSessionId]);

    const childSessionHasInFlightTools = React.useMemo(() => {
        if (!isTaskTool || !taskSessionId || !Array.isArray(childSessionMessages) || childSessionMessages.length === 0) {
            return false;
        }

        for (const message of childSessionMessages) {
            if (message?.info?.role !== 'assistant') {
                continue;
            }
            const parts = Array.isArray(message.parts) ? message.parts : [];
            for (const childPart of parts) {
                if (childPart?.type !== 'tool') {
                    continue;
                }
                const childStatus =
                    typeof childPart === 'object' && childPart !== null && 'state' in childPart
                        ? (childPart.state as { status?: string } | undefined)?.status
                        : undefined;
                if (childStatus === 'running' || childStatus === 'pending' || childStatus === 'started') {
                    return true;
                }
            }
        }

        return false;
    }, [childSessionMessages, isTaskTool, taskSessionId]);

    const childSessionActivity = useSessionActivity(taskSessionId, currentDirectory);
    const [taskChildSeenActive, setTaskChildSeenActive] = React.useState(false);
    const [taskChildPollingStopped, setTaskChildPollingStopped] = React.useState(false);
    const [taskPendingFinalFetch, setTaskPendingFinalFetch] = React.useState(false);

    const taskPollNoChangeCountRef = React.useRef(0);
    const taskPollLastSignatureRef = React.useRef<string>('');
    const taskFinalFetchDoneRef = React.useRef(false);

    React.useEffect(() => {
        setTaskChildSeenActive(false);
        setTaskChildPollingStopped(false);
        setTaskPendingFinalFetch(false);
        taskPollNoChangeCountRef.current = 0;
        taskPollLastSignatureRef.current = '';
        taskFinalFetchDoneRef.current = false;
        setTaskFallbackRetried(false);
    }, [taskSessionId]);

    // Widen fallback resolution window only after a real retry boundary.
    React.useEffect(() => {
        if (!isTaskTool || taskFallbackRetried || explicitTaskSessionId != null || taskSessionId != null || isFinalized) {
            return;
        }

        const sinceStart =
            typeof taskSessionResolutionStart === 'number'
                ? Date.now() - taskSessionResolutionStart
                : 0;
        const delay = Math.max(0, TASK_TOOL_FALLBACK_RETRY_MS - sinceStart);

        if (typeof window === 'undefined') {
            setTaskFallbackRetried(true);
            return;
        }

        const timer = window.setTimeout(() => {
            setTaskFallbackRetried(true);
        }, delay);

        return () => {
            window.clearTimeout(timer);
        };
    }, [
        explicitTaskSessionId,
        isFinalized,
        isTaskTool,
        taskFallbackRetried,
        taskSessionId,
        taskSessionResolutionStart,
    ]);

    React.useEffect(() => {
        if (!isTaskTool || !taskSessionId) {
            return;
        }

        const childSessionIsActive =
            childSessionActivity.phase === 'busy'
            || childSessionActivity.phase === 'retry'
            || childSessionHasInFlightTools;

        if (childSessionIsActive) {
            if (!taskChildSeenActive) {
                setTaskChildSeenActive(true);
            }
            if (taskChildPollingStopped) {
                setTaskChildPollingStopped(false);
            }
            if (taskPendingFinalFetch) {
                setTaskPendingFinalFetch(false);
            }
            return;
        }

        // Always stop polling if already done.
        if (taskChildPollingStopped && taskFinalFetchDoneRef.current) {
            return;
        }

        // Normal settle path: child went idle after we saw it active, and we have entries.
        // Schedule a grace period before marking polling as stopped.
        if (taskChildSeenActive && childSessionTaskSummaryEntries.length > 0 && !taskChildPollingStopped) {
            if (typeof window === 'undefined') {
                setTaskChildPollingStopped(true);
                return;
            }

            const timer = window.setTimeout(() => {
                setTaskChildPollingStopped(true);
            }, TASK_TOOL_SETTLE_GRACE_MS);

            return () => {
                window.clearTimeout(timer);
            };
        }

        // Final-fetch path: child went idle before parent saw it active, or we have no
        // entries yet. First stop polling after the settle grace period. A separate
        // effect performs the final fetch once polling has fully stopped, avoiding
        // races with any in-flight polling response.
        if (!taskChildPollingStopped && !taskFinalFetchDoneRef.current) {
            if (typeof window === 'undefined') {
                setTaskPendingFinalFetch(true);
                setTaskChildPollingStopped(true);
                return;
            }

            const timer = window.setTimeout(() => {
                setTaskPendingFinalFetch(true);
                setTaskChildPollingStopped(true);
            }, TASK_TOOL_SETTLE_GRACE_MS);

            return () => {
                window.clearTimeout(timer);
            };
        }
    }, [
        childSessionActivity.phase,
        childSessionHasInFlightTools,
        childSessionTaskSummaryEntries.length,
        currentDirectory,
        activeLatched,
        isFinalized,
        isTaskTool,
        taskPendingFinalFetch,
        taskChildPollingStopped,
        taskChildSeenActive,
        taskSessionId,
    ]);

    React.useEffect(() => {
        if (!isTaskTool || !taskSessionId || !taskChildPollingStopped || !taskPendingFinalFetch || taskFinalFetchDoneRef.current) {
            return;
        }

        let cancelled = false;
        const capturedSessionId = taskSessionId;

        const runFinalFetch = async () => {
            try {
                const scopedClient = opencodeClient.getScopedSdkClient(currentDirectory);
                const response = await scopedClient.session.messages({
                    sessionID: capturedSessionId,
                    limit: TASK_TOOL_INITIAL_FETCH_LIMIT,
                });

                if (cancelled) {
                    return;
                }

                const messages = response.data ?? [];
                if (Array.isArray(messages) && messages.length > 0) {
                    const childStores = getSyncChildStores();
                    childStores.update(currentDirectory, (prev) => {
                        const records = messages as MessageRecord[];
                        const partPatch: Record<string, import('@/lib/opencode/client').Part[]> = { ...prev.part };
                        for (const rec of records) {
                            partPatch[rec.info.id] = rec.parts;
                        }
                        return {
                            message: { ...prev.message, [capturedSessionId]: records.map((r) => r.info) as import('@/lib/opencode/client').Message[] },
                            part: partPatch,
                        };
                    });
                }

                taskFinalFetchDoneRef.current = true;
                setTaskPendingFinalFetch(false);
            } catch {
                if (cancelled) {
                    return;
                }

                setTaskPendingFinalFetch(false);
                setTaskChildPollingStopped(false);
            }
        };

        void runFinalFetch();

        return () => {
            cancelled = true;
        };
    }, [
        currentDirectory,
        isTaskTool,
        taskChildPollingStopped,
        taskPendingFinalFetch,
        taskSessionId,
    ]);

    React.useEffect(() => {
        if (typeof time?.end === 'number' || typeof pinnedTime.end === 'number') {
            setLocalFinalizedAt(undefined);
            return;
        }

        if (typeof effectiveTimeStart !== 'number') {
            return;
        }

        if (!isFinalized) {
            return;
        }

        setLocalFinalizedAt((prev) => prev ?? Date.now());
    }, [
        effectiveTimeStart,
        isFinalized,
        pinnedTime.end,
        time?.end,
    ]);

    const effectiveTimeEnd = isFinalized ? (pinnedTime.end ?? time?.end ?? localFinalizedAt) : undefined;
    const isActive = !isFinalized && activeLatched;
    const shouldTreatAsFinalized = isFinalized;

    const taskSummaryEntries = React.useMemo<TaskToolSummaryEntry[]>(() => {
        if (childSessionTaskSummaryEntries.length > 0) {
            return childSessionTaskSummaryEntries;
        }
        return metadataTaskSummaryEntries;
    }, [childSessionTaskSummaryEntries, metadataTaskSummaryEntries]);

    React.useEffect(() => {
        if (!isTaskTool || !taskSessionId) {
            return;
        }

        const childSessionActive = childSessionActivity.phase === 'busy' || childSessionActivity.phase === 'retry';
        const shouldPoll =
            !taskChildPollingStopped
            && (childSessionHasInFlightTools || childSessionActive || childSessionTaskSummaryEntries.length === 0);
        const shouldFetchSnapshot = !taskPendingFinalFetch && (childSessionTaskSummaryEntries.length === 0 || shouldPoll);
        if (!shouldFetchSnapshot) {
            return;
        }

        let cancelled = false;
        let pollTimer: number | undefined;

        const isVisible = () => {
            if (typeof document === 'undefined') {
                return true;
            }
            return document.visibilityState === 'visible';
        };

        const resolveFetchLimit = (isInitialFetch: boolean) => {
            if (isInitialFetch && childSessionTaskSummaryEntries.length === 0) {
                return TASK_TOOL_INITIAL_FETCH_LIMIT;
            }
            if (isActive || childSessionHasInFlightTools || childSessionActive) {
                return TASK_TOOL_ACTIVE_FETCH_LIMIT;
            }
            return TASK_TOOL_IDLE_FETCH_LIMIT;
        };

        const resolvePollDelay = () => {
            if (!isVisible()) {
                return TASK_TOOL_POLL_HIDDEN_MS;
            }
            if (taskPollNoChangeCountRef.current >= TASK_TOOL_NO_CHANGE_BACKOFF_AFTER_POLLS) {
                return TASK_TOOL_POLL_IDLE_MS;
            }
            return TASK_TOOL_POLL_FAST_MS;
        };

        const scheduleNextPoll = () => {
            if (!shouldPoll || typeof window === 'undefined' || cancelled) {
                return;
            }
            pollTimer = window.setTimeout(() => {
                pollTimer = undefined;
                void fetchSessionMessages(false);
            }, resolvePollDelay());
        };

        const fetchSessionMessages = async (isInitialFetch: boolean) => {
            try {
                const scopedClient = opencodeClient.getScopedSdkClient(currentDirectory);
                const response = await scopedClient.session.messages({
                    sessionID: taskSessionId,
                    limit: resolveFetchLimit(isInitialFetch),
                });
                const messages = response.data ?? [];
                if (cancelled || !Array.isArray(messages) || messages.length === 0) {
                    return;
                }

                const nextSignature = buildTaskSessionMessagesSignature(messages as MessageRecord[]);
                if (nextSignature === taskPollLastSignatureRef.current) {
                    taskPollNoChangeCountRef.current += 1;
                    return;
                }

                taskPollLastSignatureRef.current = nextSignature;
                taskPollNoChangeCountRef.current = 0;
                // Inject fetched subagent messages into sync child store
                const childStores = getSyncChildStores();
                childStores.update(currentDirectory, (prev) => {
                    const records = messages as MessageRecord[];
                    const partPatch: Record<string, import('@/lib/opencode/client').Part[]> = { ...prev.part };
                    for (const rec of records) {
                        partPatch[rec.info.id] = rec.parts;
                    }
                    return {
                        message: { ...prev.message, [taskSessionId]: records.map((r) => r.info) as import('@/lib/opencode/client').Message[] },
                        part: partPatch,
                    };
                });
            } catch {
                // Ignore transient subagent fetch errors.
            } finally {
                scheduleNextPoll();
            }
        };

        void fetchSessionMessages(true);

        return () => {
            cancelled = true;
            if (typeof pollTimer === 'number') {
                window.clearTimeout(pollTimer);
            }
        };
    }, [
        childSessionActivity.phase,
        childSessionHasInFlightTools,
        childSessionTaskSummaryEntries.length,
        currentDirectory,
        isActive,
        isTaskTool,
        taskPendingFinalFetch,
        taskChildPollingStopped,
        taskSessionId,
    ]);


    const taskSummaryLenRef = React.useRef<number>(taskSummaryEntries.length);
    React.useEffect(() => {
        if (!isTaskTool) {
            return;
        }
        if (taskSummaryLenRef.current === taskSummaryEntries.length) {
            return;
        }
        taskSummaryLenRef.current = taskSummaryEntries.length;
        onContentChange?.('structural');
    }, [isTaskTool, onContentChange, taskSummaryEntries.length]);

    const diffStats = (normalizedPartTool === 'edit' || normalizedPartTool === 'multiedit' || normalizedPartTool === 'apply_patch') ? parseDiffStats(metadata) : null;
    const writeLineCount = normalizedPartTool === 'write' ? parseWriteLineCount(input) : null;
    const isMultiFileApplyPatch = normalizedPartTool === 'apply_patch' && Array.isArray(metadata?.files) && (metadata?.files as []).length > 1;
    const normalizedPart = normalizedPartTool !== part.tool ? ({ ...part, tool: normalizedPartTool } as ToolPartType) : part;
    const descriptionPath = getToolDescriptionPath(normalizedPart, state, currentDirectory);
    const description = getToolDescription(normalizedPart, state, currentDirectory);
    const displayName = getToolMetadata(normalizedPartTool || part.tool).displayName;
    
    // Tool title/description — shown inline as context
    const justificationText = React.useMemo(() => {
        if (normalizedPartTool === 'bash') {
            return null;
        }
        if (normalizedPartTool === 'apply_patch') {
            return null;
        }
        if (
            descriptionPath
            && (normalizedPartTool === 'apply_patch' || normalizedPartTool === 'edit' || normalizedPartTool === 'multiedit' || normalizedPartTool === 'write')
        ) {
            return null;
        }
        const title = (stateWithData as { title?: string }).title;
        if (typeof title === 'string' && title.trim().length > 0) {
            return title;
        }
        const inputDesc = input?.description;
        if (typeof inputDesc === 'string' && inputDesc.trim().length > 0) {
            return inputDesc;
        }
        return null;
    }, [descriptionPath, normalizedPartTool, stateWithData, input]);

    const runtime = React.useContext(RuntimeAPIContext);

    const handleMainClick = (e: { stopPropagation: () => void }) => {
        if (isTaskTool || !runtime?.editor) {
            onToggle(part.id);
            return;
        }

        let filePath: unknown;
        let targetLine: number | undefined;
        if (part.tool === 'edit' || part.tool === 'multiedit') {
            filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
            targetLine = getFirstChangedLineFromMetadata(part.tool, metadata);
        } else if (part.tool === 'apply_patch') {
            const files = Array.isArray(metadata?.files) ? metadata?.files : [];
            const firstFile = files[0] as { relativePath?: string; filePath?: string } | undefined;
            filePath = firstFile?.relativePath || firstFile?.filePath;
            targetLine = getFirstChangedLineFromMetadata(part.tool, metadata);
        } else if (['write', 'create', 'file_write'].includes(part.tool)) {
            filePath = input?.filePath || input?.file_path || input?.path || metadata?.filePath || metadata?.file_path || metadata?.path;
        }

        if (typeof filePath === 'string') {
            e.stopPropagation();
            let absolutePath = filePath;
            if (!filePath.startsWith('/')) {
                absolutePath = currentDirectory.endsWith('/') ? currentDirectory + filePath : currentDirectory + '/' + filePath;
            }
            runtime.editor.openFile(absolutePath, targetLine);
        } else {
            onToggle(part.id);
        }
    };

    const handleMainKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        handleMainClick(event);
    };

    if (!shouldTreatAsFinalized && !isActive && !isTaskTool) {
        return null;
    }

    return (
        <div>
            {}
            <div
                className={cn(
                'group/tool flex gap-1.5 pr-2 pl-px py-2 rounded-xl cursor-pointer',
                isMultiFileApplyPatch ? 'flex-wrap items-start' : 'items-center'
            )}
                onClick={handleMainClick}
                onKeyDown={handleMainKeyDown}
                role="button"
                tabIndex={0}
            >
                <div className={cn('flex gap-1.5', isMultiFileApplyPatch ? 'w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5' : 'items-center flex-shrink-0')}>
                    {}
                    <div
                        className="relative h-3.5 w-3.5 flex-shrink-0 cursor-pointer"
                        onClick={(event) => { event.stopPropagation(); onToggle(part.id); }}
                    >
                        {}
                        <div
                            className={cn(
                                'absolute inset-0 transition-opacity',
                                isExpanded && 'opacity-0',
                                !isExpanded && 'group-hover/tool:opacity-0'
                            )}
                            style={!isTaskTool && isError ? { color: 'var(--status-error)' } : { color: 'var(--tools-icon)' }}
                        >
                            {getToolIcon(normalizedPartTool || part.tool)}
                        </div>
                        {}
                        <div
                            className={cn(
                                'absolute inset-0 transition-opacity flex items-center justify-center',
                                isExpanded && 'opacity-100',
                                !isExpanded && 'opacity-0 group-hover/tool:opacity-100'
                            )}
                        >
                            {isExpanded ? <RiArrowDownSLine className="h-3.5 w-3.5" /> : <RiArrowRightSLine className="h-3.5 w-3.5" />}
                        </div>
                    </div>
                    {isMultiFileApplyPatch ? (
                        <>
                            <MinDurationShineText
                                active={Boolean(isActive && !isError)}
                                minDurationMs={300}
                                className="typography-meta font-medium flex-shrink-0"
                                style={!isTaskTool && isError ? { color: 'var(--status-error)' } : { color: 'var(--tools-title)' }}
                                title={displayName}
                            >
                                {displayName}
                            </MinDurationShineText>
                            {getMultiFileDescription(metadata, animateTailText, showToolFileIcons)}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <MinDurationShineText
                                    active={Boolean(isActive && !isError)}
                                    minDurationMs={300}
                                    className="typography-meta font-medium flex-shrink-0"
                                    style={!isTaskTool && isError ? { color: 'var(--status-error)' } : { color: 'var(--tools-title)' }}
                                    title={displayName}
                                >
                                    {displayName}
                                </MinDurationShineText>
                            </div>
                            {normalizedPartTool === 'bash' && typeof effectiveTimeStart === 'number' ? (
                                <span className="flex-shrink-0 tabular-nums text-muted-foreground/80 typography-meta">
                                    <LiveDuration
                                        start={effectiveTimeStart}
                                        end={typeof effectiveTimeEnd === 'number' ? effectiveTimeEnd : undefined}
                                        active={Boolean(isActive && typeof effectiveTimeEnd !== 'number')}
                                    />
                                </span>
                            ) : null}
                        </>
                    )}
                </div>

                {!isMultiFileApplyPatch && (
                    <div className="flex items-center gap-1 flex-1 min-w-0 typography-meta" style={{ color: 'var(--tools-description)' }}>
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                            {justificationText && (
                                <span
                                    className="min-w-0 truncate typography-meta"
                                    style={{ color: 'var(--tools-description)', opacity: 0.8 }}
                                    title={justificationText}
                                >
                                    {justificationText}
                                </span>
                            )}
                            {!justificationText && description && (
                                descriptionPath && description === descriptionPath ? (
                                    renderAnimatedPathWithIcon(descriptionPath, animateTailText, false, showToolFileIcons)
                                ) : (
                                    <Text
                                        variant={animateTailText ? 'generate-effect' : 'static'}
                                        className="min-w-0 truncate typography-meta"
                                        style={{ color: 'var(--tools-description)' }}
                                        title={description}
                                    >
                                        {description}
                                    </Text>
                                )
                            )}
                            {diffStats && (
                                <span className="flex-shrink-0 inline-flex items-center gap-0 typography-meta" style={{ fontSize: '0.8rem', lineHeight: '1' }}>
                                    <span style={{ color: 'var(--status-success)' }}>+{diffStats.added}</span>
                                    <span style={{ color: 'var(--tools-description)' }}>/</span>
                                    <span style={{ color: 'var(--status-error)' }}>-{diffStats.removed}</span>
                                </span>
                            )}
                            {writeLineCount && (
                                <span className="flex-shrink-0 inline-flex items-center gap-0 typography-meta" style={{ fontSize: '0.8rem', lineHeight: '1' }}>
                                    <span style={{ color: 'var(--status-success)' }}>+{writeLineCount}</span>
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {}
            {isTaskTool && (taskSummaryEntries.length > 0 || isActive || shouldTreatAsFinalized || taskSessionId) ? (
                <TaskToolSummary
                    entries={taskSummaryEntries}
                    isExpanded={isExpanded}
                    isMobile={isMobile}
                    output={taskOutputString}
                    sessionId={taskSessionId}
                    onShowPopup={onShowPopup}
                    input={input}
                    animateTailText={animateTailText}
                    isActive={isActive}
                />
            ) : null}

            {!isTaskTool && isExpanded ? (
                <div className="relative ml-2 pl-3">
                    <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 top-px bottom-0 w-px"
                        style={{ backgroundColor: 'var(--tools-border)' }}
                    />
                    <ToolExpandedContent
                        part={part}
                        state={state}
                        syntaxTheme={syntaxTheme}
                        currentDirectory={currentDirectory}
                        onShowPopup={onShowPopup}
                    />
                </div>
            ) : null}
        </div>
    );
};

export default React.memo(ToolPart, (prev, next) => {
    return areRenderRelevantPartsEqual([prev.part], [next.part])
        && prev.isExpanded === next.isExpanded
        && prev.syntaxTheme === next.syntaxTheme
        && prev.isMobile === next.isMobile
        && prev.onContentChange === next.onContentChange
        && prev.onShowPopup === next.onShowPopup
        && prev.animateTailText === next.animateTailText;
});
