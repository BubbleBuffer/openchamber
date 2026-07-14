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

export const hasDraggedFiles = (
    dataTransfer: DataTransfer | null | undefined,
): boolean => {
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    if (Array.from(dataTransfer.items || []).some((item) => item.kind === 'file')) return true;
    if (dataTransfer.types) {
        const types = Array.from(dataTransfer.types);
        const lowerTypes = types.map((type) => type.toLowerCase());
        if (lowerTypes.includes('application/x-openchamber-file-path')) return true;
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
