export const collectForwardProxyHeaders: (requestHeaders: Record<string, unknown>, authHeaders?: Record<string, string>) => Record<string, string>;
export const shouldForwardProxyResponseHeader: (key: string) => boolean;
export const applyForwardProxyResponseHeaders: (responseHeaders: Headers, response: { setHeader: (key: string, value: string) => void }) => void;