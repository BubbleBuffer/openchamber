import type { SimpleGit } from "simple-git";
import type {
  GitBranchMutationResponse,
} from "../../contracts/git.js";
import type {
  GitBranchResult,
  GitCreateBranchOptions,
  GitDeleteBranchOptions,
  GitRemoteEntry,
  GitRemoveRemoteOptions,
  GitSuccessResult,
} from "./types.js";

type UpstreamTarget = {
  remote: string;
  branch: string;
  full: string;
};

interface BranchRemoteServiceDeps {
  createGit: (directory: string) => Promise<SimpleGit>;
  cleanBranchName: (branch: string) => string;
  normalizeUpstreamTarget: (remote: string, branch: string) => UpstreamTarget | null;
  runGitCommandOrThrow: (
    directory: string,
    args: string[],
    errorMessage: string,
  ) => Promise<unknown>;
  setBranchTrackingFallback: (
    directory: string,
    branch: string,
    upstream: UpstreamTarget,
  ) => Promise<void>;
  logger?: Pick<Console, "error" | "warn">;
}

const filterActiveRemoteBranches = async (
  git: SimpleGit,
  remoteBranches: string[],
  logger: Pick<Console, "warn">,
): Promise<string[]> => {
  try {
    const lsRemoteResult = await git.raw(["ls-remote", "--heads", "origin"]);
    const actualRemoteBranches = new Set<string>();

    for (const line of lsRemoteResult.trim().split("\n")) {
      if (line.includes("\trefs/heads/")) {
        actualRemoteBranches.add(line.split("\t")[1].replace("refs/heads/", ""));
      }
    }

    return remoteBranches.filter((remoteBranch) => {
      const match = remoteBranch.match(/^remotes\/[^/]+\/(.+)$/);
      return Boolean(match && actualRemoteBranches.has(match[1]));
    });
  } catch (error) {
    logger.warn(
      "Failed to filter active remote branches, returning all:",
      error instanceof Error ? error.message : String(error),
    );
    return remoteBranches;
  }
};

export function createBranchRemoteService(deps: BranchRemoteServiceDeps) {
  const {
    createGit,
    cleanBranchName,
    normalizeUpstreamTarget,
    runGitCommandOrThrow,
    setBranchTrackingFallback,
    logger = console,
  } = deps;

  const deleteRemoteBranch = async (
    directory: string,
    options: { branch: string; remote?: string } = { branch: "" },
  ): Promise<GitSuccessResult> => {
    const { branch, remote } = options;
    if (!branch) {
      throw new Error("branch is required to delete remote branch");
    }

    const git = await createGit(directory);
    const targetBranch = branch.startsWith("refs/heads/")
      ? branch.substring("refs/heads/".length)
      : branch;
    const remoteName = remote || "origin";

    try {
      await git.push(remoteName, `:${targetBranch}`);
      return { success: true };
    } catch (error) {
      logger.error("Failed to delete remote branch:", error);
      throw error;
    }
  };

  const getBranches = async (directory: string): Promise<GitBranchResult> => {
    const git = await createGit(directory);
    try {
      const result = await git.branch();
      const remoteBranches = result.all.filter((branch) => branch.startsWith("remotes/"));
      const activeRemoteBranches = await filterActiveRemoteBranches(git, remoteBranches, logger);
      return {
        all: [
          ...result.all.filter((branch) => !branch.startsWith("remotes/")),
          ...activeRemoteBranches,
        ],
        current: result.current,
        branches: result.branches,
      };
    } catch (error) {
      logger.error("Failed to get branches:", error);
      throw error;
    }
  };

  const createBranch = async (
    directory: string,
    branchName: string,
    options: GitCreateBranchOptions = {},
  ): Promise<GitBranchMutationResponse> => {
    const git = await createGit(directory);
    try {
      await git.checkoutBranch(branchName, options.startPoint || "HEAD");
      return { success: true, branch: branchName };
    } catch (error) {
      logger.error("Failed to create branch:", error);
      throw error;
    }
  };

  const checkoutBranch = async (
    directory: string,
    branchName: string,
  ): Promise<GitBranchMutationResponse> => {
    const git = await createGit(directory);
    try {
      await git.checkout(branchName);
      return { success: true, branch: branchName };
    } catch (error) {
      logger.error("Failed to checkout branch:", error);
      throw error;
    }
  };

  const deleteBranch = async (
    directory: string,
    branch: string,
    options: GitDeleteBranchOptions = {},
  ): Promise<GitSuccessResult> => {
    const git = await createGit(directory);
    try {
      const branchName = branch.startsWith("refs/heads/")
        ? branch.substring("refs/heads/".length)
        : branch;
      await git.raw(["branch", options.force ? "-D" : "-d", branchName]);
      return { success: true };
    } catch (error) {
      logger.error("Failed to delete branch:", error);
      throw error;
    }
  };

  const renameBranch = async (
    directory: string,
    oldName: string,
    newName: string,
  ): Promise<GitBranchMutationResponse> => {
    const git = await createGit(directory);
    try {
      const normalizedOldName = cleanBranchName(String(oldName || "").trim());
      const normalizedNewName = cleanBranchName(String(newName || "").trim());
      const previousRemote = await git
        .raw(["config", "--get", `branch.${normalizedOldName}.remote`])
        .then((value) => String(value || "").trim())
        .catch(() => "");
      const previousMerge = await git
        .raw(["config", "--get", `branch.${normalizedOldName}.merge`])
        .then((value) => String(value || "").trim())
        .catch(() => "");

      await git.raw(["branch", "-m", oldName, newName]);

      if (previousRemote && previousMerge && normalizedNewName) {
        const previousMergeBranch = cleanBranchName(previousMerge);
        const nextMergeBranch =
          previousMergeBranch === normalizedOldName
            ? normalizedNewName
            : previousMergeBranch;
        const upstream = normalizeUpstreamTarget(previousRemote, nextMergeBranch);

        if (upstream) {
          try {
            await runGitCommandOrThrow(
              directory,
              ["branch", `--set-upstream-to=${upstream.full}`, normalizedNewName],
              `Failed to set upstream to ${upstream.full}`,
            );
          } catch {
            await setBranchTrackingFallback(directory, normalizedNewName, upstream);
          }
        }
      }

      return { success: true, branch: newName };
    } catch (error) {
      logger.error("Failed to rename branch:", error);
      throw error;
    }
  };

  const getRemotes = async (directory: string): Promise<GitRemoteEntry[]> => {
    const git = await createGit(directory);
    try {
      const remotes = await git.getRemotes(true);
      return remotes.map((remote) => ({
        name: remote.name,
        fetchUrl: remote.refs.fetch,
        pushUrl: remote.refs.push,
      }));
    } catch (error) {
      logger.error("Failed to get remotes:", error);
      throw error;
    }
  };

  const removeRemote = async (
    directory: string,
    options: GitRemoveRemoteOptions = { remote: "" },
  ): Promise<GitSuccessResult> => {
    const remoteName = String(options.remote || "").trim();
    if (!remoteName) {
      throw new Error("remote is required to remove a remote");
    }
    if (remoteName === "origin") {
      throw new Error("Cannot remove origin remote");
    }

    const git = await createGit(directory);
    try {
      await git.removeRemote(remoteName);
      return { success: true };
    } catch (error) {
      logger.error("Failed to remove remote:", error);
      throw error;
    }
  };

  return {
    deleteRemoteBranch,
    getBranches,
    createBranch,
    checkoutBranch,
    deleteBranch,
    renameBranch,
    getRemotes,
    removeRemote,
  };
}
