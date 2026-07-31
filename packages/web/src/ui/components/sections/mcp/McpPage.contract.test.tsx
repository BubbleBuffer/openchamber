import { describe, expect, it } from 'vitest';
import { parsePendingMcpAuthResponse } from '@contracts/opencode';

describe('McpPage contract', () => {
  it('accepts the optional persisted pending-auth context', () => {
    expect(parsePendingMcpAuthResponse({ name: 'server', directory: null }).ok).toBe(true);
  });
});
