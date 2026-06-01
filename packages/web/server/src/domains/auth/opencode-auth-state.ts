import type { OpenCodeAuthStateDeps } from './types.js';

export const createOpenCodeAuthState = (dependencies: OpenCodeAuthStateDeps) => {
  const {
    crypto,
    process,
    getAuthPassword,
    setAuthPassword,
    getAuthSource,
    setAuthSource,
    getUserProvidedPassword,
    syncToHmrState,
  } = dependencies;

  const normalizeOpenCodePassword = (value: unknown): string => {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  };

  const isValidOpenCodePassword = (password: unknown): boolean =>
    typeof password === 'string' && password.trim().length > 0;

  const generateSecureOpenCodePassword = (): string =>
    crypto
      .randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  const setOpenCodeAuthState = (password: string, source: string): string | null => {
    const normalized = normalizeOpenCodePassword(password);
    if (!isValidOpenCodePassword(normalized)) {
      setAuthPassword(null);
      setAuthSource(null);
      delete process.env.OPENCODE_SERVER_PASSWORD;
      syncToHmrState();
      return null;
    }

    setAuthPassword(normalized);
    setAuthSource(source);
    process.env.OPENCODE_SERVER_PASSWORD = normalized;
    syncToHmrState();
    return normalized;
  };

  const getOpenCodeAuthHeaders = (): Record<string, string> => {
    const password = normalizeOpenCodePassword(getAuthPassword() || process.env.OPENCODE_SERVER_PASSWORD || '');

    if (!password) {
      return {};
    }

    const credentials = Buffer.from(`opencode:${password}`).toString('base64');
    return { Authorization: `Basic ${credentials}` };
  };

  const isOpenCodeConnectionSecure = (): boolean =>
    Object.prototype.hasOwnProperty.call(getOpenCodeAuthHeaders(), 'Authorization');

  const ensureLocalOpenCodeServerPassword = async ({ rotateManaged = false }: { rotateManaged?: boolean } = {}): Promise<string | null> => {
    const userProvidedPassword = getUserProvidedPassword();
    if (isValidOpenCodePassword(userProvidedPassword)) {
      return setOpenCodeAuthState(userProvidedPassword as string, 'user-env');
    }

    if (rotateManaged) {
      const rotatedPassword = setOpenCodeAuthState(generateSecureOpenCodePassword(), 'rotated');
      console.log('Rotated secure password for managed local OpenCode instance');
      return rotatedPassword;
    }

    const currentPassword = getAuthPassword();
    const currentSource = getAuthSource();
    if (isValidOpenCodePassword(currentPassword)) {
      const pw = currentPassword as string;
      return setOpenCodeAuthState(pw, currentSource || 'generated');
    }

    const generatedPassword = setOpenCodeAuthState(generateSecureOpenCodePassword(), 'generated');
    console.log('Generated secure password for managed local OpenCode instance');
    return generatedPassword;
  };

  return {
    getOpenCodeAuthHeaders,
    isOpenCodeConnectionSecure,
    ensureLocalOpenCodeServerPassword,
  };
};