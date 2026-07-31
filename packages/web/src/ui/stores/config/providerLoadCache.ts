const DEFAULT_PROVIDER_LOAD_TTL_MS = 10_000;

export const createProviderLoadCache = (
    ttlMs = DEFAULT_PROVIDER_LOAD_TTL_MS,
    now: () => number = Date.now,
) => {
    const loadedAt = new Map<string, number>();

    return {
        reuse(inFlight: Promise<void> | undefined, directoryKey: string, hasSnapshot: boolean, force = false): Promise<void> | undefined {
            if (inFlight) return inFlight;
            const timestamp = loadedAt.get(directoryKey);
            if (force || !hasSnapshot || timestamp === undefined || now() - timestamp >= ttlMs) {
                return undefined;
            }
            return Promise.resolve();
        },
        mark(directoryKey: string): void {
            loadedAt.set(directoryKey, now());
        },
    };
};

export const providerLoadCache = createProviderLoadCache();
