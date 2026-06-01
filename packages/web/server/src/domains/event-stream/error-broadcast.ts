import type { HubStatus, ClientError } from "./types.js";

function shouldTriggerUpstreamHealthCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upstream: any
): boolean {
  if (!upstream) return true;
  if (!upstream.body) return upstream.ok || upstream.status >= 500;
  return upstream.status >= 500;
}

export function hubStatusToClientError(status: HubStatus): ClientError | null {
  if (status.type === "initial-error") {
    const error = status.error;
    if (error?.type === "upstream_unavailable") {
      return {
        message: `OpenCode event stream unavailable (${error.status})`,
        closeReason: "OpenCode event stream unavailable",
        triggerHealthCheck: shouldTriggerUpstreamHealthCheck(error.response),
      };
    }
    return {
      message: status.buildUrlFailed
        ? "OpenCode service unavailable"
        : "Failed to connect to OpenCode event stream",
      closeReason: status.buildUrlFailed
        ? "OpenCode service unavailable"
        : "Failed to connect to OpenCode event stream",
      triggerHealthCheck: !status.buildUrlFailed,
    };
  }

  if (status.type === "error" && status.error?.type === "stream_error") {
    return null; // non-fatal, log only
  }

  return null; // connect, disconnect, etc. are not client errors
}