export type SearchableModel = {
    id?: string;
    name?: string;
};

export type SearchableProvider<TModel extends SearchableModel = SearchableModel> = {
    id: string;
    name: string;
    models: TModel[];
};

type NormalizedSearchValue = {
    lower: string;
    compact: string;
    tokens: string[];
};

const normalizeModelSearchValue = (value: string): NormalizedSearchValue => {
    const lower = value.toLowerCase().trim();
    return {
        lower,
        compact: lower.replace(/[^a-z0-9]/g, ''),
        tokens: lower.split(/[^a-z0-9]+/).filter(Boolean),
    };
};

export const getModelDisplayName = (model: SearchableModel | undefined): string => {
    const name = typeof model?.name === 'string'
        ? model.name
        : (typeof model?.id === 'string' ? model.id : '');
    return name.length > 40 ? `${name.substring(0, 37)}...` : name;
};

export const matchesModelSearch = (candidate: string, query: string): boolean => {
    const normalizedQuery = normalizeModelSearchValue(query);
    if (!normalizedQuery.lower) {
        return true;
    }

    const normalizedCandidate = normalizeModelSearchValue(candidate);
    if (normalizedCandidate.lower.includes(normalizedQuery.lower)) {
        return true;
    }
    if (
        normalizedQuery.compact.length >= 2
        && normalizedCandidate.compact.includes(normalizedQuery.compact)
    ) {
        return true;
    }
    if (normalizedQuery.tokens.length === 0) {
        return false;
    }

    return normalizedQuery.tokens.every((queryToken) =>
        normalizedCandidate.tokens.some((candidateToken) =>
            candidateToken.startsWith(queryToken) || candidateToken.includes(queryToken)
        )
    );
};

export const filterMobileModelProviders = <
    TModel extends SearchableModel,
    TProvider extends SearchableProvider<TModel>,
>(
    providers: TProvider[],
    query: string,
): Array<{ provider: TProvider; providerModels: TModel[] }> => {
    const normalizedQuery = query.trim();

    return providers
        .map((provider) => {
            const matchesProvider = normalizedQuery.length === 0
                || matchesModelSearch(provider.name, normalizedQuery)
                || matchesModelSearch(provider.id, normalizedQuery);
            const providerModels = normalizedQuery.length === 0
                ? provider.models
                : provider.models.filter((model) => {
                    const modelId = typeof model.id === 'string' ? model.id : '';
                    return matchesModelSearch(getModelDisplayName(model), normalizedQuery)
                        || matchesModelSearch(modelId, normalizedQuery);
                });
            return { provider, providerModels, matchesProvider };
        })
        .filter(({ matchesProvider, providerModels }) =>
            matchesProvider || providerModels.length > 0
        )
        .map(({ provider, providerModels }) => ({ provider, providerModels }));
};
