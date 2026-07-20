import { describe, expect, it } from "vitest";
import { parseOwnerSessionResponse, parsePasswordSessionRequest } from "./ui-auth.js";

describe("ui auth contract", () => {
  it("validates owner session bodies and authorization responses", () => {
    expect(parsePasswordSessionRequest({ password: "secret" }).ok).toBe(true);
    expect(parsePasswordSessionRequest({ password: ["secret"] }).ok).toBe(false);
    expect(parseOwnerSessionResponse({ enabled: true, authenticated: false })).toEqual({ ok: true, value: { enabled: true, authenticated: false } });
    expect(parseOwnerSessionResponse({ enabled: "true" }).ok).toBe(false);
  });
});
