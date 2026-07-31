import type { EditPermissionMode } from '@/stores/types/sessionTypes';

type PermissionAction = 'allow' | 'ask' | 'deny';
type PermissionRule = { permission: string; pattern: string; action: PermissionAction };

export type PermissionSummary = {
    mode: EditPermissionMode;
    label: 'Allow' | 'Ask' | 'Deny' | 'Custom';
};

const asPermissionRuleset = (value: unknown): PermissionRule[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const rules: PermissionRule[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const candidate = entry as Partial<PermissionRule>;
        if (
            typeof candidate.permission !== 'string'
            || typeof candidate.pattern !== 'string'
            || (candidate.action !== 'allow' && candidate.action !== 'ask' && candidate.action !== 'deny')
        ) {
            continue;
        }
        rules.push({
            permission: candidate.permission,
            pattern: candidate.pattern,
            action: candidate.action,
        });
    }
    return rules;
};

const resolveWildcardPermissionAction = (
    rules: PermissionRule[],
    permission: string,
): PermissionAction | undefined => {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (rule.permission === permission && rule.pattern === '*') {
            return rule.action;
        }
    }

    for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (rule.permission === '*' && rule.pattern === '*') {
            return rule.action;
        }
    }
    return undefined;
};

export const summarizePermission = (ruleset: unknown, permissionName: string): PermissionSummary => {
    const rules = asPermissionRuleset(ruleset);
    if (rules.some((rule) => rule.permission === permissionName && rule.pattern !== '*')) {
        return { mode: 'ask', label: 'Custom' };
    }

    const action = resolveWildcardPermissionAction(rules, permissionName) ?? 'ask';
    if (action === 'allow') {
        return { mode: 'allow', label: 'Allow' };
    }
    if (action === 'deny') {
        return { mode: 'deny', label: 'Deny' };
    }
    return { mode: 'ask', label: 'Ask' };
};
