import { describe, expect, it } from "vitest";
import {
  parseDirectorySwitchRequest,
  parseMagicPromptId,
  parseMagicPromptStateResponse,
  parseMagicPromptUpdateRequest,
  parseMcpConfigListResponse,
  parseMcpMutationResponse,
  parsePendingMcpAuthRequest,
  parsePendingMcpAuthResponse,
  parseProviderSourceResponse,
  parseOpenCodeResolutionResponse,
  parseOpenCodeErrorResponse,
  parseSessionFoldersResponse,
  parseSessionFoldersUpdateRequest,
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
    expect(parseMcpMutationResponse({ success: false }).ok).toBe(false);
    expect(parsePendingMcpAuthResponse({ name: 1 }).ok).toBe(false);
  });

  it("validates session-folder wrappers without admitting malformed persisted state", () => {
    const valid = {
      version: 1,
      foldersMap: { project: [{ id: "folder", name: "Inbox", sessionIds: ["session"], createdAt: 1, parentId: null }] },
      collapsedFolderIds: ["folder"],
      updatedAt: 2,
    };
    expect(parseSessionFoldersUpdateRequest(valid).ok).toBe(true);
    expect(parseSessionFoldersResponse({ version: 1, foldersMap: {}, collapsedFolderIds: [] }).ok).toBe(true);
    expect(parseSessionFoldersUpdateRequest({ ...valid, foldersMap: { project: [{ ...valid.foldersMap.project[0], name: " " }] } }).ok).toBe(false);
    expect(parseSessionFoldersResponse({ ...valid, collapsedFolderIds: [1] }).ok).toBe(false);
  });

  it("validates magic-prompt paths, bodies, and optional persisted overrides", () => {
    expect(parseMagicPromptId(" git.commit.generate.visible ").ok).toBe(true);
    expect(parseMagicPromptId("../../secret").ok).toBe(false);
    expect(parseMagicPromptUpdateRequest({ text: "prompt" }).ok).toBe(true);
    expect(parseMagicPromptUpdateRequest({ text: 1 }).ok).toBe(false);
    expect(parseMagicPromptStateResponse({ version: 1, overrides: {} }).ok).toBe(true);
    expect(parseMagicPromptStateResponse({ overrides: {} }).ok).toBe(true);
    expect(parseMagicPromptStateResponse({ version: 1, overrides: { "bad/key": "prompt" } }).ok).toBe(false);
  });

  it("accepts only safe contracted authentication, upstream, and internal errors", () => {
    expect(parseOpenCodeErrorResponse({ error: "Request failed", code: "opencode_unauthorized" }).ok).toBe(true);
    expect(parseOpenCodeErrorResponse({ error: "Request failed", code: "opencode_upstream_error" }).ok).toBe(true);
    expect(parseOpenCodeErrorResponse({ error: "Internal server error", code: "opencode_internal_error" }).ok).toBe(true);
    expect(parseOpenCodeErrorResponse({ error: "/private/path token=secret", code: "opencode_internal_error" }).ok).toBe(false);
  });

  it("validates optional OpenCode resolution diagnostics without accepting malformed fields", () => {
    expect(parseOpenCodeResolutionResponse({ resolved: "/bin/opencode", launchArgs: ["serve"] }).ok).toBe(true);
    expect(parseOpenCodeResolutionResponse({ launchArgs: ["serve", 1] }).ok).toBe(false);
  });

  it("preserves nullable WSL resolution diagnostics", () => {
    const parsed = parseOpenCodeResolutionResponse({ configured: null, resolved: null, resolvedDir: null, source: null, detectedNow: null, detectedSourceNow: null, launchBinary: null, launchArgs: [], launchWrapperType: null, viaWsl: true, wslBinary: null, wslPath: "/mnt/c/opencode", wslDistro: null, node: null, bun: null });
    expect(parsed.ok && parsed.value).toMatchObject({ viaWsl: true, wslPath: "/mnt/c/opencode", configured: null });
  });
});
