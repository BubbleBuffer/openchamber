import { describe, expect, it } from "vitest";
import {
  parseDirectorySwitchRequest,
  parseMcpConfigListResponse,
  parseMcpMutationResponse,
  parsePendingMcpAuthRequest,
  parsePendingMcpAuthResponse,
  parseProviderSourceResponse,
} from "./opencode.js";

describe("OpenChamber OpenCode wrapper contracts", () => {
  it("rejects malformed directory and pending-auth requests before a domain consumes them", () => {
    expect(parseDirectorySwitchRequest({ path: "   " }).ok).toBe(false);
    expect(parseDirectorySwitchRequest({ path: 42 }).ok).toBe(false);
    expect(parsePendingMcpAuthRequest({ state: "state" }).ok).toBe(false);
    expect(parsePendingMcpAuthRequest({ state: 42, name: "mcp" }).ok).toBe(false);
  });

  it("accepts optional and partial pending-auth wrappers", () => {
    const empty = parsePendingMcpAuthRequest({});
    const populated = parsePendingMcpAuthRequest({ state: " state ", name: " server ", directory: " /repo " });
    expect(empty.ok && empty.value).toEqual({ state: null, name: null, directory: null });
    expect(populated.ok && populated.value).toEqual({ state: "state", name: "server", directory: "/repo" });
    expect(parsePendingMcpAuthResponse({ success: true, context: { name: "mcp", directory: null } }).ok).toBe(true);
    expect(parsePendingMcpAuthResponse({ name: "mcp", directory: "/repo" }).ok).toBe(true);
  });

  it("rejects malformed owned success wrappers", () => {
    expect(parseProviderSourceResponse({ providerId: "p", sources: null }).ok).toBe(false);
    expect(parseMcpConfigListResponse({ name: "mcp" }).ok).toBe(false);
    expect(parseMcpMutationResponse({ success: "yes" }).ok).toBe(false);
    expect(parsePendingMcpAuthResponse({ name: 1 }).ok).toBe(false);
  });
});
