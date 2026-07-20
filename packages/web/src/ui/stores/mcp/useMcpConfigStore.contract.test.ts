import { describe, expect, it } from "vitest";
import { parseMcpConfigListResponse } from "@contracts/opencode";

describe("MCP config store contract", () => {
  it("does not admit malformed MCP config successes into store state", () => {
    expect(parseMcpConfigListResponse([{ name: "bad", type: "remote", enabled: true }]).ok).toBe(false);
  });
});
