import { describe, expect, it } from 'vitest';
import type { ModelMetadata } from '@/types';
import {
    formatCompactPrice,
    formatCost,
    formatDate,
    formatKnowledge,
    formatTokens,
    getCapabilityIcons,
    getModalityIcons,
} from './modelMetadata';

const metadata = (overrides: Partial<ModelMetadata> = {}): ModelMetadata => ({
    id: 'model',
    providerId: 'provider',
    ...overrides,
});

describe('model metadata presentation', () => {
    it('formats token, cost, and date values with explicit fallbacks', () => {
        expect(formatTokens(0)).toBe('0');
        expect(formatTokens(1_000_000)).toBe('1M');
        expect(formatTokens(undefined)).toBe('—');
        expect(formatCost(0.25)).toBe('$0.25');
        expect(formatCost(Number.POSITIVE_INFINITY)).toBe('—');
        expect(formatKnowledge('2024-03')).toBe('Mar 2024');
        expect(formatKnowledge('unknown')).toBe('unknown');
        expect(formatDate('2024-03-20T00:00:00.000Z')).toBe('Mar 20, 2024');
        expect(formatDate('not-a-date')).toBe('not-a-date');
    });

    it('summarizes compact prices only when finite prices are present', () => {
        expect(formatCompactPrice(metadata())).toBeNull();
        expect(formatCompactPrice(metadata({ cost: { input: 0.5 } }))).toBe('In $0.50');
        expect(formatCompactPrice(metadata({ cost: { output: 1.25 } }))).toBe('Out $1.25');
        expect(formatCompactPrice(metadata({ cost: { input: 0.5, output: 1.25 } })))
            .toBe('In $0.50 · Out $1.25');
    });

    it('deduplicates known modalities and exposes active capabilities', () => {
        const subject = metadata({
            tool_call: true,
            reasoning: false,
            modalities: {
                input: ['Text', ' text ', 'image', 'unknown'],
                output: ['audio'],
            },
        });

        expect(getCapabilityIcons(subject).map(({ key }) => key)).toEqual(['tool_call']);
        expect(getModalityIcons(subject, 'input').map(({ key }) => key)).toEqual(['text', 'image']);
        expect(getModalityIcons(subject, 'output').map(({ key }) => key)).toEqual(['audio']);
    });
});
