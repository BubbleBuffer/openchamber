import { describe, expect, it } from 'vitest';
import { summarizePermission } from './agentMetadata';

describe('agent permission summaries', () => {
    it('defaults missing and malformed rules to ask', () => {
        expect(summarizePermission(undefined, 'edit')).toEqual({ mode: 'ask', label: 'Ask' });
        expect(summarizePermission([{ permission: 'edit' }], 'edit'))
            .toEqual({ mode: 'ask', label: 'Ask' });
    });

    it('uses the latest matching wildcard rule before the global fallback', () => {
        const rules = [
            { permission: '*', pattern: '*', action: 'deny' },
            { permission: 'edit', pattern: '*', action: 'ask' },
            { permission: 'edit', pattern: '*', action: 'allow' },
        ];

        expect(summarizePermission(rules, 'edit')).toEqual({ mode: 'allow', label: 'Allow' });
        expect(summarizePermission(rules, 'bash')).toEqual({ mode: 'deny', label: 'Deny' });
    });

    it('reports custom patterns without hiding their non-wildcard policy', () => {
        const rules = [
            { permission: 'bash', pattern: '*', action: 'allow' },
            { permission: 'bash', pattern: 'git push*', action: 'deny' },
        ];

        expect(summarizePermission(rules, 'bash')).toEqual({ mode: 'ask', label: 'Custom' });
    });
});
