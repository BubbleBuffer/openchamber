import type { ComponentType } from 'react';
import {
    RiBrainAi3Line,
    RiFileImageLine,
    RiFileMusicLine,
    RiFilePdfLine,
    RiFileVideoLine,
    RiText,
    RiToolsLine,
} from '@remixicon/react';
import type { ModelMetadata } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MetadataIconComponent = ComponentType<any>;

interface CapabilityDefinition {
    key: 'tool_call' | 'reasoning';
    icon: MetadataIconComponent;
    label: string;
    isActive: (metadata?: ModelMetadata) => boolean;
}

interface ModalityIconDefinition {
    icon: MetadataIconComponent;
    label: string;
}

export type MetadataIcon = {
    key: string;
    icon: MetadataIconComponent;
    label: string;
};

const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
    {
        key: 'tool_call',
        icon: RiToolsLine,
        label: 'Tool calling',
        isActive: (metadata) => metadata?.tool_call === true,
    },
    {
        key: 'reasoning',
        icon: RiBrainAi3Line,
        label: 'Reasoning',
        isActive: (metadata) => metadata?.reasoning === true,
    },
];

const MODALITY_ICON_MAP: Record<string, ModalityIconDefinition> = {
    text: { icon: RiText, label: 'Text' },
    image: { icon: RiFileImageLine, label: 'Image' },
    video: { icon: RiFileVideoLine, label: 'Video' },
    audio: { icon: RiFileMusicLine, label: 'Audio' },
    pdf: { icon: RiFilePdfLine, label: 'PDF' },
};

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
});

export const getModalityIcons = (
    metadata: ModelMetadata | undefined,
    direction: 'input' | 'output',
): MetadataIcon[] => {
    const modalityList = direction === 'input' ? metadata?.modalities?.input : metadata?.modalities?.output;
    if (!Array.isArray(modalityList) || modalityList.length === 0) {
        return [];
    }

    const uniqueValues = Array.from(new Set(modalityList.map((item) => item.trim().toLowerCase())));

    return uniqueValues
        .map((modality) => {
            const definition = MODALITY_ICON_MAP[modality];
            return definition
                ? { key: modality, icon: definition.icon, label: definition.label }
                : null;
        })
        .filter((entry): entry is MetadataIcon => Boolean(entry));
};

export const getCapabilityIcons = (metadata?: ModelMetadata): MetadataIcon[] =>
    CAPABILITY_DEFINITIONS
        .filter((definition) => definition.isActive(metadata))
        .map(({ key, icon, label }) => ({ key, icon, label }));

export const formatTokens = (value?: number | null): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '—';
    }
    if (value === 0) {
        return '0';
    }

    const formatted = COMPACT_NUMBER_FORMATTER.format(value);
    return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
};

export const formatCost = (value?: number | null): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '—';
    }
    return CURRENCY_FORMATTER.format(value);
};

export const formatCompactPrice = (metadata?: ModelMetadata): string | null => {
    if (!metadata?.cost) {
        return null;
    }

    const inputCost = metadata.cost.input;
    const outputCost = metadata.cost.output;
    const hasInput = typeof inputCost === 'number' && Number.isFinite(inputCost);
    const hasOutput = typeof outputCost === 'number' && Number.isFinite(outputCost);

    if (hasInput && hasOutput) {
        return `In ${formatCost(inputCost)} · Out ${formatCost(outputCost)}`;
    }
    if (hasInput) {
        return `In ${formatCost(inputCost)}`;
    }
    if (hasOutput) {
        return `Out ${formatCost(outputCost)}`;
    }
    return null;
};

export const formatKnowledge = (knowledge?: string): string => {
    if (!knowledge) {
        return '—';
    }

    const match = knowledge.match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        return knowledge;
    }

    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    const knowledgeDate = new Date(Date.UTC(year, monthIndex, 1));
    return Number.isNaN(knowledgeDate.getTime())
        ? knowledge
        : new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(knowledgeDate);
};

export const formatDate = (value?: string): string => {
    if (!value) {
        return '—';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(parsedDate);
};
