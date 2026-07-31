import { describe, expect, it } from 'vitest';
import {
    filterMobileModelProviders,
    getModelDisplayName,
    matchesModelSearch,
} from './modelSearch';

describe('model selector search', () => {
    it('matches punctuation-insensitively and across partial tokens', () => {
        expect(matchesModelSearch('Claude 3.7 Sonnet', 'claude37')).toBe(true);
        expect(matchesModelSearch('GPT-4.1 Mini', 'gpt mini')).toBe(true);
        expect(matchesModelSearch('DeepSeek Chat', 'sonnet')).toBe(false);
    });

    it('retains provider-name matches and only matching models otherwise', () => {
        const providers = [
            {
                id: 'anthropic',
                name: 'Anthropic',
                models: [
                    { id: 'claude-sonnet', name: 'Claude Sonnet' },
                    { id: 'claude-haiku', name: 'Claude Haiku' },
                ],
            },
            {
                id: 'openai',
                name: 'OpenAI',
                models: [{ id: 'gpt-4.1', name: 'GPT 4.1' }],
            },
        ];

        expect(filterMobileModelProviders(providers, 'anthropic')).toEqual([
            { provider: providers[0], providerModels: [] },
        ]);
        expect(filterMobileModelProviders(providers, 'haiku')).toEqual([
            { provider: providers[0], providerModels: [providers[0].models[1]] },
        ]);
    });

    it('uses ids as fallback labels and truncates long names consistently', () => {
        expect(getModelDisplayName({ id: 'model-id' })).toBe('model-id');
        expect(getModelDisplayName({ name: 'x'.repeat(41) })).toBe(`${'x'.repeat(37)}...`);
    });
});
