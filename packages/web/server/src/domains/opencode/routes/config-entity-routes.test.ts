import { describe, expect, it } from "vitest";
import { parseMcpConfigRequest } from "../../../contracts/opencode.js";

describe("MCP config entity route contract", () => {
  it("rejects a malformed owned MCP request before the config service can consume it", () => {
    expect(parseMcpConfigRequest({ type: "remote", command: "not-an-array" }).ok).toBe(false);
  });
});
