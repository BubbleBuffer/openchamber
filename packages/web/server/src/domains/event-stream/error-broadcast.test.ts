import { describe, expect, it } from "vitest";
import { hubStatusToClientError } from "./error-broadcast.js";

describe("hubStatusToClientError", () => {
  it("returns error for upstream_unavailable with status", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = hubStatusToClientError({ type: "initial-error", error: { type: "upstream_unavailable", status: 503 } } as any);
    expect(result?.message).toContain("503");
    expect(result?.closeReason).toBeTruthy();
    expect(result?.triggerHealthCheck).toBe(true);
  });

  it("returns build URL error when buildUrlFailed is true", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = hubStatusToClientError({ type: "initial-error", buildUrlFailed: true } as any);
    expect(result?.message).toContain("unavailable");
    expect(result?.triggerHealthCheck).toBe(false);
  });

  it("returns null for stream_error (non-fatal)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = hubStatusToClientError({ type: "error", error: { type: "stream_error" } } as any);
    expect(result).toBeNull();
  });

  it("returns null for connect status", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = hubStatusToClientError({ type: "connect", wasReady: true } as any);
    expect(result).toBeNull();
  });
});