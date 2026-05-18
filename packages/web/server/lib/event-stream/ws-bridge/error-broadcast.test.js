import { describe, expect, it } from 'vitest';
import { hubStatusToClientError } from './error-broadcast.js';

describe('hubStatusToClientError', () => {
  it('returns error for upstream_unavailable with status', () => {
    const result = hubStatusToClientError({
      type: 'initial-error',
      error: { type: 'upstream_unavailable', status: 503 },
    });
    expect(result.message).toContain('503');
    expect(result.closeReason).toBeTruthy();
    expect(result.triggerHealthCheck).toBe(true);
  });

  it('returns build URL error when buildUrlFailed is true', () => {
    const result = hubStatusToClientError({
      type: 'initial-error',
      buildUrlFailed: true,
    });
    expect(result.message).toContain('unavailable');
    expect(result.triggerHealthCheck).toBe(false);
  });

  it('returns null for stream_error (non-fatal)', () => {
    const result = hubStatusToClientError({
      type: 'error',
      error: { type: 'stream_error' },
    });
    expect(result).toBeNull();
  });

  it('returns null for connect status', () => {
    const result = hubStatusToClientError({
      type: 'connect',
      wasReady: true,
    });
    expect(result).toBeNull();
  });
});
