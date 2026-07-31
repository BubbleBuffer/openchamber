import { describe, expect, it } from 'vitest';

import type { GitStatus } from '@/lib/api/types';
import { describeChange, isNewStatusFile } from './diffFileModel';

type StatusFile = GitStatus['files'][number];

const file = (index: string, workingDir: string): StatusFile => ({
    path: 'src/example.ts',
    index,
    working_dir: workingDir,
});

describe('diff file model', () => {
    it('prefers an indexed status over a working-tree status', () => {
        expect(describeChange(file('A', 'M'))).toEqual({
            code: 'A',
            color: 'var(--status-success)',
            description: 'New file',
        });
    });

    it('uses the working-tree status for untracked and modified files', () => {
        expect(describeChange(file('?', '?')).description).toBe('Untracked file');
        expect(describeChange(file('', 'M')).description).toBe('Modified file');
    });

    it('identifies added and untracked files as new', () => {
        expect(isNewStatusFile(file('A', ''))).toBe(true);
        expect(isNewStatusFile(file('', '?'))).toBe(true);
        expect(isNewStatusFile(file('M', ''))).toBe(false);
    });
});
