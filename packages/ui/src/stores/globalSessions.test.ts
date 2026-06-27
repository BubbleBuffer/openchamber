import { describe, it, expect } from "bun:test";
import {
  readNextCursor,
  isMissingGlobalSessionsEndpointError,
} from "./globalSessions";

describe("readNextCursor", () => {
  it("returns parsed number from x-next-cursor header", () => {
    const response = {
      headers: { get: (name: string) => (name === "x-next-cursor" ? "42" : null) },
    };
    expect(readNextCursor(response)).toBe(42);
  });

  it("returns null when header missing", () => {
    const response = { headers: { get: () => null } };
    expect(readNextCursor(response)).toBe(null);
  });

  it("returns null for non-numeric header", () => {
    const response = {
      headers: { get: (name: string) => (name === "x-next-cursor" ? "abc" : null) },
    };
    expect(readNextCursor(response)).toBe(null);
  });

  it("returns null for non-object response", () => {
    expect(readNextCursor(null)).toBe(null);
    expect(readNextCursor(undefined)).toBe(null);
    expect(readNextCursor("string")).toBe(null);
  });

  it("supports plain-record headers", () => {
    const response = { headers: { "x-next-cursor": "99" } };
    expect(readNextCursor(response)).toBe(99);
  });
});

describe("isMissingGlobalSessionsEndpointError", () => {
  it("returns true for status 404", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 404 })).toBe(true);
  });

  it("returns true for status 405", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 405 })).toBe(true);
  });

  it("returns false for status 200", () => {
    expect(isMissingGlobalSessionsEndpointError({ status: 200 })).toBe(false);
  });

  it("returns false for non-object input", () => {
    expect(isMissingGlobalSessionsEndpointError(null)).toBe(false);
    expect(isMissingGlobalSessionsEndpointError(undefined)).toBe(false);
    expect(isMissingGlobalSessionsEndpointError("404")).toBe(false);
  });
});
