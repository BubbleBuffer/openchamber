import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
  WebAuthnError: class WebAuthnError extends Error {},
}));

import { startAuthentication } from '@simplewebauthn/browser';
import { authenticateWithPasskey, fetchStoredPasskeys } from './passkeys';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

describe('passkey HTTP contract consumers', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
    vi.clearAllMocks();
  });

  it('rejects malformed authentication options before starting WebAuthn', async () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ requestId: 'challenge' }), { status: 200 })) as unknown as typeof fetch;

    await expect(authenticateWithPasskey(false)).rejects.toThrow('Passkey sign-in is not available right now.');
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it('rejects malformed stored passkey lists instead of returning unchecked entries', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ passkeys: [{ id: 'only-an-id' }] }), { status: 200 })) as unknown as typeof fetch;

    await expect(fetchStoredPasskeys()).rejects.toThrow('Could not load passkeys.');
  });

  it('rejects malformed authentication verification results', async () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: true } });
    vi.mocked(startAuthentication).mockResolvedValue({} as never);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ requestId: 'challenge', optionsJSON: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verified: true }), { status: 200 })) as unknown as typeof fetch;

    await expect(authenticateWithPasskey(false)).rejects.toThrow('Passkey sign-in failed.');
  });
});
