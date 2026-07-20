import { describe, expect, it } from "vitest";

import { apiError, parseJsonArray, parseJsonBoolean, parseJsonNumber, parseJsonObject, parseJsonString } from "./common.js";

describe("common contracts", () => {
  it("parses JSON primitives without accepting the wrong shape", () => {
    expect(parseJsonObject({ value: 1 }).ok).toBe(true);
    expect(parseJsonArray(["x"]).ok).toBe(true);
    expect(parseJsonString("x").ok).toBe(true);
    expect(parseJsonNumber(1).ok).toBe(true);
    expect(parseJsonBoolean(false).ok).toBe(true);
    expect(parseJsonObject([]).ok).toBe(false);
    expect(parseJsonString(1).ok).toBe(false);
  });

  it("serializes unknown errors without leaking their message", () => {
    expect(apiError("internal_error")).toEqual({
      error: "Internal server error",
      code: "internal_error",
    });
  });
});
