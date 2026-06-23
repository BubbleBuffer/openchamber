type HeaderRecord = Record<string, string | string[] | undefined>;

const FILTERED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "accept-encoding",
]);

const FILTERED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "te",
  "trailer",
  "upgrade",
  "www-authenticate",
  "content-encoding",
]);

const stringifyHeaderValue = (value: string | string[]): string =>
  Array.isArray(value) ? value.join(", ") : value;

const applyEntry = (
  headers: Record<string, string>,
  key: string,
  value: string | string[],
): void => {
  if (!value) return;
  const normalizedKey = key.toLowerCase();
  if (FILTERED_REQUEST_HEADERS.has(normalizedKey)) return;
  headers[normalizedKey] = stringifyHeaderValue(value);
};

const collectEntries = (requestHeaders: HeaderRecord): Array<[string, string | string[]]> => {
  const entries: Array<[string, string | string[]]> = [];
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (typeof value === "string") {
      entries.push([key, value]);
    } else if (Array.isArray(value)) {
      entries.push([key, value]);
    }
  }
  return entries;
};

export const collectForwardProxyHeaders = (
  requestHeaders: HeaderRecord,
  authHeaders: HeaderRecord = {},
): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const [key, value] of collectEntries(requestHeaders)) {
    applyEntry(headers, key, value);
  }

  if (authHeaders.Authorization) {
    headers.Authorization = stringifyHeaderValue(authHeaders.Authorization);
  }

  return headers;
};

export const shouldForwardProxyResponseHeader = (key: unknown): boolean => {
  if (typeof key !== "string" || key.trim().length === 0) {
    return false;
  }

  return !FILTERED_RESPONSE_HEADERS.has(key.toLowerCase());
};

interface ResponseLike {
  setHeader?: (name: string, value: string) => void;
}

export const applyForwardProxyResponseHeaders = (
  responseHeaders: Headers | null | undefined,
  response: ResponseLike | null | undefined,
): void => {
  if (!responseHeaders || !response || typeof response.setHeader !== "function") {
    return;
  }

  for (const [key, value] of responseHeaders.entries()) {
    if (!shouldForwardProxyResponseHeader(key)) {
      continue;
    }
    response.setHeader(key, value);
  }
};