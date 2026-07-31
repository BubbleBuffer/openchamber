import { describe, expect, it } from "vitest";

import { MESSAGE_STREAM_PROTOCOL_VERSION, parseModelMetadataResponse, parseUpdateCheckResult, parseUpdateInstallResult, parseZenModelsResponse } from "./system.js";

describe("system contracts", () => {
  it("reports a stable protocol version and parses update outcomes", () => {
    expect(MESSAGE_STREAM_PROTOCOL_VERSION).toBe(1);
    expect(parseUpdateCheckResult({ available: true, version: "1.2.3", currentVersion: "1.2.2" }).ok).toBe(true);
    expect(parseUpdateInstallResult({ success: true, autoRestart: false }).ok).toBe(true);
    expect(parseUpdateCheckResult({ available: "yes" }).ok).toBe(false);
  });

  it("parses model and Zen response shapes and rejects malformed results", () => {
    expect(parseModelMetadataResponse({ zen: { id: "zen", models: { x: { name: "X" } } } }).ok).toBe(true);
    expect(parseZenModelsResponse({ models: [{ id: "x" }] }).ok).toBe(true);
    expect(parseZenModelsResponse({ models: "x" }).ok).toBe(false);
  });
});
