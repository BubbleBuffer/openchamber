import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SimpleGit } from "simple-git";
import type {
  GitDiffOptions,
  GitFileDiffResult,
  GitRangeDiffOptions,
} from "./types.js";

const fsp = fs.promises;
const execFileAsync = promisify(execFile);
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
  "avif",
];
const BINARY_SNIFF_BYTES = 8192;

interface GitCommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  message?: string;
}

export interface DiffServiceDependencies {
  createGit: (directory?: string) => Promise<SimpleGit>;
  normalizeDirectoryPath: (value: string) => string | undefined;
  resolveDefaultBranch: (git: SimpleGit) => Promise<string | null>;
  runGitCommand: (cwd: string, args: string[]) => Promise<GitCommandResult>;
  getGitBinary: () => string;
}

const isImageFile = (filePath: string): boolean => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext || "");
};

const getImageMimeType = (filePath: string): string => {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    ico: "image/x-icon",
    bmp: "image/bmp",
    avif: "image/avif",
  };
  return mimeMap[ext || ""] || "application/octet-stream";
};

const parseIsBinaryFromNumstat = (raw: string): boolean => {
  const text = String(raw || "").trim();
  if (!text) {
    return false;
  }

  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "";
  const [added, deleted] = firstLine.split("\t");
  return added === "-" || deleted === "-";
};

