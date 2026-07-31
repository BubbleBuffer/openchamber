import { describe, expect, it } from 'vitest';
import {
  buildMcpRuntimeActionKey,
  extractAuthorizationResponse,
  getStatusDescription,
  normalizeMcpAuthErrorMessage,
  shouldShowFullStatusCard,
} from './mcpRuntime';

describe('MCP runtime helpers', () => {
  it('extracts a callback code and preserves fallback callback context', () => {
    expect(
      extractAuthorizationResponse(
        'https://app.test/mcp/oauth/callback?code=abc%20123&server=linear&directory=%2Frepo&state=request-1',
      ),
    ).toEqual({
      code: 'abc 123',
      context: { name: 'linear', directory: '/repo' },
      stateKey: 'request-1',
    });
  });

  it('accepts raw authorization codes and ignores empty input', () => {
    expect(extractAuthorizationResponse('  raw-code  ')).toEqual({
      code: 'raw-code',
      context: null,
      stateKey: null,
    });
    expect(extractAuthorizationResponse('   ')).toEqual({
      code: null,
      context: null,
      stateKey: null,
    });
  });

  it('keeps runtime action keys scoped to the selected directory', () => {
    expect(buildMcpRuntimeActionKey('linear', ' /repo ')).toBe('linear::/repo');
    expect(buildMcpRuntimeActionKey(null, null)).toBe('__none__::__global__');
  });

  it('shows the expanded card only for actionable runtime states', () => {
    expect(shouldShowFullStatusCard('connected', null, false, false)).toBe(false);
    expect(shouldShowFullStatusCard('failed', null, false, false)).toBe(true);
    expect(shouldShowFullStatusCard('connected', 'https://auth.test', false, false)).toBe(true);
    expect(shouldShowFullStatusCard(undefined, null, true, false)).toBe(true);
  });

  it('normalizes expired OAuth state errors while retaining other diagnostics', () => {
    expect(
      normalizeMcpAuthErrorMessage(new Error('OAuth state required'), 'fallback'),
    ).toContain('Authorization session expired');
    expect(normalizeMcpAuthErrorMessage(new Error('network down'), 'fallback')).toBe(
      'network down',
    );
    expect(getStatusDescription('failed', 'connection refused')).toBe('connection refused');
  });
});
