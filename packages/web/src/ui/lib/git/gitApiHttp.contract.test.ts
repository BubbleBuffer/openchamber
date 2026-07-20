import { afterEach, describe, expect, it, vi } from "vitest";
import { getGitStatus } from "./gitApiHttp";

describe("git HTTP contract adapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects malformed successful status payloads", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ current: "main" }), { status: 200 })));
    await expect(getGitStatus("/repo")).rejects.toThrow("Malformed git status response");
  });

  it("does not expose raw server errors", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "/private/token", code: "git_internal_error" }), { status: 500, statusText: "Internal Server Error" })));
    await expect(getGitStatus("/other-repo")).rejects.toThrow("Failed to get git status (git_internal_error)");
  });
});
