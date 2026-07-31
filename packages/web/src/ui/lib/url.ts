/** Browser-only URL validation and opening. */

const parseUrlSafely = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

export const isExternalHttpUrl = (url: string): boolean => {
  const parsed = parseUrlSafely(url.trim());
  if (!parsed) {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
};

/**
 * Opens an external URL in a new browser tab.
 *
 * @param url - The URL to open
 * @returns Promise<boolean> - true if the URL was opened successfully
 */
export const openExternalUrl = async (url: string): Promise<boolean> => {
  if (typeof window === 'undefined') {
    return false;
  }

  const target = url.trim();
  if (!target) {
    return false;
  }

  const parsed = parseUrlSafely(target);
  if (!parsed) {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const normalizedTarget = parsed.toString();

  try {
    window.open(normalizedTarget, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
};
