import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkIsGitRepositoriesBatch, continueRebase, getCurrentGitIdentity, getGitBranches,
  getGitLog, getGitStatus, getGitWorktreeBootstrapStatus, gitFetch, merge, stash,
  validateGitWorktree,
} from "./gitApiHttp";

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

  it("rejects malformed successful mutation payloads with a stable adapter error", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: "yes" }), { status: 200 })));
    await expect(gitFetch("/repo")).rejects.toThrow("Malformed git fetch response");
  });

  it("normalizes optional operation conflict state required by browser consumers", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    await expect(continueRebase("/repo")).resolves.toEqual({ success: true, conflict: false });
  });

  it("preserves the portable status fields used by lightweight and rich polling", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      current: null, tracking: null, ahead: 2, behind: 1, files: [{ path: "a.ts", index: "M", working_dir: " " }],
      isClean: false, diffStats: { "a.ts": { insertions: 2, deletions: 1 } },
      mergeInProgress: { head: "main", message: "merge" }, rebaseInProgress: null, attentionReason: "merge",
    }), { status: 200 })));
    await expect(getGitStatus("/status-shape", { mode: "light" })).resolves.toMatchObject({
      current: null, tracking: null, ahead: 2, behind: 1, attentionReason: "merge",
      mergeInProgress: { head: "main", message: "merge" },
    });
  });

  it("decodes batch partial outcomes and representative branch, log, identity, worktree, and operation responses", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    const responses = [
      { results: { "/repo": true, "/not-repo": false } },
      { all: ["main"], current: "main", branches: { main: { current: true, name: "main", commit: "abc", label: "main", tracking: "origin/main", ahead: 1, behind: 0 } } },
      { all: [], latest: null, total: 0 },
      { userName: "Ada", userEmail: "ada@example.test", sshCommand: null },
      { ok: true, errors: [], resolved: { mode: "new", localBranch: "topic" } },
      { status: "ready", error: null, updatedAt: 1 },
      { success: true, conflict: true, conflictFiles: ["a.ts"] },
      { success: true },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200 })));
    await expect(checkIsGitRepositoriesBatch(["/repo", "/not-repo"])).resolves.toEqual({ "/repo": true, "/not-repo": false });
    await expect(getGitBranches("/branches")).resolves.toMatchObject({ current: "main" });
    await expect(getGitLog("/log")).resolves.toEqual({ all: [], latest: null, total: 0 });
    await expect(getCurrentGitIdentity("/identity")).resolves.toEqual({ userName: "Ada", userEmail: "ada@example.test", sshCommand: null });
    await expect(validateGitWorktree("/worktree", { mode: "new" })).resolves.toMatchObject({ ok: true });
    await expect(getGitWorktreeBootstrapStatus("/bootstrap")).resolves.toMatchObject({ status: "ready" });
    await expect(merge("/merge", { branch: "topic" })).resolves.toMatchObject({ conflict: true, conflictFiles: ["a.ts"] });
    await expect(stash("/stash")).resolves.toEqual({ success: true });
  });
});
