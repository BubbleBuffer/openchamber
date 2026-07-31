import type { GitStatus } from '@/lib/api/types';

export type FileEntry = GitStatus['files'][number] & {
    insertions: number;
    deletions: number;
    isNew: boolean;
};

export type DiffData = {
    original: string;
    modified: string;
    isBinary?: boolean;
};

type ChangeDescriptor = {
    code: string;
    color: string;
    description: string;
};

const CHANGE_DESCRIPTORS: Record<string, ChangeDescriptor> = {
    '?': { code: '?', color: 'var(--status-info)', description: 'Untracked file' },
    A: { code: 'A', color: 'var(--status-success)', description: 'New file' },
    D: { code: 'D', color: 'var(--status-error)', description: 'Deleted file' },
    R: { code: 'R', color: 'var(--status-info)', description: 'Renamed file' },
    C: { code: 'C', color: 'var(--status-info)', description: 'Copied file' },
    M: { code: 'M', color: 'var(--status-warning)', description: 'Modified file' },
};

const DEFAULT_CHANGE_DESCRIPTOR = CHANGE_DESCRIPTORS.M;

const getChangeSymbol = (file: GitStatus['files'][number]): string => {
    const indexCode = file.index?.trim();
    const workingCode = file.working_dir?.trim();

    if (indexCode && indexCode !== '?') return indexCode.charAt(0);
    if (workingCode) return workingCode.charAt(0);

    return indexCode?.charAt(0) || workingCode?.charAt(0) || 'M';
};

export const describeChange = (file: GitStatus['files'][number]): ChangeDescriptor => {
    const symbol = getChangeSymbol(file);
    return CHANGE_DESCRIPTORS[symbol] ?? DEFAULT_CHANGE_DESCRIPTOR;
};

export const isNewStatusFile = (file: GitStatus['files'][number]): boolean => {
    const { index, working_dir: workingDir } = file;
    return index === 'A' || workingDir === 'A' || index === '?' || workingDir === '?';
};
