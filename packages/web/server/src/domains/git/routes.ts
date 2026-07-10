import type { Express, Request, Response } from "express";

export function registerGitRoutes(app: Express): void {
  let gitLibraries: typeof import("./index.js") | null = null;

  const getGitLibraries = async (): Promise<typeof import("./index.js")> => {
    if (!gitLibraries) {
      gitLibraries = await import("./index.js");
    }
    return gitLibraries;
  };

  const extractGitErrorText = (error: unknown): string => {
    const message = typeof error === "object" && error !== null && "message" in error && typeof (error as { message: unknown }).message === "string" ? (error as { message: string }).message : "";
    const stderr = typeof error === "object" && error !== null && "stderr" in error && typeof (error as { stderr: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
    const stdout = typeof error === "object" && error !== null && "stdout" in error && typeof (error as { stdout: unknown }).stdout === "string" ? (error as { stdout: string }).stdout : "";
    return [message, stderr, stdout]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join("\n");
  };

  app.get("/api/git/identities", async (_req: Request, res: Response) => {
    const { getProfiles } = await getGitLibraries();
    try {
      const profiles = getProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Failed to list git identity profiles:", error);
      res.status(500).json({ error: "Failed to list git identity profiles" });
    }
  });

  app.post("/api/git/identities", async (req: Request, res: Response) => {
    const { createProfile } = await getGitLibraries();
    try {
      const profile = createProfile(req.body);
      console.log(`Created git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error("Failed to create git identity profile:", error);
      const err = error as { message?: string };
      res.status(400).json({ error: err.message || "Failed to create git identity profile" });
    }
  });

  app.put("/api/git/identities/:id", async (req: Request, res: Response) => {
    const { updateProfile } = await getGitLibraries();
    try {
      const profile = updateProfile(req.params.id as string, req.body);
      console.log(`Updated git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error("Failed to update git identity profile:", error);
      const err = error as { message?: string };
      res.status(400).json({ error: err.message || "Failed to update git identity profile" });
    }
  });

  app.delete("/api/git/identities/:id", async (req: Request, res: Response) => {
    const { deleteProfile } = await getGitLibraries();
    try {
      deleteProfile(req.params.id as string);
      console.log(`Deleted git identity profile: ${req.params.id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete git identity profile:", error);
      const err = error as { message?: string };
      res.status(400).json({ error: err.message || "Failed to delete git identity profile" });
    }
  });

  app.get("/api/git/global-identity", async (_req: Request, res: Response) => {
    const { getGlobalIdentity } = await getGitLibraries();
    try {
      const identity = await getGlobalIdentity();
      res.json(identity);
    } catch (error) {
      console.error("Failed to get global git identity:", error);
      res.status(500).json({ error: "Failed to get global git identity" });
    }
  });

  app.get("/api/git/discover-credentials", async (_req: Request, res: Response) => {
    try {
      const { discoverGitCredentials } = await getGitLibraries();
      const credentials = discoverGitCredentials();
      res.json(credentials);
    } catch (error) {
      console.error("Failed to discover git credentials:", error);
      res.status(500).json({ error: "Failed to discover git credentials" });
    }
  });

  app.get("/api/git/check", async (req: Request, res: Response) => {
    const { isGitRepository } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const isRepo = await isGitRepository(directory);
      res.json({ isGitRepository: isRepo });
    } catch (error) {
      console.error("Failed to check git repository:", error);
      res.status(500).json({ error: "Failed to check git repository" });
    }
  });

  app.post("/api/git/check-batch", async (req: Request, res: Response) => {
    const { isGitRepository } = await getGitLibraries();
    try {
      const { directories } = req.body || {};
      if (!Array.isArray(directories) || directories.length === 0) {
        return res.status(400).json({ error: "directories array is required" });
      }
      if (directories.length > 50) {
        return res.status(400).json({ error: "maximum 50 directories per batch request" });
      }

      const results: Record<string, boolean> = {};
      await Promise.all(
        directories.map(async (dir: string) => {
          try {
            results[dir] = await isGitRepository(dir);
          } catch {
            results[dir] = false;
          }
        })
      );
      res.json({ results });
    } catch (error) {
      console.error("Failed to batch-check git repositories:", error);
      res.status(500).json({ error: "Failed to batch-check git repositories" });
    }
  });

  app.get("/api/git/remote-url", async (req: Request, res: Response) => {
    const { getRemoteUrl } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }
      const remote = (req.query.remote as string | undefined) || "origin";

      const url = await getRemoteUrl(directory, remote);
      res.json({ url });
    } catch (error) {
      console.error("Failed to get remote url:", error);
      res.status(500).json({ error: "Failed to get remote url" });
    }
  });

  app.get("/api/git/current-identity", async (req: Request, res: Response) => {
    const { getCurrentIdentity } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const identity = await getCurrentIdentity(directory);
      res.json(identity);
    } catch (error) {
      console.error("Failed to get current git identity:", error);
      res.status(500).json({ error: "Failed to get current git identity" });
    }
  });

  app.get("/api/git/has-local-identity", async (req: Request, res: Response) => {
    const { hasLocalIdentity } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const hasLocal = await hasLocalIdentity(directory);
      res.json({ hasLocalIdentity: hasLocal });
    } catch (error) {
      console.error("Failed to check local git identity:", error);
      res.status(500).json({ error: "Failed to check local git identity" });
    }
  });

  app.post("/api/git/set-identity", async (req: Request, res: Response) => {
    const { getProfile, setLocalIdentity, getGlobalIdentity } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: "profileId is required" });
      }

      let profile: { id: string; name: string; userName?: string; userEmail?: string; sshKey?: string | null } | null = null;

      if (profileId === "global") {
        const globalIdentity = await getGlobalIdentity();
        if (!globalIdentity?.userName || !globalIdentity?.userEmail) {
          return res.status(404).json({ error: "Global identity is not configured" });
        }
        profile = {
          id: "global",
          name: "Global Identity",
          userName: globalIdentity.userName ?? undefined,
          userEmail: globalIdentity.userEmail ?? undefined,
          sshKey: globalIdentity.sshCommand
            ? globalIdentity.sshCommand.replace("ssh -i ", "")
            : null,
        };
      } else {
        profile = getProfile(profileId);
        if (!profile) {
          return res.status(404).json({ error: "Profile not found" });
        }
      }

      await setLocalIdentity(directory, profile);
      res.json({ success: true, profile });
    } catch (error) {
      console.error("Failed to set git identity:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to set git identity" });
    }
  });

  app.get("/api/git/status", async (req: Request, res: Response) => {
    const { getStatus, isGitRepository } = await getGitLibraries();

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const isRepo = await isGitRepository(directory);
      if (!isRepo) {
        return res.json({ isGitRepository: false, files: [], branch: null, ahead: 0, behind: 0 });
      }

      const mode = req.query.mode === "light" ? "light" : undefined;
      const status = await getStatus(directory, { mode });
      res.json(status);
    } catch (error) {
      const errorText = extractGitErrorText(error);
      if (/not a git repository/i.test(errorText)) {
        return res.json({ isGitRepository: false, files: [], branch: null, ahead: 0, behind: 0 });
      }
      console.error("Failed to get git status:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get git status" });
    }
  });

  app.get("/api/git/diff", async (req: Request, res: Response) => {
    const { getDiff } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const path = req.query.path;
      if (!path || typeof path !== "string") {
        return res.status(400).json({ error: "path parameter is required" });
      }

      const staged = req.query.staged === "true";
      const context = req.query.context ? parseInt(String(req.query.context), 10) : undefined;

      const diff = await getDiff(directory, {
        path,
        staged,
        contextLines: Number.isFinite(context) ? context : 3,
      });

      res.json({ diff });
    } catch (error) {
      console.error("Failed to get git diff:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get git diff" });
    }
  });

  app.get("/api/git/file-diff", async (req: Request, res: Response) => {
    const { getFileDiff } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const pathParam = req.query.path;
      if (!pathParam || typeof pathParam !== "string") {
        return res.status(400).json({ error: "path parameter is required" });
      }

      const staged = req.query.staged === "true";

      const result = await getFileDiff(directory, {
        path: pathParam,
        staged,
      });

      res.json({
        original: result.original,
        modified: result.modified,
        path: result.path,
        isBinary: Boolean(result.isBinary),
      });
    } catch (error) {
      console.error("Failed to get git file diff:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get git file diff" });
    }
  });

  app.post("/api/git/revert", async (req: Request, res: Response) => {
    const { revertFile } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { path } = req.body || {};
      if (!path || typeof path !== "string") {
        return res.status(400).json({ error: "path parameter is required" });
      }

      await revertFile(directory, path);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to revert git file:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to revert git file" });
    }
  });

  app.post("/api/git/pull", async (req: Request, res: Response) => {
    const { pull } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await pull(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to pull:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to pull from remote" });
    }
  });

  app.post("/api/git/push", async (req: Request, res: Response) => {
    const { push } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await push(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to push:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to push to remote" });
    }
  });

  app.post("/api/git/fetch", async (req: Request, res: Response) => {
    const { fetch: gitFetch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await gitFetch(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to fetch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to fetch from remote" });
    }
  });

  app.get("/api/git/remotes", async (req: Request, res: Response) => {
    const { getRemotes } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const remotes = await getRemotes(directory);
      res.json(remotes);
    } catch (error) {
      console.error("Failed to get remotes:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get remotes" });
    }
  });

  app.delete("/api/git/remotes", async (req: Request, res: Response) => {
    const { removeRemote } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const remote = String(req.body?.remote || "").trim();
      if (!remote) {
        return res.status(400).json({ error: "remote is required" });
      }

      const result = await removeRemote(directory, { remote });
      res.json(result);
    } catch (error) {
      console.error("Failed to remove remote:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to remove remote" });
    }
  });

  app.post("/api/git/rebase", async (req: Request, res: Response) => {
    const { rebase } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await rebase(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to rebase:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to rebase" });
    }
  });

  app.post("/api/git/rebase/abort", async (req: Request, res: Response) => {
    const { abortRebase } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await abortRebase(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to abort rebase:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to abort rebase" });
    }
  });

  app.post("/api/git/merge", async (req: Request, res: Response) => {
    const { merge } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await merge(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to merge:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to merge" });
    }
  });

  app.post("/api/git/merge/abort", async (req: Request, res: Response) => {
    const { abortMerge } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await abortMerge(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to abort merge:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to abort merge" });
    }
  });

  app.post("/api/git/rebase/continue", async (req: Request, res: Response) => {
    const { continueRebase } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await continueRebase(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to continue rebase:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to continue rebase" });
    }
  });

  app.post("/api/git/merge/continue", async (req: Request, res: Response) => {
    const { continueMerge } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await continueMerge(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to continue merge:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to continue merge" });
    }
  });

  app.get("/api/git/conflict-details", async (req: Request, res: Response) => {
    const { getConflictDetails } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await getConflictDetails(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to get conflict details:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get conflict details" });
    }
  });

  app.post("/api/git/stash", async (req: Request, res: Response) => {
    const { stash } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await stash(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error("Failed to stash:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to stash" });
    }
  });

  app.post("/api/git/stash/pop", async (req: Request, res: Response) => {
    const { stashPop } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await stashPop(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to pop stash:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to pop stash" });
    }
  });

  app.post("/api/git/commit", async (req: Request, res: Response) => {
    const { commit } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { message, addAll, files } = req.body;
      if (!message) {
        return res.status(400).json({ error: "message is required" });
      }

      const result = await commit(directory, message, {
        addAll,
        files,
      });
      res.json(result);
    } catch (error) {
      console.error("Failed to commit:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to create commit" });
    }
  });

  app.get("/api/git/branches", async (req: Request, res: Response) => {
    const { getBranches, isGitRepository } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const isRepo = await isGitRepository(directory);
      if (!isRepo) {
        return res.json({ all: [], current: null, branches: {} });
      }

      const branches = await getBranches(directory);
      res.json(branches);
    } catch (error) {
      const errorText = extractGitErrorText(error);
      if (/not a git repository/i.test(errorText)) {
        return res.json({ all: [], current: null, branches: {} });
      }
      console.error("Failed to get branches:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get branches" });
    }
  });

  app.post("/api/git/branches", async (req: Request, res: Response) => {
    const { createBranch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { name, startPoint } = req.body;
      if (!name) {
        return res.status(400).json({ error: "name is required" });
      }

      const result = await createBranch(directory, name, { startPoint });
      res.json(result);
    } catch (error) {
      console.error("Failed to create branch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to create branch" });
    }
  });

  app.delete("/api/git/branches", async (req: Request, res: Response) => {
    const { deleteBranch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { branch, force } = req.body;
      if (!branch) {
        return res.status(400).json({ error: "branch is required" });
      }

      const result = await deleteBranch(directory, branch, { force });
      res.json(result);
    } catch (error) {
      console.error("Failed to delete branch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to delete branch" });
    }
  });

  app.put("/api/git/branches/rename", async (req: Request, res: Response) => {
    const { renameBranch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { oldName, newName } = req.body;
      if (!oldName) {
        return res.status(400).json({ error: "oldName is required" });
      }
      if (!newName) {
        return res.status(400).json({ error: "newName is required" });
      }

      const result = await renameBranch(directory, oldName, newName);
      res.json(result);
    } catch (error) {
      console.error("Failed to rename branch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to rename branch" });
    }
  });

  app.delete("/api/git/remote-branches", async (req: Request, res: Response) => {
    const { deleteRemoteBranch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { branch, remote } = req.body;
      if (!branch) {
        return res.status(400).json({ error: "branch is required" });
      }

      const result = await deleteRemoteBranch(directory, { branch, remote });
      res.json(result);
    } catch (error) {
      console.error("Failed to delete remote branch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to delete remote branch" });
    }
  });

  app.post("/api/git/checkout", async (req: Request, res: Response) => {
    const { checkoutBranch } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { branch } = req.body;
      if (!branch) {
        return res.status(400).json({ error: "branch is required" });
      }

      const result = await checkoutBranch(directory, branch);
      res.json(result);
    } catch (error) {
      console.error("Failed to checkout branch:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to checkout branch" });
    }
  });

  app.get("/api/git/worktrees", async (req: Request, res: Response) => {
    const { getWorktrees } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const worktrees = await getWorktrees(directory);
      res.json(worktrees);
    } catch (error) {
      // Worktrees are an optional feature. Avoid repeated 500s (and repeated client retries)
      // when the directory isn't a git repo or uses shell shorthand like "~/".
      console.warn("Failed to get worktrees, returning empty list:", (error as { message?: string })?.message || error);
      res.setHeader("X-OpenChamber-Warning", "git worktrees unavailable");
      res.json([]);
    }
  });

  app.post("/api/git/worktrees/validate", async (req: Request, res: Response) => {
    const { validateWorktreeCreate } = await getGitLibraries();
    if (typeof validateWorktreeCreate !== "function") {
      return res.status(501).json({ error: "Worktree validation is not available" });
    }

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const result = await validateWorktreeCreate(directory, req.body || {});
      res.json(result);
    } catch (error) {
      console.error("Failed to validate worktree creation:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to validate worktree creation" });
    }
  });

  app.post("/api/git/worktrees", async (req: Request, res: Response) => {
    const { createWorktree } = await getGitLibraries();
    if (typeof createWorktree !== "function") {
      return res.status(501).json({ error: "Worktree creation is not available" });
    }

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const created = await createWorktree(directory, req.body || {});
      res.json(created);
    } catch (error) {
      console.error("Failed to create worktree:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to create worktree" });
    }
  });

  app.post("/api/git/worktrees/preview", async (req: Request, res: Response) => {
    const { previewWorktreeCreate } = await getGitLibraries();
    if (typeof previewWorktreeCreate !== "function") {
      return res.status(501).json({ error: "Worktree preview is not available" });
    }

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const preview = await previewWorktreeCreate(directory, req.body || {});
      res.json(preview);
    } catch (error) {
      console.error("Failed to preview worktree:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to preview worktree" });
    }
  });

  app.get("/api/git/worktrees/bootstrap-status", async (req: Request, res: Response) => {
    const { getWorktreeBootstrapStatus } = await getGitLibraries();
    if (typeof getWorktreeBootstrapStatus !== "function") {
      return res.status(501).json({ error: "Worktree bootstrap status is not available" });
    }

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const status = await getWorktreeBootstrapStatus(directory);
      res.json(status);
    } catch (error) {
      console.error("Failed to get worktree bootstrap status:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get worktree bootstrap status" });
    }
  });

  app.delete("/api/git/worktrees", async (req: Request, res: Response) => {
    const { removeWorktree } = await getGitLibraries();
    if (typeof removeWorktree !== "function") {
      return res.status(501).json({ error: "Worktree removal is not available" });
    }

    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const worktreeDirectory = typeof req.body?.directory === "string" ? req.body.directory : "";
      if (!worktreeDirectory) {
        return res.status(400).json({ error: "worktree directory is required" });
      }

      const result = await removeWorktree(directory, {
        directory: worktreeDirectory,
        deleteLocalBranch: req.body?.deleteLocalBranch === true,
      });
      res.json({ success: Boolean(result) });
    } catch (error) {
      console.error("Failed to remove worktree:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to remove worktree" });
    }
  });

  app.get("/api/git/worktree-type", async (req: Request, res: Response) => {
    const { isLinkedWorktree } = await getGitLibraries();
    try {
      const { directory } = req.query;
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory parameter is required" });
      }
      const linked = await isLinkedWorktree(directory);
      res.json({ linked });
    } catch (error) {
      console.error("Failed to determine worktree type:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to determine worktree type" });
    }
  });

  app.post("/api/git/validate-directory", async (req: Request, res: Response) => {
    const { validateWorktreeDirectory } = await getGitLibraries();
    if (typeof validateWorktreeDirectory !== "function") {
      return res.status(501).json({ error: "validateWorktreeDirectory is not available" });
    }
    try {
      const { directory, worktreeRoot } = req.body || {};
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory is required" });
      }
      if (!worktreeRoot || typeof worktreeRoot !== "string") {
        return res.status(400).json({ error: "worktreeRoot is required" });
      }
      const result = await validateWorktreeDirectory(directory, worktreeRoot);
      res.json(result);
    } catch (error) {
      console.error("Failed to validate worktree directory:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to validate worktree directory" });
    }
  });

  app.post("/api/git/canonicalize-worktree-state", async (req: Request, res: Response) => {
    const { canonicalizeWorktreeState } = await getGitLibraries();
    if (typeof canonicalizeWorktreeState !== "function") {
      return res.status(501).json({ error: "canonicalizeWorktreeState is not available" });
    }
    try {
      const { directory } = req.body || {};
      if (!directory || typeof directory !== "string") {
        return res.status(400).json({ error: "directory is required" });
      }
      const result = await canonicalizeWorktreeState(directory);
      res.json(result);
    } catch (error) {
      console.error("Failed to canonicalize worktree state:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to canonicalize worktree state" });
    }
  });

  app.get("/api/git/log", async (req: Request, res: Response) => {
    const { getLog } = await getGitLibraries();
    try {
      const directory = typeof req.query.directory === 'string' ? req.query.directory : '';
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }

      const { maxCount, from, to, file } = req.query;
      const log = await getLog(directory, {
        maxCount: typeof maxCount === 'string' ? parseInt(maxCount) : undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        file: file as string | undefined,
      });
      res.json(log);
    } catch (error) {
      console.error("Failed to get log:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get commit log" });
    }
  });

  app.get("/api/git/commit-files", async (req: Request, res: Response) => {
    const { getCommitFiles } = await getGitLibraries();
    try {
      const { directory, hash } = req.query;
      if (!directory) {
        return res.status(400).json({ error: "directory parameter is required" });
      }
      if (!hash) {
        return res.status(400).json({ error: "hash parameter is required" });
      }

      const result = await getCommitFiles(directory as string, hash as string);
      res.json(result);
    } catch (error) {
      console.error("Failed to get commit files:", error);
      const err = error as { message?: string };
      res.status(500).json({ error: err.message || "Failed to get commit files" });
    }
  });
}