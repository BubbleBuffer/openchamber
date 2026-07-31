import { describe, expect, it } from 'vitest';

import {
    buildTaskSessionMessagesSignature,
    buildTaskSummaryEntriesFromSession,
    getTaskSummaryLabel,
    parseTaskMetadataBlock,
    readTaskSessionIdFromOutput,
    readTaskSessionIdFromRecord,
    shouldRenderGitPathLabel,
    stripTaskMetadataFromOutput,
} from './taskToolSummary';

describe('task tool summary', () => {
    it('normalizes task metadata and keeps session identifiers compatible', () => {
        const output = [
            'Finished the delegated work.',
            '<task_metadata>',
            JSON.stringify({
                sessionID: ' child-session ',
                calls: [
                    'Checked the files',
                    {
                        id: 'tool-1',
                        tool: 'read',
                        state: {
                            status: 'completed',
                            title: 'src/example.ts',
                            input: { filePath: 'src/example.ts' },
                        },
                    },
                ],
            }),
            '</task_metadata>',
        ].join('\n');

        expect(parseTaskMetadataBlock(output)).toEqual({
            sessionId: 'child-session',
            summaryEntries: [
                {
                    tool: 'tool',
                    state: { status: 'completed', title: 'Checked the files' },
                },
                {
                    id: 'tool-1',
                    tool: 'read',
                    state: {
                        status: 'completed',
                        title: 'src/example.ts',
                        input: { filePath: 'src/example.ts' },
                    },
                },
            ],
        });
        expect(readTaskSessionIdFromOutput(output)).toBe('child-session');
        expect(readTaskSessionIdFromRecord({ sessionID: ' legacy-id ' })).toBe('legacy-id');
        expect(readTaskSessionIdFromRecord({ sessionId: ' modern-id ' })).toBe('modern-id');
        expect(stripTaskMetadataFromOutput(output)).toBe('Finished the delegated work.');
    });

    it('falls back safely for malformed metadata and legacy output markers', () => {
        expect(parseTaskMetadataBlock('<task_metadata>{bad json}</task_metadata>')).toEqual({
            summaryEntries: [],
        });
        expect(readTaskSessionIdFromOutput('Task complete\ntask_id: task-123')).toBe('task-123');
        expect(readTaskSessionIdFromOutput('Session ID: session-456')).toBe('session-456');
        expect(readTaskSessionIdFromRecord(null)).toBeUndefined();
    });

    it('builds summaries from assistant tool parts without nesting task tools', () => {
        const messages = [
            {
                info: {
                    id: 'assistant-1',
                    role: 'assistant',
                    time: { created: 100, completed: 200 },
                },
                parts: [
                    {
                        id: 'task-1',
                        type: 'tool',
                        tool: 'task',
                        state: { status: 'completed', title: 'Nested task' },
                    },
                    {
                        id: 'read-1',
                        type: 'tool',
                        tool: 'mcp.read',
                        state: {
                            status: 'completed',
                            input: { filePath: 'src/index.ts' },
                        },
                    },
                    {
                        id: 'todo-1',
                        type: 'tool',
                        tool: 'todowrite',
                        state: { status: 'completed' },
                    },
                ],
            },
        ];

        const entries = buildTaskSummaryEntriesFromSession(messages as never);
        expect(entries).toEqual([
            {
                id: 'read-1',
                tool: 'mcp.read',
                state: {
                    status: 'completed',
                    title: undefined,
                    input: { filePath: 'src/index.ts' },
                },
            },
        ]);
        expect(getTaskSummaryLabel(entries[0]!)).toBe('src/index.ts');
        expect(shouldRenderGitPathLabel('read', 'src/index.ts')).toBe(true);
        expect(shouldRenderGitPathLabel('bash', 'src/index.ts')).toBe(false);
        expect(buildTaskSessionMessagesSignature(messages as never))
            .toBe('1:assistant-1:200:3:tool:todo-1:9');
    });
});
