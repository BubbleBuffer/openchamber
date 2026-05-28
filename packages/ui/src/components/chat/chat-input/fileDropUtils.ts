const FILE_URI_PREFIX = 'file://';

export const encodeFilePath = (filepath: string): string => {
    let normalized = filepath.replace(/\\/g, '/');
    if (/^[A-Za-z]:/.test(normalized)) {
        normalized = `/${normalized}`;
    }
    return normalized
        .split('/')
        .map((segment, index) => {
            if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
            return encodeURIComponent(segment);
        })
        .join('/');
};

export const toServerFileUrl = (filepath: string): string => {
    const normalized = filepath.replace(/\\/g, '/').trim();
    if (normalized.toLowerCase().startsWith(FILE_URI_PREFIX)) {
        return normalized;
    }
    return `file://${encodeFilePath(normalized)}`;
};

export const isLikelyAbsolutePath = (value: string): boolean => (
    value.startsWith('/')
    || value.startsWith('\\\\')
    || /^[A-Za-z]:[\\/]/.test(value)
);

export const toLikelyFileDropReference = (value: string): string | null => {
    const trimmed = value.trim().replace(/^['"]+|['"]+$/g, '');
    if (!trimmed) {
        return null;
    }

    if (/[\r\n]/.test(trimmed)) {
        return null;
    }

    if (trimmed.toLowerCase().startsWith(FILE_URI_PREFIX)) {
        return trimmed;
    }

    if (isLikelyAbsolutePath(trimmed)) {
        return trimmed;
    }

    return null;
};

const collectStringLeaves = (input: unknown, output: Set<string>, depth = 0): void => {
    if (depth > 6 || input == null) {
        return;
    }

    if (typeof input === 'string') {
        output.add(input);
        return;
    }

    if (Array.isArray(input)) {
        for (const item of input) {
            collectStringLeaves(item, output, depth + 1);
        }
        return;
    }

    if (typeof input !== 'object') {
        return;
    }

    for (const value of Object.values(input)) {
        collectStringLeaves(value, output, depth + 1);
    }
};

export const parseDroppedFileReferences = (rawPayload: string): string[] => {
    const extracted = new Set<string>();

    const addCandidatesFromText = (value: string): void => {
        const direct = toLikelyFileDropReference(value);
        if (direct) {
            extracted.add(direct);
            return;
        }

        for (const line of value.split(/\r?\n/)) {
            const candidate = toLikelyFileDropReference(line);
            if (candidate) {
                extracted.add(candidate);
            }
        }
    };

    addCandidatesFromText(rawPayload);

    try {
        const parsed = JSON.parse(rawPayload) as unknown;
        const leaves = new Set<string>();
        collectStringLeaves(parsed, leaves);
        for (const leaf of leaves) {
            addCandidatesFromText(leaf);
        }
    } catch {
        // Ignore non-JSON payloads.
    }

    return Array.from(extracted);
};

export const hasDraggedFiles = (
    dataTransfer: DataTransfer | null | undefined,
    dataTypes: readonly string[],
): boolean => {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    if (dataTransfer.types) {
        const types = Array.from(dataTransfer.types);
        const lowerTypes = types.map((type) => type.toLowerCase());
        if (lowerTypes.includes('files')) return true;
        if (lowerTypes.includes('text/uri-list')) return true;
        if (lowerTypes.includes('codefiles')) return true;
        if (lowerTypes.includes('application/x-openchamber-file-path')) return true;
        if (lowerTypes.some((type) => type.includes('vnd.code.tree'))) return true;
    }

    for (const dataType of dataTypes) {
        let payload = '';
        try {
            payload = dataTransfer.getData(dataType);
        } catch {
            continue;
        }
        if (payload && parseDroppedFileReferences(payload).length > 0) {
            return true;
        }
    }

    return false;
};

export const collectDroppedFiles = (dataTransfer: DataTransfer | null | undefined): File[] => {
    if (!dataTransfer) return [];

    const directFiles = Array.from(dataTransfer.files || []);
    if (directFiles.length > 0) {
        return directFiles;
    }

    return Array.from(dataTransfer.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
};

export const collectDroppedFileUris = (
    dataTransfer: DataTransfer | null | undefined,
    dataTypes: readonly string[],
): string[] => {
    if (!dataTransfer || typeof dataTransfer.getData !== 'function') return [];

    const extracted = new Set<string>();

    for (const dataType of dataTypes) {
        let rawPayload = '';
        try {
            rawPayload = dataTransfer.getData(dataType);
        } catch {
            continue;
        }
        if (!rawPayload) {
            continue;
        }

        for (const candidate of parseDroppedFileReferences(rawPayload)) {
            extracted.add(candidate);
        }
    }

    return Array.from(extracted);
};

export const normalizeDroppedPath = (rawPath: string): string => {
    const input = rawPath.trim();
    if (!input.toLowerCase().startsWith('file://')) {
        return input;
    }

    try {
        let pathname = decodeURIComponent(new URL(input).pathname || '');
        if (/^\/[A-Za-z]:\//.test(pathname)) {
            pathname = pathname.slice(1);
        }
        return pathname || input;
    } catch {
        const stripped = input.replace(/^file:\/\//i, '');
        try {
            return decodeURIComponent(stripped);
        } catch {
            return stripped;
        }
    }
};

export const toProjectRelativeMentionPath = (absolutePath: string, rootPath: string | null | undefined): string => {
    const normalizedAbsolutePath = absolutePath.replace(/\\/g, '/').trim();
    const normalizedRoot = (rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalizedRoot) {
        return normalizedAbsolutePath;
    }
    if (normalizedAbsolutePath === normalizedRoot) {
        return normalizedAbsolutePath;
    }
    const rootWithSlash = `${normalizedRoot}/`;
    if (normalizedAbsolutePath.startsWith(rootWithSlash)) {
        return normalizedAbsolutePath.slice(rootWithSlash.length);
    }
    return normalizedAbsolutePath;
};
