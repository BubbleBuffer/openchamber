import { describe, expect, it } from 'vitest';
import { parsePendingMcpAuthResponse } from '@contracts/opencode';

describe('McpOAuthCallbackPage contract', () => {
  it('rejects a malformed pending-auth success before callback completion', () => {
    expect(parsePendingMcpAuthResponse({ name: 'server', directory: 1 }).ok).toBe(false);
  });
});
