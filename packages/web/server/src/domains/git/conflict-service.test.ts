import type { SimpleGit } from "simple-git";
import { describe, expect, it, vi } from "vitest";
import { createConflictService } from "./conflict-service.js";

function createService(git: unknown) {
  const createGit = vi.fn(async () => git as SimpleGit);
  return {
    createGit,
    service: createConflictService({
      createGit,
      normalizeDirectoryPath: (directory) => directory.trim(),
    }),
  };
}

describe("git conflict service", () => {
  it("reports conflicted files when a merge cannot complete", async () => {
    const git = {
      merge: vi.fn(async () => {
        throw { message: "Automatic merge failed; fix conflicts" };
      }),
      status: vi.fn(async () => ({ conflicted: ["src/conflicted.ts"] })),
    };
    const { service } = createService(git);

    await expect(service.merge("/repo", { branch: "feature" })).resolves.toEqual({
      success: false,
      conflict: true,
      conflictFiles: ["src/conflicted.ts"],
    });
  });

  it("skips an empty rebase step without opening an editor", async () => {
    const rebase = vi
      .fn()
      .mockRejectedValueOnce(new Error("nothing to commit"))
      .mockResolvedValueOnce(undefined);
    const env = vi.fn(() => ({ rebase }));
    const { service, createGit } = createService({ env });

    await expect(service.continueRebase(" /repo ")).resolves.toEqual({
      success: true,
      conflict: false,
    });
    expect(createGit).toHaveBeenCalledWith("/repo");
    expect(env).toHaveBeenNthCalledWith(1, "GIT_EDITOR", "true");
    expect(env).toHaveBeenNthCalledWith(2, "GIT_EDITOR", "true");
    expect(rebase).toHaveBeenNthCalledWith(1, ["--continue"]);
    expect(rebase).toHaveBeenNthCalledWith(2, ["--skip"]);
  });

  it("distinguishes rebase conflict metadata from merge metadata", async () => {
    const raw = vi.fn(async (args: string[]) => {
      const command = args.join(" ");
      if (command === "status --porcelain") return "UU src/conflicted.ts\n";
      if (command === "diff --name-only --diff-filter=U") return "src/conflicted.ts\n";
      if (command === "diff") return "conflict diff\n";
      if (command.endsWith("MERGE_HEAD")) throw new Error("missing");
      if (command.endsWith("REBASE_HEAD")) return "0123456789\n";
      return "";
    });
    const { service } = createService({ raw });

    await expect(service.getConflictDetails("/repo")).resolves.toEqual({
      statusPorcelain: "UU src/conflicted.ts",
      unmergedFiles: ["src/conflicted.ts"],
      diff: "conflict diff",
      headInfo: "REBASE_HEAD: 0123456789",
      operation: "rebase",
    });
  });
});
