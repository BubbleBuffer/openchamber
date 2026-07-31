import fs from "node:fs";
import path from "node:path";
import type { SimpleGit } from "simple-git";
import type {
  GitConflictDetails,
  GitMergeOptions,
  GitRebaseOptions,
  GitSuccessResult,
} from "./types.js";

const fsp = fs.promises;

const errorText = (error: unknown): string => {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return String(message || error || "").toLowerCase();
};

const containsAny = (value: string, candidates: string[]): boolean =>
  candidates.some((candidate) => value.includes(candidate));

export interface ConflictServiceDependencies {
  createGit: (directory?: string) => Promise<SimpleGit>;
  normalizeDirectoryPath: (value: string) => string | undefined;
}

export function createConflictService({
  createGit,
  normalizeDirectoryPath,
}: ConflictServiceDependencies) {
  async function rebase(
    directory: string,
    options: GitRebaseOptions = {} as GitRebaseOptions,
  ): Promise<boolean> {
    const git = await createGit(directory);

    try {
      const { onto } = options;
      if (!onto) {
        throw new Error("onto parameter is required for rebase");
      }

      await git.rebase([onto]);

      return {
        success: true,
        conflict: false,
      } as unknown as boolean;
    } catch (error) {
      const errorMessage = errorText(error);
      const isConflict = containsAny(errorMessage, [
        "conflict",
        "could not apply",
        "merge conflict",
      ]);

      if (isConflict) {
        const status = await git.status().catch(() => ({ conflicted: [] }));
        return {
          success: false,
          conflict: true,
          conflictFiles: status.conflicted || [],
        } as unknown as boolean;
      }

      console.error("Failed to rebase:", error);
      throw error;
    }
  }

  async function abortRebase(directory: string): Promise<GitSuccessResult> {
    const git = await createGit(directory);

    try {
      await git.rebase(["--abort"]);
      return { success: true };
    } catch (error) {
      console.error("Failed to abort rebase:", error);
      throw error;
    }
  }

  async function merge(
    directory: string,
    options: GitMergeOptions = {} as GitMergeOptions,
  ): Promise<{ success: boolean; conflicts?: string[] }> {
    const git = await createGit(directory);

    try {
      const { branch } = options;
      if (!branch) {
        throw new Error("branch parameter is required for merge");
      }

      await git.merge([branch]);

      return {
        success: true,
        conflict: false,
      } as unknown as { success: boolean; conflicts?: string[] };
    } catch (error) {
      const errorMessage = errorText(error);
      const isConflict = containsAny(errorMessage, [
        "conflict",
        "merge conflict",
        "automatic merge failed",
      ]);

      if (isConflict) {
        const status = await git.status().catch(() => ({ conflicted: [] }));
        return {
          success: false,
          conflict: true,
          conflictFiles: status.conflicted || [],
        } as unknown as { success: boolean; conflicts?: string[] };
      }

      console.error("Failed to merge:", error);
      throw error;
    }
  }

  async function abortMerge(directory: string): Promise<GitSuccessResult> {
    const git = await createGit(directory);

    try {
      await git.merge(["--abort"]);
      return { success: true };
    } catch (error) {
      console.error("Failed to abort merge:", error);
      throw error;
    }
  }

  async function continueRebase(directory: string): Promise<boolean> {
    const directoryPath = normalizeDirectoryPath(directory);
    const git = await createGit(directoryPath);

    try {
      await git.env("GIT_EDITOR", "true").rebase(["--continue"]);
      return { success: true, conflict: false } as unknown as boolean;
    } catch (error) {
      const errorMessage = errorText(error);
      const isConflict = containsAny(errorMessage, [
        "conflict",
        "needs merge",
        "unmerged",
        "fix conflicts",
      ]);

      if (isConflict) {
        const status = await git.status().catch(() => ({ conflicted: [] }));
        return {
          success: false,
          conflict: true,
          conflictFiles: status.conflicted || [],
        } as unknown as boolean;
      }

      if (errorMessage.includes("nothing to commit") || errorMessage.includes("no changes")) {
        try {
          await git.env("GIT_EDITOR", "true").rebase(["--skip"]);
          return { success: true, conflict: false } as unknown as boolean;
        } catch {
          return { success: true, conflict: false } as unknown as boolean;
        }
      }

      console.error("Failed to continue rebase:", error);
      throw error;
    }
  }

  async function continueMerge(directory: string): Promise<boolean> {
    const directoryPath = normalizeDirectoryPath(directory);
    const git = await createGit(directoryPath);

    try {
      const status = await git.status();
      if (status.conflicted && status.conflicted.length > 0) {
        return {
          success: false,
          conflict: true,
          conflictFiles: status.conflicted,
        } as unknown as boolean;
      }

      await git.env("GIT_EDITOR", "true").commit([], { "--no-edit": null });
      return { success: true, conflict: false } as unknown as boolean;
    } catch (error) {
      const errorMessage = errorText(error);
      const isConflict = containsAny(errorMessage, [
        "conflict",
        "needs merge",
        "unmerged",
        "fix conflicts",
      ]);

      if (isConflict) {
        const status = await git.status().catch(() => ({ conflicted: [] }));
        return {
          success: false,
          conflict: true,
          conflictFiles: status.conflicted || [],
        } as unknown as boolean;
      }

      if (errorMessage.includes("nothing to commit") || errorMessage.includes("no changes added")) {
        return { success: true, conflict: false } as unknown as boolean;
      }

      console.error("Failed to continue merge:", error);
      throw error;
    }
  }

  async function getConflictDetails(directory: string): Promise<GitConflictDetails> {
    const directoryPath = normalizeDirectoryPath(directory);
    const git = await createGit(directoryPath);

    try {
      const statusPorcelain = await git.raw(["status", "--porcelain"]).catch(() => "");
      const unmergedFilesRaw = await git
        .raw(["diff", "--name-only", "--diff-filter=U"])
        .catch(() => "");
      const unmergedFiles = unmergedFilesRaw
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);
      const diff = await git.raw(["diff"]).catch(() => "");

      let operation = "merge";
      let headInfo = "";
      const mergeHeadExists = await git
        .raw(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])
        .then(() => true)
        .catch(() => false);

      if (mergeHeadExists) {
        const mergeHead = await git.raw(["rev-parse", "MERGE_HEAD"]).catch(() => "");
        const mergeMsg = await fsp
          .readFile(path.join(directoryPath as string, ".git", "MERGE_MSG"), "utf8")
          .catch(() => "");
        headInfo = `MERGE_HEAD: ${mergeHead.trim()}\n${mergeMsg}`;
      } else {
        const rebaseHeadExists = await git
          .raw(["rev-parse", "--verify", "--quiet", "REBASE_HEAD"])
          .then(() => true)
          .catch(() => false);

        if (rebaseHeadExists) {
          operation = "rebase";
          const rebaseHead = await git.raw(["rev-parse", "REBASE_HEAD"]).catch(() => "");
          headInfo = `REBASE_HEAD: ${rebaseHead.trim()}`;
        }
      }

      return {
        statusPorcelain: statusPorcelain.trim(),
        unmergedFiles,
        diff: diff.trim(),
        headInfo: headInfo.trim(),
        operation,
      };
    } catch (error) {
      console.error("Failed to get conflict details:", error);
      throw error;
    }
  }

  return {
    rebase,
    abortRebase,
    merge,
    abortMerge,
    continueRebase,
    continueMerge,
    getConflictDetails,
  };
}
