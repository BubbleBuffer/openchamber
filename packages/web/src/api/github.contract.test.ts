import { describe, expect, it, vi } from "vitest";
import { createWebGitHubAPI } from "./github";

describe("web GitHub API contract", () => {
  it("rejects malformed successful transport bodies", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ connected: true, user: { login: 1 } }), { status: 200 })));
    await expect(createWebGitHubAPI().authStatus()).rejects.toThrow("Failed to load GitHub status");
  });

  it("preserves the existing disconnected PR state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ connected: false }), { status: 200 })));
    await expect(createWebGitHubAPI().prStatus("/repo", "topic")).resolves.toEqual({ connected: false });
  });

  it("uses the safe coded server error instead of upstream details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "GitHub request failed", code: "github_forbidden" }), { status: 403 })));
    await expect(createWebGitHubAPI().prUpdate({ directory: "/repo", number: 1, title: "Title" })).rejects.toThrow("github_forbidden");
  });
});
