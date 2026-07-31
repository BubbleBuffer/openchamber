/**
 * Pure helpers for resolving project metadata used by ChatInput's
 * new-session-draft project picker.
 *
 * Extracted from ChatInput.tsx so that future child components (e.g.
 * the draft target selector) can share them without importing the
 * mega-component.
 */

import { formatDirectoryName } from '@/lib/utils';
import { PROJECT_COLOR_MAP } from '@/lib/project/projectMeta';

export const normalizePath = (value?: string | null): string | null => {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const normalized = trimmed.replace(/\\/g, '/');
    if (normalized === '/') {
        return '/';
    }
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

export const getProjectDisplayLabel = (project: { label?: string | null; path: string }): string => {
    const label = project.label?.trim();
    if (label) {
        return label;
    }
    return formatDirectoryName(project.path);
};

export const getProjectIconColor = (projectColor?: string | null): string | undefined => {
    if (!projectColor) {
        return undefined;
    }
    return PROJECT_COLOR_MAP[projectColor] ?? undefined;
};
