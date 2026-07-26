import compression from "compression";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compressionFilter, shouldSkipCompression } from "./middleware.js";

function request(path: string, accept?: string | string[]): Request {
  return {
    headers: { accept },
    path,
    url: path,
  } as Request;
}

function response(contentType?: string): Response {
  return {
    getHeader: vi.fn(() => contentType),
  } as unknown as Response;
}

describe("compression middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["an SSE Accept header", request("/api/messages", "text/event-stream")],
    ["an SSE Accept header array", request("/api/messages", ["application/json", "text/event-stream"])],
    ["a terminal stream path", request("/api/terminal/abc/stream")],
    ["the global event path", request("/api/global/event")],
    ["the notification stream path", request("/api/notifications/stream")],
  ])("skips compression for %s", (_description, req) => {
    expect(shouldSkipCompression(req, response())).toBe(true);
  });

  it("skips compression when the response is an SSE", () => {
    expect(shouldSkipCompression(request("/api/messages"), response("text/event-stream; charset=utf-8"))).toBe(true);
  });

  it("delegates ordinary responses to compression's default filter", () => {
    const defaultFilter = vi.spyOn(compression, "filter").mockReturnValue(true);

    expect(compressionFilter(request("/api/messages", "application/json"), response("application/json"))).toBe(true);
    expect(defaultFilter).toHaveBeenCalledOnce();
  });
});
