import { describe, expect, it } from 'vitest';

import { createProviderLoadCache } from './providerLoadCache';

describe('providerLoadCache', () => {
    it('deduplicates only a recent successful load with a usable snapshot', async () => {
        let time = 1_000;
        const cache = createProviderLoadCache(10_000, () => time);
        const inFlight = Promise.resolve();

        expect(cache.reuse(inFlight, 'project', false)).toBe(inFlight);
        expect(cache.reuse(undefined, 'project', true)).toBeUndefined();
        cache.mark('project');
        await expect(cache.reuse(undefined, 'project', true)).resolves.toBeUndefined();
        expect(cache.reuse(undefined, 'other-project', true)).toBeUndefined();
        expect(cache.reuse(undefined, 'project', false)).toBeUndefined();
        expect(cache.reuse(undefined, 'project', true, true)).toBeUndefined();

        time += 10_000;
        expect(cache.reuse(undefined, 'project', true)).toBeUndefined();
    });
});
