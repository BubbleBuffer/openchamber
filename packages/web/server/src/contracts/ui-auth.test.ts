import { describe, expect, it } from "vitest";
import { parseOwnerSessionResponse, parsePasswordSessionRequest } from "./ui-auth.js";

describe("ui auth contract", () => {
  it("validates owner session bodies and authorization responses", () => {
    expect(parsePasswordSessionRequest({ password: "secret" }).ok).toBe(true);
    expect(parsePasswordSessionRequest({ password: ["secret"] }).ok).toBe(false);
    expect(parseOwnerSessionResponse({ authenticated: false, locked: true })).toEqual({ ok: true, value: { authenticated: false, locked: true } });
    expect(parseOwnerSessionResponse({ authenticated: "false" }).ok).toBe(false);
  });
});
