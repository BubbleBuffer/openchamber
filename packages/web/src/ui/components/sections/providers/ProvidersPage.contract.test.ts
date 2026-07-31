import { describe, expect, it } from 'vitest';
import { parseProviderDisconnectSuccess } from './providerDisconnect';

describe('ProvidersPage disconnect consumer', () => {
  it('rejects malformed and success:false 2xx payloads while preserving valid disconnect semantics', () => {
    expect(parseProviderDisconnectSuccess({ success: false, removed: false, requiresReload: false, message: 'nope' }).ok).toBe(false);
    expect(parseProviderDisconnectSuccess({ success: true, removed: 'no', requiresReload: false, message: 'nope' }).ok).toBe(false);
    expect(parseProviderDisconnectSuccess({ success: true, removed: true, requiresReload: true, message: 'Provider disconnected successfully', reloadDelayMs: 800 }).ok).toBe(true);
  });
});
