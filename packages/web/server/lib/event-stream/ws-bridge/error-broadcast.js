/**
 * Maps hub status events to client-visible error messages.
 *
 * Extracted from global-ws-bridge.js to be a pure function
 * for testability and reuse.
 */

function shouldTriggerUpstreamHealthCheck(upstream) {
  if (!upstream) return true;
  if (!upstream.body) return upstream.ok || upstream.status >= 500;
  return upstream.status >= 500;
}

/**
 * @param {object} status – a hub status event (initial-error | error | connect | disconnect)
 * @returns {object|null} – { message, closeReason, triggerHealthCheck } or null if non-fatal
 */
export function hubStatusToClientError(status) {
  if (status.type === 'initial-error') {
    const error = status.error;
    if (error?.type === 'upstream_unavailable') {
      return {
        message: `OpenCode event stream unavailable (${error.status})`,
        closeReason: 'OpenCode event stream unavailable',
        triggerHealthCheck: shouldTriggerUpstreamHealthCheck(error.response),
      };
    }
    return {
      message: status.buildUrlFailed
        ? 'OpenCode service unavailable'
        : 'Failed to connect to OpenCode event stream',
      closeReason: status.buildUrlFailed
        ? 'OpenCode service unavailable'
        : 'Failed to connect to OpenCode event stream',
      triggerHealthCheck: !status.buildUrlFailed,
    };
  }

  if (status.type === 'error' && status.error?.type === 'stream_error') {
    return null; // non-fatal, log only
  }

  return null; // connect, disconnect, etc. are not client errors
}