const looksBinaryBySniff = async (absolutePath: string): Promise<boolean> => {
  try {
    const handle = await fsp.open(absolutePath, "r");
    try {
      const buffer = Buffer.alloc(BINARY_SNIFF_BYTES);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        BINARY_SNIFF_BYTES,
        0,
      );
      if (bytesRead <= 0) {
        return false;
      }
      return buffer.subarray(0, bytesRead).includes(0);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
};

export function createDiffService({
  createGit,
  normalizeDirectoryPath,
  resolveDefaultBranch,
  runGitCommand,
  getGitBinary,
}: DiffServiceDependencies) {
  const resolveRangeBase = async (
    git: SimpleGit,
    base: string,
    head: string,
  ): Promise<{ base: string; head: string }> => {
    const baseRef = typeof base === "string" ? base.trim() : "";
    const headRef = typeof head === "string" ? head.trim() : "";
    if (!baseRef || !headRef) {
      throw new Error("base and head are required");
    }

    let resolvedBase = baseRef;
    const originCandidate = `refs/remotes/origin/${baseRef}`;
    try {
      const verified = await git.raw([
        "rev-parse",
        "--verify",
        originCandidate,
      ]);
      if (verified && verified.trim()) {
        resolvedBase = `origin/${baseRef}`;
      }
    } catch {
      // Fall through to the local and default-branch checks.
    }

    if (resolvedBase === baseRef) {
      const localExists = await git
        .raw(["rev-parse", "--verify", baseRef])
        .then((value: string) => String(value || "").trim())
        .catch(() => "");
      if (!localExists) {
        const fallback = await resolveDefaultBranch(git);
        if (fallback) {
          resolvedBase = fallback;
        } else {
          throw new Error(
            `Could not resolve base ref '${baseRef}' and no default branch found`,
          );
        }
      }
    }

    return { base: resolvedBase, head: headRef };
  };

  async function getDiff(
    directory: string,
    { path: filePath, staged = false, contextLines = 3 }: GitDiffOptions = {},
  ): Promise<string> {
    const git = await createGit(directory);

    try {
      const args = ["diff", "--no-color"];

      if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
        args.push(`-U${Math.max(0, contextLines)}`);
      }

      if (staged) {
        args.push("--cached");
      }

      if (filePath) {
        args.push("--", filePath);
      }

      const diff = await git.raw(args);
      if (diff && diff.trim().length > 0) {
        return diff;
      }

      if (staged) {
        return diff;
      }

      try {
        await git.raw(["ls-files", "--error-unmatch", filePath as string]);
        return diff;
      } catch {
        const noIndexArgs = ["diff", "--no-color"];
        if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
          noIndexArgs.push(`-U${Math.max(0, contextLines)}`);
        }
        noIndexArgs.push(
          "--no-index",
          "--",
          "/dev/null",
          filePath as string,
        );
        try {
          return await git.raw(noIndexArgs);
        } catch (error) {
          const noIndexError = error as {
            exitCode?: unknown;
            message?: string;
          };
          if (noIndexError.exitCode === 1 && noIndexError.message) {
            return noIndexError.message;
          }
          throw error;
        }
      }
    } catch (error) {
      console.error("Failed to get Git diff:", error);
      throw error;
    }
  }

  async function getRangeDiff(
    directory: string,
    {
      base,
      head,
      path: filePath,
      contextLines = 3,
    }: GitRangeDiffOptions,
  ): Promise<string> {
    const git = await createGit(directory);
    const range = await resolveRangeBase(git, base, head);
    const args = ["diff", "--no-color"];
    if (typeof contextLines === "number" && !Number.isNaN(contextLines)) {
      args.push(`-U${Math.max(0, contextLines)}`);
    }
    args.push(`${range.base}...${range.head}`);
    if (filePath) {
      args.push("--", filePath);
    }
    return git.raw(args);
  }

  async function getRangeFiles(
    directory: string,
    { base, head }: GitRangeDiffOptions,
  ): Promise<string[]> {
    const git = await createGit(directory);
    const range = await resolveRangeBase(git, base, head);
    const raw = await git.raw([
      "diff",
      "--name-only",
      `${range.base}...${range.head}`,
    ]);
    return String(raw || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const isBinaryDiff = async (
    directoryPath: string,
    filePath: string,
    staged: boolean,
  ): Promise<boolean> => {
    const args = ["diff", "--numstat"];
    if (staged) {
      args.push("--cached");
    }
    args.push("--", filePath);

    const result = await runGitCommand(directoryPath, args);
    if (parseIsBinaryFromNumstat(result.stdout)) {
      return true;
    }

    if (!staged) {
      const tracked = await runGitCommand(directoryPath, [
        "ls-files",
        "--error-unmatch",
        "--",
        filePath,
      ]).then((commandResult) => commandResult.success);
      if (!tracked) {
        const noIndex = await runGitCommand(directoryPath, [
          "diff",
          "--no-index",
          "--numstat",
          "--",
          "/dev/null",
          filePath,
        ]);
        if (
          parseIsBinaryFromNumstat(noIndex.stdout) ||
          parseIsBinaryFromNumstat(noIndex.stderr) ||
          parseIsBinaryFromNumstat(noIndex.message || "")
        ) {
          return true;
        }
        const text =
          `${noIndex.stdout || ""}\n${noIndex.stderr || ""}\n${noIndex.message || ""}`.toLowerCase();
        if (
          text.includes("binary files") ||
          text.includes("git binary patch")
        ) {
          return true;
        }
      }
    }

    return false;
  };

  async function getFileDiff(
    directory: string,
    {
      path: filePath,
      staged = false,
    }: { path: string; staged?: boolean; contextLines?: number },
  ): Promise<GitFileDiffResult> {
    if (!directory || !filePath) {
      throw new Error("directory and path are required for getFileDiff");
    }

    const directoryPath = normalizeDirectoryPath(directory);
    const git = await createGit(directoryPath);
    const isImage = isImageFile(filePath);
    const mimeType = isImage ? getImageMimeType(filePath) : null;

    if (!isImage) {
      const absolutePath = path.join(directoryPath as string, filePath);
      const isBinaryBySniff = await looksBinaryBySniff(absolutePath);
      const isBinary =
        isBinaryBySniff ||
        (await isBinaryDiff(directoryPath as string, filePath, staged));
      if (isBinary) {
        return {
          original: "",
          modified: "",
          path: filePath,
          isBinary: true,
        };
      }
    }

    let original = "";
    try {
      if (isImage) {
        try {
          const { stdout } = await execFileAsync(
            getGitBinary(),
            ["show", `HEAD:${filePath}`],
            {
              cwd: directoryPath,
              encoding: "buffer",
              windowsHide: true,
              maxBuffer: 50 * 1024 * 1024,
            },
          );
          if (stdout && stdout.length > 0) {
            original = `data:${mimeType};base64,${stdout.toString("base64")}`;
          }
        } catch {
          original = "";
        }
      } else {
        original = await git.show([`HEAD:${filePath}`]);
      }
    } catch {
      original = "";
    }

    const fullPath = path.join(directoryPath as string, filePath);
    let modified = "";
    try {
      const stat = await fsp.stat(fullPath);
      if (stat.isFile()) {
        if (isImage) {
          const buffer = await fsp.readFile(fullPath);
          modified = `data:${mimeType};base64,${buffer.toString("base64")}`;
        } else {
          modified = await fsp.readFile(fullPath, "utf8");
        }
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        (error as { code?: string }).code === "ENOENT"
      ) {
        modified = "";
      } else {
        console.error(
          "Failed to read modified file contents for diff:",
          error,
        );
        throw error;
      }
    }

    return {
      original,
      modified,
      path: filePath,
      isBinary: false,
    };
  }

  async function revertFile(
    directory: string,
    filePath: string,
  ): Promise<void> {
    const directoryPath = normalizeDirectoryPath(directory);
    const git = await createGit(directoryPath);
    const repoRoot = path.resolve(directoryPath as string);
    const absoluteTarget = path.resolve(repoRoot, filePath);

    if (
      !absoluteTarget.startsWith(repoRoot + path.sep) &&
      absoluteTarget !== repoRoot
    ) {
      throw new Error("Invalid file path");
    }

    const isTracked = await git
      .raw(["ls-files", "--error-unmatch", filePath])
      .then(() => true)
      .catch(() => false);

    if (!isTracked) {
      try {
        await git.raw(["clean", "-f", "-d", "--", filePath]);
        return;
      } catch {
        try {
          await fsp.rm(absoluteTarget, { recursive: true, force: true });
          return;
        } catch (error) {
          if ((error as { code?: string })?.code === "ENOENT") {
            return;
          }
          console.error(
            "Failed to remove untracked file during revert:",
            error,
          );
          throw error;
        }
      }
    }

    try {
      await git.raw(["restore", "--staged", filePath]);
    } catch {
      await git.raw(["reset", "HEAD", "--", filePath]).catch(() => {});
    }

    try {
      await git.raw(["restore", filePath]);
    } catch {
      try {
        await git.raw(["checkout", "--", filePath]);
      } catch (error) {
        console.error("Failed to revert git file:", error);
        throw error;
      }
    }
  }

  async function collectDiffs(
    directory: string,
    files: string[] = [],
  ): Promise<Array<{ path: string; diff: string }>> {
    const results: Array<{ path: string; diff: string }> = [];
    for (const filePath of files) {
      try {
        const diff = await getDiff(directory, { path: filePath });
        if (diff && diff.trim().length > 0) {
          results.push({ path: filePath, diff });
        }
      } catch (error) {
        console.error(`Failed to diff ${filePath}:`, error);
      }
    }
    return results;
  }

  return {
    collectDiffs,
    getDiff,
    getFileDiff,
    getRangeDiff,
    getRangeFiles,
    revertFile,
  };
}
