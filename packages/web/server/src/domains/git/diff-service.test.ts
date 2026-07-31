import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import { describe, expect, it, vi } from "vitest";
import { createDiffService } from "./diff-service.js";

const commandResult = {
  success: true,
  exitCode: 0,
  stdout: "",
  stderr: "",
};

function createService(git: unknown) {
  const createGit = vi.fn(async () => git as SimpleGit);
  const resolveDefaultBranch = vi.fn(async () => "origin/main");
  const runGitCommand = vi.fn(async () => commandResult);
  return {
    createGit,
    resolveDefaultBranch,
    runGitCommand,
    service: createDiffService({
      createGit,
      normalizeDirectoryPath: (directory) => directory.trim(),
      resolveDefaultBranch,
      runGitCommand,
      getGitBinary: () => "git",
    }),
  };
}

describe("git diff service", () => {
  it("prefers a verified remote-tracking base for range diffs", async () => {
    const raw = vi.fn(async (args: string[]) => {
      if (args[0] === "rev-parse") return "abc123\n";
      if (args[0] === "diff") return "range diff";
      return "";
    });
    const { service, resolveDefaultBranch } = createService({ raw });

    await expect(
      service.getRangeDiff("/repo", {
        base: "main",
        head: "topic",
        path: "src/app.ts",
        contextLines: 7,
      }),
    ).resolves.toBe("range diff");
    expect(raw).toHaveBeenNthCalledWith(1, [
      "rev-parse",
      "--verify",
      "refs/remotes/origin/main",
    ]);
    expect(raw).toHaveBeenNthCalledWith(2, [
      "diff",
      "--no-color",
      "-U7",
      "origin/main...topic",
      "--",
      "src/app.ts",
    ]);
    expect(resolveDefaultBranch).not.toHaveBeenCalled();
  });

  it("uses the no-index patch carried by git's expected exit-one error", async () => {
    const raw = vi.fn(async (args: string[]) => {
      if (args[0] === "diff" && !args.includes("--no-index")) return "";
      if (args[0] === "ls-files") throw new Error("untracked");
      throw { exitCode: 1, message: "untracked patch" };
    });
    const { service } = createService({ raw });

    await expect(
      service.getDiff("/repo", { path: "new-file.ts" }),
    ).resolves.toBe("untracked patch");
    expect(raw).toHaveBeenLastCalledWith([
      "diff",
      "--no-color",
      "-U3",
      "--no-index",
      "--",
      "/dev/null",
      "new-file.ts",
    ]);
  });

  it("detects binary working-tree files before requesting textual content", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "git-diff-"));
    const filePath = "asset.bin";
    await fs.writeFile(path.join(directory, filePath), Buffer.from([1, 0, 2]));
    const show = vi.fn(async () => "should not be read");
    const { service, runGitCommand } = createService({ show });

    try {
      await expect(
        service.getFileDiff(` ${directory} `, { path: filePath }),
      ).resolves.toEqual({
        original: "",
        modified: "",
        path: filePath,
        isBinary: true,
      });
      expect(show).not.toHaveBeenCalled();
      expect(runGitCommand).not.toHaveBeenCalled();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a revert target that escapes the repository root", async () => {
    const raw = vi.fn();
    const { service } = createService({ raw });

    await expect(service.revertFile("/repo", "../secret")).rejects.toThrow(
      "Invalid file path",
    );
    expect(raw).not.toHaveBeenCalled();
  });
});
