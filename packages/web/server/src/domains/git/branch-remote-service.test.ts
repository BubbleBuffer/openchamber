import type { SimpleGit } from "simple-git";
import { describe, expect, it, vi } from "vitest";
import { createBranchRemoteService } from "./branch-remote-service.js";

const asSimpleGit = (value: object): SimpleGit => value as unknown as SimpleGit;

const createDeps = (git: SimpleGit) => {
  const runGitCommandOrThrow = vi.fn(async () => undefined);
  const setBranchTrackingFallback = vi.fn(async () => undefined);
  const logger = { error: vi.fn(), warn: vi.fn() };

  return {
    deps: {
      createGit: vi.fn(async () => git),
      cleanBranchName: (branch: string) =>
        branch.replace(/^refs\/heads\//, "").replace(/^heads\//, ""),
      normalizeUpstreamTarget: (remote: string, branch: string) => ({
        remote,
        branch,
        full: `${remote}/${branch}`,
      }),
      runGitCommandOrThrow,
      setBranchTrackingFallback,
      logger,
    },
    runGitCommandOrThrow,
    setBranchTrackingFallback,
    logger,
  };
};

describe("branch and remote service", () => {
  it("filters stale remote-tracking branches against the remote heads", async () => {
    const git = asSimpleGit({
      branch: vi.fn(async () => ({
        all: ["main", "remotes/origin/main", "remotes/origin/stale"],
        current: "main",
        branches: {},
      })),
      raw: vi.fn(async () => "abc\trefs/heads/main\n"),
    });
    const { deps } = createDeps(git);

    await expect(createBranchRemoteService(deps).getBranches("/repo")).resolves.toEqual({
      all: ["main", "remotes/origin/main"],
      current: "main",
      branches: {},
    });
  });

  it("keeps remote-tracking branches when remote discovery fails", async () => {
    const git = asSimpleGit({
      branch: vi.fn(async () => ({
        all: ["main", "remotes/origin/main"],
        current: "main",
        branches: {},
      })),
      raw: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    const { deps, logger } = createDeps(git);

    await expect(createBranchRemoteService(deps).getBranches("/repo")).resolves.toMatchObject({
      all: ["main", "remotes/origin/main"],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to filter active remote branches, returning all:",
      "offline",
    );
  });

  it("restores renamed-branch tracking through the config fallback", async () => {
    const raw = vi.fn(async (args: string[]) => {
      if (args[0] === "config" && args[2]?.endsWith(".remote")) return "origin\n";
      if (args[0] === "config" && args[2]?.endsWith(".merge")) return "refs/heads/old\n";
      return "";
    });
    const git = asSimpleGit({ raw });
    const state = createDeps(git);
    state.runGitCommandOrThrow.mockRejectedValueOnce(new Error("no upstream"));

    await expect(
      createBranchRemoteService(state.deps).renameBranch("/repo", "old", "new"),
    ).resolves.toEqual({ success: true, branch: "new" });
    expect(raw).toHaveBeenCalledWith(["branch", "-m", "old", "new"]);
    expect(state.setBranchTrackingFallback).toHaveBeenCalledWith(
      "/repo",
      "new",
      { remote: "origin", branch: "new", full: "origin/new" },
    );
  });

  it("normalizes branch deletion and protects the origin remote", async () => {
    const raw = vi.fn(async () => "");
    const removeRemote = vi.fn(async () => undefined);
    const git = asSimpleGit({ raw, removeRemote });
    const state = createDeps(git);
    const service = createBranchRemoteService(state.deps);

    await expect(service.deleteBranch("/repo", "refs/heads/topic", { force: true }))
      .resolves.toEqual({ success: true });
    expect(raw).toHaveBeenCalledWith(["branch", "-D", "topic"]);
    await expect(service.removeRemote("/repo", { remote: "origin" }))
      .rejects.toThrow("Cannot remove origin remote");
    expect(removeRemote).not.toHaveBeenCalled();
  });
});
